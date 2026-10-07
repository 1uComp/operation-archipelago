'use strict';
/* ============================================================
   vfx.js — «дорогие на вид, дешёвые по цене» эффекты.

   • свечения — один заранее нарисованный радиальный спрайт на цвет,
     кладётся аддитивно (без градиентов на каждый кадр);
   • водяные столбы от разрывов: белый столб растёт и опадает,
     тень ложится на воду — вертикаль добавляет глубины;
   • носовые буруны у идущих кораблей;
   • чайки с тенями на воде — живая высота над морем;
   • солнечная дорожка бликов, виньетка и цветокоррекция по биому.

   FXQ — уровень эффектов. Игра сама следит за частотой кадров:
   если устройство не справляется, дорогие слои отключаются.
   ============================================================ */

let FXQ = 1;                       /* 1 — полные эффекты, 0 — облегчённые */
let perfAcc = 0, perfN = 0, perfLast = 0, perfLow = 0;

/* замер реальной длительности кадра (не игрового dt — стоп-кадры его искажают) */
function vfxPerf() {
  const t = performance.now();
  if (perfLast) {
    const d = Math.min(100, t - perfLast);
    perfAcc += d; perfN++;
    if (perfN >= 60) {
      const avg = perfAcc / perfN;
      perfAcc = 0; perfN = 0;
      /* дольше ~24 мс (меньше ~42 к/с) три замера подряд — облегчаем */
      if (avg > 24) { if (++perfLow >= 3 && FXQ) { FXQ = 0; } }
      else perfLow = 0;
    }
  }
  perfLast = t;
}

/* ---------- спрайт свечения ---------- */
const glowCache = {};
function glowSpr(col) {
  if (glowCache[col]) return glowCache[col];
  const S = 64, c = newCv(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, col);
  gr.addColorStop(0.35, col.replace(/rgb\(([^)]+)\)/, 'rgba($1,0.45)'));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return (glowCache[col] = c);
}
/* цвета свечений заданы как rgb(), чтобы собрать полупрозрачную середину */
const GLOW = { fire: 'rgb(255,170,80)', hot: 'rgb(255,236,180)', tracer: 'rgb(255,214,120)',
               etracer: 'rgb(255,110,90)', blue: 'rgb(140,220,255)' };

function glowAt(x, y, r, col, a) {
  const s = glowSpr(col);
  ctx.globalAlpha = a;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
}

