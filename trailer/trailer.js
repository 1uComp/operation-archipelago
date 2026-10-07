'use strict';
/* ============================================================
   trailer.js — запись роликов из настоящей игры.

   Загружает код версии для CrazyGames, выключает весь интерфейс
   (HUD, надписи, всплывающие цифры, полоски жизни) и прогоняет
   сценарий из шести сцен с автопилотом катера и «операторской»
   камерой. Кадры считаются с постоянным шагом времени (не зависит
   от скорости компьютера), кодируются в H.264 через WebCodecs
   и отправляются на tools/trailer/server.py, который собирает MP4.

   Параметры адреса:
     fmt  = land (1920x1080) | p23 (1080x1620) | p916 (1080x1920)
     name = имя файла, go = 1 — сразу писать
   ============================================================ */

const Q = new URLSearchParams(location.search);
const FMT_NAME = Q.get('fmt') || 'land';
const FMTS = { land: [480, 270], p23: [270, 405], p916: [270, 480] };
const [FW, FH] = FMTS[FMT_NAME] || FMTS.land;
const PORTRAIT = FH > FW;
const FPS = 30, SUBSTEPS = 2;                   /* 2 шага физики на кадр; SUB занято подлодками */
const OUT_NAME = Q.get('name') || ('trailer_' + FMT_NAME);

/* Фиксированное зерно случайности: мир, враги и взрывы в каждой записи
   одни и те же — проверенный ролик воспроизводится один в один. */
const SEED = +(Q.get('seed') || 20260928);
Math.random = (function (a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
})(SEED);

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += '\n' + a.join(' '); };

/* ---------- виртуальное время ----------
   Взрывы босса и цепочки bigBoom в игре завязаны на setTimeout.
   При покадровой записи реальное время идёт иначе, поэтому таймеры
   переводим на время ролика: каждый взрыв встанет ровно на свой кадр. */
const realTimeout = window.setTimeout.bind(window);
let VT = 0;
let vtimers = [];
window.setTimeout = (fn, ms) => { vtimers.push({ at: VT + (ms || 0) / 1000, fn }); return vtimers.length; };
function runTimers() {
  const due = vtimers.filter(t => t.at <= VT);
  if (!due.length) return;
  vtimers = vtimers.filter(t => t.at > VT);
  for (const t of due) { try { t.fn(); } catch (e) { console.error(e); } }
}
window.requestAnimationFrame = () => 0;          /* свой цикл кадров — ниже */

/* настройки игры до загрузки: телефонное управление (автоприцел),
   без обучения, без звука */
localStorage.setItem('arhipelag.cg.settings.v1', JSON.stringify({
  lang: 'en', langSet: true, controls: 'touch', quality: 4, sound: false, music: false,
  volume: 0, shake: true, crt: false, diff: 'normal', played: true, tutDone: true
}));

/* ---------- загрузка кода игры с правками для записи ---------- */
function patchSrc(path, code) {
  if (path.endsWith('core/config.js')) {
    code = code.replace('const VW = 480, VH = 270;', 'const VW = ' + FW + ', VH = ' + FH + ';');
    code = code.replace('const SC = SETTINGS.quality;', 'const SC = 4;');
  }
  if (path.endsWith('src/main.js'))
    code = code.replace(/const isPortrait = \(\) => [^;]+;/, 'const isPortrait = () => false;');
  if (path.endsWith('gfx/scene.js')) {
    /* метки над заложниками, полоски прочности построек, круги-прицелы
       бомб — это подсказки интерфейса, в ролике только сама игра */
    code = code.replace("if (h.state === 'wait' && Math.floor(tGlobal * 2) % 2) {", 'if (false) {');
    code = code.replace("if (s.hp < s.max && s.type !== 'crate') {", 'if (false) {');
    code = code.replace('    if (t > 0.5) {', '    if (false) {');
  }
  return code;
}
async function loadGame() {
  const html = await (await fetch('/crazygames/index.html', { cache: 'no-store' })).text();
  const srcs = [...html.matchAll(/<script src="(src\/[^"?]+)[^"]*"><\/script>/g)].map(m => m[1]);
  for (const s of srcs) {
    const code = patchSrc(s, await (await fetch('/crazygames/' + s, { cache: 'no-store' })).text());
    const el = document.createElement('script');
    el.textContent = code + '\n//# sourceURL=game/' + s;
    document.head.appendChild(el);
  }
  /* без интерфейса и надписей — только игра */
  window.drawHUD = () => {};
  window.addFloat = () => {};
  window.msg = () => {};
  window.hpBar = () => {};
  window.drawAdOverlay = () => {};
  window.updCamera = () => {};
  window.vfxPerf = () => {};
  window.tutTick = () => {};
  window.evTick = dt => updBuffs(dt);
  window.touchBoosting = () => DIR.boost;
  FXQ = 1;
  log('игра загружена, кадр ' + PW + 'x' + PH);
}

