'use strict';
/* ============================================================
   config.js — размеры, палитры биомов, описания уровней
   ============================================================ */

/* ------------------------------------------------------------
   Разрешение.
   VW/VH — «единицы разметки»: в них написана вся игровая логика,
   интерфейс и координаты мира. SC — во сколько раз плотнее пиксели
   реального холста: 4 -> 1920x1080, 3 -> 1440x810, 2 -> 960x540.
   Поле зрения от SC не зависит, меняется только детализация.
   ------------------------------------------------------------ */
const SC = SETTINGS.quality;      /* берётся из настроек, см. settings.js */
const VW = 480, VH = 270;                 /* единицы разметки */
const PW = VW * SC, PH = VH * SC;         /* физический размер холста, px */
const WORLD = { w: 2600, h: 2000 };
const CARR  = { x: 190, y: 1000 };        /* авианосец «СЕВЕР» — база игрока */

/* ---------- биомы островов ---------- */
const BIOMES = {
  tropic: { sand:'#e6d198', sandD:'#c4a468', wet:'#cbb47c', grass:'#4c9a55', grassD:'#356e3f',
            tree:'#2f6b33', treeD:'#1e4426', rock:'#8a929c', rockD:'#5d666f',
            trunk:'#7a5a34', trunkD:'#4a3620', dead:'#7d6a52',
            flowers:['#ffd94a', '#ff8b3d', '#ff9ad5', '#f4f8fa'] },
  atoll : { sand:'#efe3b4', sandD:'#cdb87f', wet:'#d6c48d', grass:'#3f9a7e', grassD:'#2b6d5c',
            tree:'#2d7a63', treeD:'#1a4d3e', rock:'#93a09c', rockD:'#616d6a',
            trunk:'#8a6a42', trunkD:'#523c24', dead:'#8a7a62',
            flowers:['#fff0b0', '#ffb454', '#a0e8ff'] },
  rust  : { sand:'#d9ac7d', sandD:'#b0794f', wet:'#c0895c', grass:'#7e6a4a', grassD:'#5b4a33',
            tree:'#6d5a3a', treeD:'#453722', rock:'#a1705c', rockD:'#6d4638',
            trunk:'#6b4a2c', trunkD:'#3d2a18', dead:'#9c8161',
            flowers:['#e0a24a', '#c96a3a'] },
  ash   : { sand:'#8e8e93', sandD:'#6b6b72', wet:'#7a7a80', grass:'#3d4a45', grassD:'#28322f',
            tree:'#2c3a34', treeD:'#1a231f', rock:'#767c86', rockD:'#484e58',
            trunk:'#4a4a4e', trunkD:'#2c2c30', dead:'#6e6e74',
            flowers:['#8fa3ad'] },
  jungle: { sand:'#d8c98f', sandD:'#ab9660', wet:'#bfae76', grass:'#2f7a4a', grassD:'#1d5433',
            tree:'#236b3c', treeD:'#123d22', rock:'#7f8c86', rockD:'#4d5854',
            trunk:'#6a5330', trunkD:'#3c2d18', dead:'#77664a',
            flowers:['#ff5e8a', '#ffd94a', '#ff8b3d', '#c07bff'] }
};

/* Состав растительности по биомам: dens — множитель плотности,
   mix — вероятностный набор видов. */
const VEG_MIX = {
  tropic: { dens: 1.15, mix: [['palm',0.26], ['broad',0.26], ['big',0.08], ['bush',0.18],
                              ['fern',0.08], ['tuft',0.10], ['flower',0.04]] },
  atoll : { dens: 0.78, mix: [['palm',0.42], ['broad',0.14], ['bush',0.20], ['tuft',0.18],
                              ['fern',0.04], ['flower',0.02]] },
  rust  : { dens: 0.58, mix: [['dead',0.26], ['bush',0.34], ['tuft',0.26], ['broad',0.08],
                              ['palm',0.04], ['flower',0.02]] },
  ash   : { dens: 0.42, mix: [['dead',0.50], ['tuft',0.32], ['bush',0.18]] },
  jungle: { dens: 1.75, mix: [['broad',0.30], ['big',0.17], ['palm',0.15], ['fern',0.15],
                              ['bush',0.16], ['flower',0.04], ['tuft',0.03]] }
};

/* ---------- темы уровней ---------- */
/* mix — вероятностный состав вражеского флота
   weather — { rain, fog, haze, lightning, wind }
   ambient — насколько темна сцена (0 = день, 1 = глухая ночь) */
