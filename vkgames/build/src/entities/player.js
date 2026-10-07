'use strict';
/* ============================================================
   player.js — катер игрока: ход, форсаж, орудие, ПВО, спасение
   ============================================================ */

function makePlayer() {
  return {
    x: CARR.x + 150, y: CARR.y, ang: 0, spd: 0,
    hp: maxhpVal(), maxhp: maxhpVal(),
    cool: 0, turret: 0, flash: 0, recoil: 0, fr: 0,
    roll: 0, rollV: 0,
    aboard: 0, dead: false, sink: 0, sinkRot: 0, repT: 0,
    boostE: boostMax(), boosting: false, boostLock: 0, troops: 0,
    wakeT: 0, pdCool: 0, engineHum: 0
  };
}

function damagePlayer(d) {
  if (!player || player.dead) return;
  if (buffOn('shield')) { shieldHit(); return; }    /* щит гасит попадание */
  player.hp -= d * diff().dmg;
  player.fr = 0.35;
  shakeOffCrew(d);
  addShake(3, player.x + rr(-6, 6), player.y + rr(-6, 6));
  freeze(0.02);
  SFX.hit();
  for (let i = 0; i < 5; i++)
    addP({ x: player.x, y: player.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3,
           life: 0.25, max: 0.25, size: 0.7, col: '#ffd94a' });
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.sink = 0;
    recordBest();
    setState('dying');
    bigBoom(player.x, player.y);
    SFX.sink();
    addShake(10);
  }
}

/* ---------- ПВО «ОСА»: сбивает снаряды и ракеты рядом ---------- */
function pointDefense(dt) {
  if (upg.pd <= 0 || player.dead) return;
  player.pdCool -= dt;
  if (player.pdCool > 0) return;
  const R = pdRange();
  let tgt = null, bd = R;
  for (const s of shells) {
    if (s.from === 'p') continue;
    const d = dist(s.x, s.y, player.x, player.y);
    if (d < bd) { bd = d; tgt = s; }
  }
  if (!tgt) for (const m of eMissiles) {
    const d = dist(m.x, m.y, player.x, player.y);
    if (d < bd) { bd = d; tgt = m; }
  }
  if (!tgt) return;
  player.pdCool = 0.16 - upg.pd * 0.03;
  tgt.dead = true;
  const a = Math.atan2(tgt.y - player.y, tgt.x - player.x);
  muzzle(player.x + Math.cos(a) * 7, player.y + Math.sin(a) * 7, a, 0.5);
  addP({ x: tgt.x, y: tgt.y, life: 0.22, max: 0.22, type: 'ring', r: 6, col: '#9fe8ff' });
  SFX.pd();
}

