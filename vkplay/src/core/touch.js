'use strict';
/* ============================================================
   touch.js — сенсорное управление.

   Левая половина экрана — виртуальный стик: катер поворачивает
   к направлению пальца, скорость пропорциональна отклонению.
   Правая половина — ручной прицел и огонь. Пока палец её не
   касается, работает автоприцел: башня сама бьёт ближайшую цель.
   Крупные кнопки дугой под большим пальцем справа внизу.

   Чтобы не дублировать логику, касание прицела просто выставляет
   mouse.x/mouse.y/mouse.down — весь остальной код работает как есть.
   ============================================================ */

const tMove = { active: false, dx: 0, dy: 0, mag: 0, bx: 0, by: 0, x: 0, y: 0, id: -1 };
const tAim  = { id: -1 };
const tHeld = {};                       /* имя кнопки -> id пальца */
let touchUsed = false;                  /* был ли хоть один тач: для подсказок */

const STICK_R = 34;                     /* радиус отклонения стика, единицы разметки */
const STICK_KNOB = 12;                  /* ручка стика */
const STICK_HINT_X = 70, STICK_HINT_Y = VH - 112;   /* где рисуется подсказка стика */

function tButtons() {
  const near = player && !player.dead && dist(player.x, player.y, CARR.x, CARR.y) < 145;
  /* Дуга под большим пальцем в правом нижнем углу: ракета — ближе всего
     к пальцу и крупнее всех, остальное вокруг. Счёт на телефоне живёт
     в верхней левой панели, поэтому угол целиком отдан кнопкам. */
  const b = [
    { id: 'rocket', x: VW - 44,  y: VH - 52,  r: 28 },
    { id: 'boost',  x: VW - 44,  y: VH - 122, r: 22 },
    { id: 'smoke',  x: VW - 110, y: VH - 36,  r: 20 },
    { id: 'pause',  x: VW - 22,  y: 108,      r: 13 }
  ];
  if (upg.dc) b.push({ id: 'dc', x: VW - 106, y: VH - 96, r: 20 });
  if (near) b.push({ id: 'shop', x: VW - 168, y: VH - 40, r: 18 });
  return b;
}

/* экранные координаты касания в единицах разметки */
function tPos(t) {
  const r = cv.getBoundingClientRect();
  return {
    x: clamp((t.clientX - r.left) * (VW / r.width), 0, VW),
    y: clamp((t.clientY - r.top) * (VH / r.height), 0, VH)
  };
}

/* зона нажатия шире самой кнопки; при перекрытии берём ближайшую */
function hitButton(p) {
  let best = null, bd = 1e9;
  for (const b of tButtons()) {
    const d = dist(p.x, p.y, b.x, b.y);
    if (d < b.r + 9 && d - b.r < bd) { bd = d - b.r; best = b.id; }
  }
  return best;
}

/* ---------- нажатия вне боя: меню, магазин, настройки ---------- */
function touchTapUI(p) {
  mouse.x = p.x; mouse.y = p.y;
  if (uiTap(p.x, p.y)) return true;
  if (state === 'title') {
    if (hitTitleSettings(p.x, p.y)) { openSettings('title'); return true; }
    if (hitTitleCrate(p.x, p.y)) { openCrate('title'); return true; }
    if (hitTitleHq(p.x, p.y)) { openHQ('title'); return true; }
    goFullscreen(); startCampaign(); return true;
  }
  if (state === 'hq') { hqTap(p.x, p.y); return true; }
  if (state === 'crate') { crateTap(p.x, p.y); return true; }
  if (state === 'settings')   { settingsTap(p.x, p.y); return true; }
  if (state === 'shop')       { shopTap(p.x, p.y); return true; }
  if (state === 'pause') {
    if (hitPauseSettings(p.x, p.y)) { openSettings('pause'); return true; }
    setState('play'); SFX.ui(); return true;
  }
  if (state === 'over' && hitRevive(p.x, p.y)) { tryRevive(); return true; }
  if (state === 'levelclear' && stT > 0.6) { adThenLevel(level + 1); return true; }
  if (state === 'over' && stT > 0.8)       { adThenLevel(level); return true; }
  if (state === 'win'  && stT > 0.8)       { adThenLevel(level + 1); return true; }
  return false;
}

