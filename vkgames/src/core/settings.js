'use strict';
/* ============================================================
   settings.js — пользовательские настройки.

   Грузится ПЕРВЫМ: из него config.js берёт масштаб рендера SC.
   Значения хранятся в localStorage и переживают перезагрузку.
   ============================================================ */

/* Свой ключ хранилища: сборки для разных площадок лежат рядом и с
   одного адреса читали бы чужие настройки — в том числе чужой язык. */
const SETTINGS_KEY = 'arhipelag.vkg.settings.v1';

function detectTouch() {
  return (typeof window !== 'undefined') &&
         /* телефон/планшет: основной указатель — палец. Ноутбук с сенсорным
            экраном сюда не попадает, иначе WASD переставал работать */
         !!(window.matchMedia && matchMedia('(pointer: coarse)').matches &&
            !matchMedia('(hover: hover)').matches);
}
/* settings.js грузится раньше словаря, поэтому список языков здесь свой
   (тот же, что LANG_LIST в i18n.js) */
const SUPPORTED_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'tr', 'pl', 'ru'];

/* Требование каталога VK: основной язык — русский. ВКонтакте передаёт язык
   игрока в параметре vk_language (ru, uk, ua, be, kz, en, pt, es). */
function detectLang() {
  let l = '';
  try { l = (new URLSearchParams(location.search).get('vk_language') || '').toLowerCase(); } catch (e) {}
  const map = { ru: 'ru', uk: 'ru', ua: 'ru', be: 'ru', kz: 'ru', en: 'en', pt: 'pt', es: 'es' };
  return map[l] || 'ru';
}

/* язык браузера, если он есть среди переводов */
function detectBrowserLang() {
  const l = (navigator.language || 'en').toLowerCase().slice(0, 2);
  const map = { uk: 'ru', be: 'ru', kk: 'ru' };
  const c = map[l] || l;
  return SUPPORTED_LANGS.indexOf(c) >= 0 ? c : 'en';
}

function defaultSettings() {
  const touch = detectTouch();
  return {
    lang    : detectLang(),        /* код из LANG_LIST, по умолчанию 'en' */
    langSet : false,               /* язык выбран игроком вручную */
    controls: 'auto',              /* 'auto' | 'keys' | 'touch' */
    quality : touch ? 3 : 4,       /* 4 = 1920x1080, 3 = 1440x810, 2 = 960x540 */
    sound   : true,
    music   : true,
    volume  : 0.5,                 /* 0 .. 1 с шагом 0.1 */
    shake   : true,
    crt     : true,
    diff    : 'normal',            /* 'easy' | 'normal' | 'hard' */
    perks   : {},                  /* купленные постоянные вещи */
    bestLevel: 0,                  /* рекорд забега: без этих ключей */
    bestScore: 0,                  /* loadSettings их бы не поднял      */
    meta    : null,                /* серия дней, задания, звание (meta.js) */
    run     : null,                /* незаконченная операция: пережить F5 */
    savedAt : 0,                   /* когда сохранялись — сверка с облаком VK */
    adDay   : null,                /* сколько роликов за награду сегодня */
    tutDone : false                /* обучение пройдено */
  };
}

function loadSettings() {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k in d) if (o[k] !== undefined) d[k] = o[k];
      /* язык из сохранения берём, только если игрок выбрал его сам */
      if (!o.langSet) d.lang = detectLang();
    }
  } catch (e) { /* приватный режим или запрет хранилища — играем на умолчаниях */ }
  d.quality = (d.quality === 2 || d.quality === 3 || d.quality === 4) ? d.quality : 4;
  return d;
}

const SETTINGS = loadSettings();

function saveSettings() {
  SETTINGS.savedAt = Date.now();
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) {}
  /* и в облако площадки, чтобы прогресс жил на всех устройствах */
  if (typeof cloudSave === 'function') cloudSave(false);
}

/* сенсорное управление активно? */
function touchMode() {
  if (SETTINGS.controls === 'touch') return true;
  if (SETTINGS.controls === 'keys') return false;
  return detectTouch();
}

/* множители сложности */
const DIFF_TABLE = {
  easy  : { dmg: 0.70, hp: 0.85, cash: 1.15 },
  normal: { dmg: 1.00, hp: 1.00, cash: 1.00 },
  hard  : { dmg: 1.40, hp: 1.20, cash: 1.25 }
};
function diff() { return DIFF_TABLE[SETTINGS.diff] || DIFF_TABLE.normal; }

/* применить всё, что можно поменять без перезапуска */
function applySettings() {
  setLang(SETTINGS.lang);
  muted = !SETTINGS.sound;
  if (typeof audioGate === 'function') audioGate();
  else if (typeof master !== 'undefined' && master) master.gain.value = muted ? 0 : SETTINGS.volume;
  if (typeof musicGain !== 'undefined' && musicGain) musicGain.gain.value = SETTINGS.music ? 0.85 : 0;
  const fx = document.getElementById('fx');
  const vig = document.getElementById('vig');
  if (fx) fx.style.display = SETTINGS.crt ? '' : 'none';
  if (vig) vig.style.display = SETTINGS.crt ? '' : 'none';
  document.body.classList.toggle('touch', touchMode());
  document.documentElement.lang = SETTINGS.lang;   /* язык страницы = язык игры */
  /* подписи под холстом тоже переводим */
  const tag = document.getElementById('tag');
  if (tag && typeof T === 'function')
    tag.textContent = T('gameTitle') + ' • ' + T('subtitle');
}
