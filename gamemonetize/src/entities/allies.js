'use strict';
/* ============================================================
   allies.js — десантная операция.

   На одном острове ждёт группа морпехов: её надо подобрать так же,
   как заложников, довезти до острова-цели и высадить. Дальше отряд
   сам идёт на огневые точки, но без поддержки с воды его перебьют —
   задача игрока подавлять бункеры, пока десант работает.
   ============================================================ */

const SQUAD_HP = 72;

function spawnMarines(isl, n) {
  let placed = 0, tr = 0;
  while (placed < n && tr < 120) {
    tr++;
    const a = rr(0, TAU), d = radiusAt(isl, a) - 3;
    if (d < 8) continue;
    marines.push({
      x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
      state: 'wait', board: 0.6, wave: Math.random(), isl, t: 0,
      face: a                                  /* стоят лицом к воде */
    });
    placed++;
  }
  return placed;
}

/* ---------- посадка на катер ---------- */
function updMarines(dt) {
  const P = player;
  for (let i = marines.length - 1; i >= 0; i--) {
    const m = marines[i];

    if (m.state === 'wait') {
      if (!P.dead && dist(P.x, P.y, m.x, m.y) < 32 && Math.abs(P.spd) < 55 &&
          P.aboard + P.troops < capacity()) {
        m.board -= dt;
        if (m.board <= 0) { m.state = 'swim'; m.t = 0; }
      } else m.board = Math.max(m.board, 0.35);
      continue;
    }

    if (m.state === 'swim') {
      if (P.dead) { m.state = 'wait'; m.board = 0.6; continue; }
      m.t += dt;
      const a = Math.atan2(P.y - m.y, P.x - m.x);
      m.x += Math.cos(a) * 52 * dt;
      m.y += Math.sin(a) * 52 * dt;
      if (chance(0.4))
        addP({ x: m.x, y: m.y, vx: rr(-5, 5), vy: rr(-5, 5), life: 0.4, max: 0.4,
               size: 0.6, col: 'rgba(220,245,248,0.7)', layer: 0 });
      if (dist(m.x, m.y, P.x, P.y) < 11 || m.t > 6) {
        if (P.aboard + P.troops < capacity()) {
          P.troops++;
          SFX.pickup();
          addP({ x: P.x, y: P.y, life: 0.3, max: 0.3, type: 'ring', r: 10, col: '#6fae5a' });
          msg(T('mMarinesUp', P.troops), '#6fae5a', 1.6);
        } else { m.state = 'wait'; m.board = 0.6; continue; }
        marines.splice(i, 1);
      }
    }
  }
}

/* ---------- высадка ---------- */
function tryLanding() {
  const P = player;
  if (!targetIsl || P.troops <= 0 || P.dead) return;
  const a = Math.atan2(P.y - targetIsl.y, P.x - targetIsl.x);
  const sh = radiusAt(targetIsl, a);
  if (dist(P.x, P.y, targetIsl.x, targetIsl.y) > sh + 40) return;

  const n = P.troops; P.troops = 0; landed += n;
  for (let i = 0; i < n; i++) {
    const aa = a + rr(-0.22, 0.22);
    const d = radiusAt(targetIsl, aa) - rr(2, 8);
    squad.push({
      x: targetIsl.x + Math.cos(aa) * d, y: targetIsl.y + Math.sin(aa) * d,
      ang: aa + Math.PI, bodyAng: aa + Math.PI, hp: SQUAD_HP, cool: rr(0.4, 1.2), step: 0, fire: 0
    });
  }
  msg(T('mMarinesGo'), '#6fae5a', 3);
  SFX.evac();
  for (let i = 0; i < 14; i++)
    addP({ x: P.x + rr(-8, 8), y: P.y + rr(-8, 8), vx: rr(-14, 14), vy: rr(-20, -6),
           g: 40, life: rr(0.5, 1), max: 1, size: 1.2, col: '#6fae5a' });
}

