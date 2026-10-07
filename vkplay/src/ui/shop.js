'use strict';
/* ============================================================
   shop.js — арсенал «СЕВЕР»: список улучшений, покупка, отрисовка.

   Цены подобраны так, чтобы полное дерево (~27 000 кредитов) нельзя
   было выкупить за один-два уровня: доход растёт медленнее стоимости.
   ============================================================ */

const ITEMS = [
  { name: 'itRepair', desc: 'itRepairD',
    lvl: () => 0, max: 99, cost: () => 150, can: () => player.hp < player.maxhp,
    buy: () => { player.hp = Math.min(player.maxhp, player.hp + 40); } },

  { name: 'itArmor', desc: 'itArmorD',
    lvl: () => upg.armor, max: 5, cost: () => 600 + upg.armor * 420,
    buy: () => { upg.armor++; player.maxhp = maxhpVal(); player.hp = Math.min(player.maxhp, player.hp + 25); } },

  { name: 'itGun', desc: 'itGunD',
    lvl: () => upg.dmg, max: 4, cost: () => 500 + upg.dmg * 450, buy: () => { upg.dmg++; } },

  { name: 'itRate', desc: 'itRateD',
    lvl: () => upg.rate, max: 4, cost: () => 500 + upg.rate * 450, buy: () => { upg.rate++; } },

  { name: 'itEngine', desc: 'itEngineD',
    lvl: () => upg.eng, max: 3, cost: () => 400 + upg.eng * 350, buy: () => { upg.eng++; } },

  { name: 'itBoost', desc: 'itBoostD',
    lvl: () => upg.boost, max: 3, cost: () => 450 + upg.boost * 350,
    buy: () => { upg.boost++; player.boostE = boostMax(); } },

  { name: 'itMissile', desc: 'itMissileD',
    lvl: () => upg.msl, max: 1, cost: () => 900, buy: () => { upg.msl = 1; upg.ammo += 6; } },

  { name: 'itAmmo', desc: 'itAmmoD',
    lvl: () => 0, max: 99, cost: () => 260, can: () => upg.msl > 0, buy: () => { upg.ammo += 6; } },

  { name: 'itBoat', desc: 'itBoatD',
    lvl: () => upg.boat, max: 2, cost: () => 600 + upg.boat * 500, buy: () => { upg.boat++; } },

  { name: 'itPd', desc: 'itPdD',
    lvl: () => upg.pd, max: 2, cost: () => 1500 + upg.pd * 1100, buy: () => { upg.pd++; } },

  { name: 'itRadar', desc: 'itRadarD',
    lvl: () => upg.radar, max: 3, cost: () => 400 + upg.radar * 350, buy: () => { upg.radar++; } },

  { name: 'itDC', desc: 'itDCD',
    lvl: () => upg.dc, max: 1, cost: () => 850, buy: () => { upg.dc = 1; } }
];

/* ------------------------------------------------------------
   Нижний блок арсенала: барабан, ракеты за ролик и две постоянные
   вещи. Они живут отдельным списком под чертой, чтобы не мешаться
   с обычной прокачкой.
   ------------------------------------------------------------ */
let adAmmoT = 0;                       /* откат ролика за ракеты */

const PREMIUM = [
  { name: 'itCrate', desc: 'itCrateD',
    tag: () => (crateT > 0 ? fmtT(crateT) : T('adFree')),
    on: () => true, act: () => openCrate('shop'), col: '#ff9ad5' },

  { ad: true, name: 'itAdAmmo', desc: 'itAdAmmoD',
    tag: () => (adAmmoT > 0 ? fmtT(adAmmoT) : '▶'),
    on: () => upg.msl > 0 && adAmmoT <= 0,
    act: () => {
      if (!upg.msl) { shopMsg = T('mNoLauncher'); shopMsgGood = false; shopMsgT = 1.6; SFX.hit(); return; }
      if (adAmmoT > 0) return;
      adRewarded(() => { upg.ammo += 8; adAmmoT = 90; shopMsg = T('shopBought', T('itAdAmmo')); shopMsgGood = true; shopMsgT = 2; });
    }, col: '#7fd4e0' },

  /* pay: true — строка за реальные деньги, скрывается при PAYMENTS_ON = false */
  { pay: true, name: 'itHull', desc: 'itHullD', id: 'hull_admiral', perk: 'hull',
    tag: () => (hasPerk('hull') ? T('ownedWord') : productPrice('hull_admiral')),
    on: () => !hasPerk('hull'), act: () => buyProduct('hull_admiral'), col: '#ffd94a' },

  { pay: true, name: 'itHarp', desc: 'itHarpD', id: 'harpoon_gold', perk: 'harp',
    tag: () => (hasPerk('harp') ? T('ownedWord') : productPrice('harpoon_gold')),
    on: () => !hasPerk('harp'), act: () => buyProduct('harpoon_gold'), col: '#ffd94a' }
].filter(p => (!p.pay || PAYMENTS_ON) && (!p.ad || ADS_ON));   /* без рекламы площадки — без строк «за ролик» */

