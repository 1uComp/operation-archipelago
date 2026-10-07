'use strict';
/* ============================================================
   enemies.js — вражеские корабли (4 типа) и линкор-босс
   ============================================================ */

function rollShipType() {
  const mix = curCfg.mix;
  let r = Math.random(), acc = 0;
  for (const [t, p] of mix) { acc += p; if (r <= acc) return t; }
  return mix[mix.length - 1][0];
}

function spawnEnemy(forceType) {
  for (let t = 0; t < 40; t++) {
    const isl = pick(islands);
    const a = rr(0, TAU), d = isl.r + rr(60, 120);
    const x = isl.x + Math.cos(a) * d, y = isl.y + Math.sin(a) * d;
    if (x < 20 || x > WORLD.w - 20 || y < 20 || y > WORLD.h - 20) continue;
    if (!isWater(x, y)) continue;
    if (player && dist(x, y, player.x, player.y) < 360) continue;
    const type = forceType || rollShipType();
    const ST = SHIP_TYPES[type];
    const hp = curCfg.eHp * ST.hp * (1 + alert * 0.08) * diff().hp;
    enemies.push({
      type, T: ST, x, y, ang: rr(0, TAU), spd: 0,
      hp, max: hp, state: 'patrol', isl, wa: a + 1.5,
      cool: rr(1, 2), flash: 0, smk: 0, roll: 0, wakeT: 0, alertT: 0
    });
    return true;
  }
  return false;
}

/* кого атакует корабль: транспорт конвоя важнее катера */
function enemyTarget(e) {
  if (transport && !transport.dead && !transport.done) {
    const dT = dist(e.x, e.y, transport.x, transport.y);
    const dP = player.dead ? 1e9 : dist(e.x, e.y, player.x, player.y);
    if (dT < dP * 1.4) return transport;
  }
  return player;
}

function enemyFire(e, dp, tg) {
  const ST = e.T;
  tg = tg || player;
  e.cool = rr(ST.cd[0], ST.cd[1]) * (1 - alert * 0.05);
  const pvx = Math.cos(tg.ang || 0) * (tg.spd || 0), pvy = Math.sin(tg.ang || 0) * (tg.spd || 0);
  const lead = Math.min(0.7, dp / 420);
  const tx = tg.x + pvx * lead, ty = tg.y + pvy * lead;

  if (ST.homing) {
    const a = Math.atan2(ty - e.y, tx - e.x);
    eMissiles.push({ x: e.x, y: e.y, ang: a, spd: 70, life: 4.6, dmg: curCfg.eDmg * 1.8, dead: false });
    muzzle(e.x, e.y, a, 1.1);
    sndAt(e.x, e.y); SFX.rocket();
    return;
  }
  const a = Math.atan2(ty - e.y, tx - e.x);
  const spread = ST.salvo > 1 ? 0.06 : 0.0;
  for (let i = 0; i < ST.salvo; i++) {
    const off = (i - (ST.salvo - 1) / 2) * spread + rr(-0.03, 0.03);
    shells.push({ x: e.x + Math.cos(e.ang) * 9, y: e.y + Math.sin(e.ang) * 9,
                  vx: Math.cos(a + off) * 215, vy: Math.sin(a + off) * 215,
                  life: 1.8, from: 'e', dmg: curCfg.eDmg * ST.dmg, dead: false });
  }
  muzzle(e.x + Math.cos(e.ang) * 9, e.y + Math.sin(e.ang) * 9, a, 0.7);
  sndAt(e.x, e.y);
  if (e.type === 'patrol') SFX.mg(); else SFX.eshoot();
}

