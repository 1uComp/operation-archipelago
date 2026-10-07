'use strict';
/* ============================================================
   scene.js — отрисовка игрового мира.

   Весь код рисует в единицах разметки (480x270); базовое
   преобразование ctx растягивает их в SC раз. Константа D = 1/SC —
   размер одного физического пикселя, ею задаются тонкие детали.
   ============================================================ */

let waveOff = 0;

/* переход в мировые координаты с учётом зума камеры */
function beginWorld() {
  ctx.save();
  if (cam.z !== 1) ctx.scale(cam.z, cam.z);
  ctx.translate(-ox, -oy);
}
function endWorld() { ctx.restore(); }
const sX = wx => (wx - ox) * cam.z;
const sY = wy => (wy - oy) * cam.z;

/* ---------- вода ---------- */
function drawWater(dt) {
  const z = cam.z, vw = VW / z, vh = VH / z;

  /* карта глубин — мягкое растяжение из низкого разрешения */
  const K = 6;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(seaDepth, ox / K, oy / K, vw / K, vh / K, 0, 0, VW, VH);
  ctx.imageSmoothingEnabled = false;

  /* два слоя ряби, выводятся пиксель-в-пиксель */
  const S = 192;
  ctx.save();
  ctx.scale(D, D);                                   /* -> система физических пикселей */
  for (let layer = 0; layer < 2; layer++) {
    if (!seaTex[layer]) continue;
    const spd = layer ? 0.5 : 1.0;
    const px = ox * SC * z + waveOff * SC * spd;
    const py = oy * SC * z + waveOff * SC * spd * 0.35;
    const offx = -(((px % S) + S) % S), offy = -(((py % S) + S) % S);
    ctx.save();
    ctx.translate(offx, offy);
    ctx.globalAlpha = layer ? 0.8 : 0.95;
    ctx.fillStyle = ctx.createPattern(seaTex[layer], 'repeat');
    ctx.fillRect(0, 0, PW + S, PH + S);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* блики на гребнях */
  const tt = Math.floor(tGlobal * 2);
  for (let i = 0; i < 260; i++) {
    const s = i * 127.3 + tt * 311.7;
    const x = h1(s) * VW, y = h1(s + 13.7) * VH;
    const a = 0.5 * (0.5 + 0.5 * Math.sin(tGlobal * 3 + h1(s + 5) * TAU));
    if (a > 0.26) {
      ctx.fillStyle = 'rgba(190,240,245,' + (a * 0.55).toFixed(2) + ')';
      ctx.fillRect(x, y, D * 3, D);
    }
  }
}

/* острова — каждый своим холстом по ограничивающей рамке */
function islVisible(isl) {
  const vw = VW / cam.z, vh = VH / cam.z;
  const x = isl.x + isl.bx, y = isl.y + isl.by;
  return !(x + isl.bw < ox || x > ox + vw || y + isl.bh < oy || y > oy + vh);
}
function drawIslands() {
  for (const isl of islands) {
    if (!isl.cv || !islVisible(isl)) continue;
    ctx.drawImage(isl.cv, isl.x + isl.bx, isl.y + isl.by, isl.bw, isl.bh);
  }
}

/* прибой вокруг островов */
function drawSurf() {
  const N = 96;
  for (const isl of islands) {
    if (!islVisible(isl)) continue;
    for (let ring = 0; ring < 3; ring++) {
      const ph = tGlobal * (2.2 + ring * 0.8);
      const al = [0.46, 0.26, 0.14][ring];
      for (let i = 0; i < N; i++) {
        const w = 0.5 + 0.5 * Math.sin(ph + i * 0.42 + ring);
        if (w < 0.35) continue;
        const a = i / N * TAU;
        const r = radiusAt(isl, a) + 1.2 + ring * 2.6 + Math.sin(ph + i * 0.8) * 1.4;
        ctx.fillStyle = 'rgba(232,251,253,' + (al * w).toFixed(3) + ')';
        ctx.fillRect(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r, D * 2, D * 2);
      }
    }
  }
}

/* кильватерные следы */
function drawWakes() {
  for (const w of wakes) {
    const t = w.life / w.max, a = t * 0.5 * w.w;
    if (a <= 0.02) continue;
    const spread = (1 - t) * 9 * w.w + 1.5;
    const cx = Math.cos(w.ang + Math.PI / 2), sy = Math.sin(w.ang + Math.PI / 2);
    const sz = D * 3;
    ctx.fillStyle = 'rgba(226,248,252,' + a.toFixed(3) + ')';
    ctx.fillRect(w.x + cx * spread - sz / 2, w.y + sy * spread - sz / 2, sz, sz);
    ctx.fillRect(w.x - cx * spread - sz / 2, w.y - sy * spread - sz / 2, sz, sz);
    ctx.fillStyle = 'rgba(226,248,252,' + (a * 0.45).toFixed(3) + ')';
    ctx.fillRect(w.x - sz / 2, w.y - sz / 2, sz * (2 - t), sz);
  }
}

/* лучи маяков: рисуются после затемнения, поэтому реально режут ночь */
function drawBeams() {
  if (!curCfg.lights) return;
  let any = false;
  for (const s of structs) if (s.type === 'light' && !s.dead) { any = true; break; }
  if (!any) return;
  beginWorld();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of structs) {
    if (s.type !== 'light' || s.dead) continue;
    const gr = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, s.range);
    gr.addColorStop(0, 'rgba(255,238,180,0.34)');
    gr.addColorStop(0.55, 'rgba(255,224,150,0.13)');
    gr.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(s.x, s.y);
    ctx.arc(s.x, s.y, s.range, s.rad - s.arc / 2, s.rad + s.arc / 2);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  endWorld();
}