/* VK Play: чек-лист запрещает переключать полноэкранный режим из игры —
   этим управляет страница площадки. Функция оставлена пустой. */
function goFullscreen() { return; }
function goFullscreenOff() {
  if (!touchMode()) return;
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  } catch (e) {}
}

/* ---------- обработчики ---------- */
function onTouchStart(e) {
  try { window.focus(); } catch (err) {}      /* фокус окну игры — иначе клавиатура уходит странице площадки */
  if (tabBlocked()) { e.preventDefault(); initAudio(); tabTakeOver(); return; }
  if (!touchMode()) return;
  e.preventDefault();
  touchUsed = true;
  initAudio();
  for (const t of e.changedTouches) {
    const p = tPos(t);
    if (state !== 'play' && state !== 'dying') { touchTapUI(p); continue; }

    const btn = hitButton(p);
    if (btn) {
      tHeld[btn] = t.identifier;
      if (btn === 'rocket') { mouse.rdown = true; fireMissile(); }
      else if (btn === 'smoke') dropSmoke();
      else if (btn === 'dc') dropCharge();
      else if (btn === 'shop') {
        if (player && !player.dead && dist(player.x, player.y, CARR.x, CARR.y) < 145) {
          setState('shop'); shopSel = 0; shopMsgT = 0; SFX.ui();
        }
      } else if (btn === 'pause') { setState('pause'); SFX.ui(); }
      continue;
    }
    if (p.x < VW * 0.44 && tMove.id < 0) {
      tMove.id = t.identifier; tMove.active = true;
      tMove.bx = p.x; tMove.by = p.y; tMove.x = p.x; tMove.y = p.y;
      tMove.dx = 0; tMove.dy = 0; tMove.mag = 0;
    } else if (tAim.id < 0) {
      tAim.id = t.identifier;
      mouse.x = p.x; mouse.y = p.y; mouse.down = true;
    }
  }
}

function onTouchMove(e) {
  if (!touchMode()) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = tPos(t);
    if (t.identifier === tMove.id) {
      let dx = p.x - tMove.bx, dy = p.y - tMove.by;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {                       /* база подтягивается за пальцем */
        tMove.bx += dx * (1 - STICK_R / d);
        tMove.by += dy * (1 - STICK_R / d);
        dx = p.x - tMove.bx; dy = p.y - tMove.by;
      }
      tMove.x = p.x; tMove.y = p.y;
      tMove.dx = dx; tMove.dy = dy;
      tMove.mag = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    } else if (t.identifier === tAim.id) {
      mouse.x = p.x; mouse.y = p.y;
    }
  }
}

function onTouchEnd(e) {
  if (!touchMode()) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === tMove.id) {
      tMove.id = -1; tMove.active = false; tMove.mag = 0; tMove.dx = 0; tMove.dy = 0;
    }
    if (t.identifier === tAim.id) { tAim.id = -1; mouse.down = false; }
    for (const k in tHeld) if (tHeld[k] === t.identifier) {
      delete tHeld[k];
      if (k === 'rocket') mouse.rdown = false;
    }
  }
}

function touchBoosting() { return tHeld.boost !== undefined; }

function bindTouch() {
  const opt = { passive: false };
  cv.addEventListener('touchstart', onTouchStart, opt);
  cv.addEventListener('touchmove', onTouchMove, opt);
  cv.addEventListener('touchend', onTouchEnd, opt);
  cv.addEventListener('touchcancel', onTouchEnd, opt);
}

