'use strict';
/* ============================================================
   crate.js — «ИРП удачи»: барабан с призами.

   Бесплатная прокрутка раз в три минуты, между ними — за рекламный
   ролик. Главный приз выпадает редко и даёт постоянную вещь, ту же,
   что продаётся за деньги: кто не хочет платить, докрутится.
   ============================================================ */

const CRATE_FREE_CD = 300;            /* бесплатная прокрутка раз в пять минут */
const CRATE_AD_CD = 180;              /* за ролик — раз в три минуты */
const CRATE_R = 66;
let crateAngle = 0, cratePhase = 'idle', crateIdx = 0;
let crateFrom = 0, crateTo = 0, crateSpinT = 0, crateSpinDur = 3.4;
let crateT = 0, crateAdT = 0, crateBackTo = 'title', crateBtns = [];

/* приз, короткая подпись на секторе, вес выпадения */
const CRATE_PRIZES = [
  { key: 'przNothing', arg: null, tag: () => T('tagNone'), w: 22, col: '#5d7484', give: () => {} },
  { key: 'przCredits', arg: 100,  tag: '100',   w: 20, col: '#8f8250', give: () => { money += 100; } },
  { key: 'przAmmo',    arg: 3,    tag: () => '3 ' + T('rktShort'), w: 18, col: '#7fd4e0', give: () => { upg.msl = 1; upg.ammo += 3; } },
  { key: 'przCredits', arg: 250,  tag: '250',   w: 14, col: '#ffd94a', give: () => { money += 250; } },
  { key: 'przNothing', arg: null, tag: () => T('tagNone'), w: 10, col: '#5d7484', give: () => {} },
  { key: 'przCredits', arg: 600,  tag: '600',   w: 8,  col: '#ffd94a', give: () => { money += 600; } },
  { key: 'przRepair',  arg: null, tag: () => T('tagFix'), w: 6,  col: '#4ade80',
    give: () => { if (player) { player.hp = player.maxhp; player.boostE = boostMax(); } } },
  /* без доната главный приз — 3000 кредитов (выдаёт ветка «всё собрано» ниже) */
  { key: PAYMENTS_ON ? 'przJack' : 'przCredits', arg: PAYMENTS_ON ? null : 3000, tag: '★',     w: 2,  col: '#ff9ad5', jack: true,
    give: () => {
      /* даём вещь, которой ещё нет; если всё собрано — кредиты */
      const left = perksLeft();
      if (left.length) grantPerk(pick(left).perk);
      else metaGive(3000, 0);            /* из меню — на склад, в бою — в кошелёк */
    } }
];


const crateLabel = p => (p.arg === null ? T(p.key) : T(p.key, p.arg));

function openCrate(from) {
  crateBackTo = from || 'title';
  cratePhase = 'idle';
  setState('crate');
  SFX.ui();
}
function closeCrate() { setState(crateBackTo); SFX.ui(); }

function crateRoll() {
  let tot = 0;
  for (const p of CRATE_PRIZES) tot += p.w;
  let r = Math.random() * tot;
  for (let i = 0; i < CRATE_PRIZES.length; i++) {
    r -= CRATE_PRIZES[i].w;
    if (r <= 0) return i;
  }
  return 0;
}

function crateStart(paid) {
  if (cratePhase === 'spin') return;
  if (paid ? crateAdT > 0 : crateT > 0) return;
  const go = () => {
    crateIdx = crateRoll();
    const sec = TAU / CRATE_PRIZES.length;
    /* доводим сектор до стрелки наверху и добавляем шесть полных оборотов */
    let to = -Math.PI / 2 - (crateIdx * sec + sec / 2);
    while (to < crateAngle + TAU * 6) to += TAU;
    crateFrom = crateAngle; crateTo = to;
    crateSpinT = 0; cratePhase = 'spin';
    SFX.boost();
  };
  if (paid) { crateAdT = CRATE_AD_CD; adRewarded(go); }
  else { crateT = CRATE_FREE_CD; go(); }
}

function updCrate(dt) {
  if (crateT > 0) crateT = Math.max(0, crateT - dt);
  if (crateAdT > 0) crateAdT = Math.max(0, crateAdT - dt);
  if (cratePhase !== 'spin') return;
  crateSpinT += dt;
  const k = ease.out3(Math.min(1, crateSpinT / crateSpinDur));
  crateAngle = lerp(crateFrom, crateTo, k);
  /* пощёлкивание барабана по секторам */
  if (Math.floor(crateAngle / (TAU / CRATE_PRIZES.length)) !==
      Math.floor((crateAngle - dt * (crateTo - crateFrom) / crateSpinDur) / (TAU / CRATE_PRIZES.length)))
    SFX.move();
  if (crateSpinT >= crateSpinDur) {
    cratePhase = 'won';
    const p = CRATE_PRIZES[crateIdx];
    p.give();
    if (p.jack) { SFX.evac(); flashScreen = 0.4; for (let i = 0; i < 40; i++)
      addP({ x: rr(0, VW), y: rr(0, VH), vx: rr(-30, 30), vy: rr(-40, 10), g: 60,
             life: rr(0.8, 1.6), max: 1.6, size: rr(1, 2.4), col: pick(['#ff9ad5', '#ffd94a', '#7fd4e0']) });
    } else SFX.buy();
  }
}

