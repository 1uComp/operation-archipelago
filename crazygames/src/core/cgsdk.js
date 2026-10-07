'use strict';
/* ============================================================
   cgsdk.js — CrazyGames: реклама, пауза, сохранения.

   Это замена яндексового ysdk.js в сборке для CrazyGames. Имена
   функций снаружи те же (adFullscreen, adRewarded, cloudSave,
   sdkGameplay, audioGate…), поэтому остальной код игры общий для
   обеих сборок.

   Что даёт площадка (SDK v3):
   • sdk.ad.requestAd('midgame' | 'rewarded', колбэки) — реклама;
   • sdk.game.gameplayStart/Stop — разметка боя и меню;
   • sdk.game.loadingStart/Stop — загрузка;
   • sdk.game.happytime() — «игроку сейчас хорошо»;
   • sdk.data — хранилище прогресса: у вошедшего игрока оно
     переезжает между устройствами, у гостя работает локально.

   Чего у площадки нет: внутриигровых покупок и таблиц рекордов.
   Поэтому донат выключен (PAYMENTS_ON = false), а место в общем
   зачёте в штабе не показывается — только личный рекорд.

   Вне площадки (локальный файл) SDK нет: «ролик» крутится 1.2
   секунды и награда выдаётся, игра не должна ломаться.
   ============================================================ */

const CG = {
  sdk: null, ok: false, env: 'disabled',
  startT: 0,
  busy: false,                     /* пока идёт ролик, игра стоит   */
  paused: false,                   /* пауза по требованию площадки  */
  away: false                      /* окно потеряло фокус           */
};
/* остальной код игры написан под имя YA — держим его же */
const YA = CG;

const nowS = () => performance.now() / 1000;

/* Единственное место, где трогается общая громкость: звук молчит,
   пока идёт реклама, пока площадка держит паузу и пока окно не в фокусе. */
function audioGate() {
  if (typeof master === 'undefined' || !master) return;
  master.gain.value = (CG.busy || CG.paused || CG.away || muted) ? 0 : SETTINGS.volume;
}

/* демо-ролик для игры вне площадки */
let adMockT = 0, adMockCb = null, adNoteT = 0, adNote = '';

/* ---------- постоянные вещи ---------- */
/* У CrazyGames нет внутриигровых покупок, поэтому донат выключен:
   строки в арсенале скрыты, главные призы барабана и седьмого дня
   выдаются кредитами. Список оставлен на случай другой площадки. */
const PAYMENTS_ON = false;

const PRODUCTS = {
  hull_admiral: { perk: 'hull', name: 'itHull', desc: 'itHullD', fallback: '—' },
  harpoon_gold: { perk: 'harp', name: 'itHarp', desc: 'itHarpD', fallback: '—' }
};

function hasPerk(k) { return PAYMENTS_ON && !!(SETTINGS.perks && SETTINGS.perks[k]); }
/* вещи, которые ещё можно выдать призом; без доната — ни одной */
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
function sdkInit() {
  CG.startT = nowS();
  const root = (typeof window !== 'undefined') && window.CrazyGames && window.CrazyGames.SDK;
  if (!root) return;                                   /* играем без площадки */
  try {
    /* Вся графика и звук у игры генерируются кодом и готовы к этому
       моменту, поэтому загрузка начинается и заканчивается сразу. */
    root.init().then(() => {
      CG.sdk = root;
      CG.ok = true;
      try { CG.env = root.environment || 'crazygames'; } catch (e) {}
      try { root.game.loadingStart(); root.game.loadingStop(); } catch (e) {}
      cloudInit();
      adProbe();                     /* Basic Launch и блокировщик — до первой кнопки */
    }).catch(() => { CG.ok = false; });
  } catch (e) { CG.ok = false; }
}
/* старое имя — чтобы обе сборки запускались одинаково */
const ysdkInit = sdkInit;

/* ------------------------------------------------------------
   Пауза. На CrazyGames отдельных событий паузы нет: её задают
   колбэки рекламы (adStarted/adFinished) и наши же обработчики
   потери фокуса. Логика та же — звук глушим, бой останавливаем.
   ------------------------------------------------------------ */
let sdkAutoPaused = false;

function sdkPause(on) {
  if (CG.paused === on) return;
  CG.paused = on;
  audioGate();
  if (on) {
    if (state === 'play') { setState('pause'); sdkAutoPaused = true; }
  } else if (sdkAutoPaused) {
    sdkAutoPaused = false;
    if (state === 'pause') setState('play');
  }
}

