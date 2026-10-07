'use strict';
/* ============================================================
   vkpsdk.js — VK Play: JS API площадки, язык, защита от второй
   вкладки.

   Замена ysdk.js / cgsdk.js в сборке для VK Play. Наружу торчат
   те же имена (adFullscreen, adRewarded, sdkGameplay, audioGate,
   cloudSave…), поэтому остальной код игры общий для всех сборок.

   Как VK Play запускает браузерную игру: игра лежит на хостинге
   разработчика, площадка открывает её в iFrame и дописывает к
   адресу параметры appid, uid, lang, currency, sign. По appid мы
   сами подключаем скрипт mailru.core.js и выполняем рукопожатие
   iframeApi — так требует чек-лист («JS скрипт подключен»).

   Чего у площадки нет для браузерных игр: рекламного API для
   разработчика. Рекламу вокруг игры показывает сама VK Play, а
   собственная реклама игры по правилам запрещена. Поэтому здесь
   ADS_ON = false: кнопки «за ролик» скрыты, возрождение бесплатное
   (один раз за уровень), межстраничной рекламы нет.

   Платежи у VK Play есть (paymentFrame), но донат пока выключен —
   PAYMENTS_ON = false.

   Требования чек-листа, закрытые в этом файле:
   • скрипт JS API подключается и проходит рукопожатие;
   • язык берётся из параметра lang площадки;
   • одновременный запуск из нескольких вкладок предотвращён.
   ============================================================ */

const ADS_ON = false;              /* у площадки нет рекламы для разработчика */
const PAYMENTS_ON = false;         /* платежи через paymentFrame — позже     */

const VKP = {
  api: null, ok: false,
  appid: '', uid: '',
  busy: false,                     /* совместимость с общим кодом            */
  paused: false,                   /* пауза (фокус, вкладка)                 */
  away: false,                     /* окно потеряло фокус                    */
  blocked: false                   /* игра открыта в другой вкладке          */
};
/* остальной код игры написан под имя YA — держим его же */
const YA = VKP;

const nowS = () => performance.now() / 1000;

/* параметры, которые VK Play дописывает к адресу игры */
function vkpParam(name) {
  try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
}

/* Единственное место, где трогается общая громкость: звук молчит,
   пока игра на паузе, окно не в фокусе или игра открыта в другой вкладке. */
function audioGate() {
  if (typeof master === 'undefined' || !master) return;
  master.gain.value = (VKP.busy || VKP.paused || VKP.away || VKP.blocked || muted) ? 0 : SETTINGS.volume;
}

/* заглушки демо-ролика: общему коду нужны эти имена */
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

/* ------------------------------------------------------------
   Подключение JS API. appid приходит в адресе; вне площадки его
   нет — тогда игра просто работает сама по себе.
   ------------------------------------------------------------ */
function sdkInit() {
  VKP.appid = vkpParam('appid');
  VKP.uid = vkpParam('uid');
  tabLockInit();
  if (!/^\d+$/.test(VKP.appid)) return;          /* не на площадке */

  const s = document.createElement('script');
  s.src = 'https://vkplay.ru/app/' + VKP.appid + '/static/mailru.core.js';
  s.onload = vkpHandshake;
  s.onerror = () => console.warn('[Архипелаг] Не удалось загрузить JS API VK Play');
  document.body.appendChild(s);
}
const ysdkInit = sdkInit;

function vkpHandshake() {
  if (typeof window.iframeApi !== 'function') return;
  /* Колбэки из документации VK Play. Авторизация и платежи игре пока
     не нужны, поэтому они пустые, но объявлены — API их ожидает. */
  const callbacks = {
    appid: +VKP.appid,
    getLoginStatusCallback: function () {},
    userInfoCallback: function () {},
    userProfileCallback: function () {},
    registerUserCallback: function () {},
    paymentFrameUrlCallback: function () {},
    getAuthTokenCallback: function () {},
    paymentReceivedCallback: function () {},
    paymentWindowClosedCallback: function () {},
    userConfirmCallback: function () {},
    paymentFrameItem: function () {},
    getGameInventoryItems: function () {}
  };
  try {
    window.iframeApi(callbacks).then(
      api => {
        VKP.api = api; VKP.ok = true;
        /* Список методов присылает страница vkplay.ru, а не скрипт —
           в документации рекламы нет, но если площадка её добавит,
           она появится здесь. Выводим список в консоль для проверки. */
        try {
          const names = [];
          for (const k in api) if (typeof api[k] === 'function') names.push(k);
          VKP.methods = names;
          console.log('[VK Play] методы API:', names.join(', '));
          const ad = names.filter(n => /(^ads?|[a-z]Ads?(?![a-z])|[Aa]dvert|[Rr]eward|[Bb]anner|[Ii]nterstit|[Pp]re[Rr]oll|[Mm]id[Rr]oll)/.test(n));
          console.log('[VK Play] похожие на рекламу:', ad.length ? ad.join(', ') : 'нет');
        } catch (e) {}
      },
      err => console.warn('[Архипелаг] JS API VK Play не подключился:', err)
    );
  } catch (e) { console.warn('[Архипелаг] iframeApi упал:', e); }
}

/* ------------------------------------------------------------
   Пауза по потере фокуса и сворачиванию — общий обработчик в
   input.js выставляет VKP.away; здесь то же для совместимости.
   ------------------------------------------------------------ */
let sdkAutoPaused = false;
function sdkPause(on) {
  if (VKP.paused === on) return;
  VKP.paused = on;
  audioGate();
  if (on) {
    if (state === 'play') { setState('pause'); sdkAutoPaused = true; }
  } else if (sdkAutoPaused) {
    sdkAutoPaused = false;
    if (state === 'pause') setState('play');
  }
}

