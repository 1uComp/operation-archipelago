'use strict';
/* ============================================================
   hudx.js — HUD на значках вместо слов.

   Три зоны, и в каждой одна мысль:
   • слева вверху — «я»: щит-прочность, молния-форсаж, кредиты и очки;
   • сверху по центру — «что делать»: значок цели, прогресс,
     расстояние до цели и сирена тревоги;
   • слева внизу — «чем»: ячейки умений с откатом и клавишей,
     места в шлюпке.
   Значки нарисованы векторно: читаются на любом экране и языке.
   ============================================================ */

/* ---------- значки (x, y — левый верхний угол, s — размер) ---------- */
const ICON = {
  shield(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y); ctx.lineTo(x + s, y + s * 0.2); ctx.lineTo(x + s * 0.92, y + s * 0.62);
    ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.9, x + s / 2, y + s);
    ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.9, x + s * 0.08, y + s * 0.62);
    ctx.lineTo(x, y + s * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + s * 0.3, y + s * 0.22, s * 0.14, s * 0.5);
  },
  bolt(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.62, y); ctx.lineTo(x + s * 0.15, y + s * 0.58); ctx.lineTo(x + s * 0.48, y + s * 0.58);
    ctx.lineTo(x + s * 0.36, y + s); ctx.lineTo(x + s * 0.85, y + s * 0.4); ctx.lineTo(x + s * 0.52, y + s * 0.4);
    ctx.closePath(); ctx.fill();
  },
  coin(x, y, s) {
    const r = s / 2;
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x + r, y + r, r * 0.78, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b8860b'; ctx.fillRect(x + r - s * 0.08, y + s * 0.25, s * 0.16, s * 0.5);
  },
  star(x, y, s, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.22 : s * 0.5;
      const px = x + s / 2 + Math.cos(a) * r, py = y + s / 2 + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  },
  base(x, y, s, col) {           /* укрепление с флажком */
    ctx.fillStyle = col;
    ctx.fillRect(x + s * 0.1, y + s * 0.5, s * 0.8, s * 0.5);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + s * (0.1 + i * 0.3), y + s * 0.38, s * 0.2, s * 0.14);
    ctx.fillRect(x + s * 0.48, y, s * 0.08, s * 0.5);
    ctx.beginPath(); ctx.moveTo(x + s * 0.56, y); ctx.lineTo(x + s * 0.9, y + s * 0.12); ctx.lineTo(x + s * 0.56, y + s * 0.24); ctx.fill();
  },
  person(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.22, s * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y + s); ctx.quadraticCurveTo(x + s * 0.15, y + s * 0.46, x + s / 2, y + s * 0.46);
    ctx.quadraticCurveTo(x + s * 0.85, y + s * 0.46, x + s * 0.85, y + s); ctx.closePath(); ctx.fill();
  },
  eye(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y + s / 2);
    ctx.quadraticCurveTo(x + s / 2, y - s * 0.05, x + s, y + s / 2);
    ctx.quadraticCurveTo(x + s / 2, y + s * 1.05, x, y + s / 2); ctx.fill();
    ctx.fillStyle = '#06131c'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.2, 0, TAU); ctx.fill();
  },
  ship(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.55); ctx.lineTo(x + s, y + s * 0.55);
    ctx.lineTo(x + s * 0.82, y + s * 0.88); ctx.lineTo(x + s * 0.12, y + s * 0.88); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + s * 0.32, y + s * 0.25, s * 0.34, s * 0.3);
    ctx.fillRect(x + s * 0.46, y + s * 0.05, s * 0.08, s * 0.2);
  },
  skull(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.42, s * 0.4, 0, TAU); ctx.fill();
    ctx.fillRect(x + s * 0.28, y + s * 0.62, s * 0.44, s * 0.32);
    ctx.fillStyle = '#06131c';
    ctx.beginPath(); ctx.arc(x + s * 0.34, y + s * 0.42, s * 0.1, 0, TAU); ctx.arc(x + s * 0.66, y + s * 0.42, s * 0.1, 0, TAU); ctx.fill();
  },
  siren(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * 0.8); ctx.lineTo(x + s * 0.18, y + s * 0.45);
    ctx.quadraticCurveTo(x + s / 2, y + s * 0.02, x + s * 0.82, y + s * 0.45); ctx.lineTo(x + s * 0.82, y + s * 0.8); ctx.fill();
    ctx.fillRect(x + s * 0.05, y + s * 0.82, s * 0.9, s * 0.16);
  },
  cloud(x, y, s, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.arc(x + s * 0.3, y + s * 0.6, s * 0.24, 0, TAU); ctx.arc(x + s * 0.55, y + s * 0.45, s * 0.3, 0, TAU);
    ctx.arc(x + s * 0.76, y + s * 0.64, s * 0.22, 0, TAU); ctx.fill();
    ctx.fillRect(x + s * 0.3, y + s * 0.62, s * 0.46, s * 0.22);
  },
  barrel(x, y, s, col) {
    ctx.fillStyle = col;
    rrect(ctx, x + s * 0.2, y + s * 0.08, s * 0.6, s * 0.84, s * 0.12); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + s * 0.2, y + s * 0.3, s * 0.6, s * 0.08); ctx.fillRect(x + s * 0.2, y + s * 0.62, s * 0.6, s * 0.08);
  },
  rocket(x, y, s, col) {
    ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.18, -s * 0.2, s * 0.14, s * 0.3);
    ctx.lineTo(-s * 0.14, s * 0.3); ctx.quadraticCurveTo(-s * 0.18, -s * 0.2, 0, -s * 0.5); ctx.fill();
    ctx.fillRect(-s * 0.28, s * 0.18, s * 0.56, s * 0.14);
    ctx.fillStyle = '#ff8b3d'; ctx.fillRect(-s * 0.08, s * 0.3, s * 0.16, s * 0.18);
    ctx.restore();
  },
  anchor(x, y, s, col) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(D * 2, s * 0.12);
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.14, s * 0.12, 0, TAU);
    ctx.moveTo(x + s / 2, y + s * 0.26); ctx.lineTo(x + s / 2, y + s * 0.92);
    ctx.moveTo(x + s * 0.28, y + s * 0.42); ctx.lineTo(x + s * 0.72, y + s * 0.42);
    ctx.moveTo(x + s * 0.12, y + s * 0.62); ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.95, x + s / 2, y + s * 0.92);
    ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.95, x + s * 0.88, y + s * 0.62);
    ctx.stroke();
  }
};

