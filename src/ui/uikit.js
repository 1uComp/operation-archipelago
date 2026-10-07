'use strict';
/* ============================================================
   uikit.js — кнопки интерфейса и экраны, собранные из них.

   Кнопка рисуется в render и в тот же момент регистрирует свою
   область; клик или касание ищет её в списке прошлого кадра.
   Поэтому любой экран одинаково работает мышью, пальцем и
   клавишами (клавиши по-прежнему обрабатывает input.js).
   ============================================================ */

let uiBtns = [];

function uiFrame() { uiBtns = []; }

const uiIn = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/* o: { primary, col, size, badge, pulse, disabled, hint } */
function uiButton(x, y, w, h, label, act, o) {
  o = o || {};
  const hov = !touchMode() && !o.disabled && uiIn({ x, y, w, h }, mouse.x, mouse.y);
  const col = o.disabled ? '#3d5566' : (o.col || (o.primary ? '#4ade80' : '#7fd4e0'));
  const lift = hov ? 1 : 0;
  const yy = y - lift;
  /* тень под кнопкой — она «стоит» над фоном */
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 1.5, y + 1.5, w, h);
  ctx.fillStyle = o.primary ? (hov ? 'rgba(18,70,44,0.96)' : 'rgba(10,44,28,0.94)')
                            : (hov ? 'rgba(16,46,66,0.96)' : 'rgba(6,24,36,0.92)');
  ctx.fillRect(x, yy, w, h);
  /* светлая кромка сверху, тёмная снизу — объём */
  ctx.fillStyle = 'rgba(255,255,255,' + (hov ? 0.16 : 0.08) + ')';
  ctx.fillRect(x, yy, w, Math.max(D * 2, h * 0.08));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, yy + h - D * 3, w, D * 3);
  const pul = o.pulse ? 0.55 + 0.45 * Math.sin(tGlobal * 4) : 1;
  ctx.globalAlpha = pul;
  ctx.strokeStyle = col; ctx.lineWidth = D * (o.primary || hov ? 3 : 2);
  ctx.strokeRect(x + D, yy + D, w - D * 2, h - D * 2);
  ctx.globalAlpha = 1;
  const sz = o.size || 8;
  /* значок слева, подсказка клавиши справа — надпись встаёт между ними */
  const hint = o.hint && !touchMode() ? o.hint : '';
  const bw = o.badge ? Math.max(9, txtW(o.badge) + 6) : 0;
  const padL = bw ? bw + 7 : 6, padR = hint ? txtW(hint) + 10 : 6;
  const cy = yy + (h - 8) / 2 + 0.5;
  txt(label, x + padL + (w - padL - padR) / 2, yy + (h - sz) / 2 + 0.5,
      o.disabled ? '#4a5f6d' : (hov ? '#ffffff' : col), sz, 'center', w - padL - padR);
  if (hint) txt(hint, x + w - 6, cy, 'rgba(160,190,205,0.55)', 8, 'right');
  if (bw) {
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(x + 4, yy + (h - 10) / 2, bw, 10);
    txt(o.badge, x + 4 + bw / 2, cy, '#fff', 8, 'center');
  }
  if (!o.disabled) uiBtns.push({ x, y, w, h, act, st: state });
}

/* клик/касание: true — попали в кнопку */
function uiTap(x, y) {
  for (let i = uiBtns.length - 1; i >= 0; i--) {
    const b = uiBtns[i];
    if (b.st !== state || !uiIn(b, x, y)) continue;
    SFX.ui();
    if (b.act) b.act();
    return true;
  }
  return false;
}

/* старые области кликов заставки и паузы больше не нужны — кнопки свои */
titleSetRect = titleCrateRect = titleHqRect = pauseSetRect = { x: -99, y: -99, w: 0, h: 0 };

