'use strict';
/* ============================================================
   events.js — события боя и временные усиления.

   Штурм баз сам по себе однообразен, поэтому раз в полминуты
   в бою что-то происходит: самолёт сбрасывает контейнер (и враг
   идёт наперегонки), на охоту выходит вражеский ас с наградой за
   голову, в воде ждёт сбитый лётчик, мимо идёт караван барж,
   налетает авиазвено или всплывает рассыпанный груз. У каждого
   события свой таймер и награда — поводы свернуть с маршрута.

   Усиления (тройной залп, скорострельность, щит, нитро) выпадают
   из контейнеров, с аса и изредка с обычных кораблей.
   ============================================================ */

/* ---------- усиления ---------- */
const BUFFS = {
  triple: { dur: 12, col: '#ffd94a', key: 'bfTriple' },
  rapid : { dur: 10, col: '#ff8b3d', key: 'bfRapid' },
  shield: { dur: 8,  col: '#7fd4e0', key: 'bfShield' },
  nitro : { dur: 12, col: '#4ade80', key: 'bfNitro' }
};
const BUFF_IDS = Object.keys(BUFFS);
let buffs = { triple: 0, rapid: 0, shield: 0, nitro: 0 };
const buffOn = id => buffs[id] > 0;

function giveBuff(id, x, y) {
  const B = BUFFS[id];
  buffs[id] = Math.max(buffs[id], B.dur);
  addFloat(x, y - 10, T(B.key), B.col);
  msg(T('bfGot', T(B.key), B.dur), B.col, 2.5);
  addP({ x, y, life: 0.45, max: 0.45, type: 'ring', r: 18, col: B.col });
  addLight(x, y, 60, B.col, 0.5);
  SFX.buy();
}
function dropBuff(x, y, id) {
  pickups.push({ x, y, type: 'buff', kind: id || pick(BUFF_IDS), ph: rr(0, TAU), life: 22 });
}

/* щит гасит попадание целиком */
function shieldHit() {
  addP({ x: player.x, y: player.y, life: 0.25, max: 0.25, type: 'ring', r: 15, col: '#9fe8ff' });
  SFX.clang();
}

function updBuffs(dt) {
  for (const id of BUFF_IDS) if (buffs[id] > 0) buffs[id] = Math.max(0, buffs[id] - dt);
  if (buffs.nitro > 0 && player && !player.dead) { player.boostE = boostMax(); player.boostLock = 0; }
}

/* ---------- спрайты событий ---------- */
const sprBarge = makeShip(26, 5, { out: '#14100c', hull: '#6b5a44', dk: '#3f3326', deck: '#574838',
                                   acc: '#ffb454', lit: '#8a7658', glass: '#e0c890' }, {});
const sprPlaneF = makePlane({ body: '#50663f', lit: '#7f9868', acc: '#4ade80' }, 21);

SHIP_TYPES.barge = { name: 'БАРЖА', hp: 1.5, spd: 36, turn: 1.0, rng: 0, cd: [99, 99], dmg: 0,
                     salvo: 0, reward: 170, r: 9, radar: 0 };
SHIP_SPR.barge = sprBarge;

/* ---------- события ---------- */
const EV_COL = '#c07bff';                 /* цвет событий: стрелки, радар, рамка */
const EV_KINDS = ['drop', 'ace', 'pilot', 'cargo', 'raid', 'loot'];
const EV_QUIET = { drop: 1, pilot: 1, loot: 1 };   /* подходят для тихой ночной фазы */
let ev = null, evT = 0, evLast = '', evN = 0;

function evReset() {
  ev = null; evN = 0; evLast = '';
  evT = rr(18, 24);
  buffs = { triple: 0, rapid: 0, shield: 0, nitro: 0 };
}