/* ------------------------------------------------------------
   Автоприцел на телефоне. Двумя пальцами рулить и целиться неудобно,
   поэтому, пока правый палец не лежит на экране, башня сама берёт
   ближайшую цель в зоне поражения и стреляет. Коснулся правой
   половины — прицел снова ручной. Ночью, пока катер не обнаружен,
   сама не стреляет: операция тихая, выдавать себя не будем.
   ------------------------------------------------------------ */
const AUTO_RANGE = 230;                 /* дальше снаряд почти не долетает */
let autoTgt = null;

function touchAutoAim() {
  autoTgt = null;
  if (!touchMode()) return;
  if (state !== 'play' || !player || player.dead) { if (tAim.id < 0) mouse.down = false; return; }
  if (tAim.id >= 0) return;             /* палец на экране — прицел ручной */
  const quiet = curCfg.mission === 'night' && !stealth.blown;
  const t = nearestTarget(player.x, player.y, AUTO_RANGE);
  if (t) {
    autoTgt = t;
    mouse.x = clamp((t.x - ox) * cam.z, 0, VW);
    mouse.y = clamp((t.y - oy) * cam.z, 0, VH);
    mouse.down = !quiet;
  } else {
    /* целей нет — башня смотрит по ходу катера */
    mouse.x = clamp(sX(player.x + Math.cos(player.ang) * 60), 0, VW);
    mouse.y = clamp(sY(player.y + Math.sin(player.ang) * 60), 0, VH);
    mouse.down = false;
  }
}

/* ---------- отрисовка ---------- */
/* Исходные радиусы кнопок, под которые нарисованы значки: значки
   масштабируются вместе с кнопкой. */
const BTN_BASE_R = { rocket: 19, boost: 15, smoke: 14, dc: 14, shop: 15, pause: 11, mute: 11 };

