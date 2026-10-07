'use strict';
/* ============================================================
   meta.js — прогресс МЕЖДУ заходами: серия дней, паёк, задания
   дня, звание.

   Кампания по-прежнему начинается с нуля после гибели — в этом и
   есть игра. Здесь копится только то, ради чего стоит вернуться
   завтра: серия ежедневных заходов, накопленный счёт (звание) и
   склад снабжения, который выдаётся в начале следующей операции.

   Всё живёт в SETTINGS.meta и уезжает в localStorage вместе с
   настройками, так что отдельного хранилища не заводим.
   ============================================================ */

const DAY_MS = 86400000;

/* номер дня по местному времени: смена в полночь игрока, а не по UTC */
function metaDay() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY_MS);
}
/* сколько осталось до полуночи, секунд */
function metaTillMidnight() {
  const d = new Date();
  const ms = d.getTime() - d.getTimezoneOffset() * 60000;
  return Math.round((DAY_MS - (ms % DAY_MS)) / 1000);
}
/* «7 Ч 12 МИН» — fmtT здесь не годится, счёт идёт на часы */
function metaTillText() {
  const s = metaTillMidnight(), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? T('hqLeft', h, String(m).padStart(2, '0')) : T('hqLeftM', m);
}

const META_DEF = () => ({
  day: -1,          /* последний засчитанный день */
  streak: 0,        /* дней подряд */
  best: 0,          /* рекорд серии */
  total: 0,         /* всего дней с игрой */
  claimed: true,    /* получен ли сегодняшний паёк */
  doubled: false,   /* удваивали ли его роликом */
  dqDay: -1, dqProg: [0, 0, 0], dqDone: [0, 0, 0], dqBonus: 0,
  xp: 0,            /* накопленный счёт за всё время — звание */
  cr: 0, ammo: 0    /* склад: выдаётся в начале следующей операции */
});

const META = { ready: false };            /* ready — есть неполученный паёк */

/* ---------- ежедневный паёк ---------- */
/* Растёт семь дней, потом круг повторяется, но каждая новая неделя
   дороже: +25% к кредитам, максимум вчетверо. */
const DAY_REWARDS = [
  { cr: 300 },
  { ammo: 5 },
  { cr: 700 },
  { spin: 1 },
  { cr: 1200, ammo: 4 },
  { cr: 900, ammo: 10 },
  { cr: 2500, gold: 1 }
];

const dayIdx    = s => ((Math.max(1, s) - 1) % 7);
const weekMul   = s => 1 + Math.min(3, Math.floor((Math.max(1, s) - 1) / 7)) * 0.25;
const dayReward = s => DAY_REWARDS[dayIdx(s)];

/* короткая подпись на клетке календаря: до двух строк.
   В переводах «бесплатный прокрут» бывает длинным, поэтому режем
   по последнему пробелу — вторая строка в клетке всё равно свободна. */
const splitTag = s => {
  const i = s.lastIndexOf(' ');
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''];
};
function rewardTag(r) {
  if (r.gold) return splitTag(T('drGold'));
  if (r.spin) return splitTag(T('drSpin'));
  return [r.cr ? r.cr + ' ' + T('crShort') : '', r.ammo ? '+' + r.ammo + ' ' + T('rktShort') : ''];
}

/* ---------- звания ---------- */
/* Порог — накопленный счёт за все забеги. Каждое звание добавляет
   стартовых кредитов, поэтому давний игрок начинает чуть бодрее. */
const RANKS = [
  { xp: 0,       key: 'rk1' },
  { xp: 6000,    key: 'rk2' },
  { xp: 18000,   key: 'rk3' },
  { xp: 40000,   key: 'rk4' },
  { xp: 80000,   key: 'rk5' },
  { xp: 150000,  key: 'rk6' },
  { xp: 260000,  key: 'rk7' },
  { xp: 420000,  key: 'rk8' },
  { xp: 650000,  key: 'rk9' },
  { xp: 1000000, key: 'rk10' }
];
function rankOf(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const nx = RANKS[i + 1] || null;
  return {
    i: i, key: RANKS[i].key, cash: i * 120,
    next: nx, need: nx ? nx.xp - xp : 0,
    frac: nx ? (xp - RANKS[i].xp) / (nx.xp - RANKS[i].xp) : 1
  };
}
const metaRank = () => rankOf((SETTINGS.meta && SETTINGS.meta.xp) || 0);