const THEMES = [
  { key:'lvl1',
    biome:'tropic', ambient:0.00, weather:{},
    mix:[['patrol',0.45],['gun',0.55]],
    sea:{ sea:'#11476b', dk:'rgba(6,32,50,0.5)',  lt:'rgba(38,96,128,0.35)', sp:'rgba(160,220,235,0.10)',
          sh1:'#1e6f8a', sh2:'#2f93a8', sh3:'#5fc0c6', deep:'#0a2f4a', foam:'#dffaff' } },

  { key:'lvl2',
    biome:'atoll', ambient:0.22, weather:{ rain:1.0, lightning:true, wind:-0.55 },
    mix:[['patrol',0.35],['gun',0.5],['missile',0.15]],
    sea:{ sea:'#0d4f60', dk:'rgba(4,36,42,0.5)',  lt:'rgba(30,110,110,0.35)', sp:'rgba(150,235,220,0.10)',
          sh1:'#177a86', sh2:'#2a9a9c', sh3:'#57c4bb', deep:'#073640', foam:'#d6fff6' } },

  { key:'lvl3',
    biome:'rust', ambient:0.30, weather:{ haze:0.18, wind:0.2 },
    mix:[['patrol',0.3],['gun',0.45],['missile',0.25]],
    sea:{ sea:'#274a70', dk:'rgba(14,26,52,0.5)', lt:'rgba(96,86,140,0.30)', sp:'rgba(210,190,235,0.10)',
          sh1:'#4a5a8a', sh2:'#6f7fa8', sh3:'#a0b2cc', deep:'#1a2f4d', foam:'#efe6ff' } },

  { key:'lvl4',
    biome:'ash', ambient:0.62, weather:{ fog:0.34, wind:0.15 },
    mix:[['patrol',0.22],['gun',0.4],['missile',0.26],['frigate',0.12]],
    sea:{ sea:'#0b2334', dk:'rgba(2,12,22,0.6)',  lt:'rgba(30,70,96,0.30)', sp:'rgba(170,230,240,0.14)',
          sh1:'#164a5e', sh2:'#20647a', sh3:'#3f92a5', deep:'#05141f', foam:'#cfeef7' } },

  { key:'lvl5',
    biome:'jungle', ambient:0.40, weather:{ rain:0.45, lightning:true, wind:-0.3 },
    mix:[['patrol',0.18],['gun',0.34],['missile',0.28],['frigate',0.20]],
    sea:{ sea:'#123a3a', dk:'rgba(4,24,22,0.55)', lt:'rgba(36,96,80,0.32)', sp:'rgba(160,235,200,0.12)',
          sh1:'#1d5e54', sh2:'#2e7f6d', sh3:'#5aab8c', deep:'#0a2622', foam:'#d6fff0' } }
];

/* ------------------------------------------------------------
   Бесконечная кампания.

   Тема (биом, палитра моря, погода) берётся по кругу из THEMES,
   числовые параметры растут с номером уровня. Босс приходит на
   каждом пятом уровне: 5, 10, 15 и так далее.

   Рост намеренно тормозится после десятого уровня: дерево улучшений
   конечно и к тому времени уже выкуплено, дальше игра держится
   на мастерстве, а не на бесконечно жирных врагах.
   ------------------------------------------------------------ */
const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const levelCycle = n => Math.floor(n / 5);          /* номер круга, 0-based */
/* тема сдвигается на номер круга, иначе все боссы шли бы в одном биоме */
const themeOf = n => THEMES[(n + levelCycle(n)) % THEMES.length];
const isBossLevel = n => (n % 5) === 4;             /* каждый пятый уровень */
const rampK = n => (n < 10 ? n : 10 + (n - 10) * 0.35);

/* ------------------------------------------------------------
   Типы миссий.
   Первый круг знакомит с механиками по очереди: обычный штурм,
   штурм в ливень со смерчами, ночная тихая эвакуация, десант
   морпехов. Пятый уровень — босс. Дальше тип выбирается
   псевдослучайно, но детерминированно от номера: переигранный
   после гибели уровень остаётся тем же самым.
   ------------------------------------------------------------ */
function missionOf(n) {
  if (isBossLevel(n)) return 'boss';
  if (n < 4) return ['assault', 'assault', 'night', 'escort'][n];
  const r = h1(n * 7.13 + 3.7);
  return r < 0.34 ? 'assault' : r < 0.56 ? 'night' : r < 0.78 ? 'escort' : 'convoy';
}

/* поздние круги — больше тяжёлых кораблей */
function scaleMix(mix, cycle) {
  if (!cycle) return mix;
  const out = mix.map(m => m.slice());
  for (const m of out) {
    if (m[0] === 'patrol') m[1] *= Math.max(0.2, 1 - cycle * 0.28);
    else if (m[0] === 'gun') m[1] *= Math.max(0.4, 1 - cycle * 0.12);
    else if (m[0] === 'missile') m[1] *= 1 + cycle * 0.25;
    else if (m[0] === 'frigate') m[1] *= 1 + cycle * 0.45;
  }
  if (cycle >= 1 && !out.some(m => m[0] === 'frigate')) out.push(['frigate', 0.10 * cycle]);
  const tot = out.reduce((a, m) => a + m[1], 0);
  for (const m of out) m[1] /= tot;
  return out;
}

