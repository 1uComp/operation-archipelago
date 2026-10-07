'use strict';
/* ============================================================
   subs.js — подводные лодки и торпеды.

   Лодка почти всё время под водой: снаряды и ракеты проходят мимо,
   на поверхности виден только бурун перископа. Достать её можно
   глубинными бомбами, а когда ей крепко достаётся — она вынуждена
   всплыть, и вот тогда её добивают из пушки.
   ============================================================ */

let subPingT = 0;

function spawnSub() {
  for (let t = 0; t < 40; t++) {
    const x = rr(140, WORLD.w - 140), y = rr(140, WORLD.h - 140);
    if (!isWater(x, y)) continue;
    if (player && dist(x, y, player.x, player.y) < 340) continue;
    if (dist(x, y, CARR.x, CARR.y) < 360) continue;
    const hp = SUB.hp * (1 + (curCfg.n || 0) * 0.09) * diff().hp;
    subs.push({
      x, y, ang: rr(0, TAU), spd: 0, hp, max: hp,
      depth: 1, mode: 'hunt', cool: rr(2, 5), forced: 0, flash: 0, wakeT: 0
    });
    return true;
  }
  return false;
}

/* кого лодка сегодня топит: транспорт конвоя важнее катера */
function subPrey(s) {
  if (transport && !transport.dead && dist(s.x, s.y, transport.x, transport.y) <
      dist(s.x, s.y, player.x, player.y) * 1.35) return transport;
  return player;
}

function launchTorpedo(s, tg) {
  const lead = dist(s.x, s.y, tg.x, tg.y) / SUB.torpSpd;
  const vx = Math.cos(tg.ang || 0) * (tg.spd || 0), vy = Math.sin(tg.ang || 0) * (tg.spd || 0);
  const a = Math.atan2(tg.y + vy * lead * 0.8 - s.y, tg.x + vx * lead * 0.8 - s.x);
  torps.push({ x: s.x + Math.cos(a) * 12, y: s.y + Math.sin(a) * 12,
               ang: a, spd: SUB.torpSpd, life: 7, dmg: SUB.torpDmg * diff().dmg, trail: 0 });
  sndAt(s.x, s.y); SFX.rocket();
}

function killSub(s, i) {
  boom(s.x, s.y, 1.9);
  splashFx(s.x, s.y, 2.0);
  bumpCombo();
  reward(SUB.reward, s.x, s.y - 12, '#7fd4e0');
  kills.ships++;
  blowCover();
  for (let k = 0; k < 10; k++)
    addP({ x: s.x, y: s.y, vx: rr(-40, 40), vy: rr(-40, 40), g: 40, drag: 1.4,
           life: rr(0.6, 1.3), max: 1.3, size: rr(0.5, 1.4), col: '#2f3841', type: 'debris', spin: rr(-8, 8) });
  subs.splice(i, 1);
}

function updSubs(dt) {
  const P = player;
  if (curCfg.subs && subs.length < curCfg.subs) {
    subPingT -= dt;
    if (subPingT <= 0) { subPingT = rr(10, 18); spawnSub(); }
  }

  for (let i = subs.length - 1; i >= 0; i--) {
    const s = subs[i];
    s.cool -= dt; s.flash -= dt;
    const tg = P.dead ? (transport && !transport.dead ? transport : null) : subPrey(s);

    /* принудительное всплытие после тяжёлых повреждений */
    if (s.forced > 0) {
      s.forced -= dt;
      s.depth = approach(s.depth, 0, 2, dt);
      s.spd = approach(s.spd, SUB.spd * 0.5, 1.2, dt);
      if (tg) s.ang += clamp(angDiff(s.ang, Math.atan2(s.y - tg.y, s.x - tg.x)), -1, 1) * SUB.turn * dt;
      if (chance(0.5))
        addP({ x: s.x + rr(-5, 5), y: s.y + rr(-5, 5), vx: rr(-4, 4), vy: rr(-12, -4),
               life: 1.1, max: 1.1, size: 2.4, col: '#4a545e', type: 'smoke' });
    } else if (tg) {
      const d = dist(s.x, s.y, tg.x, tg.y);
      const want = d > SUB.range ? SUB.spd : d < SUB.range * 0.55 ? -SUB.spd * 0.4 : SUB.spd * 0.3;
      s.spd = approach(s.spd, want, 1.4, dt);
      s.ang += clamp(angDiff(s.ang, Math.atan2(tg.y - s.y, tg.x - s.x)), -1, 1) * SUB.turn * dt;
      /* к моменту пуска поднимается на перископную глубину */
      s.depth = approach(s.depth, s.cool < 1.1 ? 0.45 : 1, 1.6, dt);
      if (s.cool <= 0 && d < SUB.range) {
        s.cool = rr(SUB.cd[0], SUB.cd[1]);
        launchTorpedo(s, tg);
      }
    } else {
      s.spd = approach(s.spd, SUB.spd * 0.4, 1, dt);
      s.depth = approach(s.depth, 1, 1.2, dt);
    }

    s.x += Math.cos(s.ang) * s.spd * dt;
    s.y += Math.sin(s.ang) * s.spd * dt;
    s.x = clamp(s.x, 30, WORLD.w - 30);
    s.y = clamp(s.y, 30, WORLD.h - 30);
    collideIslands(s, SUB.r);

    /* бурун перископа выдаёт лодку на поверхности */
    if (Math.abs(s.spd) > 18) {
      s.wakeT -= dt;
      if (s.wakeT <= 0) {
        s.wakeT = 0.09;
        addWake(s.x - Math.cos(s.ang) * 6, s.y - Math.sin(s.ang) * 6, s.ang, 0.35 * (1.2 - s.depth * 0.6));
      }
    }
    if (s.depth < 0.9 && chance(0.35))
      addP({ x: s.x + rr(-3, 3), y: s.y + rr(-3, 3), vx: 0, vy: 0, life: 0.5, max: 0.5,
             size: 0.6, col: 'rgba(220,245,248,0.55)', layer: 0 });

    if (s.hp <= 0) { killSub(s, i); continue; }
    if (s.forced <= 0 && s.hp < s.max * SUB.surfaceAt && s.depth > 0.5) {
      s.forced = 7;
      msg(T('mSubSurface'), '#ffd94a', 2.5);
      SFX.alarm();
    }
  }
}

