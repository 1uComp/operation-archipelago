'use strict';
/* ============================================================
   world.js — генерация архипелага, пре-рендер карты, геометрия

   Карта не хранится одним огромным холстом: при SC=4 он весил бы
   сотни мегабайт. Вместо этого:
     * seaDepth — карта глубин в 1/6 разрешения, растягивается со сглаживанием;
     * seaTex   — два бесшовных тайла ряби, выводятся 1:1 к пикселям экрана;
     * каждый остров — собственный холст полного разрешения по своей
       ограничивающей рамке (вытянутые острова не платят за пустоту).
   ============================================================ */

const NAME_POOL = ['isl_fang', 'isl_thund', 'isl_raid', 'isl_serp', 'isl_storm', 'isl_ash',
                   'isl_crab', 'isl_gloom', 'isl_needle', 'isl_wolf', 'isl_fort', 'isl_breeze',
                   'isl_shark', 'isl_cape', 'isl_reef', 'isl_anchor'];
const islName = isl => T(isl.nameKey);

const ISL_MARGIN = 1.38;              /* запас вокруг берега под отмели и тень */
const D = 1 / SC;                     /* один физический пиксель в единицах мира */
const ISL_N = 96;                     /* точек в контуре берега */

let vegSpr = null, rockSpr = null;

/* ------------------------------------------------------------
   Форма острова.
   Базис — эллипс произвольного поворота, поверх него необязательные
   доли (twin), залив (bay) и круговой шум. Контур всегда звёздчатый
   относительно центра, поэтому radiusAt/isWater остаются корректными.
   ------------------------------------------------------------ */
function makeShape(r0) {
  const kind = pick(['round', 'round', 'long', 'long', 'bay', 'twin', 'ragged', 'ragged']);
  const n = ISL_N, rad = new Array(n);
  const phi = rr(0, TAU);

  let b = 1, lobes = 0, bayD = 0;
  if (kind === 'long')        b = rr(0.32, 0.54);
  else if (kind === 'twin') { b = rr(0.50, 0.72); lobes = rr(0.20, 0.32); }
  else if (kind === 'bay')  { b = rr(0.70, 1.00); bayD = rr(0.34, 0.52); }
  else if (kind === 'ragged') b = rr(0.66, 1.00);

  const bayA = rr(0, TAU), bayW = rr(0.55, 0.95);
  const s1 = rr(0, 100), s2 = rr(0, 100), s3 = rr(0, 100);
  const amp = kind === 'ragged' ? 1.8 : 1.0;

  for (let i = 0; i < n; i++) {
    const t = i / n * TAU;
    const c = Math.cos(t - phi), s = Math.sin(t - phi);
    let f = 1 / Math.sqrt(c * c + (s * s) / (b * b));      /* полярная форма эллипса */
    if (lobes) f *= 1 + lobes * Math.cos(2 * (t - phi));
    if (bayD) {
      const dd = angDiff(t, bayA);
      f *= 1 - bayD * Math.exp(-(dd * dd) / (bayW * bayW));
    }
    const nz = 1 + amp * (0.13 * Math.sin(t * 3 + s1) +
                          0.09 * Math.sin(t * 5 + s2) +
                          0.06 * Math.sin(t * 8 + s3));
    rad[i] = Math.max(r0 * 0.20, r0 * f * nz);
  }
  const passes = kind === 'ragged' ? 1 : 2;
  for (let p = 0; p < passes; p++) {
    const cp = rad.slice();
    for (let i = 0; i < n; i++) rad[i] = (cp[(i - 1 + n) % n] + cp[i] * 2 + cp[(i + 1) % n]) / 4;
  }
  return { rad, kind };
}

/* размер: островки, средние и крупные острова */
function pickIslandSize() {
  const q = Math.random();
  if (q < 0.28) return rr(26, 40);
  if (q < 0.72) return rr(48, 74);
  return rr(80, 108);
}

function radiusAt(isl, a) {
  const n = isl.rad.length;
  let i = (a / TAU) * n; i = ((i % n) + n) % n;
  const i0 = Math.floor(i), i1 = (i0 + 1) % n, f = i - i0;
  return isl.rad[i0] * (1 - f) + isl.rad[i1] * f;
}
function islandPath(g, isl, s) {
  const n = isl.rad.length, pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, r = isl.rad[i] * s;
    pts.push([isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r]);
  }
  g.beginPath();
  g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.closePath();
}