/* ---------- новые виды частиц ---------- */
/* вызывается из верхнего слоя частиц в scene.js; true — нарисовано */
function drawPartX(p, al) {
  if (p.type === 'glow') {
    if (!FXQ && p.size < 20) return true;
    ctx.globalCompositeOperation = 'lighter';
    glowAt(p.x, p.y, p.size * (0.6 + 0.4 * al), p.col, al * 0.75);
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  if (p.type === 'column') {
    /* водяной столб: растёт и опадает, у основания пена, рядом тень */
    const t = 1 - al, H = p.size * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const w = p.r * (0.6 + t * 0.8);
    ctx.globalAlpha = 0.22 * al;
    ctx.fillStyle = '#021018';
    ctx.beginPath(); ctx.ellipse(p.x + H * SUN.x * 0.6, p.y + H * SUN.y * 0.35, w, w * 0.45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85 * al;
    ctx.fillStyle = '#e8fbff';
    ctx.beginPath();
    ctx.moveTo(p.x - w, p.y);
    ctx.quadraticCurveTo(p.x - w * 0.3, p.y - H * 0.6, p.x - w * 0.15, p.y - H);
    ctx.lineTo(p.x + w * 0.15, p.y - H);
    ctx.quadraticCurveTo(p.x + w * 0.3, p.y - H * 0.6, p.x + w, p.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,220,235,' + (0.55 * al).toFixed(3) + ')';
    ctx.fillRect(p.x + w * 0.1, p.y - H * 0.8, w * 0.5, H * 0.8);
    ctx.globalAlpha = 0.6 * al;
    ctx.strokeStyle = '#f4feff'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 1.4 + t * 4, (w * 1.4 + t * 4) * 0.5, 0, 0, TAU); ctx.stroke();
    return true;
  }
  return false;
}

/* огненный шар и свечение взрыва — дополняют boom() */
function boomGlow(x, y, pow) {
  /* размер свечения ограничен: цепочка крупных взрывов складывалась
     аддитивно и засвечивала весь остров */
  addP({ x, y, life: 0.22, max: 0.22, type: 'glow', size: Math.min(22, 13 * pow), col: GLOW.hot });
  addP({ x, y, life: 0.55, max: 0.55, type: 'glow', size: Math.min(40, 24 * pow), col: GLOW.fire });
  /* на воде — водяной столб, на суше — нет */
  if (isWater(x, y) && pow >= 0.8)
    addP({ x, y, life: 0.9, max: 0.9, type: 'column', size: 16 * pow, r: 3.2 * pow, layer: 1 });
}
function splashColumn(x, y, k) {
  addP({ x, y, life: 0.7, max: 0.7, type: 'column', size: 9 * k, r: 2 * k, layer: 1 });
}

/* ---------- носовой бурун ---------- */
function bowWave(e, H) {
  /* белый бурун под форштевнем: пятно пены, растёт со скоростью */
  const sp = Math.abs(e.spd || 0);
  if (sp < 18 || !FXQ) return;
  const k = Math.min(1, sp / 110);
  const L = (e.T ? e.T.r : 9) + 1.5;
  const bx = e.x + Math.cos(e.ang) * L, by = e.y + Math.sin(e.ang) * L;
  ctx.fillStyle = 'rgba(240,252,255,' + (0.18 + 0.3 * k).toFixed(2) + ')';
  ctx.beginPath(); ctx.ellipse(bx, by, 1.6 + k * 2.2, 1 + k * 1.2, e.ang, 0, TAU); ctx.fill();
}

/* ---------- чайки ---------- */
let gulls = [];
function gullsReset() {
  gulls = [];
  for (let i = 0; i < 9; i++) {
    const isl = islands.length ? pick(islands) : { x: CARR.x, y: CARR.y };
    gulls.push({ x: isl.x + rr(-120, 120), y: isl.y + rr(-120, 120), a: rr(0, TAU), v: rr(22, 34),
                 h: rr(18, 34), ph: rr(0, TAU), turn: rr(-0.5, 0.5), home: isl });
  }
}
function updGulls(dt) {
  for (const g of gulls) {
    /* кружат вокруг своего острова, от катера держатся подальше */
    const hx = g.home.x - g.x, hy = g.home.y - g.y;
    const want = Math.atan2(hy, hx) + 1.2;
    g.a += clamp(angDiff(g.a, want), -1, 1) * 0.5 * dt + g.turn * dt;
    if (player && dist(g.x, g.y, player.x, player.y) < 60) g.a += 2 * dt;
    g.x += Math.cos(g.a) * g.v * dt; g.y += Math.sin(g.a) * g.v * dt;
    g.ph += dt * (6 + g.v * 0.1);
    if (chance(0.004)) g.turn = rr(-0.5, 0.5);
  }
}
function drawGulls() {
  if (!FXQ || curCfg.ambient > 0.6) return;
  const vw = VW / cam.z, vh = VH / cam.z;
  for (const g of gulls) {
    if (g.x < ox - 40 || g.x > ox + vw + 40 || g.y < oy - 40 || g.y > oy + vh + 40) continue;
    const flap = Math.sin(g.ph), sx = g.x, sy = g.y - g.h;
    /* тень на воде */
    ctx.fillStyle = 'rgba(2,16,24,0.20)';
    ctx.fillRect(g.x + g.h * SUN.x * 0.6 - 1.5, g.y + g.h * SUN.y * 0.4, 3, 0.8);
    /* крылья «галочкой», взмах меняет изгиб */
    const c = Math.cos(g.a), s = Math.sin(g.a), px = -s, py = c;
    const wy = flap * 1.3;
    ctx.strokeStyle = '#f4f8fa'; ctx.lineWidth = D * 2;
    ctx.beginPath();
    ctx.moveTo(sx + px * 3.2 - c * 0.8, sy + py * 3.2 - s * 0.8 - wy);
    ctx.lineTo(sx, sy);
    ctx.lineTo(sx - px * 3.2 - c * 0.8, sy - py * 3.2 - s * 0.8 - wy);
    ctx.stroke();
    ctx.fillStyle = '#3a4650'; ctx.fillRect(sx - D, sy - D, D * 2, D * 2);
  }
}

/* ---------- солнечная дорожка ---------- */
/* мягкое пятно отражения солнца и искры в нём (экранные координаты) */
let sunGrad = null;
function drawSunGlint() {
  if (!FXQ) return;
  const amb = curCfg.ambient || 0;
  if (amb > 0.45) return;
  const k = 1 - amb / 0.45;
  const cx = VW * 0.78, cy = VH * 0.18;
  if (!sunGrad) {
    sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
    sunGrad.addColorStop(0, 'rgba(255,246,214,0.16)');
    sunGrad.addColorStop(0.5, 'rgba(255,240,200,0.05)');
    sunGrad.addColorStop(1, 'rgba(255,240,200,0)');
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k;
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, VW, VH);
  /* искры: хаотично, но гуще к центру дорожки */
  const tt = Math.floor(tGlobal * 6);
  for (let i = 0; i < 70; i++) {
    const s = i * 91.7 + tt * 53.1;
    const r = Math.pow(h1(s), 1.6) * 170, a = h1(s + 3.3) * TAU;
    const x = cx + Math.cos(a) * r * 1.3, y = cy + Math.sin(a) * r * 0.7;
    const al = (1 - r / 170) * (0.35 + 0.65 * h1(s + 7.7));
    ctx.fillStyle = 'rgba(255,250,225,' + (al * 0.8).toFixed(2) + ')';
    ctx.fillRect(x, y, D * (2 + (i % 3)), D);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- виньетка и цветокоррекция ---------- */
let vigGrad = null;
const GRADE = { tropic: 'rgba(255,214,150,0.10)', atoll: 'rgba(120,255,230,0.08)',
                rust: 'rgba(255,140,90,0.12)', ash: 'rgba(120,150,200,0.12)',
                jungle: 'rgba(150,255,170,0.08)' };
function drawPost() {
  if (FXQ) {
    /* мягкий свет «солнечного часа» поверх — у каждого биома свой */
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = GRADE[curCfg.biome] || GRADE.tropic;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!vigGrad) {
    /* радиусы от меньшей стороны и диагонали — верно при любых пропорциях кадра */
    vigGrad = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.42,
                                       VW / 2, VH / 2, Math.hypot(VW, VH) * 0.56);
    vigGrad.addColorStop(0, 'rgba(0,6,12,0)');
    vigGrad.addColorStop(1, 'rgba(0,6,12,0.42)');
  }
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, VW, VH);
}

/* ---------- полоска здоровья над кораблём ---------- */
function hpBar(x, y, w, frac, col) {
  ctx.fillStyle = 'rgba(4,12,18,0.8)';
  ctx.fillRect(x - w / 2 - 0.5, y - 0.5, w + 1, 2.4);
  ctx.fillStyle = col || (frac > 0.5 ? '#ff6b5e' : frac > 0.25 ? '#ffb454' : '#ffd94a');
  ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 1.4);
}