/* снаряды достают лодку только когда она наверху */
const subExposed = s => s.depth < 0.45;

function damageSub(s, dmg, deep) {
  if (!deep && !subExposed(s)) return false;
  s.hp -= dmg;
  s.flash = 0.14;
  return true;
}

/* ---------- торпеды ---------- */
function updTorps(dt) {
  for (let i = torps.length - 1; i >= 0; i--) {
    const t = torps[i];
    t.x += Math.cos(t.ang) * t.spd * dt;
    t.y += Math.sin(t.ang) * t.spd * dt;
    t.life -= dt;
    t.trail -= dt;
    if (t.trail <= 0) {
      t.trail = 0.045;
      addP({ x: t.x - Math.cos(t.ang) * 4, y: t.y - Math.sin(t.ang) * 4,
             vx: rr(-3, 3), vy: rr(-3, 3), life: 0.9, max: 0.9, size: rr(0.5, 1.1),
             col: 'rgba(226,248,252,0.75)', layer: 0 });
    }
    let dead = t.life <= 0 || !isWater(t.x, t.y);
    if (!dead && player && !player.dead && dist(t.x, t.y, player.x, player.y) < 10) {
      damagePlayer(t.dmg); dead = true;
    }
    if (!dead && transport && !transport.dead && dist(t.x, t.y, transport.x, transport.y) < CONVOY.r) {
      damageTransport(t.dmg * 1.2); dead = true;
    }
    if (dead) { boom(t.x, t.y, 1.2); splashFx(t.x, t.y, 1.3); torps.splice(i, 1); }
  }
}

/* ---------- отрисовка ---------- */
function drawSubs() {
  for (const s of subs) {
    const vis = 1 - s.depth * 0.72;                 /* под водой видно силуэт */
    ctx.save();
    ctx.globalAlpha = vis;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang + Math.PI / 2);
    ctx.drawImage(sprSub, -sprSub.width / (2 * SC), -sprSub.height / (2 * SC),
                  sprSub.width / SC, sprSub.height / SC);
    ctx.restore();
    ctx.globalAlpha = 1;

    /* перископ торчит даже на глубине */
    if (s.depth > 0.3) {
      const px2 = s.x + Math.cos(s.ang) * 3, py2 = s.y + Math.sin(s.ang) * 3;
      ctx.fillStyle = '#1b222a'; ctx.fillRect(px2 - 0.6, py2 - 0.6, 1.2, 1.2);
      ctx.fillStyle = 'rgba(226,248,252,0.45)';
      ctx.fillRect(px2 - Math.cos(s.ang) * 2 - 0.5, py2 - Math.sin(s.ang) * 2 - 0.5, 1, 1);
    }
    if (s.flash > 0) {
      ctx.globalAlpha = Math.min(1, s.flash * 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, SUB.r + 1, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (s.forced > 0 && s.hp < s.max) {
      ctx.fillStyle = 'rgba(6,16,24,0.85)'; ctx.fillRect(s.x - 7, s.y - 13, 14, 2.5);
      ctx.fillStyle = '#e5484d'; ctx.fillRect(s.x - 6.5, s.y - 12.6, 13 * (s.hp / s.max), 1.6);
    }
  }
}

function drawTorps() {
  for (const t of torps) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.ang);
    ctx.fillStyle = '#20272d'; ctx.fillRect(-4.5, -1, 9, 2);
    ctx.fillStyle = '#495663'; ctx.fillRect(-4.5, -1, 9, 0.7);
    ctx.fillStyle = '#c8393f'; ctx.fillRect(3, -1, 1.6, 2);
    ctx.restore();
  }
}