/* ---------- режиссёр ---------- */
const DIR = { boost: false };
let shotT = 0;

function keepAlive() {
  if (state !== 'play') setState('play');
  YA.paused = false; YA.busy = false; YA.away = false;
  banner.t = 0;
  if (player) { player.hp = player.maxhp; player.dead = false; }
  shipT = 999; planeT = 999;                   /* подкрепления — только по сценарию */
  msgs.length = 0; floats.length = 0;
  flashScreen = Math.min(flashScreen, 0.12);   /* без белой засветки всего кадра */

  lightFlash = Math.min(lightFlash, 0.3);
}
function steerTo(x, y, thr) {
  const a = Math.atan2(y - player.y, x - player.x);
  tMove.active = true; tMove.dx = Math.cos(a); tMove.dy = Math.sin(a);
  tMove.mag = 0.14 + 0.6 * (thr === undefined ? 1 : thr);
}
function steerAng(a, thr) { steerTo(player.x + Math.cos(a) * 100, player.y + Math.sin(a) * 100, thr); }
/* кружить вокруг точки на радиусе r (dir = ±1) */
function orbit(cx, cy, r, dir, thr) {
  const a = Math.atan2(player.y - cy, player.x - cx);
  const d = dist(player.x, player.y, cx, cy);
  const tang = a + dir * Math.PI / 2 + clamp((d - r) / r, -0.6, 0.6) * dir;
  steerAng(tang, thr);
}
/* ручной прицел в точку мира (для ракет по базе) */
function aimAt(x, y, fire) {
  tAim.id = 99;
  mouse.x = (x - ox) * cam.z; mouse.y = (y - oy) * cam.z; mouse.down = !!fire;
}
function autoAim() { tAim.id = -1; }
/* свободная вода рядом с точкой, предпочтительно в направлении pref */
function waterNear(x, y, d, pref) {
  for (let k = 0; k < 36; k++) {
    const a = pref + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.18;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    let ok = px > 60 && py > 60 && px < WORLD.w - 60 && py < WORLD.h - 60;
    for (let r = 0; ok && r < 40; r += 8) ok = isWater(px + Math.cos(a) * r, py + Math.sin(a) * r) && isWater(px, py);
    if (ok) return { x: px, y: py, a };
  }
  return { x: x + Math.cos(pref) * d, y: y + Math.sin(pref) * d, a: pref };
}
/* открытая вода; если задан курс — с запасом хода по нему (не упрёмся в край мира) */
function openWater(dirAng, run) {
  for (let t = 0; t < 600; t++) {
    const x = rr(300, WORLD.w - 300), y = rr(300, WORLD.h - 300);
    let ok = dist(x, y, CARR.x, CARR.y) > 300;
    if (ok && dirAng !== undefined) {
      const ex = x + Math.cos(dirAng) * run, ey = y + Math.sin(dirAng) * run;
      ok = ex > 250 && ex < WORLD.w - 250 && ey > 250 && ey < WORLD.h - 250;
    }
    for (const i of islands) if (ok && dist(x, y, i.x, i.y) < i.r * 1.4 + 170) ok = false;
    if (ok) return { x, y };
  }
  return { x: 1300, y: 1000 };
}
function newWorld(n) {
  runTrack = false; resetAll(); state = 'title';
  startLevel(n);
  setState('play');
  enemies.length = 0; planes.length = 0; hostages.length = 0; mines.length = 0;
  shells.length = 0; arcs.length = 0; eMissiles.length = 0; tornados.length = 0;
  upg.msl = 1; upg.ammo = 99; upg.pd = 2; upg.rate = 3; upg.dmg = 2; upg.eng = 2; upg.boost = 3;
  player.maxhp = player.hp = 99999;
}
function enemyAt(type, x, y, ang, hp) {
  const e = evShip(type, x, y, ang || 0);      /* корабль прямо в точке (events.js) */
  e.state = 'fight';
  if (hp !== undefined) e.hp = hp;
  return e;
}