let shopRows = [], shopHover = -1, shopSel = 0, shopMsg = '', shopMsgT = 0;
let shopArmed = -1;                    /* телефон: строка, выбранная первым касанием */
let shopClose = { x: 0, y: 0, w: 0, h: 0 }, shopMsgGood = false;

function shopAvail(it) {
  const maxed = it.lvl() >= it.max;
  return (!it.can || it.can()) && !maxed;
}

const shopCount = () => ITEMS.length + PREMIUM.length;

function buyItem(i) {
  if (i >= ITEMS.length) {                       /* нижний блок живёт своей логикой */
    const p = PREMIUM[i - ITEMS.length];
    if (p) p.act();
    return;
  }
  const it = ITEMS[i];
  if (!it) return;
  if (it.can && !it.can()) { shopMsg = T('shopNoNeed'); shopMsgGood = false; shopMsgT = 1.5; SFX.hit(); return; }
  if (it.lvl() >= it.max) { shopMsg = T('shopMaxed'); shopMsgGood = false; shopMsgT = 1.5; SFX.hit(); return; }
  const c = it.cost();
  if (money < c) { shopMsg = T('shopPoor'); shopMsgGood = false; shopMsgT = 1.5; SFX.hit(); return; }
  money -= c;
  it.buy();
  SFX.buy();
  shopMsg = T('shopBought', T(it.name));
  shopMsgGood = true; shopMsgT = 2;
  if (runTrack) runSave();            /* покупка сразу попадает в снимок операции */
  for (let k = 0; k < 10; k++)
    addP({ x: player.x + rr(-8, 8), y: player.y + rr(-8, 8), vx: rr(-14, 14), vy: rr(-26, -8),
           life: rr(0.5, 0.9), max: 0.9, size: 1.2, col: '#ffd94a' });
}

function shopMove(d) {
  const n = shopCount();
  for (let k = 0; k < n; k++) {
    shopSel = (shopSel + d + n) % n;
    if (shopSel >= ITEMS.length ? PREMIUM[shopSel - ITEMS.length].on() : shopAvail(ITEMS[shopSel])) break;
  }
  SFX.move();
}

/* касание по экрану арсенала */
function shopTap(x, y) {
  if (x >= shopClose.x && x <= shopClose.x + shopClose.w &&
      y >= shopClose.y && y <= shopClose.y + shopClose.h) { setState('play'); SFX.ui(); return; }
  for (const r of shopRows) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      /* На телефоне первое касание только выделяет строку и показывает
         описание, второе покупает: промах пальцем по соседней строке
         больше не тратит кредиты. */
      if (touchMode() && shopArmed !== r.i) { shopArmed = r.i; shopSel = r.i; shopMsgT = 0; SFX.move(); return; }
      shopSel = r.i; buyItem(r.i); return;
    }
  }
}

