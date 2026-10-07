'use strict';
/* ============================================================
   people.js — люди: процедурная фигура с живой анимацией.

   Вместо готовых кадров фигура собирается из частей каждый кадр
   (тень, ноги, торс, ранец, руки, голова), а позу задают синусы —
   так делают процедурную анимацию в играх, и она не «щёлкает»
   кадрами. Правила из разборов анимации персонажей сверху:
   • шаг: ноги и руки ходят в противофазе, корпус чуть проворачивается
     вслед за плечом, на «проносе» ноги тело приподнимается, на
     контакте — опускается (боб всего в долю единицы, иначе «луна»);
   • покой: дыхание (плечи чуть расширяются) и лёгкое раскачивание,
     у каждого человека своя фаза — толпа не двигается в ногу;
   • плавание кролем: руки по очереди выходят из воды вперёд,
     голова поворачивается на вдох, ноги взбивают пену;
   • стрельба: отдача толкает винтовку и плечо назад.
   Верх тела рисуется чуть выше ног (HUMAN_LIFT) — при взгляде
   сверху-наискосок это даёт фигуре рост.
   ============================================================ */

const HUMAN_SCALE = 1.25;                  /* фигура крупнее «натурального» ради читаемости */
const HUMAN_LIFT = 1.1 * HUMAN_SCALE;      /* на сколько верх тела выше ног на экране */

/* палитры: форма, её тень, снаряжение, ранец, каска, кожа */
const PPL = {
  marine: { cloth: '#6f9a4f', clothD: '#46663a', gear: '#4d4632', pack: '#3d4a2c', helm: '#5b7f45', helmD: '#3a5530', skin: '#e3b48a', boot: '#24221e' },
  ally:   { cloth: '#6f9ec0', clothD: '#3e6784', gear: '#3a4450', pack: '#2f4356', helm: '#5f8cb0', helmD: '#35587a', skin: '#e8bb8e', boot: '#1f2328' },
  civ:    { cloth: '#ff7f2a', clothD: '#c25a18', gear: '#f4f8fa', pack: '', helm: '', hair: '#3b2a1c', skin: '#eab98c', boot: '#2b2b30', vest: true },
  civ2:   { cloth: '#ff7f2a', clothD: '#c25a18', gear: '#f4f8fa', pack: '', helm: '', hair: '#c9a66b', skin: '#f0c7a0', boot: '#2b2b30', vest: true },
  pilot:  { cloth: '#7d8a5a', clothD: '#56603c', gear: '#ff7f2a', pack: '', helm: '#e8ecee', helmD: '#9aa6ad', skin: '#e3b48a', boot: '#24221e', vest: true }
};

const el = (x, y, rx, ry, col, rot) => {
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
};
function limb(x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

/* голова: каска с кромкой или волосы с лицом в сторону взгляда */
function humanHead(p, hx, hy, turn) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(turn);
  if (p.helm) {
    el(0, 0, 1.05, 1.0, p.helmD);
    el(-0.12, -0.08, 0.86, 0.82, p.helm);
    el(-0.35, -0.35, 0.3, 0.22, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-0.9, 0.55, 1.8, 0.18);   /* ремешок у затылка */
  } else {
    el(0, 0.08, 0.86, 0.9, p.hair);
    el(0, -0.42, 0.62, 0.42, p.skin);                /* лицо смотрит вперёд */
    el(-0.25, -0.1, 0.22, 0.3, 'rgba(255,255,255,0.18)');
  }
  ctx.restore();
}

/* ------------------------------------------------------------
   drawHuman(p, x, y, o)
   o.face  — куда смотрит корпус, o.aim — куда смотрят руки/оружие
   o.walk  — фаза шага, o.move — 0..1 насколько идёт
   o.mode  — 'stand' | 'swim' | 'wave' | 'raft'
   o.gun   — в руках винтовка, o.fire — >0 в момент выстрела
   o.seed  — своя фаза покоя
   ------------------------------------------------------------ */