/* ---------- кильватер: непрерывная лента ---------- */
/* Каждый корабль оставляет точки за кормой. След рисуется кусками:
   бурун винтов по центру (широкий, быстро тает) и два расходящихся
   «уса» волн по бокам — классическая V-образная картина Кельвина.
   Куски по возрасту — по 2 штриха на кусок, дешево даже для флота. */
const WAKE_LIFE = 2.4, WAKE_STEP = 3.2, WAKE_PARTS = 8;
function shipWake(e, sternOff, halfW) {
  const now = tGlobal;
  if (!e._tr) e._tr = [];
  const tr = e._tr;
  const sx = e.x - Math.cos(e.ang) * sternOff, sy = e.y - Math.sin(e.ang) * sternOff;
  const sp = Math.abs(e.spd || 0);
  const k = Math.min(1, sp / 90);
  /* tr[0] — «голова» у самой кормы, ползёт за кораблём; как только
     отошла от последней закреплённой точки на шаг — закрепляется */
  const pt = () => ({ x: sx, y: sy, a: e.ang, t: now, k });
  if (!tr.length) tr.push(pt());
  if (tr.length === 1 || dist(tr[1].x, tr[1].y, sx, sy) > WAKE_STEP) tr.unshift(pt());
  else { const h = tr[0]; h.x = sx; h.y = sy; h.a = e.ang; h.t = now; h.k = k; }
  while (tr.length && now - tr[tr.length - 1].t > WAKE_LIFE) tr.pop();
  if (tr.length > 70) tr.length = 70;
  const n = tr.length;
  if (n < 2) return;
  const per = Math.max(1, Math.ceil((n - 1) / WAKE_PARTS));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let s0 = 0; s0 < n - 1; s0 += per) {
    const s1 = Math.min(n - 1, s0 + per);
    const pm = tr[Math.min(n - 1, (s0 + s1) >> 1)];
    const age = now - pm.t, f = Math.max(0, 1 - age / WAKE_LIFE), kk = pm.k;
    if (f <= 0 || kk < 0.04) continue;
    /* взбитая винтами пена: широкая бледная полоса и яркая сердцевина */
    ctx.strokeStyle = 'rgba(236,250,255,' + (0.16 * f * kk).toFixed(3) + ')';
    ctx.lineWidth = halfW * 1.6 + age * 3.2;
    ctx.beginPath();
    for (let i = s0; i <= s1; i++) { const p = tr[i]; if (i === s0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244,252,255,' + (0.38 * f * f * kk).toFixed(3) + ')';
    ctx.lineWidth = halfW * 0.8 + age * 1.4;
    ctx.beginPath();
    for (let i = s0; i <= s1; i++) { const p = tr[i]; if (i === s0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}