function killEnemy(e, i) {
  blowCover();
  boom(e.x, e.y, e.T.tough ? 2.3 : 1.6);
  bumpCombo();
  reward(e.T.reward * (e.bounty || 1), e.x, e.y - 12, e.ace ? '#ffd94a' : '#ffd94a');
  kills.ships++;
  /* обломки и масляное пятно */
  for (let k = 0; k < 8; k++)
    addP({ x: e.x, y: e.y, vx: rr(-55, 55), vy: rr(-55, 55), g: 60, drag: 1.2,
           life: rr(0.5, 1.0), max: 1.0, size: rr(0.5, 1.4), col: '#39454e', type: 'debris', spin: rr(-8, 8) });
  if (chance(0.3)) pickups.push({ x: e.x, y: e.y, type: 'repair', ph: rr(0, TAU), life: 30 });
  else if (chance(0.22) && upg.msl) pickups.push({ x: e.x, y: e.y, type: 'ammo', ph: rr(0, TAU), life: 30 });
  /* ас всегда оставляет усиление, обычный корабль — изредка */
  if (e.drop || chance(0.08)) dropBuff(e.x + rr(-6, 6), e.y + rr(-6, 6));
  evKilled(e);
  enemies.splice(i, 1);
}

function updEnemies(dt) {
  const P = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], ST = e.T;
    e.flash -= dt; e.cool -= dt; e.alertT = Math.max(0, e.alertT - dt);
    const dp = P.dead ? 9999 : dist(e.x, e.y, P.x, P.y);
    const prevAng = e.ang;

    if (e.route) evSteer(e, dt);          /* баржи и гонщики событий идут по маршруту */
    else if (e.state === 'patrol') {
      const wp = { x: e.isl.x + Math.cos(e.wa) * (e.isl.r + 72), y: e.isl.y + Math.sin(e.wa) * (e.isl.r + 72) };
      const da = angDiff(e.ang, Math.atan2(wp.y - e.y, wp.x - e.x));
      e.ang += clamp(da, -1, 1) * ST.turn * 0.85 * dt;
      e.spd = approach(e.spd, ST.spd * 0.5, 1.5, dt);
      if (dist(e.x, e.y, wp.x, wp.y) < 26) e.wa += rr(1.2, 2.6) * (chance(0.5) ? -1 : 1);
      const seesConvoy = transport && !transport.dead && !transport.done &&
                         dist(e.x, e.y, transport.x, transport.y) < ST.radar;
      if ((seesConvoy || (dp < ST.radar && !losBlocked(e.x, e.y, P.x, P.y))) && !nightQuiet()) {
        e.state = 'fight'; e.alertT = 0.6;
      }
    } else {
      const tg = enemyTarget(e);
      const dtg = dist(e.x, e.y, tg.x, tg.y);
      if ((dp > ST.radar * 1.5 && dtg > ST.radar * 1.5) || (P.dead && tg === P)) e.state = 'patrol';
      else {
        const da = angDiff(e.ang, Math.atan2(tg.y - e.y, tg.x - e.x));
        e.ang += clamp(da, -1, 1) * ST.turn * dt;
        /* ракетный держится далеко, катер лезет в упор */
        const keep = ST.keep || (ST.tough ? 200 : 150);
        const want = dtg > keep + 60 ? ST.spd : dtg < keep - 40 ? -ST.spd * 0.45 : ST.spd * 0.25;
        e.spd = approach(e.spd, want, 2, dt);
        if (e.cool <= 0 && dtg < ST.rng && Math.abs(da) < 0.95 && !losBlocked(e.x, e.y, tg.x, tg.y))
          enemyFire(e, dtg, tg);
      }
    }

    /* обход островов */
    for (const isl of islands) {
      const dx = e.x - isl.x, dy = e.y - isl.y, d2v = dx * dx + dy * dy, rq = isl.r + 38;
      if (d2v < rq * rq) { const away = Math.atan2(dy, dx); e.ang += clamp(angDiff(e.ang, away), -1, 1) * 3.2 * dt; }
    }

    e.x += Math.cos(e.ang) * e.spd * dt;
    e.y += Math.sin(e.ang) * e.spd * dt;
    e.x = clamp(e.x, 10, WORLD.w - 10);
    e.y = clamp(e.y, 10, WORLD.h - 10);
    collideIslands(e, ST.r);

    /* крен и след */
    e.roll = approach(e.roll, -angDiff(prevAng, e.ang) / Math.max(dt, 0.001) * 0.06, 6, dt);
    if (Math.abs(e.spd) > 20) {
      e.wakeT -= dt;
      if (e.wakeT <= 0) e.wakeT = 0.055;       /* след рисует shipWake (vfx.js) */
      if (chance(0.35))
        addP({ x: e.x - Math.cos(e.ang) * 9, y: e.y - Math.sin(e.ang) * 9, vx: rr(-4, 4), vy: rr(-4, 4),
               life: 0.5, max: 0.5, size: 0.6, col: 'rgba(220,245,248,0.65)', layer: 0 });
    }

    if (e.hp < e.max * 0.4) {
      e.smk -= dt;
      if (e.smk <= 0) {
        e.smk = 0.12;
        addP({ x: e.x, y: e.y, vx: rr(-4, 4), vy: rr(-10, -3), life: 0.95, max: 0.95, size: 2.2,
               col: '#4a545e', type: 'smoke' });
      }
    }

    /* таран */
    if (!P.dead && dist(e.x, e.y, P.x, P.y) < 8 + ST.r) {
      damagePlayer(6 + level);
      e.hp -= 12; e.flash = 0.15;
      const a = Math.atan2(P.y - e.y, P.x - e.x);
      P.x += Math.cos(a) * 6; P.y += Math.sin(a) * 6;
      e.x -= Math.cos(a) * 6; e.y -= Math.sin(a) * 6;
      P.spd *= 0.6; e.spd *= 0.6;
      boom((e.x + P.x) / 2, (e.y + P.y) / 2, 0.5);
    }

    if (e.hp <= 0) killEnemy(e, i);
  }

  /* пополнение флота — зависит от тревоги */
  shipT -= dt;
  const target = curCfg.enemies + Math.min(4, Math.floor(alert * 1.2));
  if (shipT <= 0) {
    shipT = Math.max(3, 6 - alert * 0.8);
    if (enemies.length < target) spawnEnemy();
  }
}