/* свободная вода на расстоянии d0..d1 от катера */
function evSpot(d0, d1, from) {
  from = from || player;
  for (let t = 0; t < 80; t++) {
    const a = rr(0, TAU), d = rr(d0, d1);
    const x = from.x + Math.cos(a) * d, y = from.y + Math.sin(a) * d;
    if (x < 60 || x > WORLD.w - 60 || y < 60 || y > WORLD.h - 60) continue;
    if (!isWater(x, y) || !isWater(x + 16, y) || !isWater(x - 16, y) ||
        !isWater(x, y + 16) || !isWater(x, y - 16)) continue;
    if (dist(x, y, CARR.x, CARR.y) < 150) continue;
    return { x, y };
  }
  return null;
}

function nearestIsl(x, y) {
  let best = islands[0], bd = 1e9;
  for (const i of islands) { const d = dist(x, y, i.x, i.y); if (d < bd) { bd = d; best = i; } }
  return best;
}

/* корабль события в заданной точке (spawnEnemy ставит только у островов) */
function evShip(type, x, y, ang) {
  const ST = SHIP_TYPES[type];
  const hp = curCfg.eHp * ST.hp * diff().hp;
  const e = { type, T: ST, x, y, ang: ang || 0, spd: 0, hp, max: hp, state: 'patrol',
              isl: nearestIsl(x, y), wa: rr(0, TAU), cool: rr(1, 2), flash: 0, smk: 0,
              roll: 0, wakeT: 0, alertT: 0 };
  enemies.push(e);
  return e;
}

/* корабль с маршрутом идёт к точке и не ввязывается в бой (см. updEnemies) */
function evSteer(e, dt) {
  const r = e.route;
  const d = dist(e.x, e.y, r.x, r.y);
  e.ang += clamp(angDiff(e.ang, Math.atan2(r.y - e.y, r.x - e.x)), -1, 1) * e.T.turn * dt;
  e.spd = approach(e.spd, d < 18 ? 0 : e.routeSpd, 1.5, dt);
}

function evPickKind() {
  if (level === 0 && evN === 0) return 'drop';            /* первым делом — знакомство с усилениями */
  const quiet = nightQuiet();
  let pool = EV_KINDS.filter(k => k !== evLast && (!quiet || EV_QUIET[k]));
  if (level === 0) pool = pool.filter(k => k !== 'raid');  /* новичку хватит и штурмовиков */
  return pick(pool);
}

