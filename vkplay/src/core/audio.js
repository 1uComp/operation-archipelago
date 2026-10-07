'use strict';
/* ============================================================
   audio.js — звук и музыка, целиком синтезом (WebAudio, без файлов).

   Звуки собраны по принципу «процедурного аудио»: каждый — это
   процесс из физически осмысленных слоёв, а не одна волна.
   • Выстрел пушки: щелчок затвора, хлопок дульных газов (розовый шум
     в полосе), низкий удар и хвост эха над водой.
   • Взрыв: треск фронта, «тело» из коричневого шума с закрывающимся
     фильтром, суб-удар, потрескивание обломков и шлепки воды.
   • Металл: неровные (негармоничные) обертоны, как у настоящей
     стальной пластины — 1 : 2.76 : 5.40 : 8.93.
   • Брызги: полосовой шум плюс «пузыри» — короткие синусы с
     восходящим тоном.
   Фон живёт постоянно: накатывающее море (розовый шум с медленными
   волнами громкости и фильтра), ветер, дождь, мотор катера, тон
   которого идёт за скоростью.
   Звуки мира объёмные: панорама по положению и затухание с
   расстоянием, дальние глуше (воздух съедает верха).
   Музыка генеративная: аккорды, бас, арпеджио, барабаны и медь
   включаются слоями по накалу боя.
   ============================================================ */

let AC = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null, muted = false;
let convolver = null, verbIn = null, ambGain = null, musicBus = null, comp = null;
let pinkBuf = null, brownBuf = null;

/* ---------- буферы шума ---------- */
function makeNoise(kind, sec) {
  const n = (AC.sampleRate * sec) | 0, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  if (kind === 'white') { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  else if (kind === 'pink') {
    /* фильтр Пола Келлета: розовый шум, «мягче» белого — как прибой */
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else {
    /* коричневый: интеграл белого — гул, рокот, взрывы */
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }
  return b;
}

/* импульс «открытого моря»: без стен — мягкое редкое эхо и длинный хвост */
function makeVerb(sec) {
  const n = (AC.sampleRate * sec) | 0, b = AC.createBuffer(2, n, AC.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - t * 0.42);   /* хвост темнеет со временем */
      d[i] = lp * Math.pow(1 - t, 2.2) * (i < AC.sampleRate * 0.012 ? i / (AC.sampleRate * 0.012) : 1);
    }
    /* пара отражений от воды */
    for (const [dt, a] of [[0.043, 0.5], [0.097, 0.32], [0.161, 0.2]]) {
      const k = (AC.sampleRate * (dt + c * 0.007)) | 0;
      if (k < n) d[k] += a;
    }
  }
  return b;
}

function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    /* мастер-шина: мягкий компрессор склеивает микс и не даёт клиппинга */
    comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    comp.connect(AC.destination);
    master = AC.createGain(); master.gain.value = SETTINGS.volume; master.connect(comp);

    sfxGain   = AC.createGain(); sfxGain.gain.value = 1.0;   sfxGain.connect(master);
    musicGain = AC.createGain(); musicGain.gain.value = 0.85; musicGain.connect(master);
    musicBus  = AC.createGain(); musicBus.gain.value = 0.5;  musicBus.connect(musicGain);
    ambGain   = AC.createGain(); ambGain.gain.value = 0.9;   ambGain.connect(master);

    noiseBuf = makeNoise('white', 2);
    pinkBuf  = makeNoise('pink', 4);
    brownBuf = makeNoise('brown', 4);

    convolver = AC.createConvolver(); convolver.buffer = makeVerb(2.6);
    verbIn = AC.createGain(); verbIn.gain.value = 1; verbIn.connect(convolver);
    const wet = AC.createGain(); wet.gain.value = 0.34;
    convolver.connect(wet); wet.connect(master);

    startAmbience();
    mNext = AC.currentTime + 0.2;
    applySettings();          /* громкость и «музыка вкл/выкл» из настроек */
  } catch (e) { /* звука не будет — не страшно */ }
}

/* ---------- кирпичики ---------- */
const now = () => AC.currentTime;
let voices = 0;
const VOICE_MAX = 56;

/* огибающая: атака, затем экспоненциальный спад к нулю */
function env(g, t0, vol, att, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(att + 0.005, dur));
}
function track(src, t1) {
  voices++;
  src.onended = () => { voices--; };
  src.stop(t1);
}