/* ------------------------------------------------------------
   Разметка боя и меню. Площадка режет эти вызовы до одного в
   секунду и ругается в консоль, а игра дёргает их на каждой смене
   экрана (пауза, арсенал, штаб). Поэтому запоминаем, чего хотим,
   и отправляем не чаще раза в секунду и только при смене.
   ------------------------------------------------------------ */
let gpWant = null, gpSent = null, gpLast = -1e9, gpTimer = 0;

function sdkGameplay(on) { gpWant = !!on; gpFlush(); }
const ysdkGameplay = sdkGameplay;

function gpFlush() {
  if (!CG.ok || gpWant === null || gpWant === gpSent) return;
  const t = nowS(), wait = 1.05 - (t - gpLast);
  if (wait > 0) {
    /* Рано. Повторим сами: игровой цикл в фоновой вкладке засыпает,
       и дожидаться его нельзя — площадка не увидит начала боя. */
    if (!gpTimer) gpTimer = setTimeout(() => { gpTimer = 0; gpFlush(); }, Math.ceil(wait * 1000) + 30);
    return;
  }
  gpSent = gpWant; gpLast = t;
  try {
    if (gpSent) CG.sdk.game.gameplayStart();
    else CG.sdk.game.gameplayStop();
  } catch (e) {}
}

/* «игроку сейчас хорошо» — зачищенный сектор, потопленный флагман */
function sdkHappy() {
  if (!CG.ok) return;
  try { CG.sdk.game.happytime(); } catch (e) {}
}

/* ------------------------------------------------------------
   Сохранения. sdk.data — то же localStorage по виду, но у вошедшего
   в аккаунт игрока данные переезжают между устройствами. Ведущей
   остаётся локальная копия, облако её догоняет и подтягивает то,
   что больше.
   ------------------------------------------------------------ */
const CLOUD = { on: false, loaded: false, t: 0, dirty: false };
const CLOUD_KEY = 'arhipelag.progress';

function cloudInit() {
  try {
    if (!CG.sdk.data) return;
    CLOUD.on = true;
    let raw = null;
    try { raw = CG.sdk.data.getItem(CLOUD_KEY); } catch (e) {}
    if (raw) { try { cloudMerge(JSON.parse(raw) || {}); } catch (e) {} }
    CLOUD.loaded = true;
    cloudSave(true);                   /* сразу выравниваем облако по слиянию */
  } catch (e) {}
}

function cloudMerge(d) {
  if (d.best) {
    if ((d.best.level | 0) > (SETTINGS.bestLevel | 0)) SETTINGS.bestLevel = d.best.level | 0;
    if ((d.best.score | 0) > (SETTINGS.bestScore | 0)) SETTINGS.bestScore = d.best.score | 0;
  }
  if (d.perks) for (const k in d.perks) if (d.perks[k]) grantPerk(k, true);

  const C = d.meta, M = SETTINGS.meta;
  if (C && typeof C === 'object') {
    if (!M || (C.day | 0) > (M.day | 0)) SETTINGS.meta = C;   /* в облаке свежее */
    else {
      M.xp    = Math.max(M.xp | 0, C.xp | 0);
      M.best  = Math.max(M.best | 0, C.best | 0);
      M.total = Math.max(M.total | 0, C.total | 0);
      M.cr    = Math.max(M.cr | 0, C.cr | 0);
      M.ammo  = Math.max(M.ammo | 0, C.ammo | 0);
      if ((C.day | 0) === (M.day | 0)) {
        M.streak = Math.max(M.streak | 0, C.streak | 0);
        M.claimed = M.claimed || !!C.claimed;                 /* дважды паёк не выдаём */
      } else if ((M.day | 0) - (C.day | 0) === 1) {
        M.streak = Math.max(M.streak | 0, (C.streak | 0) + 1); /* вчера играли на другом устройстве */
      }
      M.best = Math.max(M.best | 0, M.streak | 0);
    }
    if (typeof metaBoot === 'function') metaBoot();           /* пересчёт дня на слитых данных */
  }
  saveSettings();
}

