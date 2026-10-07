'use strict';
/* ============================================================
   pickups.js — плавающие контейнеры: ремонт и боезапас
   ============================================================ */

function updPickups(dt) {
  const P = player;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    /* мигают перед исчезновением */
    if (p.life <= 0) { pickups.splice(i, 1); continue; }
    if (!P.dead && dist(p.x, p.y, P.x, P.y) < (p.type === 'coin' || p.type === 'buff' ? 16 : 14)) {
      if (p.type === 'buff') giveBuff(p.kind, p.x, p.y);
      else if (p.type === 'coin') reward(45, p.x, p.y - 8, '#ffd94a');
      else if (p.type === 'repair') {
        P.hp = Math.min(P.maxhp, P.hp + 20);
        addFloat(p.x, p.y - 8, T('fRepair'), '#4ade80');
      } else {
        upg.ammo += 3;
        addFloat(p.x, p.y - 8, T('fRockets', 3), '#7fd4e0');
      }
      addP({ x: p.x, y: p.y, life: 0.3, max: 0.3, type: 'ring', r: 12, col: '#4ade80' });
      SFX.pickup();
      evPicked(p);
      pickups.splice(i, 1);
    }
  }
}

function drawPickups() {
  for (const p of pickups) {
    const by = p.y + Math.sin(tGlobal * 3 + p.ph) * 1.6;
    if (p.life < 5 && Math.floor(p.life * 6) % 2) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x - 3, by + 3, 7, 2);
    if (p.type === 'buff') { drawBuffPickup(p, by); continue; }
    if (p.type === 'coin') { drawCoin(p, by); continue; }
    if (p.type === 'repair') {
      ctx.fillStyle = '#ff8b3d'; ctx.fillRect(p.x - 3, by - 3, 7, 7);
      ctx.fillStyle = '#f4f8fa'; ctx.fillRect(p.x - 0.5, by - 2, 2, 5); ctx.fillRect(p.x - 2, by - 0.5, 5, 2);
    } else {
      ctx.fillStyle = '#2f6b7a'; ctx.fillRect(p.x - 3, by - 3, 7, 7);
      ctx.fillStyle = '#7fd4e0'; ctx.fillRect(p.x - 2, by - 2, 2, 5);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(p.x + 1, by - 2, 2, 2);
    }
  }
}