function drawTouchUI() {
  if (!touchMode()) return;

  /* стик */
  if (tMove.active) {
    ctx.strokeStyle = 'rgba(160,220,235,0.36)'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(tMove.bx, tMove.by, STICK_R, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(160,220,235,0.12)';
    ctx.beginPath(); ctx.arc(tMove.bx, tMove.by, STICK_R, 0, TAU); ctx.fill();
    const kx = tMove.bx + tMove.dx, ky = tMove.by + tMove.dy;
    ctx.fillStyle = 'rgba(200,240,250,0.6)';
    ctx.beginPath(); ctx.arc(kx, ky, STICK_KNOB, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(kx, ky, STICK_KNOB, 0, TAU); ctx.stroke();
  } else {
    /* подсказка, пока игрок не трогал стик */
    ctx.globalAlpha = 0.24 + 0.08 * Math.sin(tGlobal * 2);
    ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(STICK_HINT_X, STICK_HINT_Y, STICK_R, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath(); ctx.arc(STICK_HINT_X, STICK_HINT_Y, STICK_KNOB - 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* рамка на цели автоприцела — видно, куда стреляет башня */
  if (autoTgt && state === 'play') {
    const sx = sX(autoTgt.x), sy = sY(autoTgt.y), s = 9 + Math.sin(tGlobal * 8) * 1.2;
    ctx.strokeStyle = (curCfg.mission === 'night' && !stealth.blown) ? 'rgba(159,232,255,0.7)' : 'rgba(255,145,102,0.85)';
    ctx.lineWidth = D * 2;
    for (let q = 0; q < 4; q++) {
      const ax = q & 1 ? 1 : -1, ay = q & 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(sx + ax * s, sy + ay * (s - 4)); ctx.lineTo(sx + ax * s, sy + ay * s); ctx.lineTo(sx + ax * (s - 4), sy + ay * s);
      ctx.stroke();
    }
  }

  /* кнопки */
  for (const b of tButtons()) {
    const held = tHeld[b.id] !== undefined;
    let col = '#7fd4e0', label = '';
    if (b.id === 'rocket') { col = upg.msl && upg.ammo > 0 ? '#ffb454' : '#5b6b72'; label = String(upg.ammo); }
    else if (b.id === 'boost') { col = player && player.boostE > 4 ? '#7fd4e0' : '#5b6b72'; }
    else if (b.id === 'smoke') { col = smokeCD > 0 ? '#3d5f70' : '#9fe8ff'; }
    else if (b.id === 'dc') { col = dcCD > 0 ? '#5b6b72' : '#ffb454'; }
    else if (b.id === 'shop') col = '#4ade80';
    else if (b.id === 'pause') col = '#9fc3d0';
    else if (b.id === 'mute') col = muted ? '#5b6b72' : '#9fc3d0';

    ctx.fillStyle = held ? 'rgba(80,140,170,0.6)' : 'rgba(6,20,32,0.58)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();

    /* кольцо отката — по краю кнопки */
    const ring = f => {
      ctx.strokeStyle = col; ctx.lineWidth = D * 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 4, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    };
    if (b.id === 'boost' && player) ring(clamp(player.boostE / boostMax(), 0, 1));
    else if (b.id === 'smoke' && smokeCD > 0) ring(1 - smokeCD / SMOKE_CD);
    else if (b.id === 'dc' && dcCD > 0) ring(1 - dcCD / DC_CD);

    /* значок — в масштабе кнопки */
    const k = b.r / (BTN_BASE_R[b.id] || b.r);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.scale(k, k); ctx.translate(-b.x, -b.y);
    ctx.fillStyle = col;
    if (b.id === 'rocket') {
      ctx.save(); ctx.translate(b.x, b.y - 2); ctx.rotate(-Math.PI / 2);
      ctx.fillRect(-6, -1.6, 9, 3.2);
      ctx.beginPath(); ctx.moveTo(3, -1.6); ctx.lineTo(6.5, 0); ctx.lineTo(3, 1.6); ctx.closePath(); ctx.fill();
      ctx.restore();
      txt(label, b.x, b.y + 5, col, 8, 'center');
    } else if (b.id === 'boost') {
      ctx.beginPath();
      ctx.moveTo(b.x + 2, b.y - 8); ctx.lineTo(b.x - 4, b.y + 1);
      ctx.lineTo(b.x, b.y + 1); ctx.lineTo(b.x - 2, b.y + 8);
      ctx.lineTo(b.x + 5, b.y - 1); ctx.lineTo(b.x + 1, b.y - 1);
      ctx.closePath(); ctx.fill();
    } else if (b.id === 'smoke') {
      for (let q = 0; q < 3; q++) {
        ctx.beginPath();
        ctx.arc(b.x - 4 + q * 4, b.y + (q === 1 ? -3 : 1), 3.4 - q * 0.4, 0, TAU);
        ctx.fill();
      }
    } else if (b.id === 'dc') {
      ctx.fillRect(b.x - 3, b.y - 5, 6, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x - 3, b.y - 2, 6, 1.4); ctx.fillRect(b.x - 3, b.y + 2, 6, 1.4);
    } else if (b.id === 'shop') {
      txt('E', b.x, b.y - 4, col, 8, 'center');
    } else if (b.id === 'pause') {
      ctx.fillRect(b.x - 3.5, b.y - 4, 2.5, 8);
      ctx.fillRect(b.x + 1, b.y - 4, 2.5, 8);
    } else if (b.id === 'mute') {
      /* динамик; выключен — перечёркнут */
      ctx.fillRect(b.x - 5, b.y - 2, 3, 4);
      ctx.beginPath(); ctx.moveTo(b.x - 2, b.y - 2); ctx.lineTo(b.x + 2, b.y - 5);
      ctx.lineTo(b.x + 2, b.y + 5); ctx.lineTo(b.x - 2, b.y + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = D * 2;
      ctx.beginPath();
      if (muted) { ctx.moveTo(b.x + 4, b.y - 3); ctx.lineTo(b.x + 7, b.y + 3); ctx.moveTo(b.x + 7, b.y - 3); ctx.lineTo(b.x + 4, b.y + 3); }
      else ctx.arc(b.x + 2, b.y, 5, -0.8, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }
}
