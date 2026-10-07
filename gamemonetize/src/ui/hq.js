'use strict';
/* ============================================================
   hq.js — ШТАБ: паёк за вход, календарь серии, задания дня,
   звание и место в таблице рекордов.

   Экран открывается сам при первом за сутки запуске: игрок сразу
   видит, что за возвращение ему что-то дали, и что завтра дадут
   больше. Дальше — по кнопке с заставки.
   ============================================================ */

let hqBackTo = 'title', hqBtns = [], hqFlash = 0;

function openHQ(from) {
  hqBackTo = from || 'title';
  hqFlash = 0;
  lbLoad();                       /* место в таблице подтянется асинхронно */
  setState('hq');
  SFX.ui();
}
function closeHQ() { setState(hqBackTo); SFX.ui(); }

/* «в бой» с экрана штаба — начинаем кампанию с нуля */
function hqFight() {
  if (hqBackTo === 'title') startCampaign();
  else setState(hqBackTo);
  SFX.ui();
}

function hqClaim(x2) {
  const M = SETTINGS.meta;
  if (!M || M.claimed) return;
  const go = () => {
    metaClaim(x2);
    hqFlash = 1;
    SFX.evac();
    flashScreen = 0.3;
    for (let i = 0; i < 34; i++)
      addP({ x: rr(60, VW - 60), y: rr(40, 110), vx: rr(-26, 26), vy: rr(-40, 6), g: 55,
             life: rr(0.7, 1.5), max: 1.5, size: rr(1, 2.2),
             col: pick(['#ffd94a', '#4ade80', '#7fd4e0']) });
  };
  if (x2) adRewarded(go); else go();
}

function hqTap(x, y) {
  for (const b of hqBtns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'claim') hqClaim(false);
      else if (b.id === 'claim2') hqClaim(true);
      else if (b.id === 'fight') hqFight();
      else if (b.id === 'back') closeHQ();
      return true;
    }
  }
  return false;
}

function hqBtn(id, label, x, y, w, col, on) {
  const b = { id: id, x: x, y: y, w: w, h: 18 };
  hqBtns.push(b);
  ctx.fillStyle = on ? 'rgba(8,28,42,0.95)' : 'rgba(8,18,26,0.8)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = on ? col : '#2c4450'; ctx.lineWidth = D * 2;
  ctx.strokeRect(b.x + D, b.y + D, b.w - D * 2, b.h - D * 2);
  txt(label, b.x + b.w / 2, b.y + 5.5, on ? col : '#4a5f6d', 8, 'center', b.w - 14);
}

/* одна клетка календаря */
function hqDayCell(x, y, w, h, n, done, today) {
  const r = DAY_REWARDS[n];
  const gold = !!r.gold;
  ctx.fillStyle = done ? 'rgba(10,34,26,0.9)' : today ? 'rgba(34,28,8,0.95)' : 'rgba(8,20,30,0.85)';
  ctx.fillRect(x, y, w, h);
  const pulse = today ? 0.55 + 0.45 * Math.sin(tGlobal * 4) : 1;
  ctx.strokeStyle = done ? '#2f6b4a'
                  : today ? 'rgba(255,217,74,' + pulse.toFixed(2) + ')'
                  : gold ? '#6b4f22' : '#25414f';
  ctx.lineWidth = D * 2;
  ctx.strokeRect(x + D, y + D, w - D * 2, h - D * 2);

  txt(T('hqDayN', n + 1), x + w / 2, y + 4, done ? '#4ade80' : today ? '#ffd94a' : '#5d8299', 8, 'center', w - 20);
  const tag = rewardTag(r);
  const col = gold ? '#ff9ad5' : done ? '#3f7f63' : today ? '#f4f8fa' : '#7fa4b5';
  if (tag[0]) txt(tag[0], x + w / 2, y + 16, col, 8, 'center', w - 6);
  if (tag[1]) txt(tag[1], x + w / 2, y + 27, col, 8, 'center', w - 6);
  if (done) txt('✓', x + w - 8, y + 4, '#4ade80', 8, 'center');
}

