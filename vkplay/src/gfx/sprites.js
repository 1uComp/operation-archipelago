'use strict';
/* ============================================================
   sprites.js — процедурные спрайты, генерируются один раз при загрузке.

   Все спрайты рисуются в ФИЗИЧЕСКИХ пикселях (SC пикселей на единицу
   разметки), поэтому при SC=4 деталей вчетверо больше по каждой оси.
   На экран они выводятся хелперами blit/blitC, которые делят размер
   обратно на SC — так спрайт занимает столько же места в мире,
   но состоит из вчетверо более мелких пикселей.
   Корабли ориентированы носом вверх и поворачиваются при отрисовке.
   ============================================================ */

function newCv(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* вывод спрайта в мировых единицах */
function blit(spr, x, y) {
  ctx.drawImage(spr, x, y, spr.width / SC, spr.height / SC);
}
function blitC(spr, cx, cy) {
  ctx.drawImage(spr, cx - spr.width / (2 * SC), cy - spr.height / (2 * SC),
                spr.width / SC, spr.height / SC);
}

/* Контур корпуса: острый нос с плавными скулами, прямой борт,
   скруглённая корма с транцем. (cx, y0) — нос, L — длина, HW — полуширина. */
function hullPath(g, cx, y0, L, HW, bow, stern) {
  const b = L * (bow || 0.30), s = stern || 0.78;
  g.beginPath();
  g.moveTo(cx, y0);
  g.bezierCurveTo(cx + HW * 0.50, y0 + b * 0.18, cx + HW, y0 + b * 0.62, cx + HW, y0 + b);
  g.lineTo(cx + HW, y0 + L * 0.88);
  g.quadraticCurveTo(cx + HW, y0 + L, cx + HW * s, y0 + L);
  g.lineTo(cx - HW * s, y0 + L);
  g.quadraticCurveTo(cx - HW, y0 + L, cx - HW, y0 + L * 0.88);
  g.lineTo(cx - HW, y0 + b);
  g.bezierCurveTo(cx - HW, y0 + b * 0.62, cx - HW * 0.50, y0 + b * 0.18, cx, y0);
  g.closePath();
}
/* скруглённый прямоугольник */
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
/* объёмный блок надстройки: тень, стенки, крыша со светлой кромкой */
function block(g, x, y, w, h, col, u, rad) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rrect(g, x + u * 0.5, y + u * 0.8, w, h, rad || u * 0.6); g.fill();
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, shade(col, 1.18)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, 0.72));
  g.fillStyle = gr;
  rrect(g, x, y, w, h, rad || u * 0.6); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, u * 0.22); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(x + u * 0.3, y + u * 0.25, w - u * 0.6, Math.max(1, u * 0.3));
}
/* орудийная башня: круглая броня и ствол к носу */
function turretArt(g, x, y, r, col, u, twin) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(x + u * 0.4, y + u * 0.6, r, 0, TAU); g.fill();
  g.fillStyle = '#10161c';
  const bl = r * 1.9, bw = Math.max(1, u * 0.42);
  for (const dx of (twin ? [-r * 0.32, r * 0.32] : [0])) g.fillRect(x + dx - bw / 2, y - bl, bw, bl);
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, shade(col, 1.35)); gr.addColorStop(1, shade(col, 0.7));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.2); g.stroke();
}

/* ------------------------------------------------------------
   Корпус корабля (векторный рисунок в физических пикселях).
   opt: bridge — надстройка с окнами и мачтой; guns — башни (доля
   длины от носа); pods — ракетные контейнеры; mast — только мачта.
   ------------------------------------------------------------ */
function makeShip(lenU, halfU, C, opt) {
  opt = opt || {};
  const u = SC;
  const L  = Math.max(10, Math.round(lenU * u));
  const HW = Math.max(2, Math.round(halfU * u));
  const w  = HW * 2 + 7, h = L + 5;
  const c = newCv(w, h), g = c.getContext('2d');
  const cx = w / 2, y0 = 2;

  /* корпус: светотень поперёк — левый борт на солнце, правый в тени */
  const hg = g.createLinearGradient(cx - HW, 0, cx + HW, 0);
  hg.addColorStop(0, C.lit || shade(C.hull, 1.25));
  hg.addColorStop(0.45, C.hull);
  hg.addColorStop(1, C.dk);
  hullPath(g, cx, y0, L, HW);
  g.fillStyle = hg; g.fill();
  g.strokeStyle = C.out; g.lineWidth = Math.max(1, u * 0.38); g.stroke();
  /* планширь — светлая кромка по борту */
  g.save();
  g.translate(cx, y0 + L / 2); g.scale(0.9, 0.955); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW);
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = Math.max(1, u * 0.22); g.stroke();
  g.restore();

  /* палуба с досками */
  g.save();
  g.translate(cx, y0 + L / 2); g.scale(0.74, 0.9); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW);
  g.fillStyle = C.deck; g.fill();
  g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = Math.max(1, u * 0.14);
  for (let x = cx - HW; x < cx + HW; x += u * 0.9) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + L); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(cx - HW, y0, HW * 0.7, L);
  g.restore();
  /* тень борта на палубе */
  g.save();
  g.translate(cx, y0 + L / 2); g.scale(0.74, 0.9); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW);
  g.strokeStyle = 'rgba(0,0,0,0.30)'; g.lineWidth = Math.max(1, u * 0.35); g.stroke();
  g.restore();

  /* нос: брашпиль и якорная цепь */
  g.fillStyle = '#20282e';
  g.beginPath(); g.arc(cx, y0 + L * 0.11, Math.max(1, u * 0.45), 0, TAU); g.fill();
  g.fillStyle = C.acc; g.fillRect(cx - Math.max(1, u * 0.2), y0 + u * 0.4, Math.max(1, u * 0.4), u * 0.9);
  /* кормовой транец и флагшток */
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(cx - HW * 0.7, y0 + L - u * 0.7, HW * 1.4, u * 0.7);
  g.fillStyle = C.acc;
  g.fillRect(cx + HW * 0.35, y0 + L - u * 1.7, Math.max(1, u * 0.9), Math.max(1, u * 0.55));

  /* леерные стойки по кромке */
  if (u >= 3 && HW >= u * 2) {
    g.fillStyle = 'rgba(230,240,245,0.45)';
    for (let t = 0.3; t < 0.86; t += 0.07) {
      const y = y0 + L * t;
      g.fillRect(cx - HW * 0.84, y, Math.max(1, u * 0.22), Math.max(1, u * 0.22));
      g.fillRect(cx + HW * 0.84 - u * 0.2, y, Math.max(1, u * 0.22), Math.max(1, u * 0.22));
    }
  }

  /* ракетные контейнеры */
  if (opt.pods) {
    const y = y0 + L * 0.26, pw = HW * 0.62, ph = u * 1.2;
    for (const sx of [-1, 1]) {
      g.save(); g.translate(cx + sx * pw * 0.55, y + ph); g.rotate(sx * 0.18);
      block(g, -pw / 2, -ph / 2, pw, ph * 2.2, '#5c4a52', u, u * 0.3);
      g.fillStyle = '#ff6b3d';
      for (let k = 0; k < 3; k++) g.fillRect(-pw / 2 + u * 0.3 + k * (pw - u * 0.6) / 3, -ph / 2 + u * 0.2, (pw - u * 1.2) / 3, u * 0.5);
      g.restore();
    }
  }
  /* башни главного калибра */
  if (opt.guns) for (const gy of opt.guns)
    turretArt(g, cx, y0 + L * gy, Math.max(u * 0.9, HW * 0.52), C.sup || C.deck, u, HW >= u * 4);

  /* надстройка: рубка с окнами, мачта, радар, спасательные круги */
  if (opt.bridge) {
    const bw = HW * 1.15, bh = Math.max(u * 2.4, L * 0.2), by = y0 + L * 0.48;
    block(g, cx - bw / 2, by, bw, bh, C.sup || shade(C.deck, 1.25), u, u * 0.7);
    /* лобовое остекление смотрит в нос */
    g.fillStyle = '#0c1a24';
    rrect(g, cx - bw / 2 + u * 0.5, by + u * 0.45, bw - u, Math.max(1, u * 0.8), u * 0.3); g.fill();
    g.fillStyle = C.glass || '#9fe8ff';
    g.fillRect(cx - bw / 2 + u * 0.8, by + u * 0.55, (bw - u * 1.6) * 0.45, Math.max(1, u * 0.28));
    /* второй ярус */
    if (L > 18 * u) block(g, cx - bw * 0.32, by + bh * 0.42, bw * 0.64, bh * 0.44, shade(C.sup || C.deck, 1.1), u, u * 0.5);
    /* мачта с реей и радаром */
    const my = by + bh * 0.62;
    g.strokeStyle = '#1a2228'; g.lineWidth = Math.max(1, u * 0.3);
    g.beginPath(); g.moveTo(cx - HW * 0.7, my); g.lineTo(cx + HW * 0.7, my); g.stroke();
    g.fillStyle = '#d8e2e8';
    g.beginPath(); g.ellipse(cx, my, u * 0.9, u * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = C.acc; g.fillRect(cx - u * 0.25, my - u * 0.25, u * 0.5, u * 0.5);
    /* спасательные круги на бортах рубки */
    for (const sx of [-1, 1]) {
      const rx = cx + sx * (bw / 2 + u * 0.1), ry = by + bh * 0.7, r = Math.max(1, u * 0.45);
      g.strokeStyle = '#ff7a3d'; g.lineWidth = Math.max(1, u * 0.35);
      g.beginPath(); g.arc(rx, ry, r, 0, TAU); g.stroke();
    }
  }
  /* мелочи на корме: кнехты и люк */
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(cx - HW * 0.45, y0 + L * 0.84, Math.max(1, u * 0.5), Math.max(1, u * 0.5));
  g.fillRect(cx + HW * 0.35, y0 + L * 0.84, Math.max(1, u * 0.5), Math.max(1, u * 0.5));
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(1, u * 0.18);
  g.strokeRect(cx - HW * 0.25, y0 + L * 0.72, HW * 0.5, u * 1.2);
  return c;
}

