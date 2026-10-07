'use strict';
/* ============================================================
   hazards.js — смерчи.

   В ливень над водой встают водяные смерчи. Они не разбирают своих
   и чужих: тянут к себе всё, что рядом, рвут обшивку вражеских
   кораблей и катера игрока одинаково. Обходить их — часть манёвра.
   ============================================================ */

const TORN_R = 46;          /* радиус притяжения */
const TORN_KILL = 17;       /* внутри этого радиуса рвёт корпус */
let tornT = 0, tornWarnT = 0;

function maxTornados() { return Math.min(3, 1 + (curCfg.cycle || 0)); }

function spawnTornado() {
  for (let t = 0; t < 40; t++) {
    const x = rr(120, WORLD.w - 120), y = rr(120, WORLD.h - 120);
    if (!isWater(x, y)) continue;
    if (player && dist(x, y, player.x, player.y) < 300) continue;
    if (dist(x, y, CARR.x, CARR.y) < 340) continue;
    const wind = (curCfg.weather && curCfg.weather.wind) || 0;
    tornados.push({
      x, y,
      ang: Math.atan2(rr(-0.6, 0.6), wind >= 0 ? 1 : -1),
      spd: rr(26, 44), life: rr(26, 46), age: 0,
      phase: rr(0, TAU), wob: rr(0, TAU), grow: 0
    });
    return true;
  }
  return false;
}

function updTornados(dt) {
  if (!curCfg.tornado) return;

  tornT -= dt;
  if (tornT <= 0) {
    tornT = rr(12, 22);
    if (tornados.length < maxTornados()) spawnTornado();
  }
  tornWarnT -= dt;

  for (let i = tornados.length - 1; i >= 0; i--) {
    const T2 = tornados[i];
    T2.age += dt; T2.life -= dt;
    T2.phase += dt * 5.5;
    T2.wob += dt * 0.7;
    /* рождается и умирает плавно, чтобы не бить внезапно */
    T2.grow = Math.min(1, Math.min(T2.age / 2.2, Math.max(0, T2.life / 2.2)));

    /* блуждающий дрейф с поправкой на ветер */
    T2.ang += Math.sin(T2.wob) * 0.5 * dt;
    T2.x += Math.cos(T2.ang) * T2.spd * dt;
    T2.y += Math.sin(T2.ang) * T2.spd * dt;
    if (T2.x < 80 || T2.x > WORLD.w - 80) { T2.ang = Math.PI - T2.ang; T2.x = clamp(T2.x, 80, WORLD.w - 80); }
    if (T2.y < 80 || T2.y > WORLD.h - 80) { T2.ang = -T2.ang; T2.y = clamp(T2.y, 80, WORLD.h - 80); }

    const R = TORN_R * T2.grow, KILL = TORN_KILL * T2.grow;

    /* брызги и мусор в воронке */
    for (let k = 0; k < 3; k++) {
      const a = rr(0, TAU), d = rr(6, R);
      addP({ x: T2.x + Math.cos(a) * d, y: T2.y + Math.sin(a) * d,
             vx: Math.cos(a + 1.9) * d * 2.2, vy: Math.sin(a + 1.9) * d * 2.2,
             drag: 1.4, life: rr(0.25, 0.6), max: 0.6, size: rr(0.4, 1.3),
             col: chance(0.6) ? 'rgba(220,245,250,0.75)' : 'rgba(150,200,215,0.6)' });
    }

    /* засасывает и рвёт всё живое */
    const suck = (o, rad, pull) => {
      const dx = T2.x - o.x, dy = T2.y - o.y, d = Math.hypot(dx, dy);
      if (d > R + rad || d < 0.01) return 0;
      const f = (1 - d / (R + rad)) * pull * dt;
      o.x += dx / d * f;
      o.y += dy / d * f;
      /* закрутка по касательной — объект уходит по спирали */
      o.x += -dy / d * f * 0.85;
      o.y += dx / d * f * 0.85;
      return d;
    };

    if (player && !player.dead) {
      const d = suck(player, 9, 120);
      if (d && d < KILL + 9) {
        damagePlayer(24 * dt);
        addShake(1.4 * dt * 60, T2.x, T2.y);
      }
      if (d && d < R + 60 && tornWarnT <= 0) {
        tornWarnT = 8;
        msg(T('mTornadoNear'), '#7fd4e0', 2);
      }
    }
    for (let e = enemies.length - 1; e >= 0; e--) {
      const en = enemies[e];
      const d = suck(en, en.T.r, 150);
      if (d && d < KILL + en.T.r) {
        en.hp -= 70 * dt; en.flash = 0.1;
        if (en.hp <= 0) killEnemy(en, e);
      }
    }
    if (boss && !boss.dead) suck(boss, 24, 26);
    for (let m = mines.length - 1; m >= 0; m--) {
      const mn = mines[m];
      const d = suck(mn, 6, 130);
      if (d && d < KILL) { boom(mn.x, mn.y, 1.4); splashFx(mn.x, mn.y, 1.4); mines.splice(m, 1); }
    }
    for (const p of pickups) suck(p, 4, 90);

    if (T2.life <= 0) {
      splashFx(T2.x, T2.y, 2.2);
      tornados.splice(i, 1);
    }
  }
}

/* воронка сверху: несколько закрученных колец плюс пенное основание */
function drawTornados() {
  for (const T2 of tornados) {
    const R = TORN_R * T2.grow;
    /* пенный круг у основания */
    ctx.fillStyle = 'rgba(226,248,252,0.16)';
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.92, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(226,248,252,0.30)'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.92, 0, TAU); ctx.stroke();

    /* спираль: дуги разного радиуса, каждая повёрнута сильнее */
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const r = R * (0.85 - t * 0.72);
      const a0 = T2.phase * (1 + t * 1.8) + i * 1.1;
      ctx.strokeStyle = 'rgba(214,238,246,' + (0.18 + t * 0.42).toFixed(3) + ')';
      ctx.lineWidth = D * (2 + t * 3);
      ctx.beginPath();
      ctx.arc(T2.x + Math.cos(a0) * r * 0.18, T2.y + Math.sin(a0) * r * 0.18,
              r, a0, a0 + 4.2);
      ctx.stroke();
    }
    /* тёмное жерло */
    ctx.fillStyle = 'rgba(12,30,42,0.55)';
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,252,255,0.85)';
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.07, 0, TAU); ctx.fill();
  }
}
