'use strict';
/* ============================================================
   utils.js — математика, случайности, шум, форматирование
   ============================================================ */

const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const rr    = (a, b) => a + Math.random() * (b - a);
const ri    = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance= p => Math.random() < p;
const pick  = a => a[(Math.random() * a.length) | 0];

const dist  = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
const near  = (x1, y1, x2, y2, r) => dist2(x1, y1, x2, y2) < r * r;

/* дешёвый детерминированный хеш 0..1 */
const h1 = n => { n = Math.sin(n) * 43758.5453; return n - Math.floor(n); };
const h2 = (x, y) => h1(x * 127.1 + y * 311.7);

/* значение-шум с билинейной интерполяцией */
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
/* фрактальный шум: 3 октавы */
function fbm(x, y) {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.13, y * 2.13) * 0.3 + vnoise(x * 4.7, y * 4.7) * 0.15;
}

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function approach(cur, tgt, rate, dt) { return cur + (tgt - cur) * Math.min(1, rate * dt); }

function fmtT(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + String(ss).padStart(2, '0'); }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ease = {
  out : t => 1 - (1 - t) * (1 - t),
  out3: t => 1 - Math.pow(1 - t, 3),
  in  : t => t * t,
  io  : t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  pop : t => Math.sin(Math.min(1, t) * Math.PI)
};

/* rgba-строка из компонентов (без мусора в GC-хот-пути хватает) */
const rgba = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';

/* осветлить/затемнить #rrggbb: k<1 темнее, k>1 светлее */
function shade(hex, k) {
  const v = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((v >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((v >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((v & 255) * k), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
/* смешать два цвета #rrggbb */
function mix(h1c, h2c, t) {
  const a = parseInt(h1c.slice(1), 16), b = parseInt(h2c.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const c = Math.round(lerp(a & 255, b & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | c).toString(16).slice(1);
}