/* тон: тип, частота от f0 к f1, выход и посыл в реверберацию */
function osc(type, f0, f1, t0, dur, vol, out, verb, att) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  env(g, t0, vol, att || 0.003, dur);
  o.connect(g); g.connect(out || sfxGain);
  if (verb) { const s = AC.createGain(); s.gain.value = verb; g.connect(s); s.connect(verbIn); }
  o.start(t0); track(o, t0 + dur + 0.05);
  return o;
}
/* шум через фильтр с разворотом частоты */
function nz(buf, ftype, f0, f1, q, t0, dur, vol, out, verb, att) {
  const s = AC.createBufferSource(); s.buffer = buf; s.loop = true;
  s.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = AC.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  const g = AC.createGain();
  env(g, t0, vol, att || 0.002, dur);
  s.connect(f); f.connect(g); g.connect(out || sfxGain);
  if (verb) { const v = AC.createGain(); v.gain.value = verb; g.connect(v); v.connect(verbIn); }
  s.start(t0, Math.random() * 1.5); track(s, t0 + dur + 0.05);
}
/* удар по металлу: негармоничные моды пластины */
function metal(f, t0, vol, decay, out, verb) {
  const R = [1, 2.76, 5.40, 8.93], A = [1, 0.6, 0.35, 0.2];
  for (let i = 0; i < R.length; i++)
    osc('sine', f * R[i], f * R[i] * 0.995, t0, decay / (1 + i * 0.6), vol * A[i], out, verb, 0.001);
}
/* пузыри: короткие синусы с восходящим тоном */
function bubbles(n, t0, spread, vol, out) {
  for (let i = 0; i < n; i++) {
    const f = 380 + Math.random() * 700, d = 0.03 + Math.random() * 0.05;
    osc('sine', f, f * (1.7 + Math.random()), t0 + Math.random() * spread, d, vol * (0.5 + Math.random() * 0.5), out);
  }
}
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- объёмный звук ---------- */
/* sndAt(x, y) перед вызовом SFX — звук прозвучит из этой точки мира */
let SPOS = null;
function sndAt(x, y) { SPOS = { x, y }; }

/* выход для одного звука; null — слишком далеко, не играем */
function out(vol) {
  const p = SPOS; SPOS = null;
  if (!p) return { node: sfxGain, k: 1, verb: 1 };
  const L = (player && state === 'play' && !player.dead) ? player : cam;
  const dx = p.x - L.x, dy = p.y - L.y, d = Math.hypot(dx, dy);
  const k = 1 / (1 + (d / 240) * (d / 240));
  if (k < 0.035) return null;
  const g = AC.createGain(); g.gain.value = k;
  /* воздух гасит верха: дальний выстрел — глухой хлопок */
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = clamp(18000 / (1 + d / 90), 900, 18000);
  g.connect(lp);
  let tail = lp;
  if (AC.createStereoPanner) {
    const pn = AC.createStereoPanner(); pn.pan.value = clamp(dx / 280, -0.85, 0.85);
    lp.connect(pn); tail = pn;
  }
  tail.connect(sfxGain);
  return { node: g, k, verb: 1 + (1 - k) * 1.5 };   /* вдали больше эха */
}

/* ограничитель частоты: один и тот же звук не чаще раза в gap секунд */
const lastPlay = {};
function ok(name, gap) {
  if (!AC || muted || AC.state !== 'running') return false;
  if (voices > VOICE_MAX) { SPOS = null; return false; }
  const t = now();
  if (lastPlay[name] && t - lastPlay[name] < gap) { SPOS = null; return false; }
  lastPlay[name] = t;
  return true;
}