function evStart() {
  const kind = evPickKind();
  const P = player;
  let e = null;
  if (kind === 'drop') {
    const s = evSpot(220, 400);
    if (!s) return false;
    const a = rr(0, TAU);
    e = { x: s.x, y: s.y, t: 32, max: 32, fall: 2.4,
          px: s.x - Math.cos(a) * 260, py: s.y - Math.sin(a) * 260, pa: a };
    if (!nightQuiet()) {
      /* враг тоже видел парашют и идёт наперегонки */
      const q = evSpot(170, 230, s);
      if (q) {
        const r = evShip('patrol', q.x, q.y, Math.atan2(s.y - q.y, s.x - q.x));
        r.route = { x: s.x, y: s.y }; r.routeSpd = r.T.spd * 0.5; r.racer = true;
        e.racer = r;
      }
    }
    msg(T('evDropMsg'), EV_COL, 4);
  } else if (kind === 'ace') {
    const type = level < 2 ? 'gun' : level < 5 ? pick(['gun', 'missile']) : 'frigate';
    const n0 = enemies.length;
    if (!spawnEnemy(type) || enemies.length === n0) return false;
    const a = enemies[enemies.length - 1];
    a.hp = a.max = a.max * 2.4;
    a.T = Object.assign({}, a.T, { radar: 1200, spd: a.T.spd * 1.12 });
    a.ace = true; a.bounty = 3; a.drop = true;
    a.state = 'fight';
    e = { ship: a, t: 60, max: 60 };
    msg(T('evAceMsg'), '#ffd94a', 4);
  } else if (kind === 'pilot') {
    const s = evSpot(260, 440);
    if (!s) return false;
    e = { x: s.x, y: s.y, t: 40, max: 40, hold: 0 };
    if (!nightQuiet()) {
      const q = evSpot(150, 210, s);
      if (q) evShip(level < 2 ? 'patrol' : 'gun', q.x, q.y, 0).state = 'fight';
    }
    msg(T('evPilotMsg'), EV_COL, 4);
  } else if (kind === 'cargo') {
    /* караван идёт мимо катера: из-за экрана с одной стороны на другую */
    let ok = false;
    for (let t = 0; t < 16 && !ok; t++) {
      const a = rr(0, TAU), c = Math.cos(a), s = Math.sin(a);
      const side = rr(-1, 1) * 90;
      const sx = clamp(P.x + c * 480 - s * side, 80, WORLD.w - 80);
      const sy = clamp(P.y + s * 480 + c * side, 80, WORLD.h - 80);
      const ex = clamp(P.x - c * 700, 40, WORLD.w - 40), ey = clamp(P.y - s * 700, 40, WORLD.h - 40);
      if (dist(sx, sy, P.x, P.y) < 360 || dist(sx, sy, ex, ey) < 700) continue;
      const hd = Math.atan2(ey - sy, ex - sx);
      const list = [];
      for (let k = 0; k < 3; k++) {
        const bx = sx - Math.cos(hd) * k * 38, by = sy - Math.sin(hd) * k * 38;
        if (!isWater(bx, by)) continue;
        const b = evShip('barge', bx, by, hd);
        b.route = { x: ex, y: ey }; b.routeSpd = b.T.spd; b.cargo = true;
        list.push(b);
      }
      if (list.length < 2) { for (const b of list) enemies.splice(enemies.indexOf(b), 1); continue; }
      /* охранение */
      const gx = sx + Math.cos(hd + 1.6) * 40, gy = sy + Math.sin(hd + 1.6) * 40;
      if (isWater(gx, gy)) evShip(level < 2 ? 'patrol' : 'gun', gx, gy, hd).state = 'fight';
      e = { list, n: list.length, sunk: 0, t: 55, max: 55 };
      ok = true;
    }
    if (!ok) return false;
    msg(T('evCargoMsg'), EV_COL, 4);
  } else if (kind === 'raid') {
    const n = level < 3 ? 3 : 4;
    e = { k0: kills.planes, n, queue: n, qT: 0, heavy: level >= 2 ? 1 : 0, t: 32, max: 32 };
    msg(T('evRaidMsg'), '#ff9ad5', 4);
    SFX.bossAlarm();
  } else if (kind === 'loot') {
    const s = evSpot(280, 460);
    if (!s) return false;
    const list = [];
    for (let k = 0; k < 6; k++) {
      let x = s.x, y = s.y;
      for (let t = 0; t < 12; t++) {
        const a = rr(0, TAU), d = rr(8, 46);
        if (isWater(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d)) { x = s.x + Math.cos(a) * d; y = s.y + Math.sin(a) * d; break; }
      }
      const p = k === 5 ? { x, y, type: 'buff', kind: pick(BUFF_IDS), ph: rr(0, TAU), life: 30 }
                        : { x, y, type: 'coin', ph: rr(0, TAU), life: 30 };
      pickups.push(p); list.push(p);
    }
    e = { x: s.x, y: s.y, list, n: list.length, t: 30, max: 30 };
    msg(T('evLootMsg'), EV_COL, 4);
  }
  if (!e) return false;
  e.kind = kind; e.done = false; e.ok = false;
  ev = e; evLast = kind; evN++;
  if (kind !== 'raid') SFX.alarm();
  return true;
}

