'use strict';
/* ============================================================
   hud.js — интерфейс: панели, шкалы, радар, указатели, сообщения
   ============================================================ */

/* maxW — необязательная ширина: моноширинный шрифт на разных устройствах
   разный (Consolas узкий, у телефонов и Mac шире на 10-15%), и длинная
   строка в узком месте ужимается, а не вылезает за панель */
function txt(s, x, y, col, size, align, maxW) {
  size = size || 8; align = align || 'left';
  ctx.font = size + 'px monospace';
  ctx.textAlign = align;
  const fit = maxW > 0 && ctx.measureText(s).width > maxW;
  ctx.fillStyle = '#06131c';
  if (fit) ctx.fillText(s, x + 1, y + 1, maxW); else ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = col || '#cfe8f0';
  if (fit) ctx.fillText(s, x, y, maxW); else ctx.fillText(s, x, y);
}
/* VK Play: скрипт площадки mailru.core.js содержит MD5 с утечкой
   глобальной переменной (txt = '' без var) и затирает эту функцию —
   после этого игра падает на каждом кадре. Запрещаем перезапись: их
   код нестрогий, и присваивание там просто молча пропускается. */
try { Object.defineProperty(window, 'txt', { writable: false }); } catch (e) {}

/* ширина надписи в единицах разметки */
function txtW(s, size) {
  ctx.font = (size || 8) + 'px monospace';
  return ctx.measureText(s).width;
}

function panel(x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(4,18,30,0.84)';
  ctx.fillRect(x, y, w, h);
  const t = D * 2;                                  /* тонкая рамка: 2 физических пикселя */
  ctx.strokeStyle = accent || '#2c5a70';
  ctx.lineWidth = t;
  ctx.strokeRect(x + t / 2, y + t / 2, w - t, h - t);
  /* уголки */
  ctx.fillStyle = accent || '#4a86a3';
  ctx.fillRect(x, y, 3.5, t); ctx.fillRect(x, y, t, 3.5);
  ctx.fillRect(x + w - 3.5, y, 3.5, t); ctx.fillRect(x + w - t, y, t, 3.5);
  ctx.fillRect(x, y + h - t, 3.5, t); ctx.fillRect(x, y + h - 3.5, t, 3.5);
  ctx.fillRect(x + w - 3.5, y + h - t, 3.5, t); ctx.fillRect(x + w - t, y + h - 3.5, t, 3.5);
}

function segBar(x, y, frac, segs, colOverride) {
  frac = clamp(frac, 0, 1);
  const col = colOverride || (frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#ffb454' : '#e5484d');
  ctx.fillStyle = '#0a1620'; ctx.fillRect(x - 1, y - 1, segs * 5 + 2, 8);
  for (let i = 0; i < segs; i++) {
    const on = frac * segs > i;
    ctx.fillStyle = on ? col : '#182a36';
    ctx.fillRect(x + i * 5, y, 4, 6);
    if (on) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + i * 5, y, 4, 1); }
  }
  /* пульсация последнего сегмента при низком значении */
  if (frac < 0.25 && Math.floor(tGlobal * 6) % 2) {
    ctx.fillStyle = 'rgba(229,72,77,0.5)';
    ctx.fillRect(x - 1, y - 1, segs * 5 + 2, 8);
  }
}

