'use strict';
/* ============================================================
   hostages.js — заложники: сигнал, ожидание, заплыв, посадка
   ============================================================ */

function spawnHostages(isl, count, quiet) {
  const n = count || (2 + (chance(0.45) ? 1 : 0));
  let placed = 0, tr = 0;
  while (placed < n && tr < 80) {
    tr++;
    const a = rr(0, TAU), d = radiusAt(isl, a) - 3;
    if (d < 8) continue;
    hostages.push({
      x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
      state: 'wait', board: 0.6, wave: Math.random(), isl,
      t: 0, tx: 0, ty: 0, flare: rr(0, 3)
    });
    placed++;
  }
  spawned += placed;
  if (placed && !quiet) {
    msg(T('mDistress', '«' + islName(isl) + '»', placed), '#ffb454', 4);
    SFX.alarm();
    addLight(isl.x, isl.y, 120, '#ffb454', 0.8);
  }
  return placed;
}

function updHostages(dt) {
  const P = player;
  for (let i = hostages.length - 1; i >= 0; i--) {
    const h = hostages[i];

    if (h.state === 'wait') {
      /* сигнальная ракета время от времени */
      h.flare -= dt;
      if (h.flare <= 0) {
        h.flare = rr(3.5, 7);
        addP({ x: h.x, y: h.y - 4, vx: rr(-4, 4), vy: -46, g: 34, life: 1.5, max: 1.5,
               size: 2, col: '#ff8b3d', type: 'flare' });
        addLight(h.x, h.y - 14, 40, '#ff8b3d', 0.6);
      }
      continue;
    }

    if (h.state === 'swim') {
      if (P.dead) { h.state = 'wait'; h.board = 0.6; continue; }
      h.t += dt;
      const a = Math.atan2(P.y - h.y, P.x - h.x);
      h.x += Math.cos(a) * 46 * dt;
      h.y += Math.sin(a) * 46 * dt;
      if (chance(0.4))
        addP({ x: h.x, y: h.y, vx: rr(-5, 5), vy: rr(-5, 5), life: 0.4, max: 0.4, size: 0.6,
               col: 'rgba(220,245,248,0.7)', layer: 0 });
      if (dist(h.x, h.y, P.x, P.y) < 11 || h.t > 6) {
        if (P.aboard < capacity()) {
          h.state = 'aboard'; P.aboard++;
          reward(ECON.hostageTake, P.x, P.y - 12, '#ffb454');
          SFX.pickup();
          addP({ x: P.x, y: P.y, life: 0.3, max: 0.3, type: 'ring', r: 10, col: '#ffb454' });
          if (!hints.c) { hints.c = true; msg(T('mTakeThem', T('carrier')), '#4ade80', 4, 0.5); }
        } else { h.state = 'wait'; h.board = 0.6; }
        hostages.splice(i, 1);
      }
    }
  }
}