/* камера: цель и сглаживание; при склейке — прыжок */
const CAM = { x: 0, y: 0, z: 1.2, snap: true };
function camTo(x, y, z) {
  if (CAM.snap) { cam.x = x; cam.y = y; cam.z = cam.zt = z; CAM.snap = false; return; }
  cam.x += (x - cam.x) * 0.12; cam.y += (y - cam.y) * 0.12;
  cam.z += (z - cam.z) * 0.08; cam.zt = cam.z;
}
const ZK = 1;
/* Кадр по двум точкам: катер и цель сцены. Центр — между ними (bias —
   доля пути к цели), зум — такой, чтобы обе точки с запасом влезли
   в кадр, но не мельче zmin и не крупнее zmax. */
function camPair(bx, by, zmax, zmin, bias) {
  const P = player, k = bias === undefined ? 0.5 : bias;
  const cx = P.x + (bx - P.x) * k, cy = P.y + (by - P.y) * k;
  const dx = Math.abs(bx - P.x) * 2 * Math.max(k, 1 - k) + 70;
  const dy = Math.abs(by - P.y) * 2 * Math.max(k, 1 - k) + 70;
  const z = clamp(Math.min(VW * 0.86 / dx, VH * 0.86 / dy), zmin, zmax);
  camTo(cx, cy, z);
}
/* Страж: катер никогда не ближе 15% к краю кадра — что бы ни хотела сцена */
const SAFE = 0.64;
function keepBoat() {
  const hw = VW / cam.z / 2, hh = VH / cam.z / 2;
  cam.x = clamp(cam.x, player.x - hw * SAFE, player.x + hw * SAFE);
  cam.y = clamp(cam.y, player.y - hh * SAFE, player.y + hh * SAFE);
}
/* контроль качества: где катер на экране и не закрыт ли вспышкой */
const QA = [];
function qaFrame(si) {
  const q = QA[si] || (QA[si] = { minEdge: 1e9, nearEdge: 0, covered: 0, frames: 0, minPx: 1e9 });
  const px = (player.x - ox) * cam.z, py = (player.y - HUMAN_LIFT * 0 - oy) * cam.z;
  const edge = Math.min(px, VW - px, py, VH - py);
  q.frames++;
  q.minEdge = Math.min(q.minEdge, edge);
  if (edge < VW * 0.08) q.nearEdge++;
  q.minPx = Math.min(q.minPx, 24 * cam.z * SC);             /* длина катера в пикселях видео */
  for (const pp of parts) {
    if ((pp.type === 'flash' || pp.type === 'glow') && pp.life / pp.max > 0.5 && (pp.size || 0) > 10 &&
        dist(pp.x, pp.y, player.x, player.y) < 10) { q.covered++; break; }
  }
}