/* накопленный счёт добавляем разницей: за забег платим один раз */
let metaXpPaid = 0;
function metaAddXp(total) {
  const M = SETTINGS.meta; if (!M) return;
  const add = Math.max(0, Math.round(total) - metaXpPaid);
  if (!add) return;
  const was = rankOf(M.xp).i;
  M.xp += add;
  metaXpPaid = Math.round(total);
  const now = rankOf(M.xp).i;
  if (now > was) {
    msg(T('rankUp', T(RANKS[now].key)), '#ffd94a', 4.5);
    if (typeof SFX !== 'undefined') SFX.evac();
  }
  saveSettings();
}

/* ---------- задания дня ---------- */
/* Три штуки, выбраны по номеру дня: назавтра набор другой, и это
   ещё один повод заглянуть. */
const DQ_POOL = [
  { id: 'ships',   goal: [14, 20, 26] },
  { id: 'planes',  goal: [8, 12, 16] },
  { id: 'bases',   goal: [4, 6, 8] },
  { id: 'bunkers', goal: [8, 12, 16] },
  { id: 'mines',   goal: [5, 8, 11] },
  { id: 'hostage', goal: [6, 9, 12] },
  { id: 'score',   goal: [12000, 20000, 30000] },
  { id: 'level',   goal: [3, 5, 7] },
  { id: 'boss',    goal: [1, 1, 2] },
  { id: 'streak',  goal: [5, 7, 9] }
];
const DQ_PAY = [400, 700, 1100];
const DQ_ALL_BONUS = 1500;

/* три РАЗНЫХ задания: шаг 3 взаимно прост с длиной пула (10) */
function dqToday(day) {
  const n = DQ_POOL.length;
  const start = Math.floor(h1(day * 3.71 + 1.3) * n) % n;
  const out = [];
  for (let k = 0; k < 3; k++) {
    const q = DQ_POOL[(start + k * 3) % n];
    const tier = Math.min(2, Math.floor(h1(day * 5.17 + k * 2.9) * 3));
    out.push({ id: q.id, goal: q.goal[tier], pay: DQ_PAY[tier] });
  }
  return out;
}

/* Прирост считаем поллингом счётчиков: не нужно дёргать десяток мест
   по всему коду, а сброс уровня видно по падению значения. */
let dqSnap = null;
const DQ_COUNTERS = ['ships', 'planes', 'bases', 'bunkers', 'mines', 'hostage', 'score', 'boss'];

function dqReset() { dqSnap = null; }

function dqSnapshot() {
  return {
    ships: kills.ships, planes: kills.planes, bases: kills.bases,
    bunkers: kills.bunkers, mines: kills.mines, hostage: rescued,
    score: score, boss: bossKilled ? 1 : 0
  };
}

function dqTick() {
  const M = SETTINGS.meta; if (!M) return;
  const cur = dqSnapshot();
  if (!dqSnap) { dqSnap = cur; return; }
  const list = dqToday(M.dqDay);
  for (let i = 0; i < 3; i++) {
    const q = list[i];
    if (M.dqDone[i]) continue;
    if (q.id === 'level') M.dqProg[i] = Math.max(M.dqProg[i], level + 1);
    else if (q.id === 'streak') M.dqProg[i] = Math.max(M.dqProg[i], comboBest);
    else if (DQ_COUNTERS.indexOf(q.id) >= 0) {
      let d = cur[q.id] - dqSnap[q.id];
      if (d < 0) d = cur[q.id];                    /* счётчик обнулился новым уровнем */
      if (d > 0) M.dqProg[i] += d;
    }
    if (M.dqProg[i] >= q.goal) dqComplete(i, q);
  }
  dqSnap = cur;
}

function dqComplete(i, q) {
  const M = SETTINGS.meta;
  M.dqDone[i] = 1;
  M.dqProg[i] = q.goal;
  metaGive(q.pay, 0);
  msg(T('dqDone', T('dq_' + q.id)), '#4ade80', 4);
  msg(T('dqPay', q.pay), '#ffd94a', 3, 0.6);
  if (typeof SFX !== 'undefined') SFX.evac();
  if (M.dqDone[0] && M.dqDone[1] && M.dqDone[2] && !M.dqBonus) {
    M.dqBonus = 1;
    metaGive(DQ_ALL_BONUS, 0);
    if (typeof crateT !== 'undefined') crateT = 0;   /* и барабан снова свободен */
    msg(T('dqAll', DQ_ALL_BONUS), '#ff9ad5', 5, 1.4);
  }
  saveSettings();
}

/* сколько заданий выполнено сегодня */
function dqDoneCount() {
  const M = SETTINGS.meta;
  return M ? M.dqDone.reduce((a, b) => a + (b ? 1 : 0), 0) : 0;
}

/* ---------- выдача наград ---------- */
/* В бою кладём прямо в кошелёк, из меню — на склад: он выдаётся
   в начале следующей операции, чтобы награда не пропала. */
