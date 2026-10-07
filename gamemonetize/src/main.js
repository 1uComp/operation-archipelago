'use strict';
/* ============================================================
   main.js — запуск уровней, главный цикл, обновление и вывод
   ============================================================ */

let bossKilled = false, bossTimer = 0;

function startLevel(idx) {
  level = idx;
  const L = makeLevel(idx);
  genWorld(L);
  initWeather(L);

  player = makePlayer();
  boss = null; bossKilled = false; bossTimer = 0;
  tornados = []; marines = []; squad = []; crew = []; landed = 0;
  subs = []; torps = []; charges = []; smokes = []; transport = null;
  smokeCD = 0; dcCD = 0; subPingT = rr(6, 12); convoyWarnT = 0;
  reviveLeft = 1; adAmmoT = 0;
  if (upg.msl && hasPerk('harp')) upg.ammo = Math.max(upg.ammo, 4);
  stealth = { meter: 0, lit: false, blown: false, warned: false };
  tornT = rr(5, 12); tornWarnT = 0;
  enemies = []; planes = []; shells = []; arcs = []; missiles = []; eMissiles = [];
  parts = []; lights = []; floats = []; pickups = []; hostages = []; msgs = []; wakes = [];

  kills = { ships:0, planes:0, bases:0, bunkers:0, mines:0 };
  rescued = 0; spawned = 0; destroyedBases = 0; playTime = 0; mCool = 0;
  alert = 0; combo = 0; comboT = 0; comboBest = 0; radarHacked = false;
  planeT = L.plane * 0.7; shipT = 6;
  winPend = false; shake = 0; hitStop = 0; flashScreen = 0;
  hints = { h:false, c:false, b:false };
  evReset();                 /* события боя и усиления — с нуля на каждом уровне */
  cam.x = player.x; cam.y = player.y; cam.z = cam.zt = camBase();

  for (let i = 0; i < L.enemies; i++) spawnEnemy();

  /* особые задачи уровня */
  if (L.mission === 'night') {
    const pool = shuffle(islands.slice());
    let left = L.prisoners, i = 0;
    while (left > 0 && i < pool.length) {
      const take = Math.min(left, ri(2, 3));
      left -= spawnHostages(pool[i], take, true);
      i++;
    }
  }
  if (L.mission === 'escort' && allyIsl) spawnMarines(allyIsl, L.marines);
  if (L.mission === 'convoy') {
    /* порт назначения — самый дальний от авианосца остров */
    const far = islands.slice().sort((a, b) =>
      dist(b.x, b.y, CARR.x, CARR.y) - dist(a.x, a.y, CARR.x, CARR.y))[0];
    if (far) {
      transport = makeTransport(far);
      transport.total = 0;
      let px = transport.x, py = transport.y;
      for (const w of transport.wp) { transport.total += dist(px, py, w.x, w.y); px = w.x; py = w.y; }
    }
  }

  banner = { main: T('stLevel') + ' ' + (idx + 1),
             sub: '«' + lvlName(idx) + '» • ' + T(missionKey(L.mission)), t: 3.6 };

  /* что выдал штаб на старте кампании: склад плюс надбавка за звание */
  if (idx === 0 && startGift && (startGift.cr || startGift.ammo)) {
    const g = [];
    if (startGift.cr) g.push(T('giftCr', startGift.cr));
    if (startGift.ammo) g.push(T('giftAmmo', startGift.ammo));
    msg(T('giftLine', g.join(' + ')), '#ffd94a', 4, 2.4);
    startGift = { cr: 0, ammo: 0 };
  }
  if (L.mission === 'night') {
    msg(T('objNight', spawned), '#ffd94a', 4, 0.8);
    msg(T('objNight2'), '#7fd4e0', 4, 5.2);
  } else if (L.mission === 'escort') {
    msg(T('objEscort', '«' + islName(allyIsl) + '»'), '#6fae5a', 4, 0.8);
    msg(T('objEscort2', '«' + islName(targetIsl) + '»'), '#7fd4e0', 4, 5.2);
  } else if (L.mission === 'convoy' && transport) {
    msg(T('objConvoy', T('transport'), '«' + islName(transport.dest) + '»'), '#4ade80', 4.5, 0.8);
    msg(T('objConvoy2'), '#ffb454', 4, 5.2);
  } else {
    msg(T('objAssault', totalBases), '#ffd94a', 4, 0.8);
  }
  if (L.tornado) msg(T('mTornado'), '#e5484d', 4, 12.0);
  if (L.subs) msg(T('mSubs'), '#7fd4e0', 3.5, 17.5);
  if (L.mines) msg(T('mMines'), '#e5484d', 3.5, 13.4);
  tutStart(idx);             /* обучение новичка на первой миссии */
  setState('play');
  if (runTrack) runSave();   /* снимок на случай перезагрузки страницы */
}