/* ---------- заставка ---------- */
function renderTitle() {
  renderTitleBackdrop();
  ctx.fillStyle = 'rgba(3,12,20,0.5)';
  ctx.fillRect(0, 0, VW, VH);
  const touch = touchMode();

  txt(T('hqRank') + ': ' + T(metaRank().key), 12, 10, '#7fa4b5', 8, 'left', 160);
  txt(T('operation'), VW / 2, 18, '#ffb454', 8, 'center');
  const w = titleText(T('gameTitle'), VW / 2, 34, 24, '#f4f8fa');
  ctx.fillStyle = '#e5484d'; ctx.fillRect(VW / 2 - w / 2, 64, w, 2);
  ctx.fillStyle = '#ffb454'; ctx.fillRect(VW / 2 - w / 2, 67, w, 1);
  txt(T('subtitle'), VW / 2, 74, '#7fd4e0', 8, 'center', VW - 20);

  /* главное действие — одна крупная кнопка */
  const cont = runPending();
  const n = cont ? (SETTINGS.run.lvl | 0) + 1 : 0;
  uiButton(VW / 2 - 116, 92, 232, 30, cont ? '▶ ' + T('btnContinue', n) : '▶ ' + T('btnPlay'),
           () => { if (touchMode()) goFullscreen(); startCampaign(); },
           { primary: true, size: cont ? 8 : 16, pulse: false, hint: touch ? '' : 'SPACE' });

  /* второй ряд: штаб, барабан, настройки */
  const bw = 112, gap = 8, bx = VW / 2 - (bw * 3 + gap * 2) / 2, by = 132;
  uiButton(bx, by, bw, 20, T('hqBtn'), () => openHQ('title'),
           { col: META.ready ? '#ffd94a' : '#7fd4e0', pulse: META.ready, badge: META.ready ? '!' : '', hint: touch ? '' : 'H' });
  uiButton(bx + bw + gap, by, bw, 20, T('crateTitle'), () => openCrate('title'),
           { col: '#ff9ad5', badge: crateT <= 0 ? T('adFree') : '' });
  uiButton(bx + (bw + gap) * 2, by, bw, 20, T('settingsBtn'), () => openSettings('title'),
           { hint: touch ? '' : 'O' });

  /* как играть — три строки вместо простыни приказов */
  panel(VW / 2 - 176, 164, 352, 50);
  txt(T('howTitle'), VW / 2 - 168, 169, '#ffb454', 8, 'left', 200);
  txt('◆ ' + T('ord1').replace(/^>\s*/, ''), VW / 2 - 168, 180, '#cfe8f0', 8, 'left', 336);
  txt('✚ ' + T('ord3', T('carrier')).replace(/^>\s*/, ''), VW / 2 - 168, 191, '#cfe8f0', 8, 'left', 336);
  txt('▲ ' + (touch ? T('mArsenalT') : T('mArsenal')), VW / 2 - 168, 202, '#4ade80', 8, 'left', 336);

  if (SETTINGS.bestLevel)
    txt(T('bestRun', SETTINGS.bestLevel, SETTINGS.bestScore || 0), VW / 2, 222, '#ffb454', 8, 'center', VW - 16);
  txt(touch ? T('touchLine1') : T('keysLine1'), VW / 2, 238, '#5d8299', 8, 'center', VW - 16);
  txt(touch ? T('touchLine2') : T('keysLine2'), VW / 2, 249, '#5d8299', 8, 'center', VW - 16);
}

/* ---------- пауза ---------- */
function quitToTitle() {
  msgs.length = 0;
  setState('title');
}
function renderPause() {
  ctx.fillStyle = 'rgba(2,8,14,0.7)';
  ctx.fillRect(0, 0, VW, VH);
  titleText(T('pause'), VW / 2, 44, 16, '#7fd4e0');
  const touch = touchMode();
  const bx = VW / 2 - 95, bw = 190, bh = 20;
  uiButton(bx, 76, bw, bh + 4, '▶ ' + T('btnResume'), () => setState('play'),
           { primary: true, hint: touch ? '' : 'P' });
  uiButton(bx, 108, bw, bh, T('settingsBtn'), () => openSettings('pause'), { hint: touch ? '' : 'O' });
  uiButton(bx, 134, bw, bh, muted ? T('mSoundOff') : T('mSoundOn'), () => {
    toggleMute(); SETTINGS.sound = !muted; saveSettings();
  }, { col: muted ? '#8fa3ad' : '#7fd4e0', hint: touch ? '' : 'M' });
  uiButton(bx, 160, bw, bh, T('btnMenu'), quitToTitle, { col: '#ffb454' });

  txt(T('stLevel') + ' ' + (level + 1) + ' «' + lvlName(level) + '» • ' + T(missionKey(curCfg.mission)),
      VW / 2, 192, '#ffb454', 8, 'center', VW - 20);
  const keysL = touch ? T('touchLine1') : T('keysLine1');
  const keysL2 = touch ? T('touchLine2') : T('keysLine2');
  txt(keysL, VW / 2, 212, '#5d8299', 8, 'center', VW - 16);
  txt(keysL2, VW / 2, 223, '#5d8299', 8, 'center', VW - 16);
}