/* катер игрока: башня рисуется отдельно (поворачивается), на носу пусто */
const PLAYER_GUN_OFF = 5;          /* башня вынесена вперёд от центра, ед. мира */
const sprPlayer = makeShip(24, 4.3,
  { out: '#16222c', hull: '#b9c8cf', dk: '#6d808b', deck: '#8ea3ad',
    acc: '#ffd94a', sup: '#d4e1e7', glass: '#8fe4ff', lit: '#eef5f8' },
  { bridge: true });

const SHIP_SPR = {
  patrol : makeShip(15, 2.6, { out: '#0f151b', hull: '#6b5a60', dk: '#352b30', deck: '#54474c',
                               acc: '#e5484d', lit: '#8e7d82', sup: '#7a6a70', glass: '#c9a0a0' }, { guns: [0.3] }),
  gun    : makeShip(19, 3.2, { out: '#10161c', hull: '#5a6a73', dk: '#2f3a42', deck: '#46545d',
                               acc: '#e5484d', lit: '#7d8f98', sup: '#6f7f88', glass: '#9fe8ff' }, { bridge: true, guns: [0.22] }),
  missile: makeShip(21, 3.2, { out: '#151018', hull: '#62576c', dk: '#352d3c', deck: '#4d4456',
                               acc: '#ff6b3d', lit: '#877b93', sup: '#756a80', glass: '#c0a8ff' }, { bridge: true, pods: true }),
  frigate: makeShip(30, 5, { out: '#0d1218', hull: '#4f5f6a', dk: '#27313a', deck: '#3d4a54',
                             acc: '#e5484d', sup: '#627482', lit: '#728795', glass: '#9fe8ff' },
                    { bridge: true, guns: [0.18, 0.85] })
};

/* ============================================================
   Линкор «Левиафан».

   Корпус и надстройки запечены в спрайт, а четыре башни главного
   калибра — отдельный спрайт: они разворачиваются на игрока и
   откатываются при выстреле (см. drawBoss в scene.js).
   ============================================================ */
const BOSS_TURRETS = [-0.30, -0.19, 0.20, 0.31];   /* смещения башен вдоль корпуса, доли длины */

const sprBoss = (function () {
  const u = SC, L = Math.round(64 * u), HW = Math.round(11 * u);
  const w = HW * 2 + 10, h = L + 8;
  const c = newCv(w, h), g = c.getContext('2d');
  const cx = Math.round(w / 2), y0 = 4;
  const C = {
    out: '#080d12', hull: '#3f4c57', lit: '#5d6f7c', dk: '#212a32',
    deck: '#2e3a43', deck2: '#3a4750', steel: '#55646f', steel2: '#6d7f8b',
    glass: '#ffb46b', acc: '#e5484d', wood: '#4d4130', rust: '#7a4a38'
  };
  const px = Math.max(1, Math.round(u / 2));

  /* профиль корпуса: острый нос, длинная цитадель, срезанная корма */
  const hw = [];
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1); let v;
    if (t < 0.17) v = 0.08 + 0.92 * Math.pow(t / 0.17, 0.60);
    else if (t < 0.80) v = 1;
    else v = 1 - 0.40 * Math.pow((t - 0.80) / 0.20, 1.15);
    hw.push(Math.max(1, Math.round(v * HW)));
  }
  const rowY = i => y0 + i;

  /* тень на воде */
  for (let i = 0; i < L; i++) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(cx - hw[i] - 2, rowY(i) + u * 0.7, hw[i] * 2 + 5, 1);
  }
  /* контур и борта */
  for (let i = 0; i < L; i++) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = C.out;  g.fillRect(cx - r - 2, y, r * 2 + 5, 1);
    g.fillStyle = C.hull; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = C.lit;  g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.30)), 1);
    g.fillStyle = C.dk;   g.fillRect(cx + r - Math.max(1, Math.round(r * 0.24)) + 1,
                                     y, Math.max(1, Math.round(r * 0.24)), 1);
  }
  /* красная ватерлиния по самой кромке */
  for (let i = 2; i < L - 2; i++) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = 'rgba(150,44,44,0.85)';
    g.fillRect(cx - r, y, px, 1);
    g.fillRect(cx + r - px + 1, y, px, 1);
  }
  /* броневой пояс — тёмная полоса чуть внутрь борта */
  for (let i = Math.round(L * 0.14); i < L * 0.86; i++) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = 'rgba(18,24,30,0.45)';
    g.fillRect(cx - r + px, y, px * 2, 1);
    g.fillRect(cx + r - px * 3 + 1, y, px * 2, 1);
  }

  /* палуба */
  const inset = Math.max(2, Math.round(HW * 0.34));
  for (let i = px * 2; i < L - px * 2; i++) {
    const q = hw[i] - inset;
    if (q >= 1) { g.fillStyle = C.deck; g.fillRect(cx - q, rowY(i), q * 2 + 1, 1); }
  }
  /* дощатый настил */
  for (let i = px * 3; i < L - px * 3; i += Math.max(2, Math.round(u * 0.8))) {
    const q = hw[i] - inset;
    if (q >= 1) { g.fillStyle = C.deck2; g.fillRect(cx - q, rowY(i), q * 2 + 1, 1); }
  }
  /* продольные швы настила */
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let k = -2; k <= 2; k++)
    g.fillRect(cx + k * Math.round(HW * 0.30), rowY(px * 3), 1, L - px * 6);

  /* казематы второго калибра по бортам */
  for (let i = Math.round(L * 0.30); i < L * 0.72; i += Math.round(u * 3)) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = C.out;  g.fillRect(cx - r + px, y - px, px * 2 + 1, px * 2);
    g.fillStyle = C.steel; g.fillRect(cx - r + px + 1, y - px + 1, px * 2 - 1, px * 2 - 2);
    g.fillStyle = C.out;  g.fillRect(cx + r - px * 3, y - px, px * 2 + 1, px * 2);
    g.fillStyle = C.steel; g.fillRect(cx + r - px * 3 + 1, y - px + 1, px * 2 - 1, px * 2 - 2);
  }

  /* барбеты под башни — тёмные круги, чтобы башня «сидела» в корпусе */
  for (const t of BOSS_TURRETS) {
    const y = rowY(Math.round((0.5 + t) * L)), br = Math.round(HW * 0.62);
    g.fillStyle = C.out;
    g.beginPath(); g.arc(cx, y, br + 1, 0, TAU); g.fill();
    g.fillStyle = C.steel;
    g.beginPath(); g.arc(cx, y, br, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.arc(cx, y + px, br * 0.8, 0, TAU); g.fill();
  }

  /* --- надстройка: башенноподобная мачта в носовой части --- */
  const supY = Math.round(L * 0.40);
  const tier = (yy, hh, ww, col) => {
    g.fillStyle = C.out;  g.fillRect(cx - ww - 1, yy - 1, ww * 2 + 3, hh + 2);
    g.fillStyle = col;    g.fillRect(cx - ww, yy, ww * 2 + 1, hh);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(cx - ww, yy, ww * 2 + 1, 1);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(cx - ww, yy + hh - 1, ww * 2 + 1, 1);
  };
  tier(supY, Math.round(u * 7), Math.round(HW * 0.58), C.steel);
  tier(supY + Math.round(u * 1.2), Math.round(u * 4.6), Math.round(HW * 0.42), C.steel2);
  tier(supY + Math.round(u * 2.4), Math.round(u * 2.4), Math.round(HW * 0.26), C.steel2);
  /* окна ходового мостика */
  g.fillStyle = C.glass;
  g.fillRect(cx - Math.round(HW * 0.36), supY + Math.round(u * 1.6), Math.round(HW * 0.72), px);
  /* дальномер поперёк мачты */
  g.fillStyle = C.out;
  g.fillRect(cx - Math.round(HW * 0.72), supY + Math.round(u * 0.5), Math.round(HW * 1.44), px);
  /* решётка РЛС на верхушке */
  g.fillStyle = C.steel2;
  g.fillRect(cx - Math.round(HW * 0.30), supY - Math.round(u * 1.4), Math.round(HW * 0.6), px);
  g.fillStyle = C.out;
  for (let k = 0; k < 4; k++)
    g.fillRect(cx - Math.round(HW * 0.24) + k * Math.round(HW * 0.16), supY - Math.round(u * 1.4), 1, px);
  g.fillStyle = C.acc;
  g.fillRect(cx - 1, supY - Math.round(u * 3.2), 2, Math.round(u * 1.8));

  /* --- две трубы с козырьками и копотью --- */
  const funnel = (yy) => {
    const fw = Math.round(HW * 0.44), fh = Math.round(u * 3.4);
    g.fillStyle = C.out;   g.fillRect(cx - fw - 1, yy - 1, fw * 2 + 3, fh + 2);
    g.fillStyle = C.steel; g.fillRect(cx - fw, yy, fw * 2 + 1, fh);
    g.fillStyle = '#151b20'; g.fillRect(cx - fw + px, yy + px, fw * 2 - px * 2 + 1, fh - px * 2);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - fw, yy, fw * 2 + 1, 1);
    g.fillStyle = C.acc;   g.fillRect(cx - fw, yy + fh - px * 2, fw * 2 + 1, px);
  };
  funnel(Math.round(L * 0.50));
  funnel(Math.round(L * 0.59));

  /* --- кормовая мачта и катапульта с гидросамолётом --- */
  const aftY = Math.round(L * 0.66);
  g.fillStyle = C.out;   g.fillRect(cx - px, aftY, px * 2, Math.round(u * 3));
  g.fillStyle = C.steel2; g.fillRect(cx - Math.round(HW * 0.5), aftY + px, Math.round(HW), px);
  const catY = Math.round(L * 0.71);
  g.fillStyle = C.wood;  g.fillRect(cx - Math.round(HW * 0.16), catY, Math.round(HW * 0.32), Math.round(u * 5));
  g.fillStyle = '#39454e';
  g.fillRect(cx - px, catY + Math.round(u * 1.2), px * 2, Math.round(u * 2.4));
  g.fillRect(cx - Math.round(HW * 0.42), catY + Math.round(u * 2), Math.round(HW * 0.84), px);
  g.fillStyle = '#9fe8ff'; g.fillRect(cx - px / 2, catY + Math.round(u * 1.5), px, px);

  /* --- зенитные гнёзда по бортам --- */
  for (let k = 0; k < 6; k++) {
    const i = Math.round(L * (0.34 + k * 0.07));
    const r = hw[i] - inset - px, y = rowY(i);
    for (const sx of [-1, 1]) {
      g.fillStyle = C.out;
      g.beginPath(); g.arc(cx + sx * r, y, px * 1.6, 0, TAU); g.fill();
      g.fillStyle = C.steel2;
      g.beginPath(); g.arc(cx + sx * r, y, px * 1.1, 0, TAU); g.fill();
      g.fillStyle = C.out;
      g.fillRect(cx + sx * r - px * 0.3, y - px * 2.4, px * 0.7, px * 2);
    }
  }

  /* --- нос: якоря, клюзы, бурун --- */
  g.fillStyle = C.out;
  g.fillRect(cx - Math.round(HW * 0.5), rowY(Math.round(L * 0.10)), px * 2, px * 2);
  g.fillRect(cx + Math.round(HW * 0.5) - px, rowY(Math.round(L * 0.10)), px * 2, px * 2);
  g.fillStyle = C.acc; g.fillRect(cx - 1, y0, 2, Math.round(u * 1.2));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(cx - 1, y0 + Math.round(u * 0.4), 2, 1);

  /* --- корма: транец и флагшток --- */
  const yb = L - Math.round(u * 1.6);
  g.fillStyle = C.dk;  g.fillRect(cx - hw[yb] + 1, rowY(yb), hw[yb] * 2 - 1, Math.round(u * 1.2));
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - hw[yb] + 1, rowY(yb), hw[yb] * 2 - 1, 1);
  g.fillStyle = C.acc; g.fillRect(cx - 1, rowY(L - 1), 2, Math.round(u * 1.4));

  /* --- бортовой номер и полосы опознавания --- */
  g.fillStyle = 'rgba(230,238,242,0.75)';
  g.fillRect(cx - Math.round(HW * 0.75), rowY(Math.round(L * 0.235)), px, px * 3);
  g.fillRect(cx - Math.round(HW * 0.75) + px * 2, rowY(Math.round(L * 0.235)), px, px * 3);
  for (let y = Math.round(L * 0.12); y < L * 0.88; y += Math.round(u * 6)) {
    g.fillStyle = 'rgba(229,72,77,0.35)';
    g.fillRect(cx - HW + px, rowY(y), HW * 2 - px * 2, 1);
  }
  /* заклёпки и потёки ржавчины */
  for (let i = 0; i < 90; i++) {
    const yy = ri(Math.round(L * 0.1), Math.round(L * 0.9));
    const r = hw[yy];
    const sx = chance(0.5) ? -1 : 1;
    g.fillStyle = chance(0.25) ? C.rust : 'rgba(0,0,0,0.25)';
    g.fillRect(cx + sx * (r - ri(1, Math.max(2, px * 2))), rowY(yy), 1, ri(1, px));
  }
  return c;
})();

