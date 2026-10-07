'use strict';
/* ============================================================
   tutor.js — обучение на первой миссии.

   Не текстом, а показом: каждый шаг подсвечивает то место экрана,
   о котором говорит, и рисует, что нажать — клавиши WASD у катера,
   мышь с горящей кнопкой у прицела, «призрачный» палец на стике.
   Внизу — одна короткая строка-подсказка и точки прогресса.
   Шаг засчитывается действием (проплыл, выстрелил, потопил), а не
   временем; пройдено один раз — больше не мешает.
   ============================================================ */

const TUT_STEPS = 5;
let tut = null;          /* { step, t, sx, sy, fire, k0, done } */

const tutKills = () => kills.ships + kills.planes + kills.bases + kills.bunkers + kills.mines;

/* вызывается из startLevel: только первая миссия и только новичку */
function tutStart(idx) {
  tut = null;
  if (idx !== 0 || SETTINGS.tutDone || !player) return;
  tut = { step: 0, t: 0, sx: player.x, sy: player.y, fire: 0, k0: 0, done: 0 };
}

const tutActive = () => !!tut && state === 'play' && banner.t <= 0;

function tutNext() {
  tut.step++;
  tut.t = 0;
  SFX.pickup();
  if (tut.step === 2) tut.k0 = tutKills();
  if (tut.step >= TUT_STEPS) {
    SETTINGS.tutDone = true;
    saveSettings();
    tut.done = 3;
  }
}

function tutTick(dt) {
  if (!tut || state !== 'play' || banner.t > 0) return;
  tut.t += dt;
  if (tut.done > 0) { tut.done -= dt; if (tut.done <= 0) tut = null; return; }
  const P = player;
  switch (tut.step) {
    case 0:                                                                            /* ход */
      if (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown ||
          keys.ArrowLeft || keys.ArrowRight) tut.keyed = true;
      if (dist(P.x, P.y, tut.sx, tut.sy) > 70) tutNext();
      break;
    case 1: if (mouse.down) tut.fire += dt; if (tut.fire > 0.6) tutNext(); break;       /* огонь */
    case 2: if (tutKills() > tut.k0 || tut.t > 60) tutNext(); break;                   /* цель */
    case 3: if (dist(P.x, P.y, CARR.x, CARR.y) < 145 || tut.t > 40) tutNext(); break;  /* авианосец */
    case 4: if (smokeCD > 0 || P.boosting || tut.t > 12) tutNext(); break;             /* умения */
  }
}

/* ---------- рисование ---------- */
const tutPulse = () => 0.5 + 0.5 * Math.sin(tGlobal * 6);

/* клавиша: скруглённый колпачок с буквой */
function keycap(x, y, label, hot, w) {
  w = w || 12;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; rrect(ctx, x + 1, y + 1.5, w, 12, 2.5); ctx.fill();
  ctx.fillStyle = hot ? '#ffd94a' : '#e8eef1'; rrect(ctx, x, y, w, 12, 2.5); ctx.fill();
  ctx.fillStyle = hot ? '#c9a52a' : '#b9c4ca'; ctx.fillRect(x + 1, y + 9.5, w - 2, 2);
  ctx.font = '8px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#1a2228'; ctx.fillText(label, x + w / 2, y + 1.5);   /* без тени — на светлой клавише она двоит букву */
}
/* мышь с подсвеченной левой кнопкой */
function mouseIcon(x, y) {
  ctx.fillStyle = '#e8eef1'; rrect(ctx, x, y, 12, 17, 6); ctx.fill();
  ctx.strokeStyle = '#1a2228'; ctx.lineWidth = D * 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,217,74,' + (0.5 + 0.5 * tutPulse()).toFixed(2) + ')';
  ctx.beginPath(); ctx.moveTo(x + 6, y + 0.8); ctx.lineTo(x + 6, y + 7);
  ctx.lineTo(x + 0.8, y + 7); ctx.quadraticCurveTo(x + 0.8, y + 0.8, x + 6, y + 0.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, y + 7); ctx.moveTo(x, y + 7); ctx.lineTo(x + 12, y + 7); ctx.stroke();
}
/* пульсирующая рамка вокруг области экрана */
function tutFrame(r, col) {
  const k = tutPulse(), pad = 2 + k * 2;
  ctx.strokeStyle = col || '#ffd94a';
  ctx.globalAlpha = 0.55 + 0.45 * k;
  ctx.lineWidth = D * 3;
  rrect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 4); ctx.stroke();
  ctx.globalAlpha = 1;
}
/* кольцо вокруг точки экрана */
function tutRing(x, y, r, col) {
  const k = tutPulse();
  ctx.strokeStyle = col || '#ffd94a';
  ctx.globalAlpha = 0.5 + 0.5 * k; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(x, y, r + k * 3, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
}
/* стрелка-указатель, прыгающая к цели (сверху вниз по умолчанию) */
function tutArrow(x, y, dir) {
  const b = Math.sin(tGlobal * 7) * 2.5;
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir || 0); ctx.translate(0, -8 - b);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-5, -1); ctx.lineTo(-2, -1); ctx.lineTo(-2, -8);
  ctx.lineTo(2, -8); ctx.lineTo(2, -1); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a2228'; ctx.lineWidth = D * 2; ctx.stroke();
  ctx.restore();
}
/* строка-подсказка с точками прогресса */
function tutBubble(text, col) {
  const touch = touchMode();
  const w = Math.min(touch ? 250 : 300, txtW(text) + 26);
  const x = VW / 2 - w / 2, y = touch ? VH - 104 : VH - 58;
  ctx.fillStyle = 'rgba(4,16,26,0.86)'; rrect(ctx, x, y, w, 22, 5); ctx.fill();
  ctx.strokeStyle = col || '#ffb454'; ctx.lineWidth = D * 3; ctx.stroke();
  for (let i = 0; i < TUT_STEPS; i++) {
    ctx.fillStyle = i < tut.step ? '#4ade80' : i === tut.step ? '#ffd94a' : 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(VW / 2 - (TUT_STEPS - 1) * 3.5 + i * 7, y + 4.5, 1.8, 0, TAU); ctx.fill();
  }
  txt(text, VW / 2, y + 9.5, col === '#4ade80' ? '#4ade80' : '#f4f8fa', 8, 'center', w - 12);
}