function drawHuman(p, x, y, o) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(HUMAN_SCALE, HUMAN_SCALE);
  humanAt(p, 0, 0, o);
  ctx.restore();
}
function humanAt(p, x, y, o) {
  const face = o.face || 0, seed = o.seed || 0, t = tGlobal + seed * 7.3;
  const mode = o.mode || 'stand';
  if (mode === 'swim') return humanSwim(p, x, y, face, t);
  if (mode === 'raft') return humanRaft(p, x, y, t);

  const mv = clamp(o.move || 0, 0, 1);
  const ph = o.walk || 0;
  const sw = Math.sin(ph) * mv;                      /* размах шага −1..1 */
  const bob = (1 - Math.abs(Math.sin(ph))) * mv * 0.22;   /* «пронос» — вверх */
  const breathe = 1 + 0.035 * Math.sin(t * 2.3);
  const sway = Math.sin(t * 0.9) * 0.05 * (1 - mv);

  /* тень */
  el(x + 0.5, y + 0.7, 1.9, 1.15, 'rgba(0,0,0,0.28)', face);

  /* ноги: от бёдер к ботинкам, левая вперёд — правая назад */
  ctx.save(); ctx.translate(x, y); ctx.rotate(face + Math.PI / 2);
  const st = 1.35;
  for (const sg of [-1, 1]) {
    const fy = -sw * st * sg;                         /* вперёд = минус y */
    limb(sg * 0.62, 0.1, sg * 0.66, fy * 0.9, 0.95, p.clothD);
    el(sg * 0.66, fy - 0.15, 0.48, 0.72, p.boot);
  }
  ctx.restore();

  /* верх тела — выше ног на рост */
  const ux = x, uy = y - 1.1 - bob;
  ctx.save(); ctx.translate(ux, uy);
  /* с оружием корпус выше пояса разворачивается к цели целиком,
     а ноги идут по ходу — как стрельба на ходу у настоящих бойцов */
  const armed = o.gun && o.aim !== undefined;
  const upAng = armed ? o.aim : face;
  ctx.rotate(upAng + Math.PI / 2 + sw * 0.16 + sway);   /* плечи проворачиваются за шагом */

  /* ранец */
  if (p.pack) {
    ctx.fillStyle = p.pack; rrect(ctx, -1.05, 0.25, 2.1, 1.55, 0.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-0.9, 0.35, 1.8, 0.25);
  }
  /* торс с дыханием */
  ctx.save(); ctx.scale(breathe, 1);
  el(0, 0, 1.6, 1.08, p.clothD);
  el(-0.12, -0.06, 1.38, 0.9, p.cloth);
  el(-0.55, -0.25, 0.55, 0.38, 'rgba(255,255,255,0.18)');   /* блик от солнца */
  if (p.vest) {                                        /* спасжилет: светоотражающие полосы */
    ctx.fillStyle = 'rgba(244,248,250,0.85)';
    ctx.fillRect(-1.2, -0.12, 2.4, 0.22);
  } else {
    ctx.fillStyle = p.gear;                            /* разгрузка */
    ctx.fillRect(-0.95, -0.7, 0.35, 1.4); ctx.fillRect(0.6, -0.7, 0.35, 1.4);
    ctx.fillRect(-0.8, 0.3, 1.6, 0.4);
  }
  ctx.restore();

  const rel = (o.aim === undefined || armed) ? 0 : angDiff(face, o.aim);
  if (o.gun) {
    /* винтовка у плеча, ствол на цель */
    ctx.save();
    const r0 = o.fire > 0 ? 0.55 : 0;                 /* отдача */
    /* винтовка: приклад, коробка, ствол */
    ctx.fillStyle = '#4a3522'; ctx.fillRect(0.2, -0.2 + r0, 0.5, 1.2);
    ctx.fillStyle = '#1d2227'; ctx.fillRect(0.18, -2.4 + r0, 0.54, 2.3);
    ctx.fillStyle = '#15191d'; ctx.fillRect(0.3, -4.5 + r0, 0.3, 2.2);
    ctx.fillStyle = '#4a3522'; ctx.fillRect(0.2, -3.0 + r0, 0.5, 0.8);
    /* руки к цевью и рукояти */
    limb(-1.3, -0.1, 0.35, -2.7 + r0, 0.75, p.clothD);
    limb(1.3, -0.1, 0.55, -0.9 + r0, 0.75, p.clothD);
    el(0.35, -2.75 + r0, 0.36, 0.36, p.skin);
    el(0.6, -0.9 + r0, 0.36, 0.36, p.skin);
    ctx.restore();
  } else if (mode === 'wave') {
    /* машет: правая рука поднята и ходит из стороны в сторону */
    const w = Math.sin(t * 9) * 0.7;
    limb(1.3, -0.2, 2.2 + w * 0.3, -1.7 + Math.abs(w) * 0.3, 0.7, p.clothD);
    el(2.25 + w * 0.3, -1.8 + Math.abs(w) * 0.3, 0.4, 0.4, p.skin);
    limb(-1.3, -0.1, -1.45, 0.9, 0.7, p.clothD);
    el(-1.45, 1.0, 0.36, 0.36, p.skin);
  } else {
    /* руки качаются против ног */
    for (const sg of [-1, 1]) {
      const hy = sw * 1.0 * sg + 0.55 + Math.sin(t * 2.3) * 0.05;
      limb(sg * 1.3, -0.1, sg * 1.5, hy, 0.7, p.clothD);
      el(sg * 1.52, hy + 0.1, 0.36, 0.36, p.skin);
    }
  }
  /* голова поворачивается к цели больше, чем плечи */
  humanHead(p, 0, -0.2, clamp(rel, -1.4, 1.4) * 0.6);
  ctx.restore();
}