/* ============================================================
   ФЛАГМАНЫ. Каждый круг приходит другой:
     leviathan — линкор: веер главного калибра и ракетные залпы;
     carrier   — авианосец: сам почти не стреляет, но поднимает
                 авиагруппу волна за волной, вблизи огрызается флаком;
     monitor   — монитор: навесная артиллерия на полкарты с кругами
                 накрытия, медленный и очень живучий.
   ============================================================ */
const BOSS_NAME_KEY = { leviathan: 'bossName', carrier: 'bossName2', monitor: 'bossName3' };
const bossTitle = () => T(BOSS_NAME_KEY[(boss && boss.kind) || curCfg.bossKind || 'leviathan']);
const bossArt = k => BOSS_ART[k] || BOSS_ART.leviathan;

function spawnBoss() {
  const kind = curCfg.bossKind || 'leviathan';
  const side = chance(0.5) ? 1 : -1;
  const tough = kind === 'monitor' ? 1.35 : kind === 'carrier' ? 1.15 : 1;
  const bhp = (curCfg.bossHp || BOSS.hp) * tough * diff().hp;
  boss = {
    kind,
    x: clamp(player.x + 520 * side, 120, WORLD.w - 120),
    y: clamp(player.y + rr(-200, 200), 120, WORLD.h - 120),
    ang: 0, spd: 0, hp: bhp, max: bhp,
    cool: 2, saloCool: 6, aaCool: 3, flash: 0, phase: 1, wakeT: 0, roll: 0, dead: false,
    launchQ: 0, launchT: 0,
    tur: [0, 0, 0, 0], turRec: [0, 0, 0, 0]
  };
  banner = { main: T('mAlarm'), sub: bossTitle(), t: 4.2 };
  msg(T('mBossComing', bossTitle()), '#e5484d', 5);
  alert = 3;
  SFX.bossAlarm();
}

