'use strict';
/* ============================================================
   abilities.js — расходные приёмы катера.

   F — дымовая завеса: облако рвёт линию огня и луч маяка, даётся
       бесплатно с откатом, это тактика, а не покупка.
   Q — глубинная бомба: сбрасывается за корму, тонет и рвёт под водой.
       Достаёт подлодки, но и своему корпусу рядом достанется.
   ============================================================ */

const SMOKE_CD = 14, SMOKE_R = 34, SMOKE_LIFE = 13;
const DC_CD = 3.5, DC_SINK = 1.3, DC_R = 42;
let smokeCD = 0, dcCD = 0;

/* ---------- дымовая завеса ---------- */
function dropSmoke() {
  if (!player || player.dead || smokeCD > 0) return;
  smokeCD = SMOKE_CD;
  const bx = player.x - Math.cos(player.ang) * 10;
  const by = player.y - Math.sin(player.ang) * 10;
  const puffs = [];
  for (let i = 0; i < 7; i++)
    puffs.push({ dx: rr(-10, 10), dy: rr(-10, 10), r: rr(9, 16), ph: rr(0, TAU), vx: rr(-3, 3), vy: rr(-3, 3) });
  smokes.push({ x: bx, y: by, r: 4, maxR: SMOKE_R, life: SMOKE_LIFE, max: SMOKE_LIFE, puffs });
  SFX.boost();
  for (let i = 0; i < 16; i++)
    addP({ x: bx + rr(-6, 6), y: by + rr(-6, 6), vx: rr(-16, 16), vy: rr(-16, 16), drag: 1.6,
           life: rr(0.6, 1.3), max: 1.3, size: rr(2, 4), col: '#6a7680', type: 'smoke' });
}

function updSmokes(dt) {
  smokeCD = Math.max(0, smokeCD - dt);
  const wind = (curCfg.weather && curCfg.weather.wind) || 0;
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.life -= dt;
    s.r = Math.min(s.maxR, s.r + 26 * dt);
    s.x += wind * 6 * dt;                       /* завесу сносит ветром */
    for (const p of s.puffs) { p.dx += p.vx * dt; p.dy += p.vy * dt; p.ph += dt * 0.6; }
    if (s.life <= 0) smokes.splice(i, 1);
  }
}

/* густая часть облака — по ней и режется видимость */
function inSmoke(x, y) {
  for (const s of smokes) {
    if (s.life < 0.6) continue;
    if (dist2(x, y, s.x, s.y) < s.r * s.r * 0.85) return true;
  }
  return false;
}
/* пересекает ли отрезок хоть одну завесу */
function losBlocked(x1, y1, x2, y2) {
  if (!smokes.length) return false;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    if (inSmoke(lerp(x1, x2, t), lerp(y1, y2, t))) return true;
  }
  return false;
}

function drawSmokes() {
  for (const s of smokes) {
    const fade = Math.min(1, s.life / 2.5) * Math.min(1, (s.max - s.life) / 0.5);
    for (const p of s.puffs) {
      const rr2 = p.r * (s.r / s.maxR) * (1 + 0.08 * Math.sin(p.ph));
      ctx.fillStyle = 'rgba(126,138,148,' + (0.30 * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x + p.dx, s.y + p.dy, rr2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(176,188,198,' + (0.16 * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x + p.dx - rr2 * 0.2, s.y + p.dy - rr2 * 0.25, rr2 * 0.6, 0, TAU); ctx.fill();
    }
  }
}

/* ---------- глубинные бомбы ---------- */
function dropCharge() {
  if (!player || player.dead) return;
  if (!upg.dc) { msg(T('mNoDC'), '#e5484d', 2); return; }
  if (dcCD > 0) return;
  dcCD = DC_CD;
  const bx = player.x - Math.cos(player.ang) * 13;
  const by = player.y - Math.sin(player.ang) * 13;
  charges.push({ x: bx, y: by, t: 0, spin: rr(-4, 4), rot: 0 });
  splashFx(bx, by, 0.7);
}

function updCharges(dt) {
  dcCD = Math.max(0, dcCD - dt);
  for (let i = charges.length - 1; i >= 0; i--) {
    const c = charges[i];
    c.t += dt;
    c.rot += c.spin * dt;
    if (chance(0.5))
      addP({ x: c.x + rr(-2, 2), y: c.y + rr(-2, 2), vx: 0, vy: 0, life: 0.5, max: 0.5,
             size: 0.6, col: 'rgba(220,245,248,0.6)', layer: 0 });
    if (c.t < DC_SINK) continue;

    /* подводный разрыв: столб воды, ударная волна */
    boom(c.x, c.y, 1.7, ['#dff6ff', '#9fd8e8', '#5fa8c0']);
    splashFx(c.x, c.y, 2.4);
    addP({ x: c.x, y: c.y, life: 0.6, max: 0.6, type: 'ring', r: DC_R, col: 'rgba(226,248,252,0.8)' });
    for (let k = 0; k < 22; k++) {
      const a = rr(0, TAU), v = rr(30, 95);
      addP({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 90, drag: 1.1,
             life: rr(0.4, 0.9), max: 0.9, size: rr(0.5, 1.6), col: '#dffaff' });
    }
    for (let k = subs.length - 1; k >= 0; k--) {
      const s = subs[k];
      const d = dist(c.x, c.y, s.x, s.y);
      if (d < DC_R) {
        damageSub(s, 120 * (1 - d / DC_R * 0.55), true);
        if (s.hp <= 0) killSub(s, k);
      }
    }
    for (const e of enemies) if (dist(c.x, c.y, e.x, e.y) < DC_R * 0.7) { e.hp -= 34; e.flash = 0.14; }
    for (let k = mines.length - 1; k >= 0; k--)
      if (dist(c.x, c.y, mines[k].x, mines[k].y) < DC_R * 0.8) {
        boom(mines[k].x, mines[k].y, 1.3); mines.splice(k, 1);
      }
    /* своим тоже прилетает, если не отошли */
    if (player && !player.dead) {
      const d = dist(c.x, c.y, player.x, player.y);
      if (d < 26) damagePlayer(20 * (1 - d / 26));
    }
    charges.splice(i, 1);
  }
}

function drawCharges() {
  for (const c of charges) {
    const t = c.t / DC_SINK;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * (1 - t);          /* уходит вглубь и тускнеет */
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    const k = 1 - t * 0.35;
    ctx.drawImage(sprDC, -sprDC.width / (2 * SC) * k, -sprDC.height / (2 * SC) * k,
                  sprDC.width / SC * k, sprDC.height / SC * k);
    ctx.restore();
    ctx.globalAlpha = 1;
    /* круг предупреждения перед разрывом */
    if (t > 0.55) {
      const q = (t - 0.55) / 0.45;
      ctx.strokeStyle = 'rgba(226,248,252,' + (0.15 + 0.4 * q).toFixed(2) + ')';
      ctx.lineWidth = D * 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, DC_R * (0.35 + q * 0.65), 0, TAU); ctx.stroke();
    }
  }
}
