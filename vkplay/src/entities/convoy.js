'use strict';
/* ============================================================
   convoy.js — проводка транспорта.

   «Ладога» выходит от авианосца и своим ходом идёт к порту на
   дальнем острове. Она безоружна и медлительна, по ней бьют все:
   корабли, авиация, подлодки и береговые батареи. Утонет — задание
   сорвано, поэтому катер идёт впереди и расчищает дорогу.
   ============================================================ */

let convoyWarnT = 0;

function makeTransport(destIsl) {
  /* маршрут: от авианосца в обход островов к берегу назначения */
  const wp = [];
  const ax = Math.atan2(destIsl.y - CARR.y, destIsl.x - CARR.x);
  const total = dist(CARR.x, CARR.y, destIsl.x, destIsl.y);
  const legs = Math.max(2, Math.round(total / 420));
  for (let i = 1; i <= legs; i++) {
    const t = i / legs;
    let x = lerp(CARR.x + Math.cos(ax) * 70, destIsl.x, t);
    let y = lerp(CARR.y + Math.sin(ax) * 70, destIsl.y, t);
    /* точку сдвигаем в воду, если она попала на сушу */
    for (let k = 0; k < 24 && !isWater(x, y); k++) {
      const a = k / 24 * TAU;
      x += Math.cos(a) * 26; y += Math.sin(a) * 26;
    }
    wp.push({ x, y });
  }
  /* последняя точка — у самого берега порта */
  const la = Math.atan2(CARR.y - destIsl.y, CARR.x - destIsl.x);
  wp[wp.length - 1] = { x: destIsl.x + Math.cos(la) * (radiusAt(destIsl, la) + 34),
                        y: destIsl.y + Math.sin(la) * (radiusAt(destIsl, la) + 34) };

  const hp = CONVOY.hp * (1 + (curCfg.n || 0) * 0.10);
  return {
    x: CARR.x + Math.cos(ax) * 56, y: CARR.y + Math.sin(ax) * 56,
    ang: ax, spd: 0, hp, max: hp, dead: false, done: false,
    wp, wpi: 0, wakeT: 0, hitT: 0, smk: 0, dest: destIsl,
    total: 0, gone: 0
  };
}

function damageTransport(d) {
  if (!transport || transport.dead || transport.done) return;
  transport.hp -= d;
  transport.hitT = 0.35;
  addShake(1.2, transport.x, transport.y);
  if (convoyWarnT <= 0) { convoyWarnT = 9; msg(T('mConvoyHit'), '#e5484d', 2.5); SFX.alarm(); }
  if (transport.hp <= 0) {
    transport.dead = true;
    bigBoom(transport.x, transport.y);
    msg(T('mConvoyLost'), '#e5484d', 4);
  }
}

function convoyProgress() {
  if (!transport) return 0;
  return clamp(transport.gone / Math.max(1, transport.total), 0, 1);
}

function updTransport(dt) {
  const t = transport;
  if (!t) return;
  convoyWarnT -= dt;
  t.hitT = Math.max(0, t.hitT - dt);
  if (t.dead) return;

  if (t.done) {                                  /* пришла — стоит у причала */
    t.spd = approach(t.spd, 0, 2, dt);
    t.x += Math.cos(t.ang) * t.spd * dt;
    t.y += Math.sin(t.ang) * t.spd * dt;
    return;
  }

  const wp = t.wp[t.wpi];
  const da = angDiff(t.ang, Math.atan2(wp.y - t.y, wp.x - t.x));
  t.ang += clamp(da, -1, 1) * 0.55 * dt;
  t.spd = approach(t.spd, CONVOY.spd, 0.9, dt);

  /* обход островов, чтобы не сесть на мель по дороге */
  for (const isl of islands) {
    const dx = t.x - isl.x, dy = t.y - isl.y, d2v = dx * dx + dy * dy, rq = isl.r + 46;
    if (d2v < rq * rq) t.ang += clamp(angDiff(t.ang, Math.atan2(dy, dx)), -1, 1) * 1.6 * dt;
  }

  const mx = Math.cos(t.ang) * t.spd * dt, my = Math.sin(t.ang) * t.spd * dt;
  t.x += mx; t.y += my;
  t.gone += Math.hypot(mx, my);
  collideIslands(t, CONVOY.r);

  if (dist(t.x, t.y, wp.x, wp.y) < 44) {
    t.wpi++;
    if (t.wpi >= t.wp.length) {
      t.done = true;
      msg(T('mConvoyDone'), '#4ade80', 3);
      SFX.evac();
      for (let i = 0; i < 20; i++)
        addP({ x: t.x + rr(-16, 16), y: t.y + rr(-24, 24), vx: rr(-12, 12), vy: rr(-30, -10),
               g: 40, life: rr(0.6, 1.2), max: 1.2, size: 1.6, col: '#4ade80' });
    }
  }

  t.wakeT -= dt;
  if (t.wakeT <= 0 && t.spd > 8) {
    t.wakeT = 0.07;
    /* след транспорта рисует shipWake (vfx.js) */
  }
  if (t.hp < t.max * 0.5) {
    t.smk -= dt;
    if (t.smk <= 0) {
      t.smk = 0.14;
      addP({ x: t.x + rr(-8, 8), y: t.y + rr(-12, 12), vx: rr(-5, 5), vy: rr(-13, -4),
             life: 1.2, max: 1.2, size: 2.6, col: '#4a545e', type: 'smoke' });
    }
  }
}

function drawTransport() {
  const t = transport;
  if (!t || t.dead) return;
  shipWake(t, 18, 5);
  drawStack(sprTransport, t.x, t.y + Math.sin(tGlobal * 1.7) * 0.4, t.ang + Math.PI / 2, sprTransport._h, 0);
  if (t.hitT > 0) {
    ctx.globalAlpha = Math.min(1, t.hitT * 3);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(t.x, t.y, CONVOY.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  /* полоса живучести всегда на виду — от неё зависит миссия */
  const w = 26;
  ctx.fillStyle = 'rgba(6,16,24,0.85)';
  ctx.fillRect(t.x - w / 2 - 0.5, t.y - 24, w + 1, 3.5);
  ctx.fillStyle = t.hp / t.max > 0.5 ? '#4ade80' : t.hp / t.max > 0.25 ? '#ffb454' : '#e5484d';
  ctx.fillRect(t.x - w / 2, t.y - 23.5, w * clamp(t.hp / t.max, 0, 1), 2.5);
  if (Math.floor(tGlobal * 2) % 2) {
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(t.x - 0.8, t.y - 29, 1.6, 1.6);
  }
}

/* пунктир маршрута — видно, куда вести */
function drawConvoyRoute() {
  const t = transport;
  if (!t || t.dead || t.done) return;
  ctx.strokeStyle = 'rgba(74,222,128,0.22)';
  ctx.lineWidth = D * 2;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  for (let i = t.wpi; i < t.wp.length; i++) ctx.lineTo(t.wp[i].x, t.wp[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
}