function tutDraw() {
  if (!tutActive()) return;
  if (tut.done > 0) { tutBubble(T('tutDone'), '#4ade80'); return; }
  const touch = touchMode(), P = player;
  const key = k => T(touch && STR[k + 'T'] ? k + 'T' : k);
  const px = sX(P.x), py = sY(P.y);

  if (tut.step === 0) {
    if (touch) {
      /* призрачный палец водит стик по кругу */
      const cx = STICK_HINT_X, cy = STICK_HINT_Y, a = tGlobal * 2.2;
      ctx.strokeStyle = 'rgba(255,217,74,0.8)'; ctx.lineWidth = D * 3;
      ctx.beginPath(); ctx.arc(cx, cy, STICK_R, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,217,74,0.55)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * STICK_R * 0.6, cy + Math.sin(a) * STICK_R * 0.6, 9, 0, TAU); ctx.fill();
    } else {
      const kx = clamp(px - 20, 6, VW - 46), ky = clamp(py + 16, 50, VH - 80);
      keycap(kx + 13, ky, 'W', keys.KeyW || keys.ArrowUp);
      keycap(kx, ky + 14, 'A', keys.KeyA || keys.ArrowLeft);
      keycap(kx + 13, ky + 14, 'S', keys.KeyS || keys.ArrowDown);
      keycap(kx + 26, ky + 14, 'D', keys.KeyD || keys.ArrowRight);
    }
    /* клавиши молчат 4 секунды — скорее всего, фокус у страницы площадки */
    tutBubble(!touch && !tut.keyed && tut.t > 4 ? T('tutClick') : key('tut1'));
  } else if (tut.step === 1) {
    if (touch) {
      /* касание справа — расходящиеся круги */
      const x = VW * 0.72, y = VH * 0.45, k = (tGlobal * 1.4) % 1;
      ctx.strokeStyle = 'rgba(255,217,74,' + (1 - k).toFixed(2) + ')'; ctx.lineWidth = D * 3;
      ctx.beginPath(); ctx.arc(x, y, 4 + k * 16, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,217,74,0.6)'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
    } else {
      mouseIcon(clamp(mouse.x + 12, 4, VW - 18), clamp(mouse.y + 8, 4, VH - 22));
    }
    /* ближайший враг — в кольцо */
    let best = null, bd = 380;
    for (const e of enemies) { const d = dist(e.x, e.y, P.x, P.y); if (d < bd) { bd = d; best = e; } }
    if (best) tutRing(sX(best.x), sY(best.y), 14, '#ff6b5e');
    tutBubble(key('tut2'));
  } else if (tut.step === 2) {
    /* цель уровня — плашка вверху по центру */
    tutFrame(hudObjRect);
    tutArrow(hudObjRect.x + hudObjRect.w / 2, hudObjRect.y + hudObjRect.h + 16, Math.PI);
    const t = objTarget();
    if (t) {
      const x = sX(t.x), y = sY(t.y);
      if (x > 10 && x < VW - 10 && y > 10 && y < VH - 10) tutRing(x, y, 18, '#ff9166');
    }
    tutBubble(key('tut3'));
  } else if (tut.step === 3) {
    const x = sX(CARR.x), y = sY(CARR.y);
    if (x > 0 && x < VW && y > 0 && y < VH) { tutRing(x, y, 40, '#4ade80'); tutArrow(x, y - 52); }
    else edgeArrow(CARR.x, CARR.y, '#4ade80');
    tutBubble(key('tut4'));
  } else if (tut.step === 4) {
    if (touch && typeof tButtons === 'function') {
      for (const b of tButtons()) if (b.id === 'boost' || b.id === 'smoke') tutRing(b.x, b.y, b.r + 2);
    } else {
      tutFrame(hudAbilRect);
      tutFrame({ x: 22, y: 20, w: 108, h: 8 }, '#7fd4e0');
      keycap(161, 18, 'SHIFT', P.boosting, 26);
    }
    tutBubble(key('tut5'));
  }
}
