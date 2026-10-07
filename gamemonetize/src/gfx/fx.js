'use strict';
/* ============================================================
   fx.js — частицы, свет, взрывы, всплывающие числа и сообщения
   ============================================================ */

/* при высокой плотности пикселей частиц нужно больше, а размер — мельче */
const MAX_PARTS = 1500;

function addP(o) {
  parts.push(Object.assign({
    life: 0.6, max: 0.6, size: 0.75, col: '#fff',
    vx: 0, vy: 0, g: 0, drag: 0, spin: 0, rot: 0,
    layer: 1, type: 'px', r: 6
  }, o));
  if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
}

/* точечный источник света для аддитивного слоя */
function addLight(x, y, r, col, life) {
  lights.push({ x, y, r, col: col || '#ffc46b', life: life || 0.25, max: life || 0.25 });
  if (lights.length > 120) lights.shift();
}

function updParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.g) p.vy += p.g * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    if (p.spin) p.rot += p.spin * dt;
    if (p.type === 'smoke') { p.vy -= 6 * dt; p.vx *= 0.98; }
  }
  for (let i = lights.length - 1; i >= 0; i--) {
    lights[i].life -= dt;
    if (lights[i].life <= 0) lights.splice(i, 1);
  }
}

/* ---------- взрыв ---------- */
function boom(x, y, pow, cols) {
  pow = pow || 1;
  cols = cols || ['#fff2c0', '#ffd94a', '#ffb454', '#ff6b3d', '#e5484d'];

  /* вспышка не больше катера: у мощных взрывов она заливала пол-экрана белым */
  addP({ x, y, life: 0.14, max: 0.14, type: 'flash', size: Math.min(12, 10 * pow) });
  addP({ x, y, life: 0.42, max: 0.42, type: 'ring',  r: 17 * pow, col: '#ffe9b0' });
  addP({ x, y, life: 0.55, max: 0.55, type: 'ring',  r: 28 * pow, col: 'rgba(255,255,255,0.5)' });
  addP({ x, y, life: 0.30, max: 0.30, type: 'fire',  size: 6 * pow });

  const n = Math.round(26 * pow);
  for (let i = 0; i < n; i++) {
    const a = rr(0, TAU), v = rr(28, 96) * pow;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4,
           life: rr(0.28, 0.62), max: 0.62, size: rr(0.4, 1.7), col: pick(cols) });
  }
  /* горящие обломки с гравитацией */
  for (let i = 0; i < Math.round(9 * pow); i++) {
    const a = rr(0, TAU), v = rr(30, 80) * pow;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 92, drag: 0.5,
           life: rr(0.6, 1.1), max: 1.1, size: rr(0.5, 1.5), col: '#ffb454', type: 'debris',
           spin: rr(-9, 9) });
  }
  /* дымовой столб */
  for (let i = 0; i < Math.round(9 * pow); i++)
    addP({ x: x + rr(-4, 4), y: y + rr(-4, 4), vx: rr(-9, 9), vy: rr(-16, -5),
           life: rr(0.9, 1.7), max: 1.7, size: rr(1.6, 4), col: '#5b666d', type: 'smoke' });

  addLight(x, y, 46 * pow, '#ffb054', 0.32 * pow);
  addShake(2.2 * pow, x, y);
  zoomPunch(0.012 * pow);
  boomGlow(x, y, pow);
  sndAt(x, y); SFX.boom(Math.min(1.4, pow));
}

/* крупный взрыв (босс, база) */
function bigBoom(x, y) {
  boom(x, y, 2.6);
  for (let k = 0; k < 4; k++) setTimeout(() => {
    if (state === 'title') return;
    boom(x + rr(-20, 20), y + rr(-20, 20), rr(0.8, 1.6));
  }, 110 + k * 130);
  flashScreen = Math.max(flashScreen, 0.55);
  freeze(0.09);
  sndAt(x, y); SFX.bigboom();
}

/* ---------- вода ---------- */
function splashFx(x, y, k) {
  k = k || 1;
  for (let i = 0; i < 18 * k; i++) {
    const a = rr(0, TAU), v = rr(12, 46) * k;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14 * k, g: 60, drag: 1.2,
           life: rr(0.25, 0.5), max: 0.5, size: rr(0.35, 1.1),
           col: chance(0.5) ? '#dffaff' : '#7fd4e0' });
  }
  addP({ x, y, life: 0.34, max: 0.34, type: 'ring', r: 10 * k, col: '#cdf3f8' });
  if (k >= 0.6) splashColumn(x, y, k);
  sndAt(x, y); SFX.splash();
}

/* кильватерный след: пенная точка, живёт долго */
function addWake(x, y, ang, strength) {
  wakes.push({ x, y, ang, life: 1.5, max: 1.5, w: strength });
  if (wakes.length > 460) wakes.shift();
}
function updWakes(dt) {
  for (let i = wakes.length - 1; i >= 0; i--) {
    const w = wakes[i]; w.life -= dt;
    if (w.life <= 0) wakes.splice(i, 1);
  }
}

/* ---------- дульная вспышка ---------- */
function muzzle(x, y, ang, k) {
  k = k || 1;
  addP({ x, y, life: 0.08, max: 0.08, type: 'flash', size: 5 * k });
  addP({ x, y, life: 0.1, max: 0.1, type: 'glow', size: 10 * k, col: GLOW.hot });
  for (let i = 0; i < 7; i++)
    addP({ x, y, vx: Math.cos(ang) * rr(40, 110) + rr(-20, 20), vy: Math.sin(ang) * rr(40, 110) + rr(-20, 20),
           life: 0.13, max: 0.13, size: rr(0.35, 0.8), col: '#ffe9a3', drag: 3 });
  for (let i = 0; i < 2; i++)
    addP({ x: x + Math.cos(ang) * 3, y: y + Math.sin(ang) * 3, vx: rr(-8, 8), vy: rr(-10, 0),
           life: 0.45, max: 0.45, size: 1.3, col: '#6a7680', type: 'smoke' });
  addLight(x, y, 22 * k, '#ffd08a', 0.09);
}

/* ---------- текст ---------- */
function addFloat(x, y, txtStr, col) {
  floats.push({ x, y, txt: txtStr, col: col || '#ffd94a', life: 1.3, max: 1.3, vy: -13 });
}
function updFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

function msg(text, col, dur, delay) {
  msgs.push({ text, col: col || '#ffd94a', dur: dur === undefined ? 3 : dur, delay: delay || 0, age: 0 });
}
function updMsgs(dt) {
  for (const m of msgs) m.age += dt;
  msgs = msgs.filter(m => m.age < m.delay + m.dur + 0.5);
}

/* ---------- награда и комбо ---------- */
/* Кредиты и очки живут на разных шкалах: очки остаются «аркадно»
   большими, а кредиты намеренно скупы — от них зависит темп прокачки. */
const comboMul = () => 1 + Math.min(ECON.comboMax, combo) * ECON.comboStep;

function reward(n, x, y, col) {
  const mult = comboMul();
  const cash = Math.round(n * mult * diff().cash * ECON.levelMul(level) * metaCashMul());
  money += cash;
  score += Math.round(n * mult * ECON.scoreMul);
  if (x !== undefined) addFloat(x, y, T('fCredits', cash), col);
}
function bumpCombo() {
  combo++; comboT = 4.0;
  if (combo > comboBest) comboBest = combo;
  if (combo >= 2) {
    SFX.combo(combo);
    if (player) addFloat(player.x, player.y - 18, 'x' + comboMul().toFixed(2), '#ff9ad5');
  }
}
function updCombo(dt) {
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
}
