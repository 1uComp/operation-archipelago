'use strict';
/* ============================================================
   ysdk.js — Яндекс Игры: реклама, покупки, постоянные вещи.

   Вне площадки (локальный файл, itch и т.п.) SDK нет, поэтому всё
   работает через заглушку: «ролик» крутится 1.2 секунды и награда
   выдаётся. Игра не должна ломаться без интернета.

   Требования площадки, которые здесь соблюдаются:
   • реклама только через SDK и только в логических паузах — между
     уровнями и после гибели, никогда внутри боя;
   • свой интервал между межстраничными — три минуты, и ни одной
     в первую минуту сессии и минуту после ролика за награду;
   • на game_api_pause глушим звук и останавливаем мир;
   • язык определяем через environment.i18n.lang;
   • прогресс дублируем в облако (player.setData), чтобы он был
     доступен с разных устройств;
   • постоянные покупки не «консумируем» — они восстанавливаются
     через getPurchases при каждом запуске.
   ============================================================ */

const YA = {
  sdk: null, ok: false, payments: null, catalog: [], player: null,
  lastAd: -1e9,                    /* последняя межстраничная, с    */
  lastAny: -1e9,                   /* последняя реклама любого вида */
  gap: 180,                        /* интервал между межстраничными */
  quiet: 60,                       /* тишина в начале сессии и после ролика */
  startT: 0,
  busy: false,                     /* пока идёт ролик, игра стоит   */
  paused: false,                   /* пауза по требованию площадки  */
  away: false                      /* окно потеряло фокус           */
};

const nowS = () => performance.now() / 1000;

/* Единственное место, где трогается общая громкость: звук молчит,
   пока идёт реклама, пока площадка держит паузу и пока окно не в фокусе. */
function audioGate() {
  if (typeof master === 'undefined' || !master) return;
  master.gain.value = (YA.busy || YA.paused || YA.away || muted) ? 0 : SETTINGS.volume;
}

/* демо-ролик для игры вне площадки */
let adMockT = 0, adMockCb = null, adNoteT = 0, adNote = '';

/* ---------- постоянные покупки ---------- */
/* ВЫКЛЮЧАТЕЛЬ ДОНАТА. Пока платежи в консоли недоступны — false:
   покупки не запрашиваются, строки в арсенале скрыты, главные призы
   барабана и седьмого дня выдаются кредитами. Чтобы вернуть донат,
   поставьте true — больше ничего менять не нужно. */
const PAYMENTS_ON = false;