/* ---------- эффекты ---------- */
const SFX = {
  /* орудие катера: затвор, хлопок газов, удар, эхо */
  shoot() {
    if (!ok('shoot', 0.03)) return;
    const o = out(); if (!o) return;
    const t = now(), r = rnd(0.92, 1.08);
    nz(noiseBuf, 'highpass', 3200, 2400, 0.7, t, 0.025, 0.32, o.node);
    nz(pinkBuf, 'bandpass', 1100 * r, 260, 0.9, t, 0.17, 0.75, o.node, 0.22 * o.verb);
    osc('sine', 150 * r, 44, t, 0.16, 0.55, o.node);
    nz(brownBuf, 'lowpass', 700, 110, 0.7, t + 0.01, 0.45, 0.22, o.node, 0.35 * o.verb, 0.01);
    osc('triangle', 2600, 2100, t + 0.07, 0.018, 0.05, o.node);
  },
  /* вражеское орудие — тот же рецепт, ниже и тяжелее */
  eshoot() {
    if (!ok('eshoot', 0.04)) return;
    const o = out(); if (!o) return;
    const t = now(), r = rnd(0.85, 1.0);
    nz(pinkBuf, 'bandpass', 800 * r, 200, 0.9, t, 0.2, 0.6 * o.k + 0.1, o.node, 0.3 * o.verb);
    osc('sine', 110 * r, 36, t, 0.2, 0.5, o.node);
    nz(brownBuf, 'lowpass', 500, 90, 0.7, t + 0.01, 0.55, 0.25, o.node, 0.45 * o.verb, 0.01);
  },
  /* пулемёт катера: три коротких щелчка */
  mg() {
    if (!ok('mg', 0.05)) return;
    const o = out(); if (!o) return;
    const t = now();
    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.055 + rnd(0, 0.01);
      nz(noiseBuf, 'bandpass', 2200, 900, 1.1, ti, 0.035, 0.32, o.node, 0.12 * o.verb);
      osc('sine', 190, 90, ti, 0.03, 0.18, o.node);
    }
  },
  /* взрыв: треск фронта, тело, суб-удар, треск обломков, вода */
  boom(p = 1) {
    if (!ok('boom', 0.035)) return;
    const o = out(); if (!o) return;
    const t = now();
    nz(noiseBuf, 'lowpass', 7000, 1400, 0.5, t, 0.06, 0.45 * p, o.node);
    nz(brownBuf, 'lowpass', 1500, 80, 0.8, t, 0.9 * p + 0.2, 0.95 * p, o.node, 0.55 * o.verb, 0.004);
    osc('sine', 72, 26, t, 0.55 * p + 0.1, 0.7 * p, o.node);
    for (let i = 0; i < 7; i++)
      nz(noiseBuf, 'highpass', 3000, 2500, 0.6, t + rnd(0.05, 0.55), 0.012, 0.09 * p, o.node);
    nz(pinkBuf, 'bandpass', 900, 500, 1.2, t + 0.25, 0.5, 0.12 * p, o.node, 0.3, 0.05);
  },
  /* большой взрыв: двойной удар и долгий раскатистый гул */
  bigboom() {
    if (!ok('bigboom', 0.2)) return;
    const o = out(); if (!o) return;
    const t = now();
    nz(noiseBuf, 'lowpass', 8000, 1200, 0.5, t, 0.09, 0.6, o.node);
    nz(brownBuf, 'lowpass', 1200, 50, 0.8, t, 2.2, 1.1, o.node, 0.7 * o.verb, 0.006);
    osc('sine', 60, 22, t, 1.3, 0.85, o.node);
    osc('sine', 48, 20, t + 0.22, 1.1, 0.5, o.node);
    nz(brownBuf, 'lowpass', 260, 60, 0.7, t + 0.3, 2.6, 0.5, o.node, 0.8, 0.3);
    for (let i = 0; i < 14; i++)
      nz(noiseBuf, 'highpass', 2600, 2000, 0.6, t + rnd(0.1, 1.2), 0.015, 0.08, o.node);
  },
  /* всплеск: шум в полосе и пузыри */
  splash() {
    if (!ok('splash', 0.05)) return;
    const o = out(); if (!o) return;
    const t = now();
    nz(pinkBuf, 'bandpass', 1500, 420, 1.0, t, 0.32, 0.9, o.node, 0.15);
    nz(noiseBuf, 'highpass', 4000, 3000, 0.5, t, 0.12, 0.08, o.node);
    bubbles(4, t + 0.05, 0.25, 0.09, o.node);
  },
  /* попадание по нам: глухой удар по корпусу и звон листа */
  hit() {
    if (!ok('hit', 0.06)) return;
    const o = out(); if (!o) return;
    const t = now();
    nz(brownBuf, 'lowpass', 900, 150, 0.8, t, 0.14, 0.6, o.node);
    metal(rnd(260, 340), t, 0.13, 0.35, o.node, 0.2);
  },
  /* наш снаряд попал в сталь */
  clang() {
    if (!ok('clang', 0.045)) return;
    const o = out(); if (!o) return;
    const t = now();
    nz(noiseBuf, 'bandpass', 2600, 1500, 1.4, t, 0.04, 0.22, o.node);
    metal(rnd(520, 760), t, 0.15, 0.22, o.node, 0.15 * o.verb);
  },
  /* подбор: две ноты «маримбы» */
  pickup() {
    if (!ok('pickup', 0.05)) return;
    const t = now();
    for (const [f, d] of [[784, 0], [1175, 0.075]]) {
      osc('sine', f, f, t + d, 0.28, 0.13, sfxGain, 0.2);
      osc('sine', f * 4, f * 4, t + d, 0.05, 0.03, sfxGain);
    }
  },
  /* корабельный ревун: два гудка */
  alarm() {
    if (!ok('alarm', 0.3)) return;
    const t = now();
    for (const d of [0, 0.34]) {
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 1.6;
      bp.connect(sfxGain);
      osc('sawtooth', 440, 425, t + d, 0.26, 0.09, bp, 0.2, 0.02);
      osc('sawtooth', 443.5, 428, t + d, 0.26, 0.09, bp, 0, 0.02);
      osc('square', 220, 212, t + d, 0.26, 0.04, bp, 0, 0.02);
    }
  },
  /* эвакуация: короткая медная фанфара, мажор */
  evac() {
    if (!ok('evac', 0.2)) return;
    const t = now();
    [392, 494, 587, 784].forEach((f, i) => brass(f, t + i * 0.1, 0.5 - i * 0.05, 0.045, sfxGain));
  },
  repair() {
    if (!ok('repair', 0.15)) return;
    const t = now();
    osc('sine', 880, 880, t, 0.3, 0.08, sfxGain, 0.3);
    osc('sine', 1320, 1320, t + 0.05, 0.3, 0.06, sfxGain, 0.3);
  },
  /* ракета: зажигание и нарастающий свист */
  rocket() {
    if (!ok('rocket', 0.06)) return;
    const o = out(); if (!o) return;
    const t = now();
    nz(noiseBuf, 'highpass', 2500, 2000, 0.6, t, 0.04, 0.3, o.node);
    nz(noiseBuf, 'bandpass', 700, 3200, 1.4, t, 0.75, 0.32, o.node, 0.25 * o.verb, 0.04);
    nz(brownBuf, 'lowpass', 400, 200, 0.7, t, 0.6, 0.3, o.node, 0, 0.02);
  },
  /* монеты: два звонких удара */
  buy() {
    if (!ok('buy', 0.05)) return;
    const t = now();
    metal(1900, t, 0.08, 0.25, sfxGain, 0.1);
    metal(2350, t + 0.07, 0.07, 0.3, sfxGain, 0.1);
  },
  /* гибель: скрип рвущегося металла, гул и пузыри */
  sink() {
    if (!ok('sink', 0.5)) return;
    const t = now();
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.setValueAtTime(420, t); bp.frequency.linearRampToValueAtTime(180, t + 1.6);
    bp.connect(sfxGain);
    const o1 = osc('sawtooth', 72, 48, t, 1.7, 0.35, bp, 0.4, 0.05);
    const lfo = AC.createOscillator(), lg = AC.createGain();
    lfo.frequency.value = 3.2; lg.gain.value = 9; lfo.connect(lg); lg.connect(o1.frequency);
    lfo.start(t); lfo.stop(t + 1.8);
    nz(brownBuf, 'lowpass', 500, 60, 0.7, t, 2.2, 0.6, sfxGain, 0.6, 0.05);
    bubbles(22, t + 0.3, 2.0, 0.06, sfxGain);
  },
  /* интерфейс: мягкий щелчок */
  ui() {
    if (!ok('ui', 0.03)) return;
    const t = now();
    osc('sine', 1350, 950, t, 0.04, 0.16, sfxGain);
    nz(noiseBuf, 'highpass', 5000, 5000, 0.7, t, 0.012, 0.07, sfxGain);
  },
  move() {
    if (!ok('move', 0.02)) return;
    osc('sine', 1900, 1700, now(), 0.025, 0.09, sfxGain);
  },
  /* форсаж: вой турбины */
  boost() {
    if (!ok('boost', 0.3)) return;
    const t = now();
    nz(noiseBuf, 'bandpass', 350, 2400, 3, t, 0.6, 0.3, sfxGain, 0, 0.08);
    osc('sawtooth', 90, 190, t, 0.55, 0.06, sfxGain, 0, 0.08);
  },
  /* гром: треск разряда и перекатывающийся рокот */
  thunder() {
    if (!ok('thunder', 1)) return;
    const t = now() + 0.12;
    nz(noiseBuf, 'highpass', 1800, 900, 0.6, t, 0.16, 0.22, sfxGain, 0.6);
    const g = AC.createGain(); g.gain.value = 1; g.connect(sfxGain);
    const s = AC.createBufferSource(); s.buffer = brownBuf; s.loop = true;
    const f = AC.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(60, t + 3.4);
    const a = AC.createGain(); a.gain.setValueAtTime(0.0001, t);
    /* несколько «перекатов» разной силы */
    let tt = t;
    for (let i = 0; i < 6; i++) {
      tt += rnd(0.2, 0.6);
      a.gain.linearRampToValueAtTime(rnd(0.3, 0.8) * (1 - i / 7), tt);
    }
    a.gain.exponentialRampToValueAtTime(0.0001, tt + 1.2);
    s.connect(f); f.connect(a); a.connect(g);
    const v = AC.createGain(); v.gain.value = 0.8; a.connect(v); v.connect(verbIn);
    s.start(t); track(s, tt + 1.3);
  },
  /* серия: колокольчик вверх по пентатонике */
  combo(n) {
    if (!ok('combo', 0.04)) return;
    const P = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
    const f = P[Math.min(P.length - 1, Math.max(0, n - 2))], t = now();
    osc('sine', f, f, t, 0.35, 0.16, sfxGain, 0.3);
    osc('sine', f * 2.01, f * 2.01, t, 0.15, 0.06, sfxGain);
  },
  /* флагман: низкий корабельный гудок трижды */
  bossAlarm() {
    if (!ok('bossAlarm', 1)) return;
    const t = now();
    for (const d of [0, 0.75, 1.5]) {
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.connect(sfxGain);
      osc('sawtooth', 98, 94, t + d, 0.6, 0.16, lp, 0.4, 0.06);
      osc('sawtooth', 98.6, 94.5, t + d, 0.6, 0.16, lp, 0, 0.06);
      osc('sawtooth', 49, 47, t + d, 0.6, 0.1, lp, 0, 0.06);
    }
  },
  /* мина: звенящий эхолот */
  mine() {
    if (!ok('mine', 0.4)) return;
    osc('sine', 1320, 1290, now(), 1.1, 0.11, sfxGain, 0.9);
  },
  /* ПВО: короткая очередь-трещотка */
  pd() {
    if (!ok('pd', 0.12)) return;
    const t = now();
    for (let i = 0; i < 5; i++) nz(noiseBuf, 'highpass', 2800, 2200, 0.8, t + i * 0.022, 0.018, 0.12, sfxGain);
  }
};

