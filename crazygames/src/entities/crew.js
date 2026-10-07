'use strict';
/* ============================================================
   crew.js — дружеские причалы и стрелки на борту.

   На маленьких островах без баз стоят свои: дощатый причал и от одной
   до четырёх свай — сколько свай, столько бойцов там ждёт. Подойти,
   сбросить ход — катер чинят, а бойцы по одному перебираются на борт
   и дальше бьют из стрелкового по всему, что подходит близко.
   ============================================================ */

const maxCrew = () => 4 + (hasPerk('hull') ? 1 : 0);   /* адмиральский корпус даёт пятое место */
const PIER_R = 46;                    /* с какого расстояния работает причал */
/* места на палубе: вдоль корпуса, в шахматном порядке */
const CREW_SLOTS = [[-8.4, -2.7], [-3.4, 2.7], [3.4, -2.7], [8.4, 2.7], [0, -3.2]];

function crewPos(P, i) {
  const s = CREW_SLOTS[i % CREW_SLOTS.length];
  const c = Math.cos(P.ang), sn = Math.sin(P.ang);
  return { x: P.x + c * s[0] - sn * s[1], y: P.y + sn * s[0] + c * s[1] };
}

function mkPier(isl) {
  const a = rr(0, TAU), d = radiusAt(isl, a) * 0.99;
  return {
    isl, ang: a,
    x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
    stock: ri(1, 4), boardT: 0.9, repT: 0, near: false, seed: rr(0, 10)
  };
}

/* ---------- причал: ремонт и подсадка ---------- */
function updPiers(dt) {
  const P = player;
  if (!P || P.dead) return;
  for (const q of piers) {
    const d = dist(P.x, P.y, q.x, q.y);
    q.near = d < PIER_R;
    if (!q.near || Math.abs(P.spd) > 40) { q.boardT = Math.min(q.boardT, 0.9); continue; }

    if (P.hp < P.maxhp) {
      P.hp = Math.min(P.maxhp, P.hp + 9 * dt);
      q.repT -= dt;
      if (q.repT <= 0) {
        q.repT = 0.7; SFX.repair();
        addP({ x: P.x + rr(-6, 6), y: P.y - 10, vx: 0, vy: -16,
               life: 0.7, max: 0.7, size: 1.4, col: '#4ade80' });
      }
    }

    q.boardT -= dt;
    if (q.boardT <= 0 && q.stock > 0 && crew.length < maxCrew()) {
      q.boardT = 1.5;
      q.stock--;
      crew.push({ cool: rr(0.1, 0.5), fire: 0, ang: P.ang });
      SFX.pickup();
      addP({ x: P.x, y: P.y, life: 0.3, max: 0.3, type: 'ring', r: 10, col: '#7fb8d8' });
      msg(T('mAllyAboard', crew.length), '#7fb8d8', 1.8);
    }
  }
}

/* ближайшая цель для стрелкового: корабли, самолёты, линкор */
function nearestFoe(x, y, r) {
  let best = null, bd = r;
  for (const e of enemies) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  for (const p of planes)  { const d = dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
  if (boss && !boss.dead) { const d = dist(x, y, boss.x, boss.y); if (d < bd) { bd = d; best = boss; } }
  return best;
}

function updCrew(dt) {
  const P = player;
  if (!P || P.dead) return;
  for (let i = 0; i < crew.length; i++) {
    const k = crew[i];
    k.cool -= dt;
    k.fire = Math.max(0, k.fire - dt);
    const pos = crewPos(P, i);
    const t = nearestFoe(pos.x, pos.y, 155);
    if (!t) { k.ang = P.turret; continue; }
    k.ang = Math.atan2(t.y - pos.y, t.x - pos.x);
    if (k.cool <= 0) {
      k.cool = rr(0.45, 0.75);
      k.fire = 0.09;
      const sp = k.ang + rr(-0.055, 0.055);
      shells.push({ x: pos.x, y: pos.y,
                    vx: Math.cos(sp) * 265, vy: Math.sin(sp) * 265,
                    life: 0.6, from: 'p', dmg: 7, dead: false });
      addP({ x: pos.x, y: pos.y, vx: Math.cos(k.ang) * rr(20, 45), vy: Math.sin(k.ang) * rr(20, 45),
             drag: 3, life: 0.1, max: 0.1, size: 0.5, col: '#ffe9a3' });
      SFX.mg();
    }
  }
}

/* при тяжёлом попадании кого-то из бойцов смывает за борт */
function shakeOffCrew(dmg) {
  if (crew.length && dmg >= 14 && chance(0.30)) {
    crew.pop();
    if (player) splashFx(player.x + rr(-6, 6), player.y + rr(-6, 6), 0.8);
    msg(T('mAllyLost'), '#e5484d', 1.8);
  }
}

/* ---------- отрисовка ---------- */
function drawPiers() {
  for (const q of piers) {
    /* причал уходит от берега в воду */
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.ang);
    ctx.drawImage(sprPier, -sprPier.width / (2 * SC), -sprPier.height / (2 * SC),
                  sprPier.width / SC, sprPier.height / SC);
    ctx.restore();

    /* сваи: сколько осталось бойцов, столько и «палочек» */
    const pw = sprPile.width / SC, ph = sprPile.height / SC;
    for (let i = 0; i < q.stock; i++) {
      const off = (i - (q.stock - 1) / 2) * 4.4;
      const px2 = q.x + Math.cos(q.ang + Math.PI / 2) * off + Math.cos(q.ang) * 3;
      const py2 = q.y + Math.sin(q.ang + Math.PI / 2) * off + Math.sin(q.ang) * 3;
      ctx.drawImage(sprPile, px2 - pw / 2, py2 - ph * 0.8, pw, ph);
      /* боец ждёт на свае, лицом к воде */
      drawTrooper(TROOP_ALLY, px2, py2 - 5, q.ang, q.ang, { seed: i + q.seed });
    }

    /* подсказка, когда подошли близко */
    if (q.near && Math.floor(tGlobal * 2) % 2) {
      ctx.strokeStyle = 'rgba(127,184,216,0.5)';
      ctx.lineWidth = D * 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, PIER_R, 0, TAU); ctx.stroke();
    }
  }
}

function drawCrew() {
  const P = player;
  if (!P || P.dead) return;
  for (let i = 0; i < crew.length; i++) {
    const k = crew[i], pos = crewPos(P, i);
    /* стрелок стоит по-походному вдоль палубы, целится только руками */
    drawTrooper(TROOP_ALLY, pos.x, pos.y, P.ang, k.ang, { fire: k.fire, seed: i * 1.7 });
    if (k.fire > 0) {
      const mx2 = pos.x + Math.cos(k.ang) * TROOP_MUZZLE;
      const my2 = pos.y - HUMAN_LIFT + Math.sin(k.ang) * TROOP_MUZZLE;
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(mx2 - 0.9, my2 - 0.9, 1.8, 1.8);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(mx2 - 0.5, my2 - 0.5, 1, 1);
    }
  }
}