/* пишем не чаще раза в 20 секунд: не дёргаем хранилище на каждый кадр */
function cloudSave(force) {
  if (!CLOUD.on || !CLOUD.loaded) return;
  CLOUD.dirty = true;
  if (!force && CLOUD.t > 0) return;
  cloudFlush();
}
function cloudFlush() {
  if (!CLOUD.on || !CLOUD.loaded || !CLOUD.dirty) return;
  CLOUD.dirty = false;
  CLOUD.t = 20;
  try {
    CG.sdk.data.setItem(CLOUD_KEY, JSON.stringify({
      meta: SETTINGS.meta,
      best: { level: SETTINGS.bestLevel || 0, score: SETTINGS.bestScore || 0 },
      perks: SETTINGS.perks || {}
    }));
  } catch (e) {}
}

/* ------------------------------------------------------------
   РЕКЛАМА — по требованиям CrazyGames (docs.crazygames.com,
   Requirements → Advertisement):
   • звук глушим, только когда ролик реально начался (adStarted),
     а не при запросе;
   • от запроса до adFinished/adError интерфейс заблокирован —
     игрок видит «загрузка рекламы» и ничего не может нажать;
   • при adError за вознаграждение НЕ награждаем;
   • в Basic Launch и при блокировщике кнопок «за ролик» нет вовсе —
     кнопки без эффекта модерация отклоняет;
   • частоту межстраничной рекламы считает сама площадка (раз в
     3 минуты с учётом старта игры и роликов за награду), поэтому
     мы просто запрашиваем её в каждой логичной паузе.
   Коды ошибок: adsDisabledBasicLaunch, unfilled, adblock,
   adCooldown, other — пишутся в консоль.
   ------------------------------------------------------------ */
CG.adsOff = false;                 /* площадка отключила рекламу (Basic Launch) */
CG.adblock = false;                /* у игрока блокировщик рекламы */
CG.req = false;                    /* запрос отправлен, ответа ещё нет */
CG.reqT = 0;                       /* сколько ждём ответа — для анимации */

/* Можно ли вообще предлагать ролик за награду. Вне площадки (локальный
   файл) — да, там показывается демо-ролик для проверки игры. */
function adsAvail() {
  if (!CG.ok) return true;
  return !CG.adsOff && !CG.adblock;
}
/* пока идёт запрос или ролик, ввод в игру не проходит */
const adBlocking = () => CG.req || CG.busy || adMockT > 0;

function adErrCode(e) {
  try { return (e && (e.code || e.message)) || String(e || 'unknown'); } catch (x) { return 'unknown'; }
}
function adLogErr(kind, e) {
  const code = adErrCode(e);
  console.warn('[CrazyGames] ' + kind + ' ad error: ' + code);
  if (code === 'adsDisabledBasicLaunch') CG.adsOff = true;
  if (code === 'adblock') CG.adblock = true;
  return code;
}

/* Разведка при запуске. prefetchAd в Basic Launch сразу бросает
   adsDisabledBasicLaunch — так мы узнаём о нём до первой кнопки.
   В полном запуске он заодно заранее грузит ролик. */
function adProbe() {
  const ad = CG.sdk && CG.sdk.ad;
  if (!ad) return;
  if (typeof ad.prefetchAd === 'function') {
    try { ad.prefetchAd('rewarded'); ad.prefetchAd('midgame'); }
    catch (e) { adLogErr('prefetch', e); }
  }
  if (typeof ad.hasAdblock === 'function') {
    try {
      Promise.resolve(ad.hasAdblock()).then(v => {
        CG.adblock = !!v;
        if (v) console.warn('[CrazyGames] adblock detected: rewarded buttons hidden');
      }).catch(() => {});
    } catch (e) {}
  }
}

/* ---------- звук и пауза на время ролика ---------- */
function adMute(on) { CG.busy = on; audioGate(); }

/* Ролик пошёл: глушим звук и ставим мир на паузу. Ролик кончился (или
   не пришёл): возвращаем. Вызовы идемпотентны — поздний ролик после
   сторожа тоже корректно отпускает игру. */
function adOn() { CG.req = false; adGuardClear(); adMute(true); sdkPause(true); }
function adOff() { CG.req = false; adGuardClear(); sdkPause(false); adMute(false); adRefocus(); }

/* Ролик показывается в родительской странице и забирает фокус у
   фрейма игры — без этого клавиатура молчала бы до первого клика. */
function adRefocus() {
  try { window.focus(); } catch (e) {}
  CG.away = false; audioGate();
}

/* Сторож: SDK всегда отвечает adFinished или adError, но если связь
   оборвалась, игра не должна остаться заблокированной. */
let adGuardT = 0, adGuardCb = null;
function adGuard(sec, cb) { adGuardT = sec; adGuardCb = cb; }
function adGuardClear() { adGuardT = 0; adGuardCb = null; }

