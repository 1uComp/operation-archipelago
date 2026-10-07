'use strict';
/* ============================================================
   structs.js — береговые цели: базы, бункеры, РЛС-вышки, ящики
   ============================================================ */

function damageStruct(s, dmg) {
  s.hp -= dmg;
  s.flash = 0.09;
  s.shakeT = 0.16;
  if (s.hp <= 0) killStruct(s); else { sndAt(s.x, s.y); SFX.hit(); }
}

function killStruct(s) {
  s.dead = true;
  blowCover();
  s.rub = [];
  for (let i = 0; i < 7; i++) s.rub.push([rr(-6, 5), rr(-5, 4), rr(2, 4), rr(1, 3), chance(0.5)]);

  if (s.type === 'crate') {
    boom(s.x, s.y, 0.6, ['#ffd94a', '#ffb454', '#8a6238']);
    const kind = chance(0.5) && upg.msl ? 'ammo' : 'money';
    if (kind === 'ammo') {
      upg.ammo += ECON.crateAmmo;
      addFloat(s.x, s.y - 10, T('fRockets', ECON.crateAmmo), '#7fd4e0');
      SFX.pickup();
    } else reward(ECON.crate, s.x, s.y - 10, '#ffd94a');
    return;
  }

  if (s.type === 'light') {
    boom(s.x, s.y, 1.4);
    reward(ECON.tower * 0.6, s.x, s.y - 16, '#ffd94a');
    kills.bunkers++;
    return;
  }

  if (s.type === 'tower') {
    boom(s.x, s.y, 1.5);
    radarHacked = true;
    reward(ECON.tower, s.x, s.y - 14, '#7fd4e0');
    msg(T('mRadarDown'), '#7fd4e0', 4);
    kills.bunkers++;
    return;
  }

  boom(s.x, s.y, s.type === 'base' ? 2.3 : 1.35);
  bumpCombo();

  if (s.type === 'base') {
    bigBoom(s.x, s.y);
    reward(ECON.base, s.x, s.y - 14, '#4ade80');
    kills.bases++; destroyedBases++;
    alert = Math.min(3, alert + 1);
    msg(T('mBaseDown', '«' + islName(s.isl) + '»'), '#4ade80', 3);
    if (chance(0.75)) spawnHostages(s.isl);
    if (destroyedBases >= totalBases) {
      msg(T('mAllBases'), '#4ade80', 4, 1);
      if (curCfg.boss && !boss && !bossKilled) bossTimer = 1.6;
    } else {
      msg(T('mBasesLeft', totalBases - destroyedBases), '#ffb454', 3, 1.2);
    }
  } else {
    reward(ECON.bunker, s.x, s.y - 12, '#ffd94a');
    kills.bunkers++;
  }
}

/* тихая фаза ночной операции: пока не засекли, берег не стреляет */
const nightQuiet = () => curCfg.mission === 'night' && !stealth.blown;

function blowCover(silent) {
  if (curCfg.mission !== 'night' || stealth.blown) return;
  stealth.blown = true;
  stealth.meter = 1;
  alert = 3;
  if (!silent) { msg(T('mSpotted'), '#e5484d', 4); SFX.alarm(); }
  for (let i = 0; i < 3; i++) spawnEnemy();
}

/* лучи маяков: держат игрока в свету — и через пару секунд поднимают тревогу */
function updStealth(dt) {
  if (curCfg.mission !== 'night' || !player || player.dead) return;
  let lit = false;
  for (const s of structs) {
    if (s.type !== 'light' || s.dead) continue;
    const d = dist(s.x, s.y, player.x, player.y);
    if (d > s.range) continue;
    if (Math.abs(angDiff(s.rad, Math.atan2(player.y - s.y, player.x - s.x))) < s.arc * 0.5 &&
        !losBlocked(s.x, s.y, player.x, player.y)) { lit = true; break; }
  }
  stealth.lit = lit;
  if (stealth.blown) return;
  stealth.meter = clamp(stealth.meter + (lit ? 0.70 : -0.40) * dt, 0, 1);
  if (lit && stealth.meter > 0.12 && !stealth.warned) {
    stealth.warned = true;
    msg(T('mBeamWarn'), '#ffb454', 2.5);
  }
  if (stealth.meter >= 1) blowCover();
}

function updStructs(dt) {
  const P = player;
  for (const s of structs) {
    if (s.shakeT > 0) s.shakeT -= dt;
    if (s.dead) {
      if (s.type !== 'crate' && chance(0.02 * dt * 60))
        addP({ x: s.x + rr(-5, 5), y: s.y + rr(-4, 4), vx: rr(-3, 3), vy: rr(-10, -3),
               life: rr(0.9, 1.6), max: 1.6, size: rr(2, 3), col: '#4a545e', type: 'smoke' });
      continue;
    }
    s.cool -= dt; s.flash -= dt;
    if (s.type === 'base') s.rad += dt * 2;
    if (s.type === 'tower') { s.rad += dt * 1.4; continue; }
    if (s.type === 'light') { s.rad += s.spin * dt; continue; }
    if (s.type === 'crate') continue;
    if (P.dead || state !== 'play' || nightQuiet()) continue;

    const d = dist(s.x, s.y, P.x, P.y);
    const range = s.type === 'base' ? 400 : 350;
    if (d < range && s.cool <= 0 && !losBlocked(s.x, s.y, P.x, P.y)) {
      const pvx = Math.cos(P.ang) * P.spd, pvy = Math.sin(P.ang) * P.spd;
      if (s.type === 'bunker') {
        s.cool = (2.6 + Math.random()) * (1 - alert * 0.06);
        s.flash = 0.08;
        arcs.push({ x0: s.x, y0: s.y, x1: P.x + pvx * 0.8 + rr(-12, 12), y1: P.y + pvy * 0.8 + rr(-12, 12),
                    t: 0, dur: 1.5, dmg: 16 + level * 2, rad: 22, from: 'mortar' });
        sndAt(s.x, s.y); SFX.eshoot();
      } else {
        s.cool = (1.9 + Math.random() * 0.6) * (1 - alert * 0.06);
        s.flash = 0.08;
        const a = Math.atan2(P.y + pvy * 0.4 - s.y, P.x + pvx * 0.4 - s.x);
        for (const off of [-0.06, 0.06])
          shells.push({ x: s.x, y: s.y, vx: Math.cos(a + off) * 210, vy: Math.sin(a + off) * 210,
                        life: 1.9, from: 'e', dmg: curCfg.eDmg, dead: false });
        muzzle(s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8, a, 0.8);
        sndAt(s.x, s.y); SFX.eshoot();
      }
    }
  }
}
