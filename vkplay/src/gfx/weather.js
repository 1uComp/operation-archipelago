'use strict';
/* ============================================================
   weather.js — дождь, туман, дымка, молнии, освещение сцены
   ============================================================ */

let rainDrops = [], rainSplash = [], lightT = 0, lightFlash = 0, fogOff = 0;
let WEA = {};

function initWeather(cfg) {
  WEA = cfg.weather || {};
  rainDrops = []; rainSplash = []; lightFlash = 0;
  lightT = rr(6, 14);
  const n = Math.round((WEA.rain || 0) * 460);
  for (let i = 0; i < n; i++)
    rainDrops.push({ x: rr(0, VW), y: rr(0, VH), v: rr(430, 660), len: rr(4, 12),
                     a: rr(0.14, 0.42), w: rr(0.28, 0.6) });
}

function updWeather(dt) {
  const wind = (WEA.wind || 0) * 260;
  for (const d of rainDrops) {
    d.y += d.v * dt; d.x += wind * dt;
    if (d.y > VH) {
      d.y = -6; d.x = rr(-40, VW + 40);
      if (chance(0.35)) rainSplash.push({ x: d.x, y: rr(0, VH), life: 0.22 });
    }
    if (d.x < -40) d.x += VW + 80; else if (d.x > VW + 40) d.x -= VW + 80;
  }
  for (let i = rainSplash.length - 1; i >= 0; i--) {
    rainSplash[i].life -= dt;
    if (rainSplash[i].life <= 0) rainSplash.splice(i, 1);
  }
  if (WEA.lightning) {
    lightT -= dt;
    if (lightT <= 0) {
      lightT = rr(7, 18);
      lightFlash = 0.42;
      SFX.thunder();
    }
  }
  if (lightFlash > 0) lightFlash -= dt * 1.6;
  fogOff += dt * 8;
}

/* дождь и брызги — поверх сцены, но под интерфейсом */
function drawRain() {
  if (!rainDrops.length) return;
  const wind = (WEA.wind || 0);
  for (const d of rainDrops) {
    ctx.lineWidth = d.w;
    ctx.strokeStyle = 'rgba(190,225,240,' + d.a.toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + wind * d.len * 0.9, d.y + d.len);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (const s of rainSplash) {
    const k = s.life / 0.22;
    ctx.strokeStyle = 'rgba(210,240,250,' + (0.30 * k).toFixed(3) + ')';
    ctx.lineWidth = D;
    ctx.beginPath(); ctx.arc(s.x, s.y, (1 - k) * 2 + 0.4, 0, TAU); ctx.stroke();
  }
}

/* туман: две ползущие полосы шума */
function drawFog() {
  const f = WEA.fog || 0;
  if (!f) return;
  for (let layer = 0; layer < 2; layer++) {
    const sp = layer ? 0.55 : 1.0, off = fogOff * sp;
    for (let i = 0; i < 40; i++) {
      const y = (h1(i * 7.3 + layer * 31) * VH + off * 0.35) % VH;
      const x = (h1(i * 3.1 + layer * 17) * VW + off) % (VW + 120) - 60;
      const w = 60 + h1(i * 9.7 + layer) * 110;
      ctx.fillStyle = 'rgba(190,210,220,' + (f * 0.10).toFixed(3) + ')';
      ctx.fillRect(x, y, w, 10 + (i % 3) * 6);
    }
  }
  ctx.fillStyle = 'rgba(178,198,210,' + (f * 0.16).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
}

/* дымка (тепловая мгла) — лёгкий цветной налёт */
function drawHaze() {
  const h = WEA.haze || 0;
  if (!h) return;
  ctx.fillStyle = 'rgba(255,168,120,' + (h * 0.5).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
}

/* ---------- слой света ---------- */
/* Затемняем кадр по ambient уровня и «прожигаем» дыры источниками света. */
function drawLighting() {
  const amb = curCfg.ambient || 0;
  if (amb <= 0.01 && lights.length === 0 && lightFlash <= 0) return;

  if (amb > 0.01) {
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, VW, VH);
    const nightTint = curCfg.biome === 'ash' ? '10,18,30' : '8,14,26';
    lightCtx.fillStyle = 'rgba(' + nightTint + ',' + amb.toFixed(3) + ')';
    lightCtx.fillRect(0, 0, VW, VH);

    lightCtx.globalCompositeOperation = 'destination-out';
    const z = cam.z;
    const punch = (wx, wy, r, str) => {
      const sx = (wx - ox) * z, sy = (wy - oy) * z, R = r * z;
      if (sx < -R || sx > VW + R || sy < -R || sy > VH + R) return;
      const gr = lightCtx.createRadialGradient(sx, sy, 0, sx, sy, R);
      gr.addColorStop(0, 'rgba(0,0,0,' + str + ')');
      gr.addColorStop(0.55, 'rgba(0,0,0,' + str * 0.55 + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lightCtx.fillStyle = gr;
      lightCtx.beginPath(); lightCtx.arc(sx, sy, R, 0, TAU); lightCtx.fill();
    };
    if (player && !player.dead) punch(player.x, player.y, 96, 0.9);
    punch(CARR.x, CARR.y, 150, 0.85);
    for (const s of structs) if (!s.dead) punch(s.x, s.y, s.type === 'base' ? 78 : 46, 0.55);
    for (const e of enemies) punch(e.x, e.y, 40, 0.4);
    if (boss) punch(boss.x, boss.y, 110, 0.6);
    for (const l of lights) punch(l.x, l.y, l.r, 0.95 * (l.life / l.max));
    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0, VW, VH);
  }

  /* аддитивное свечение источников */
  ctx.globalCompositeOperation = 'lighter';
  const z = cam.z;
  for (const l of lights) {
    const t = l.life / l.max;
    const sx = (l.x - ox) * z, sy = (l.y - oy) * z, R = l.r * z * (0.6 + 0.4 * t);
    if (sx < -R || sx > VW + R || sy < -R || sy > VH + R) continue;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    gr.addColorStop(0, 'rgba(255,205,140,' + (0.42 * t).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  /* вспышка молнии */
  if (lightFlash > 0) {
    const a = Math.min(0.55, lightFlash) * (chance(0.5) ? 1 : 0.55);
    ctx.fillStyle = 'rgba(206,230,255,' + a.toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}