function renderShop() {
  if (stT < 0.05) shopArmed = -1;          /* арсенал только открыли */
  drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.72)';
  ctx.fillRect(0, 0, VW, VH);

  const X = 58, W = 364, Y = 8, H = 254;
  panel(X, Y, W, H, '#4a86a3');
  const credW = txtW(T('shopCredits', money));
  /* заголовок ужимается так, чтобы не дойти до строки кредитов */
  txt(T('shopTitle', T('carrier')), VW / 2, Y + 6, '#ffb454', 8, 'center',
      Math.max(80, (X + W - 26 - credW - 8 - VW / 2) * 2));
  txt(T('shopCredits', money), X + W - 26, Y + 6, '#ffd94a', 8, 'right', W - 120);

  /* крестик закрытия — нужен на сенсоре, мышью тоже работает */
  shopClose = { x: X + W - 20, y: Y + 3, w: 16, h: 14 };
  ctx.strokeStyle = '#7fd4e0'; ctx.lineWidth = D * 2;
  ctx.beginPath();
  ctx.moveTo(shopClose.x + 5, shopClose.y + 4); ctx.lineTo(shopClose.x + 11, shopClose.y + 10);
  ctx.moveTo(shopClose.x + 11, shopClose.y + 4); ctx.lineTo(shopClose.x + 5, shopClose.y + 10);
  ctx.stroke();

  ctx.fillStyle = '#2c5a70'; ctx.fillRect(X + 6, Y + 16, W - 12, 1);

  shopRows = []; shopHover = -1;
  const rowH = 13, y0 = Y + 18;

  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i], y = y0 + i * rowH;
    const lvl = it.lvl(), maxed = lvl >= it.max;
    const avail = shopAvail(it);
    const afford = money >= it.cost();
    const row = { x: X + 6, y, w: W - 12, h: rowH - 1, i };
    shopRows.push(row);

    const hov = !touchMode() && mouse.x >= row.x && mouse.x <= row.x + row.w &&
                mouse.y >= row.y && mouse.y <= row.y + row.h;
    if (hov && avail) { shopHover = i; shopSel = i; }
    const active = (i === shopSel);

    if (active && avail) {
      ctx.fillStyle = '#123246'; ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = '#ffb454'; ctx.fillRect(row.x, row.y, 2, row.h);
    }

    const nameCol = !avail ? '#4a5f6d' : afford ? '#f4f8fa' : '#8fa3ad';
    txt(i < 9 ? String(i + 1) : (i === 9 ? '0' : '-'), row.x + 6, y + 3, '#5d8299');
    txt(T(it.name), row.x + 22, y + 3, nameCol);

    if (it.max <= 5) {
      for (let p = 0; p < it.max; p++) {
        ctx.fillStyle = p < lvl ? '#4ade80' : '#182a36';
        ctx.fillRect(X + 236 + p * 8, y + 4, 6, 6);
      }
    }
    if (maxed) txt(T('shopMax'), X + W - 14, y + 3, '#4ade80', 8, 'right');
    else txt(T('shopCost', it.cost()), X + W - 14, y + 3, afford ? '#ffd94a' : '#e5484d', 8, 'right');
  }

  /* черта и блок за рекламу и деньги */
  const pRow = 12, py0 = y0 + ITEMS.length * rowH + 3;
  ctx.fillStyle = '#4a86a3'; ctx.fillRect(X + 6, py0 - 3, W - 12, 1);
  for (let i = 0; i < PREMIUM.length; i++) {
    const p = PREMIUM[i], y = py0 + i * pRow, idx = ITEMS.length + i;
    const row = { x: X + 6, y, w: W - 12, h: pRow - 1, i: idx };
    shopRows.push(row);
    const hov = !touchMode() && mouse.x >= row.x && mouse.x <= row.x + row.w &&
                mouse.y >= row.y && mouse.y <= row.y + row.h;
    if (hov && p.on()) { shopHover = idx; shopSel = idx; }
    if (shopSel === idx && p.on()) {
      ctx.fillStyle = '#123246'; ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = p.col; ctx.fillRect(row.x, row.y, 2, row.h);
    }
    txt(p.perk ? '★' : '▶', row.x + 6, y + 2, p.on() ? p.col : '#4a5f6d');
    txt(T(p.name), row.x + 22, y + 2, p.on() ? '#f4f8fa' : '#4a5f6d');
    txt(p.tag(), X + W - 14, y + 2, p.on() ? p.col : '#4a5f6d', 8, 'right');
  }

  ctx.fillStyle = '#2c5a70'; ctx.fillRect(X + 6, Y + H - 28, W - 12, 1);
  const ci = shopHover >= 0 ? shopHover : shopSel;
  const cur = ci >= ITEMS.length ? PREMIUM[ci - ITEMS.length] : ITEMS[ci];
  const foot = shopMsgT > 0 ? shopMsg : (cur ? T(cur.desc) : T('shopPick'));
  const footCol = shopMsgT > 0 ? (shopMsgGood ? '#4ade80' : '#e5484d') : '#7fd4e0';
  txt(foot, VW / 2, Y + H - 23, footCol, 8, 'center', W - 20);
  txt(touchMode() ? T('shopTouch') : T('shopKeys'), VW / 2, Y + H - 13, '#5d8299', 8, 'center', W - 20);
}
