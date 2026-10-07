'use strict';
/* ============================================================
   gmsdk.js — GameMonetize: реклама и пауза.

   Замена ysdk.js / cgsdk.js в сборке для GameMonetize. Наружу
   торчат те же имена (adFullscreen, adRewarded, sdkGameplay,
   audioGate, cloudSave…), поэтому остальной код игры общий для
   всех трёх сборок.

   Что даёт площадка:
   • sdk.showBanner() — единственный способ показать рекламу;
   • события SDK_READY, SDK_GAME_PAUSE, SDK_GAME_START, SDK_ERROR
     приходят в window.SDK_OPTIONS.onEvent (подписка в index.html,
     она обязана существовать до загрузки sdk.js).

   Чего у площадки нет: отдельной рекламы за награду, облачных
   сохранений, таблиц рекордов и внутриигровых покупок. Поэтому:
   • кнопки «за ролик» показывают обычный ролик и выдают награду
     после его завершения — правила этим не нарушаются;
   • прогресс живёт в localStorage игрока;
   • донат выключен (PAYMENTS_ON = false).

   Вне площадки (локальный файл) SDK нет: «ролик» крутится 1.2
   секунды и награда выдаётся, игра не должна ломаться.
   ============================================================ */

/* Идентификатор игры задаётся ОДИН раз — в index.html, в
   window.SDK_OPTIONS.gameId. Здесь только проверяем, что его
   действительно подставили. */
const GM_ID_PLACEHOLDER = 'PASTE_YOUR_GAME_ID_HERE';
const gmGameId = () => {
  try { return (window.SDK_OPTIONS && window.SDK_OPTIONS.gameId) || ''; } catch (e) { return ''; }
};

const GM = {
  sdk: null, ok: false,
  lastAd: -1e9,                    /* последняя реклама, с          */
  lastAny: -1e9,
  gap: 180,                        /* интервал между межстраничными */
  quiet: 30,                       /* тишина в начале сессии и после ролика */
  startT: 0,
  busy: false,                     /* пока идёт ролик, игра стоит   */
  paused: false,                   /* пауза по сигналу площадки     */
  away: false                      /* окно потеряло фокус           */
};
/* остальной код игры написан под имя YA — держим его же */
const YA = GM;

const nowS = () => performance.now() / 1000;

/* Единственное место, где трогается общая громкость: звук молчит,
   пока идёт реклама, пока площадка держит паузу и пока окно не в фокусе.
   Площадка прямо требует глушить звук на время ролика. */
function audioGate() {
  if (typeof master === 'undefined' || !master) return;
  master.gain.value = (GM.busy || GM.paused || GM.away || muted) ? 0 : SETTINGS.volume;
}

/* демо-ролик для игры вне площадки */
let adMockT = 0, adMockCb = null, adNoteT = 0, adNote = '';

/* ---------- постоянные вещи ---------- */
/* Внутриигровых покупок у площадки нет: донат выключен, строки в
   арсенале скрыты, главные призы выдаются кредитами. */
const PAYMENTS_ON = false;

const PRODUCTS = {
  hull_admiral: { perk: 'hull', name: 'itHull', desc: 'itHullD', fallback: '—' },
  harpoon_gold: { perk: 'harp', name: 'itHarp', desc: 'itHarpD', fallback: '—' }
};

function hasPerk(k) { return PAYMENTS_ON && !!(SETTINGS.perks && SETTINGS.perks[k]); }
const perksLeft = () => (PAYMENTS_ON ? Object.values(PRODUCTS).filter(p => !hasPerk(p.perk)) : []);
function grantPerk(k, quiet) {
  if (!PAYMENTS_ON) return false;
  if (!SETTINGS.perks) SETTINGS.perks = {};
  if (SETTINGS.perks[k]) return false;
  SETTINGS.perks[k] = true;
  saveSettings();
  if (player) player.maxhp = maxhpVal();
  if (!quiet) {
    const p = Object.values(PRODUCTS).find(x => x.perk === k);
    msg(T('buyOk', p ? T(p.name) : k), '#ffd94a', 4);
    SFX.evac();
  }
  return true;
}
function productPrice(id) { return PRODUCTS[id] ? PRODUCTS[id].fallback : ''; }
function buyProduct() { adToast(T('buyFail')); }      /* покупок на площадке нет */

/* ---------- инициализация ---------- */
/* Сам загрузчик SDK стоит в index.html — так требует площадка.
   Здесь только ждём, когда объект sdk появится в окне. */
function sdkInit() {
  GM.startT = nowS();
  const id = gmGameId();
  if (!id || id === GM_ID_PLACEHOLDER)
    console.warn('[Архипелаг] В index.html не подставлен gameId GameMonetize — рекламы не будет.');
  gmPoll(0);
}
const ysdkInit = sdkInit;