/* точка на острове с гарантированным отступом от воды */
function placeOn(isl, frac, margin) {
  for (let t = 0; t < 40; t++) {
    const a = rr(0, TAU), rHere = radiusAt(isl, a);
    const d = Math.min(rHere * frac, rHere * 0.90 - margin);
    if (d < 2) continue;
    return { x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d };
  }
  return { x: isl.x, y: isl.y };
}

/* ---------- генерация ---------- */
function genWorld(cfg) {
  curCfg = cfg;
  PAL = BIOMES[cfg.biome] || BIOMES.tropic;
  vegSpr = makeVeg(PAL);
  rockSpr = makeRocks(PAL);
  islands = []; structs = []; mines = [];

  const names = shuffle(NAME_POOL.slice());
  let tries = 0, gap = 165;
  while (islands.length < cfg.isl && tries < 24000) {
    tries++;
    if (tries % 2500 === 0) gap = Math.max(60, gap - 22);
    const r0 = pickIslandSize();
    const sh = makeShape(r0);
    let maxR = 0, sum = 0;
    for (const v of sh.rad) { if (v > maxR) maxR = v; sum += v; }
    const pad = maxR * ISL_MARGIN;
    const xMax = cfg.span ? Math.min(WORLD.w, CARR.x + cfg.span) : WORLD.w;
    const x = rr(pad + 40, xMax - pad - 40), y = rr(pad + 40, WORLD.h - pad - 40);
    if (dist(x, y, CARR.x, CARR.y) < 380 + maxR) continue;
    let ok = true;
    for (const o of islands) if (dist(x, y, o.x, o.y) < maxR + o.r + gap) { ok = false; break; }
    if (!ok) continue;
    islands.push({
      x, y, r: maxR, rAvg: sum / sh.rad.length, r0, rad: sh.rad, kind: sh.kind,
      nameKey: names[islands.length % names.length],
      hasBase: false, friendly: false, cv: null, bx: 0, by: 0, bw: 0, bh: 0
    });
  }

  /* базы — на самых крупных островах, чтобы постройки не свисали в воду */
  const bySize = islands.slice().sort((a, b) => b.rAvg - a.rAvg);
  for (let i = 0; i < Math.min(cfg.bases, bySize.length); i++) bySize[i].hasBase = true;

  /* дружеские островки: самые мелкие, без вражеских построек */
  piers = [];
  const smalls = islands.filter(i => !i.hasBase).sort((a, b) => a.rAvg - b.rAvg);
  const nFriendly = clamp(Math.round(cfg.isl / 5), 1, 3);
  for (let i = 0; i < nFriendly && i < smalls.length; i++) smalls[i].friendly = true;

  /* строения */
  let towerPlaced = false;
  for (const isl of islands) {
    if (isl.friendly) continue;
    const small = isl.rAvg < 36;
    if (isl.hasBase) {
      const p = placeOn(isl, 0.42, 14);
      structs.push(mkStruct('base', p.x, p.y, cfg.baseHp, 11, isl));
      const nb = 1 + (chance(0.6) ? 1 : 0);
      for (let k = 0; k < nb; k++) {
        const q = placeOn(isl, 0.72, 9);
        structs.push(mkStruct('bunker', q.x, q.y, cfg.bHp, 7, isl));
      }
    } else {
      const nb = small ? 1 : 2;
      for (let k = 0; k < nb; k++) {
        const q = placeOn(isl, 0.70, 9);
        structs.push(mkStruct('bunker', q.x, q.y, cfg.bHp, 7, isl));
      }
    }
    if (!towerPlaced && !isl.hasBase && isl.rAvg > 42 && chance(0.6)) {
      towerPlaced = true;
      const q = placeOn(isl, 0.35, 9);
      structs.push(mkStruct('tower', q.x, q.y, cfg.bHp * 0.8, 7, isl));
    }
    const nc = small ? ri(0, 1) : ri(0, 2);
    for (let k = 0; k < nc; k++) {
      const q = placeOn(isl, rr(0.5, 0.85), 6);
      structs.push(mkStruct('crate', q.x, q.y, 18, 5, isl));
    }
  }
  if (!towerPlaced && islands.length) {
    const isl = bySize[Math.min(bySize.length - 1, cfg.bases)] || islands[0];
    const q = placeOn(isl, 0.35, 9);
    structs.push(mkStruct('tower', q.x, q.y, cfg.bHp * 0.8, 7, isl));
  }

  /* маяки для ночной операции */
  if (cfg.lights) {
    const pool = islands.filter(i => !i.friendly).sort((a, b) => b.rAvg - a.rAvg);
    for (let i = 0; i < cfg.lights && i < pool.length; i++) {
      const isl = pool[i];
      const q = placeOn(isl, 0.55, 10);
      const L = mkStruct('light', q.x, q.y, cfg.bHp * 0.7, 6, isl);
      L.spin = (chance(0.5) ? 1 : -1) * rr(0.30, 0.55);
      L.range = rr(190, 260);
      L.arc = rr(0.30, 0.44);
      structs.push(L);
    }
  }

  /* острова десантной операции */
  allyIsl = null; targetIsl = null;
  if (cfg.mission === 'escort' && islands.length > 1) {
    const bySz = islands.filter(i => !i.friendly).sort((a, b) => b.rAvg - a.rAvg);
    targetIsl = bySz.find(i => i.hasBase) || bySz[0];
    const rest = islands.filter(i => i !== targetIsl && !i.friendly);
    rest.sort((a, b) => dist(a.x, a.y, CARR.x, CARR.y) - dist(b.x, b.y, CARR.x, CARR.y));
    allyIsl = rest.find(i => !i.hasBase) || rest[0];
  }

  /* минные банки */
  for (let i = 0; i < (cfg.mines || 0); i++) {
    for (let t = 0; t < 30; t++) {
      const isl = pick(islands);
      const a = rr(0, TAU), d = radiusAt(isl, a) + rr(24, 90);
      const x = isl.x + Math.cos(a) * d, y = isl.y + Math.sin(a) * d;
      if (!isWater(x, y)) continue;
      if (dist(x, y, CARR.x, CARR.y) < 320) continue;
      mines.push({ x, y, ph: rr(0, TAU), hp: 12, armed: 0.6 });
      break;
    }
  }

  for (const isl of islands) if (isl.friendly) piers.push(mkPier(isl));

  totalBases = structs.filter(s => s.type === 'base').length;
  crates = structs.filter(s => s.type === 'crate').length;

  gullsReset();
  buildSeaDepth(cfg.sea);
  buildSeaTiles(cfg.sea);
  for (const isl of islands) buildIslandCanvas(isl, cfg.sea);
}