/* башня главного калибра: спарка стволов, смотрит вверх */
const sprBossTurret = (function () {
  const u = SC, W = Math.round(11 * u), H = Math.round(17 * u);
  const c = newCv(W, H), g = c.getContext('2d');
  const cx = Math.round(W / 2), cy = Math.round(H * 0.72);  /* центр вращения */
  const px = Math.max(1, Math.round(u / 2));

  /* стволы */
  for (const dx of [-Math.round(u * 1.5), Math.round(u * 1.5)]) {
    g.fillStyle = '#080d12';
    g.fillRect(cx + dx - px * 1.2, cy - Math.round(u * 10), px * 2.4, Math.round(u * 10));
    g.fillStyle = '#2b353d';
    g.fillRect(cx + dx - px * 0.8, cy - Math.round(u * 10), px * 1.6, Math.round(u * 10));
    g.fillStyle = '#0d1318';
    g.fillRect(cx + dx - px * 1.2, cy - Math.round(u * 10), px * 2.4, px * 1.5);
  }
  /* лоб башни */
  g.fillStyle = '#080d12';
  g.fillRect(cx - Math.round(u * 3.4), cy - Math.round(u * 3.6), Math.round(u * 6.8), Math.round(u * 6.4));
  g.fillStyle = '#4d5c67';
  g.fillRect(cx - Math.round(u * 3.0), cy - Math.round(u * 3.2), Math.round(u * 6.0), Math.round(u * 5.6));
  g.fillStyle = '#63737f';
  g.fillRect(cx - Math.round(u * 3.0), cy - Math.round(u * 3.2), Math.round(u * 6.0), Math.round(u * 1.2));
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(cx - Math.round(u * 3.0), cy + Math.round(u * 1.6), Math.round(u * 6.0), Math.round(u * 0.8));
  /* смотровой колпак и поручни */
  g.fillStyle = '#080d12';
  g.beginPath(); g.arc(cx, cy - Math.round(u * 0.4), px * 1.6, 0, TAU); g.fill();
  g.fillStyle = '#7b8c98';
  g.beginPath(); g.arc(cx, cy - Math.round(u * 0.4), px, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(cx - Math.round(u * 2.6), cy - Math.round(u * 2.4), Math.round(u * 5.2), 1);
  g.fillStyle = '#e5484d';
  g.fillRect(cx - Math.round(u * 0.5), cy + Math.round(u * 2.0), Math.round(u * 1.0), px);
  return c;
})();

/* ---------- подводная лодка ---------- */
const sprSub = (function () {
  const u = SC, L = Math.round(24 * u), HW = Math.round(3.4 * u);
  const c = newCv(HW * 2 + 6, L + 4), g = c.getContext('2d');
  const cx = Math.round(c.width / 2), y0 = 2, px = Math.max(1, Math.round(u / 2));
  const hw = [];
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1);
    /* сигара: острый нос, тупая корма */
    const v = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.92 + 0.14);
    hw.push(Math.max(1, Math.round(v * HW)));
  }
  for (let i = 0; i < L; i++) {
    const r = hw[i], y = y0 + i;
    g.fillStyle = '#0c1116'; g.fillRect(cx - r - 1, y, r * 2 + 3, 1);
    g.fillStyle = '#2f3841'; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = '#414d57'; g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.42)), 1);
    g.fillStyle = '#1b222a'; g.fillRect(cx + r - px, y, px, 1);
  }
  /* палубный настил вдоль корпуса */
  g.fillStyle = '#39434d';
  g.fillRect(cx - px, y0 + Math.round(L * 0.14), px * 2, Math.round(L * 0.72));
  /* рубка */
  const ty = y0 + Math.round(L * 0.38), th = Math.round(u * 5);
  g.fillStyle = '#0c1116'; g.fillRect(cx - px * 3, ty - 1, px * 6, th + 2);
  g.fillStyle = '#414d57'; g.fillRect(cx - px * 2.5, ty, px * 5, th);
  g.fillStyle = '#55636f'; g.fillRect(cx - px * 2.5, ty, px * 2, th);
  /* перископ и антенна */
  g.fillStyle = '#0c1116';
  g.fillRect(cx - px * 0.4, ty - px * 3, px * 0.8, px * 3);
  g.fillStyle = '#8b9aa5'; g.fillRect(cx + px * 1.2, ty - px * 2, px * 0.6, px * 2);
  /* палубное орудие и горизонтальные рули */
  g.fillStyle = '#0c1116';
  g.fillRect(cx - px, ty + th + px, px * 2, px * 3);
  g.fillStyle = '#1b222a';
  g.fillRect(cx - HW - px * 2, y0 + Math.round(L * 0.86), px * 2, px * 2);
  g.fillRect(cx + HW, y0 + Math.round(L * 0.86), px * 2, px * 2);
  /* красная маркировка */
  g.fillStyle = '#a03038'; g.fillRect(cx - px * 2, y0 + Math.round(L * 0.22), px * 4, px);
  return c;
})();

/* ---------- глубинная бомба ---------- */
const sprDC = (function () {
  const u = SC, c = newCv(6 * u, 7 * u), g = c.getContext('2d');
  const cx = 3 * u;
  g.fillStyle = '#1a1f24'; g.fillRect(cx - u * 1.5, u, u * 3, u * 4.6);
  g.fillStyle = '#39454e'; g.fillRect(cx - u * 1.2, u * 1.2, u * 2.4, u * 4.2);
  g.fillStyle = '#4f5d67'; g.fillRect(cx - u * 1.2, u * 1.2, u * 0.9, u * 4.2);
  g.fillStyle = '#1a1f24';
  g.fillRect(cx - u * 1.5, u * 2.2, u * 3, u * 0.4);
  g.fillRect(cx - u * 1.5, u * 4.0, u * 3, u * 0.4);
  g.fillStyle = '#e5484d'; g.fillRect(cx - u * 0.5, u * 0.3, u, u * 0.9);
  return c;
})();