function gmPoll(tries) {
  if (typeof window === 'undefined') return;
  if (window.sdk && typeof window.sdk.showBanner === 'function') {
    GM.sdk = window.sdk;
    GM.ok = true;
    return;
  }
  /* Скрипт площадки может подниматься долго, поэтому ждём до
     тридцати секунд; не дождались — играем без рекламы. */
  if (tries > 120) {
    console.warn('[Архипелаг] SDK GameMonetize не поднялся: реклама недоступна, игра работает.');
    return;
  }
  setTimeout(() => gmPoll(tries + 1), 250);
}

/* ------------------------------------------------------------
   События площадки. onEvent из index.html зовёт эту функцию.
   SDK_GAME_PAUSE приходит перед роликом, SDK_GAME_START — когда
   ролик закончился (или не открылся вовсе).
   ------------------------------------------------------------ */
let adDone = null;                        /* чем закончить текущий показ */

window.gmEvent = function (name) {
  gmWatch = 0;                            /* площадка отозвалась */
  switch (name) {
    case 'SDK_READY':
      if (window.sdk && !GM.ok) { GM.sdk = window.sdk; GM.ok = true; }
      break;
    case 'SDK_GAME_PAUSE':
      adGuardClear();                     /* ролик реально пошёл */
      sdkPause(true);
      break;
    case 'SDK_GAME_START':
      sdkPause(false);
      gmFinish(true);                     /* ролик доигран — выдаём награду */
      break;
    case 'SDK_ERROR':
    case 'SDK_BLOCKED':
      sdkPause(false);
      gmFinish(false);
      break;
  }
};

/* ------------------------------------------------------------
   Пульт проверки площадки («Проверьте SDK в игре») жмёт кнопки
   pauseGame, resumeGame и showBanner(). В разных версиях SDK они
   доходят до игры по-разному: событием onEvent, вызовом функции у
   окна игры или сообщением от родительской страницы. Принимаем все
   три пути — они делают ровно одно: пауза, звук и показ ролика.
   ------------------------------------------------------------ */
window.pauseGame = function () { sdkPause(true); };
window.resumeGame = function () { sdkPause(false); };
/* showBanner может быть уже определён самим SDK — тогда не трогаем его,
   иначе кнопка пульта попадёт в нашу обёртку вместо площадки */
if (typeof window.showBanner !== 'function') {
  window.showBanner = function () {
    const s = GM.sdk || window.sdk;
    if (!s || !s.showBanner) { console.warn('[Архипелаг] SDK ещё не готов'); adToast(T('adFailed')); return; }
    /* Показ затеяла площадка, а не игра: если она промолчит, тестировщик
       должен это увидеть — иначе кажется, что кнопка «не работает». */
    gmWatch = 8;
    try { s.showBanner(); } catch (e) { console.warn('[Архипелаг] showBanner упал:', e); }
  };
}

/* тикает из updAds: сколько ждём ответа площадки на её же кнопку */
let gmWatch = 0;

addEventListener('message', function (e) {
  const d = e && e.data;
  const n = (typeof d === 'string') ? d : (d && (d.name || d.type)) || '';
  if (n === 'pauseGame' || n === 'SDK_GAME_PAUSE') sdkPause(true);
  else if (n === 'resumeGame' || n === 'SDK_GAME_START') sdkPause(false);
});

function gmFinish(shown) {
  const cb = adDone;
  adDone = null;
  if (cb) cb(!!shown);
}

/* ------------------------------------------------------------
   Пауза. Звук глушим всегда, бой останавливаем и возвращаем.
   ------------------------------------------------------------ */
let sdkAutoPaused = false;

function sdkPause(on) {
  if (GM.paused === on) return;
  GM.paused = on;
  audioGate();
  if (on) {
    if (state === 'play') { setState('pause'); sdkAutoPaused = true; }
  } else if (sdkAutoPaused) {
    sdkAutoPaused = false;
    if (state === 'pause') setState('play');
  }
}

/* разметки боя и меню у площадки нет — заглушки для общего кода */
function sdkGameplay() {}
const ysdkGameplay = sdkGameplay;
function sdkHappy() {}

/* ------------------------------------------------------------
   Сохранения. Облачного хранилища у площадки нет, прогресс живёт
   в localStorage (см. settings.js). Заглушки оставлены, чтобы код
   всех сборок оставался общим.
   ------------------------------------------------------------ */
const CLOUD = { on: false, loaded: false, t: 0, dirty: false };
function cloudSave() {}
function cloudFlush() {}

/* ---------- звук на время ролика ---------- */
function adMute(on) { GM.busy = on; audioGate(); }

/* ------------------------------------------------------------
   Сторож: если площадка не ответила ни паузой, ни стартом, игра
   не должна остаться без звука и без хода.
   ------------------------------------------------------------ */
let adGuardT = 0, adGuardCb = null;
function adGuard(sec, cb) { adGuardT = sec; adGuardCb = cb; }
function adGuardClear() { adGuardT = 0; adGuardCb = null; }

/* ---------- межстраничная ---------- */
/* Показываем только в логической паузе — между уровнями и после
   гибели, никогда посреди боя. */
function adReady() {
  const t = nowS();
  return !GM.paused &&
         (t - GM.startT) >= GM.quiet &&     /* первая минута сессии — без рекламы */
         (t - GM.lastAny) >= GM.quiet &&    /* и минута после любого ролика        */
         (t - GM.lastAd) >= GM.gap;         /* между межстраничными — три минуты   */
}