/* плашка с мягкими краями под значками */
function hudPlate(x, y, w, h, col) {
  ctx.fillStyle = 'rgba(4,16,26,0.62)';
  rrect(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = col || 'rgba(120,190,215,0.28)'; ctx.lineWidth = D * 2;
  ctx.stroke();
}
/* полоса с закруглением и бликом */
function hudBar(x, y, w, h, frac, col, bg) {
  frac = clamp(frac, 0, 1);
  ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
  rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = col;
    rrect(ctx, x, y, Math.max(h, w * frac), h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + h / 2, y + h * 0.15, Math.max(0, w * frac - h), Math.max(D, h * 0.22));
  }
}
const hullCol = f => f > 0.6 ? '#4ade80' : f > 0.3 ? '#ffd94a' : '#e5484d';

/* ---------- «я»: прочность, форсаж, кредиты, очки ---------- */
function hudStatus(P) {
  hudPlate(5, 5, 152, 40);
  const f = P.hp / P.maxhp;
  const low = f < 0.3 && Math.floor(tGlobal * 5) % 2;
  const rep = dist(P.x, P.y, CARR.x, CARR.y) < 115 && P.hp < P.maxhp;
  ICON.shield(10, 8, 10, low ? '#ff6b5e' : hullCol(f));
  if (rep && Math.floor(tGlobal * 3) % 2) {        /* ремонт у авианосца */
    ctx.fillStyle = '#ffffff'; ctx.fillRect(13.8, 10.6, 2.4, 5.6); ctx.fillRect(12.2, 12.2, 5.6, 2.4);
  }
  hudBar(24, 9, 104, 8, f, hullCol(f));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 1; k < 4; k++) ctx.fillRect(24 + 104 * k / 4, 9, D * 2, 8);
  txt(String(Math.ceil(P.hp)), 153, 9, low ? '#ff6b5e' : '#f4f8fa', 8, 'right');

  const lock = P.boostLock > 0;
  ICON.bolt(11, 20, 8, lock ? '#ff8b3d' : (typeof buffOn === 'function' && buffOn('nitro')) ? '#4ade80' : '#7fd4e0');
  hudBar(24, 22, 104, 4, P.boostE / boostMax(), lock ? '#b86a3a' : '#7fd4e0');
  if (upg.pd > 0) {                                    /* ПВО: маленький радар-кружок */
    ctx.strokeStyle = Math.floor(tGlobal * 3) % 2 ? '#7fd4e0' : '#3d6b78'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(145, 24, 3, 0, TAU); ctx.stroke();
  }

  ICON.coin(10, 31, 8);
  txt(String(money), 22, 31, '#ffd94a', 8, 'left', 58);
  ICON.star(82, 31, 8, '#cfe8f0');
  txt(String(score), 94, 31, '#cfe8f0', 8, 'left', 60);
}

