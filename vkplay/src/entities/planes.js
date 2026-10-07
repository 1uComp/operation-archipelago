'use strict';
/* ============================================================
   planes.js — авиация противника: штурмовик и тяжёлый бомбардировщик
   ============================================================ */

function spawnPlane(heavy) {
  if (!player) return;
  const side = (Math.random() * 4) | 0;
  let x, y;
  if (side === 0) { x = rr(0, WORLD.w); y = -30; }
  else if (side === 1) { x = WORLD.w + 30; y = rr(0, WORLD.h); }
  else if (side === 2) { x = rr(0, WORLD.w); y = WORLD.h + 30; }
  else { x = -30; y = rr(0, WORLD.h); }

  const pvx = Math.cos(player.ang) * player.spd, pvy = Math.sin(player.ang) * player.spd;
  const dp = { x: clamp(player.x + pvx * 0.6 + rr(-24, 24), 40, WORLD.w - 40),
               y: clamp(player.y + pvy * 0.6 + rr(-24, 24), 40, WORLD.h - 40) };
  const ang = Math.atan2(dp.y - y, dp.x - x);

  planes.push({
    x, y, ang, heavy: !!heavy,
    spd: (heavy ? rr(90, 110) : rr(118, 158)) + level * 6,
    hp: (heavy ? 60 : 24) + level * 4,
    dp, drops: heavy ? 3 : 1, dropT: 0, smk: 0, bank: 0, engT: 0
  });
  if (heavy) msg(T('mAirTarget'), '#ff9ad5', 2.5);
}

function updPlanes(dt) {
  planeT -= dt;
  if (planeT <= 0) {
    planeT = Math.max(5, curCfg.plane - destroyedBases * 1.2 - alert * 1.1);
    spawnPlane(level >= 3 && chance(0.25));
  }

  for (let i = planes.length - 1; i >= 0; i--) {
    const p = planes[i];
    p.x += Math.cos(p.ang) * p.spd * dt;
    p.y += Math.sin(p.ang) * p.spd * dt;
    p.bank = approach(p.bank, 0, 3, dt);

    /* сброс бомб над точкой прицеливания */
    if (p.drops > 0 && dist(p.x, p.y, p.dp.x, p.dp.y) < 18) {
      p.dropT -= dt;
      if (p.dropT <= 0) {
        p.dropT = 0.35;
        p.drops--;
        const pvx = Math.cos(player.ang) * player.spd, pvy = Math.sin(player.ang) * player.spd;
        arcs.push({ x0: p.x, y0: p.y,
                    x1: clamp(player.x + pvx * 0.35 + rr(-8, 8), 8, WORLD.w - 8),
                    y1: clamp(player.y + pvy * 0.35 + rr(-8, 8), 8, WORLD.h - 8),
                    t: 0, dur: 1.1, dmg: (p.heavy ? 30 : 24) + level * 3, rad: p.heavy ? 32 : 26, from: 'bomb' });
        if (p.drops > 0) p.dp = { x: p.x + Math.cos(p.ang) * 70, y: p.y + Math.sin(p.ang) * 70 };
      }
    }

    /* инверсионный след */
    p.engT -= dt;
    if (p.engT <= 0) {
      p.engT = 0.06;
      addP({ x: p.x - Math.cos(p.ang) * 6, y: p.y - Math.sin(p.ang) * 6, vx: rr(-3, 3), vy: rr(-3, 3),
             life: 0.5, max: 0.5, size: 0.7, col: 'rgba(230,245,250,0.32)' });
    }
    if (p.hp <= (p.heavy ? 24 : 12)) {
      p.smk -= dt;
      if (p.smk <= 0) {
        p.smk = 0.08;
        addP({ x: p.x, y: p.y, vx: rr(-6, 6), vy: rr(-6, 6), life: 0.85, max: 0.85, size: 2.2,
               col: '#4a545e', type: 'smoke' });
      }
    }

    if (p.hp <= 0) {
      boom(p.x, p.y, p.heavy ? 1.8 : 1.2);
      bumpCombo();
      reward(p.heavy ? ECON.planeHeavy : ECON.plane, p.x, p.y, '#7fd4e0');
      kills.planes++;
      /* падающие обломки */
      for (let k = 0; k < 7; k++)
        addP({ x: p.x, y: p.y, vx: rr(-60, 60), vy: rr(-60, 60), g: 80, drag: 1.0,
               life: rr(0.5, 1.1), max: 1.1, size: rr(0.5, 1.4), col: '#39454e', type: 'debris', spin: rr(-10, 10) });
      planes.splice(i, 1);
      continue;
    }
    if (p.x < -90 || p.x > WORLD.w + 90 || p.y < -90 || p.y > WORLD.h + 90) planes.splice(i, 1);
  }
}