/* мягкое цветное пятно прямо на сцене */
function addLightSoft(x, y, r, col) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- строения ---------- */
function drawStruct(s) {
  const jx = s.shakeT > 0 ? rr(-0.8, 0.8) : 0, jy = s.shakeT > 0 ? rr(-0.8, 0.8) : 0;
  const x = s.x + jx, y = s.y + jy - ((s.isl && s.isl.lift) || 0);

  if (s.dead) {
    if (s.type === 'crate') return;
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(x - 7, y + 3, 15, 3);
    ctx.fillStyle = '#20282f'; ctx.fillRect(x - 6, y - 4, 12, 9);
    for (const r of (s.rub || [])) {
      ctx.fillStyle = r[4] ? '#57636c' : '#3d474f';
      ctx.fillRect(x + r[0], y + r[1], r[2], r[3]);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + r[0], y + r[1], r[2], D * 2);
    }
    if (s.rub && s.rub.length && Math.floor(tGlobal * 4 + s.seed) % 2) {
      ctx.fillStyle = '#ff6b3d';
      ctx.fillRect(x + s.rub[0][0], y + s.rub[0][1], D * 3, D * 3);
    }
    return;
  }

  const P = player;

  /* тени высоких построек ложатся вправо-вниз */
  if (s.type === 'tower') drawCastShadow(sprTower, x, y + 3, 17);
  else if (s.type === 'light') drawCastShadow(sprLighthouse, x, y + 3, 24);
  else if (s.type === 'base') drawCastShadow(sprBase, x, y + 6, 16, 0.8);
  else if (s.type === 'bunker') drawCastShadow(sprBunker, x, y + 4, 11, 0.6);

  if (s.type === 'crate') {
    blit(sprCrate, x - 5, y - 4.5);
  } else if (s.type === 'tower') {
    blit(sprTower, x - 7.5, y - 14);
    ctx.strokeStyle = '#cfe8f0'; ctx.lineWidth = D * 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(s.rad) * 5, y - 12 - Math.sin(s.rad) * 2.2);
    ctx.lineTo(x + Math.cos(s.rad) * 5, y - 12 + Math.sin(s.rad) * 2.2);
    ctx.stroke();
    ctx.fillStyle = Math.floor(tGlobal * 3) % 2 ? '#7fd4e0' : '#20505c';
    ctx.fillRect(x - D, y - 16, D * 2, D * 2);
  } else if (s.type === 'light') {
    blit(sprLighthouse, x - 6.5, y - 21);
    /* фонарь пульсирует и подсвечивает галерею */
    const k = 0.6 + 0.4 * Math.sin(tGlobal * 4 + s.seed);
    ctx.fillStyle = 'rgba(255,238,170,' + k.toFixed(2) + ')';
    ctx.fillRect(x - 1.6, y - 18.6, 3.2, 2);
    addLightSoft(x, y - 18, 13, 'rgba(255,226,150,' + (0.22 * k).toFixed(2) + ')');
  } else if (s.type === 'bunker') {
    blit(sprBunker, x - 7.5, y - 7);
    const a = Math.atan2(P.y - y, P.x - x);
    ctx.save(); ctx.translate(x, y - 1.5); ctx.rotate(a);
    ctx.fillStyle = '#151b20'; ctx.fillRect(1.5, -0.5, 4.5, 1);
    ctx.fillStyle = '#39454e'; ctx.fillRect(1.5, -0.5, 4.5, D);
    ctx.restore();
  } else {
    blit(sprBase, x - 13, y - 10);
    ctx.strokeStyle = '#dfe8ec'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.moveTo(x + 7, y + 1);
    ctx.lineTo(x + 7 + Math.cos(s.rad) * 4, y + 1 + Math.sin(s.rad) * 2); ctx.stroke();
    ctx.fillStyle = '#8b9aa5'; ctx.fillRect(x - 9.5, y - 11, D * 2, 5);
    const blink = Math.floor(tGlobal * 3) % 2;
    ctx.fillStyle = blink ? '#e5484d' : '#5a1418';
    ctx.fillRect(x - 10.5, y - 12.5, 2.4, 1.8);
    if (blink) addLightSoft(x - 9.5, y - 12, 7, 'rgba(229,72,77,0.22)');
    const a = Math.atan2(P.y - y, P.x - x);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#2a3138'; ctx.fillRect(4, -0.8, 7, 1.6);
    ctx.fillStyle = '#4a555e'; ctx.fillRect(4, -0.8, 7, D);
    ctx.restore();
  }

  if (s.flash > 0) {
    const a = Math.atan2(P.y - y, P.x - x);
    ctx.fillStyle = 'rgba(255,225,140,0.95)';
    ctx.fillRect(x + Math.cos(a) * 8 - 1, y + Math.sin(a) * 8 - 1, 2, 2);
  }
  if (s.hp < s.max && s.type !== 'crate') {
    const w = s.type === 'base' ? 22 : 13;
    const oy2 = s.type === 'base' ? 15 : 11;
    ctx.fillStyle = 'rgba(6,16,24,0.85)';
    ctx.fillRect(x - w / 2 - 0.5, y - oy2 - 0.5, w + 1, 2.5);
    ctx.fillStyle = s.hp / s.max > 0.5 ? '#e5484d' : '#ff9166';
    ctx.fillRect(x - w / 2, y - oy2, w * s.hp / s.max, 1.5);
  }
}