/* итог события: награда — поверх той, что уже дали за цели */
function evEnd(ok, why) {
  const e = ev;
  ev = null;
  evT = rr(26, 38);
  if (ok) {
    const pay = { drop: 150, ace: 200, pilot: 260, cargo: 300, raid: 300, loot: 200 }[e.kind] || 150;
    reward(pay, player.x, player.y - 22, EV_COL);
    msg(T('evOk') + ' • ' + T('ev_' + e.kind), '#4ade80', 3);
    bumpCombo();
    SFX.evac();
  } else {
    msg(why || T('evFail'), '#ff9166', 3);
  }
  /* ас, не пойманный вовремя, остаётся обычным кораблём */
  if (e.kind === 'ace' && e.ship && enemies.indexOf(e.ship) >= 0) {
    e.ship.ace = false; e.ship.bounty = 1;
  }
  if (e.racer && enemies.indexOf(e.racer) >= 0) { delete e.racer.route; e.racer.state = 'fight'; }
}

function evTick(dt) {
  updBuffs(dt);
  if (state !== 'play' || !player || player.dead) return;
  const P = player;

  if (ev) {
    const e = ev;
    e.t -= dt;
    if (e.kind === 'drop') {
      e.fall = Math.max(0, e.fall - dt);
      e.px += Math.cos(e.pa) * 150 * dt; e.py += Math.sin(e.pa) * 150 * dt;
      if (e.fall <= 0) {
        if (dist(P.x, P.y, e.x, e.y) < 18) {
          giveBuff(pick(BUFF_IDS), e.x, e.y);
          return evEnd(true);
        }
        const r = e.racer;
        if (r && enemies.indexOf(r) >= 0 && dist(r.x, r.y, e.x, e.y) < 22) return evEnd(false, T('evLost'));
        if (Math.floor(e.t * 1.2) !== Math.floor((e.t + dt) * 1.2)) addLight(e.x, e.y, 46, EV_COL, 0.5);
      }
    } else if (e.kind === 'ace') {
      if (enemies.indexOf(e.ship) < 0) return evEnd(true);
    } else if (e.kind === 'pilot') {
      if (dist(P.x, P.y, e.x, e.y) < 28 && Math.abs(P.spd) < 60) {
        e.hold += dt;
        if (e.hold > 0.7) {
          P.hp = Math.min(P.maxhp, P.hp + 30);
          addFloat(e.x, e.y - 18, T('fRepair'), '#4ade80');
          return evEnd(true);
        }
      } else e.hold = Math.max(0, e.hold - dt);
      if (chance(0.35))
        addP({ x: e.x + rr(-1, 1), y: e.y - 3, vx: rr(-4, 4), vy: rr(-18, -8), life: 1.1, max: 1.1,
               size: 2, col: 'rgba(192,123,255,0.8)', type: 'smoke' });
    } else if (e.kind === 'cargo') {
      for (let i = e.list.length - 1; i >= 0; i--) {
        const b = e.list[i];
        const k = enemies.indexOf(b);
        if (k < 0) { e.sunk++; e.list.splice(i, 1); continue; }
        if (dist(b.x, b.y, b.route.x, b.route.y) < 30) { enemies.splice(k, 1); e.list.splice(i, 1); }
      }
      if (!e.list.length) return evEnd(e.sunk === e.n, T('evCargoEsc', e.sunk, e.n));
      if (e.t <= 0) {          /* ушли за горизонт */
        for (const b of e.list) { const k = enemies.indexOf(b); if (k >= 0) enemies.splice(k, 1); }
        return evEnd(false, T('evCargoEsc', e.sunk, e.n));
      }
      return;
    } else if (e.kind === 'raid') {
      if (e.queue > 0) {
        e.qT -= dt;
        if (e.qT <= 0) { e.qT = 0.7; e.queue--; spawnPlane(e.heavy > 0 && e.queue === 0); }
      }
      if (kills.planes - e.k0 >= e.n) return evEnd(true);
      if (e.queue === 0 && !planes.length) return evEnd(false);
    } else if (e.kind === 'loot') {
      e.list = e.list.filter(p => pickups.indexOf(p) >= 0);
      if (!e.list.length) return evEnd(e.got >= e.n);
    }
    if (e.t <= 0) evEnd(false);
    return;
  }

  if (boss || winPend) return;
  /* обучение новичка сначала: ход и огонь */
  if (typeof tut !== 'undefined' && tut && !tut.done && tut.step < 2) return;
  evT -= dt;
  if (evT <= 0 && !evStart()) evT = 4;
}