/* разметки боя/меню и «happytime» у площадки нет */
function sdkGameplay() {}
const ysdkGameplay = sdkGameplay;
function sdkHappy() {}

/* облака у браузерных игр нет: прогресс в localStorage (settings.js) */
const CLOUD = { on: false, loaded: false, t: 0, dirty: false };
function cloudSave() {}
function cloudFlush() {}

/* ------------------------------------------------------------
   Реклама. Для браузерных игр у VK Play нет рекламного API
   разработчика, своя реклама запрещена правилами. Межстраничной
   нет вовсе, а единственное, что в других сборках шло «за ролик»
   и осталось в игре, — возрождение: здесь оно бесплатное.
   ------------------------------------------------------------ */
function adMute(on) { VKP.busy = on; audioGate(); }
function adFullscreen(done) { done && done(false); }
function adRewarded(onReward, onDone) { onReward && onReward(); onDone && onDone(); }
function adToast(text) { adNote = text; adNoteT = 2.2; }

/* таблиц рекордов нет — штаб покажет личный рекорд */
const LB = { name: 'best', rank: 0, sent: -1, busy: false };
function lbSubmit() {}
function lbLoad() {}

/* ------------------------------------------------------------
   Одна вкладка. Чек-лист VK Play требует не давать запустить игру
   одновременно в нескольких вкладках.

   Основной механизм — BroadcastChannel: новая вкладка спрашивает
   «есть кто?», открытая отвечает сразу, даже из фона (сообщения
   фоновым вкладкам доставляются, а игровой цикл там спит). Запасной
   для старых браузеров — отметка в localStorage раз в секунду по
   таймеру, а не по кадрам.

   Кнопка «играть здесь» забирает игру себе — остальные вкладки
   сразу уходят на экран «игра открыта в другой вкладке».
   ------------------------------------------------------------ */
const TAB_KEY = 'arhipelag.vkp.tab';
const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
let tabChan = null;

function tabRead() {
  try { return JSON.parse(localStorage.getItem(TAB_KEY) || 'null'); } catch (e) { return null; }
}
function tabWrite() {
  try { localStorage.setItem(TAB_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() })); } catch (e) {}
}
function tabSetBlocked(on) {
  if (VKP.blocked === on) return;
  VKP.blocked = on;
  if (on && state === 'play') setState('pause');
  audioGate();
}
function tabSend(type) {
  try { if (tabChan) tabChan.postMessage({ type: type, id: TAB_ID }); } catch (e) {}
}

function tabLockInit() {
  /* 1. запасной путь: свежая чужая отметка в хранилище */
  const other = tabRead();
  if (other && other.id !== TAB_ID && Date.now() - other.t < 3000) tabSetBlocked(true);
  else tabWrite();

  /* 2. основной путь: спрашиваем другие вкладки напрямую */
  if (typeof BroadcastChannel === 'function') {
    try {
      tabChan = new BroadcastChannel('arhipelag-vkp');
      tabChan.onmessage = e => {
        const m = e.data || {};
        if (!m.id || m.id === TAB_ID) return;
        if (m.type === 'hello' && !VKP.blocked) tabSend('here');  /* мы уже играем */
        else if (m.type === 'here') tabSetBlocked(true);          /* кто-то играет раньше нас */
        else if (m.type === 'take') tabSetBlocked(true);          /* игру забрали */
      };
      tabSend('hello');
    } catch (e) { tabChan = null; }
  }

  /* отметку обновляем таймером: в фоне он медленнее, но не спит, как кадры */
  setInterval(() => { if (!VKP.blocked) tabWrite(); }, 1000);

  addEventListener('storage', e => {
    if (e.key !== TAB_KEY) return;
    const v = tabRead();
    if (v && v.id !== TAB_ID && !VKP.blocked && tabChan === null) tabSetBlocked(true);
  });
  addEventListener('pagehide', () => {
    const v = tabRead();
    if (v && v.id === TAB_ID) { try { localStorage.removeItem(TAB_KEY); } catch (e) {} }
  });
}
function tabTick() {}                     /* всё делают таймер и канал */

/* игрок нажал «играть здесь» */
function tabTakeOver() {
  tabWrite();
  tabSend('take');
  tabSetBlocked(false);
  SFX.ui();
}
const tabBlocked = () => VKP.blocked;

/* ---------- тик из игрового цикла ---------- */
function updAds(dt) {
  tabTick(dt);
  if (adNoteT > 0) adNoteT -= dt;
}

/* поверх всего: экран «другая вкладка» и всплывающие подсказки */
function drawAdOverlay() {
  if (VKP.blocked) {
    ctx.fillStyle = 'rgba(2,8,14,0.93)';
    ctx.fillRect(0, 0, VW, VH);
    txt(T('tabBusy'), VW / 2, VH / 2 - 30, '#ffb454', 16, 'center', VW - 24);
    txt(T('tabBusy2'), VW / 2, VH / 2 - 4, '#9fc3d0', 8, 'center', VW - 24);
    if (Math.floor(tGlobal * 2) % 2)
      txt(T('tabHere'), VW / 2, VH / 2 + 22, '#4ade80', 8, 'center', VW - 24);
    return true;
  }
  if (adNoteT > 0) {
    ctx.globalAlpha = Math.min(1, adNoteT);
    txt(adNote, VW / 2, VH - 12, '#ffb454', 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
  }
  return false;
}

/* ---------- возрождение: бесплатное, один раз за уровень ---------- */
let reviveLeft = 1;

function canRevive() {
  return reviveLeft > 0 && !(curCfg.mission === 'convoy' && transport && transport.dead);
}
function tryRevive() {
  if (!canRevive()) { adToast(T('reviveNone')); return; }
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
