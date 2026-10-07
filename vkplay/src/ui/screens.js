'use strict';
/* ============================================================
   screens.js — заставка, пауза, итоги уровня и финалы
   ============================================================ */

/* имя уровня: тема по кругу плюс римская цифра круга */
function lvlName(n) {
  const c = levelCycle(n);
  return T(themeOf(n).key) + (c ? ' ' + (ROMAN[c] || '+' + c) : '');
}

let titleSetRect = { x: 12, y: VH - 24, w: 88, h: 17 };
let pauseSetRect = { x: VW / 2 - 44, y: 214, w: 88, h: 17 };
let reviveRect = { x: VW / 2 - 100, y: 198, w: 200, h: 18 };
let titleCrateRect = { x: VW - 108, y: VH - 24, w: 96, h: 17 };   /* правый угол: центр занят подсказкой */
let titleHqRect = { x: VW - 108, y: 10, w: 96, h: 17 };           /* штаб — верхний правый угол */

/* строчка «завтра дадут вот это» для экранов итогов */
function tomorrowLine() {
  const M = SETTINGS.meta;
  if (!M) return '';
  const s = M.claimed ? M.streak + 1 : M.streak;
  const tag = rewardTag(dayReward(s));
  return T('tomorrowTip', dayIdx(s) + 1, (tag[0] + ' ' + tag[1]).trim());
}

function titleText(s, x, y, size, col) {
  ctx.font = size + 'px monospace';
  ctx.textAlign = 'left';
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width;
  let xx = x - w / 2, i = 0;
  for (const ch of s) {
    const yy = y + Math.sin(tGlobal * 2.4 + i * 0.55) * 2.2;
    ctx.fillStyle = '#071c2c'; ctx.fillText(ch, xx + 2, yy + 2);
    ctx.fillStyle = col; ctx.fillText(ch, xx, yy);
    xx += ctx.measureText(ch).width;
    i++;
  }
  return w;
}

/* фон заставки без надписей — используется и экраном настроек */
function renderTitleBackdrop() {
  drawScene(1 / 60);
  for (const tp of titlePlanes) {
    ctx.save(); ctx.translate(tp.x, tp.y); ctx.rotate(Math.PI / 2);
    ctx.drawImage(sprPlane, -sprPlane.width / (2 * SC), -sprPlane.height / (2 * SC),
                  sprPlane.width / SC, sprPlane.height / SC);
    ctx.restore();
  }
}