const metaInRun = () => (state === 'play' || state === 'dying' || state === 'shop' ||
                         state === 'pause' || state === 'levelclear');

function metaGive(cr, ammo) {
  const M = SETTINGS.meta; if (!M) return;
  if (metaInRun()) {
    if (cr) money += cr;
    if (ammo) { upg.msl = 1; upg.ammo += ammo; }
  } else {
    M.cr += cr || 0;
    M.ammo += ammo || 0;
  }
  saveSettings();
}

/* склад и надбавка за звание — в начале новой кампании */
function metaStartBonus() {
  const M = SETTINGS.meta; if (!M) return { cr: 0, ammo: 0 };
  const cr = metaRank().cash + (M.cr || 0);
  const ammo = M.ammo || 0;
  money += cr;
  if (ammo) { upg.msl = 1; upg.ammo += ammo; }
  M.cr = 0; M.ammo = 0;
  metaXpPaid = 0;
  saveSettings();
  return { cr: cr, ammo: ammo };
}

/* прибавка к кредитам за серию дней: +3% в день, не больше +30% */
function metaCashMul() {
  const M = SETTINGS.meta;
  return M ? 1 + Math.min(10, M.streak) * 0.03 : 1;
}
const metaStreakPct = () => Math.round((metaCashMul() - 1) * 100);

/* ------------------------------------------------------------
   Снимок текущей операции. Площадка требует, чтобы обновление
   страницы или поворот экрана не стирали прогресс. Гибель его
   по-прежнему стирает — в этом и есть смысл забега.
   ------------------------------------------------------------ */
function runSave() {
  SETTINGS.run = { lvl: level, money: Math.round(money), score: Math.round(score), upg: Object.assign({}, upg) };
  saveSettings();
}
function runClear() {
  if (!SETTINGS.run) return;
  SETTINGS.run = null;
  saveSettings();
}
function runRestore() {
  const r = SETTINGS.run;
  if (!r || !r.upg) return false;
  money = r.money | 0;
  score = r.score | 0;
  for (const k in upg) if (r.upg[k] !== undefined) upg[k] = r.upg[k] | 0;
  metaXpPaid = Math.round(score);      /* этот счёт уже учтён в звании */
  dqReset();
  startLevel(r.lvl | 0);
  return true;
}
const runPending = () => !!(SETTINGS.run && SETTINGS.run.upg);

/* ---------- запуск ---------- */
function metaBoot() {
  const def = META_DEF();
  if (!SETTINGS.meta) SETTINGS.meta = def;
  const M = SETTINGS.meta;
  for (const k in def) if (M[k] === undefined) M[k] = def[k];

  const d = metaDay();
  if (M.day !== d) {
    M.streak = (d - M.day === 1) ? M.streak + 1 : 1;   /* пропустил день — серия с начала */
    M.day = d;
    M.total++;
    M.claimed = false;
    M.doubled = false;
    if (M.streak > M.best) M.best = M.streak;
  }
  if (M.dqDay !== d) { M.dqDay = d; M.dqProg = [0, 0, 0]; M.dqDone = [0, 0, 0]; M.dqBonus = 0; }
  META.ready = !M.claimed;
  saveSettings();
}

/* Паёк первого дня — сам на первой победе. В версии для CrazyGames новичок
   попадает сразу в бой и в первый день штаба не видит; а ежедневная
   награда — главный повод вернуться завтра, её надо показать сразу. */
let rationNote = '', rationLvl = -1;
function metaAutoRation() {
  const M = SETTINGS.meta;
  if (!M || M.claimed || M.total > 1) return;
  const tag = rewardTag(dayReward(M.streak));
  metaClaim(false);
  rationNote = T('rationGot', (tag[0] + ' ' + tag[1]).trim());
  rationLvl = level;
}

/* выдать сегодняшний паёк; x2 — после просмотра ролика */
function metaClaim(x2) {
  const M = SETTINGS.meta;
  if (!M || M.claimed) return;
  const r = dayReward(M.streak);
  const k = weekMul(M.streak) * (x2 ? 2 : 1);
  M.claimed = true;
  M.doubled = !!x2;
  META.ready = false;

  if (r.cr) metaGive(Math.round(r.cr * k), 0);
  if (r.ammo) metaGive(0, Math.round(r.ammo * (x2 ? 2 : 1)));
  if (r.spin && typeof crateT !== 'undefined') crateT = 0;
  if (r.gold) {
    const left = perksLeft();
    if (left.length) grantPerk(pick(left).perk);
    else metaGive(Math.round(3000 * k), 0);
  }
  saveSettings();
}