/* медь: две расстроенные пилы, фильтр раскрывается — «вдох» трубы */
function brass(f, t0, dur, vol, dest, verb) {
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(f * 1.2, t0);
  lp.frequency.linearRampToValueAtTime(f * 5, t0 + 0.08);
  lp.frequency.exponentialRampToValueAtTime(f * 2, t0 + dur);
  lp.connect(dest);
  osc('sawtooth', f, f, t0, dur, vol, lp, verb === undefined ? 0.3 : verb, 0.04);
  osc('sawtooth', f * 1.004, f * 1.004, t0, dur, vol, lp, 0, 0.05);
}

/* ============================================================
   ФОН: море, ветер, дождь, мотор
   ============================================================ */
const AMB = {};
function loopSrc(buf, ftype, f, q, vol, dest) {
  const s = AC.createBufferSource(); s.buffer = buf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = ftype; fl.frequency.value = f; fl.Q.value = q;
  const g = AC.createGain(); g.gain.value = vol;
  s.connect(fl); fl.connect(g); g.connect(dest || ambGain);
  s.start(0, Math.random() * 2);
  return { s, f: fl, g };
}
function startAmbience() {
  /* море: розовый шум в басах + пена в верхах, обе дышат волнами */
  AMB.sea  = loopSrc(pinkBuf, 'lowpass', 500, 0.6, 0.0);
  AMB.foam = loopSrc(noiseBuf, 'highpass', 3500, 0.5, 0.0);
  /* ветер: полосовой шум, частота бродит */
  AMB.wind = loopSrc(pinkBuf, 'bandpass', 420, 3.5, 0.0);
  /* дождь */
  AMB.rain = loopSrc(noiseBuf, 'bandpass', 5200, 0.35, 0.0);
  /* мотор катера: пила + квадрат октавой ниже через фильтр, плюс шум воды у борта */
  const eg = AC.createGain(); eg.gain.value = 0; eg.connect(ambGain);
  const ef = AC.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 260; ef.Q.value = 2.5; ef.connect(eg);
  const o1 = AC.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 36; o1.connect(ef);
  const o2 = AC.createOscillator(); o2.type = 'square'; o2.frequency.value = 18;
  const o2g = AC.createGain(); o2g.gain.value = 0.5; o2.connect(o2g); o2g.connect(ef);
  /* «чух-чух» цилиндров: модуляция громкости */
  const am = AC.createOscillator(); am.frequency.value = 9;
  const amg = AC.createGain(); amg.gain.value = 0; am.connect(amg); amg.connect(eg.gain);
  o1.start(); o2.start(); am.start();
  AMB.eng = { g: eg, f: ef, o1, o2, am, amg };
  AMB.hull = loopSrc(brownBuf, 'bandpass', 380, 1.2, 0.0);
  /* турбина форсажа */
  const tw = AC.createOscillator(); tw.type = 'sine'; tw.frequency.value = 900;
  const twg = AC.createGain(); twg.gain.value = 0; tw.connect(twg); twg.connect(ambGain); tw.start();
  AMB.turb = { o: tw, g: twg };
  AMB.swellT = 0; AMB.windF = 420; AMB.dropT = 0;
}