function crateTap(x, y) {
  for (const b of crateBtns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'free') crateStart(false);
      else if (b.id === 'ad') crateStart(true);
      else if (b.id === 'close') closeCrate();
      return true;
    }
  }
  return false;
}

function renderCrate() {
  if (crateBackTo === 'title') renderTitleBackdrop(); else drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.80)';
  ctx.fillRect(0, 0, VW, VH);

  const cx = VW / 2, cy = 128, n = CRATE_PRIZES.length, sec = TAU / n;

  txt(T('crateTitle'), cx, 14, '#ffb454', 16, 'center');

  /* барабан */
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(crateAngle);
  for (let i = 0; i < n; i++) {
    const p = CRATE_PRIZES[i], a0 = i * sec, a1 = a0 + sec;
    ctx.fillStyle = i % 2 ? 'rgba(10,26,40,0.95)' : 'rgba(16,38,56,0.95)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, CRATE_R, a0, a1); ctx.closePath(); ctx.fill();
    /* цветной ободок сектора */
    ctx.strokeStyle = p.col; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(0, 0, CRATE_R - 2, a0 + 0.02, a1 - 0.02); ctx.stroke();
    ctx.strokeStyle = 'rgba(74,134,163,0.5)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * CRATE_R, Math.sin(a0) * CRATE_R); ctx.stroke();
    /* подпись вдоль радиуса */
    ctx.save();
    ctx.rotate(a0 + sec / 2);
    ctx.font = (p.jack ? 13 : 8) + 'px monospace';
    ctx.textAlign = 'center';
    const tg = (typeof p.tag === 'function') ? p.tag() : p.tag;
    ctx.fillStyle = '#06131c'; ctx.fillText(tg, CRATE_R * 0.62 + 1, -3 + 1);
    ctx.fillStyle = p.col;     ctx.fillText(tg, CRATE_R * 0.62, -3);
    ctx.restore();
  }
  ctx.restore();

  /* ступица и стрелка */
  ctx.fillStyle = '#0a1a26';
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a86a3'; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, CRATE_R, 0, TAU); ctx.stroke();
  blitC(sprCrate, cx, cy);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - CRATE_R + 9);
  ctx.lineTo(cx - 6, cy - CRATE_R - 5);
  ctx.lineTo(cx + 6, cy - CRATE_R - 5);
  ctx.closePath(); ctx.fill();

  /* результат: главный приз выносим наверх, чтобы не лез на кнопки */
  if (cratePhase === 'won') {
    const p = CRATE_PRIZES[crateIdx];
    if (p.jack) txt(T('crateJack'), cx, 38, '#ff9ad5', 16, 'center');
    txt(T('crateWon', crateLabel(p)), cx, 200, p.col, 8, 'center');
  }

  /* кнопки */
  crateBtns = [];
  const mkBtn = (id, label, x, y, w, col, on) => {
    const b = { id, x, y, w, h: 18 };
    crateBtns.push(b);
    ctx.fillStyle = on ? 'rgba(8,28,42,0.95)' : 'rgba(8,18,26,0.8)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = on ? col : '#2c4450'; ctx.lineWidth = D * 2;
    ctx.strokeRect(b.x + D, b.y + D, b.w - D * 2, b.h - D * 2);
    txt(label, b.x + b.w / 2, b.y + 5.5, on ? col : '#4a5f6d', 8, 'center', b.w - 14);
  };
  const spinning = cratePhase === 'spin';
  const freeOn = crateT <= 0 && !spinning;
  const adOn = crateAdT <= 0 && !spinning;
  mkBtn('free', freeOn ? T('crateSpin') + ' — ' + T('adFree') : T('crateWaitN', fmtT(crateT)),
        cx - 172, 236, 164, '#4ade80', freeOn);
  mkBtn('ad', adOn ? T('crateAd') : T('crateAdWait', fmtT(crateAdT)),
        cx + 8, 236, 164, '#ffd94a', adOn);
  mkBtn('close', touchMode() ? T('crateCloseT') : T('crateClose'), cx - 60, 212, 120, '#9fc3d0', !spinning);
}