/* ---------- сцены ---------- */
const SHOTS = [
  { /* 1. катер на форсаже проносится мимо тропического острова */
    dur: 3.2,
    setup() {
      newWorld(0);
      /* крупный остров, вокруг которого есть простор: катер на дуге не упрётся в край мира */
      const room = i => Math.min(i.x, i.y, WORLD.w - i.x, WORLD.h - i.y) - (i.r * 1.25 + 40);
      const I = islands.slice().filter(i => room(i) > 260).sort((a, b) => b.rAvg - a.rAvg)[0] ||
                islands.slice().sort((a, b) => room(b) - room(a))[0];
      this.I = I;
      /* в вертикали идём вверх вдоль западного берега — по длинной стороне кадра */
      const a0 = PORTRAIT ? Math.PI : Math.PI * 0.35;
      const p = waterNear(I.x, I.y, PORTRAIT ? I.r * 1.12 + 30 : I.r * 1.25 + 40, a0);
      player.x = p.x; player.y = p.y;
      this.dir = 1;
      player.ang = PORTRAIT ? -Math.PI / 2 : p.a + Math.PI / 2; player.spd = 150;
      /* впереди-сбоку уходит вражеский катер: наш нагоняет и топит его */
      /* враг не на одной линии с катером и достаточно далеко: тонет на дистанции,
         а не взрывается у катера на носу */
      const fa = player.ang, sd = PORTRAIT ? 1 : -1, ahead = PORTRAIT ? 140 : 95, side = PORTRAIT ? 38 : 28;
      const ch = enemyAt('patrol', player.x + Math.cos(fa) * ahead + Math.cos(fa + Math.PI / 2) * side * sd,
                         player.y + Math.sin(fa) * ahead + Math.sin(fa + Math.PI / 2) * side * sd, fa,
                         PORTRAIT ? 170 : 260);
      this.ch = ch;
      ch.route = { x: ch.x + Math.cos(fa) * 900, y: ch.y + Math.sin(fa) * 900 }; ch.routeSpd = PORTRAIT ? 115 : 70;
      this.head = fa;                            /* прямой курс вдоль берега */
      CAM.snap = true;
    },
    ctrl(t) {
      DIR.boost = true;
      const I = this.I, R = I.r * 1.25 + 40;
      if (PORTRAIT) steerAng(this.head, 1);
      else {
        /* в горизонтали оба идут дугой вдоль берега — остров не уходит из кадра */
        orbit(I.x, I.y, R, 1, 1);
        if (enemies.includes(this.ch)) {
          const a = Math.atan2(this.ch.y - I.y, this.ch.x - I.x) + 0.55;
          this.ch.route = { x: I.x + Math.cos(a) * R, y: I.y + Math.sin(a) * R };
        }
      }
      if (enemies.includes(this.ch)) aimAt(this.ch.x, this.ch.y, true); else autoAim();
    },
    cam(t) {
      /* в кадре и катер, и остров с пальмами — открывающий кадр ролика */
      const P = player, I = this.I;
      if (PORTRAIT) {
        /* в вертикали в кадре катер, враг впереди и берег острова сбоку */
        const c = enemies.includes(this.ch) ? this.ch : { x: P.x, y: P.y - 60 };
        const a = Math.atan2(P.y - I.y, P.x - I.x);
        const shore = { x: I.x + Math.cos(a) * I.r * 0.75, y: I.y + Math.sin(a) * I.r * 0.75 };
        camPair((c.x + shore.x) / 2, (c.y + shore.y) / 2, 1.45, 1.0, 0.5);
      } else camPair(P.x + (I.x - P.x) * 0.7, P.y + (I.y - P.y) * 0.7, 1.5, 1.1, 0.5);
    }
  },
  { /* 2. бой с тремя кораблями: катер кружит, корабли взрываются */
    dur: 4.0,
    setup() {
      const W = openWater();
      player.x = W.x; player.y = W.y; player.ang = 0; player.spd = 120;
      enemies.length = 0; shells.length = 0;
      this.c = { x: W.x + 70, y: W.y + (PORTRAIT ? -40 : 0) };
      this.e = [
        enemyAt('gun', this.c.x + 60, this.c.y - 30, 3.0, 26),
        enemyAt('gun', this.c.x + 20, this.c.y + 55, 3.6, 70),
        enemyAt('patrol', this.c.x - 30, this.c.y - 60, 2.0, 999)
      ];
      CAM.snap = true;
    },
    ctrl(t) {
      DIR.boost = t > 0.4 && t < 2.6;
      orbit(this.c.x, this.c.y, 85, 1, 1);
      autoAim();
      /* второй корабль добиваем ракетой в середине сцены */
      if (Math.abs(t - 1.9) < 0.02 && enemies.includes(this.e[1])) { this.e[1].hp = 8; fireMissile(); }
    },
    cam(t) {
      const alive = enemies.filter(e => dist(e.x, e.y, player.x, player.y) < 260);
      let x = this.c.x, y = this.c.y;
      if (alive.length) { x = 0; y = 0; for (const e of alive) { x += e.x; y += e.y; } x /= alive.length; y /= alive.length; }
      camPair(x, y, 1.55, 1.1, 0.45);
    }
  },
  { /* 3. ракетный удар по базе на острове */
    dur: 3.8,
    setup() {
      const bases = structs.filter(s => s.type === 'base' && !s.dead);
      const B = bases[0];
      this.B = B;
      const out = Math.atan2(B.y - B.isl.y, B.x - B.isl.x);
      const pref = PORTRAIT ? Math.PI / 2 : (Math.cos(out) >= 0 ? 0 : Math.PI);
      const p = waterNear(B.isl.x, B.isl.y, B.isl.r * 1.2 + 70, pref);
      player.x = p.x; player.y = p.y;
      player.ang = Math.atan2(B.y - p.y, B.x - p.x); player.spd = 60;
      enemies.length = 0; shells.length = 0;
      B.hp = 38 * 3.5;
      for (const s of structs) if (s.isl === B.isl && s.type === 'bunker') s.hp = 30;
      this.next = 0.25;
      CAM.snap = true;
    },
    ctrl(t) {
      DIR.boost = false;
      steerTo(this.B.x, this.B.y, 0.25);
      aimAt(this.B.x, this.B.y, true);
      if (t >= this.next && t < 2.2) { fireMissile(); this.next = t + 0.3; }
    },
    cam(t) {
      camPair(this.B.x, this.B.y, 1.5, 1.05, 0.5);
    }
  },
  { /* 4. шторм: авианалёт, бомбы, молния, сбитый самолёт */
    dur: 2.8,
    setup() {
      newWorld(1);
      const heading = PORTRAIT ? -Math.PI / 2 : 0;
      const W = openWater(heading, 700);
      player.x = W.x; player.y = W.y; player.ang = heading; player.spd = 150;
      planes.length = 0;
      const fwd = player.ang;
      this.fwd = fwd;
      /* звено из четырёх идёт навстречу и проходит прямо над катером */
      const F = [[-45, 0, false], [0, -25, true], [45, 0, false], [90, 25, false]];
      F.forEach(([side, back, heavy], i) => {
        spawnPlane(heavy);
        const p = planes[planes.length - 1];
        p.x = player.x + Math.cos(fwd) * (330 + back) - Math.sin(fwd) * side;
        p.y = player.y + Math.sin(fwd) * (330 + back) + Math.cos(fwd) * side;
        p.ang = fwd + Math.PI; p.spd = 125;
        p.hp = i === 1 || i === 3 ? 900 : 14;
        const ahead = 170 + i * 12;
        p.dp = { x: player.x + Math.cos(fwd) * ahead - Math.sin(fwd) * side * 0.4,
                 y: player.y + Math.sin(fwd) * ahead + Math.cos(fwd) * side * 0.4 };
      });
      this.flash = false;
      CAM.snap = true;
    },
    ctrl(t) {
      DIR.boost = true;
      steerAng(this.fwd + Math.sin(t * 2.4) * 0.45, 1);            /* зигзаг между разрывами */
      autoAim();
      if (!this.flash && t > 0.9) { this.flash = true; lightFlash = 0.3; }
    },
    cam(t) {
      const P = player;
      /* в кадре катер и ближайший самолёт звена; когда звено прошло — чуть впереди катера */
      let tgt = null, bd = 260;
      for (const pl of planes) { const d = dist(pl.x, pl.y, P.x, P.y); if (d < bd) { bd = d; tgt = pl; } }
      if (tgt) camPair(tgt.x, tgt.y, 1.45, 1.05, 0.45);
      else camPair(P.x + Math.cos(this.fwd) * 90, P.y + Math.sin(this.fwd) * 90, 1.45, 1.05, 0.5);
    }
  },
  { /* 5. дуэль с линкором */
    dur: 3.8,
    setup() {
      /* солнечные тропики вместо тёмных джунглей: бури хватает в сцене 4 */
      newWorld(9);
      curCfg.bossKind = 'leviathan';
      const W = openWater();
      player.x = W.x; player.y = W.y; player.ang = 0; player.spd = 130;
      spawnBoss();
      boss.x = W.x + (PORTRAIT ? 30 : 150); boss.y = W.y + (PORTRAIT ? -170 : -30);
      boss.ang = Math.atan2(player.y - boss.y, player.x - boss.x) + 1.2;
      boss.hp = boss.max = 99999;
      boss.cool = 0.4; boss.saloCool = 0.8;
      this.next = 0.3;
      CAM.snap = true;
    },
    ctrl(t) {
      DIR.boost = t > 0.5;
      orbit(boss.x, boss.y, 135, -1, 1);
      autoAim();
      if (t >= this.next) { mouse.x = (boss.x - ox) * cam.z; mouse.y = (boss.y - oy) * cam.z; fireMissile(); this.next = t + 0.45; }
    },
    cam(t) {
      camPair(boss.x, boss.y, 1.4, 0.95, 0.5);
    }
  },
  { /* 6. линкор взрывается; катер уходит на форсаже */
    dur: 2.2,
    setup() {
      this.bx = boss.x; this.by = boss.y;
      boss.hp = 0;
    },
    ctrl(t) {
      DIR.boost = true;
      orbit(this.bx, this.by, 115, -1, 1);
      autoAim();
    },
    cam(t) {
      camPair(this.bx, this.by, 1.4, 0.95, 0.55);
    }
  }
];