const smooth = (param, v, tc) => param.setTargetAtTime(v, AC.currentTime, tc || 0.25);

/* обновление фона — 20 раз в секунду, без участия игрового цикла */
function ambTick() {
  if (!AC || !AMB.sea) return;
  const t = now();
  const inGame = state === 'play' || state === 'dying' || state === 'pause' || state === 'levelclear' ||
                 state === 'over' || state === 'win';
  const menu = !inGame;
  const W = (typeof WEA !== 'undefined' && WEA) || {};

  /* море: накат волны каждые 4–8 с — громкость и фильтр поднимаются и спадают */
  if (t > AMB.swellT) {
    const dur = rnd(4, 8), peak = rnd(0.55, 1);
    AMB.swellT = t + dur;
    const base = menu ? 0.10 : 0.16;
    for (const [n, k, f0, f1] of [['sea', 1, 320, 900], ['foam', 0.35, 3000, 5200]]) {
      const a = AMB[n];
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(a.g.gain.value, t);
      a.g.gain.linearRampToValueAtTime(base * k * (0.5 + peak), t + dur * 0.42);
      a.g.gain.linearRampToValueAtTime(base * k * 0.45, t + dur);
      a.f.frequency.cancelScheduledValues(t);
      a.f.frequency.setValueAtTime(a.f.frequency.value, t);
      a.f.frequency.linearRampToValueAtTime(f1 * (0.7 + peak * 0.3), t + dur * 0.45);
      a.f.frequency.linearRampToValueAtTime(f0, t + dur);
    }
  }
  /* ветер: сильнее в шторм и в дождь */
  const windK = Math.min(1, Math.abs(W.wind || 0) * 1.3 + (W.rain || 0) * 0.5 + 0.12);
  AMB.windF += (rnd(-1, 1) * 60 - (AMB.windF - 450) * 0.05);
  smooth(AMB.wind.f.frequency, clamp(AMB.windF, 220, 900), 0.6);
  smooth(AMB.wind.g.gain, (menu ? 0.5 : 1) * windK * 0.11, 0.8);
  /* дождь и отдельные капли */
  const rain = W.rain || 0;
  smooth(AMB.rain.g.gain, rain * (menu ? 0.03 : 0.07), 0.8);
  if (rain > 0 && t > AMB.dropT && !muted) {
    AMB.dropT = t + rnd(0.02, 0.12) / rain;
    osc('sine', rnd(2500, 4200), rnd(1800, 2400), t, 0.012, 0.012 * rain, ambGain);
  }

  /* мотор: тон и громкость идут за скоростью, форсаж добавляет вой */
  const P = player;
  const run = state === 'play' && P && !P.dead;
  const sp = run ? Math.min(1.6, Math.abs(P.spd) / 95) : 0;
  const boostK = run && P.boosting ? 1 : 0;
  smooth(AMB.eng.o1.frequency, 34 + sp * 30 + boostK * 16, 0.3);
  smooth(AMB.eng.o2.frequency, (34 + sp * 30 + boostK * 16) / 2, 0.3);
  smooth(AMB.eng.am.frequency, 7 + sp * 9, 0.3);
  smooth(AMB.eng.f.frequency, 200 + sp * 260 + boostK * 300, 0.3);
  const eVol = run ? 0.018 + sp * 0.026 : 0;
  smooth(AMB.eng.g.gain, eVol, 0.35);
  smooth(AMB.eng.amg.gain, eVol * 0.35, 0.35);      /* глубина «чуханья» — от громкости мотора */
  smooth(AMB.hull.g.gain, run ? sp * 0.055 : 0, 0.4);
  smooth(AMB.hull.f.frequency, 300 + sp * 420, 0.4);
  smooth(AMB.turb.o.frequency, 700 + sp * 500, 0.3);
  smooth(AMB.turb.g.gain, boostK * 0.012, 0.2);
}