/* ---------- транспорт конвоя ---------- */
const sprTransport = (function () {
  const u = SC, L = Math.round(34 * u), HW = Math.round(6 * u);
  const c = newCv(HW * 2 + 8, L + 6), g = c.getContext('2d');
  const cx = c.width / 2, y0 = 3;
  const hg = g.createLinearGradient(cx - HW, 0, cx + HW, 0);
  hg.addColorStop(0, '#7b8893'); hg.addColorStop(0.45, '#56626d'); hg.addColorStop(1, '#2f3840');
  hullPath(g, cx, y0, L, HW, 0.18, 0.85);
  g.fillStyle = hg; g.fill();
  g.strokeStyle = '#11171c'; g.lineWidth = Math.max(1, u * 0.4); g.stroke();
  /* зелёная полоса своего судна */
  g.save(); g.translate(cx, y0 + L / 2); g.scale(0.93, 0.97); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW, 0.18, 0.85);
  g.strokeStyle = 'rgba(74,222,128,0.7)'; g.lineWidth = Math.max(1, u * 0.35); g.stroke();
  g.restore();
  /* трюмы с контейнерами */
  const cols = ['#b5523b', '#3b7bb5', '#c9a13b', '#4f9a5b', '#8a4fb5'];
  for (let k = 0; k < 3; k++) {
    const y = y0 + L * (0.16 + k * 0.18);
    g.fillStyle = '#1c2328'; rrect(g, cx - HW + u, y, HW * 2 - 2 * u, 5 * u, u * 0.5); g.fill();
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) {
      const col = cols[(k * 3 + r * 2 + q) % cols.length];
      block(g, cx - HW + 1.6 * u + q * (HW - 1.2 * u), y + 0.5 * u + r * 2.2 * u, HW - 1.8 * u, 1.9 * u, col, u, u * 0.2);
    }
  }
  /* стрелы кранов */
  g.strokeStyle = '#d8b24a'; g.lineWidth = Math.max(1, u * 0.45);
  for (const t of [0.33, 0.51]) {
    g.beginPath(); g.moveTo(cx - HW * 0.7, y0 + L * t); g.lineTo(cx + HW * 0.6, y0 + L * t - 2 * u); g.stroke();
  }
  /* надстройка на корме, труба с зелёной полосой */
  block(g, cx - HW + u, y0 + L * 0.72, HW * 2 - 2 * u, 6 * u, '#c2ccd2', u, u * 0.6);
  g.fillStyle = '#0c1a24'; g.fillRect(cx - HW + 1.6 * u, y0 + L * 0.72 + 0.5 * u, HW * 2 - 3.2 * u, u * 0.9);
  g.fillStyle = '#9fe8ff'; g.fillRect(cx - HW + 2 * u, y0 + L * 0.72 + 0.6 * u, HW * 0.8, u * 0.35);
  g.fillStyle = '#2a3238'; rrect(g, cx - 1.6 * u, y0 + L * 0.72 + 3.6 * u, 3.2 * u, 3.4 * u, u * 0.6); g.fill();
  g.fillStyle = '#4ade80'; g.fillRect(cx - 1.6 * u, y0 + L * 0.72 + 4.2 * u, 3.2 * u, u * 0.7);
  return c;
})();

/* ---------- босс-авианосец «ГРОЗА» ---------- */
const sprBossCarrier = (function () {
  const u = SC, L = Math.round(70 * u), HW = Math.round(13 * u);
  const c = newCv(HW * 2 + 10, L + 8), g = c.getContext('2d');
  const cx = Math.round(c.width / 2), y0 = 4, px = Math.max(1, Math.round(u / 2));
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1); let v;
    if (t < 0.12) v = 0.34 + 0.66 * Math.pow(t / 0.12, 0.7);
    else if (t < 0.88) v = 1;
    else v = 1 - 0.34 * ((t - 0.88) / 0.12);
    const r = Math.round(v * HW), y = y0 + i;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(cx - r - 2, y + px * 2, r * 2 + 5, 1);
    g.fillStyle = '#0a0f14'; g.fillRect(cx - r - 2, y, r * 2 + 5, 1);
    g.fillStyle = '#3b4750'; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = '#4d5b66'; g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.22)), 1);
    g.fillStyle = 'rgba(150,44,44,0.8)'; g.fillRect(cx - r, y, px, 1);
    g.fillStyle = 'rgba(150,44,44,0.8)'; g.fillRect(cx + r - px + 1, y, px, 1);
  }
  /* полётная палуба */
  g.fillStyle = '#2b333a'; g.fillRect(cx - HW + px * 2, y0 + Math.round(L * 0.06), HW * 2 - px * 4, Math.round(L * 0.88));
  /* угловая палуба слева */
  g.fillStyle = '#252c33';
  g.fillRect(cx - HW - px * 2, y0 + Math.round(L * 0.30), HW + px * 2, Math.round(L * 0.42));
  /* осевая разметка и зона посадки */
  for (let y = Math.round(L * 0.12); y < L * 0.9; y += Math.round(u * 7)) {
    g.fillStyle = '#e8f0f2'; g.fillRect(cx - px, y0 + y, px * 2, Math.round(u * 3.4));
  }
  g.fillStyle = '#e5484d';
  g.fillRect(cx - HW + px * 3, y0 + Math.round(L * 0.10), HW * 2 - px * 6, px);
  g.fillRect(cx - HW + px * 3, y0 + Math.round(L * 0.92), HW * 2 - px * 6, px);
  /* аэрофинишёры */
  g.fillStyle = '#1c2229';
  for (let k = 0; k < 4; k++)
    g.fillRect(cx - HW + px * 2, y0 + Math.round(L * (0.70 + k * 0.05)), HW * 2 - px * 4, px * 0.7);
  /* остров-надстройка справа */
  const iy = y0 + Math.round(L * 0.40);
  g.fillStyle = '#0a0f14'; g.fillRect(cx + HW - px * 5, iy, px * 7, Math.round(u * 16));
  g.fillStyle = '#55636f'; g.fillRect(cx + HW - px * 4.4, iy + px, px * 6, Math.round(u * 15));
  g.fillStyle = '#9fe8ff';
  for (let k = 0; k < 3; k++)
    g.fillRect(cx + HW - px * 3.6, iy + px * (2 + k * 3), px * 4.4, px);
  g.fillStyle = '#e5484d'; g.fillRect(cx + HW - px * 2, iy - px * 5, px, px * 5);
  g.fillStyle = '#8b9aa5'; g.fillRect(cx + HW - px * 4, iy - px * 3, px * 5, px);
  /* самолёты на палубе */
  const deckPlane = (x, y, ang) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = '#39454e';
    g.fillRect(-px * 0.9, -px * 4, px * 1.8, px * 8);
    g.fillRect(-px * 4, -px * 0.9, px * 8, px * 1.8);
    g.fillStyle = '#4f5d67'; g.fillRect(-px * 4, -px * 0.9, px * 8, px * 0.7);
    g.fillStyle = '#e5484d'; g.fillRect(-px * 0.5, -px * 4.4, px, px);
    g.restore();
  };
  deckPlane(cx - HW * 0.5, y0 + Math.round(L * 0.20), 0.4);
  deckPlane(cx + HW * 0.3, y0 + Math.round(L * 0.20), -0.3);
  deckPlane(cx - HW * 0.5, y0 + Math.round(L * 0.80), 0.2);
  deckPlane(cx + HW * 0.3, y0 + Math.round(L * 0.86), -0.5);
  /* зенитные спонсоны по бортам */
  for (let k = 0; k < 7; k++) {
    const y = y0 + Math.round(L * (0.16 + k * 0.11));
    for (const sx of [-1, 1]) {
      g.fillStyle = '#0a0f14';
      g.beginPath(); g.arc(cx + sx * (HW + px), y, px * 1.7, 0, TAU); g.fill();
      g.fillStyle = '#63707c';
      g.beginPath(); g.arc(cx + sx * (HW + px), y, px * 1.1, 0, TAU); g.fill();
    }
  }
  return c;
})();

/* ---------- босс-монитор «КРЕПОСТЬ» ---------- */
const sprBossMonitor = (function () {
  const u = SC, L = Math.round(46 * u), HW = Math.round(14 * u);
  const c = newCv(HW * 2 + 10, L + 8), g = c.getContext('2d');
  const cx = Math.round(c.width / 2), y0 = 4, px = Math.max(1, Math.round(u / 2));
  const hw = [];
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1); let v;
    if (t < 0.13) v = 0.44 + 0.56 * Math.pow(t / 0.13, 0.7);
    else if (t < 0.88) v = 1;
    else v = 1 - 0.22 * ((t - 0.88) / 0.12);
    hw.push(Math.max(1, Math.round(v * HW)));
  }
  for (let i = 0; i < L; i++) {
    const r = hw[i], y = y0 + i;
    g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(cx - r - 2, y + px * 2, r * 2 + 5, 1);
    g.fillStyle = '#0a0f14'; g.fillRect(cx - r - 2, y, r * 2 + 5, 1);
    g.fillStyle = '#39434b'; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = '#4c5860'; g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.26)), 1);
    g.fillStyle = '#20272d'; g.fillRect(cx + r - Math.round(r * 0.22), y, Math.round(r * 0.22) + 1, 1);
  }
  /* толстый броневой пояс */
  for (let i = Math.round(L * 0.10); i < L * 0.92; i++) {
    const r = hw[i], y = y0 + i;
    g.fillStyle = 'rgba(12,16,20,0.55)';
    g.fillRect(cx - r + px, y, px * 3, 1);
    g.fillRect(cx + r - px * 4, y, px * 3, 1);
  }
  /* приподнятая цитадель */
  g.fillStyle = '#0a0f14';
  g.fillRect(cx - Math.round(HW * 0.72), y0 + Math.round(L * 0.30), Math.round(HW * 1.44), Math.round(L * 0.40));
  g.fillStyle = '#4a5762';
  g.fillRect(cx - Math.round(HW * 0.66), y0 + Math.round(L * 0.315), Math.round(HW * 1.32), Math.round(L * 0.37));
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(cx - Math.round(HW * 0.66), y0 + Math.round(L * 0.315), Math.round(HW * 1.32), px);
  /* командирская башенка */
  const by = y0 + Math.round(L * 0.44);
  g.fillStyle = '#0a0f14'; g.fillRect(cx - px * 4, by, px * 8, px * 8);
  g.fillStyle = '#5c6a76'; g.fillRect(cx - px * 3.4, by + px * 0.6, px * 6.8, px * 6.8);
  g.fillStyle = '#ffb46b'; g.fillRect(cx - px * 2.6, by + px * 2, px * 5.2, px * 1.2);
  g.fillStyle = '#8b9aa5'; g.fillRect(cx - px * 0.5, by - px * 6, px, px * 6);
  g.fillStyle = '#e5484d'; g.fillRect(cx - px * 2, by - px * 6, px * 4, px);
  /* барбеты под две тяжёлые башни */
  for (const t of [-0.18, 0.16]) {
    const y = y0 + Math.round((0.5 + t) * L), br = Math.round(HW * 0.72);
    g.fillStyle = '#0a0f14'; g.beginPath(); g.arc(cx, y, br + 1, 0, TAU); g.fill();
    g.fillStyle = '#55636f'; g.beginPath(); g.arc(cx, y, br, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(cx, y + px, br * 0.8, 0, TAU); g.fill();
  }
  /* противоминные були по бортам */
  g.fillStyle = 'rgba(20,26,32,0.5)';
  g.fillRect(cx - HW - px, y0 + Math.round(L * 0.2), px * 2, Math.round(L * 0.6));
  g.fillRect(cx + HW - px, y0 + Math.round(L * 0.2), px * 2, Math.round(L * 0.6));
  /* жёлто-чёрные полосы у среза палубы */
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? '#d8b23c' : '#1a1f24';
    g.fillRect(cx - HW + px * 2 + k * Math.round(HW * 0.32), y0 + Math.round(L * 0.90), Math.round(HW * 0.30), px);
  }
  return c;
})();