/* ближайшая живая постройка острова-цели */
function squadTarget(s) {
  let best = null, bd = 1e9;
  for (const st of structs) {
    if (st.isl !== targetIsl || st.dead || st.type === 'crate') continue;
    const d = dist(s.x, s.y, st.x, st.y);
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

function updSquad(dt) {
  for (let i = squad.length - 1; i >= 0; i--) {
    const s = squad[i];
    s.cool -= dt; s.fire = Math.max(0, s.fire - dt);
    const tgt = squadTarget(s);

    if (tgt) {
      const d = dist(s.x, s.y, tgt.x, tgt.y);
      const a = Math.atan2(tgt.y - s.y, tgt.x - s.x);
      s.ang = a;
      if (d > 30) {                                   /* подходим на дистанцию огня */
        s.x += Math.cos(a) * 26 * dt;
        s.y += Math.sin(a) * 26 * dt;
        s.bodyAng = a;                                /* корпус развёрнут по ходу */
        s.step += dt * 6;
      } else if (s.cool <= 0) {                       /* короткая очередь по амбразуре */
        s.cool = rr(0.8, 1.3);
        s.fire = 0.12;
        damageStruct(tgt, 12);
        muzzle(s.x + Math.cos(a) * 3, s.y + Math.sin(a) * 3, a, 0.35);
        SFX.mg();
      }
      /* огневая точка бьёт в ответ: без поддержки с воды отряд не выстоит */
      if (d < 62 && chance(0.34 * dt)) {
        s.hp -= 22;
        addP({ x: s.x, y: s.y, vx: rr(-20, 20), vy: rr(-20, 20), life: 0.2, max: 0.2,
               size: 0.7, col: '#ffb454' });
      }
    }

    if (s.hp <= 0) {
      boom(s.x, s.y, 0.35, ['#c8484d', '#8a5a3a']);
      squad.splice(i, 1);
      if (!squad.length && landed > 0 && !allTargetStructsDead())
        msg(T('mMarinesDead'), '#e5484d', 3);
    }
  }
}

function allTargetStructsDead() {
  if (!targetIsl) return false;
  return !structs.some(s => s.isl === targetIsl && !s.dead && s.type !== 'crate');
}

/* ---------- отрисовка ---------- */
function drawMarines() {
  for (const m of marines) {
    if (m.state === 'aboard') continue;
    if (m.state === 'swim') {
      const face = Math.atan2(player.y - m.y, player.x - m.x);
      drawTrooper(TROOP_MARINE, m.x, m.y, face, face, { mode: 'swim', seed: m.wave });
      continue;
    }
    drawTrooper(TROOP_MARINE, m.x, m.y, m.face, m.face, { seed: m.wave });
    if (m.state === 'wait' && Math.floor(tGlobal * 2) % 2) {
      ctx.fillStyle = '#6fae5a';
      ctx.fillRect(m.x - 0.45, m.y - 9.5, 0.9, 2.6);
    }
  }
}

function drawSquad() {
  for (const s of squad) {
    /* идёт, пока растёт фаза шага; остановился — плавно встаёт в стойку */
    s.mv = (s.mv || 0) + ((s.step !== s.ps ? 1 : 0) - (s.mv || 0)) * 0.2;
    s.ps = s.step;
    /* корпус стоит как шёл, руки с оружием доворачиваются на цель */
    drawTrooper(TROOP_MARINE, s.x, s.y, s.bodyAng, s.ang, { walk: s.step, move: s.mv, fire: s.fire, seed: s.x * 0.013 });
    if (s.fire > 0) {
      const mx2 = s.x + Math.cos(s.ang) * TROOP_MUZZLE;
      const my2 = s.y - HUMAN_LIFT + Math.sin(s.ang) * TROOP_MUZZLE;
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(mx2 - 0.9, my2 - 0.9, 1.8, 1.8);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(mx2 - 0.5, my2 - 0.5, 1, 1);
    }
    if (s.hp < SQUAD_HP) {
      ctx.fillStyle = 'rgba(6,16,24,0.8)'; ctx.fillRect(s.x - 3, s.y - 6.5, 6, 1.8);
      ctx.fillStyle = '#6fae5a'; ctx.fillRect(s.x - 2.6, s.y - 6.1, 5.2 * (s.hp / SQUAD_HP), 1);
    }
  }
}