/* подобрали монету или усиление — счёт для «собери всё» */
function evPicked(p) {
  if (ev && ev.kind === 'loot' && ev.list.indexOf(p) >= 0) ev.got = (ev.got || 0) + 1;
}

/* корабль события потоплен */
function evKilled(e) {
  if (e.cargo && chance(0.4)) dropBuff(e.x, e.y);
}

/* ---------- эвакуация вертолётом ---------- */
/* Цель уровня выполнена — оставшихся заложников забирает вертолёт
   (за меньшую награду), чтобы не гонять катер через всю карту. */
function heliEvac() {
  const P = player;
  let n = P.aboard;
  P.aboard = 0; P.troops = 0;
  for (let i = hostages.length - 1; i >= 0; i--) {
    const h = hostages[i];
    if (h.state === 'wait' || h.state === 'swim') { n++; hostages.splice(i, 1); }
  }
  if (!n) return;
  rescued += n;
  reward(Math.round(ECON.hostageEvac * 0.6) * n, P.x, P.y - 30, '#4ade80');
  msg(T('mHeliEvac', n), '#4ade80', 3.5);
  SFX.evac();
}

/* ---------- отрисовка в мире ---------- */
function drawEvents() {
  const P = player;
  /* метки асов и контейнеры на баржах */
  for (const e of enemies) {
    if (e.ace) {
      const r = e.T.r + 7;
      ctx.strokeStyle = 'rgba(255,217,74,' + (0.55 + 0.35 * Math.sin(tGlobal * 6)).toFixed(2) + ')';
      ctx.lineWidth = D * 2;
      ctx.setLineDash([3, 3]); ctx.lineDashOffset = -tGlobal * 12;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      txt(T('evAceTag'), e.x, e.y - r - 10, '#ffd94a', 8, 'center');
      bar(e.x - 12, e.y - r - 2, 24, 2, e.hp / e.max, '#ffd94a');
    } else if (e.type === 'barge') {
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(e.ang + Math.PI / 2);
      const cols = ['#b5523b', '#3b7bb5', '#c9a13b'];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#10161c'; ctx.fillRect(-3.5, -8 + k * 5.2, 7, 4.4);
        ctx.fillStyle = cols[(k + (e.x | 0)) % 3]; ctx.fillRect(-3, -7.6 + k * 5.2, 6, 3.6);
      }
      ctx.restore();
    }
  }
  if (ev) {
    const e = ev;
    if (e.kind === 'drop') {
      /* транспортник уходит дальше, контейнер спускается на парашюте */
      if (dist(e.px, e.py, e.x, e.y) < 900) {
        ctx.save(); ctx.translate(e.px, e.py); ctx.rotate(e.pa + Math.PI / 2);
        ctx.drawImage(sprPlaneF, -sprPlaneF.width / (2 * SC), -sprPlaneF.height / (2 * SC),
                      sprPlaneF.width / SC, sprPlaneF.height / SC);
        ctx.restore();
      }
      const h = e.fall * 16;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.35 - e.fall * 0.1).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 3, 5 - e.fall, 2, 0, 0, TAU); ctx.fill();
      const by = e.y - h + (e.fall > 0 ? 0 : Math.sin(tGlobal * 3) * 1.2);
      if (e.fall > 0) {
        ctx.strokeStyle = '#dfe6ea'; ctx.lineWidth = D * 2;
        ctx.beginPath(); ctx.moveTo(e.x - 3, by - 3); ctx.lineTo(e.x - 7, by - 12);
        ctx.moveTo(e.x + 3, by - 3); ctx.lineTo(e.x + 7, by - 12); ctx.stroke();
        ctx.fillStyle = '#f4f8fa';
        ctx.beginPath(); ctx.arc(e.x, by - 12, 8, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#ff8b3d'; ctx.fillRect(e.x - 2, by - 20, 4, 8);
      }
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(e.x - 4.5, by - 4.5, 9, 9);
      ctx.fillStyle = EV_COL; ctx.fillRect(e.x - 3.5, by - 3.5, 7, 7);
      ctx.fillStyle = '#f4f8fa'; ctx.fillRect(e.x - 0.5, by - 3.5, 1, 7); ctx.fillRect(e.x - 3.5, by - 0.5, 7, 1);
      if (e.fall <= 0) evRing(e.x, e.y, 18);
    } else if (e.kind === 'pilot') {
      drawHuman(PPL.pilot, e.x, e.y, { mode: 'raft', seed: 1.3 });     /* машет из плота */
      evRing(e.x, e.y, 28, e.hold / 0.7);
    } else if (e.kind === 'loot') {
      evRing(e.x, e.y, 54);
    }
  }
  /* щит вокруг катера */
  if (P && !P.dead && buffOn('shield')) {
    const k = buffs.shield < 2 && Math.floor(tGlobal * 8) % 2 ? 0.25 : 0.7;
    ctx.strokeStyle = 'rgba(127,212,224,' + (k * (0.7 + 0.3 * Math.sin(tGlobal * 7))).toFixed(2) + ')';
    ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(P.x, P.y, 15, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(127,212,224,0.08)';
    ctx.beginPath(); ctx.arc(P.x, P.y, 15, 0, TAU); ctx.fill();
  }
}