function renderHQ() {
  if (hqBackTo === 'title') renderTitleBackdrop(); else drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.84)';
  ctx.fillRect(0, 0, VW, VH);

  const M = SETTINGS.meta || META_DEF();
  hqBtns = [];
  hqFlash = Math.max(0, hqFlash - 0.02);

  txt(T('hqTitle'), VW / 2, 8, '#ffb454', 16, 'center');
  txt(T('hqStreak', M.streak, M.best) + '   ' + T('hqBonus', metaStreakPct()),
      VW / 2, 28, '#7fd4e0', 8, 'center', VW - 16);

  /* ---- календарь недели ---- */
  const cw = 58, gap = 4, x0 = (VW - (cw * 7 + gap * 6)) / 2, cy = 40, ch = 40;
  const cur = dayIdx(M.streak);
  for (let i = 0; i < 7; i++)
    hqDayCell(x0 + i * (cw + gap), cy, cw, ch, i, i < cur || (i === cur && M.claimed), i === cur && !M.claimed);

  /* ---- кнопки пайка ---- */
  if (!M.claimed) {
    hqBtn('claim', T('hqClaim'), 60, 86, 160, '#4ade80', true);
    hqBtn('claim2', T('hqClaim2'), 260, 86, 160, '#ffd94a', true);
  } else {
    const line = M.doubled ? T('hqClaimed2', metaTillText())
                           : T('hqClaimed', metaTillText());
    txt(line, VW / 2, 90, hqFlash > 0 ? '#ffd94a' : '#5d8299', 8, 'center', VW - 16);
    const nx = dayReward(M.streak + 1), tag = rewardTag(nx);
    txt(T('hqTomorrow', (tag[0] + ' ' + tag[1]).trim()), VW / 2, 100, '#7fa4b5', 8, 'center', VW - 16);
  }

  /* ---- задания дня ---- */
  panel(24, 110, 432, 76);
  txt(T('hqTasks'), 34, 114, '#ffb454');
  txt(dqDoneCount() + '/3', 446, 114, dqDoneCount() === 3 ? '#4ade80' : '#9fc3d0', 8, 'right');
  const list = dqToday(M.dqDay);
  for (let i = 0; i < 3; i++) {
    const q = list[i], y = 128 + i * 16, done = !!M.dqDone[i];
    const pr = Math.min(M.dqProg[i], q.goal);
    txt(T('dq_' + q.id) + ' ' + q.goal, 34, y, done ? '#4ade80' : '#cfe8f0', 8, 'left', 210);
    txt(pr + '/' + q.goal, 300, y, done ? '#4ade80' : '#9fc3d0', 8, 'right');
    bar(310, y + 2, 96, 4, pr / q.goal, done ? '#4ade80' : '#ffb454');
    txt((done ? '✓ ' : '+') + q.pay, 450, y, done ? '#4ade80' : '#ffd94a', 8, 'right');
  }
  txt(M.dqBonus ? T('hqAllOk', DQ_ALL_BONUS) : T('hqAll', DQ_ALL_BONUS),
      VW / 2, 172, M.dqBonus ? '#4ade80' : '#ff9ad5', 8, 'center', 412);

  /* ---- звание ---- */
  const rk = metaRank();
  panel(24, 190, 432, 37);
  txt(T('hqRank') + ': ' + T(rk.key), 34, 195, '#ffd94a', 8, 'left', 230);
  txt(rk.next ? T('hqNext', rk.need) : T('hqTop'), 446, 195, '#9fc3d0', 8, 'right', 170);
  bar(34, 206, 412, 4, rk.frac, '#ffb454');
  txt(T('hqStart', rk.cash), 34, 214, '#5d8299', 8, 'left', 230);
  txt(T('hqTotal', M.total), 446, 214, '#5d8299', 8, 'right', 170);

  /* ---- склад и место в таблице ---- */
  const sup = [];
  if (M.cr) sup.push(M.cr + ' ' + T('crShort'));
  if (M.ammo) sup.push(M.ammo + ' ' + T('rktShort'));
  if (sup.length) txt(T('hqSupply', sup.join(', ')), 24, 231, '#4ade80', 8, 'left', 230);
  if (LB.rank) txt(T('lbPlace', LB.rank), 456, 231, '#7fd4e0', 8, 'right', 190);
  else if (SETTINGS.bestScore) txt(T('lbBest', SETTINGS.bestScore), 456, 231, '#5d8299', 8, 'right', 190);

  /* ---- нижние кнопки ---- */
  hqBtn('back', touchMode() ? T('hqBack') : T('hqBackK'), 24, 244, 130, '#9fc3d0', true);
  hqBtn('fight', hqBackTo === 'title' ? T('hqFight') : T('hqResume'), VW - 154, 244, 130, '#4ade80', true);
}