/* привязка типа флагмана к рисунку: где башни и насколько они крупнее */
const BOSS_ART = {
  leviathan: { spr: () => sprBoss,        turrets: BOSS_TURRETS,  len: 64, tScale: 1.0,  r: 20 },
  carrier:   { spr: () => sprBossCarrier, turrets: [],            len: 70, tScale: 1.0,  r: 24 },
  monitor:   { spr: () => sprBossMonitor, turrets: [-0.18, 0.16], len: 46, tScale: 1.75, r: 22 }
};

/* ---------- самолёты ---------- */
function makePlane(C, sizeU) {
  const S = Math.round(sizeU * SC), c = newCv(S, S), g = c.getContext('2d');
  const u = SC, cx = S / 2, heavy = sizeU > 17;
  const lin = (x0, x1, a, b, m) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, a); if (m) gr.addColorStop(0.5, m); gr.addColorStop(1, b); return gr; };
  const edge = () => { g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = Math.max(1, u * 0.22); g.stroke(); };
  /* крылья */
  g.beginPath();
  if (heavy) {
    g.moveTo(cx - S * 0.49, S * 0.40); g.lineTo(cx + S * 0.49, S * 0.40);
    g.lineTo(cx + S * 0.47, S * 0.50); g.lineTo(cx - S * 0.47, S * 0.50);
  } else {
    g.moveTo(cx, S * 0.30); g.lineTo(cx + S * 0.47, S * 0.60); g.lineTo(cx + S * 0.45, S * 0.66);
    g.lineTo(cx, S * 0.55); g.lineTo(cx - S * 0.45, S * 0.66); g.lineTo(cx - S * 0.47, S * 0.60);
  }
  g.closePath(); g.fillStyle = lin(0, S, C.lit, shade(C.body, 0.7), C.body); g.fill(); edge();
  /* двигатели бомбардировщика */
  if (heavy) for (const sx of [-0.24, 0.24]) {
    g.fillStyle = shade(C.body, 0.8);
    rrect(g, cx + S * sx - u * 0.9, S * 0.33, u * 1.8, S * 0.22, u * 0.8); g.fill(); edge();
    g.fillStyle = 'rgba(220,235,240,0.25)';
    g.beginPath(); g.arc(cx + S * sx, S * 0.33, u * 1.6, 0, TAU); g.fill();
  }
  /* стабилизатор */
  g.beginPath();
  g.moveTo(cx, S * 0.80); g.lineTo(cx + S * 0.18, S * 0.90); g.lineTo(cx + S * 0.17, S * 0.94);
  g.lineTo(cx - S * 0.17, S * 0.94); g.lineTo(cx - S * 0.18, S * 0.90); g.closePath();
  g.fillStyle = lin(0, S, C.lit, shade(C.body, 0.7), C.body); g.fill(); edge();
  /* фюзеляж */
  g.beginPath(); g.ellipse(cx, S * 0.52, S * (heavy ? 0.075 : 0.065), S * 0.44, 0, 0, TAU);
  g.fillStyle = lin(cx - S * 0.07, cx + S * 0.07, C.lit, shade(C.body, 0.6), C.body); g.fill(); edge();
  /* фонарь кабины с бликом */
  g.beginPath(); g.ellipse(cx, S * 0.26, S * 0.035, S * 0.07, 0, 0, TAU);
  g.fillStyle = '#123448'; g.fill();
  g.fillStyle = 'rgba(160,235,255,0.8)';
  g.beginPath(); g.ellipse(cx - S * 0.012, S * 0.245, S * 0.012, S * 0.035, 0, 0, TAU); g.fill();
  /* опознавательные знаки и законцовки */
  g.fillStyle = C.acc;
  for (const sx of [-1, 1]) {
    g.beginPath(); g.arc(cx + sx * S * 0.27, heavy ? S * 0.45 : S * 0.55, u * 0.9, 0, TAU); g.fill();
  }
  g.fillRect(cx - u * 0.3, S * 0.08, u * 0.6, u * 0.8);
  if (!heavy) {
    /* винт */
    g.fillStyle = 'rgba(220,235,240,0.22)';
    g.beginPath(); g.arc(cx, S * 0.09, u * 1.8, 0, TAU); g.fill();
  }
  return c;
}
const sprPlane  = makePlane({ body: '#3a444b', lit: '#6b7a84', acc: '#e5484d' }, 15);
const sprPlaneH = makePlane({ body: '#4a3a36', lit: '#7d655d', acc: '#ffb454' }, 19);

/* ---------- авианосец «СЕВЕР» ---------- */
const sprCarrier = (function () {
  const u = SC, W = 40 * u, H = 96 * u;
  const c = newCv(W, H), g = c.getContext('2d'), cx = W / 2;
  /* корпус */
  g.beginPath();
  g.moveTo(cx, u);
  g.bezierCurveTo(cx + 9 * u, 5 * u, cx + 16 * u, 12 * u, cx + 16 * u, 22 * u);
  g.lineTo(cx + 16 * u, H - 8 * u); g.quadraticCurveTo(cx + 16 * u, H - u, cx + 11 * u, H - u);
  g.lineTo(cx - 11 * u, H - u); g.quadraticCurveTo(cx - 16 * u, H - u, cx - 16 * u, H - 8 * u);
  g.lineTo(cx - 16 * u, 22 * u);
  g.bezierCurveTo(cx - 16 * u, 12 * u, cx - 9 * u, 5 * u, cx, u);
  g.closePath();
  const hg = g.createLinearGradient(cx - 16 * u, 0, cx + 16 * u, 0);
  hg.addColorStop(0, '#7a8a95'); hg.addColorStop(0.5, '#56646e'); hg.addColorStop(1, '#343f47');
  g.fillStyle = hg; g.fill();
  g.strokeStyle = '#141b20'; g.lineWidth = Math.max(1, u * 0.4); g.stroke();
  /* полётная палуба — тёмный асфальт с зернистостью */
  g.save();
  g.beginPath();
  g.moveTo(cx - 4 * u, 6 * u); g.lineTo(cx + 5 * u, 6 * u); g.lineTo(cx + 13 * u, 22 * u);
  g.lineTo(cx + 13 * u, H - 5 * u); g.lineTo(cx - 14.5 * u, H - 5 * u); g.lineTo(cx - 14.5 * u, 22 * u);
  g.closePath();
  const dg = g.createLinearGradient(0, 0, W, 0);
  dg.addColorStop(0, '#4d5860'); dg.addColorStop(1, '#3a434a');
  g.fillStyle = dg; g.fill();
  g.clip();
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.fillRect(Math.random() * W, Math.random() * H, Math.max(1, u * 0.3), Math.max(1, u * 0.3));
  }
  /* угловая посадочная полоса */
  g.save(); g.translate(cx - 3 * u, H * 0.62); g.rotate(-0.16);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(-5 * u, -34 * u, 10 * u, 60 * u);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = Math.max(1, u * 0.3);
  g.setLineDash([3 * u, 2.4 * u]);
  g.beginPath(); g.moveTo(0, -34 * u); g.lineTo(0, 26 * u); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,220,90,0.8)';
  g.strokeRect(-5 * u, -34 * u, 10 * u, 60 * u);
  /* тросы аэрофинишёров */
  g.strokeStyle = 'rgba(20,24,28,0.8)';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-5 * u, 14 * u + k * 2.4 * u); g.lineTo(5 * u, 14 * u + k * 2.4 * u); g.stroke(); }
  g.restore();
  /* катапульты на носу */
  g.strokeStyle = 'rgba(230,236,240,0.55)'; g.lineWidth = Math.max(1, u * 0.25);
  for (const dx of [-3, 3]) { g.beginPath(); g.moveTo(cx + dx * u, 9 * u); g.lineTo(cx + dx * u, 30 * u); g.stroke(); }
  /* самолётоподъёмники */
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(cx - 14.5 * u, 40 * u, 5 * u, 7 * u); g.fillRect(cx - 14.5 * u, 58 * u, 5 * u, 7 * u);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.strokeRect(cx - 14.5 * u, 40 * u, 5 * u, 7 * u); g.strokeRect(cx - 14.5 * u, 58 * u, 5 * u, 7 * u);
  /* вертолётная площадка на корме */
  g.strokeStyle = 'rgba(255,220,90,0.8)'; g.lineWidth = Math.max(1, u * 0.3);
  g.beginPath(); g.arc(cx - 5 * u, H - 11 * u, 3.4 * u, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillRect(cx - 6.2 * u, H - 12.8 * u, 0.5 * u, 3.6 * u); g.fillRect(cx - 4.3 * u, H - 12.8 * u, 0.5 * u, 3.6 * u);
  g.fillRect(cx - 6.2 * u, H - 11.2 * u, 2.4 * u, 0.5 * u);
  g.restore();
  /* остров-надстройка по правому борту */
  block(g, cx + 8 * u, 32 * u, 6.5 * u, 20 * u, '#7f8f99', u, u);
  block(g, cx + 9 * u, 36 * u, 4.5 * u, 9 * u, '#8e9ea8', u, u * 0.6);
  g.fillStyle = '#0c1a24'; g.fillRect(cx + 8.6 * u, 33 * u, 5.3 * u, u * 0.9);
  g.fillStyle = '#9fe8ff'; g.fillRect(cx + 8.9 * u, 33.2 * u, 2.4 * u, u * 0.35);
  /* труба и мачта с радаром */
  g.fillStyle = '#2a3238'; rrect(g, cx + 9.6 * u, 46 * u, 3.4 * u, 4 * u, u * 0.6); g.fill();
  g.fillStyle = '#12171b'; g.fillRect(cx + 10.3 * u, 46.8 * u, 2 * u, 2.4 * u);
  g.strokeStyle = '#20282e'; g.lineWidth = Math.max(1, u * 0.35);
  g.beginPath(); g.moveTo(cx + 11.2 * u, 38 * u); g.lineTo(cx + 11.2 * u, 27 * u); g.stroke();
  g.beginPath(); g.moveTo(cx + 8.6 * u, 29 * u); g.lineTo(cx + 13.8 * u, 29 * u); g.stroke();
  g.fillStyle = '#dfe7ec'; g.beginPath(); g.ellipse(cx + 11.2 * u, 31.5 * u, 2 * u, 0.8 * u, 0, 0, TAU); g.fill();
  g.fillStyle = '#e5484d'; g.fillRect(cx + 10.8 * u, 26.6 * u, 0.8 * u, 0.8 * u);
  /* самолёты на стоянке */
  const jet = (x, y, a) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.moveTo(0.4 * u, -2.4 * u); g.lineTo(3 * u, 1.4 * u); g.lineTo(-2.2 * u, 1.4 * u); g.closePath(); g.fill();
    g.fillStyle = '#8796a0';
    g.beginPath(); g.moveTo(0, -3 * u); g.lineTo(2.6 * u, 1 * u); g.lineTo(0.6 * u, 1 * u); g.lineTo(0.6 * u, 2.2 * u);
    g.lineTo(-0.6 * u, 2.2 * u); g.lineTo(-0.6 * u, 1 * u); g.lineTo(-2.6 * u, 1 * u); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.18); g.stroke();
    g.fillStyle = '#123448'; g.fillRect(-0.3 * u, -1.8 * u, 0.6 * u, u);
    g.restore();
  };
  jet(cx - 11 * u, 26 * u, 0.5); jet(cx - 11 * u, 33 * u, 0.5);
  jet(cx - 11 * u, 72 * u, 0.5); jet(cx + 9 * u, 64 * u, -0.4); jet(cx + 9 * u, 71 * u, -0.4);
  return c;
})();

