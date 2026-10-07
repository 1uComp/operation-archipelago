'use strict';
/* ============================================================
   vksdk.js — VK Игры (ВКонтакте и Одноклассники) через VK Bridge.

   Замена ysdk.js / cgsdk.js в сборке для VK Игр. Наружу торчат те
   же имена (adFullscreen, adRewarded, cloudSave, audioGate…), поэтому
   остальной код игры общий для всех сборок.

   VK Bridge 3.0.2 лежит в src/vendor (MIT) — внешних загрузок нет.

   Требования VK, закрытые здесь:
   • VKWebAppInit отправляется сразу при старте (допуск — 30 секунд);
   • реклама только сетью VK: VKWebAppCheckNativeAds заранее,
     VKWebAppShowNativeAds в нужный момент;
   • между экранами — только при переходе к следующему уровню, не при
     запуске и не чаще раза в 30 секунд (у нас — раз в три минуты);
   • за вознаграждение — только по кнопке игрока, с подтверждением
     и указанием награды, не больше одного ролика на нажатие;
   • суточный лимит роликов за награду на игрока (рекомендация VK);
   • VKWebAppViewHide/Restore — пауза и звук в мобильном приложении;
   • прогресс в VKWebAppStorage: при выкладке на хостинг VK адрес игры
     меняется и localStorage теряется, а хранилище VK привязано к игроку.
   ============================================================ */

const ADS_ON = true;
const PAYMENTS_ON = false;          /* покупки за голоса — позже */

/* ------------------------------------------------------------
   КАНАЛ СВЯЗИ С ПОДДЕРЖКОЙ — обязателен для каталога VK.
   Впишите сообщество игры, свою страницу или почту — строка
   показывается на экране настроек. Пока пусто — строки нет,
   но без неё модерацию каталога не пройти.
   ------------------------------------------------------------ */
const SUPPORT_CONTACT = '';

const AD_DAY_LIMIT = 30;            /* роликов за награду на игрока в сутки */

const VKG = {
  bridge: null, ok: false, launch: {},
  lastAd: -1e9,                     /* последняя межстраничная, с    */
  lastAny: -1e9,                    /* последняя реклама любого вида */
  gap: 180,                         /* между межстраничными — 3 мин  */
  quiet: 60,                        /* тишина в начале сессии        */
  startT: 0,
  busy: false,                      /* пока идёт ролик, игра стоит   */
  paused: false,                    /* свёрнуто (VKWebAppViewHide)   */
  away: false,                      /* окно потеряло фокус           */
  ready: { reward: false, interstitial: false }
};
/* остальной код игры написан под имя YA — держим его же */
const YA = VKG;

const nowS = () => performance.now() / 1000;

/* Единственное место, где трогается общая громкость. */
function audioGate() {
  if (typeof master === 'undefined' || !master) return;
  master.gain.value = (VKG.busy || VKG.paused || VKG.away || muted) ? 0 : SETTINGS.volume;
}

/* демо-ролик вне VK */
let adMockT = 0, adMockCb = null, adNoteT = 0, adNote = '';

/* ---------- постоянные вещи (донат выключен) ---------- */
const PRODUCTS = {
  hull_admiral: { perk: 'hull', name: 'itHull', desc: 'itHullD', fallback: '—' },
  harpoon_gold: { perk: 'harp', name: 'itHarp', desc: 'itHarpD', fallback: '—' }
};
function hasPerk(k) { return PAYMENTS_ON && !!(SETTINGS.perks && SETTINGS.perks[k]); }
const perksLeft = () => (PAYMENTS_ON ? Object.values(PRODUCTS).filter(p => !hasPerk(p.perk)) : []);
function grantPerk() { return false; }
function productPrice(id) { return PRODUCTS[id] ? PRODUCTS[id].fallback : ''; }
function buyProduct() { adToast(T('buyFail')); }

/* ---------- параметры запуска (VK дописывает их к адресу) ---------- */
function vkLaunchParams() {
  const out = {};
  try {
    new URLSearchParams(location.search).forEach((v, k) => { if (k.indexOf('vk_') === 0) out[k] = v; });
  } catch (e) {}
  return out;
}

/* ---------- запуск ---------- */
function sdkInit() {
  VKG.startT = nowS();
  VKG.launch = vkLaunchParams();
  const b = window.vkBridge;
  /* вне ВКонтакте (локальный файл) мост есть, но отвечать ему некому */
  if (!b || typeof b.isEmbedded !== 'function' || !b.isEmbedded()) return;
  VKG.bridge = b;

  /* сворачивание и возврат в мобильном приложении ВКонтакте */
  b.subscribe(e => {
    const type = e && e.detail && e.detail.type;
    if (type === 'VKWebAppViewHide') sdkPause(true);
    else if (type === 'VKWebAppViewRestore') sdkPause(false);
  });

  /* сообщаем о старте сразу — до долгих загрузок */
  b.send('VKWebAppInit').then(() => {
    VKG.ok = true;
    adCheck('interstitial');
    adCheck('reward');
    cloudInit();
  }).catch(() => { VKG.ok = false; });

  /* материалы могут не загрузиться с первого раза — проверяем по таймеру */
  setInterval(() => {
    if (!VKG.ready.reward) adCheck('reward');
    if (!VKG.ready.interstitial) adCheck('interstitial');
  }, 30000);
}
const ysdkInit = sdkInit;