const PRODUCTS = {
  hull_admiral: { perk: 'hull', name: 'itHull', desc: 'itHullD', fallback: '99 ₽' },
  harpoon_gold: { perk: 'harp', name: 'itHarp', desc: 'itHarpD', fallback: '149 ₽' }
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
function productPrice(id) {
  const it = YA.catalog.find(c => c.id === id);
  return it ? it.price : (PRODUCTS[id] ? PRODUCTS[id].fallback : '');
}

/* ---------- инициализация ---------- */
function ysdkInit() {
  YA.startT = nowS();
  if (typeof YaGames === 'undefined') return;          /* играем без площадки */
  YaGames.init().then(sdk => {
    YA.sdk = sdk;
    YA.ok = true;
    try { sdk.features.LoadingAPI.ready(); } catch (e) {}
    sdkLang();
    sdkBindPause();
    cloudInit();
    if (PAYMENTS_ON) sdk.getPayments({ signed: false }).then(p => {
      YA.payments = p;
      p.getCatalog().then(c => { YA.catalog = c || []; }).catch(() => {});
      /* Уже оплаченные вещи возвращаем игроку при каждом запуске.
         Товары постоянные, поэтому чек НЕ гасим: consumePurchase
         удалил бы покупку без возможности восстановления. Гасим
         только чужие/устаревшие, чтобы не висели необработанными. */
      p.getPurchases().then(list => {
        for (const it of (list || [])) {
          const pr = PRODUCTS[it.productID];
          if (pr) grantPerk(pr.perk, true);
          else { try { p.consumePurchase(it.purchaseToken); } catch (e) {} }
        }
      }).catch(() => {});
    }).catch(() => {});
  }).catch(() => { YA.ok = false; });
}

/* автоопределение языка: игрок мог выбрать свой в настройках — его не трогаем */
function sdkLang() {
  try {
    const l = (YA.sdk.environment.i18n.lang || '').toLowerCase();
    if (!l || SETTINGS.langSet) return;
    const want = (l === 'ru' || l === 'be' || l === 'uk') ? 'ru' : 'en';
    if (want !== SETTINGS.lang) { SETTINGS.lang = want; saveSettings(); applySettings(); }
  } catch (e) {}
}

/* ------------------------------------------------------------
   Пауза по сигналу площадки: приходит на показ рекламы, открытие
   окна покупки, сворачивание браузера и переключение вкладки.
   Звук глушим всегда, бой ставим на паузу и возвращаем обратно.
   ------------------------------------------------------------ */
let sdkAutoPaused = false;

function sdkBindPause() {
  if (!YA.sdk || !YA.sdk.on) return;
  try {
    YA.sdk.on('game_api_pause', () => sdkPause(true));
    YA.sdk.on('game_api_resume', () => sdkPause(false));
  } catch (e) {}
}

function sdkPause(on) {
  if (YA.paused === on) return;
  YA.paused = on;
  audioGate();
  if (on) {
    if (state === 'play') { setState('pause'); sdkAutoPaused = true; }
  } else if (sdkAutoPaused) {
    sdkAutoPaused = false;
    if (state === 'pause') setState('play');
  }
}

/* ------------------------------------------------------------
   Облачное сохранение. Площадка требует, чтобы прогресс игрока
   был доступен с разных устройств. Ведущей остаётся локальная
   копия — облако её догоняет и подтягивает то, что больше.
   ------------------------------------------------------------ */
const CLOUD = { on: false, loaded: false, t: 0, dirty: false };

function cloudInit() {
  try {
    YA.sdk.getPlayer({ scopes: false }).then(p => {
      YA.player = p;
      CLOUD.on = true;
      p.getData(['meta', 'best', 'perks']).then(d => {
        cloudMerge(d || {});
        CLOUD.loaded = true;
        cloudSave(true);           /* сразу выравниваем облако по слиянию */
      }).catch(() => { CLOUD.loaded = true; });
    }).catch(() => {});
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

/* пишем не чаще раза в 20 секунд: у setData свой лимит частоты */
function cloudSave(force) {
  if (!CLOUD.on || !CLOUD.loaded || !YA.player) return;
  CLOUD.dirty = true;
  if (!force && CLOUD.t > 0) return;
  cloudFlush();
}
function cloudFlush() {
  if (!CLOUD.on || !CLOUD.loaded || !YA.player || !CLOUD.dirty) return;
  CLOUD.dirty = false;
  CLOUD.t = 20;
  try {
    YA.player.setData({
      meta: SETTINGS.meta,
      best: { level: SETTINGS.bestLevel || 0, score: SETTINGS.bestScore || 0 },
      perks: SETTINGS.perks || {}
    }, false).catch(() => {});
  } catch (e) {}
}

/* площадке полезно знать, когда идёт бой, а когда меню */
function ysdkGameplay(on) {
  if (!YA.ok) return;
  try {
    if (on) YA.sdk.features.GameplayAPI.start();
    else YA.sdk.features.GameplayAPI.stop();
  } catch (e) {}
}

/* ---------- звук на время ролика ---------- */
function adMute(on) { YA.busy = on; audioGate(); }

/* ------------------------------------------------------------
   Сторож. Вне площадки SDK инициализируется, но реальные вызовы
   уходят в никуда и колбэки не приходят вовсе. Без страховки игра
   зависла бы с выключенным звуком, поэтому каждый показ получает
   таймер: не ответили за четыре секунды — считаем, что ролика нет.
   ------------------------------------------------------------ */
let adGuardT = 0, adGuardCb = null;
function adGuard(sec, cb) { adGuardT = sec; adGuardCb = cb; }
function adGuardClear() { adGuardT = 0; adGuardCb = null; }

/* ---------- межстраничная ---------- */
/* Показываем только в логической паузе (между уровнями и после
   гибели) и не раньше, чем площадка вообще это допускает. */
function adReady() {
  const t = nowS();
  return !YA.paused &&
         (t - YA.startT) >= YA.quiet &&     /* первая минута сессии — без рекламы */
         (t - YA.lastAny) >= YA.quiet &&    /* и минута после ролика за награду   */
         (t - YA.lastAd) >= YA.gap;         /* между межстраничными — три минуты  */
}

function adFullscreen(done) {
  let fired = false;
  const fin = shown => { if (fired) return; fired = true; adGuardClear(); adMute(false); done && done(!!shown); };
  if (!adReady() || !YA.ok) { fin(false); return; }
  YA.lastAd = YA.lastAny = nowS();
  adMute(true);
  ysdkGameplay(false);
  adGuard(4.5, () => fin(false));
  try {
    YA.sdk.adv.showFullscreenAdv({ callbacks: { onClose: fin, onError: () => fin(false) } });
  } catch (e) { fin(false); }
}

/* ---------- ролик за награду ---------- */
function adRewarded(onReward, onDone) {
  if (YA.busy || adMockT > 0 || YA.paused) return;
  YA.lastAny = nowS();
  adMute(true);
  ysdkGameplay(false);

  /* Показ-заглушка: вне площадки это честный демо-ролик, а на
     площадке — случай «ролик не выдали»: игрока не наказываем,
     награду выдаём и прямо об этом пишем. */
  const mock = () => {
    adGuardClear();
    adMockT = 1.2;
    adNote = YA.ok ? T('adNoFill') : T('adDemo');
    adMockCb = () => { adMute(false); onReward && onReward(); onDone && onDone(); };
  };
  if (!YA.ok) { mock(); return; }

  let got = false, fired = false;
  const close = () => {
    if (fired) return; fired = true; adGuardClear(); adMute(false);
    if (got) onReward && onReward(); else adToast(T('adFailed'));
    onDone && onDone();
  };
  const fail = () => { if (fired) return; fired = true; mock(); };
  adGuard(4.5, fail);
  try {
    YA.sdk.adv.showRewardedVideo({
      callbacks: { onRewarded: () => { got = true; }, onClose: close, onError: fail }
    });
  } catch (e) { fail(); }
}

function adToast(text) { adNote = text; adNoteT = 2.2; }

/* демо-ролик и сторож тикают из игрового цикла — без setTimeout,
   чтобы ничто не выстрелило после смены экрана */
function updAds(dt) {
  /* отложенная запись в облако */
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

/* плашка поверх всего, пока крутится демо-ролик или всплыла ошибка */
function drawAdOverlay() {
  if (adMockT > 0) {
    ctx.fillStyle = 'rgba(2,8,14,0.85)';
    ctx.fillRect(0, 0, VW, VH);
    txt(T('adWatching'), VW / 2, VH / 2 - 12, '#ffd94a', 16, 'center');
    txt(adNote, VW / 2, VH / 2 + 10, '#7fd4e0', 8, 'center');
    const w = 160, k = 1 - adMockT / 1.2;
    bar(VW / 2 - w / 2, VH / 2 + 26, w, 4, k, '#ffd94a');
    return true;
  }
  if (adNoteT > 0) {
    ctx.globalAlpha = Math.min(1, adNoteT);
    txt(adNote, VW / 2, VH - 12, '#ffb454', 8, 'center');
    ctx.globalAlpha = 1;
  }
  return false;
}

/* ---------- покупка ---------- */
function buyProduct(id) {
  const pr = PRODUCTS[id];
  if (!PAYMENTS_ON || !pr || hasPerk(pr.perk)) return;
  if (!YA.ok || !YA.payments) { adToast(T('buyFail')); return; }
  YA.payments.purchase({ id })
    .then(() => {
      grantPerk(pr.perk);
      cloudSave(true);        /* покупка — повод записать прогресс сразу */
      /* Чек не гасим: товар постоянный и должен восстанавливаться
         через getPurchases на любом устройстве. */
    })
    .catch(() => adToast(T('buyFail')));
}

/* ------------------------------------------------------------
   Таблица рекордов. Доска с идентификатором LB.name создаётся в
   консоли разработчика; если её нет или игрок не авторизован —
   молча живём без неё, экран штаба просто покажет личный рекорд.
   ------------------------------------------------------------ */
const LB = { name: 'best', rank: 0, sent: -1, busy: false };

function lbSubmit(v) {
  v = Math.round(v || 0);
  if (!YA.ok || v <= LB.sent) return;
  LB.sent = v;
  try {
    YA.sdk.getLeaderboards()
      .then(lb => lb.setLeaderboardScore(LB.name, v))
      .catch(() => {});
  } catch (e) {}
}

function lbLoad() {
  if (!YA.ok || LB.busy) return;
  LB.busy = true;
  const done = () => { LB.busy = false; };
  try {
    YA.sdk.getLeaderboards().then(lb => {
      lb.getLeaderboardPlayerEntry(LB.name)
        .then(e => { LB.rank = (e && e.rank) || 0; done(); })
        .catch(done);
    }).catch(done);
  } catch (e) { done(); }
}

/* ---------- возрождение ---------- */
let reviveLeft = 1;

function canRevive() {
  return reviveLeft > 0 && !YA.busy && adMockT <= 0 &&
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
    addP({ x: player.x, y: player.y, life: 0.5, max: 0.5, type: 'ring', r: 26, col: '#4ade80' });
    SFX.evac();
  });
}
