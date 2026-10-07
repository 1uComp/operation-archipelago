'use strict';
/* ============================================================
   projectiles.js — снаряды, навесной огонь, ракеты «Гарпун»,
                    вражеские ракеты и морские мины
   ============================================================ */

/* ---------- ракеты игрока ---------- */
function fireMissile() {
  if (!player || player.dead) return;
  if (upg.msl < 1) { msg(T('mNoLauncher'), '#e5484d', 2); return; }
  if (upg.ammo <= 0) { msg(T('mNoAmmo'), '#e5484d', 2); return; }
  if (mCool > 0) return;
  mCool = 0.5; upg.ammo--;
  const a = Math.atan2(mouseWY() - player.y, mouseWX() - player.x);
  missiles.push({ x: player.x, y: player.y, ang: a, spd: 120, life: 3.4, trail: 0 });
  addShake(1);
  muzzle(player.x + Math.cos(a) * 8, player.y + Math.sin(a) * 8, a, 1.2);
  SFX.rocket();
}

function nearestTarget(x, y, r) {
  let best = null, bd = r;
  for (const e of enemies) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  /* ракета наводится только на всплывшую лодку */
  for (const s of subs) if (subExposed(s)) { const d = dist(x, y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
  for (const p of planes) { const d = dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
  for (const s of structs) if (!s.dead && s.type !== 'crate') { const d = dist(x, y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
  if (boss && !boss.dead) { const d = dist(x, y, boss.x, boss.y); if (d < bd) { bd = d; best = boss; } }
  return best;
}

const mslDmg = k => k * (hasPerk('harp') ? 1.35 : 1);

function detMissile(m) {
  boom(m.x, m.y, 1.35);
  const R = 26;
  for (const e of enemies) if (dist(m.x, m.y, e.x, e.y) < R) { e.hp -= mslDmg(38); e.flash = 0.15; }
  for (const p of planes)  if (dist(m.x, m.y, p.x, p.y) < R) p.hp -= mslDmg(38);
  for (const s of structs) if (!s.dead && dist(m.x, m.y, s.x, s.y) < R) damageStruct(s, mslDmg(38));
  for (const mn of mines)  if (dist(m.x, m.y, mn.x, mn.y) < R) mn.hp -= 38;
  for (let k = subs.length - 1; k >= 0; k--) {
    const s = subs[k];
    if (dist(m.x, m.y, s.x, s.y) < R && damageSub(s, mslDmg(38)) && s.hp <= 0) killSub(s, k);
  }
  if (boss && !boss.dead && dist(m.x, m.y, boss.x, boss.y) < R + bossArt(boss.kind).r * 0.6) {
    boss.hp -= mslDmg(45); boss.flash = 0.14;
  }
}

function updMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    const t = nearestTarget(m.x, m.y, 340);
    if (t) {
      const ta = Math.atan2(t.y - m.y, t.x - m.x);
      m.ang += clamp(angDiff(m.ang, ta), -4.5 * dt, 4.5 * dt);
    }
    m.spd = Math.min(290, m.spd + 240 * dt);
    m.x += Math.cos(m.ang) * m.spd * dt;
    m.y += Math.sin(m.ang) * m.spd * dt;
    m.life -= dt;

    m.trail -= dt;
    if (m.trail <= 0) {
      m.trail = 0.02;
      addP({ x: m.x - Math.cos(m.ang) * 5, y: m.y - Math.sin(m.ang) * 5, vx: rr(-6, 6), vy: rr(-6, 6),
             life: 0.5, max: 0.5, size: 1.3, col: 'rgba(215,228,232,0.65)', type: 'smoke' });
      addLight(m.x, m.y, 14, '#ffb454', 0.08);
    }

    let dead = false;
    for (const e of enemies) if (dist(m.x, m.y, e.x, e.y) < 10) { dead = true; break; }
    if (!dead) for (const p of planes) if (dist(m.x, m.y, p.x, p.y) < 10) { dead = true; break; }
    if (!dead) for (const s of structs) if (!s.dead && dist(m.x, m.y, s.x, s.y) < s.r + 3) { dead = true; break; }
    if (!dead) for (const s of subs) if (subExposed(s) && dist(m.x, m.y, s.x, s.y) < 10) { dead = true; break; }
    if (!dead && boss && !boss.dead && dist(m.x, m.y, boss.x, boss.y) < bossArt(boss.kind).r) dead = true;
    if (!dead && !isWater(m.x, m.y)) dead = true;
    if (m.life <= 0) dead = true;

    if (dead) { detMissile(m); missiles.splice(i, 1); }
  }
}

/* ---------- вражеские ракеты (медленные, но упорные) ---------- */
function updEMissiles(dt) {
  const P = player;
  for (let i = eMissiles.length - 1; i >= 0; i--) {
    const m = eMissiles[i];
    if (m.dead) { boom(m.x, m.y, 0.7); eMissiles.splice(i, 1); continue; }
    if (!P.dead) {
      const ta = Math.atan2(P.y - m.y, P.x - m.x);
      m.ang += clamp(angDiff(m.ang, ta), -2.0 * dt, 2.0 * dt);
    }
    m.spd = Math.min(190, m.spd + 110 * dt);
    m.x += Math.cos(m.ang) * m.spd * dt;
    m.y += Math.sin(m.ang) * m.spd * dt;
    m.life -= dt;
    if (chance(0.8)) {
      addP({ x: m.x - Math.cos(m.ang) * 4, y: m.y - Math.sin(m.ang) * 4, vx: rr(-5, 5), vy: rr(-5, 5),
             life: 0.45, max: 0.45, size: 1.3, col: 'rgba(230,190,180,0.55)', type: 'smoke' });
      addLight(m.x, m.y, 12, '#ff6b3d', 0.07);
    }
    let dead = m.life <= 0;
    if (!dead && !P.dead && dist(m.x, m.y, P.x, P.y) < 10) { damagePlayer(m.dmg); dead = true; }
    if (!dead && transport && !transport.dead && !transport.done &&
        dist(m.x, m.y, transport.x, transport.y) < CONVOY.r) { damageTransport(m.dmg); dead = true; }
    if (!dead && !isWater(m.x, m.y)) dead = true;
    if (dead) { boom(m.x, m.y, 1.0); eMissiles.splice(i, 1); }
  }
}

/* ---------- снаряды ---------- */
function updShells(dt) {
  const P = player;
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    if (s.dead) { addP({ x: s.x, y: s.y, life: 0.18, max: 0.18, type: 'ring', r: 5, col: '#9fe8ff' }); shells.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let dead = false;

    if (s.from === 'p') {
      for (const e of enemies) if (dist(s.x, s.y, e.x, e.y) < 6 + e.T.r) {
        e.hp -= s.dmg; e.flash = 0.15; dead = true;
        for (let k = 0; k < 4; k++)
          addP({ x: s.x, y: s.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#ffd94a' });
        sndAt(s.x, s.y); SFX.clang(); break;
      }
      if (!dead) for (let k = subs.length - 1; k >= 0; k--) {
        const sb = subs[k];
        if (dist(s.x, s.y, sb.x, sb.y) < 6 + SUB.r) {
          if (damageSub(sb, s.dmg)) {
            dead = true;
            for (let q = 0; q < 4; q++)
              addP({ x: s.x, y: s.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#9fe8ff' });
            sndAt(s.x, s.y); SFX.clang();
            if (sb.hp <= 0) killSub(sb, k);
          }
          break;
        }
      }
      if (!dead && boss && !boss.dead && dist(s.x, s.y, boss.x, boss.y) < bossArt(boss.kind).r) {
        boss.hp -= s.dmg; boss.flash = 0.12; dead = true;
        for (let k = 0; k < 5; k++)
          addP({ x: s.x, y: s.y, vx: rr(-50, 50), vy: rr(-50, 50), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#ffd94a' });
        sndAt(s.x, s.y); SFX.clang();
      }
      if (!dead) for (const st of structs) if (!st.dead && dist(s.x, s.y, st.x, st.y) < st.r + 3) {
        damageStruct(st, s.dmg); dead = true;
        for (let k = 0; k < 4; k++)
          addP({ x: s.x, y: s.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#ffb454' });
        break;
      }
      if (!dead) for (const p of planes) if (dist(s.x, s.y, p.x, p.y) < 8) {
        p.hp -= s.dmg; dead = true;
        addP({ x: s.x, y: s.y, life: 0.25, max: 0.25, type: 'ring', r: 6, col: '#f4f8fa' });
        sndAt(s.x, s.y); SFX.hit(); break;
      }
      if (!dead) for (const mn of mines) if (dist(s.x, s.y, mn.x, mn.y) < 7) { mn.hp -= s.dmg; dead = true; sndAt(s.x, s.y); SFX.clang(); break; }
    } else if (!P.dead && dist(s.x, s.y, P.x, P.y) < 8) {
      damagePlayer(s.dmg); dead = true;
    } else if (transport && !transport.dead && !transport.done &&
               dist(s.x, s.y, transport.x, transport.y) < CONVOY.r) {
      damageTransport(s.dmg * 1.1); dead = true;
    }

    if (!dead && s.life <= 0) {
      dead = true;
      if (isWater(s.x, s.y)) splashFx(s.x, s.y, 0.7);
      else boom(s.x, s.y, s.from === 'p' ? 0.4 : 0.6);
    }
    if (dead) shells.splice(i, 1);
  }
}

/* ---------- навесной огонь (миномёт / бомбы) ---------- */
function updArcs(dt) {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i];
    a.t += dt / a.dur;
    if (a.t >= 1) {
      boom(a.x1, a.y1, a.from === 'bomb' ? 1.6 : 1.05);
      if (!player.dead && dist(a.x1, a.y1, player.x, player.y) < a.rad) damagePlayer(a.dmg);
      if (transport && !transport.dead && dist(a.x1, a.y1, transport.x, transport.y) < a.rad + 8)
        damageTransport(a.dmg);
      for (const e of enemies) if (dist(a.x1, a.y1, e.x, e.y) < a.rad * 0.6) { e.hp -= a.dmg * 0.4; e.flash = 0.12; }
      arcs.splice(i, 1);
    }
  }
}

/* ---------- морские мины ---------- */
function updMines(dt) {
  const P = player;
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.ph += dt;
    let det = false;
    if (m.hp <= 0) det = true;
    if (!P.dead && dist(m.x, m.y, P.x, P.y) < 12) { det = true; damagePlayer(26); }
    if (!det && transport && !transport.dead && dist(m.x, m.y, transport.x, transport.y) < CONVOY.r) {
      det = true; damageTransport(60);
    }
    if (!det) for (const e of enemies) if (dist(m.x, m.y, e.x, e.y) < 12) { det = true; e.hp -= 40; e.flash = 0.15; break; }
    if (det) {
      boom(m.x, m.y, 1.5);
      splashFx(m.x, m.y, 1.6);
      if (m.hp <= 0) { reward(ECON.mine, m.x, m.y - 8, '#7fd4e0'); kills.mines++; }
      mines.splice(i, 1);
    }
  }
}
