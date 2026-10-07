'use strict';
/* ============================================================
   settings.js (ui) — экран настроек: язык, звук, управление,
   разрешение, сложность. Доступен с заставки и из паузы (O).
   ============================================================ */

let setSel = 0, setRows = [], setBackTo = 'title', setNote = '', setNoteT = 0;
const bootQuality = SETTINGS.quality;   /* смена разрешения требует перезапуска */

const QUALITY_LABEL = { 4: '1920x1080', 3: '1440x810', 2: '960x540' };

const SET_ROWS = [
  { key: 'lang',
    label: () => T('setLang'),
    value: () => langName(SETTINGS.lang),
    step: d => {
      const i = Math.max(0, LANG_LIST.indexOf(SETTINGS.lang));
      SETTINGS.lang = LANG_LIST[(i + (d > 0 ? 1 : LANG_LIST.length - 1)) % LANG_LIST.length];
      SETTINGS.langSet = true; applySettings(); saveSettings();
    } },

  { key: 'sound',
    label: () => T('setSound'),
    value: () => (SETTINGS.sound ? T('onWord') : T('offWord')),
    step: d => { SETTINGS.sound = !SETTINGS.sound; applySettings(); } },

  { key: 'music',
    label: () => T('setMusic'),
    value: () => (SETTINGS.music ? T('onWord') : T('offWord')),
    step: d => { SETTINGS.music = !SETTINGS.music; applySettings(); } },

  { key: 'volume',
    label: () => T('setVolume'),
    value: () => Math.round(SETTINGS.volume * 100) + '%',
    step: d => { SETTINGS.volume = clamp(+(SETTINGS.volume + d * 0.1).toFixed(2), 0, 1); applySettings(); } },

  { key: 'controls',
    label: () => T('setControls'),
    value: () => (SETTINGS.controls === 'touch' ? T('ctrlTouch')
                : SETTINGS.controls === 'keys' ? T('ctrlKeys') : T('ctrlAuto')),
    step: d => {
      const o = ['auto', 'keys', 'touch'];
      SETTINGS.controls = o[(o.indexOf(SETTINGS.controls) + (d > 0 ? 1 : o.length - 1)) % o.length];
      applySettings();
    } },

  { key: 'diff',
    label: () => T('setDiff'),
    value: () => (SETTINGS.diff === 'easy' ? T('diffEasy')
                : SETTINGS.diff === 'hard' ? T('diffHard') : T('diffNormal')),
    step: d => {
      const o = ['easy', 'normal', 'hard'];
      SETTINGS.diff = o[(o.indexOf(SETTINGS.diff) + (d > 0 ? 1 : o.length - 1)) % o.length];
    } },

  { key: 'quality',
    label: () => T('setQuality'),
    value: () => QUALITY_LABEL[SETTINGS.quality] || '?',
    step: d => {
      const o = [2, 3, 4];
      SETTINGS.quality = o[(o.indexOf(SETTINGS.quality) + (d > 0 ? 1 : o.length - 1)) % o.length];
      setNote = T('setReload'); setNoteT = 3;
    } },

  { key: 'shake',
    label: () => T('setShake'),
    value: () => (SETTINGS.shake ? T('onWord') : T('offWord')),
    step: d => { SETTINGS.shake = !SETTINGS.shake; } },

  { key: 'crt',
    label: () => T('setCrt'),
    value: () => (SETTINGS.crt ? T('onWord') : T('offWord')),
    step: d => { SETTINGS.crt = !SETTINGS.crt; applySettings(); } },

  { key: 'reset',
    label: () => (tGlobal < resetArmT ? T('setResetSure') : T('setReset')),
    value: () => '»',
    step: d => {
      /* сброс необратим: первое нажатие взводит, второе в течение
         трёх секунд подтверждает */
      if (tGlobal >= resetArmT) { resetArmT = tGlobal + 3; setNote = T('setResetSure'); setNoteT = 3; return; }
      resetArmT = 0;
      resetProgress();
      setNote = T('setDone'); setNoteT = 2.5;
    } },

  { key: 'back',
    label: () => T('setBack'),
    value: () => '«',
    step: d => closeSettings() }
];

/* Полный сброс кампании: недоигранная операция, рекорд, звание, серия
   дней, задания дня, обучение. Раньше кнопка вызывала только resetAll()
   — он чистит лишь текущий забег в памяти, и после выхода на заставку
   «продолжить миссию N», рекорд и звание оставались на месте.
   Купленные за деньги вещи (perks) не трогаем — это покупки игрока. */
let resetArmT = 0;
function resetProgress() {
  SETTINGS.run = null;
  SETTINGS.bestLevel = 0;
  SETTINGS.bestScore = 0;
  SETTINGS.meta = null;
  SETTINGS.tutDone = false;
  if (typeof metaBoot === 'function') metaBoot();     /* свежая серия и звание */
  runTrack = false;
  resetAll();
  /* из паузы после сброса — на заставку: старый бой больше не наш */
  if (setBackTo !== 'title') setBackTo = 'title';
  saveSettings();
  if (typeof cloudSave === 'function') cloudSave(true);   /* облако — сразу, иначе вернёт рекорд */
}

function openSettings(from) {
  setBackTo = from || 'title';
  setSel = 0; setNote = ''; setNoteT = 0;
  setState('settings');
  SFX.ui();
}
function closeSettings() {
  saveSettings();
  if (SETTINGS.quality !== bootQuality) { location.reload(); return; }
  setState(setBackTo);
  SFX.ui();
}
function settingsMove(d) {
  setSel = (setSel + d + SET_ROWS.length) % SET_ROWS.length;
  SFX.move();
}
function settingsStep(d) {
  SET_ROWS[setSel].step(d);
  saveSettings();
  SFX.buy();
}
function settingsTap(x, y) {
  for (const r of setRows) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      setSel = r.i;
      settingsStep(1);
      return;
    }
  }
}

function renderSettings() {
  if (state === 'settings' && setBackTo === 'title') renderTitleBackdrop();
  else drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.78)';
  ctx.fillRect(0, 0, VW, VH);

  const X = 74, W = 332, Y = 16, H = 240;
  panel(X, Y, W, H, '#4a86a3');
  txt(T('setTitle'), VW / 2, Y + 7, '#ffb454', 8, 'center');
  ctx.fillStyle = '#2c5a70'; ctx.fillRect(X + 6, Y + 19, W - 12, 1);

  setRows = [];
  const rowH = 17, y0 = Y + 25;
  for (let i = 0; i < SET_ROWS.length; i++) {
    const r = SET_ROWS[i], y = y0 + i * rowH;
    const row = { x: X + 6, y, w: W - 12, h: rowH - 1, i };
    setRows.push(row);
    const active = i === setSel;
    if (active) {
      ctx.fillStyle = '#123246'; ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = '#ffb454'; ctx.fillRect(row.x, row.y, 2, row.h);
    }
    const special = r.key === 'reset' || r.key === 'back';
    txt(r.label(), row.x + 16, y + 5, special ? '#9fc3d0' : '#f4f8fa');
    txt(r.value(), row.x + row.w - 14, y + 5, active ? '#ffd94a' : '#7fd4e0', 8, 'right');
  }

  ctx.fillStyle = '#2c5a70'; ctx.fillRect(X + 6, Y + H - 26, W - 12, 1);
  if (setNoteT > 0) txt(setNote, VW / 2, Y + H - 20, '#ffb454', 8, 'center');
  else txt(touchMode() ? T('setKeysT') : T('setKeys'), VW / 2, Y + H - 20, '#5d8299', 8, 'center');
}