/* начать игру с заставки: недоигранную операцию поднимаем, иначе с нуля */
function startCampaign() {
  initAudio();
  runTrack = true;
  if (runPending() && runRestore()) return;
  resetAll();
  startLevel(0);
}

const missionKey = m => m === 'night' ? 'mTypeNight'
                      : m === 'escort' ? 'mTypeEscort'
                      : m === 'boss' ? 'mTypeBoss' : 'mTypeAssault';

/* сколько огневых точек осталось на острове-цели */
function targetLeft() {
  if (!targetIsl) return [0, 0];
  let left = 0, all = 0;
  for (const s of structs) {
    if (s.isl !== targetIsl || s.type === 'crate') continue;
    all++; if (!s.dead) left++;
  }
  return [all - left, all];
}

/* ---------- условия завершения уровня ---------- */
function checkLevelDone(dt) {
  if (boss && boss.dead) bossKilled = true;
  if (bossTimer > 0) { bossTimer -= dt; if (bossTimer <= 0 && !boss && !bossKilled) spawnBoss(); }
  const bossOk = !curCfg.boss || (bossKilled && !boss);
  const nothingPending = player.aboard === 0 && player.troops === 0 &&
        !hostages.some(h => h.state === 'wait' || h.state === 'swim');
  const m = curCfg.mission;
  const objOk = m === 'night'  ? (spawned > 0 && rescued >= spawned)
              : m === 'escort' ? allTargetStructsDead()
              : m === 'convoy' ? !!(transport && transport.done)
              : destroyedBases >= totalBases;

  /* цель выполнена — оставшихся заложников забирает вертолёт,
     чтобы не гонять катер через всю карту ради последней шлюпки */
  if (!winPend && objOk && bossOk && m !== 'night' &&
      (player.aboard || player.troops || hostages.some(h => h.state === 'wait' || h.state === 'swim')))
    heliEvac();

  /* транспорт на дне — задание сорвано */
  if (m === 'convoy' && transport && transport.dead && !winPend && state === 'play') {
    recordBest();
    setState('over');
    return;
  }

  if (!winPend && objOk && bossOk && nothingPending) {
    winPend = true; winT = 1.6;
    msg(T('mAllTargets'), '#4ade80', 3);
    score += Math.max(0, Math.floor(player.hp)) * 3;
  }
  if (winPend) {
    winT -= dt;
    if (winT <= 0) {
      let mul = curCfg.boss ? 2.5 : 1;
      if (curCfg.mission === 'night' && !stealth.blown) mul *= 1.6;   /* прошли тихо */
      const bonus = Math.round(ECON.levelBonus(level) * mul);
      money += bonus; score += Math.round(bonus * ECON.scoreMul);
      recordBest();
      sdkHappy();                       /* площадке: игроку сейчас хорошо */
      setState(curCfg.boss ? 'win' : 'levelclear');
    }
  }
}