/* ---------- межстраничная: в каждой логичной паузе ---------- */
function adFullscreen(done) {
  let fired = false;
  const fin = shown => { if (fired) return; fired = true; done && done(!!shown); };
  if (!CG.ok || CG.adsOff) { fin(false); return; }
  if (CG.req || CG.busy) return;          /* повторное нажатие — первый запрос доведёт */
  CG.req = true; CG.reqT = 0;
  sdkGameplay(false);
  adGuard(15, () => { adOff(); fin(false); });
  try {
    CG.sdk.ad.requestAd('midgame', {
      adStarted: adOn,
      adFinished: () => { adOff(); fin(true); },
      adError: e => { adOff(); adLogErr('midgame', e); fin(false); }
    });
  } catch (e) { adOff(); adLogErr('midgame', e); fin(false); }
}

/* ---------- за вознаграждение ---------- */
function adRewarded(onReward, onDone) {
  if (adBlocking() || CG.paused) return;
  if (!adsAvail()) { adToast(T('adFailed')); return; }     /* кнопки и так скрыты */
  const give = () => { onReward && onReward(); onDone && onDone(); };

  /* вне площадки — демо-ролик, чтобы игру можно было проверить локально */
  if (!CG.ok) {
    adMockT = 1.2;
    adNote = T('adDemo');
    adMute(true);
    adMockCb = () => { adMute(false); give(); };
    return;
  }

  let granted = false;
  CG.req = true; CG.reqT = 0;
  sdkGameplay(false);
  /* сторож только разблокирует игру; награду даёт лишь adFinished,
     даже если ролик всё-таки придёт позже */
  adGuard(15, () => { adOff(); adToast(T('adFailed')); });
  try {
    CG.sdk.ad.requestAd('rewarded', {
      adStarted: adOn,
      adFinished: () => {
        adOff();
        if (granted) return;
        granted = true;
        give();                            /* досмотрел — награда */
      },
      adError: e => {
        adOff();
        adLogErr('rewarded', e);
        adToast(T('adFailed'));            /* правило CrazyGames: без ролика — без награды */
      }
    });
  } catch (e) { adOff(); adLogErr('rewarded', e); adToast(T('adFailed')); }
}

function adToast(text) { adNote = text; adNoteT = 2.2; }

/* сторож, демо-ролик и облако тикают из игрового цикла */
function updAds(dt) {
  gpFlush();                       /* отложенная разметка боя и меню */
  if (CLOUD.t > 0) {
    CLOUD.t -= dt;
    if (CLOUD.t <= 0 && CLOUD.dirty) cloudFlush();
  }
  if (CG.req) CG.reqT += dt;
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

/* поверх всего: «загрузка рекламы», демо-ролик, подсказки */
function drawAdOverlay() {
  if (CG.req && !CG.busy) {
    /* запрос ушёл — блокируем экран, как требует площадка */
    ctx.fillStyle = 'rgba(2,8,14,0.72)';
    ctx.fillRect(0, 0, VW, VH);
    txt(T('adLoading'), VW / 2, VH / 2 - 14, '#ffd94a', 8, 'center', VW - 16);
    const cx = VW / 2, cy = VH / 2 + 8, a = CG.reqT * 5;
    ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(cx, cy, 8, a, a + Math.PI * 1.4); ctx.stroke();
    return true;
  }
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

/* ------------------------------------------------------------
   Таблицы рекордов у площадки нет, поэтому LB.rank всегда 0 и
   штаб показывает личный рекорд. Заглушки оставлены, чтобы общий
   код обеих сборок не расходился.
   ------------------------------------------------------------ */
const LB = { name: 'best', rank: 0, sent: -1, busy: false };
function lbSubmit() {}
function lbLoad() {}

/* ---------- возрождение за ролик ---------- */
let reviveLeft = 1;

/* Раз за уровень можно вернуться в бой. Есть реклама — за ролик;
   нет (Basic Launch, блокировщик) — второй шанс даём бесплатно,
   иначе гибель без выбора слишком часто заканчивает сессию. */
const reviveFree = () => !adsAvail();
function canRevive() {
  return reviveLeft > 0 && !adBlocking() &&
         !(curCfg.mission === 'convoy' && transport && transport.dead);
}
function tryRevive() {
  if (!canRevive()) { adToast(T('reviveNone')); return; }
  if (reviveFree()) { reviveNow(); return; }
  adRewarded(reviveNow);
}
function reviveNow() {
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
}