/* ============================================================
   МУЗЫКА: генеративная, слоями по накалу
   ============================================================ */
/* лады и последовательности аккордов (ступени натурального минора) */
const SCALE_MIN = [0, 2, 3, 5, 7, 8, 10];
const PROGS = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 5, 3, 4], [5, 6, 0, 0]];
const ROOTS = [50, 53, 48, 52, 55];           /* D, F, C, E, G — тон зависит от темы уровня */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

let mStep = 0, mNext = 0, mBar = 0, mProg = PROGS[0], mInt = 0, mMode = 'menu', mLastState = '';
let mDelay = null;

function degree(root, deg, oct) {
  const n = SCALE_MIN.length;
  const o = Math.floor(deg / n), d = ((deg % n) + n) % n;
  return root + SCALE_MIN[d] + 12 * (o + (oct || 0));
}
function chordNotes(root, deg) { return [degree(root, deg), degree(root, deg + 2), degree(root, deg + 4)]; }

/* эхо для арпеджио — пространство без лишних голосов */
function mEcho() {
  if (mDelay) return mDelay;
  const d = AC.createDelay(1); d.delayTime.value = 0.36;
  const fb = AC.createGain(); fb.gain.value = 0.32;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(musicBus);
  const inp = AC.createGain(); inp.gain.value = 1; inp.connect(d); inp.connect(musicBus);
  return (mDelay = inp);
}