function mkStruct(type, x, y, hp, r, isl) {
  return { type, x, y, hp, max: hp, r, isl, cool: rr(0, 2), flash: 0, dead: false,
           rad: rr(0, TAU), shakeT: 0, seed: Math.random() * 100 };
}

/* ---------- море ---------- */
function hexRGB(h) {
  return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
}

/* карта глубин: крупные пятна светлее/темнее, растягивается со сглаживанием */
function buildSeaDepth(SP) {
  const K = 6;
  const w = Math.ceil(WORLD.w / K), h = Math.ceil(WORLD.h / K);
  seaDepth = document.createElement('canvas');
  seaDepth.width = w; seaDepth.height = h;
  const g = seaDepth.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const base = hexRGB(SP.sea), deep = hexRGB(SP.deep || SP.sea);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = x * K, wy = y * K;
      const n = fbm(wx / 300, wy / 300) * 0.68 + fbm(wx / 90, wy / 90) * 0.32;
      const t = clamp((n - 0.34) / 0.34, 0, 1);
      const i = (y * w + x) * 4;
      d[i]     = lerp(deep[0], base[0] * 1.12, t);
      d[i + 1] = lerp(deep[1], base[1] * 1.12, t);
      d[i + 2] = lerp(deep[2], base[2] * 1.12, t);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/* два бесшовных тайла ряби в физических пикселях:
   слой 0 — мелкая рябь, слой 1 — длинные гребни */
function buildSeaTiles(SP) {
  const S = 192;
  for (let layer = 0; layer < 2; layer++) {
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const streak = (x, y, len, th, col) => {
      for (let ox2 = -S; ox2 <= S; ox2 += S)
        for (let oy2 = -S; oy2 <= S; oy2 += S) {
          g.fillStyle = col;
          g.fillRect(x + ox2, y + oy2, len, th);
          g.fillRect(x + ox2 + len * 0.25, y + oy2 - th, len * 0.5, th);
        }
    };
    const nStreak = layer ? 30 : 16;
    for (let i = 0; i < nStreak; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const len = layer ? rr(14, 46) : rr(8, 22);
      streak(x, y, len, 1, 'rgba(255,255,255,' + rr(0.035, layer ? 0.085 : 0.06).toFixed(3) + ')');
      streak(x + rr(-6, 6), y + rr(2, 5), len * 0.7, 1, 'rgba(0,0,0,' + rr(0.03, 0.06).toFixed(3) + ')');
    }
    const n = layer ? 420 : 900;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * S) | 0, y = (Math.random() * S) | 0, w = ri(1, layer ? 4 : 2);
      g.fillStyle = 'rgba(255,255,255,' + rr(0.02, layer ? 0.05 : 0.08).toFixed(3) + ')';
      g.fillRect(x, y, w, 1);
    }
    for (let i = 0; i < n * 0.5; i++) {
      const x = (Math.random() * S) | 0, y = (Math.random() * S) | 0, w = ri(1, 3);
      g.fillStyle = 'rgba(0,0,0,' + rr(0.02, 0.05).toFixed(3) + ')';
      g.fillRect(x, y, w, 1);
    }
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() * S) | 0, y = (Math.random() * S) | 0;
      g.fillStyle = SP.sp;
      g.fillRect(x, y, ri(2, 5), 1);
    }
    seaTex[layer] = c;
  }
}