/* ---------- «что делать»: цель уровня ---------- */
function hudObjective(P) {
  const m = curCfg.mission;
  const parts = [];               /* [ширина, отрисовщик(x)] */
  const Y = 6, H = 18, cy = Y + 5;
  const add = (w, fn) => parts.push([w, fn]);

  if (m === 'night') {
    add(10, x => ICON.person(x, cy - 1, 9, '#ffd94a'));
    const s = rescued + '/' + spawned;
    add(txtW(s) + 4, x => txt(s, x, cy, '#ffd94a'));
    add(10, x => ICON.eye(x, cy, 9, stealth.blown ? '#e5484d' : stealth.lit ? '#ffb454' : '#7fd4e0'));
    add(44, x => hudBar(x, cy + 2, 40, 4, stealth.blown ? 1 : stealth.meter,
                        stealth.blown ? '#e5484d' : stealth.meter > 0.55 ? '#ffb454' : '#4ade80'));
  } else if (m === 'escort') {
    const tl = targetLeft();
    add(10, x => ICON.person(x, cy - 1, 9, '#6fae5a'));
    const sq = landed + '/' + (landed + P.troops + marines.length);
    add(txtW(sq) + 6, x => txt(sq, x, cy, '#6fae5a'));
    add(10, x => ICON.base(x, cy - 1, 9, '#ff9166'));
    const ts = tl[0] + '/' + tl[1];
    add(txtW(ts) + 4, x => txt(ts, x, cy, '#ff9166'));
  } else if (m === 'convoy' && transport) {
    add(11, x => ICON.ship(x, cy - 1, 10, transport.dead ? '#e5484d' : '#4ade80'));
    add(56, x => {
      hudBar(x, cy, 52, 4, convoyProgress(), '#4ade80');
      hudBar(x, cy + 6, 52, 2, transport.hp / transport.max, transport.hp / transport.max > 0.4 ? '#9fe8ff' : '#e5484d');
    });
    const pc = Math.round(convoyProgress() * 100) + '%';
    add(txtW(pc) + 4, x => txt(pc, x, cy, '#4ade80'));
  } else {
    add(10, x => ICON.base(x, cy - 1, 9, '#ff9166'));
    /* по флажку на базу: закрашенные — уничтожены */
    const n = totalBases;
    add(n * 8 + 2, x => {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < destroyedBases ? '#4ade80' : 'rgba(255,145,102,0.35)';
        rrect(ctx, x + i * 8, cy, 6, 6, 1.5); ctx.fill();
      }
    });
  }
  let rsIdx = -1;
  if (spawned && m !== 'night') {
    rsIdx = parts.length;
    const rs = rescued + '/' + spawned;
    add(9, x => ICON.person(x, cy - 1, 8, '#ffd94a'));
    add(txtW(rs) + 4, x => txt(rs, x, cy, '#ffd94a'));
  }
  /* куда плыть */
  const tg = objTarget();
  if (tg && dist(P.x, P.y, tg.x, tg.y) > 60) {
    const ds = T('hudDist', Math.round(dist(P.x, P.y, tg.x, tg.y) * 2 / 10) * 10);
    const col = tg === CARR ? '#4ade80' : '#ffffff';
    add(txtW(ds) + 12, x => {
      const a = Math.atan2(tg.y - P.y, tg.x - P.x);
      ctx.save(); ctx.translate(x + 4, cy + 3.5); ctx.rotate(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-1.5, 0); ctx.lineTo(-3, 3); ctx.fill();
      ctx.restore();
      txt(ds, x + 10, cy, col);
    });
  }
  /* тревога: сирена и три деления */
  const alertCol = ['#4ade80', '#ffd94a', '#ffb454', '#e5484d'][alert] || '#e5484d';
  add(30, x => {
    const blink = alert >= 3 && Math.floor(tGlobal * 4) % 2;
    ICON.siren(x, cy - 1, 9, blink ? '#ffffff' : alertCol);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < alert ? alertCol : 'rgba(255,255,255,0.14)';
      rrect(ctx, x + 12 + i * 6, cy + 1, 4, 6, 1); ctx.fill();
    }
  });

  /* плашка живёт между блоком «я» (до x=160) и радаром (от x=388);
     если не влезает — сначала уходит счётчик заложников */
  const gap = 5, L0 = 162, R0 = VW - 94;
  const width = () => parts.reduce((a, p) => a + p[0], 0) + gap * (parts.length - 1) + 14;
  if (width() > R0 - L0 && rsIdx >= 0) parts.splice(rsIdx, 2);
  const W = width();
  const X = clamp(VW / 2 - W / 2, L0, Math.max(L0, R0 - W));
  hudPlate(X, Y, W, H, alert >= 2 ? 'rgba(229,72,77,0.55)' : 'rgba(255,180,84,0.45)');
  let x = X + 7;
  for (const [w, fn] of parts) { fn(x); x += w + gap; }
  hudObjRect = { x: X, y: Y, w: W, h: H };          /* для подсветки обучением */

  /* флагман: полоса жизни прямо под целью */
  if (boss) {
    const bw = 190, bx = VW / 2 - bw / 2;
    hudPlate(bx, 28, bw, 17, 'rgba(229,72,77,0.7)');
    ICON.skull(bx + 5, 31, 10, '#ff9166');
    txt(bossTitle(), bx + 18, 30, '#ff9166', 8, 'left', bw - 24);
    hudBar(bx + 18, 39, bw - 24, 3, boss.hp / boss.max, boss.hp / boss.max > 0.3 ? '#e5484d' : '#ffb454');
  }
}
let hudObjRect = { x: 0, y: 0, w: 0, h: 0 };