/* струнный пэд: три ноты, по две расстроенные пилы, мягкий фильтр */
function pad(notes, t0, dur, vol, bright) {
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
  lp.frequency.value = 700 + bright * 1500;
  lp.connect(musicBus);
  const v = AC.createGain(); v.gain.value = 0.55; lp.connect(v); v.connect(verbIn);
  for (const m of notes) for (const det of [-7, 7]) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det + rnd(-2, 2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.9, dur * 0.3));
    g.gain.setValueAtTime(vol, t0 + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.9);
    o.connect(g); g.connect(lp);
    o.start(t0); track(o, t0 + dur + 1);
  }
}
/* щипок: треугольник с быстрым спадом (арфа / челеста) */
function pluck(m, t0, vol, dest) {
  const f = mtof(m);
  osc('triangle', f, f, t0, 0.5, vol, dest || mEcho(), 0.2, 0.004);
  osc('sine', f * 2, f * 2, t0, 0.15, vol * 0.3, dest || mEcho(), 0, 0.002);
}
/* бас: синус + мягкая пила */
function bassN(m, t0, dur, vol) {
  const f = mtof(m);
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(musicBus);
  osc('sine', f, f, t0, dur, vol, lp, 0, 0.02);
  osc('sawtooth', f, f, t0, dur * 0.8, vol * 0.3, lp, 0, 0.02);
}
/* тайко: низкий удар с падающим тоном и шлепок */
function taiko(t0, vol) {
  osc('sine', 120, 46, t0, 0.42, vol, musicBus, 0.25, 0.002);
  nz(brownBuf, 'lowpass', 900, 200, 0.7, t0, 0.12, vol * 0.5, musicBus);
}
function snare(t0, vol) {
  nz(noiseBuf, 'bandpass', 1900, 1400, 0.9, t0, 0.14, vol, musicBus, 0.2);
  osc('triangle', 220, 160, t0, 0.07, vol * 0.4, musicBus);
}
function hat(t0, vol) { nz(noiseBuf, 'highpass', 8000, 8000, 0.7, t0, 0.03, vol, musicBus); }
/* флейта: синус с вибрато и дыханием */
function flute(m, t0, dur, vol) {
  const f = mtof(m);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.value = f;
  const lfo = AC.createOscillator(), lg = AC.createGain();
  lfo.frequency.value = 5.2; lg.gain.value = f * 0.006;
  lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.08);
  g.gain.setValueAtTime(vol * 0.85, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(mEcho());
  const v = AC.createGain(); v.gain.value = 0.5; g.connect(v); v.connect(verbIn);
  o.start(t0); lfo.start(t0); track(o, t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  nz(noiseBuf, 'bandpass', f * 2, f * 2, 2, t0, 0.08, vol * 0.25, musicBus);
}

/* накал: 0 — тишина моря, 1 — бой с флагманом */
function musicIntensity() {
  if (state !== 'play' && state !== 'dying') return 0;
  const P = player;
  let near = 0;
  if (P) for (const e of enemies) if (dist(e.x, e.y, P.x, P.y) < 320) near++;
  let k = 0.15 + alert * 0.14 + Math.min(4, near) * 0.12;
  if (boss) k += 0.55;
  return clamp(k, 0, 1);
}

/* короткие темы на смену состояния */
function stinger(kind, t) {
  const r = ROOTS[levelCycle(level) % ROOTS.length] + 12;
  if (kind === 'win') {
    /* мажорная медь вверх */
    [0, 4, 7, 12].forEach((s, i) => brass(mtof(r + s), t + i * 0.13, 0.9 - i * 0.1, 0.05, musicBus));
    pad([r, r + 4, r + 7], t + 0.5, 2.2, 0.018, 0.8);
  } else {
    /* поражение: низкий минорный аккорд и медленная нисходящая флейта */
    pad([r - 12, r - 9, r - 5], t, 3, 0.02, 0.2);
    flute(r + 7, t + 0.3, 0.8, 0.05); flute(r + 3, t + 1.1, 0.8, 0.05); flute(r, t + 1.9, 1.4, 0.05);
  }
}

function musicTick() {
  if (!AC || AC.state !== 'running') return;
  /* смена состояния — своя тема */
  if (state !== mLastState) {
    if (state === 'levelclear' || state === 'win') stinger('win', now() + 0.05);
    else if (state === 'over') stinger('lose', now() + 0.05);
    mLastState = state;
  }
  mInt += (musicIntensity() - mInt) * 0.08;
  const quiet = state === 'over' || state === 'win' || state === 'levelclear';
  smooth(musicBus.gain, quiet ? 0.15 : state === 'pause' ? 0.25 : 0.7, 0.5);
  if (quiet) { mNext = Math.max(mNext, now() + 0.1); return; }

  const menu = state !== 'play' && state !== 'dying' && state !== 'pause';
  const bpm = menu ? 72 : 84 + mInt * 34;
  const st = 60 / bpm / 4;                         /* шестнадцатая */
  const root = ROOTS[(menu ? 0 : levelCycle(level) + (level % 5 === 4 ? 1 : 0)) % ROOTS.length];

  while (mNext < now() + 0.3) {
    const t = mNext, s = mStep % 16;
    if (s === 0) {
      /* новый такт: аккорд, раз в 8 тактов — новая последовательность */
      if (mBar % 8 === 0) mProg = PROGS[(Math.random() * PROGS.length) | 0];
      const deg = mProg[mBar % 4];
      const ch = chordNotes(root + 12, deg);
      pad(ch, t, st * 16, menu ? 0.012 : 0.010 + mInt * 0.006, menu ? 0.2 : 0.25 + mInt * 0.6);
      bassN(degree(root - 12, deg), t, st * (mInt > 0.45 ? 3 : 14), 0.16);
      mBar++;
    }
    const deg = mProg[(mBar - 1 + 4) % 4];
    const ch = chordNotes(root + 24, deg);
    /* спокойно: арпеджио восьмыми и изредка флейта */
    if (mInt < 0.6 && s % 2 === 0 && Math.random() < (menu ? 0.55 : 0.8))
      pluck(ch[(s / 2) % 3] + (s >= 8 ? 12 : 0), t, 0.03 * (1 - mInt * 0.5));
    if (s === 0 && Math.random() < (menu ? 0.5 : 0.3) && mInt < 0.5) {
      const d0 = deg + 7 + ((Math.random() * 3) | 0);
      flute(degree(root + 12, d0), t + st * 2, st * 6, 0.035);
      flute(degree(root + 12, d0 - 1 - ((Math.random() * 2) | 0)), t + st * 8, st * 7, 0.03);
    }
    /* напряжение: бас восьмыми, тайко и малый барабан */
    if (mInt > 0.45) {
      if (s % 2 === 0 && s) bassN(degree(root - 12, deg) + (s % 8 === 4 ? 7 : 0), t, st * 1.6, 0.13 * mInt);
      if (s === 0 || s === 6 || s === 8 || (s === 14 && mInt > 0.7)) taiko(t, 0.3 * mInt);
      if (s % 2 === 0) hat(t, 0.02 * mInt);
    }
    if (mInt > 0.7 && (s === 4 || s === 12)) snare(t, 0.12 * mInt);
    /* флагман: медные удары на сильные доли */
    if (boss && (s === 0 || s === 10)) for (const m of chordNotes(root, deg)) brass(mtof(m), t, st * 5, 0.022, musicBus, 0.2);
    mStep++; mNext += st;
  }
}

setInterval(() => {
  if (!AC) return;
  try { ambTick(); musicTick(); } catch (e) { /* звук не должен ронять игру */ }
}, 50);

/* старые помощники — на случай вызова из других модулей */
function tone(type, f0, f1, dur, vol, delay = 0, dest) {
  if (!AC || muted) return;
  osc(type, f0, f1, now() + delay, dur, vol, dest);
}
function noiseS(dur, vol, f0, f1, delay = 0, q = 0.8, verb = false) {
  if (!AC || muted) return;
  nz(noiseBuf, 'lowpass', f0, f1, q, now() + delay, dur, vol, sfxGain, verb ? 0.3 : 0);
}

function toggleMute() {
  muted = !muted;
  if (typeof audioGate === 'function') audioGate();
  else if (master) master.gain.value = muted ? 0 : SETTINGS.volume;
}