/* ---------- заложники ---------- */
function drawHostage(h) {
  if (h.state === 'aboard') return;
  const pal = h.wave > 0.5 ? PPL.civ : PPL.civ2;
  if (h.state === 'swim') {
    drawHuman(pal, h.x, h.y, { face: player ? Math.atan2(player.y - h.y, player.x - h.x) : 0,
                               mode: 'swim', seed: h.wave });
    return;
  }
  /* стоит у кромки лицом к морю и машет — зовёт на помощь, с передышками */
  const out = h.isl ? Math.atan2(h.y - h.isl.y, h.x - h.isl.x) : 0;
  const waving = Math.sin(tGlobal * 0.9 + h.wave * 9) > -0.3;
  drawHuman(pal, h.x, h.y, { face: out, mode: waving ? 'wave' : 'stand', seed: h.wave });
  if (h.state === 'wait' && Math.floor(tGlobal * 2) % 2) {
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(h.x - 0.45, h.y - 9.5, 0.9, 3);
    ctx.fillRect(h.x - 0.45, h.y - 5.8, 0.9, 0.9);
  }
}

/* ---------- корабли ---------- */
/* высота борта корабля: у спрайта своя, иначе — по размеру корпуса */
const shipH = (e, spr) => spr._h || (e.T ? 0.8 + e.T.r * 0.2 : 2.2);