/* renderTitle — см. ui/uikit.js */
function hitTitleSettings(x, y) {
  const r = titleSetRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function hitTitleCrate(x, y) {
  const r = titleCrateRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function hitTitleHq(x, y) {
  const r = titleHqRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function statLine(label, value, x, y, col) {
  txt(label, x, y, '#5d8299');
  txt(value, x + 244, y, col || '#cfe8f0', 8, 'right');
}

function renderLevelClear() {
  drawScene(0); drawHUD();
  ctx.fillStyle = 'rgba(2,8,14,0.74)';
  ctx.fillRect(0, 0, VW, VH);

  const pop = ease.out(Math.min(1, stT * 2.5));
  ctx.save();
  ctx.translate(VW / 2, 52);
  ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
  ctx.translate(-VW / 2, -52);
  titleText(T('lvlDone', level + 1), VW / 2, 44, 16, '#4ade80');
  ctx.restore();
  txt('«' + lvlName(level) + '»', VW / 2, 74, '#7fd4e0', 8, 'center', VW - 16);

  panel(VW / 2 - 134, 90, 268, 96);
  const x = VW / 2 - 124;
  statLine(T('stBases'),    kills.bases + '/' + totalBases,          x, 96, '#4ade80');
  statLine(T('stBunkers'),  String(kills.bunkers),                   x, 108);
  statLine(T('stShipsAir'), kills.ships + ' / ' + kills.planes,      x, 120);
  statLine(T('stHostages'), rescued + '/' + spawned,                 x, 132, '#ffb454');
  if (curCfg.mission === 'night')
    statLine(T('stStealth'), stealth.blown ? T('noWord') : T('yesWord'), x, 144,
             stealth.blown ? '#e5484d' : '#4ade80');
  else
    statLine(T('stStreak'), 'x' + comboBest, x, 144, '#ff9ad5');
  statLine(T('stTime'),     fmtT(playTime),                          x, 156);
  ctx.fillStyle = '#2c5a70'; ctx.fillRect(VW / 2 - 124, 168, 248, 1);
  statLine(T('stBonus'), '+' + ECON.levelBonus(level) + ' ' + T('crShort').toLowerCase(), x, 173, '#ffd94a');

  txt(T('creditsLeft', money), VW / 2, 194, '#ffb454', 8, 'center');
  uiNextButton(206, T('btnNext') + ' ' + (level + 2) + ' ▶');
  drawReturnHooks(232);                  /* звание, задания дня, паёк */
}

function renderEnd(win) {
  drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.76)';
  ctx.fillRect(0, 0, VW, VH);
  if (win) {
    titleText(T('winTitle1'), VW / 2, 40, 16, '#4ade80');
    titleText(T('winTitle2'), VW / 2, 62, 16, '#4ade80');
    txt(T('sectorSub', bossTitle()), VW / 2, 84, '#7fd4e0', 8, 'center', VW - 16);
  } else {
    titleText(T('loseTitle1'), VW / 2, 46, 16, '#e5484d');
    titleText(T('loseTitle2'), VW / 2, 68, 16, '#e5484d');
    if (SETTINGS.bestLevel)
      txt(T('bestRun', SETTINGS.bestLevel, SETTINGS.bestScore || 0), VW / 2, 87, '#ffb454', 8, 'center', VW - 16);
  }

  panel(VW / 2 - 134, 100, 268, 94);
  const x = VW / 2 - 124;
  statLine(T('stLevel'),    String(level + 1),                       x, 106, '#9fc3d0');
  statLine(T('stScore'),    String(score),                           x, 118, '#ffd94a');
  statLine(T('stBaseBunk'), kills.bases + ' / ' + kills.bunkers,     x, 130);
  statLine(T('stShipsAir'), kills.ships + ' / ' + kills.planes,      x, 142);
  statLine(T('stMines'),    String(kills.mines),                     x, 154);
  statLine(T('stHostages'), rescued + '/' + spawned,                 x, 166, '#ffb454');
  statLine(T('stTime'),     fmtT(playTime),                          x, 178);

  /* вторая жизнь за рекламный ролик */
  if (!win && canRevive()) {
    const r = reviveRect;
    const pulse = 0.55 + 0.45 * Math.sin(tGlobal * 4);
    ctx.fillStyle = 'rgba(8,30,20,0.92)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(74,222,128,' + pulse.toFixed(2) + ')'; ctx.lineWidth = D * 2;
    ctx.strokeRect(r.x + D, r.y + D, r.w - D * 2, r.h - D * 2);
    txt(ADS_ON ? (touchMode() ? T('reviveT') : T('revive')) : (touchMode() ? T('reviveFreeT') : T('reviveFree')), r.x + r.w / 2, r.y + 5.5, '#4ade80', 8, 'center', r.w - 14);
  }

  if (stT > 0.8 && Math.floor(tGlobal * 2) % 2) {
    const touch = touchMode();
    const y = (!win && canRevive()) ? 222 : 210;
    if (win) { /* кнопка ниже */ }
    else txt(touch ? T('againLoseT') : T('againLose'), VW / 2, y, '#f4f8fa', 8, 'center', VW - 16);
  }
  if (win) uiNextButton(202, T('btnNext') + ' ' + (level + 2) + ' ▶');
  drawReturnHooks(236);                  /* звание, задания дня, паёк */
}
function hitRevive(x, y) {
  const r = reviveRect;
  return !!(state === 'over' && canRevive() &&
            x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

/* renderPause — см. ui/uikit.js */
function hitPauseSettings(x, y) {
  const r = pauseSetRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/* подсказка повернуть телефон */
function renderRotateHint() {
  ctx.fillStyle = 'rgba(2,8,14,0.88)';
  ctx.fillRect(0, 0, VW, VH);
  const cx = VW / 2, cy = VH / 2 - 14;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(tGlobal * 1.6) * 0.5 - 0.4);
  ctx.strokeStyle = '#7fd4e0'; ctx.lineWidth = D * 3;
  ctx.strokeRect(-14, -24, 28, 48);
  ctx.fillStyle = '#7fd4e0'; ctx.fillRect(-5, 20, 10, 2);
  ctx.restore();
  txt(T('rotate'), cx, cy + 44, '#cfe8f0', 8, 'center');
}