function adFullscreen(done) {
  let fired = false;
  const fin = shown => { if (fired) return; fired = true; adGuardClear(); adMute(false); done && done(!!shown); };
  if (!adReady() || !GM.ok) { fin(false); return; }
  GM.lastAd = GM.lastAny = nowS();
  adMute(true);
  adDone = fin;
  adGuard(8, () => { adDone = null; sdkPause(false); fin(false); });
  try { GM.sdk.showBanner(); } catch (e) { adDone = null; fin(false); }
}

/* ------------------------------------------------------------
   Ролик по кнопке игрока. Отдельной «рекламы за награду» у
   площадки нет, поэтому показываем обычный ролик и выдаём
   награду, когда он доигран. Если ролика не дали — награду всё
   равно выдаём и честно пишем об этом.
   ------------------------------------------------------------ */
function adRewarded(onReward, onDone) {
  if (GM.busy || adMockT > 0 || GM.paused) return;
  GM.lastAny = nowS();
  adMute(true);

  const mock = () => {
    adGuardClear();
    adMockT = 1.2;
    adNote = GM.ok ? T('adNoFill') : T('adDemo');
    adMockCb = () => { adMute(false); onReward && onReward(); onDone && onDone(); };
  };
  if (!GM.ok) { mock(); return; }

  let fired = false;
  const fin = shown => {
    if (fired) return; fired = true;
    adGuardClear();
    adMute(false);
    if (shown) { onReward && onReward(); onDone && onDone(); }
    else { adDone = null; mock(); }       /* ролика не было — демо-плашка и награда */
  };
  adDone = fin;
  adGuard(8, () => { adDone = null; sdkPause(false); fin(false); });
  try { GM.sdk.showBanner(); } catch (e) { adDone = null; fin(false); }
}

function adToast(text) { adNote = text; adNoteT = 2.2; }

/* демо-ролик и сторож тикают из игрового цикла — без setTimeout,
   чтобы ничто не выстрелило после смены экрана */
function updAds(dt) {
  if (gmWatch > 0) {
    gmWatch -= dt;
    if (gmWatch <= 0) {
      console.warn('[Архипелаг] Площадка не ответила на showBanner: рекламы нет.');
      adToast(T('adFailed'));
    }
  }
  if (adGuardT > 0) {
    adGuardT -= dt;
    if (adGuardT <= 0) { const cb = adGuardCb; adGuardCb = null; if (cb) cb(); }
  }
  if (adMockT > 0) {
    adMockT -= dt;
    if (adMockT <= 0) { const cb = adMockCb; adMockCb = null; adNoteT = 1.6; if (cb) cb(); }
  }
  if (adNoteT > 0) adNoteT -= dt;
}

/* плашка поверх всего, пока крутится демо-ролик или всплыла ошибка */
function drawAdOverlay() {
  if (adMockT > 0) {
    ctx.fillStyle = 'rgba(2,8,14,0.85)';
    ctx.fillRect(0, 0, VW, VH);
    txt(T('adWatching'), VW / 2, VH / 2 - 12, '#ffd94a', 16, 'center');
    txt(adNote, VW / 2, VH / 2 + 10, '#7fd4e0', 8, 'center', VW - 16);
    const w = 160, k = 1 - adMockT / 1.2;
    bar(VW / 2 - w / 2, VH / 2 + 26, w, 4, k, '#ffd94a');
    return true;
  }
  if (adNoteT > 0) {
    ctx.globalAlpha = Math.min(1, adNoteT);
    txt(adNote, VW / 2, VH - 12, '#ffb454', 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
  }
  return false;
}

/* таблиц рекордов у площадки нет — штаб покажет личный рекорд */
const LB = { name: 'best', rank: 0, sent: -1, busy: false };
function lbSubmit() {}
function lbLoad() {}

/* ---------- возрождение ---------- */
let reviveLeft = 1;

function canRevive() {
  return reviveLeft > 0 && !GM.busy && adMockT <= 0 &&
         !(curCfg.mission === 'convoy' && transport && transport.dead);
}
function tryRevive() {
  if (!canRevive()) { adToast(T('reviveNone')); return; }
  adRewarded(() => {
    reviveLeft--;
    /* поднимаем катер у авианосца и разгоняем всё, что рядом */
    player.dead = false; player.sink = 0; player.sinkRot = 0;
    player.hp = player.maxhp; player.spd = 0; player.fr = 0;
    player.x = CARR.x + 120; player.y = CARR.y;
    player.boostE = boostMax();
    shells.length = 0; eMissiles.length = 0; arcs.length = 0; torps.length = 0;
    for (let i = enemies.length - 1; i >= 0; i--)
      if (dist(enemies[i].x, enemies[i].y, player.x, player.y) < 260) enemies.splice(i, 1);
    setState('play');
    msg(T('reviveDone'), '#4ade80', 3);
    SFX.evac();
    flashScreen = 0.35;
  });
}