function makeLevel(n) {
  const th = themeOf(n);
  const c = levelCycle(n), k = rampK(n);
  const mission = missionOf(n);
  const night = mission === 'night';
  /* ночью гасим свет и подсыпаем тумана, чтобы лучи маяков читались */
  const weather = night ? Object.assign({}, th.weather, { fog: Math.max(th.weather.fog || 0, 0.18) })
                        : th.weather;
  return {
    n, key: th.key, cycle: c, mission,
    /* каждый круг приходит другой флагман */
    bossKind: ['leviathan', 'carrier', 'monitor'][c % 3],
    /* подлодки появляются с третьего уровня и множатся с кругами */
    subs: n >= 2 ? Math.min(4, 1 + Math.floor(n / 4)) : 0,
    biome: th.biome, sea: th.sea, weather,
    ambient: night ? Math.max(th.ambient, 0.78) : th.ambient,
    tornado: (weather.rain || 0) >= 0.4,
    lights : night ? Math.min(6, 3 + c) : 0,
    prisoners: night ? Math.min(10, 4 + Math.round(n * 0.35)) : 0,
    marines: mission === 'escort' ? Math.min(8, 4 + c) : 0,
    mix: scaleMix(th.mix, c),
    /* первые миссии — на ближней половине карты и короче: новичок
       не должен плыть через всё море ради последней базы */
    span   : n === 0 ? 1300 : n === 1 ? 1750 : 0,
    isl    : n === 0 ? 6 : Math.min(16, 7 + Math.round(n * 0.55)),
    bases  : n === 0 ? 3 : Math.min(10, 4 + Math.round(n * 0.45)),
    enemies: Math.min(12, 3 + Math.round(n * 0.55)),
    plane  : Math.max(6, 22 - n * 1.2),
    mines  : n === 0 ? 0 : Math.min(30, 3 + Math.round(n * 2.2)),
    eHp    : Math.round(40 * (1 + k * 0.20)),
    eDmg   : +(8 * (1 + k * 0.085)).toFixed(2),
    bHp    : Math.round(60 * (1 + k * 0.19)),
    baseHp : Math.round(170 * (1 + k * 0.19)),
    bossHp : Math.round(2600 * (1 + c * 0.55)),
    boss   : isBossLevel(n)
  };
}

/* ---------- типы вражеских кораблей ---------- */
const SHIP_TYPES = {
  patrol : { name:'КАТЕР',   hp:0.55, spd:112, turn:2.2, rng:190, cd:[0.9,1.3],  dmg:0.55, salvo:1, reward:90, r:6,  radar:300 },
  gun    : { name:'КАНОНЕР', hp:1.00, spd:85,  turn:1.7, rng:250, cd:[1.5,2.3],  dmg:1.00, salvo:2, reward:150, r:7,  radar:340 },
  missile: { name:'РАКЕТНЫЙ',hp:0.85, spd:78,  turn:1.5, rng:380, cd:[3.0,4.2],  dmg:1.00, salvo:1, reward:240, r:7,  radar:420, homing:true, keep:300 },
  frigate: { name:'ФРЕГАТ',  hp:2.60, spd:66,  turn:1.1, rng:300, cd:[1.9,2.6],  dmg:1.35, salvo:3, reward:460, r:10, radar:400, tough:true }
};

/* авианалёт / прочее */
const BOSS = { hp: 2600 };   /* базовое значение, на уровне берётся curCfg.bossHp */

/* ---------- подводные лодки ---------- */
const SUB = {
  hp: 70, spd: 62, turn: 1.1, r: 8,
  range: 300,          /* с какой дистанции пускает торпеду */
  cd: [4.2, 6.4],
  torpDmg: 30, torpSpd: 105,
  reward: 420,
  surfaceAt: 0.34      /* ниже этой доли прочности вынуждена всплыть */
};

/* ---------- транспорт конвоя ---------- */
const CONVOY = { hp: 460, spd: 34, r: 16 };

/* ------------------------------------------------------------
   Экономика. Все выплаты собраны здесь, чтобы темп прокачки
   правился в одном месте. Полное дерево улучшений стоит ~27 000
   кредитов — это примерно четыре аккуратно пройденных уровня.
   ------------------------------------------------------------ */
const ECON = {
  base        : 260,   /* база противника        */
  bunker      : 60,    /* бункер                 */
  tower       : 260,   /* РЛС-вышка              */
  crate       : 110,   /* ящик снабжения         */
  crateAmmo   : 4,     /* ракет из ящика         */
  mine        : 40,    /* обезвреженная мина     */
  hostageTake : 20,    /* подобрать заложника    */
  hostageEvac : 150,   /* сдать на авианосец     */
  plane       : 120,
  planeHeavy  : 260,
  boss        : 1500,
  levelBonus  : lv => 400 + lv * 250,
  comboStep   : 0.15,  /* прирост множителя за каждую цель в серии */
  comboMax    : 4,     /* дальше множитель не растёт (макс x1.60)  */
  scoreMul    : 4,     /* очки идут отдельной, более щедрой шкалой */
  levelMul    : n => 1 + Math.min(n, 12) * 0.06
};

/* стоимость и правила прогресса вынесены в state.js */