/* ---------- растительность ---------- */
/* вес вида зависит от того, насколько точка близка к берегу */
function pickVeg(mixList, t) {
  const shore = t > 0.70;
  let tot = 0;
  const w = [];
  for (const pair of mixList) {
    const k = pair[0];
    let q = pair[1];
    if (shore) {
      if (k === 'palm') q *= 2.4;
      else if (k === 'big') q *= 0.12;
      else if (k === 'broad') q *= 0.45;
      else if (k === 'tuft') q *= 1.7;
      else if (k === 'bush') q *= 1.4;
      else if (k === 'fern') q *= 0.5;
    } else {
      if (k === 'palm') q *= 0.65;
      else if (k === 'big') q *= 1.6;
      else if (k === 'fern') q *= 1.3;
    }
    w.push([k, q]); tot += q;
  }
  let r = Math.random() * tot;
  for (const pair of w) { r -= pair[1]; if (r <= 0) return pair[0]; }
  return w[0][0];
}

function nearStruct(isl, x, y) {
  for (const s of structs) {
    if (s.isl !== isl) continue;
    const need = s.type === 'base' ? 17 : s.type === 'crate' ? 7 : 11;
    if (dist(x, y, s.x, s.y) < need) return true;
  }
  return false;
}

function placeVegetation(g, isl) {
  const cfgv = VEG_MIX[curCfg.biome] || VEG_MIX.tropic;
  /* плотность от площади: одно растение примерно на 42 кв. единицы */
  const area = Math.PI * isl.rAvg * isl.rAvg * 0.62;
  const total = Math.round(area / 42 * cfgv.dens);

  /* рощи — растения кучкуются вокруг них, остальное рассыпано */
  const groves = [];
  const ng = 4 + Math.round(isl.rAvg / 11);
  for (let i = 0; i < ng; i++) {
    const a = rr(0, TAU), d = rr(0.05, 0.68) * radiusAt(isl, a);
    groves.push({ x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
                  r: rr(0.20, 0.46) * isl.rAvg });
  }

  const plants = [];
  let guard = 0;
  while (plants.length < total && guard < total * 7 + 200) {
    guard++;
    let x, y;
    if (chance(0.55) && groves.length) {
      const G = pick(groves);
      const a = rr(0, TAU), d = Math.pow(Math.random(), 0.55) * G.r;
      x = G.x + Math.cos(a) * d; y = G.y + Math.sin(a) * d;
    } else {
      const a = rr(0, TAU), d = Math.sqrt(Math.random());
      const rHere = radiusAt(isl, a);
      x = isl.x + Math.cos(a) * rHere * d * 0.88;
      y = isl.y + Math.sin(a) * rHere * d * 0.88;
    }
    const dx = x - isl.x, dy = y - isl.y;
    const rHere = radiusAt(isl, Math.atan2(dy, dx));
    const t = Math.hypot(dx, dy) / rHere;
    if (t > 0.90) continue;                       /* мокрый песок оставляем пустым */
    if (nearStruct(isl, x, y)) continue;          /* вокруг построек — расчищено */
    const kind = pickVeg(cfgv.mix, t);
    const bank = vegSpr[kind];
    if (!bank || !bank.length) continue;
    plants.push({ x, y, spr: pick(bank) });
  }

  /* дальние перекрываются ближними */
  plants.sort((p, q) => p.y - q.y);
  for (const p of plants) {
    const w = p.spr.width / SC, h = p.spr.height / SC;
    g.drawImage(p.spr, p.x - w / 2, p.y - h * 0.80, w, h);
  }
}