/* ---------- кодирование H.264 (WebCodecs) ---------- */
const CODECS = ['avc1.640033', 'avc1.64002A', 'avc1.4D002A', 'avc1.42002A'];
async function makeEncoder(w, h) {
  let cfg = null;
  for (const codec of CODECS) {
    const c = { codec, width: w, height: h, bitrate: 14_000_000, framerate: FPS,
                avc: { format: 'avc' }, latencyMode: 'quality', hardwareAcceleration: 'no-preference' };
    try { const s = await VideoEncoder.isConfigSupported(c); if (s.supported) { cfg = c; break; } } catch (e) {}
  }
  if (!cfg) throw new Error('H.264 в WebCodecs не поддерживается');
  const R = { chunks: [], desc: null, cfg };
  R.enc = new VideoEncoder({
    output: (chunk, md) => {
      if (md && md.decoderConfig && md.decoderConfig.description && !R.desc)
        R.desc = new Uint8Array(md.decoderConfig.description.slice ? md.decoderConfig.description.slice(0) : md.decoderConfig.description);
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      R.chunks.push({ buf, key: chunk.type === 'key', ts: chunk.timestamp });
    },
    error: e => log('ОШИБКА кодека: ' + e.message)
  });
  R.enc.configure(cfg);
  return R;
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

async function upload(R, w, h) {
  const timescale = 90000, dur = timescale / FPS;
  /* кадры идут в порядке декодирования; B-кадров быть не должно */
  for (let i = 1; i < R.chunks.length; i++)
    if (R.chunks[i].ts < R.chunks[i - 1].ts) throw new Error('кодек выдал B-кадры — нужен ctts');
  const meta = { w, h, timescale, desc: b64(R.desc), samples: R.chunks.map(c => [c.buf.length, c.key ? 1 : 0, dur]) };
  const mj = new TextEncoder().encode(JSON.stringify(meta));
  const total = 4 + mj.length + R.chunks.reduce((a, c) => a + c.buf.length, 0);
  const body = new Uint8Array(total);
  new DataView(body.buffer).setUint32(0, mj.length, true);
  body.set(mj, 4);
  let o = 4 + mj.length;
  for (const c of R.chunks) { body.set(c.buf, o); o += c.buf.length; }
  const r = await fetch('/mp4?name=' + encodeURIComponent(OUT_NAME), { method: 'POST', body });
  return r.json();
}
async function postPng(name) {
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const r = await fetch('/png?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return r.json();
}

/* ---------- прогон ---------- */
function stepFrame(shot) {
  for (let k = 0; k < SUBSTEPS; k++) {
    let dt = 1 / (FPS * SUBSTEPS);
    VT += dt; runTimers();
    shot.ctrl.call(shot, shotT);
    keepAlive();
    /* стоп-кадр на мощных взрывах — как в игре: мгновение «замедления» */
    if (hitStop > 0) { hitStop -= dt; dt *= 0.2; }
    update(dt);
    shotT += 1 / (FPS * SUBSTEPS);
  }
  shot.cam.call(shot, shotT);
  keepBoat();
  /* вспышка попадания рисуется диском поверх корабля — в ролике только намёк;
     гасим после хода игры, прямо перед отрисовкой */
  for (const e of enemies) e.flash = Math.min(e.flash, 0.02);
  if (boss) boss.flash = Math.min(boss.flash, 0.02);
  render(1 / FPS);
}

async function run() {
  await loadGame();
  const total = SHOTS.reduce((a, s) => a + s.dur, 0);
  log('сценарий: ' + SHOTS.length + ' сцен, ' + total.toFixed(1) + ' с, формат ' + FMT_NAME);
  const R = await makeEncoder(PW, PH);
  log('кодек ' + R.cfg.codec);
  let frame = 0;
  const stills = [];
  for (let si = 0; si < SHOTS.length; si++) {
    const S = SHOTS[si];
    shotT = 0;
    S.setup.call(S);
    /* короткий прогрев без записи: частицы, след, камера встают на место */
    /* прогрев без записи: след, скорость и частицы уже на месте;
       у первой сцены дольше — это стартовый кадр ролика */
    const warm = si === 0 ? 24 : 6;
    for (let i = 0; i < warm; i++) stepFrame(S);
    shotT = 0;
    const n = Math.round(S.dur * FPS);
    for (let i = 0; i < n; i++) {
      stepFrame(S);
      qaFrame(si);
      const vf = new VideoFrame(cv, { timestamp: Math.round(frame * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      R.enc.encode(vf, { keyFrame: frame % FPS === 0 });
      vf.close();
      if (i === Math.floor(n * 0.6)) stills.push(postPng(OUT_NAME + '_s' + (si + 1)));
      frame++;
      while (R.enc.encodeQueueSize > 4) await new Promise(r => realTimeout(r, 1));
      if (frame % 30 === 0) { logEl.textContent = logEl.textContent.replace(/\nкадр .*$/, '') + '\nкадр ' + frame; await new Promise(r => realTimeout(r, 0)); }
    }
  }
  await R.enc.flush();
  await Promise.all(stills);
  window.__qa = QA.map((q, i) => ({ shot: i + 1, frames: q.frames, minEdgePct: +(q.minEdge / Math.min(VW, VH) * 100).toFixed(1),
                                     nearEdge: q.nearEdge, covered: q.covered, boatPx: Math.round(q.minPx) }));
  log('проверка: ' + JSON.stringify(window.__qa));
  const res = await upload(R, PW, PH);
  log('ГОТОВО: ' + JSON.stringify(res));
  window.__done = res;
}

if (Q.get('go') === '1') run().catch(e => { log('ОШИБКА: ' + e.message + '\n' + e.stack); window.__done = { ok: false, error: e.message }; });
else loadGame();