/* ---------- дружеский причал: 1-4 сваи с постовыми ---------- */
const sprPier = (function () {
  const u = SC, c = newCv(20 * u, 12 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(2 * u, 7.5 * u, 16 * u, 2 * u);
  /* настил */
  g.fillStyle = '#4d4130'; g.fillRect(2 * u, 3 * u, 16 * u, 4.5 * u);
  g.fillStyle = '#6b5b40'; g.fillRect(2 * u, 3 * u, 16 * u, 1.2 * u);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 1; k < 8; k++) g.fillRect((2 + k * 2) * u, 3 * u, 1, 4.5 * u);
  /* кранцы-покрышки по кромке */
  g.fillStyle = '#20262a';
  for (let k = 0; k < 5; k++) {
    g.beginPath(); g.arc((3.5 + k * 3.2) * u, 7.6 * u, u * 0.75, 0, TAU); g.fill();
  }
  /* флажок своих */
  g.fillStyle = '#8b9aa5'; g.fillRect(17 * u, 0, u * 0.5, 4 * u);
  g.fillStyle = '#4ade80'; g.fillRect(13.6 * u, 0.3 * u, 3.4 * u, 1.8 * u);
  return c;
})();

/* столб-свая: сколько свай — столько бойцов ждёт на причале */
const sprPile = (function () {
  const u = SC, c = newCv(4 * u, 8 * u), g = c.getContext('2d');
  const cx = 2 * u;
  g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(cx - u * 0.9, 6.6 * u, u * 2.4, u * 1.2);
  g.fillStyle = '#3c3324'; g.fillRect(cx - u * 0.8, u, u * 1.6, 6 * u);
  g.fillStyle = '#5f513a'; g.fillRect(cx - u * 0.8, u, u * 0.7, 6 * u);
  g.fillStyle = '#2a2418'; g.fillRect(cx - u * 0.8, u * 2.4, u * 1.6, u * 0.4);
  g.fillStyle = '#6b5b40'; g.fillRect(cx - u * 1.1, u * 0.5, u * 2.2, u * 0.7);
  return c;
})();

/* ---------- морская мина ---------- */
const sprMine = (function () {
  const u = SC, S = 12 * u, c = newCv(S, S), g = c.getContext('2d'), r = 4.4 * u;
  g.fillStyle = '#141a1f'; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.fill();
  const gr = g.createRadialGradient(S / 2 - r * 0.35, S / 2 - r * 0.35, r * 0.1, S / 2, S / 2, r);
  gr.addColorStop(0, '#6b7780'); gr.addColorStop(0.6, '#39434b'); gr.addColorStop(1, '#212930');
  g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, r - Math.max(1, u * 0.35), 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath(); g.arc(S / 2 - r * 0.35, S / 2 - r * 0.35, r * 0.22, 0, TAU); g.fill();
  /* рожки-взрыватели */
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    g.fillStyle = '#141a1f';
    g.save(); g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.rotate(a);
    g.fillRect(0, -u * 0.35, u * 1.4, u * 0.7);
    g.restore();
  }
  return c;
})();

/* ---------- ящик снабжения ---------- */
const sprCrate = (function () {
  const u = SC, c = newCv(11 * u, 10 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1.2 * u, 7.6 * u, 9.4 * u, 2.2 * u, u); g.fill();
  /* боковина */
  const fg = g.createLinearGradient(0, 3 * u, 0, 9 * u);
  fg.addColorStop(0, '#8a6238'); fg.addColorStop(1, '#5e4024');
  g.fillStyle = fg; g.fillRect(0.5 * u, 3.4 * u, 9.6 * u, 5.4 * u);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 1; k < 3; k++) g.fillRect(0.5 * u, (3.4 + k * 1.8) * u, 9.6 * u, Math.max(1, u * 0.2));
  /* крышка */
  const tg = g.createLinearGradient(0, 0.5 * u, 0, 3.4 * u);
  tg.addColorStop(0, '#c9975a'); tg.addColorStop(1, '#a87a46');
  g.fillStyle = tg; g.fillRect(0.5 * u, 0.6 * u, 9.6 * u, 2.8 * u);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.25);
  g.strokeRect(0.5 * u, 0.6 * u, 9.6 * u, 8.2 * u);
  g.beginPath(); g.moveTo(0.5 * u, 3.4 * u); g.lineTo(10.1 * u, 3.4 * u); g.stroke();
  /* металлические уголки и маркировка */
  g.fillStyle = '#39434b';
  for (const [x, y] of [[0.5, 0.6], [9.1, 0.6], [0.5, 7.8], [9.1, 7.8]]) g.fillRect(x * u, y * u, u, u);
  g.fillStyle = '#ffd94a'; g.fillRect(3.2 * u, 5 * u, 4.2 * u, 1.2 * u);
  g.fillStyle = '#2a1c10'; g.fillRect(4.6 * u, 5.2 * u, 1.4 * u, 0.8 * u);
  return c;
})();

/* ---------- РЛС-вышка ---------- */
const sprTower = (function () {
  const u = SC, c = newCv(15 * u, 21 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 2 * u, 18.6 * u, 11 * u, 2.2 * u, u); g.fill();
  /* аппаратная у основания */
  block(g, 3 * u, 14 * u, 9 * u, 5.4 * u, '#5d6b74', u, u * 0.5);
  g.fillStyle = '#1a2228'; g.fillRect(4.2 * u, 16.4 * u, 1.8 * u, 2.4 * u);
  g.fillStyle = '#7fd4e0'; g.fillRect(8 * u, 16 * u, 2.6 * u, 0.8 * u);
  /* ферма: две стойки и раскосы */
  g.strokeStyle = '#3a454d'; g.lineWidth = Math.max(1, u * 0.45);
  g.beginPath(); g.moveTo(5.8 * u, 14 * u); g.lineTo(6.8 * u, 3 * u); g.moveTo(9.2 * u, 14 * u); g.lineTo(8.2 * u, 3 * u); g.stroke();
  g.strokeStyle = '#6f7d86'; g.lineWidth = Math.max(1, u * 0.25);
  for (let k = 0; k < 5; k++) {
    const y1 = (13.6 - k * 2.1) * u, y2 = y1 - 2.1 * u;
    g.beginPath(); g.moveTo(5.9 * u + k * 0.18 * u, y1); g.lineTo(9.1 * u - (k + 1) * 0.18 * u, y2);
    g.moveTo(9.1 * u - k * 0.18 * u, y1); g.lineTo(5.9 * u + (k + 1) * 0.18 * u, y2); g.stroke();
  }
  /* площадка под антенной */
  g.fillStyle = '#2a3238'; rrect(g, 4.4 * u, 2.2 * u, 6.2 * u, 1.4 * u, u * 0.4); g.fill();
  g.fillStyle = '#8b9aa5'; g.fillRect(4.6 * u, 2.3 * u, 5.8 * u, u * 0.35);
  return c;
})();