/* ---------- итоги уровня и финал круга ---------- */
function uiNextButton(y, label) {
  const ready = stT > 0.6;
  uiButton(VW / 2 - 110, y, 220, 22, label, () => adThenLevel(level + 1),
           { primary: true, disabled: !ready, pulse: ready, hint: touchMode() ? '' : 'SPACE' });
}

/* ---------- HUD ---------- */
/* куда плыть сейчас: ближайшая цель задачи уровня */
function objTarget() {
  const P = player;
  if (!P) return null;
  if (boss && !boss.dead) return boss;
  if (P.aboard > 0) return CARR;
  const m = curCfg.mission;
  let best = null, bd = 1e9;
  const see = o => { const d = dist(P.x, P.y, o.x, o.y); if (d < bd) { bd = d; best = o; } };
  if (m === 'night') { for (const h of hostages) if (h.state === 'wait') see(h); }
  else if (m === 'escort') {
    if (P.troops > 0 || !marines.length) { if (targetIsl && !allTargetStructsDead()) see(targetIsl); }
    else if (allyIsl) see(allyIsl);
  } else if (m === 'convoy') { if (transport && !transport.dead && !transport.done) see(transport); }
  else for (const s of structs) if (!s.dead && s.type === 'base') see(s);
  return best;
}
/* расстояние до цели — в «метрах» (1 единица мира = 2 м) */
function drawObjDist(x, y) {
  const t = objTarget();
  if (!t || !player) return;
  const d = dist(player.x, player.y, t.x, t.y);
  if (d < 60) return;
  const m = Math.round(d * 2 / 10) * 10;
  txt('▸ ' + T('hudDist', m), x, y, t === CARR ? '#4ade80' : '#ff9166', 8, 'right');
}

/* кнопки HUD для мыши: пауза и арсенал у авианосца */
function drawHudButtons() {
  if (touchMode() || !player || player.dead || state !== 'play') return;
  uiButton(VW - 32, 94, 26, 16, 'II', () => setState('pause'), { hint: '' });
  const dc = dist(player.x, player.y, CARR.x, CARR.y);
  if (dc < 145) {
    const lab = T('arsenalHint'), w = txtW(lab) + 18;
    const x = clamp(sX(CARR.x) - w / 2, 8, VW - w - 8), y = clamp(sY(CARR.y) - 70, 30, VH - 90);
    uiButton(x, y, w, 16, lab, () => { setState('shop'); shopSel = 0; shopMsgT = 0; },
             { primary: true, pulse: true });
  }
}

/* ---------- поводы вернуться: на экранах итогов ---------- */
/* звание с полосой до следующего, задания дня, паёк сегодня и завтра */
function drawReturnHooks(y) {
  const rk = metaRank(), x0 = VW / 2 - 150;
  ICON.star(x0, y, 8, '#ffd94a');
  txt(T(rk.key), x0 + 11, y, '#ffd94a', 8, 'left', 92);
  hudBar(x0 + 106, y + 2, 64, 4, rk.frac, '#ffd94a');
  txt(Math.round(rk.frac * 100) + '%', x0 + 174, y, '#7fa4b5', 8, 'left');
  const dq = dqDoneCount();
  txt(T('hqTasks') + ' ' + dq + '/3', VW / 2 + 150, y, dq === 3 ? '#4ade80' : '#7fa4b5', 8, 'right', 104);
  let yy = y + 12;
  if (typeof rationNote !== 'undefined' && rationNote && rationLvl === level) {
    txt('✓ ' + rationNote, VW / 2, yy, '#4ade80', 8, 'center', VW - 16);
    yy += 12;
  }
  txt('► ' + tomorrowLine(), VW / 2, yy, '#ffd94a', 8, 'center', VW - 16);
}