/* ------------------------------------------------------------
   Пауза: VKWebAppViewHide/Restore в приложении ВКонтакте, а в
   браузере — общий обработчик visibilitychange в input.js.
   ------------------------------------------------------------ */
let sdkAutoPaused = false;
function sdkPause(on) {
  if (VKG.paused === on) return;
  VKG.paused = on;
  audioGate();
  if (on) {
    if (state === 'play') { setState('pause'); sdkAutoPaused = true; }
  } else if (sdkAutoPaused) {
    sdkAutoPaused = false;
    if (state === 'pause') setState('play');
  }
}

/* разметки боя/меню у VK нет */
function sdkGameplay() {}
const ysdkGameplay = sdkGameplay;
function sdkHappy() {}

/* ------------------------------------------------------------
   Облако VK. Все настройки и прогресс — одной JSON-строкой,
   порезанной на куски (у значения в хранилище VK ограничен размер).
   Кто новее по savedAt — тот и прав: при переезде хостинга локальная
   копия пуста, и прогресс поднимается из облака.
   ------------------------------------------------------------ */
const CLOUD = { on: false, loaded: false, t: 0, dirty: false };
const CLOUD_CHUNK = 1800;

function cloudVal(res, key) {
  const it = res && res.keys && res.keys.find(x => x.key === key);
  return it ? it.value : '';
}

function cloudInit() {
  const b = VKG.bridge;
  b.send('VKWebAppStorageGet', { keys: ['save_n'] }).then(r => {
    const n = parseInt(cloudVal(r, 'save_n'), 10) || 0;
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push('save_' + i);
    return b.send('VKWebAppStorageGet', { keys }).then(r2 => keys.map(k => cloudVal(r2, k)).join(''));
  }).then(raw => {
    if (raw) { try { cloudAdopt(JSON.parse(raw)); } catch (e) {} }
    CLOUD.on = true;
    CLOUD.loaded = true;
    cloudSave(true);
  }).catch(() => { CLOUD.on = true; CLOUD.loaded = true; });
}

function cloudAdopt(c) {
  if (!c || typeof c !== 'object') return;
  if ((c.savedAt || 0) <= (SETTINGS.savedAt || 0)) return;   /* локальная копия новее */
  for (const k in c) if (k in SETTINGS) SETTINGS[k] = c[k];
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) {}
  applySettings();
  if (typeof metaBoot === 'function') metaBoot();
  /* облако принесло неполученный паёк — показываем штаб, как при обычном входе */
  if (META.ready && state === 'title') openHQ('title');
}

/* пишем не чаще раза в 20 секунд */
function cloudSave(force) {
  if (!CLOUD.on || !CLOUD.loaded) return;
  CLOUD.dirty = true;
  if (!force && CLOUD.t > 0) return;
  cloudFlush();
}
function cloudFlush() {
  if (!CLOUD.on || !CLOUD.loaded || !CLOUD.dirty || !VKG.ok) return;
  CLOUD.dirty = false;
  CLOUD.t = 20;
  const s = JSON.stringify(SETTINGS);
  const parts = [];
  for (let i = 0; i < s.length; i += CLOUD_CHUNK) parts.push(s.slice(i, i + CLOUD_CHUNK));
  const b = VKG.bridge;
  let p = Promise.resolve();
  parts.forEach((v, i) => { p = p.then(() => b.send('VKWebAppStorageSet', { key: 'save_' + i, value: v })); });
  p.then(() => b.send('VKWebAppStorageSet', { key: 'save_n', value: String(parts.length) })).catch(() => {});
}

/* ---------- звук на время ролика ---------- */
function adMute(on) { VKG.busy = on; audioGate(); }

/* сторож: промис VK может не вернуться — игра не должна остаться без звука */
let adGuardT = 0, adGuardCb = null;
function adGuard(sec, cb) { adGuardT = sec; adGuardCb = cb; }
function adGuardClear() { adGuardT = 0; adGuardCb = null; }

/* ---------- предзагрузка ---------- */
function adCheck(fmt) {
  if (!VKG.ok) return;
  VKG.bridge.send('VKWebAppCheckNativeAds', { ad_format: fmt })
    .then(d => { VKG.ready[fmt] = !!(d && d.result); })
    .catch(() => { VKG.ready[fmt] = false; });
}

/* ---------- между экранами: только переход к следующему уровню ---------- */
function adReadyFS() {
  const t = nowS();
  return !VKG.paused &&
         (t - VKG.startT) >= VKG.quiet &&
         (t - VKG.lastAny) >= VKG.quiet &&
         (t - VKG.lastAd) >= VKG.gap;
}

