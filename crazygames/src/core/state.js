'use strict';
/* ============================================================
   state.js — общее изменяемое состояние игры и формулы прокачки
   ============================================================ */

/* canvas / контекст.
   Холст физически PWxPH пикселей, но весь код рисует в единицах VWxVH —
   базовое преобразование ctx масштабирует их в SC раз (см. render()). */
const cv  = document.getElementById('game');
cv.width = PW; cv.height = PH;
const ctx = cv.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = 'top';

/* слой тьмы рисуется в половинном разрешении: градиенты мягкие,
   разницы не видно, а заливок вдвое меньше */
const LK = Math.max(1, SC / 2);
const lightCv  = document.createElement('canvas');
lightCv.width = VW * LK; lightCv.height = VH * LK;
const lightCtx = lightCv.getContext('2d');
lightCtx.setTransform(LK, 0, 0, LK, 0, 0);

/* ---------- уровень и мир ---------- */
let level = 0, curCfg = makeLevel(0), PAL = BIOMES.tropic;
let seaDepth = null;                        /* карта глубин (низкое разрешение) */
let seaTex = [null, null];                  /* тайлы ряби, 1:1 к пикселям экрана */
let islands = [], structs = [];

/* ---------- сущности ---------- */
let enemies = [], planes = [], shells = [], arcs = [], missiles = [], eMissiles = [],
    parts = [], lights = [], floats = [], pickups = [], hostages = [], mines = [],
    msgs = [], wakes = [];
/* особые миссии */
let tornados = [], marines = [], squad = [], piers = [], crew = [];
let subs = [], torps = [], charges = [], smokes = [];
let transport = null;
let allyIsl = null, targetIsl = null;
let stealth = { meter: 0, lit: false, blown: false };
let player = null, boss = null;

/* ---------- камера ---------- */
const cam = { x: CARR.x, y: CARR.y, z: 1, zt: 1 };   /* x,y — ЦЕНТР камеры */
let ox = 0, oy = 0;                                   /* левый-верхний угол видимой области мира */
let shake = 0, shakeAx = 0, shakeAy = 0, hitStop = 0, flashScreen = 0;

/* ---------- прогресс ---------- */
let score = 0, money = 0;
let upg = { armor:0, dmg:0, rate:0, eng:0, boat:0, msl:0, ammo:0, boost:0, pd:0, radar:0, dc:0 };

const maxhpVal  = () => 100 + upg.armor * 25 + (hasPerk('hull') ? 40 : 0);
const shellDmg  = () => 12 + upg.dmg * 4;
const fireCd    = () => 0.28 * Math.pow(0.88, upg.rate);
const maxSpd    = () => 95 * (1 + upg.eng * 0.12) * (hasPerk('hull') ? 1.10 : 1);
const turnSpd   = () => 2.3 * (1 + upg.eng * 0.08);
const capacity  = () => 4 + upg.boat * 2;
const boostMax  = () => 100 + upg.boost * 45;
const boostRegen= () => 16 + upg.boost * 7;
const pdRange   = () => 44 + upg.pd * 14;
const radarRange= () => 460 + upg.radar * 330;

/* ---------- статистика уровня ---------- */
let kills = { ships:0, planes:0, bases:0, bunkers:0, mines:0 };
let rescued = 0, spawned = 0, crates = 0, landed = 0;
let totalBases = 4, destroyedBases = 0, playTime = 0;
let alert = 0;                              /* уровень тревоги 0..3 */
let combo = 0, comboT = 0, comboBest = 0;
let radarHacked = false;                    /* сбита ли РЛС-вышка */

/* ---------- таймеры и режимы ---------- */
let state = 'title', stT = 0, tGlobal = 0;
let planeT = 14, shipT = 6, mineT = 5, mCool = 0;
let winPend = false, winT = 0, fwT = 0;
let hints = { h:false, c:false, b:false };
let banner = { main:'', sub:'', t:0 };
let titlePlanes = [], titlePT = 3;

/* ---------- ввод ---------- */
const keys = {};
const mouse = { x: VW / 2, y: VH / 2, down: false, rdown: false };

function setState(s) {
  state = s; stT = 0;
  /* CrazyGames: гибель НЕ стирает снимок операции. Повтор миссии идёт
     с тем же уровнем и улучшениями, а закрывший игру на экране гибели
     вернётся к «продолжить миссию N» — «потерянный прогресс — потерянный
     игрок» (docs.crazygames.com, Basic Launch metrics). */
  if (typeof ysdkGameplay === 'function') ysdkGameplay(s === 'play' || s === 'dying');
}

/* мировые координаты курсора с учётом зума камеры */
const mouseWX = () => ox + mouse.x / cam.z;
const mouseWY = () => oy + mouse.y / cam.z;

let startGift = { cr: 0, ammo: 0 };   /* что выдал штаб на старте: покажем баннером */
let runTrack = false;                 /* игрок уже вышел в море: до этого склад не трогаем */

function resetAll() {
  score = 0; money = 0; level = 0;
  upg = { armor:0, dmg:0, rate:0, eng:0, boat:0, msl:0, ammo:0, boost:0, pd:0, radar:0, dc:0 };
  /* Склад со штаба и надбавка за звание — в начале каждой кампании.
     На загрузке (пока игрок стоит на заставке) склад не трогаем. */
  if (runTrack && typeof metaStartBonus === 'function') startGift = metaStartBonus();
  if (typeof dqReset === 'function') dqReset();
}

/* ---------- тряска, стоп-кадр, зум-удар ---------- */
function addShake(amount, x, y) {
  if (!SETTINGS.shake) return;
  shake = Math.min(14, shake + amount);
  if (x !== undefined && player) {
    const a = Math.atan2(player.y - y, player.x - x);
    shakeAx = Math.cos(a); shakeAy = Math.sin(a);
  }
}
/* На телефоне экран маленький — камера ближе, корабли крупнее. */
const MOBILE_ZOOM = 1.25;
const camBase = () => (touchMode() ? MOBILE_ZOOM : 1);
function zoomPunch(k) { if (SETTINGS.shake) cam.zt = Math.min(camBase() * 1.12, cam.zt + k); }
function freeze(t)    { hitStop = Math.max(hitStop, t); }