/* плывёт кролем: над водой голова, плечи и загребающие руки */
function humanSwim(p, x, y, face, t) {
  const s = t * 5.2;
  /* расходящиеся круги по воде */
  const k = (t * 0.9) % 1;
  ctx.strokeStyle = 'rgba(226,248,252,' + (0.45 * (1 - k)).toFixed(3) + ')';
  ctx.lineWidth = D * 2;
  ctx.beginPath(); ctx.ellipse(x, y, 2.2 + k * 3, (2.2 + k * 3) * 0.6, face, 0, TAU); ctx.stroke();
  ctx.save(); ctx.translate(x, y); ctx.rotate(face + Math.PI / 2);
  /* тело под водой — размыто и темнее */
  el(0, 1.4, 1.1, 2.3, 'rgba(20,40,50,0.35)');
  /* пена от ног */
  if (Math.sin(s * 2) > 0) { el(-0.5, 3.4, 0.5, 0.35, 'rgba(236,250,255,0.7)'); }
  else el(0.5, 3.2, 0.45, 0.32, 'rgba(236,250,255,0.6)');
  /* руки: одна над водой тянется вперёд, другая загребает под водой */
  for (const sg of [-1, 1]) {
    const a = s + (sg > 0 ? 0 : Math.PI);
    const up = Math.sin(a) > 0;
    const hy = -Math.cos(a) * 2.3;
    const col = up ? p.clothD : 'rgba(40,70,85,0.45)';
    limb(sg * 1.1, 0.2, sg * 1.3, hy, 0.7, col);
    el(sg * 1.3, hy, 0.36, 0.36, up ? p.skin : 'rgba(200,170,140,0.4)');
    if (up && Math.abs(Math.cos(a)) > 0.92) el(sg * 1.4, hy - 0.3, 0.6, 0.35, 'rgba(236,250,255,0.8)');   /* брызги */
  }
  /* плечи у самой воды */
  el(0, 0.3, 1.3, 0.75, p.clothD);
  /* голова: поворот на вдох */
  humanHead(p, Math.sin(s) * 0.35, -0.5, Math.sin(s) * 0.5);
  ctx.restore();
}

/* сидит в спасательном плоту и машет */
function humanRaft(p, x, y, t) {
  const by = y + Math.sin(t * 2.6) * 0.6;
  el(x + 0.6, by + 1, 4.2, 2.4, 'rgba(0,0,0,0.25)');
  el(x, by, 4, 2.6, '#c8501c');
  el(x, by - 0.2, 3.3, 2.0, '#ff7f2a');
  el(x, by, 2.4, 1.3, '#8a3510');                     /* днище внутри */
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const a of [0.6, 2.2, 3.8, 5.3]) ctx.fillRect(x + Math.cos(a) * 3.6 - 0.3, by + Math.sin(a) * 2.2 - 0.3, 0.6, 0.6);
  humanAt(p, x, by + 0.45, { face: -Math.PI / 2, mode: 'wave', seed: 3 });
}

/* ---------- совместимость со старым API бойцов ---------- */
const TROOP_K = 1;
const TROOP_MUZZLE = 4.6 * HUMAN_SCALE;   /* от груди до среза ствола, ед. мира */
const TROOP_MARINE = PPL.marine;
const TROOP_ALLY = PPL.ally;
/* боец: корпус по bodyAng, оружие по aimAng; a — { walk, move, fire, mode, seed } */
function drawTrooper(pal, x, y, bodyAng, aimAng, a) {
  a = a || {};
  drawHuman(pal, x, y, { face: bodyAng, aim: aimAng === undefined ? bodyAng : aimAng, gun: a.mode !== 'swim',
                         walk: a.walk, move: a.move, fire: a.fire, mode: a.mode, seed: a.seed });
}
