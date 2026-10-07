'use strict';
/* ============================================================
   depth.js — псевдо-3D поверх плоской сцены.

   Приёмы дешёвые, всё тяжёлое готовится один раз:
   • корабли «стопкой спрайтов»: затемнённый силуэт корпуса
     повторяется со сдвигом вверх на физический пиксель — получается
     борт настоящей высоты, который виден при любом развороте;
     сверху кладётся сама палуба, на воду падает тень;
   • у построек и самолётов — тени, отброшенные солнцем;
   • облака с параллаксом: висят выше камеры и плывут быстрее
     моря, а их тени скользят по воде и кораблям.
   Слоёв борта ровно столько, сколько физических пикселей в его
   высоте, поэтому на низком качестве графики их меньше сами собой.
   ============================================================ */

/* солнце слева сверху: тень уходит вправо-вниз на единицу высоты */
const SUN = { x: 0.62, y: 0.78 };

/* высота борта (в единицах мира) для спрайтов кораблей */
sprPlayer._h = 2.4;
SHIP_SPR.patrol._h = 1.6;
SHIP_SPR.gun._h = 2.2;
SHIP_SPR.missile._h = 2.3;
SHIP_SPR.frigate._h = 3.2;
sprTransport._h = 3.4;

/* силуэт спрайта одним цветом (для тени) */
function silhouette(spr, col) {
  const c = newCv(spr.width, spr.height), g = c.getContext('2d');
  g.drawImage(spr, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
}
/* средний цвет корпуса — из непрозрачных пикселей спрайта */
function avgColor(spr) {
  try {
    const d = spr.getContext('2d').getImageData(0, 0, spr.width, spr.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (n) return [r / n, g / n, b / n];
  } catch (e) {}
  return [80, 90, 100];
}
/* Борт — ровный силуэт цвета корпуса в тени (детали палубы на нём
   дали бы рябь). Нижние слои — тёмная ватерлиния. */
function sideOf(spr) {
  if (spr._side) return spr._side;
  const [r, g, b] = avgColor(spr);
  const col = (k) => 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')';
  spr._side = silhouette(spr, col(0.62));
  spr._sideW = silhouette(spr, col(0.34));
  return spr._side;
}
const shadowOf = spr => spr._shd || (spr._shd = silhouette(spr, '#021018'));

/* Корабль: тень, борт стопкой, палуба сверху.
   ang — угол поворота спрайта (уже с +PI/2), H — высота борта. */
function drawStack(spr, x, y, ang, H, roll, alpha) {
  const w = spr.width / SC, h = spr.height / SC;
  const a0 = alpha === undefined ? 1 : alpha;
  /* тень на воде: смещена от солнца на высоту борта */
  ctx.globalAlpha = 0.30 * a0;
  ctx.save();
  ctx.translate(x + 0.6 + H * SUN.x, y + 0.8 + H * SUN.y);
  ctx.rotate(ang);
  ctx.drawImage(shadowOf(spr), -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = a0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  /* шаг «вверх по миру» в повёрнутой системе координат */
  const st = D * (SC >= 4 ? 1.5 : 1);
  const n = Math.max(1, Math.round(H / st));
  const du = -Math.sin(ang) * (H / n), dv = -Math.cos(ang) * (H / n);
  const side = sideOf(spr), water = spr._sideW;
  for (let k = 0; k < n; k++) {
    ctx.drawImage(k < n * 0.35 ? water : side, -w / 2, -h / 2, w, h);
    ctx.translate(du, dv);
  }
  if (roll) ctx.transform(1, 0, roll * 0.5, 1, 0, 0);
  ctx.drawImage(spr, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* Тень высокой постройки: силуэт «ложится» на землю вправо-вниз.
   (x, yb) — точка основания, hb — сколько спрайта выше основания. */
function drawCastShadow(spr, x, yb, hb, k) {
  const w = spr.width / SC, h = spr.height / SC;
  ctx.globalAlpha = 0.26 * (k || 1);
  ctx.save();
  ctx.translate(x, yb);
  ctx.transform(1, 0, -SUN.x * 0.9, -SUN.y * 0.55, 0, 0);
  ctx.drawImage(shadowOf(spr), -w / 2, -hb, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------- облака ---------- */
/* Бесшовная текстура мягких облаков в низком разрешении: растягивается
   со сглаживанием, поэтому стоит одну заливку шаблоном на кадр. */
let cloudCv = null, cloudShCv = null, cloudPat = null, cloudShPat = null;
const CLOUD_S = 160, CLOUD_T = 620;     /* размер текстуры, px; размер плитки на экране, ед. */

function buildClouds() {
  const S = CLOUD_S;
  cloudCv = newCv(S, S);
  const g = cloudCv.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * S, cy = rnd() * S;
    const n = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * 34, y = cy + (rnd() - 0.5) * 16, r = 7 + rnd() * 14;
      /* рисуем с переносом через края — плитка без швов */
      for (const ox2 of [-S, 0, S]) for (const oy2 of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox2, y + oy2, 0, x + ox2, y + oy2, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)');
        gr.addColorStop(0.6, 'rgba(255,255,255,0.22)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox2 - r, y + oy2 - r, r * 2, r * 2);
      }
    }
  }
  cloudShCv = silhouette(cloudCv, '#02101a');
  cloudPat = ctx.createPattern(cloudCv, 'repeat');
  cloudShPat = ctx.createPattern(cloudShCv, 'repeat');
}

/* насколько облачно: днём заметно, ночью и в тумане почти нет */
function cloudiness() {
  if (!FXQ) return 0;
  const amb = curCfg.ambient || 0, w = curCfg.weather || {};
  if (amb > 0.6) return 0;
  return clamp(0.55 + (w.rain ? 0.35 : 0) + (w.haze ? 0.1 : 0) - amb * 0.6 - (w.fog || 0), 0, 1);
}

function cloudLayer(pat, par, alpha, dx, dy) {
  const z = cam.z, T = CLOUD_T;
  const drift = tGlobal * (4 + Math.abs((WEA && WEA.wind) || 0) * 14);
  const offx = (((ox * z * par + drift + dx) % T) + T) % T;
  const offy = (((oy * z * par + drift * 0.35 + dy) % T) + T) % T;
  const k = T / CLOUD_S;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.translate(-offx, -offy);
  ctx.scale(k, k);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, (VW + T) / k, (VH + T) / k);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
}

/* тени облаков лежат на воде (параллакс 1), сами облака выше (1.35) */
function drawCloudShadows() {
  const c = cloudiness();
  if (c <= 0) return;
  if (!cloudCv) buildClouds();
  cloudLayer(cloudShPat, 1.0, 0.16 * c, 60, 80);
}
function drawClouds() {
  const c = cloudiness();
  if (c <= 0) return;
  if (!cloudCv) buildClouds();
  cloudLayer(cloudPat, 1.35, 0.20 * c, 0, 0);
}

/* лёгкий наклон взгляда: даль (верх кадра) светлее, ближний край темнее */
let tiltGrad = null;
function drawTilt() {
  if (!tiltGrad) {
    tiltGrad = ctx.createLinearGradient(0, 0, 0, VH);
    tiltGrad.addColorStop(0, 'rgba(200,235,255,0.07)');
    tiltGrad.addColorStop(0.45, 'rgba(200,235,255,0)');
    tiltGrad.addColorStop(1, 'rgba(0,8,16,0.12)');
  }
  ctx.fillStyle = tiltGrad;
  ctx.fillRect(0, 0, VW, VH);
}