/* залп главного калибра из ближайшей к цели башни */
function bossSalvo(B, a, n, spread, spd, dmg, life) {
  const art = bossArt(B.kind);
  let ti = 0, best = 9;
  for (let i = 0; i < art.turrets.length; i++) {
    const d = Math.abs(angDiff(B.tur[i], a));
    if (d < best) { best = d; ti = i; }
  }
  const off = (art.turrets[ti] || 0) * art.len;
  const mx = B.x - Math.cos(B.ang) * off, my = B.y - Math.sin(B.ang) * off;
  B.turRec[ti] = 3.2;
  for (let i = 0; i < n; i++) {
    const q = (i - (n - 1) / 2) * spread;
    shells.push({ x: mx + Math.cos(a) * 14, y: my + Math.sin(a) * 14,
                  vx: Math.cos(a + q) * spd, vy: Math.sin(a + q) * spd,
                  life, from: 'e', dmg, dead: false });
  }
  muzzle(mx + Math.cos(a) * 16, my + Math.sin(a) * 16, a, 1.6);
  addShake(1.2, B.x, B.y);
  sndAt(mx, my); SFX.eshoot();
}

function updBoss(dt) {
  if (!boss) return;
  const B = boss, P = player;
  const art = bossArt(B.kind);
  B.flash -= dt; B.cool -= dt; B.saloCool -= dt; B.aaCool -= dt;
  B.phase = B.hp > B.max * 0.6 ? 1 : B.hp > B.max * 0.28 ? 2 : 3;

  /* башни доворачиваются на игрока и откатываются после залпа */
  const ta = P.dead ? B.ang : Math.atan2(P.y - B.y, P.x - B.x);
  for (let i = 0; i < 4; i++) {
    B.tur[i] += clamp(angDiff(B.tur[i], ta), -1.5 * dt, 1.5 * dt);
    B.turRec[i] = Math.max(0, B.turRec[i] - dt * 9);
  }

  if (!P.dead) {
    const dp = dist(B.x, B.y, P.x, P.y);
    const da = angDiff(B.ang, Math.atan2(P.y - B.y, P.x - B.x));
    const pvx = Math.cos(P.ang) * P.spd, pvy = Math.sin(P.ang) * P.spd;
    const aim = Math.atan2(P.y + pvy * 0.45 - B.y, P.x + pvx * 0.45 - B.x);

    if (B.kind === 'carrier') {
      /* держится подальше и всё время поднимает авиагруппу */
      B.ang += clamp(da, -1, 1) * 0.45 * dt;
      B.spd = approach(B.spd, dp < 320 ? -34 : 48, 1.0, dt);
      if (B.aaCool <= 0) {
        B.aaCool = B.phase === 3 ? 5.5 : B.phase === 2 ? 7 : 9;
        B.launchQ = 1 + B.phase;               /* самолёты уходят по одному, а не залпом */
        B.launchT = 0;
        msg(T('mBossLaunch'), '#ff9ad5', 2);
        SFX.bossAlarm();
      }
      /* вблизи огрызается зенитками */
      if (B.cool <= 0 && dp < 220) {
        B.cool = 0.5;
        for (let i = 0; i < 2; i++) {
          const q = aim + rr(-0.16, 0.16);
          shells.push({ x: B.x + Math.cos(q) * 18, y: B.y + Math.sin(q) * 18,
                        vx: Math.cos(q) * 250, vy: Math.sin(q) * 250,
                        life: 1.1, from: 'e', dmg: curCfg.eDmg * 0.75, dead: false });
        }
        muzzle(B.x + Math.cos(aim) * 20, B.y + Math.sin(aim) * 20, aim, 0.8);
        sndAt(B.x, B.y); SFX.mg();
      }

    } else if (B.kind === 'monitor') {
      /* ползёт медленно, бьёт навесом почти через всю карту */
      B.ang += clamp(da, -1, 1) * 0.35 * dt;
      B.spd = approach(B.spd, dp > 300 ? 30 : dp < 170 ? -18 : 10, 0.8, dt);
      if (B.cool <= 0 && dp < 620) {
        B.cool = B.phase === 3 ? 2.6 : B.phase === 2 ? 3.2 : 4.0;
        const n = 1 + B.phase;
        for (let i = 0; i < n; i++) {
          arcs.push({ x0: B.x, y0: B.y,
                      x1: clamp(P.x + pvx * 0.9 + rr(-34, 34), 10, WORLD.w - 10),
                      y1: clamp(P.y + pvy * 0.9 + rr(-34, 34), 10, WORLD.h - 10),
                      t: -i * 0.18, dur: 2.1, dmg: curCfg.eDmg * 2.2, rad: 40, from: 'bomb' });
        }
        muzzle(B.x + Math.cos(aim) * 18, B.y + Math.sin(aim) * 18, aim, 2.0);
        addShake(2.0, B.x, B.y);
        sndAt(B.x, B.y); SFX.boom(0.8);
      }
      /* в упор работает казематами */
      if (B.saloCool <= 0 && dp < 200) {
        B.saloCool = 1.6;
        bossSalvo(B, aim, 2, 0.10, 215, curCfg.eDmg * 1.2, 1.6);
      }

    } else {
      /* линкор: веер главного калибра плюс ракетные залпы */
      B.ang += clamp(da, -1, 1) * 0.55 * dt;
      B.spd = approach(B.spd, dp > 260 ? 62 : dp < 150 ? -25 : 18, 1.2, dt);
      if (B.cool <= 0 && dp < 430) {
        B.cool = B.phase === 3 ? 1.3 : B.phase === 2 ? 1.7 : 2.2;
        bossSalvo(B, aim, 2 + B.phase, 0.075, 230, curCfg.eDmg * 1.5, 2.2);
      }
      if (B.saloCool <= 0) {
        B.saloCool = B.phase === 3 ? 5.5 : 8;
        for (let i = 0; i < 2 + B.phase; i++) {
          const a = Math.atan2(P.y - B.y, P.x - B.x) + rr(-0.7, 0.7);
          eMissiles.push({ x: B.x, y: B.y, ang: a, spd: 60, life: 6, dmg: curCfg.eDmg * 1.6, dead: false });
        }
        msg(T('mBossSalvo'), '#ff6b3d', 1.6);
        sndAt(B.x, B.y); SFX.rocket();
      }
      if (B.aaCool <= 0 && B.phase >= 2) { B.aaCool = 12; spawnPlane(true); }
    }
  }

  /* очередь взлёта авиагруппы */
  if (B.launchQ > 0) {
    B.launchT -= dt;
    if (B.launchT <= 0) { B.launchT = 0.45; B.launchQ--; spawnPlane(chance(0.4)); }
  }

  B.x += Math.cos(B.ang) * B.spd * dt;
  B.y += Math.sin(B.ang) * B.spd * dt;
  B.x = clamp(B.x, 60, WORLD.w - 60);
  B.y = clamp(B.y, 60, WORLD.h - 60);
  collideIslands(B, art.r + 2);

  B.wakeT -= dt;
  if (B.wakeT <= 0 && Math.abs(B.spd) > 10) {
    B.wakeT = 0.07;
    /* след флагмана рисует shipWake (vfx.js) */
  }
  if (B.phase >= 2 && chance(0.5))
    addP({ x: B.x + rr(-14, 14), y: B.y + rr(-24, 24), vx: rr(-5, 5), vy: rr(-14, -5),
           life: 1.3, max: 1.3, size: 3, col: '#4a545e', type: 'smoke' });
  if (B.phase === 3 && chance(0.25))
    addP({ x: B.x + rr(-12, 12), y: B.y + rr(-22, 22), life: 0.35, max: 0.35, type: 'fire', size: 4 });

  if (!P.dead && dist(B.x, B.y, P.x, P.y) < art.r + 6) {
    damagePlayer(14);
    const a = Math.atan2(P.y - B.y, P.x - B.x);
    P.x += Math.cos(a) * 14; P.y += Math.sin(a) * 14; P.spd *= 0.4;
  }

  if (B.hp <= 0 && !B.dead) {
    B.dead = true;
    const title = bossTitle();
    for (let k = 0; k < 9; k++) setTimeout(() => {
      if (!boss) return;
      boom(boss.x + rr(-26, 26), boss.y + rr(-40, 40), rr(1.0, 2.0));
    }, k * 150);
    setTimeout(() => {
      if (!boss) return;
      bigBoom(boss.x, boss.y);
      reward(ECON.boss, boss.x, boss.y - 30, '#4ade80');
      msg(T('mBossDown', title), '#4ade80', 4);
      kills.ships++;
      boss = null;
    }, 1500);
  }
}