/* ---------- бункер ---------- */
const sprBunker = (function () {
  const u = SC, c = newCv(15 * u, 14 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1 * u, 9.8 * u, 13 * u, 3.4 * u, u); g.fill();
  /* стенка */
  const wg = g.createLinearGradient(0, 6 * u, 0, 11 * u);
  wg.addColorStop(0, '#6b767d'); wg.addColorStop(1, '#434d54');
  g.fillStyle = wg; rrect(g, 1.2 * u, 5.6 * u, 12.6 * u, 5 * u, u * 0.6); g.fill();
  /* плита-крыша */
  const rg = g.createLinearGradient(0, 1.5 * u, 0, 6 * u);
  rg.addColorStop(0, '#a6b0b5'); rg.addColorStop(1, '#7f8a90');
  g.fillStyle = rg; rrect(g, 0.8 * u, 1.6 * u, 13.4 * u, 4.6 * u, u * 1.4); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, u * 0.25); g.stroke();
  /* пятна маскировки */
  const spots = [[3, 3, '#5d6b4e'], [8.5, 2.6, '#6b5d45'], [11, 4, '#5d6b4e'], [6, 4.4, '#6b5d45']];
  for (const [x, y, col] of spots) { g.fillStyle = col; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x * u, y * u, 1.6 * u, 0.8 * u, 0.3, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  /* амбразура с бликом */
  g.fillStyle = '#0d1216'; rrect(g, 3.2 * u, 7 * u, 8.6 * u, 1.5 * u, u * 0.4); g.fill();
  g.fillStyle = 'rgba(255,200,120,0.35)'; g.fillRect(4 * u, 7.3 * u, 2 * u, u * 0.3);
  /* мешки с песком */
  for (let k = 0; k < 6; k++) {
    const x = (1.8 + k * 2.3) * u, y = 10.8 * u;
    const sg = g.createLinearGradient(0, y - u, 0, y + u);
    sg.addColorStop(0, '#b4a36a'); sg.addColorStop(1, '#7d6f45');
    g.fillStyle = sg; g.beginPath(); g.ellipse(x, y, 1.3 * u, 0.85 * u, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, u * 0.18); g.stroke();
  }
  return c;
})();

/* ---------- командная база ---------- */
const sprBase = (function () {
  const u = SC, c = newCv(26 * u, 22 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.32)'; rrect(g, 1.5 * u, 17 * u, 24 * u, 4.4 * u, u); g.fill();
  /* фасад */
  const fg = g.createLinearGradient(0, 12 * u, 0, 18 * u);
  fg.addColorStop(0, '#5b666d'); fg.addColorStop(1, '#3b454b');
  g.fillStyle = fg; g.fillRect(1 * u, 12.5 * u, 24 * u, 5.6 * u);
  /* окна со светом */
  for (let k = 0; k < 5; k++) {
    g.fillStyle = '#0c1a24'; g.fillRect((3 + k * 3.2) * u, 13.6 * u, 2 * u, 1.6 * u);
    g.fillStyle = k % 2 ? 'rgba(255,214,130,0.85)' : 'rgba(160,220,240,0.6)';
    g.fillRect((3.2 + k * 3.2) * u, 13.8 * u, 1.6 * u, 0.6 * u);
  }
  /* ворота */
  g.fillStyle = '#20282e'; g.fillRect(19 * u, 13.2 * u, 4.6 * u, 4.9 * u);
  g.fillStyle = 'rgba(255,255,255,0.1)';
  for (let k = 0; k < 4; k++) g.fillRect(19 * u, (13.8 + k * 1.1) * u, 4.6 * u, Math.max(1, u * 0.2));
  /* предупредительная полоса по низу */
  for (let k = 0; k < 12; k++) {
    g.fillStyle = k % 2 ? '#e5c04a' : '#23292e';
    g.fillRect((1 + k * 2) * u, 17.4 * u, 2 * u, 0.7 * u);
  }
  /* крыша */
  const rg = g.createLinearGradient(0, 2 * u, 0, 12.5 * u);
  rg.addColorStop(0, '#aab5bb'); rg.addColorStop(1, '#838f96');
  g.fillStyle = rg; g.fillRect(1 * u, 2 * u, 24 * u, 10.6 * u);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.3);
  g.strokeRect(1 * u, 2 * u, 24 * u, 16.1 * u);
  g.beginPath(); g.moveTo(1 * u, 12.6 * u); g.lineTo(25 * u, 12.6 * u); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(1.3 * u, 2.3 * u, 23.4 * u, u * 0.4);
  /* вертолётная площадка */
  g.strokeStyle = 'rgba(255,220,90,0.85)'; g.lineWidth = Math.max(1, u * 0.35);
  g.beginPath(); g.arc(8 * u, 7.2 * u, 3.4 * u, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(6.9 * u, 5.6 * u, 0.5 * u, 3.2 * u); g.fillRect(8.6 * u, 5.6 * u, 0.5 * u, 3.2 * u);
  g.fillRect(6.9 * u, 7 * u, 2.2 * u, 0.45 * u);
  /* вентиляторы и кондиционеры */
  for (const [x, y] of [[15, 4.2], [15, 8]]) {
    block(g, x * u, y * u, 3.4 * u, 2.8 * u, '#6d7a82', u, u * 0.3);
    g.strokeStyle = '#20282e'; g.lineWidth = Math.max(1, u * 0.2);
    g.beginPath(); g.arc((x + 1.7) * u, (y + 1.4) * u, 1 * u, 0, TAU); g.stroke();
  }
  block(g, 19.6 * u, 4.4 * u, 4 * u, 5.4 * u, '#56636b', u, u * 0.4);
  return c;
})();

/* ---------- маяк противника (ночные операции) ---------- */
const sprLighthouse = (function () {
  const u = SC, c = newCv(13 * u, 24 * u), g = c.getContext('2d');
  const cx = 6.5 * u;
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1.6 * u, 20.8 * u, 10 * u, 2.8 * u, u); g.fill();
  /* домик смотрителя у основания */
  block(g, 1 * u, 17.4 * u, 11 * u, 4 * u, '#c9c2b3', u, u * 0.5);
  g.fillStyle = '#8a3a2f'; g.fillRect(1 * u, 17.4 * u, 11 * u, 1.2 * u);
  /* ствол: конус с полосами, светлый слева */
  const top = 4.6 * u, bot = 18.6 * u, wT = 3 * u, wB = 4.8 * u;
  g.save();
  g.beginPath();
  g.moveTo(cx - wT / 2, top); g.lineTo(cx + wT / 2, top); g.lineTo(cx + wB / 2, bot); g.lineTo(cx - wB / 2, bot);
  g.closePath(); g.clip();
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? '#e8edf0' : '#c8393f';
    g.fillRect(0, top + i * (bot - top) / 7, 13 * u, (bot - top) / 7 + 1);
  }
  const sg = g.createLinearGradient(cx - wB / 2, 0, cx + wB / 2, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0.25)'); sg.addColorStop(0.45, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = sg; g.fillRect(0, 0, 13 * u, 24 * u);
  g.restore();
  /* галерея, фонарь и купол */
  g.fillStyle = '#23292e'; g.beginPath(); g.ellipse(cx, 4.6 * u, 3.2 * u, 1 * u, 0, 0, TAU); g.fill();
  g.fillStyle = '#39454e'; g.fillRect(cx - 1.8 * u, 1.8 * u, 3.6 * u, 2.8 * u);
  g.fillStyle = '#ffe9a3'; g.fillRect(cx - 1.3 * u, 2.2 * u, 2.6 * u, 2 * u);
  g.fillStyle = '#8a3a2f'; g.beginPath(); g.ellipse(cx, 1.8 * u, 2.2 * u, 1 * u, 0, Math.PI, TAU); g.fill();
  g.fillStyle = '#23292e'; g.fillRect(cx - 0.3 * u, 0.2 * u, 0.6 * u, 0.9 * u);
  return c;
})();

/* бойцы и все остальные люди — процедурная анимация в people.js */

/* ============================================================
   Растительность.
   makeVeg возвращает набор вариантов по видам; мир расставляет их
   рощами: ближе к берегу — пальмы и кусты, в глубине — крупные кроны.
   ============================================================ */