/* лучший забег — показываем на заставке и на экране гибели */
function recordBest() {
  if ((SETTINGS.bestLevel || 0) < level + 1) SETTINGS.bestLevel = level + 1;
  if ((SETTINGS.bestScore || 0) < score) SETTINGS.bestScore = score;
  metaAddXp(score);                    /* счёт забега идёт в звание */
  lbSubmit(SETTINGS.bestScore);        /* и в таблицу рекордов площадки */
  saveSettings();
}

/* ---------- камера ---------- */
function updCamera(dt) {
  const P = player;
  /* небольшое упреждение в сторону прицела и хода */
  const aimX = clamp((mouse.x - VW / 2) * 0.28, -46, 46);
  const aimY = clamp((mouse.y - VH / 2) * 0.28, -30, 30);
  const velX = Math.cos(P.ang) * P.spd * 0.16;
  const velY = Math.sin(P.ang) * P.spd * 0.16;
  const tx = P.x + aimX + velX, ty = P.y + aimY + velY;
  cam.x = approach(cam.x, tx, 7, dt);
  cam.y = approach(cam.y, ty, 7, dt);
  const zb = camBase();                   /* 1 — компьютер, ближе — телефон */
  cam.zt = approach(cam.zt, zb, 3.5, dt);
  cam.z  = approach(cam.z, cam.zt, 12, dt);
  if (Math.abs(cam.z - zb) < 0.004) cam.z = zb;
}

/* ---------- обновление ---------- */
/* межстраничный ролик на переходе между попытками и уровнями */
function adThenLevel(n) {
  adFullscreen(() => startLevel(n));   /* колбэк придёт всегда: есть сторож */
}

function update(dt) {
  tGlobal += dt; stT += dt;
  updAds(dt);
  updCrate(dt);
  adAmmoT = Math.max(0, adAmmoT - dt);
  /* задания дня считаются по приросту счётчиков боя */
  if (state === 'play' || state === 'dying' || state === 'levelclear' ||
      state === 'over' || state === 'win') dqTick();
  /* пока крутится ролик или площадка держит паузу — мир стоит */
  if (YA.busy || adMockT > 0 || YA.paused) return;
  shake = Math.max(0, shake - shake * 6 * dt - 1.5 * dt);
  flashScreen = Math.max(0, flashScreen - dt * 2.2);

  if (state === 'title') {
    updParts(dt); updWakes(dt); updWeather(dt);
    const tt = tGlobal * 0.045;
    cam.x = (Math.sin(tt) * 0.5 + 0.5) * (WORLD.w - VW) + VW / 2;
    cam.y = (Math.sin(tt * 0.8 + 2) * 0.5 + 0.5) * (WORLD.h - VH) + VH / 2;
    titlePT -= dt;
    if (titlePT <= 0) { titlePT = rr(5, 9); titlePlanes.push({ x: -20, y: rr(30, 140), vx: rr(45, 70) }); }
    for (let i = titlePlanes.length - 1; i >= 0; i--) {
      titlePlanes[i].x += titlePlanes[i].vx * dt;
      if (titlePlanes[i].x > VW + 30) titlePlanes.splice(i, 1);
    }
    return;
  }
  if (state === 'hq') { updParts(dt); updWeather(dt); return; }
  if (state === 'pause' || state === 'settings' || state === 'crate') { setNoteT -= dt; return; }
  if (state === 'shop') { updParts(dt); updWeather(dt); shopMsgT -= dt; return; }
  if (state === 'levelclear') { updParts(dt); updFloats(dt); updWeather(dt); return; }
  if (state === 'over' || state === 'win') {
    updParts(dt); updFloats(dt); updWeather(dt);
    if (state === 'win') {
      fwT -= dt;
      if (fwT <= 0) {
        fwT = rr(0.3, 0.7);
        boom(ox + rr(60, VW - 60), oy + rr(40, VH - 80), 0.7, ['#4ade80', '#ffd94a', '#7fd4e0', '#ff9ad5']);
      }
    }
    return;
  }

  if (isPortrait()) { setState('pause'); return; }
  playTime += dt;
  banner.t -= dt;
  mCool -= dt;

  touchAutoAim();              /* телефон: автоприцел, пока правый палец свободен */
  updPlayer(dt);
  updStructs(dt);
  updEnemies(dt);
  updBoss(dt);
  updPlanes(dt);
  updShells(dt);
  updArcs(dt);
  updMissiles(dt);
  updEMissiles(dt);
  updMines(dt);
  updPickups(dt);
  updHostages(dt);
  updMarines(dt);
  updSquad(dt);
  updStealth(dt);
  updTornados(dt);
  updSubs(dt);
  updTorps(dt);
  updSmokes(dt);
  updCharges(dt);
  updTransport(dt);
  evTick(dt);
  tutTick(dt);
  updParts(dt);
  updWakes(dt);
  updFloats(dt);
  updMsgs(dt);
  updCombo(dt);
  updWeather(dt);
  updCamera(dt);

  /* тревога медленно растёт со временем боя */
  if (state === 'play') {
    const target = Math.min(3, Math.floor(destroyedBases) + (playTime > 150 ? 1 : 0));
    if (target > alert) alert = target;
    checkLevelDone(dt);
  }
}

