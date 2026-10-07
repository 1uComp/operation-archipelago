'use strict';
/* ============================================================
   input.js — клавиатура и мышь
   ============================================================ */

addEventListener('keydown', e => {
  /* игра открыта в другой вкладке: любая клавиша действия забирает её сюда */
  if (tabBlocked()) {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tabTakeOver(); }
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  keys[e.code] = true;

  if (e.code === 'KeyM') {
    toggleMute();
    SETTINGS.sound = !muted; saveSettings();
    if (state === 'play') msg(muted ? T('mSoundOff') : T('mSoundOn'), '#7fd4e0', 1.5);
  }

  /* ---- штаб ---- */
  if (state === 'hq') {
    if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyH') closeHQ();
    else if (e.code === 'Space' || e.code === 'Enter') {
      if (SETTINGS.meta && !SETTINGS.meta.claimed) hqClaim(false); else hqFight();
    }
    return;
  }
  if (e.code === 'KeyH' && (state === 'title' || state === 'pause')) { openHQ(state); return; }

  /* ---- барабан ---- */
  if (state === 'crate') {
    if (e.code === 'KeyE' || e.code === 'Escape') closeCrate();
    else if (e.code === 'Space' || e.code === 'Enter') crateStart(crateT > 0);
    return;
  }

  /* ---- настройки ---- */
  if (state === 'settings') {
    if (e.code === 'Escape' || e.code === 'KeyO') closeSettings();
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') settingsMove(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') settingsMove(1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') settingsStep(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Enter' || e.code === 'Space')
      settingsStep(1);
    return;
  }
  if (e.code === 'KeyO' && (state === 'title' || state === 'pause' || state === 'play')) {
    openSettings(state === 'play' ? 'play' : state);
    return;
  }

  /* ---- арсенал ---- */
  if (state === 'shop') {
    if (e.code === 'KeyE' || e.code === 'Escape') { setState('play'); SFX.ui(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') shopMove(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') shopMove(1);
    else if (e.code === 'Enter' || e.code === 'Space') buyItem(shopSel);
    else if (e.code.indexOf('Digit') === 0) {
      const n = +e.code.slice(5);
      if (n >= 1 && n <= 9) { shopSel = n - 1; buyItem(n - 1); }
      else if (n === 0 && ITEMS.length >= 10) { shopSel = 9; buyItem(9); }
    }
    return;
  }

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'play') { setState('pause'); SFX.ui(); }
    else if (state === 'pause') { setState('play'); SFX.ui(); }
  }

  if (state === 'play' && e.code === 'KeyE' && player && !player.dead &&
      dist(player.x, player.y, CARR.x, CARR.y) < 145) {
    setState('shop'); shopSel = 0; shopMsgT = 0; SFX.ui();
  }

  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === 'title') { startCampaign(); }
    else if (state === 'levelclear' && stT > 0.6) adThenLevel(level + 1);
    else if (state === 'over' && stT > 0.8) adThenLevel(level);
    else if (state === 'win' && stT > 0.8) adThenLevel(level + 1);
  }
  if (e.code === 'KeyV' && state === 'over' && stT > 0.5) tryRevive();
  if (state === 'play' && !player.dead) {
    if (e.code === 'KeyF') dropSmoke();
    else if (e.code === 'KeyQ') dropCharge();
  }
  if (e.code === 'KeyR' && (state === 'over' || state === 'win') && stT > 0.8) { resetAll(); startLevel(0); }
});

addEventListener('keyup', e => { keys[e.code] = false; });

cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  mouse.x = clamp((e.clientX - r.left) * (VW / r.width), 0, VW);
  mouse.y = clamp((e.clientY - r.top) * (VH / r.height), 0, VH);
});

function setMouseFrom(e) {
  const r = cv.getBoundingClientRect();
  mouse.x = clamp((e.clientX - r.left) * (VW / r.width), 0, VW);
  mouse.y = clamp((e.clientY - r.top) * (VH / r.height), 0, VH);
}

cv.addEventListener('mousedown', e => {
  /* preventDefault у mousedown не даёт браузеру отдать фокус окну игры:
     в iframe площадки клавиши тогда уходят её странице, и катер не
     слушается WASD, пока не нажмёшь «полный экран». Берём фокус сами. */
  try { window.focus(); } catch (err) {}
  if (tabBlocked()) { e.preventDefault(); initAudio(); tabTakeOver(); return; }
  e.preventDefault();
  initAudio();
  setMouseFrom(e);          /* клик может прийти без предшествующего mousemove */
  /* кнопки интерфейса — раньше всего остального */
  if (e.button !== 2 && !(typeof adBlocking === 'function' && adBlocking()) && uiTap(mouse.x, mouse.y)) return;

  if (e.button === 2) {
    mouse.rdown = true;
    if (state === 'play' && player && !player.dead) fireMissile();
    return;
  }
  if (state === 'hq') { hqTap(mouse.x, mouse.y); return; }
  if (state === 'crate') { crateTap(mouse.x, mouse.y); return; }
  if (state === 'settings') { settingsTap(mouse.x, mouse.y); return; }
  if (state === 'pause') {
    if (hitPauseSettings(mouse.x, mouse.y)) { openSettings('pause'); return; }
    setState('play'); SFX.ui(); return;
  }
  if (state === 'title') {
    if (hitTitleSettings(mouse.x, mouse.y)) { openSettings('title'); return; }
    if (hitTitleCrate(mouse.x, mouse.y)) { openCrate('title'); return; }
    if (hitTitleHq(mouse.x, mouse.y)) { openHQ('title'); return; }
    startCampaign(); return;
  }
  if (state === 'over' && hitRevive(mouse.x, mouse.y)) { tryRevive(); return; }
  if (state === 'levelclear' && stT > 0.6) { adThenLevel(level + 1); return; }
  if (state === 'over' && stT > 0.8) { adThenLevel(level); return; }
  if (state === 'win' && stT > 0.8) { adThenLevel(level + 1); return; }
  if (state === 'shop') { shopTap(mouse.x, mouse.y); return; }
  mouse.down = true;
});

addEventListener('mouseup', e => {
  if (e.button === 2) mouse.rdown = false; else mouse.down = false;
});

cv.addEventListener('contextmenu', e => e.preventDefault());
/* Требование площадки: при потере фокуса звук останавливается.
   Заодно снимаем зажатые клавиши и ставим бой на паузу. */
function focusLost() {
  YA.away = true; audioGate();
  if (state === 'play') setState('pause');
  mouse.down = false; mouse.rdown = false;
  for (const k in keys) keys[k] = false;
}
function focusBack() { YA.away = false; audioGate(); }

addEventListener('blur', focusLost);
addEventListener('focus', focusBack);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) focusLost(); else focusBack();
});

/* удержание ПКМ — залп ракет с задержкой */
setInterval(() => {
  if (mouse.rdown && state === 'play' && player && !player.dead && mCool <= 0) fireMissile();
}, 90);
