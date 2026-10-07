'use strict';
/* ============================================================
   tools/ui-audit.js — проверка интерфейса на «текст касается
   рамки или вылезает за неё». В архив игры не входит.

   Как запустить: открыть игру, в консоли браузера выполнить
     const s = document.createElement('script');
     s.src = 'tools/ui-audit.js?' + Date.now(); document.body.appendChild(s);
   затем  UIAUDIT.run()  — вернёт список нарушений (пустой = чисто).

   Перехватываются ctx.fillText (с учётом трансформации и реальных
   границ глифов) и ctx.strokeRect (рамки панелей и кнопок). Надпись,
   которая пересекает рамку, обязана лежать внутри неё с отступом.
   ============================================================ */

window.UIAUDIT = (() => {
  const SHADOWS = ['#06131c', '#071c2c'];

  function capture(fn) {
    const texts = [], boxes = [], fills = [];
    const fT = ctx.fillText, sR = ctx.strokeRect;
    const oScene = window.drawScene, oBack = window.renderTitleBackdrop;
    const axis = () => { const m = ctx.getTransform(); return (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) ? null : m; };
    ctx.fillText = function (s, x, y, maxW) {
      const m = axis(); s = String(s);
      if (m && s.trim() && SHADOWS.indexOf(ctx.fillStyle) < 0 && ctx.globalAlpha > 0.05) {
        const mt = ctx.measureText(s);
        const k = m.a / SC;
        /* maxW ужимает строку вокруг точки привязки */
        const q = (maxW > 0 && mt.width > maxW) ? maxW / mt.width : 1;
        texts.push({
          s,
          x0: (m.a * (x - mt.actualBoundingBoxLeft * q) + m.e) / SC,
          x1: (m.a * (x + mt.actualBoundingBoxRight * q) + m.e) / SC + k,      /* +1 — тень */
          y0: (m.d * (y - mt.actualBoundingBoxAscent) + m.f) / SC,
          y1: (m.d * (y + mt.actualBoundingBoxDescent) + m.f) / SC + k
        });
      }
      return fT.apply(this, arguments);
    };
    ctx.strokeRect = function (x, y, w, h) {
      const m = axis();
      if (m && w > 12 && h > 8)
        boxes.push({ x0: (m.a * x + m.e) / SC, y0: (m.d * y + m.f) / SC,
                     x1: (m.a * (x + w) + m.e) / SC, y1: (m.d * (y + h) + m.f) / SC });
      return sR.apply(this, arguments);
    };
    /* затемнение на весь экран: всё, что под ним, — фон, не интерфейс */
    const fR = ctx.fillRect;
    ctx.fillRect = function (x, y, w, h) {
      const m = ctx.getTransform();
      if (x <= 0 && y <= 0 && m.a * w / SC >= VW && m.d * h / SC >= VH) { texts.length = 0; boxes.length = 0; fills.length = 0; }
      else if (Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6) {
        const W = m.a * w / SC, H = m.d * h / SC;
        /* шкалы, сегменты, квадратики уровней: невысокие заливки */
        if (W >= 2 && H >= 2 && H <= 8.5)
          fills.push({ x0: (m.a * x + m.e) / SC, y0: (m.d * y + m.f) / SC, x1: (m.a * x + m.e) / SC + W, y1: (m.d * y + m.f) / SC + H });
      }
      return fR.apply(this, arguments);
    };
    window.drawScene = () => {};
    window.renderTitleBackdrop = () => {};
    try { ctx.setTransform(SC, 0, 0, SC, 0, 0); fn(); }
    finally {
      ctx.fillText = fT; ctx.strokeRect = sR; ctx.fillRect = fR;
      window.drawScene = oScene; window.renderTitleBackdrop = oBack;
      ctx.globalAlpha = 1;
    }
    return { texts, boxes, fills };
  }

  function check(label, fn, out, PADX, PADY) {
    PADX = PADX == null ? 2.5 : PADX; PADY = PADY == null ? 1.5 : PADY;
    const { texts, boxes, fills } = capture(fn);
    const seen = new Set();
    const push = s => { if (!seen.has(s)) { seen.add(s); out.push(s); } };
    /* надписи друг на друга: колонки в строках не должны съезжаться */
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.s === b.s && Math.abs(a.x0 - b.x0) < 0.01 && Math.abs(a.y0 - b.y0) < 0.01) continue;
      if ([...a.s].length === 1 && [...b.s].length === 1) continue;   /* заголовки по буквам */
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0.3 && oy > 0.3) push(label + ' | НАЛОЖЕНИЕ: «' + a.s + '» × «' + b.s + '»');
    }
    for (const t of texts) {
      for (const f of fills)
        if (t.x0 < f.x1 - 0.3 && t.x1 > f.x0 + 0.3 && t.y0 < f.y1 - 0.3 && t.y1 > f.y0 + 0.3)
          push(label + ' | НА ШКАЛУ: «' + t.s + '» [' + f.x0.toFixed(0) + ',' + f.y0.toFixed(0) + ' ' + (f.x1 - f.x0).toFixed(0) + 'x' + (f.y1 - f.y0).toFixed(0) + ']');
      if (t.x0 < 1 || t.x1 > VW - 1 || t.y0 < 0.5 || t.y1 > VH - 0.5)
        push(label + ' | ЗА КРАЕМ ЭКРАНА: «' + t.s + '»');
      for (const b of boxes) {
        if (!(t.x0 < b.x1 && t.x1 > b.x0 && t.y0 < b.y1 && t.y1 > b.y0)) continue;
        const d = [];
        if (t.x0 < b.x0 + PADX) d.push('слева ' + (t.x0 - b.x0).toFixed(1));
        if (t.x1 > b.x1 - PADX) d.push('справа ' + (b.x1 - t.x1).toFixed(1));
        if (t.y0 < b.y0 + PADY) d.push('сверху ' + (t.y0 - b.y0).toFixed(1));
        if (t.y1 > b.y1 - PADY) d.push('снизу ' + (b.y1 - t.y1).toFixed(1));
        if (d.length)
          push(label + ' | «' + t.s + '» в рамке [' + b.x0.toFixed(0) + ',' + b.y0.toFixed(0) + ' ' +
               (b.x1 - b.x0).toFixed(0) + 'x' + (b.y1 - b.y0).toFixed(0) + ']: ' + d.join(', '));
      }
    }
  }

  function run() {
    const out = [];
    const save = { lang: LANG, controls: SETTINGS.controls, meta: JSON.stringify(SETTINGS.meta),
                   run: SETTINGS.run, state, tG: tGlobal, money, score, upg: Object.assign({}, upg) };
    const phases = [0.1, 0.6];                    /* мигающие надписи: видна и скрыта */

    for (const lang of [0, 1]) {
      setLang(lang);
      for (const ctrl of ['keys', 'touch']) {
        SETTINGS.controls = ctrl;
        const L = (lang ? 'EN' : 'RU') + '/' + (ctrl === 'touch' ? 'сенсор' : 'клав');
        const each = (name, fn) => { for (const p of phases) { tGlobal = Math.floor(save.tG) + p; check(L + ' ' + name, fn, out); } };

        /* ---- заставка ---- */
        SETTINGS.bestLevel = 187; SETTINGS.bestScore = 99999999;
        SETTINGS.meta = Object.assign(META_DEF(), { day: metaDay(), streak: 123, best: 365, xp: 999999, dqDay: metaDay() });
        SETTINGS.run = null;
        each('заставка', renderTitle);
        SETTINGS.run = { lvl: 186, money: 1, score: 1, upg: Object.assign({}, upg) };
        each('заставка+продолжить', renderTitle);
        SETTINGS.run = null;

        /* ---- штаб: все дни недели, все наборы заданий, все звания ---- */
        for (let d = 0; d < 10; d++) {
          const M = Object.assign(META_DEF(), {
            day: metaDay(), streak: 1 + d, best: 365, total: 999, claimed: d % 2 === 0, doubled: d % 4 === 0,
            dqDay: metaDay() + d, dqProg: [99999, 3, 0], dqDone: [1, 0, 0], dqBonus: d % 3 === 0 ? 1 : 0,
            xp: RANKS[d % RANKS.length].xp + (d === 9 ? 5 : 1)
          });
          SETTINGS.meta = M; hqBackTo = d % 2 ? 'title' : 'pause';
          each('штаб д' + (d + 1), renderHQ);
        }

        /* ---- барабан ---- */
        crateBackTo = 'title';
        for (const ph of ['idle', 'spin', 'won']) {
          cratePhase = ph;
          for (let i = 0; i < CRATE_PRIZES.length; i++) {
            crateIdx = i;
            for (const cd of [0, 299]) { crateT = cd; crateAdT = cd ? 179 : 0; check(L + ' барабан ' + ph + ' приз' + i + ' откат' + cd, renderCrate, out); }
            if (ph !== 'won') break;
          }
        }
        cratePhase = 'idle'; crateT = 0; crateAdT = 0;

        /* ---- арсенал: каждая строка выделена, бедно и богато, до и после прокачки ---- */
        resetAll(); startLevel(0);
        for (const rich of [false, true]) {
          money = rich ? 9999999 : 0;
          upg = rich ? { armor: 5, dmg: 4, rate: 4, eng: 3, boat: 2, msl: 1, ammo: 999, boost: 3, pd: 2, radar: 3, dc: 1 }
                     : { armor: 0, dmg: 0, rate: 0, eng: 0, boat: 0, msl: 0, ammo: 0, boost: 0, pd: 0, radar: 0, dc: 0 };
          player.maxhp = maxhpVal(); player.hp = rich ? 1 : player.maxhp;
          adAmmoT = rich ? 89 : 0; crateT = rich ? 299 : 0;
          for (let i = 0; i < shopCount(); i++) {
            shopSel = i; shopMsgT = 0;
            check(L + ' арсенал ' + (rich ? 'макс' : 'ноль') + ' строка' + (i + 1), renderShop, out);
          }
          for (const k of ['shopNoNeed', 'shopMaxed', 'shopPoor']) { shopMsg = T(k); shopMsgT = 1; check(L + ' арсенал ' + k, renderShop, out); }
          shopMsg = T('shopBought', T('itPd')); shopMsgT = 1; check(L + ' арсенал куплено', renderShop, out);
          shopMsgT = 0;
        }
        adAmmoT = 0; crateT = 0;

        /* ---- настройки ---- */
        for (let i = 0; i < SET_ROWS.length; i++) {
          setSel = i;
          for (const n of ['', T('setReload'), T('setDone')]) { setNote = n; setNoteT = n ? 2 : 0; each('настройки строка' + (i + 1) + (n ? ' +заметка' : ''), renderSettings); }
        }
        setNoteT = 0;

        /* ---- бой: все типы задач, максимальные числа ---- */
        const missions = ['assault', 'night', 'escort', 'convoy', 'boss'];
        for (const mi of missions) {
          let n = 0; while (missionOf(n) !== mi && n < 400) n++;
          resetAll(); startLevel(n);
          upg = { armor: 5, dmg: 4, rate: 4, eng: 3, boat: 2, msl: 1, ammo: 999, boost: 3, pd: 2, radar: 3, dc: 1 };
          player.maxhp = maxhpVal(); money = 99999999; score = 99999999;
          combo = 99; comboT = 4; comboBest = 99; alert = 3; rescued = 99; spawned = 99; landed = 99;
          player.aboard = capacity(); player.troops = 0; smokeCD = 9; dcCD = 2;
          banner = { main: T('stLevel') + ' ' + (n + 1), sub: '«' + lvlName(n) + '» • ' + T(missionKey(mi)), t: 2 };
          msgs.length = 0;
          msg(T('mCarryHome', T('carrier')), '#fff', 5); msg(T('objEscort2', '«' + T('isl_needle') + '»'), '#fff', 5);
          if (mi === 'boss' && !boss) spawnBoss();
          for (let i = 0; i < 60; i++) updMsgs(0.05);
          const hudFn = () => { drawHUD(); if (typeof drawTouchUI === 'function') drawTouchUI(); };
          setState('play'); each('бой ' + mi, hudFn);
          setState('pause'); each('пауза ' + mi, () => { drawHUD(); renderPause(); });
          setState('levelclear'); stT = 5; each('итоги ' + mi, renderLevelClear);
          setState('over'); stT = 5;
          reviveLeft = 1; each('гибель+возрождение ' + mi, () => renderEnd(false));
          reviveLeft = 0; each('гибель ' + mi, () => renderEnd(false));
          setState('win'); stT = 5; each('победа ' + mi, () => renderEnd(true));
        }
        check(L + ' поверните устройство', renderRotateHint, out);
        adMockT = 1; adNote = T('adNoFill'); check(L + ' ролик', drawAdOverlay, out); adMockT = 0;
        adNoteT = 1; adNote = T('adNoFill'); check(L + ' тост', drawAdOverlay, out); adNoteT = 0;
      }
    }

    /* вернуть как было */
    setLang(save.lang); SETTINGS.controls = save.controls; SETTINGS.meta = JSON.parse(save.meta);
    SETTINGS.run = save.run; tGlobal = save.tG; money = save.money; score = save.score; upg = save.upg;
    resetAll(); startLevel(0); setState('title'); msgs.length = 0; banner.t = 0;
    return out;
  }

  /* сводка: одинаковые нарушения из разных вариантов экрана — одной строкой */
  function report() {
    const res = run();
    const key = s => s.replace(/^(RU|EN)\/(клав|сенсор) /, '')
      .replace(/ (д\d+|строка\d+|приз\d+|откат\d+|макс|ноль|\+заметка|assault|night|escort|convoy|boss)/g, '')
      .replace(/\d+/g, '#');
    const groups = {};
    for (const r of res) { const k = key(r); (groups[k] = groups[k] || { tags: new Set(), ex: r }).tags.add(r.split(' ')[0]); }
    const keys = Object.keys(groups);
    return res.length + ' нарушений, уникальных: ' + keys.length + (keys.length ? '\n' : '') +
      keys.map(k => '[' + [...groups[k].tags].join(',') + '] ' + groups[k].ex.replace(/^\S+ /, '')).join('\n');
  }

  return { run, report, check, capture };
})();