function makeVeg(pal) {
  const u = SC;
  /* палитра листвы: от глубокой тени до блика */
  const L = {
    d2: shade(pal.treeD, 0.72),
    d : pal.treeD,
    m : pal.tree,
    l : shade(pal.tree, 1.28),
    l2: shade(pal.tree, 1.55)
  };
  const cvU = (wu, hu) => newCv(wu * u, hu * u);
  const blob = (g, x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const shadowAt = (g, x, y, rx, ry, a) => {
    g.fillStyle = 'rgba(0,0,0,' + (a === undefined ? 0.26 : a) + ')';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  };
  /* многоярусная крона */
  const canopy = (g, cx, cy, r, lobes, seed) => {
    for (let i = 0; i < lobes; i++) {
      const a = i / lobes * TAU + seed;
      blob(g, cx + Math.cos(a) * r * 0.34, cy + Math.sin(a) * r * 0.30, r * 0.60, L.d2);
    }
    blob(g, cx, cy, r * 0.80, L.d2);
    for (let i = 0; i < lobes; i++) {
      const a = i / lobes * TAU + seed + 0.6;
      blob(g, cx + Math.cos(a) * r * 0.30, cy + Math.sin(a) * r * 0.26, r * 0.52, L.d);
    }
    for (let i = 0; i < lobes; i++) {
      const a = i / lobes * TAU + seed + 1.2;
      blob(g, cx + Math.cos(a) * r * 0.24 - r * 0.10, cy + Math.sin(a) * r * 0.20 - r * 0.14, r * 0.42, L.m);
    }
    blob(g, cx - r * 0.28, cy - r * 0.32, r * 0.34, L.l);
    blob(g, cx - r * 0.12, cy - r * 0.44, r * 0.18, L.l2);
    /* отдельные листья по кромке кроны */
    for (let i = 0; i < 16; i++) {
      const a = rr(0, TAU), d = rr(0.55, 0.98) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * rr(0.09, 0.17),
           chance(0.55) ? L.d : L.m);
    }
  };

  const V = { palm: [], broad: [], big: [], bush: [], fern: [], tuft: [], dead: [], flower: [] };

  /* ---- пальмы ---- */
  for (let v = 0; v < 3; v++) {
    const W = 13, H = 14, c = cvU(W, H), g = c.getContext('2d');
    const bx = W * u * 0.5, by = H * u * 0.92;
    const lean = rr(-1.6, 1.6) * u, crownY = H * u * 0.30;
    shadowAt(g, bx + u * 0.6, by - u * 0.4, u * 2.4, u * 1.0);
    /* ствол сегментами, с наклоном */
    const seg = 9;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const x = bx + lean * t * t, y = by - (by - crownY) * t;
      const w = u * (1.15 - 0.35 * t);
      g.fillStyle = i % 2 ? pal.trunk : pal.trunkD;
      g.fillRect(x - w / 2, y - u * 0.55, w, u * 0.75);
    }
    /* кокосы */
    for (let i = 0; i < 3; i++)
      blob(g, bx + lean + rr(-1, 1) * u, crownY + rr(0, 1) * u, u * 0.45, pal.trunkD);
    /* листья */
    const nf = 7 + (v % 2);
    for (let i = 0; i < nf; i++) {
      const a = i / nf * TAU + rr(-0.15, 0.15);
      const len = u * rr(3.6, 5.4), dr = u * rr(0.8, 1.6);
      const cx0 = bx + lean, cy0 = crownY;
      const mx = cx0 + Math.cos(a) * len * 0.55, my = cy0 + Math.sin(a) * len * 0.45 - dr * 0.5;
      const ex = cx0 + Math.cos(a) * len,        ey = cy0 + Math.sin(a) * len * 0.8 + dr;
      g.lineCap = 'round';
      g.strokeStyle = L.d2; g.lineWidth = u * 1.15;
      g.beginPath(); g.moveTo(cx0, cy0); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      g.strokeStyle = chance(0.5) ? L.m : L.d; g.lineWidth = u * 0.62;
      g.beginPath(); g.moveTo(cx0, cy0); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      /* зубцы листа */
      g.strokeStyle = L.d; g.lineWidth = u * 0.3;
      for (let k = 1; k <= 2; k++) {
        const t = k / 3;
        const px2 = lerp(lerp(cx0, mx, t), lerp(mx, ex, t), t);
        const py2 = lerp(lerp(cy0, my, t), lerp(my, ey, t), t);
        g.beginPath(); g.moveTo(px2, py2);
        g.lineTo(px2 + Math.cos(a + 1.4) * u * 0.9, py2 + Math.sin(a + 1.4) * u * 0.7);
        g.stroke();
      }
    }
    blob(g, bx + lean, crownY, u * 0.7, L.l);
    V.palm.push(c);
  }

  /* ---- широколиственные ---- */
  for (let v = 0; v < 4; v++) {
    const W = 9 + v * 0.6, H = 10 + v * 0.6, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.92, cy = H * u * 0.42, r = u * (2.6 + v * 0.35);
    shadowAt(g, cx + u * 0.5, base - u * 0.5, r * 0.85, r * 0.40);
    g.fillStyle = pal.trunkD; g.fillRect(cx - u * 0.4, cy, u * 0.8, base - cy);
    g.fillStyle = pal.trunk;  g.fillRect(cx - u * 0.4, cy, u * 0.35, base - cy);
    canopy(g, cx, cy, r, 3 + (v % 3), v * 1.7);
    V.broad.push(c);
  }

  /* ---- крупные деревья верхнего яруса ---- */
  for (let v = 0; v < 3; v++) {
    const W = 15, H = 16, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.94, cy = H * u * 0.40, r = u * (4.4 + v * 0.5);
    shadowAt(g, cx + u * 0.8, base - u * 0.6, r * 0.95, r * 0.42, 0.30);
    /* ствол с подпорными корнями */
    g.fillStyle = pal.trunkD;
    g.fillRect(cx - u * 0.75, cy, u * 1.5, base - cy);
    g.beginPath();
    g.moveTo(cx - u * 2.0, base); g.lineTo(cx - u * 0.75, base - u * 2.4);
    g.lineTo(cx + u * 0.75, base - u * 2.4); g.lineTo(cx + u * 2.0, base);
    g.closePath(); g.fill();
    g.fillStyle = pal.trunk; g.fillRect(cx - u * 0.75, cy, u * 0.55, base - cy);
    /* три яруса кроны */
    canopy(g, cx - r * 0.32, cy + r * 0.16, r * 0.66, 3, v);
    canopy(g, cx + r * 0.34, cy + r * 0.10, r * 0.62, 3, v + 2);
    canopy(g, cx, cy - r * 0.22, r * 0.80, 4, v + 4);
    V.big.push(c);
  }

  /* ---- кусты ---- */
  for (let v = 0; v < 4; v++) {
    const W = 7, H = 6, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, cy = H * u * 0.55, r = u * (1.5 + v * 0.22);
    shadowAt(g, cx + u * 0.3, H * u * 0.86, r * 1.05, r * 0.42, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = rr(0, TAU), d = rr(0, 0.7) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r * rr(0.62, 0.90), L.d2);
    }
    for (let i = 0; i < 3; i++) {
      const a = rr(0, TAU), d = rr(0, 0.6) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - r * 0.15, r * rr(0.45, 0.68), L.d);
    }
    blob(g, cx - r * 0.25, cy - r * 0.35, r * 0.42, L.m);
    blob(g, cx - r * 0.35, cy - r * 0.45, r * 0.20, L.l);
    V.bush.push(c);
  }

  /* ---- цветущие кусты ---- */
  for (let v = 0; v < 3; v++) {
    const W = 7, H = 6, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, cy = H * u * 0.55, r = u * 1.7;
    shadowAt(g, cx + u * 0.3, H * u * 0.86, r * 1.05, r * 0.42, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = rr(0, TAU), d = rr(0, 0.7) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r * rr(0.60, 0.88), L.d);
    }
    blob(g, cx - r * 0.25, cy - r * 0.30, r * 0.45, L.m);
    const fc = pal.flowers[v % pal.flowers.length];
    for (let i = 0; i < 7; i++) {
      const a = rr(0, TAU), d = rr(0.15, 0.85) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, u * 0.34, fc);
    }
    V.flower.push(c);
  }

  /* ---- папоротники ---- */
  for (let v = 0; v < 3; v++) {
    const W = 7, H = 7, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.85;
    shadowAt(g, cx + u * 0.2, base, u * 1.6, u * 0.5, 0.18);
    const nf = 6 + v;
    g.lineCap = 'round';
    for (let i = 0; i < nf; i++) {
      const a = -Math.PI / 2 + (i / (nf - 1) - 0.5) * 2.5;
      const len = u * rr(2.0, 3.0);
      const ex = cx + Math.cos(a) * len, ey = base + Math.sin(a) * len * 0.85;
      g.strokeStyle = L.d; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(cx, base);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, base + Math.sin(a) * len * 0.75, ex, ey);
      g.stroke();
      g.strokeStyle = L.m; g.lineWidth = u * 0.28;
      g.beginPath(); g.moveTo(cx, base);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, base + Math.sin(a) * len * 0.75, ex, ey);
      g.stroke();
    }
    V.fern.push(c);
  }

  /* ---- пучки травы ---- */
  for (let v = 0; v < 4; v++) {
    const W = 5, H = 4, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.86;
    g.lineCap = 'round';
    for (let i = 0; i < 4 + v; i++) {
      const a = -Math.PI / 2 + rr(-0.8, 0.8), len = u * rr(1.1, 1.9);
      g.strokeStyle = chance(0.5) ? L.d : L.m; g.lineWidth = u * 0.32;
      g.beginPath(); g.moveTo(cx + rr(-0.6, 0.6) * u, base);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, base + Math.sin(a) * len * 0.7,
                         cx + Math.cos(a) * len, base + Math.sin(a) * len * 0.9);
      g.stroke();
    }
    V.tuft.push(c);
  }

  /* ---- сухие деревья ---- */
  for (let v = 0; v < 3; v++) {
    const W = 9, H = 11, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.94, top = H * u * 0.22;
    shadowAt(g, cx + u * 0.6, base - u * 0.4, u * 1.8, u * 0.7, 0.22);
    g.lineCap = 'round';
    g.strokeStyle = pal.trunkD; g.lineWidth = u * 0.9;
    g.beginPath(); g.moveTo(cx, base); g.lineTo(cx + rr(-0.6, 0.6) * u, top); g.stroke();
    g.strokeStyle = pal.dead; g.lineWidth = u * 0.45;
    for (let i = 0; i < 5; i++) {
      const t = rr(0.15, 0.8), y = lerp(base, top, t);
      const dir = chance(0.5) ? 1 : -1;
      g.beginPath(); g.moveTo(cx, y);
      g.lineTo(cx + dir * u * rr(1.4, 2.6), y - u * rr(1.0, 2.2));
      g.stroke();
    }
    V.dead.push(c);
  }

  return V;
}

/* ---------- камни ---------- */
function makeRocks(pal) {
  const u = SC, out = [];
  for (let v = 0; v < 3; v++) {
    const S = Math.round(7 * u), c = newCv(S, S), g = c.getContext('2d');
    const cx = S / 2, cy = S / 2, r = (1.5 + v * 0.4) * u;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(cx + u * 0.3, cy + r * 0.6, r, r * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = pal.rockD;
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, rr2 = r * (0.75 + h1(k + v * 3) * 0.5);
      const x = cx + Math.cos(a) * rr2, y = cy + Math.sin(a) * rr2 * 0.8;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill();
    g.fillStyle = pal.rock;
    g.beginPath(); g.ellipse(cx - r * 0.2, cy - r * 0.25, r * 0.55, r * 0.4, 0, 0, TAU); g.fill();
    out.push(c);
  }
  return out;
}