/* пульсирующий круг зоны события; prog — дуга прогресса */
function evRing(x, y, r, prog) {
  ctx.strokeStyle = 'rgba(192,123,255,' + (0.35 + 0.25 * Math.sin(tGlobal * 4)).toFixed(2) + ')';
  ctx.lineWidth = D * 2;
  ctx.setLineDash([4, 4]); ctx.lineDashOffset = tGlobal * 10;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  if (prog > 0) {
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(prog, 0, 1)); ctx.stroke();
  }
}

/* куда смотрит стрелка события */
function evTarget() {
  if (!ev) return null;
  const e = ev;
  if (e.kind === 'drop' || e.kind === 'pilot' || e.kind === 'loot') return e;
  if (e.kind === 'ace') return e.ship;
  if (e.kind === 'cargo') {
    let best = null, bd = 1e9;
    for (const b of e.list) { const d = dist(player.x, player.y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  if (e.kind === 'raid') {
    let best = null, bd = 1e9;
    for (const p of planes) { const d = dist(player.x, player.y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  return null;
}

/* ---------- плавающие усиления и монеты ---------- */
function drawBuffPickup(p, by) {
  const B = BUFFS[p.kind] || BUFFS.triple;
  const x = p.x;
  addLightOnce(p);
  ctx.fillStyle = '#0c1822';
  ctx.beginPath(); ctx.arc(x, by, 5.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = B.col; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(x, by, 5, 0, TAU); ctx.stroke();
  ctx.fillStyle = B.col;
  if (p.kind === 'triple') {
    ctx.fillRect(x - 3, by - 0.5, 1.5, 1.5); ctx.fillRect(x - 0.75, by - 2.5, 1.5, 1.5); ctx.fillRect(x + 1.5, by - 0.5, 1.5, 1.5);
  } else if (p.kind === 'rapid') {
    ctx.fillRect(x - 2.5, by - 2, 1.2, 4); ctx.fillRect(x - 0.6, by - 2, 1.2, 4); ctx.fillRect(x + 1.3, by - 2, 1.2, 4);
  } else if (p.kind === 'shield') {
    ctx.beginPath(); ctx.moveTo(x - 2.5, by - 2.5); ctx.lineTo(x + 2.5, by - 2.5);
    ctx.lineTo(x + 2.5, by); ctx.lineTo(x, by + 2.8); ctx.lineTo(x - 2.5, by); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(x + 1, by - 3); ctx.lineTo(x - 2, by + 0.5); ctx.lineTo(x, by + 0.5);
    ctx.lineTo(x - 1, by + 3); ctx.lineTo(x + 2, by - 0.5); ctx.lineTo(x, by - 0.5); ctx.closePath(); ctx.fill();
  }
}
/* мягкий отсвет раз в полсекунды, чтобы усиление было видно ночью */
function addLightOnce(p) {
  const k = Math.floor(tGlobal * 2 + p.ph);
  if (p.lk !== k) { p.lk = k; addLight(p.x, p.y, 34, (BUFFS[p.kind] || BUFFS.triple).col, 0.35); }
}
function drawCoin(p, by) {
  ctx.fillStyle = '#5a3e1a'; ctx.fillRect(p.x - 3.5, by - 3.5, 7, 7);
  ctx.fillStyle = '#c98a2e'; ctx.fillRect(p.x - 2.5, by - 3, 5, 6);
  ctx.fillStyle = '#ffd94a'; ctx.fillRect(p.x - 2.5, by - 1, 5, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(p.x - 2.5, by - 3, 1, 6);
}

/* ---------- радар ---------- */
function evRadar(blip) {
  if (!ev) return;
  const t = evTarget();
  if (ev.kind === 'cargo') { for (const b of ev.list) blip(b.x, b.y, EV_COL, 2.4); }
  else if (t) blip(t.x, t.y, ev.kind === 'ace' ? '#ffd94a' : EV_COL, 2.6);
}

/* ---------- HUD: панель события и усиления ---------- */
function drawEvHud() {
  if (!player) return;
  const P = player;
  if (ev && !boss) {
    const e = ev;
    const W = 176, X = VW / 2 - W / 2, Y = 28;
    panel(X, Y, W, 22, EV_COL);
    let title = T('ev_' + e.kind);
    if (e.kind === 'cargo') title += ' ' + e.sunk + '/' + e.n;
    else if (e.kind === 'raid') title += ' ' + Math.min(e.n, kills.planes - e.k0) + '/' + e.n;
    else if (e.kind === 'loot') title += ' ' + (e.got || 0) + '/' + e.n;
    txt(title, X + 6, Y + 4, '#e0c8ff', 8, 'left', W - 44);
    const sec = Math.max(0, Math.ceil(e.t));
    txt('0:' + String(sec).padStart(2, '0'), X + W - 6, Y + 4, sec <= 8 ? '#ff9166' : '#cfe8f0', 8, 'right');
    bar(X + 6, Y + 15, W - 12, 3, e.t / e.max, sec <= 8 ? '#ff9166' : EV_COL);
    const t = evTarget();
    if (t) edgeArrow(t.x, t.y, e.kind === 'ace' ? '#ffd94a' : EV_COL);
  }
  /* активные усиления — строкой над панелью задач */
  let x = 6;
  const y = VH - 62;
  for (const id of BUFF_IDS) {
    if (!buffOn(id)) continue;
    const B = BUFFS[id];
    const blink = buffs[id] < 2 && Math.floor(tGlobal * 8) % 2;
    ctx.globalAlpha = blink ? 0.45 : 1;
    panel(x, y, 66, 13, B.col);
    txt(T(B.key), x + 33, y + 2, B.col, 8, 'center', 58);
    bar(x + 4, y + 10, 58, 1, buffs[id] / B.dur, B.col);
    ctx.globalAlpha = 1;
    x += 70;
  }
}