function drawShipSpr(e, spr, roll) {
  const bob = Math.sin(tGlobal * 2.2 + e.x * 0.05) * 0.35;
  let H = shipH(e, spr), ang = e.ang + Math.PI / 2, al = 1;
  if (e === player && player.dead) {
    /* тонет: борт уходит под воду, корпус гаснет */
    const k = clamp(player.sink / 2.6, 0, 1);
    H *= 1 - k; al = 1 - k; ang += player.sinkRot;
  }
  if (!(e === player && player.dead)) shipWake(e, e.T ? e.T.r : 11, e.T ? e.T.r * 0.45 : 3.2);
  bowWave(e, H);
  drawStack(spr, e.x, e.y + bob, ang, H, roll, al);
  /* раненый враг показывает прочность — видно, кого добивать */
  if (e !== player && e.hp < e.max && e.hp > 0 && e.max)
    hpBar(e.x, e.y - H - (e.T ? e.T.r : 8) - 5, e.T && e.T.tough ? 20 : 14, e.hp / e.max);
  if (e !== player && e.flash > 0) {
    ctx.globalAlpha = Math.min(1, e.flash * 6);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(e.x, e.y - H, (e.T ? e.T.r : 8) + 1, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBoss() {
  if (!boss) return;
  const B = boss;
  const art = bossArt(B.kind), spr = art.spr();
  const BH = 5;                                  /* высокий борт флагмана */
  shipWake(B, art.len * 0.42, 7);
  const bob = Math.sin(tGlobal * 1.4) * 0.5 - BH;
  drawStack(spr, B.x, B.y + bob + BH, B.ang + Math.PI / 2, BH, 0);

  /* башни живут отдельно: целятся в игрока и откатываются при выстреле */
  const tw = sprBossTurret.width / SC * art.tScale, th = sprBossTurret.height / SC * art.tScale;
  for (let i = 0; i < art.turrets.length; i++) {
    const off = art.turrets[i] * art.len;
    const tx = B.x - Math.cos(B.ang) * off;
    const ty = B.y - Math.sin(B.ang) * off + bob;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate((B.tur ? B.tur[i] : B.ang) + Math.PI / 2);
    ctx.translate(0, B.turRec ? B.turRec[i] : 0);
    ctx.drawImage(sprBossTurret, -tw / 2, -th * 0.72, tw, th);
    ctx.restore();
  }
  if (B.flash > 0) {
    ctx.globalAlpha = Math.min(1, B.flash * 6);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(B.x, B.y - BH, art.r * 0.8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- главная отрисовка сцены ---------- */
function drawScene(dt) {
  waveOff += (dt || 0) * 9;
  vfxPerf();
  if (dt) updGulls(dt);

  const sh = shake;
  const shx = (Math.random() * 2 - 1) * sh + shakeAx * sh * 0.4;
  const shy = (Math.random() * 2 - 1) * sh + shakeAy * sh * 0.4;
  const vw = VW / cam.z, vh = VH / cam.z;
  ox = clamp(cam.x - vw / 2 - shx, 0, Math.max(0, WORLD.w - vw));
  oy = clamp(cam.y - vh / 2 - shy, 0, Math.max(0, WORLD.h - vh));
  /* привязка к физическим пикселям, чтобы спрайты не «дышали» */
  ox = Math.round(ox * SC) / SC;
  oy = Math.round(oy * SC) / SC;

  ctx.fillStyle = curCfg.sea.deep || '#0d3a55';
  ctx.fillRect(0, 0, VW, VH);
  drawWater(dt);
  drawSunGlint();

  beginWorld();
  drawIslands();
  drawSurf();
  drawWakes();
  drawPickups();

  /* мины */
  for (const m of mines) {
    const by = m.y + Math.sin(m.ph * 1.6) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(m.x, by + 4, 5, 2, 0, 0, TAU); ctx.fill();
    blitC(sprMine, m.x, by);
    if (Math.floor(tGlobal * 2 + m.ph) % 2) {
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(m.x - 0.6, by - 0.6, 1.2, 1.2);
    }
  }

  for (const s of structs) drawStruct(s);
  for (const h of hostages) drawHostage(h);
  drawMarines();
  drawSquad();
  drawPiers();

  /* авианосец */
  /* авианосец — самый высокий борт в игре */
  drawStack(sprCarrier, CARR.x, CARR.y, 0, 5, 0);
  if (Math.floor(tGlobal * 2) % 2) {
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(CARR.x + 10.6, CARR.y - 25, 1.6, 1.6);
  }
  if (player && player.aboard > 0) {
    ctx.strokeStyle = 'rgba(74,222,128,' + (0.25 + 0.2 * Math.sin(tGlobal * 4)).toFixed(2) + ')';
    ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(CARR.x, CARR.y, 92, 0, TAU); ctx.stroke();
  }

  drawConvoyRoute();
  drawTransport();

  /* пена под кораблями */
  for (const p of parts) if (p.layer === 0) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  drawTorps();
  drawSubs();

  for (const e of enemies) drawShipSpr(e, SHIP_SPR[e.type], e.roll);
  drawBoss();
  drawEvents();                /* асы, баржи, контейнер, лётчик, щит */

  if (player && !(player.dead && player.sink > 2.6)) {
    drawShipSpr(player, sprPlayer, player.roll);
    if (!player.dead) {
      const rec = player.recoil * 0.5, PH0 = sprPlayer._h;
      /* носовая башня: круглая броня, спаренный ствол с дульным тормозом */
      ctx.save();
      ctx.translate(player.x + Math.cos(player.ang) * PLAYER_GUN_OFF,
                    player.y + Math.sin(player.ang) * PLAYER_GUN_OFF - PH0);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(0.5, 0.7, 2.6, 0, TAU); ctx.fill();
      ctx.rotate(player.turret);
      ctx.fillStyle = '#161d22';
      ctx.fillRect(1.2 - rec, -1.05, 7.4, 0.8); ctx.fillRect(1.2 - rec, 0.25, 7.4, 0.8);
      ctx.fillStyle = '#5b6c76';
      ctx.fillRect(1.2 - rec, -1.05, 7.4, 0.3); ctx.fillRect(1.2 - rec, 0.25, 7.4, 0.3);
      ctx.fillStyle = '#20282e'; ctx.fillRect(8 - rec, -1.3, 1.2, 2.6);
      const tg = ctx.createRadialGradient(-0.8, -0.8, 0.2, 0, 0, 2.6);
      tg.addColorStop(0, '#e6eef2'); tg.addColorStop(1, '#6b7d88');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1b242a'; ctx.lineWidth = D * 2; ctx.stroke();
      ctx.fillStyle = '#39474f'; ctx.fillRect(-1.6, -0.6, 1.4, 1.2);
      if (player.flash > 0) {
        ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(10.2 - rec, 0, 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd94a'; ctx.fillRect(9 - rec, -1.1, 4.5, 2.2);
      }
      ctx.restore();
      ctx.save(); ctx.translate(0, -PH0);
      drawCrew();
      ctx.restore();
    }
  }

  drawCharges();
  drawTornados();

  /* навесные снаряды */
  for (const a of arcs) {
    const t = Math.min(1, a.t), x = lerp(a.x0, a.x1, t), y = lerp(a.y0, a.y1, t);
    const hgt = Math.sin(Math.PI * t) * (a.from === 'bomb' ? 28 : 19);
    ctx.fillStyle = 'rgba(10,20,28,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, 1.6, 0.9, 0, 0, TAU); ctx.fill();
    if (t > 0.5) {
      const k = (t - 0.5) / 0.5;
      ctx.strokeStyle = 'rgba(229,72,77,' + (0.2 + 0.55 * k).toFixed(2) + ')';
      ctx.lineWidth = D * 2;
      ctx.beginPath(); ctx.arc(a.x1, a.y1, a.rad * (1 - k * 0.55), 0, TAU); ctx.stroke();
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(a.x1, a.y1, a.rad, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = a.from === 'bomb' ? '#2b343b' : '#3a2b20';
    ctx.fillRect(x - 0.8, y - hgt - 2, 1.6, 3.2);
    ctx.fillStyle = '#6d7a83'; ctx.fillRect(x - 0.8, y - hgt - 2, 1.6, D * 2);
    if (a.from === 'bomb') { ctx.fillStyle = '#4d5a63'; ctx.fillRect(x - 1.8, y - hgt + 0.8, 3.6, 0.8); }
  }

  /* трассеры: мягкое свечение под снарядами */
  if (FXQ && shells.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of shells) glowAt(s.x, s.y, 4.5, s.from === 'p' ? GLOW.tracer : GLOW.etracer, 0.55);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  /* снаряды */
  for (const s of shells) {
    const own = s.from === 'p';
    ctx.strokeStyle = own ? 'rgba(255,233,163,0.45)' : 'rgba(255,107,94,0.45)';
    ctx.lineWidth = D * 2;
    ctx.beginPath();
    ctx.moveTo(s.x - s.vx * 0.024, s.y - s.vy * 0.024);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.fillStyle = own ? '#ffb454' : '#c8392f';
    ctx.fillRect(s.x - 0.8, s.y - 0.8, 1.6, 1.6);
    ctx.fillStyle = own ? '#fff6d6' : '#ff9a8a';
    ctx.fillRect(s.x - 0.4, s.y - 0.4, 0.8, 0.8);
  }

  /* ракеты */
  for (const m of missiles) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.ang);
    ctx.fillStyle = Math.floor(tGlobal * 20) % 2 ? '#ffd08a' : '#ff6b3d';
    ctx.fillRect(-7.5, -0.9, 4, 1.8);
    ctx.fillStyle = '#dfe8ec'; ctx.fillRect(-3.5, -0.9, 6.5, 1.8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.5, -0.9, 6.5, D);
    ctx.fillStyle = '#e5484d'; ctx.fillRect(3, -0.9, 2.2, 1.8);
    ctx.fillStyle = '#9aa8b0'; ctx.fillRect(-2.5, -1.8, 1.4, 3.6);
    ctx.restore();
  }
  for (const m of eMissiles) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.ang);
    ctx.fillStyle = Math.floor(tGlobal * 20) % 2 ? '#ff9166' : '#e5484d';
    ctx.fillRect(-6.5, -0.8, 3.2, 1.6);
    ctx.fillStyle = '#b9a9a4'; ctx.fillRect(-3.2, -0.8, 5.2, 1.6);
    ctx.fillStyle = '#7a6a64'; ctx.fillRect(-2.2, -1.6, 1.2, 3.2);
    ctx.restore();
  }

  /* самолёты */
  for (const p of planes) {
    const spr = p.heavy ? sprPlaneH : sprPlane;
    const alt = p.heavy ? 16 : 13;
    ctx.globalAlpha = 0.22;
    ctx.save(); ctx.translate(p.x + alt * SUN.x, p.y + alt * SUN.y); ctx.rotate(p.ang + Math.PI / 2);
    ctx.scale(0.85, 0.85);
    ctx.drawImage(shadowOf(spr), -spr.width / (2 * SC), -spr.height / (2 * SC), spr.width / SC, spr.height / SC);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang + Math.PI / 2);
    ctx.drawImage(spr, -spr.width / (2 * SC), -spr.height / (2 * SC), spr.width / SC, spr.height / SC);
    ctx.restore();
  }

  drawGulls();

  /* верхние частицы */
  for (const p of parts) if (p.layer === 1) {
    const al = Math.max(0, p.life / p.max);
    if ((p.type === 'glow' || p.type === 'column') && drawPartX(p, al)) continue;
    if (p.type === 'ring') {
      ctx.globalAlpha = al; ctx.strokeStyle = p.col; ctx.lineWidth = D * 2 + (1 - al);
      ctx.beginPath(); ctx.arc(p.x, p.y, (1 - al) * p.r + 2, 0, TAU); ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.globalAlpha = al; ctx.fillStyle = '#fff7d6';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * al + 2, 0, TAU); ctx.fill();
    } else if (p.type === 'fire') {
      ctx.globalAlpha = al * 0.9;
      ctx.fillStyle = al > 0.6 ? '#fff2c0' : al > 0.3 ? '#ffb454' : '#e5484d';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + al * 0.8), 0, TAU); ctx.fill();
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = al * 0.5; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.7 - al * 0.7), 0, TAU); ctx.fill();
    } else if (p.type === 'debris') {
      ctx.globalAlpha = al;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    } else if (p.type === 'flare') {
      ctx.globalAlpha = al;
      ctx.fillStyle = Math.floor(tGlobal * 20) % 2 ? '#fff2c0' : '#ff8b3d';
      ctx.fillRect(p.x - 0.7, p.y - 0.7, 1.4, 1.4);
    } else {
      ctx.globalAlpha = al; ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;

  drawSmokes();

  /* всплывающие числа */
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, f.life / 0.5);
    txt(f.txt, f.x, f.y, f.col, 8, 'center');
  }
  ctx.globalAlpha = 1;

  endWorld();

  /* псевдо-3D: тени облаков, облака выше камеры, наклон взгляда */
  drawCloudShadows();
  drawClouds();
  drawTilt();

  /* атмосфера */
  drawHaze();
  drawFog();
  drawRain();
  drawLighting();
  drawBeams();
  drawPost();                  /* цветокоррекция и виньетка */

  if (flashScreen > 0) {
    ctx.fillStyle = 'rgba(255,244,220,' + Math.min(0.38, flashScreen).toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}