/* ---------- «чем»: умения и шлюпка ---------- */
let hudAbilRect = { x: 0, y: 0, w: 0, h: 0 };
function hudSlot(x, y, icon, col, cdFrac, key, count) {
  const S = 22;
  hudPlate(x, y, S, S, cdFrac > 0 ? 'rgba(120,190,215,0.2)' : col);
  icon(x + 5, y + 4, 12, cdFrac > 0 ? '#4d6b7a' : col);
  if (cdFrac > 0) {               /* откат — тёмный сектор, уходящий по часовой */
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.moveTo(x + S / 2, y + S / 2);
    ctx.arc(x + S / 2, y + S / 2, S * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * cdFrac);
    ctx.closePath(); ctx.save(); rrect(ctx, x, y, S, S, 3); ctx.clip(); ctx.fill(); ctx.restore();
  }
  if (key && !touchMode()) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; rrect(ctx, x + S - 9, y + S - 8, 10, 9, 2); ctx.fill();
    txt(key, x + S - 4, y + S - 7.5, '#cfe8f0', 8, 'center');
  }
  if (count !== undefined) txt(String(count), x + 2, y + S - 8.5, count > 0 ? '#ffffff' : '#e5484d', 8, 'left');
}
function hudAbilities(P) {
  const touch = touchMode();
  let x = 8;
  const y = VH - 30;
  if (!touch) {
    hudSlot(x, y, ICON.cloud, '#9fe8ff', smokeCD / SMOKE_CD, 'F'); x += 26;
    if (upg.dc) { hudSlot(x, y, ICON.barrel, '#ffb454', dcCD / DC_CD, 'Q'); x += 26; }
    if (upg.msl) { hudSlot(x, y, ICON.rocket, '#7fd4e0', mCool > 0 ? mCool / 0.5 : 0, '', upg.ammo); x += 26; }
    hudAbilRect = { x: 6, y: y - 2, w: x - 6, h: 26 };
  }                                   /* на телефоне ракеты считает своя кнопка */
  /* шлюпка: места — человечки; заняты заложниками или десантом */
  const cap = capacity();
  if (P.aboard || P.troops || touch) {
    const yy = touch ? VH - 20 : y - 14;
    for (let i = 0; i < cap; i++) {
      const col = i < P.aboard ? '#ff8b3d' : i < P.aboard + P.troops ? '#6fae5a' : 'rgba(255,255,255,0.18)';
      ICON.person(8 + i * 9, yy, 8, col);
    }
  }
}