function updPlayer(dt) {
  const P = player;

  /* ---- гибель: медленное погружение ---- */
  if (P.dead) {
    P.sink += dt; P.sinkRot += dt * 0.55;
    if (chance(0.5)) addP({ x: P.x + rr(-7, 7), y: P.y + rr(-7, 7), vx: rr(-6, 6), vy: rr(-16, -4),
                            life: 0.8, max: 0.8, size: rr(1, 2), col: '#bfeff2' });
    if (chance(0.14)) boom(P.x + rr(-9, 9), P.y + rr(-9, 9), 0.6);
    if (P.sink > 2.8) setState('over');
    return;
  }

  /* ---- управление: клавиатура или виртуальный стик ---- */
  let th = 0, turn = 0;
  const touch = touchMode();
  if (touch && tMove.active && tMove.mag > 0.14) {
    /* стик задаёт курс: катер доворачивает к пальцу, тяга по отклонению */
    th = Math.min(1, (tMove.mag - 0.14) / 0.6);
    const want = Math.atan2(tMove.dy, tMove.dx);
    turn = clamp(angDiff(P.ang, want) * 2.0, -1, 1);
  } else {                /* клавиатура работает всегда, даже в сенсорном режиме */
    if (keys['KeyW'] || keys['ArrowUp']) th = 1;
    else if (keys['KeyS'] || keys['ArrowDown']) th = -1;
    if (keys['KeyA'] || keys['ArrowLeft']) turn = -1;
    else if (keys['KeyD'] || keys['ArrowRight']) turn = 1;
  }

  /* форсаж */
  const boostKey = touch ? touchBoosting() : (keys['ShiftLeft'] || keys['ShiftRight']);
  const wantBoost = boostKey && th > 0 && P.boostE > 4 && P.boostLock <= 0;
  P.boosting = wantBoost;
  if (wantBoost) {
    P.boostE -= 34 * dt;
    if (P.boostE <= 0) { P.boostE = 0; P.boostLock = 1.4; P.boosting = false; }
    if (chance(0.85)) {
      const bx = P.x - Math.cos(P.ang) * 13, by = P.y - Math.sin(P.ang) * 13;
      addP({ x: bx, y: by, vx: -Math.cos(P.ang) * rr(30, 70) + rr(-10, 10),
             vy: -Math.sin(P.ang) * rr(30, 70) + rr(-10, 10), drag: 2.2,
             life: rr(0.2, 0.45), max: 0.45, size: rr(0.4, 1.6), col: chance(0.25) ? '#ffd94a' : '#dffaff' });
    }
  } else {
    P.boostLock = Math.max(0, P.boostLock - dt);
    P.boostE = Math.min(boostMax(), P.boostE + boostRegen() * dt);
  }
  if (P.boosting && chance(0.06)) SFX.boost();

  const slow  = 1 - (P.aboard + P.troops) * 0.028;
  const bmul  = P.boosting ? 1.75 : 1;
  const tgtSp = th > 0 ? maxSpd() * slow * bmul * (touch ? th : 1) : th < 0 ? -42 : 0;
  P.spd = approach(P.spd, tgtSp, th !== 0 ? 2.2 : 3.0, dt);

  const agility = 0.35 + Math.min(1, Math.abs(P.spd) / 70) * 0.65;
  const dAng = turn * turnSpd() * dt * agility;
  P.ang += dAng;

  /* крен корпуса на повороте (визуал) */
  P.rollV += (-turn * Math.min(1, Math.abs(P.spd) / 70) * 0.28 - P.roll) * 9 * dt;
  P.rollV *= Math.max(0, 1 - 4 * dt);
  P.roll += P.rollV * dt * 8;
  P.roll = clamp(P.roll, -0.3, 0.3);

  P.x += Math.cos(P.ang) * P.spd * dt;
  P.y += Math.sin(P.ang) * P.spd * dt;
  P.x = clamp(P.x, 12, WORLD.w - 12);
  P.y = clamp(P.y, 12, WORLD.h - 12);

  if (collideIslands(P, 9) && Math.abs(P.spd) > 50) {
    P.spd *= 0.32; damagePlayer(3); splashFx(P.x, P.y, 1.2);
  }

  /* ---- кильватер ---- */
  if (Math.abs(P.spd) > 20) {
    /* сам след рисует shipWake (vfx.js), здесь — только брызги из-под кормы */
    if (chance(0.65)) {
      const bx = P.x - Math.cos(P.ang) * 12, by = P.y - Math.sin(P.ang) * 12;
      addP({ x: bx + rr(-2, 2), y: by + rr(-2, 2), vx: rr(-6, 6), vy: rr(-6, 6),
             life: rr(0.4, 0.8), max: 0.8, size: rr(0.4, 1.2), col: 'rgba(220,245,248,0.8)', layer: 0 });
    }
  }

  /* ---- башня и огонь ---- */
  const ta = Math.atan2(mouseWY() - P.y, mouseWX() - P.x);
  P.turret += clamp(angDiff(P.turret, ta), -12 * dt, 12 * dt);
  P.cool -= dt; P.flash -= dt; P.fr = Math.max(0, P.fr - dt);
  P.recoil = Math.max(0, P.recoil - dt * 14);

  if ((mouse.down || keys['Space']) && P.cool <= 0) {
    P.cool = fireCd() * (buffOn('rapid') ? 0.5 : 1); P.flash = 0.06; P.recoil = 3;
    addShake(0.45);
    /* башня стоит на носу — снаряд вылетает из её ствола */
    const gx = P.x + Math.cos(P.ang) * PLAYER_GUN_OFF + Math.cos(P.turret) * 9;
    const gy = P.y + Math.sin(P.ang) * PLAYER_GUN_OFF + Math.sin(P.turret) * 9;
    const spread = rr(-0.012, 0.012);
    /* тройной залп — веер из трёх снарядов */
    for (const f of (buffOn('triple') ? [-0.13, 0, 0.13] : [0]))
      shells.push({ x: gx, y: gy,
                    vx: Math.cos(P.turret + spread + f) * 335, vy: Math.sin(P.turret + spread + f) * 335,
                    life: 0.85, from: 'p', dmg: shellDmg(), dead: false });
    muzzle(gx, gy, P.turret, 1);
    /* отдача сдвигает катер */
    P.x -= Math.cos(P.turret) * 0.5; P.y -= Math.sin(P.turret) * 0.5;
    SFX.shoot();
  }

  pointDefense(dt);
  tryLanding();
  updPiers(dt);
  updCrew(dt);

  /* дым от повреждений */
  if (P.hp < P.maxhp * 0.4 && chance(0.18))
    addP({ x: P.x + rr(-3, 3), y: P.y + rr(-4, 4), vx: rr(-5, 5), vy: rr(-12, -5),
           life: 1.1, max: 1.1, size: 2.5, col: '#4a545e', type: 'smoke' });
  if (P.hp < P.maxhp * 0.2 && chance(0.12))
    addP({ x: P.x + rr(-3, 3), y: P.y + rr(-3, 3), life: 0.3, max: 0.3, type: 'fire', size: 3 });

  /* ---- ремонт у авианосца ---- */
  const dc = dist(P.x, P.y, CARR.x, CARR.y);
  if (dc < 115 && P.hp < P.maxhp) {
    P.hp = Math.min(P.maxhp, P.hp + 9 * dt);
    P.repT -= dt;
    if (P.repT <= 0) {
      P.repT = 0.75; SFX.repair();
      addP({ x: P.x + rr(-6, 6), y: P.y - 10, vx: 0, vy: -16, life: 0.7, max: 0.7, size: 2, col: '#4ade80' });
    }
  }

  /* ---- посадка заложников ---- */
  let nearWait = false;
  for (const h of hostages) {
    if (h.state !== 'wait') continue;
    if (dist(P.x, P.y, h.x, h.y) < 32 && Math.abs(P.spd) < 55 && P.aboard < capacity()) {
      nearWait = true;
      h.board -= dt;
      if (h.board <= 0) {
        h.state = 'swim'; h.tx = P.x; h.ty = P.y; h.t = 0;
      }
    } else h.board = Math.max(h.board, 0.35);
  }
  if (nearWait && !hints.h) { hints.h = true; msg(T('mSlowDown'), '#7fd4e0', 3); }

  /* ---- эвакуация ---- */
  if (P.aboard > 0 && dc < 92) {
    const n = P.aboard; P.aboard = 0; rescued += n;
    reward(ECON.hostageEvac * n, CARR.x, CARR.y - 54, '#4ade80');
    msg(T('mEvacuated', n), '#4ade80', 3.5);
    for (let i = 0; i < 18; i++)
      addP({ x: CARR.x + rr(-16, 16), y: CARR.y + rr(-34, 34), vx: rr(-12, 12), vy: rr(-36, -12),
             g: 40, life: rr(0.6, 1.2), max: 1.2, size: 2, col: '#4ade80' });
    addLight(CARR.x, CARR.y, 80, '#4ade80', 0.5);
    SFX.evac();
  }
}