function bar(x, y, w, h, frac, col, bg) {
  ctx.fillStyle = bg || '#0a1620'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

/* стрелка к цели за краем экрана */
/* Где встаёт стрелка к цели за краем. Стрелки ходят по внутренней
   рамке, а не по краю экрана: у края лежат панели HUD, радар и сенсорные
   кнопки, и стрелка ложилась прямо на них. */
function arrowPos(a) {
  const L = 16, R = VW - 16, Tp = 58, B = VH - 88;     /* ниже верхних панелей, выше нижних и блока серии */
  const cx = (L + R) / 2, cy = (Tp + B) / 2;
  const c = Math.cos(a), s = Math.sin(a);
  const t = Math.min((R - cx) / Math.max(0.001, Math.abs(c)), (B - cy) / Math.max(0.001, Math.abs(s)));
  let x = cx + c * t, y = cy + s * t;
  /* радар в правом верхнем углу */
  if (x > VW - 100 && y < 100) { if (x >= R - 0.5) y = 100; else x = VW - 100; }
  /* колонка сенсорных кнопок справа */
  if (touchMode() && x > VW - 192 && y > 96) { if (x >= R - 0.5) y = 96; else x = VW - 192; }
  return { x, y };
}

function edgeArrow(tx, ty, col) {
  const a = Math.atan2(ty - player.y, tx - player.x);
  const sxp = sX(tx), syp = sY(ty);
  if (sxp > 24 && sxp < VW - 24 && syp > 24 && syp < VH - 24) return;
  const p = arrowPos(a);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tGlobal * 5);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------- радар: круглый полупрозрачный скоп ---------- */
/* Рамки нет — только диск поверх сцены. Мир вписан в круг по диагонали,
   поэтому ни один угол карты не теряется. Отметки вспыхивают в момент
   прохода луча и гаснут за оборот. */
function drawRadar(P) {
  const cx = VW - 48, cy = 50, R = 40;
  const RA = 0.88;                          /* общая непрозрачность скопа */

  const k = (R * 2 - 3) / Math.hypot(WORLD.w, WORLD.h);
  const mx = cx - WORLD.w * k / 2, my = cy - WORLD.h * k / 2;
  const px = x => mx + x * k, py = y => my + y * k;

  const range = radarRange(), seeAll = radarHacked;
  const vis = (x, y) => seeAll || dist(x, y, P.x, P.y) < range;
  const sweep = tGlobal * 1.1;
  const ping = (x, y) => {
    let age = (sweep - Math.atan2(py(y) - cy, px(x) - cx)) % TAU;
    if (age < 0) age += TAU;
    return 0.40 + 0.60 * (1 - age / TAU);
  };

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  /* сквозь диск видно море */
  ctx.fillStyle = 'rgba(4,18,30,0.46)';
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  /* силуэты островов */
  ctx.fillStyle = 'rgba(52,120,92,0.68)';
  for (const isl of islands) {
    const n = isl.rad.length, step = Math.max(1, Math.round(n / 14));
    ctx.beginPath();
    for (let i = 0; i < n; i += step) {
      const a = i / n * TAU, r = isl.rad[i];
      const X = px(isl.x + Math.cos(a) * r), Y = py(isl.y + Math.sin(a) * r);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath(); ctx.fill();
    if (isl.r * k < 1.6) { ctx.beginPath(); ctx.arc(px(isl.x), py(isl.y), 1.1, 0, TAU); ctx.fill(); }
  }

  /* зона обнаружения и видимая область экрана */
  if (!seeAll) {
    ctx.strokeStyle = 'rgba(110,255,170,0.16)'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(px(P.x), py(P.y), range * k, 0, TAU); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(244,248,250,0.20)'; ctx.lineWidth = D * 2;
  ctx.strokeRect(px(ox), py(oy), (VW / cam.z) * k, (VH / cam.z) * k);

  const blip = (x, y, col, sz) => {
    ctx.globalAlpha = RA * ping(x, y);
    ctx.fillStyle = col;
    ctx.fillRect(px(x) - sz / 2, py(y) - sz / 2, sz, sz);
    ctx.globalAlpha = 1;
  };
  for (const s of structs) {
    if (s.type === 'crate' || !vis(s.x, s.y)) continue;
    const col = s.type === 'tower' ? (s.dead ? '#2a3a3a' : '#7fd4e0')
              : s.dead ? '#3a2020'
              : (s.type === 'base' ? '#ff5a5a' : '#c8484d');
    blip(s.x, s.y, col, s.type === 'base' ? 2.6 : 1.8);
  }
  for (const e of enemies) if (vis(e.x, e.y)) blip(e.x, e.y, '#ff5a5a', 1.8);
  for (const p of planes)  if (vis(p.x, p.y)) blip(p.x, p.y, '#ff9ad5', 1.8);
  for (const h of hostages) if (h.state === 'wait') blip(h.x, h.y, '#ffd94a', 1.8);
  for (const m of marines) if (m.state === 'wait') blip(m.x, m.y, '#6fae5a', 1.8);
  evRadar(blip);
  if (targetIsl) {
    ctx.globalAlpha = RA * (0.5 + 0.5 * Math.sin(tGlobal * 3));
    ctx.strokeStyle = '#ff9166'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(px(targetIsl.x), py(targetIsl.y), 4.5, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const s of subs) if (subExposed(s) || dist(s.x, s.y, P.x, P.y) < range * 0.55)
    blip(s.x, s.y, subExposed(s) ? '#ff9166' : '#5f7f8c', 1.8);
  if (transport && !transport.dead) {
    ctx.globalAlpha = RA;
    ctx.fillStyle = transport.done ? '#4ade80' : (Math.floor(tGlobal * 3) % 2 ? '#4ade80' : '#2f7a4a');
    ctx.fillRect(px(transport.x) - 2, py(transport.y) - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = RA * 0.85;
  for (const t of tornados) {
    ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(px(t.x), py(t.y), 2.6, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (boss && vis(boss.x, boss.y)) {
    ctx.globalAlpha = RA;
    ctx.fillStyle = Math.floor(tGlobal * 5) % 2 ? '#ff2a2a' : '#ffd94a';
    ctx.fillRect(px(boss.x) - 2, py(boss.y) - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  /* авианосец и свой катер горят постоянно */
  ctx.globalAlpha = RA;
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(px(CARR.x) - 2, py(CARR.y) - 0.5, 4, 1);
  ctx.fillRect(px(CARR.x) - 0.5, py(CARR.y) - 2, 1, 4);
  ctx.fillStyle = '#f4f8fa';
  ctx.fillRect(px(P.x) - 1, py(P.y) - 1, 2, 2);
  ctx.globalAlpha = 1;

  /* луч развёртки с затухающим хвостом */
  for (let i = 0; i < 12; i++) {
    const a0 = sweep - i * 0.06;
    ctx.fillStyle = 'rgba(110,255,170,' + (0.10 * (1 - i / 12)).toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0 - 0.061, a0); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(150,255,190,0.42)'; ctx.lineWidth = D * 2;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
  ctx.stroke();
  ctx.restore();

  /* сетка скопа */
  ctx.strokeStyle = 'rgba(110,255,170,0.13)'; ctx.lineWidth = D * 2;
  for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, TAU); ctx.stroke(); }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  /* обод и риски */
  ctx.strokeStyle = 'rgba(122,190,215,0.50)'; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(122,190,215,0.30)'; ctx.lineWidth = D * 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  if (seeAll && Math.floor(tGlobal * 2) % 2)
    txt(T('radarOpen'), cx, cy + R + 4, '#7fd4e0', 8, 'center');
}

/* ---------- основной HUD ---------- */
function drawHUD() {
  const P = player;

  /* три зоны на значках: «я», «что делать», «чем» (см. hudx.js) */
  const touchHud = touchMode();
  hudStatus(P);
  drawRadar(P);
  hudObjective(P);
  hudAbilities(P);

  /* серия: множитель растёт кеглем; на телефоне — строкой под «я» */
  if (combo >= 2) {
    const k = clamp(comboT / 4, 0, 1);
    ctx.globalAlpha = 0.5 + 0.5 * k;
    if (touchHud) {
      txt('x' + comboMul().toFixed(2) + ' • ' + T('streakN', combo), 8, 49, '#ff9ad5', 8, 'left', 150);
      ctx.globalAlpha = 1;
      hudBar(8, 58, 100, 2, k, '#ff9ad5');
    } else {
      const sz = 8 + Math.min(6, combo);
      txt('x' + comboMul().toFixed(2), VW - 50, VH - 40, '#ff9ad5', sz, 'center');
      txt(T('streakN', combo), VW - 50, VH - 22, '#ff9ad5', 8, 'center');
      ctx.globalAlpha = 1;
      hudBar(VW - 86, VH - 12, 72, 3, k, '#ff9ad5');
    }
    ctx.globalAlpha = 1;
  }

  /* событие боя и активные усиления */
  drawEvHud();

  /* подсказка магазина */
  const dc = dist(P.x, P.y, CARR.x, CARR.y);
  if (dc < 145 && !P.dead && touchMode() && Math.floor(tGlobal * 2) % 2)
    txt(touchMode() ? T('arsenalTap') : T('arsenalHint'),
        clamp(sX(CARR.x), 50, VW - 50), clamp(sY(CARR.y) - 62, 12, VH - 30), '#4ade80', 8, 'center');

  /* Сообщения и баннер — только в самом бою. Под затемнением паузы
     и итогов они просвечивали и ложились на заголовки экранов. */
  const live = state === 'play' || state === 'dying';

  /* сообщения */
  let yy = touchHud ? 66 : 54;              /* под плашками «я» и «цель» */
  if (boss || ev) yy = Math.max(yy, 54);
  if (live) for (const m of msgs) {
    if (m.age < m.delay) continue;
    const rem = m.delay + m.dur - m.age;
    if (rem <= 0) continue;
    const shown = Math.min(m.text.length, Math.floor((m.age - m.delay) * 40));
    /* пока висит баннер (74..116), стопка сообщений перепрыгивает под него */
    if (banner.t > 0 && yy + 10 > 73 && yy < 117) yy = 120;
    ctx.globalAlpha = Math.min(1, rem / 0.4);
    txt(m.text.slice(0, shown), VW / 2, yy, m.col, 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
    yy += 13;
  }

  /* баннер уровня */
  if (live && banner.t > 0) {
    const a = Math.min(1, banner.t / 0.6);
    const slide = (1 - Math.min(1, (3.6 - banner.t) * 4)) * 30;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,14,24,0.6)'; ctx.fillRect(0, 74, VW, 42);
    ctx.fillStyle = '#e5484d'; ctx.fillRect(0, 74, VW, 1); ctx.fillRect(0, 115, VW, 1);
    txt(banner.main, VW / 2 + slide, 80, '#ffb454', 16, 'center');
    txt(banner.sub, VW / 2 - slide, 104, '#f4f8fa', 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
  }

  tutDraw();                               /* обучение новичка */

  /* указатели целей */
  let nearest = null, nd = 1e9;
  for (const h of hostages) if (h.state === 'wait') {
    const d = dist(P.x, P.y, h.x, h.y);
    if (d < nd) { nd = d; nearest = h; }
  }
  if (curCfg.mission === 'convoy' && transport && !transport.dead && !transport.done)
    edgeArrow(transport.x, transport.y, '#4ade80');
  if (curCfg.mission === 'escort') {
    if (P.troops > 0 && targetIsl) edgeArrow(targetIsl.x, targetIsl.y, '#ff9166');
    else if (marines.length && allyIsl) edgeArrow(allyIsl.x, allyIsl.y, '#6fae5a');
    else if (targetIsl && !allTargetStructsDead()) edgeArrow(targetIsl.x, targetIsl.y, '#ff9166');
  }
  if (nearest) edgeArrow(nearest.x, nearest.y, '#ffd94a');
  if (P.aboard > 0) edgeArrow(CARR.x, CARR.y, '#4ade80');
  if (boss) edgeArrow(boss.x, boss.y, '#ff2a2a');
  if (!nearest && !boss && destroyedBases < totalBases) {
    let nb = null, nbd = 1e9;
    for (const s of structs) if (!s.dead && s.type === 'base') {
      const d = dist(P.x, P.y, s.x, s.y);
      if (d < nbd) { nbd = d; nb = s; }
    }
    if (nb && nbd > 260) edgeArrow(nb.x, nb.y, '#ff6b5e');
  }

  /* кнопки для мыши: пауза и арсенал */
  drawHudButtons();

  /* экранные кнопки и стик */
  drawTouchUI();

  /* прицел */
  if (!P.dead && (!touchMode() || tAim.id >= 0)) {
    const rdy = P.cool <= 0;
    ctx.strokeStyle = rdy ? '#ffd94a' : '#7a6a30';
    ctx.lineWidth = D * 2;
    const mx = mouse.x, my = mouse.y;
    const g = rdy ? 2 : 3.5;
    ctx.beginPath();
    ctx.moveTo(mx - 7, my); ctx.lineTo(mx - g, my);
    ctx.moveTo(mx + g, my); ctx.lineTo(mx + 7, my);
    ctx.moveTo(mx, my - 7); ctx.lineTo(mx, my - g);
    ctx.moveTo(mx, my + g); ctx.lineTo(mx, my + 7);
    ctx.stroke();
    if (rdy) { ctx.fillStyle = '#ffd94a'; ctx.fillRect(mx - D, my - D, D * 2, D * 2); }
    /* радиус ПВО */
    if (upg.pd > 0) {
      ctx.strokeStyle = 'rgba(127,212,224,0.13)';
      ctx.lineWidth = D * 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(sX(P.x), sY(P.y), pdRange() * cam.z, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* повреждения — рамка */
  if (P.fr > 0) {
    ctx.fillStyle = 'rgba(229,72,77,' + (P.fr * 0.8).toFixed(2) + ')';
    ctx.fillRect(0, 0, VW, 3); ctx.fillRect(0, VH - 3, VW, 3);
    ctx.fillRect(0, 0, 3, VH); ctx.fillRect(VW - 3, 0, 3, VH);
  }
  if (P.hp < P.maxhp * 0.3 && !P.dead) {
    const a = 0.12 + 0.1 * Math.sin(tGlobal * 6);
    ctx.fillStyle = 'rgba(229,72,77,' + a.toFixed(2) + ')';
    ctx.fillRect(0, 0, VW, 2); ctx.fillRect(0, VH - 2, VW, 2);
    if (Math.floor(tGlobal * 2) % 2) txt(T('critical'), VW / 2, VH - 74, '#e5484d', 8, 'center');
  }
}