/* ---------- остров ---------- */
function buildIslandCanvas(isl, SP) {
  /* ограничивающая рамка по контуру с запасом */
  const n = isl.rad.length;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU, r = isl.rad[i] * ISL_MARGIN;
    const px = Math.cos(t) * r, py = Math.sin(t) * r;
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
  isl.bx = x0; isl.by = y0; isl.bw = x1 - x0; isl.bh = y1 - y0;

  const c = document.createElement('canvas');
  c.width = Math.ceil(isl.bw * SC);
  c.height = Math.ceil(isl.bh * SC);
  const g = c.getContext('2d');
  /* рисуем в мировых координатах: единица = SC пикселей */
  g.setTransform(SC, 0, 0, SC, (-isl.x - x0) * SC, (-isl.y - y0) * SC);
  isl.cv = c;

  const grain = (count, s0, s1, col, sz) => {
    for (let k = 0; k < count; k++) {
      const a = rr(0, TAU), d = radiusAt(isl, a) * rr(s0, s1);
      g.fillStyle = col;
      g.fillRect(isl.x + Math.cos(a) * d, isl.y + Math.sin(a) * d, sz || D, sz || D);
    }
  };
  const K = isl.rAvg / 60;                       /* масштабный коэффициент деталей */

  /* тень на глубине */
  g.fillStyle = 'rgba(4,16,28,0.34)'; islandPath(g, isl, 1.34); g.fill();
  /* ступени отмели */
  g.fillStyle = SP.sh1; islandPath(g, isl, 1.24); g.fill();
  g.fillStyle = SP.sh2; islandPath(g, isl, 1.13); g.fill();
  g.fillStyle = SP.sh3; islandPath(g, isl, 1.05); g.fill();
  grain(Math.round(isl.rAvg * 14), 1.05, 1.23, 'rgba(20,50,60,0.30)', D * 2);
  grain(Math.round(isl.rAvg * 8), 1.02, 1.22, 'rgba(255,255,255,0.10)', D * 2);

  /* пляж */
  g.fillStyle = PAL.sand; islandPath(g, isl, 1.0); g.fill();
  g.fillStyle = PAL.wet;  islandPath(g, isl, 0.972); g.fill();
  g.fillStyle = PAL.sand; islandPath(g, isl, 0.935); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = D * 2;
  islandPath(g, isl, 0.998); g.stroke();
  grain(Math.round(isl.rAvg * 26), 0.84, 0.995, PAL.sandD);
  grain(Math.round(isl.rAvg * 12), 0.84, 0.995, 'rgba(255,255,255,0.30)');
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = D;
  for (let k = 0; k < 5; k++) { islandPath(g, isl, 0.945 + k * 0.012); g.stroke(); }

  /* Псевдо-3D: плато поднято над пляжем. Слои земляного обрыва
     со сдвигом вверх дают видимую стенку с южной стороны; всё, что
     стоит на траве (и постройки в drawStruct), рисуется выше на lift. */
  const H = isl.lift = clamp(isl.rAvg * 0.065, 1.6, 4.6);
  g.fillStyle = 'rgba(40,30,16,0.22)';
  g.save(); g.translate(H * SUN.x * 0.8, H * 0.2); islandPath(g, isl, 0.85); g.fill(); g.restore();
  const cliffD = shade(PAL.sandD, 0.52), cliffL = shade(PAL.sandD, 0.74);
  for (let k = 0; k < H; k += D) {
    g.save(); g.translate(0, -k);
    g.fillStyle = k < H * 0.5 ? cliffD : cliffL;
    islandPath(g, isl, 0.84); g.fill();
    g.restore();
  }
  g.save();
  g.translate(0, -H);
  /* кромка обрыва подсвечена солнцем */
  g.strokeStyle = 'rgba(255,240,200,0.28)'; g.lineWidth = D * 2;
  islandPath(g, isl, 0.838); g.stroke();

  /* зелёный покров */
  g.fillStyle = PAL.grassD; islandPath(g, isl, 0.828); g.fill();
  g.fillStyle = PAL.grass;  islandPath(g, isl, 0.80); g.fill();
  /* поляны и подлесок */
  const litG = shade(PAL.grass, 1.16), darkG = shade(PAL.grassD, 0.88);
  g.globalAlpha = 0.42;
  for (let k = 0; k < Math.round(9 * K) + 5; k++) {
    const a = rr(0, TAU), d = rr(0, 0.5) * radiusAt(isl, a);
    const cx0 = isl.x + Math.cos(a) * d, cy0 = isl.y + Math.sin(a) * d;
    const rx = isl.rAvg * rr(0.07, 0.19), ry = isl.rAvg * rr(0.05, 0.15), rot = rr(0, TAU);
    g.fillStyle = chance(0.55) ? darkG : litG;
    /* пятно из нескольких эллипсов — кромка получается рваной */
    for (let q = 0; q < 3; q++) {
      g.beginPath();
      g.ellipse(cx0 + rr(-rx, rx) * 0.5, cy0 + rr(-ry, ry) * 0.5,
                rx * rr(0.5, 0.9), ry * rr(0.5, 0.9), rot, 0, TAU);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  grain(Math.round(isl.rAvg * 22), 0.10, 0.78, 'rgba(255,255,255,0.08)');
  grain(Math.round(isl.rAvg * 22), 0.10, 0.78, 'rgba(0,0,0,0.09)');

  /* тропинки между постройками */
  const pts = structs.filter(s => s.isl === isl);
  g.strokeStyle = 'rgba(92,72,44,0.26)'; g.lineWidth = D * 6;
  g.lineCap = 'round';
  for (let i = 0; i + 1 < pts.length; i++) {
    g.beginPath();
    g.moveTo(pts[i].x, pts[i].y);
    g.quadraticCurveTo((pts[i].x + pts[i + 1].x) / 2 + rr(-8, 8),
                       (pts[i].y + pts[i + 1].y) / 2 + rr(-8, 8),
                       pts[i + 1].x, pts[i + 1].y);
    g.stroke();
  }
  /* тропинка к берегу */
  if (pts.length) {
    const a0 = rr(0, TAU), rEdge = radiusAt(isl, a0) * 0.95;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    g.quadraticCurveTo(isl.x + rr(-12, 12), isl.y + rr(-12, 12),
                       isl.x + Math.cos(a0) * rEdge, isl.y + Math.sin(a0) * rEdge);
    g.stroke();
  }
  /* утоптанные площадки под постройками */
  for (const s of pts) {
    const rp = s.type === 'base' ? 17 : s.type === 'crate' ? 6 : 10;
    g.fillStyle = 'rgba(104,84,52,0.30)';
    g.beginPath(); g.ellipse(s.x, s.y + 1, rp, rp * 0.72, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,140,100,0.14)';
    g.beginPath(); g.ellipse(s.x, s.y, rp * 0.7, rp * 0.5, 0, 0, TAU); g.fill();
  }

  /* растительность */
  placeVegetation(g, isl);

  /* камни у кромки и в глубине */
  for (let k = 0; k < Math.round(7 * K) + 4; k++) {
    const a = rr(0, TAU), d = radiusAt(isl, a) * rr(0.55, 1.0);
    const spr = pick(rockSpr);
    g.drawImage(spr, isl.x + Math.cos(a) * d - spr.width / (2 * SC),
                isl.y + Math.sin(a) * d - spr.height / (2 * SC),
                spr.width / SC, spr.height / SC);
  }
  g.restore();                       /* конец плато */
}

/* ---------- геометрия / столкновения ---------- */
function collideIslands(o, rad) {
  let hit = false;
  for (const isl of islands) {
    const dx = o.x - isl.x, dy = o.y - isl.y, d = Math.hypot(dx, dy);
    if (d > isl.r + rad + 2) continue;
    const need = radiusAt(isl, Math.atan2(dy, dx)) + rad;
    if (d < need && d > 0.001) { o.x = isl.x + dx / d * need; o.y = isl.y + dy / d * need; hit = true; }
  }
  const dc = dist(o.x, o.y, CARR.x, CARR.y);
  if (dc < 32 + rad && dc > 0.001) {
    o.x = CARR.x + (o.x - CARR.x) / dc * (32 + rad);
    o.y = CARR.y + (o.y - CARR.y) / dc * (32 + rad);
    hit = true;
  }
  return hit;
}
function isWater(x, y) {
  for (const isl of islands) {
    const d = dist(x, y, isl.x, isl.y);
    if (d > isl.r) continue;
    if (d < radiusAt(isl, Math.atan2(y - isl.y, x - isl.x))) return false;
  }
  return true;
}