function adFullscreen(done) {
  let fired = false;
  const fin = shown => {
    if (fired) return; fired = true;
    adGuardClear(); adMute(false); adCheck('interstitial');
    done && done(!!shown);
  };
  if (!VKG.ok || !adReadyFS()) { fin(false); return; }
  VKG.lastAd = VKG.lastAny = nowS();
  adMute(true);
  adGuard(60, () => fin(false));
  VKG.bridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
    .then(d => fin(d && d.result))
    .catch(() => fin(false));
}

/* ------------------------------------------------------------
   За вознаграждение. Правило VK: только по кнопке игрока, игрок
   подтверждает готовность, и в запросе названа награда. Поэтому
   сначала — окно «Смотреть рекламу? Награда: …».
   ------------------------------------------------------------ */
let adAsk = null;                  /* { label, onReward, onDone } */
let adAskBtns = [];
const adAskOpen = () => !!adAsk;

function adDayLeft() {
  const d = typeof metaDay === 'function' ? metaDay() : 0;
  if (!SETTINGS.adDay || SETTINGS.adDay.d !== d) SETTINGS.adDay = { d: d, n: 0 };
  return AD_DAY_LIMIT - SETTINGS.adDay.n;
}

function adRewarded(onReward, onDone, label) {
  if (VKG.busy || adMockT > 0 || VKG.paused || adAsk) return;
  if (adDayLeft() <= 0) { adToast(T('adLimit')); return; }
  adAsk = { label: label || '', onReward, onDone };
  SFX.ui();
}

function adAskAnswer(yes) {
  const a = adAsk;
  adAsk = null;
  if (!a) return;
  SFX.ui();
  if (yes) adRewardedGo(a.onReward, a.onDone);
}

function adAskTap(x, y) {
  for (const b of adAskBtns)
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { adAskAnswer(b.id === 'yes'); return; }
}

function adRewardedGo(onReward, onDone) {
  VKG.lastAny = nowS();
  adMute(true);
  /* вне VK или если ролика так и не дали — награду не отнимаем */
  const mock = () => {
    adGuardClear();
    adMockT = 1.2;
    adNote = VKG.ok ? T('adNoFill') : T('adDemo');
    adMockCb = () => { adMute(false); onReward && onReward(); onDone && onDone(); };
  };
  if (!VKG.ok) { mock(); return; }
  adDayLeft();
  SETTINGS.adDay.n++;
  saveSettings();
  let fired = false;
  const fin = ok => {
    if (fired) return; fired = true;
    adGuardClear(); adCheck('reward');
    if (ok) { adMute(false); onReward && onReward(); onDone && onDone(); }
    else mock();
  };
  adGuard(60, () => fin(false));
  VKG.bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' })
    .then(d => fin(!!(d && d.result)))
    .catch(() => fin(false));
}

function adToast(text) { adNote = text; adNoteT = 2.2; }

/* ---------- позвать друзей (рекомендация VK для каталога) ---------- */
function vkInvite() {
  if (!VKG.ok) { adToast(T('inviteOff')); return; }
  VKG.bridge.send('VKWebAppShowInviteBox').catch(() => {});
}

/* ---------- тик из игрового цикла ---------- */
function updAds(dt) {
  if (CLOUD.t > 0) {
    CLOUD.t -= dt;
    if (CLOUD.t <= 0 && CLOUD.dirty) cloudFlush();
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

/* поверх всего: окно подтверждения, демо-ролик, подсказки */
function drawAdOverlay() {
  if (adAsk) {
    ctx.fillStyle = 'rgba(2,8,14,0.82)';
    ctx.fillRect(0, 0, VW, VH);
    const W = 280, H = 96, X = VW / 2 - W / 2, Y = VH / 2 - H / 2;
    panel(X, Y, W, H, '#ffd94a');
    txt(T('adAsk'), VW / 2, Y + 12, '#ffd94a', 16, 'center', W - 20);
    txt(T('adAskFor', adAsk.label), VW / 2, Y + 36, '#f4f8fa', 8, 'center', W - 20);
    adAskBtns = [
      { id: 'yes', x: X + 16, y: Y + H - 30, w: 116, h: 18 },
      { id: 'no',  x: X + W - 132, y: Y + H - 30, w: 116, h: 18 }
    ];
    for (const b of adAskBtns) {
      const yes = b.id === 'yes';
      ctx.fillStyle = yes ? 'rgba(8,30,20,0.95)' : 'rgba(8,18,26,0.9)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = yes ? '#4ade80' : '#4a86a3'; ctx.lineWidth = D * 2;
      ctx.strokeRect(b.x + D, b.y + D, b.w - D * 2, b.h - D * 2);
      txt(yes ? T('adAskYes') : T('adAskNo'), b.x + b.w / 2, b.y + 5.5,
          yes ? '#4ade80' : '#9fc3d0', 8, 'center', b.w - 14);
    }
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

/* таблиц рекордов пока нет — штаб покажет личный рекорд */
const LB = { name: 'best', rank: 0, sent: -1, busy: false };
function lbSubmit() {}
function lbLoad() {}

/* ---------- возрождение за ролик ---------- */
let reviveLeft = 1;

function canRevive() {
  return reviveLeft > 0 && !VKG.busy && adMockT <= 0 && !adAsk &&
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
  }, null, T('rwRevive'));
}