/* ---------- вывод ---------- */
const isPortrait = () => touchMode() && innerHeight > innerWidth * 1.04;

const MENU_STATES = { title: 1, pause: 1, settings: 1, shop: 1, crate: 1, hq: 1,
                      levelclear: 1, over: 1, win: 1 };
let lastCursor = '';
function syncCursor() {
  const want = MENU_STATES[state] ? 'default' : 'none';
  if (want !== lastCursor) { lastCursor = want; cv.style.cursor = want; }
}

function render(dt) {
  syncCursor();
  uiFrame();                 /* кнопки кадра регистрируются заново */
  /* единицы разметки -> физические пиксели */
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  if (state === 'hq') { renderHQ(); }
  else if (state === 'crate') { renderCrate(); }
  else if (state === 'settings') { renderSettings(); }
  else if (state === 'title') { renderTitle(); }
  else if (state === 'shop') { renderShop(); }
  else if (state === 'levelclear') { renderLevelClear(); }
  else {
    drawScene(dt);
    if (state === 'play' || state === 'dying') drawHUD();
    if (state === 'pause') { drawHUD(); renderPause(); }
    if (state === 'over') renderEnd(false);
    if (state === 'win') renderEnd(true);
  }
  if (isPortrait()) renderRotateHint();
  drawAdOverlay();
}

/* ---------- масштабирование окна ---------- */
function resize() {
  const s = Math.min(innerWidth / PW, innerHeight / PH);
  cv.style.width  = Math.round(PW * s) + 'px';
  cv.style.height = Math.round(PH * s) + 'px';
}
addEventListener('resize', resize);
/* Выход из полноэкранного режима площадки: внутри iframe событие resize
   приходит не всегда или раньше, чем окно получит итоговый размер, —
   холст оставался полноэкранным, обрезался и игра казалась
   «приближенной». Пересчитываем при смене режима и сверяем размер окна. */
const refit = () => { resize(); setTimeout(resize, 120); setTimeout(resize, 500); };
document.addEventListener('fullscreenchange', refit);
document.addEventListener('webkitfullscreenchange', refit);
let fitW = 0, fitH = 0;
setInterval(() => {
  if (innerWidth !== fitW || innerHeight !== fitH) { fitW = innerWidth; fitH = innerHeight; resize(); }
}, 250);

/* ---------- старт ---------- */
ysdkInit();
applySettings();
metaBoot();                /* серия дней, задания дня, звание */
bindTouch();
try { window.focus(); } catch (e) {}      /* клавиатура — сразу игре, а не странице площадки */
resetAll();
startLevel(0);
setState('title');
msgs.length = 0;
banner.t = 0;
resize();
/* первый заход за сутки — сразу показываем штаб с невыданным пайком */
if (META.ready) openHQ('title');

let last = performance.now();
function frame(t) {
  let dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }   /* стоп-кадр на мощных попаданиях */
  update(dt);
  render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
