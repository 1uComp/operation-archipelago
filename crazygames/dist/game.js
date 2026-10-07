'use strict';
/* Operation Archipelago CG bundle v37 (49 files) */

/* ===== src/core/settings.js ===== */
;
'use strict';
/* ============================================================
   settings.js — пользовательские настройки.

   Грузится ПЕРВЫМ: из него config.js берёт масштаб рендера SC.
   Значения хранятся в localStorage и переживают перезагрузку.
   ============================================================ */

/* Свой ключ хранилища: сборки для разных площадок лежат рядом и с
   одного адреса читали бы чужие настройки — в том числе чужой язык. */
const SETTINGS_KEY = 'arhipelag.cg.settings.v1';

function detectTouch() {
  return (typeof window !== 'undefined') &&
         /* телефон/планшет: основной указатель — палец. Ноутбук с сенсорным
            экраном сюда не попадает, иначе WASD переставал работать */
         !!(window.matchMedia && matchMedia('(pointer: coarse)').matches &&
            !matchMedia('(hover: hover)').matches);
}
/* Основной язык игры — английский. Меняется в настройках;
   чтобы игра сама подхватывала язык браузера, замените тело на
   detectBrowserLang(). */
function detectLang() { return 'en'; }

/* язык браузера, если он есть среди переводов */
function detectBrowserLang() {
  const l = (navigator.language || 'en').toLowerCase().slice(0, 2);
  const map = { uk: 'ru', be: 'ru', kk: 'ru' };
  const c = map[l] || l;
  return (typeof langOk === 'function' && langOk(c)) ? c : 'en';
}

/* Качество рендера по умолчанию: слабым машинам сразу даём низкое.
   Холст 1920x1080 на встроенной графике = лаги в первые секунды, а лаги
   в первую минуту — это выход из игры (gameplay conversion). Действует
   только для новых игроков; сохранённое значение не трогаем. */
function defaultQuality() {
  const base = detectTouch() ? 3 : 4;   /* 4 = 1920x1080, 3 = 1440x810, 2 = 960x540 */
  try {
    const mem = navigator.deviceMemory || 8;         /* только Chrome, ГБ */
    const cpu = navigator.hardwareConcurrency || 8;
    if (mem <= 4 || cpu <= 4) return Math.max(2, base - 1);
  } catch (e) {}
  return base;
}

function defaultSettings() {
  const touch = detectTouch();
  return {
    lang    : detectLang(),        /* код из LANG_LIST, по умолчанию 'en' */
    langSet : false,               /* язык выбран игроком вручную */
    controls: 'auto',              /* 'auto' | 'keys' | 'touch' */
    quality : defaultQuality(),
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
    played  : false,               /* хоть раз выходил в море: новичка сразу в бой */
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

/* ===== src/core/i18n.js ===== */
;
'use strict';
/* ============================================================
   i18n.js — словарь и подстановка строк.

   T('key', a, b) вернёт строку текущего языка, подставив %1, %2.
   Каждая запись — [русский, english].
   ============================================================ */

const STR = {
  /* ---------- интерфейс боя ---------- */
  hull:        ['КОРПУС', 'HULL'],
  boost:       ['ФОРСАЖ', 'BOOST'],
  knots:       ['УЗ %1', 'KT %1'],
  repairing:   ['РЕМОНТ', 'REPAIR'],
  pdShort:     ['ПВО', 'CIWS'],
  alert:       ['ТРЕВОГА', 'ALERT'],
  radar:       ['РАДАР', 'RADAR'],
  radarOpen:   ['РАДАР • РЛС ВЗЯТА', 'RADAR • NET DOWN'],
  lvlBases:    ['УР.%1 • БАЗЫ %2/%3', 'LV.%1 • BASES %2/%3'],
  rescuedN:    ['СПАСЕНО %1', 'RESCUED %1'],
  missilesN:   ['РАКЕТЫ:%1', 'ROCKETS:%1'],
  boostHint:   ['SHIFT — ФОРСАЖ', 'SHIFT — BOOST'],
  scoreLbl:    ['СЧЁТ', 'SCORE'],
  creditsLbl:  ['КРЕДИТЫ', 'CREDITS'],
  streakN:     ['СЕРИЯ %1', 'STREAK %1'],
  arsenalHint: ['E — АРСЕНАЛ', 'E — ARSENAL'],
  arsenalTap:  ['АРСЕНАЛ', 'ARSENAL'],
  critical:    ['ПОВРЕЖДЕНИЯ КРИТИЧЕСКИЕ', 'CRITICAL DAMAGE'],

  /* ---------- имена ---------- */
  gameTitle:   ['АРХИПЕЛАГ', 'ARCHIPELAGO'],
  operation:   ['— О П Е Р А Ц И Я —', '— O P E R A T I O N —'],
  carrier:     ['«СЕВЕР»', '"NORTH"'],
  bossName:    ['ЛИНКОР «ЛЕВИАФАН»', 'BATTLESHIP "LEVIATHAN"'],
  bossName2:   ['АВИАНОСЕЦ «ГРОЗА»', 'CARRIER "TEMPEST"'],
  bossName3:   ['МОНИТОР «КРЕПОСТЬ»', 'MONITOR "FORTRESS"'],
  transport:   ['ТРАНСПОРТ «ЛАДОГА»', 'TRANSPORT "LADOGA"'],

  lvl1: ['ПЕРИМЕТР', 'PERIMETER'],
  lvl2: ['ШТОРМОВОЙ ПРОЛИВ', 'STORM STRAIT'],
  lvl3: ['КРАСНЫЕ РИФЫ', 'RED REEFS'],
  lvl4: ['ЧЁРНАЯ ОТМЕЛЬ', 'BLACK SHOALS'],
  lvl5: ['СЕРДЦЕ АРХИПЕЛАГА', 'HEART OF THE ARCHIPELAGO'],

  isl_fang:   ['КЛЫК', 'FANG'],
  isl_thund:  ['ГРОМ', 'THUNDER'],
  isl_raid:   ['РЕЙД', 'RAID'],
  isl_serp:   ['ЗМЕЙ', 'SERPENT'],
  isl_storm:  ['ШТОРМ', 'STORM'],
  isl_ash:    ['ПЕПЕЛ', 'ASHES'],
  isl_crab:   ['КРАБ', 'CRAB'],
  isl_gloom:  ['МРАК', 'GLOOM'],
  isl_needle: ['ИГЛА', 'NEEDLE'],
  isl_wolf:   ['ВОЛК', 'WOLF'],
  isl_fort:   ['ФОРТ', 'FORT'],
  isl_breeze: ['БРИЗ', 'BREEZE'],
  isl_shark:  ['АКУЛА', 'SHARK'],
  isl_cape:   ['МЫС', 'CAPE'],
  isl_reef:   ['РИФ', 'REEF'],
  isl_anchor: ['ЯКОРЬ', 'ANCHOR'],

  /* ---------- сообщения боя ---------- */
  mObjective:  ['ЦЕЛЬ: УНИЧТОЖИТЬ БАЗЫ ПРОТИВНИКА — %1', 'OBJECTIVE: DESTROY ENEMY BASES — %1'],
  mCarryHome:  ['ЗАЛОЖНИКОВ ВЕЗИТЕ НА АВИАНОСЕЦ %1', 'TAKE HOSTAGES TO CARRIER %1'],
  mArsenal:    ['E — АРСЕНАЛ РЯДОМ С АВИАНОСЦЕМ', 'E — ARSENAL NEAR THE CARRIER'],
  mArsenalT:   ['АРСЕНАЛ ОТКРЫТ У АВИАНОСЦА', 'ARSENAL OPENS AT THE CARRIER'],
  mMines:      ['ВНИМАНИЕ: МИННЫЕ БАНКИ У ОСТРОВОВ', 'WARNING: MINEFIELDS AROUND THE ISLANDS'],
  mAllTargets: ['ВСЕ ЦЕЛИ ПОРАЖЕНЫ! ОТХОД!', 'ALL TARGETS DOWN! WITHDRAW!'],
  mBaseDown:   ['БАЗА УНИЧТОЖЕНА: О. %1', 'BASE DESTROYED: %1 ISLAND'],
  mAllBases:   ['ВСЕ БАЗЫ УНИЧТОЖЕНЫ!', 'ALL BASES DESTROYED!'],
  mBasesLeft:  ['ТРЕВОГА ПОВЫШЕНА — ОСТАЛОСЬ БАЗ: %1', 'ALERT RAISED — BASES LEFT: %1'],
  mRadarDown:  ['РЛС ПРОТИВНИКА УНИЧТОЖЕНА — РАДАР ОТКРЫТ', 'ENEMY RADAR DESTROYED — MAP REVEALED'],
  mDistress:   ['СИГНАЛ БЕДСТВИЯ: О. %1 — %2 ЧЕЛ.', 'DISTRESS CALL: %1 ISLAND — %2 PEOPLE'],
  mSlowDown:   ['СБРОСЬТЕ ХОД РЯДОМ С ЗАЛОЖНИКАМИ', 'SLOW DOWN NEXT TO THE HOSTAGES'],
  mTakeThem:   ['ВЕЗИТЕ ЗАЛОЖНИКОВ НА АВИАНОСЕЦ %1', 'CARRY THE HOSTAGES TO %1'],
  mEvacuated:  ['ЭВАКУИРОВАНО: %1 — ЭКИПАЖ БЛАГОДАРИТ', 'EVACUATED: %1 — THE CREW THANKS YOU'],
  mNoLauncher: ['РАКЕТЫ НЕ УСТАНОВЛЕНЫ — КУПИТЕ В АРСЕНАЛЕ', 'NO LAUNCHER — BUY ONE IN THE ARSENAL'],
  mNoAmmo:     ['НЕТ РАКЕТ — ПОПОЛНИТЕ БОЕЗАПАС', 'OUT OF ROCKETS — RESUPPLY'],
  mBossComing: ['НА ПЕРЕХВАТ ИДЁТ %1', '%1 IS MOVING TO INTERCEPT'],
  mBossSalvo:  ['ЗАЛП «ЛЕВИАФАНА»!', 'LEVIATHAN SALVO!'],
  mBossLaunch: ['С ПАЛУБЫ ПОДНИМАЕТСЯ АВИАГРУППА', 'THE AIR GROUP IS LAUNCHING'],
  mBossDown:   ['%1 ПОТОПЛЕН!', '%1 SUNK!'],
  mAirTarget:  ['ВОЗДУШНАЯ ЦЕЛЬ: БОМБАРДИРОВЩИК', 'AIR CONTACT: BOMBER'],
  mSoundOn:    ['ЗВУК ВКЛЮЧЁН', 'SOUND ON'],
  mSoundOff:   ['ЗВУК ВЫКЛЮЧЕН', 'SOUND OFF'],
  mAlarm:      ['ТРЕВОГА', 'ALERT'],
  fRepair:     ['+РЕМОНТ', '+REPAIR'],
  fRockets:    ['+%1 РАКЕТЫ', '+%1 ROCKETS'],
  fCredits:    ['+%1 кр', '+%1 cr'],

  /* ---------- типы миссий ---------- */
  mTypeAssault:['ШТУРМ', 'ASSAULT'],
  mTypeNight:  ['НОЧНАЯ ОПЕРАЦИЯ', 'NIGHT OPERATION'],
  mTypeEscort: ['ДЕСАНТ', 'LANDING'],
  mTypeBoss:   ['ПЕРЕХВАТ', 'INTERCEPT'],
  mTypeConvoy: ['КОНВОЙ', 'CONVOY'],

  objConvoy:   ['ЦЕЛЬ: ПРОВЕСТИ %1 ДО О. %2', 'OBJECTIVE: ESCORT %1 TO %2 ISLAND'],
  objConvoy2:  ['ЕСЛИ ТРАНСПОРТ ПОЙДЁТ КО ДНУ — ЗАДАНИЕ СОРВАНО',
                'IF THE TRANSPORT GOES DOWN THE MISSION IS LOST'],
  hudConvoy:   ['УР.%1 • КОНВОЙ %2%', 'LV.%1 • CONVOY %2%'],
  mConvoyHit:  ['ТРАНСПОРТ ПОД ОГНЁМ!', 'THE TRANSPORT IS UNDER FIRE!'],
  mConvoyLost: ['ТРАНСПОРТ ПОТОПЛЕН', 'THE TRANSPORT IS SUNK'],
  mConvoyDone: ['ТРАНСПОРТ НА МЕСТЕ', 'THE TRANSPORT HAS ARRIVED'],

  mSubs:       ['ГИДРОАКУСТИКА: ПОДВОДНЫЕ ЛОДКИ', 'SONAR: SUBMARINES IN THE AREA'],
  mSubNear:    ['ШУМ ВИНТОВ ПОД ВОДОЙ', 'SCREW NOISE BELOW'],
  mSubSurface: ['ЛОДКА ВСПЛЫЛА — БЕЙ!', 'SUB HAS SURFACED — HIT IT!'],
  mNoDC:       ['НУЖНЫ ГЛУБИННЫЕ БОМБЫ — АРСЕНАЛ', 'YOU NEED DEPTH CHARGES — ARSENAL'],
  hudSmoke:    ['ДЫМ', 'SMOKE'],
  hudDC:       ['БОМБЫ', 'CHARGES'],
  mSmokeHint:  ['F — ДЫМОВАЯ ЗАВЕСА, СБИВАЕТ ЛУЧИ И ПРИЦЕЛ',
                'F — SMOKE SCREEN, BREAKS BEAMS AND AIM'],
  itDC:        ['ГЛУБИННЫЕ БОМБЫ', 'DEPTH CHARGES'],
  itDCD:       ['Сброс за корму клавишей Q. Достаёт подлодки', 'Drop astern with Q. Reaches submarines'],

  objAssault:  ['ЦЕЛЬ: УНИЧТОЖИТЬ БАЗЫ ПРОТИВНИКА — %1', 'OBJECTIVE: DESTROY ENEMY BASES — %1'],
  objNight:    ['ЦЕЛЬ: ТИХО ВЫВЕЗТИ ПЛЕННЫХ — %1 ЧЕЛ.', 'OBJECTIVE: QUIETLY EXTRACT %1 PRISONERS'],
  objNight2:   ['НЕ ПОПАДАЙТЕСЬ В ЛУЧИ МАЯКОВ', 'STAY OUT OF THE LIGHTHOUSE BEAMS'],
  objEscort:   ['ЦЕЛЬ: ЗАБРАТЬ МОРПЕХОВ С О. %1', 'OBJECTIVE: PICK UP MARINES FROM %1 ISLAND'],
  objEscort2:  ['ВЫСАДИТЬ ИХ НА О. %1 И ЗАЧИСТИТЬ ЕГО', 'LAND THEM ON %1 ISLAND AND CLEAR IT'],
  hudNight:    ['УР.%1 • ПЛЕННЫЕ %2/%3', 'LV.%1 • PRISONERS %2/%3'],
  hudEscort:   ['УР.%1 • ДЕСАНТ %2/%3 • ЦЕЛЬ %4/%5', 'LV.%1 • TROOPS %2/%3 • TARGET %4/%5'],
  hudStealth:  ['СКРЫТНОСТЬ', 'STEALTH'],
  hudBlown:    ['ОБНАРУЖЕНЫ', 'DETECTED'],

  mMarinesUp:  ['МОРПЕХИ НА БОРТУ: %1', 'MARINES ABOARD: %1'],
  mAllyAboard: ['СВОЙ НА БОРТУ: %1 СТРЕЛОК', 'ALLY ABOARD: %1 GUNNER(S)'],
  mAllyLost:   ['СТРЕЛКА СМЫЛО ЗА БОРТ', 'A GUNNER WENT OVERBOARD'],
  mFriendly:   ['СВОИ ПРИЧАЛЫ НА КАРТЕ: РЕМОНТ И СТРЕЛКИ',
                'FRIENDLY PIERS ON THE MAP: REPAIRS AND GUNNERS'],
  mMarinesGo:  ['ВЫСАДКА! ПОДАВИТЕ ОГНЕВЫЕ ТОЧКИ', 'LANDING! SUPPRESS THE GUN POSTS'],
  mMarinesDead:['ДЕСАНТ ПОЛЁГ — ДОБИВАЙТЕ САМИ', 'THE SQUAD IS GONE — FINISH IT YOURSELF'],
  mTargetDone: ['ОСТРОВ ЗАЧИЩЕН', 'ISLAND CLEARED'],
  mSpotted:    ['ВАС ЗАСЕКЛИ! ТРЕВОГА ПО ВСЕМУ РАЙОНУ', 'YOU ARE SPOTTED! THE AREA IS ON ALERT'],
  mBeamWarn:   ['ЛУЧ МАЯКА — УХОДИТЕ В ТЕНЬ', 'BEAM ON YOU — GET INTO THE DARK'],
  mTornado:    ['ШТОРМОВОЕ ПРЕДУПРЕЖДЕНИЕ: СМЕРЧИ', 'STORM WARNING: WATERSPOUTS'],
  mTornadoNear:['СМЕРЧ РЯДОМ!', 'WATERSPOUT CLOSE!'],
  stStealth:   ['ПРОШЛИ НЕЗАМЕЧЕННЫМИ', 'STAYED UNDETECTED'],
  yesWord:     ['ДА', 'YES'],
  noWord:      ['НЕТ', 'NO'],

  /* ---------- арсенал ---------- */
  shopTitle:   ['АРСЕНАЛ АВИАНОСЦА %1', 'ARSENAL OF CARRIER %1'],
  shopCredits: ['КРЕДИТЫ: %1', 'CREDITS: %1'],
  shopMax:     ['МАКС', 'MAX'],
  shopCost:    ['%1 кр', '%1 cr'],
  shopPick:    ['ВЫБЕРИТЕ УЛУЧШЕНИЕ', 'SELECT AN UPGRADE'],
  shopKeys:    ['↑↓ ВЫБОР • ENTER / ЛКМ — КУПИТЬ • E — ВЫХОД', '↑↓ SELECT • ENTER / LMB — BUY • E — EXIT'],
  shopTouch:   ['КОСНИТЕСЬ ДВАЖДЫ — КУПИТЬ • ЗАКРЫТЬ ✕', 'TAP TWICE TO BUY • CLOSE ✕'],
  shopNoNeed:  ['СЕЙЧАС НЕ ТРЕБУЕТСЯ', 'NOT NEEDED RIGHT NOW'],
  shopMaxed:   ['МАКСИМАЛЬНЫЙ УРОВЕНЬ', 'MAXIMUM LEVEL'],
  shopPoor:    ['НЕДОСТАТОЧНО КРЕДИТОВ', 'NOT ENOUGH CREDITS'],
  shopBought:  ['КУПЛЕНО: %1', 'PURCHASED: %1'],

  itRepair:    ['РЕМОНТ КОРПУСА', 'HULL REPAIR'],
  itRepairD:   ['Восстановить +40 прочности', 'Restore +40 hull points'],
  itArmor:     ['БРОНЯ', 'ARMOUR'],
  itArmorD:    ['+25 к максимальной прочности корпуса', '+25 to maximum hull points'],
  itGun:       ['ОРУДИЕ', 'MAIN GUN'],
  itGunD:      ['+4 к урону каждого снаряда', '+4 damage per shell'],
  itRate:      ['АВТОМАТИКА', 'AUTOLOADER'],
  itRateD:     ['+12% к темпу огня главного калибра', '+12% main gun rate of fire'],
  itEngine:    ['ДВИГАТЕЛЬ', 'ENGINE'],
  itEngineD:   ['+12% к ходу и манёвренности', '+12% speed and handling'],
  itBoost:     ['ФОРСАЖ', 'AFTERBURNER'],
  itBoostD:    ['Больше запаса и быстрее восстановление', 'More reserve, faster recharge'],
  itMissile:   ['РАКЕТЫ «ГАРПУН»', 'HARPOON ROCKETS'],
  itMissileD:  ['Самонаводящиеся ракеты. Пуск — ПКМ (+6 шт)', 'Homing rockets. Fire with RMB (+6)'],
  itAmmo:      ['РАКЕТЫ +6 ШТ', 'ROCKETS +6'],
  itAmmoD:     ['Пополнить боезапас «Гарпунов»', 'Resupply Harpoon rockets'],
  itBoat:      ['ШЛЮПКА', 'LIFEBOAT'],
  itBoatD:     ['+2 места для заложников на борту', '+2 hostage seats aboard'],
  itPd:        ['ПВО «ОСА»', 'CIWS "WASP"'],
  itPdD:       ['Сбивает вражеские снаряды и ракеты', 'Shoots down incoming shells and rockets'],
  itRadar:     ['РАДАР', 'RADAR'],
  itRadarD:    ['+330 к дальности обнаружения целей', '+330 detection range'],

  /* ---------- реклама и покупки ---------- */
  adWatching:  ['РЕКЛАМА…', 'ADVERTISEMENT…'],
  adDemo:      ['ДЕМО-РОЛИК (ВНЕ ПЛОЩАДКИ)', 'DEMO SPOT (OUTSIDE CRAZYGAMES)'],
  adFailed:    ['РОЛИК НЕ ЗАГРУЗИЛСЯ', 'THE SPOT DID NOT LOAD'],
  adLoading:   ['ЗАГРУЗКА РЕКЛАМЫ…', 'LOADING AD…'],
  retryBtn:    ['УРОВЕНЬ ЗАНОВО', 'RETRY MISSION'],
  ev_drop:    ['СБРОС ПРИПАСОВ', 'SUPPLY DROP'],
  ev_ace:     ['ВРАЖЕСКИЙ АС', 'ENEMY ACE'],
  ev_pilot:   ['СБИТЫЙ ЛЁТЧИК', 'DOWNED PILOT'],
  ev_cargo:   ['КАРАВАН БАРЖ', 'CARGO RUN'],
  ev_raid:    ['АВИАНАЛЁТ', 'AIR RAID'],
  ev_loot:    ['ГРУЗ В ВОДЕ', 'FLOATING CARGO'],
  evDropMsg:  ['НАШ САМОЛЁТ СБРОСИЛ КОНТЕЙНЕР — ЗАБЕРИТЕ РАНЬШЕ ВРАГА', 'OUR PLANE DROPPED A CRATE — GRAB IT BEFORE THE ENEMY'],
  evAceMsg:   ['ВРАЖЕСКИЙ АС ВЫШЕЛ НА ОХОТУ — НАГРАДА x3', 'AN ENEMY ACE IS HUNTING YOU — BOUNTY x3'],
  evPilotMsg: ['НАШ ЛЁТЧИК В ВОДЕ — ПОДБЕРИТЕ НА МАЛОМ ХОДУ', 'OUR PILOT IS IN THE WATER — PICK UP AT LOW SPEED'],
  evCargoMsg: ['БАРЖИ ВРАГА ВЕЗУТ ГРУЗ — ПОТОПИТЕ ВСЕ', 'ENEMY BARGES CARRY CARGO — SINK THEM ALL'],
  evRaidMsg:  ['АВИАНАЛЁТ! СБЕЙТЕ ВСЁ ЗВЕНО', 'AIR RAID! SHOOT DOWN THE WHOLE FLIGHT'],
  evLootMsg:  ['В ВОДЕ ПЛАВАЕТ ГРУЗ — СОБЕРИТЕ ВСЁ', 'CARGO IS FLOATING — COLLECT IT ALL'],
  evOk:       ['ВЫПОЛНЕНО', 'COMPLETE'],
  evFail:     ['НЕ УСПЕЛИ', 'TOO LATE'],
  evLost:     ['ВРАГ ПЕРЕХВАТИЛ КОНТЕЙНЕР', 'THE ENEMY GRABBED THE CRATE'],
  evCargoEsc: ['БАРЖ ПОТОПЛЕНО: %1 ИЗ %2', 'BARGES SUNK: %1 OF %2'],
  evAceTag:   ['АС', 'ACE'],
  bfTriple:   ['ТРОЙНОЙ', 'TRIPLE'],
  bfRapid:    ['СКОРОСТРЕЛ', 'RAPID'],
  bfShield:   ['ЩИТ', 'SHIELD'],
  bfNitro:    ['НИТРО', 'NITRO'],
  bfGot:      ['%1 НА %2 С', '%1 FOR %2 S'],
  mHeliEvac:  ['ВЕРТОЛЁТ ЗАБРАЛ ЗАЛОЖНИКОВ: %1', 'HELICOPTER PICKED UP HOSTAGES: %1'],
  tutTitle:   ['ОБУЧЕНИЕ %1/%2', 'TUTORIAL %1/%2'],
  tut1:       ['ПЛЫВИТЕ — КЛАВИШИ WASD', 'SAIL WITH THE WASD KEYS'],
  tut1T:      ['ВЕДИТЕ КАТЕР ЛЕВЫМ ПАЛЬЦЕМ', 'STEER WITH YOUR LEFT THUMB'],
  tut2:       ['ЦЕЛЬТЕСЬ МЫШЬЮ, ЛЕВАЯ КНОПКА — ОГОНЬ', 'AIM WITH THE MOUSE, LEFT BUTTON FIRES'],
  tut2T:      ['ПУШКА БЬЁТ САМА — ПЛЫВИТЕ К ВРАГУ', 'THE GUN FIRES ITSELF — SAIL TO THE ENEMY'],
  tut3:       ['ЗАДАЧА — ВВЕРХУ ЭКРАНА. ПОТОПИТЕ ВРАГА', 'YOUR GOAL IS AT THE TOP. SINK AN ENEMY'],
  tut4:       ['АВИАНОСЕЦ ЧИНИТ КАТЕР, ТАМ ЖЕ АРСЕНАЛ', 'THE CARRIER REPAIRS YOU AND HAS THE ARSENAL'],
  tut4T:      ['АВИАНОСЕЦ ЧИНИТ КАТЕР, ТАМ ЖЕ АРСЕНАЛ', 'THE CARRIER REPAIRS YOU AND HAS THE ARSENAL'],
  tut5:       ['УМЕНИЯ: F — ДЫМ, SHIFT — ФОРСАЖ', 'SKILLS: F — SMOKE, SHIFT — BOOST'],
  tut5T:      ['КНОПКИ СПРАВА: ФОРСАЖ И ДЫМ', 'RIGHT BUTTONS: BOOST AND SMOKE'],
  tutDone:    ['ГОТОВО! УДАЧИ, КОМАНДИР!', 'DONE! GOOD LUCK, COMMANDER!'],
  reviveFree:  ['ВТОРОЙ ШАНС', 'SECOND CHANCE'],
  mercyMsg:    ['ШТАБ ПОМОГАЕТ: ВРАГ СЛАБЕЕ, БРОНЯ +%1%', 'HQ SENDS HELP: WEAKER ENEMY, ARMOR +%1%'],
  adNoFill:    ['РОЛИК НЕ ЗАГРУЗИЛСЯ — НАГРАДА ВЫДАНА', 'NO SPOT AVAILABLE — REWARD GRANTED'],
  adWait:      ['РОЛИК БУДЕТ ДОСТУПЕН ЧЕРЕЗ %1 С', 'AVAILABLE IN %1 S'],

  revive:      ['ВОЗРОДИТЬСЯ ЗА РОЛИК', 'REVIVE FOR AN AD'],
  reviveT:     ['КОСНИТЕСЬ — ВОЗРОДИТЬСЯ ЗА РОЛИК', 'TAP — REVIVE FOR AN AD'],
  reviveDone:  ['КОРАБЛЬ ВОССТАНОВЛЕН', 'SHIP RESTORED'],
  reviveNone:  ['ВОЗРОЖДЕНИЕ УЖЕ ИСПОЛЬЗОВАНО', 'REVIVE ALREADY USED'],

  itAdAmmo:    ['+8 РАКЕТ ЗА РОЛИК', '+8 ROCKETS FOR AN AD'],
  itAdAmmoD:   ['Короткий ролик — и боезапас пополнен', 'A short spot and the magazine is full'],
  itCrate:     ['ИРП УДАЧИ', 'LUCKY SUPPLY BOX'],
  itCrateD:    ['Крутить барабан: кредиты, ракеты, редкий главный приз',
                'Spin the drum: credits, rockets, a rare grand prize'],
  adFree:      ['БЕСПЛАТНО', 'FREE'],

  /* донатные вещи */
  itHull:      ['АДМИРАЛЬСКИЙ КОРПУС', 'ADMIRAL HULL'],
  itHullD:     ['Навсегда: +40 прочности, +10% хода, место для пятого стрелка',
                'Forever: +40 hull, +10% speed, a fifth gunner slot'],
  itHarp:      ['ЗОЛОТОЙ «ГАРПУН»', 'GOLDEN HARPOON'],
  itHarpD:     ['Навсегда: +35% урона ракет и запас не падает ниже четырёх',
                'Forever: +35% rocket damage, never below four in stock'],
  ownedWord:   ['КУПЛЕНО', 'OWNED'],
  buyFail:     ['ПОКУПКА НЕ СОСТОЯЛАСЬ', 'THE PURCHASE DID NOT GO THROUGH'],
  buyOk:       ['ПОЛУЧЕНО: %1', 'UNLOCKED: %1'],

  /* барабан */
  crateTitle:  ['ИРП УДАЧИ', 'LUCKY SUPPLY BOX'],
  crateSpin:   ['КРУТИТЬ', 'SPIN'],
  crateAd:     ['ЕЩЁ РАЗ ЗА РОЛИК', 'SPIN AGAIN FOR AN AD'],
  crateWaitN:  ['БЕСПЛАТНО ЧЕРЕЗ %1', 'FREE IN %1'],
  crateAdWait: ['РОЛИК ЧЕРЕЗ %1', 'AD IN %1'],
  crateClose:  ['E / ESC — ЗАКРЫТЬ', 'E / ESC — CLOSE'],
  crateCloseT: ['ЗАКРЫТЬ ✕', 'CLOSE ✕'],
  crateWon:    ['ВЫПАЛО: %1', 'YOU GOT: %1'],
  crateJack:   ['ГЛАВНЫЙ ПРИЗ!', 'GRAND PRIZE!'],
  przCredits:  ['%1 КРЕДИТОВ', '%1 CREDITS'],
  przAmmo:     ['%1 РАКЕТ', '%1 ROCKETS'],
  przRepair:   ['РЕМОНТ И ФОРСАЖ', 'REPAIR AND BOOST'],
  przDC:       ['ГЛУБИННЫЕ БОМБЫ', 'DEPTH CHARGES'],
  przJack:     ['ДОНАТНАЯ ВЕЩЬ', 'PREMIUM ITEM'],
  przNothing:  ['ПУСТО', 'NOTHING'],
  /* короткие подписи на секторах барабана — влезают в сектор */
  tagNone:     ['ПУСТО', 'EMPTY'],
  tagFix:      ['РЕМ', 'FIX'],

  /* ---------- заставка ---------- */
  subtitle:    ['МОРСКАЯ ШТУРМОВАЯ КАМПАНИЯ БЕЗ КОНЦА', 'ENDLESS NAVAL STRIKE CAMPAIGN'],
  orders:      ['ПРИКАЗ:', 'ORDERS:'],
  ord1:        ['> УНИЧТОЖАЙТЕ БАЗЫ, БУНКЕРЫ И РЛС-ВЫШКИ', '> DESTROY BASES, BUNKERS AND RADAR MASTS'],
  ord2:        ['> ТОПИТЕ КОРАБЛИ, СБИВАЙТЕ САМОЛЁТЫ', '> SINK SHIPS, SHOOT DOWN AIRCRAFT'],
  ord3:        ['> СПАСАЙТЕ ЗАЛОЖНИКОВ И ВЕЗИТЕ НА %1', '> RESCUE HOSTAGES AND CARRY THEM TO %1'],
  ord4:        ['> ВСКРЫВАЙТЕ ЯЩИКИ СНАБЖЕНИЯ НА ОСТРОВАХ', '> CRACK OPEN SUPPLY CRATES ON THE ISLANDS'],
  ord5:        ['> СЕРИЯ БЫСТРЫХ ПОБЕД ПОВЫШАЕТ НАГРАДУ', '> QUICK KILL STREAKS RAISE THE PAYOUT'],
  ord6:        ['> КАЖДЫЙ ПЯТЫЙ УРОВЕНЬ — ФЛАГМАН ПРОТИВНИКА', '> EVERY FIFTH MISSION BRINGS AN ENEMY FLAGSHIP'],
  ord7:        ['> ОСТЕРЕГАЙТЕСЬ МИН И НОЧНЫХ ОТМЕЛЕЙ', '> BEWARE OF MINES AND NIGHT SHOALS'],
  keysLine1:   ['WASD — ХОД • SHIFT — ФОРСАЖ • ЛКМ — ОГОНЬ • ПКМ — РАКЕТЫ • F — ДЫМ • Q — БОМБЫ',
                'WASD — MOVE • SHIFT — BOOST • LMB — FIRE • RMB — ROCKETS • F — SMOKE • Q — CHARGES'],
  keysLine2:   ['E — АРСЕНАЛ • O — НАСТРОЙКИ • H — ШТАБ • M — ЗВУК • P — ПАУЗА',
                'E — ARSENAL • O — SETTINGS • H — HQ • M — SOUND • P — PAUSE'],
  touchLine1:  ['ЛЕВАЯ ПОЛОВИНА — ХОД • ПРАВАЯ — ПРИЦЕЛ И ОГОНЬ',
                'LEFT HALF — STEER • RIGHT HALF — AIM AND FIRE'],
  touchLine2:  ['КНОПКИ СПРАВА: ФОРСАЖ, РАКЕТА, ДЫМ, БОМБЫ, АРСЕНАЛ',
                'BUTTONS ON THE RIGHT: BOOST, ROCKET, SMOKE, CHARGES, ARSENAL'],
  pressStart:  ['► НАЖМИТЕ ПРОБЕЛ ИЛИ КЛИКНИТЕ ◄', '► PRESS SPACE OR CLICK ◄'],
  tapStart:    ['► КОСНИТЕСЬ ЭКРАНА ◄', '► TAP THE SCREEN ◄'],
  contStart:   ['► ПРОБЕЛ — ПРОДОЛЖИТЬ ОПЕРАЦИЮ, УРОВЕНЬ %1 ◄', '► SPACE — RESUME THE OPERATION, MISSION %1 ◄'],
  contStartT:  ['► КОСНИТЕСЬ — ПРОДОЛЖИТЬ, УРОВЕНЬ %1 ◄', '► TAP — RESUME, MISSION %1 ◄'],
  settingsHint:['O — НАСТРОЙКИ', 'O — SETTINGS'],
  settingsBtn: ['НАСТРОЙКИ', 'SETTINGS'],

  /* ---------- итоги ---------- */
  lvlDone:     ['УРОВЕНЬ %1 ПРОЙДЕН', 'MISSION %1 COMPLETE'],
  stBases:     ['БАЗ УНИЧТОЖЕНО', 'BASES DESTROYED'],
  stBunkers:   ['БУНКЕРОВ И РЛС', 'BUNKERS AND RADARS'],
  stShipsAir:  ['КОРАБЛЕЙ / САМОЛЁТОВ', 'SHIPS / AIRCRAFT'],
  stHostages:  ['ЗАЛОЖНИКОВ СПАСЕНО', 'HOSTAGES RESCUED'],
  stStreak:    ['ЛУЧШАЯ СЕРИЯ', 'BEST STREAK'],
  stTime:      ['ВРЕМЯ', 'TIME'],
  stBonus:     ['БОНУС ЗА ОПЕРАЦИЮ', 'MISSION BONUS'],
  stLevel:     ['УРОВЕНЬ', 'MISSION'],
  stScore:     ['СЧЁТ', 'SCORE'],
  stBaseBunk:  ['БАЗ / БУНКЕРОВ', 'BASES / BUNKERS'],
  stMines:     ['МИН ОБЕЗВРЕЖЕНО', 'MINES CLEARED'],
  creditsLeft: ['КРЕДИТОВ: %1 — ЗАГЛЯНИТЕ В АРСЕНАЛ', 'CREDITS: %1 — VISIT THE ARSENAL'],
  nextLevel:   ['ПРОБЕЛ — УРОВЕНЬ %1: %2', 'SPACE — MISSION %1: %2'],
  nextLevelT:  ['КОСНИТЕСЬ — УРОВЕНЬ %1', 'TAP — MISSION %1'],
  winTitle1:   ['СЕКТОР', 'SECTOR'],
  winTitle2:   ['ЗАЧИЩЕН', 'CLEARED'],
  sectorSub:   ['%1 ПОТОПЛЕН — ПУТЬ ВГЛУБЬ АРХИПЕЛАГА ОТКРЫТ',
                '%1 IS SUNK — THE WAY DEEPER IN IS OPEN'],
  bestRun:     ['РЕКОРД: УРОВЕНЬ %1 • %2 ОЧКОВ', 'BEST RUN: MISSION %1 • %2 POINTS'],
  restartHint: ['R — НАЧАТЬ ЗАНОВО', 'R — START OVER'],
  loseTitle1:  ['КОРАБЛЬ', 'YOUR SHIP'],
  loseTitle2:  ['ПОТОПЛЕН', 'IS SUNK'],
  againWin:    ['ПРОБЕЛ — УРОВЕНЬ %1 • R — НАЧАТЬ ЗАНОВО', 'SPACE — MISSION %1 • R — START OVER'],
  againLose:   ['ПРОБЕЛ — УРОВЕНЬ ЗАНОВО • R — С НАЧАЛА', 'SPACE — RETRY MISSION • R — RESTART'],
  againWinT:   ['КОСНИТЕСЬ — УРОВЕНЬ %1', 'TAP — MISSION %1'],
  againLoseT:  ['КОСНИТЕСЬ — УРОВЕНЬ ЗАНОВО', 'TAP — RETRY MISSION'],

  /* ---------- пауза ---------- */
  pause:       ['ПАУЗА', 'PAUSED'],
  pResume:     ['P — ПРОДОЛЖИТЬ', 'P — RESUME'],
  pResumeT:    ['КОСНИТЕСЬ, ЧТОБЫ ПРОДОЛЖИТЬ', 'TAP TO RESUME'],
  pSound:      ['M — ЗВУК: %1', 'M — SOUND: %1'],
  pSettings:   ['O — НАСТРОЙКИ', 'O — SETTINGS'],
  onWord:      ['ВКЛ', 'ON'],
  offWord:     ['ВЫКЛ', 'OFF'],

  /* ---------- настройки ---------- */
  setTitle:    ['НАСТРОЙКИ', 'SETTINGS'],
  setLang:     ['ЯЗЫК / LANGUAGE', 'LANGUAGE / ЯЗЫК'],
  setSound:    ['ЗВУК', 'SOUND'],
  setMusic:    ['МУЗЫКА', 'MUSIC'],
  setVolume:   ['ГРОМКОСТЬ', 'VOLUME'],
  setControls: ['УПРАВЛЕНИЕ', 'CONTROLS'],
  setQuality:  ['РАЗРЕШЕНИЕ', 'RESOLUTION'],
  setShake:    ['ТРЯСКА КАМЕРЫ', 'SCREEN SHAKE'],
  setCrt:      ['ЭФФЕКТ CRT', 'CRT EFFECT'],
  setDiff:     ['СЛОЖНОСТЬ', 'DIFFICULTY'],
  setReset:    ['СБРОСИТЬ ПРОГРЕСС КАМПАНИИ', 'RESET CAMPAIGN PROGRESS'],
  setResetSure:['НАЖМИТЕ ЕЩЁ РАЗ ДЛЯ СБРОСА', 'PRESS AGAIN TO CONFIRM RESET'],
  setBack:     ['НАЗАД', 'BACK'],
  setKeys:     ['↑↓ ВЫБОР • ←→ ИЗМЕНИТЬ • ESC — НАЗАД', '↑↓ SELECT • ←→ CHANGE • ESC — BACK'],
  setKeysT:    ['КАСАНИЕ ПО СТРОКЕ — ИЗМЕНИТЬ', 'TAP A ROW TO CHANGE'],
  setReload:   ['ПРИМЕНИТСЯ ПОСЛЕ ПЕРЕЗАПУСКА', 'APPLIES AFTER RESTART'],
  setDone:     ['ПРОГРЕСС СБРОШЕН', 'PROGRESS RESET'],
  ctrlAuto:    ['АВТО', 'AUTO'],
  ctrlKeys:    ['КЛАВИАТУРА', 'KEYBOARD'],
  ctrlTouch:   ['СЕНСОР', 'TOUCH'],
  diffEasy:    ['ЛЁГКАЯ', 'EASY'],
  diffNormal:  ['ОБЫЧНАЯ', 'NORMAL'],
  diffHard:    ['ТЯЖЁЛАЯ', 'HARD'],

  /* ---------- штаб: серия дней, задания, звание ---------- */
  hqBtn:       ['ШТАБ', 'HQ'],
  tutClick:   ['КЛИКНИТЕ ПО ИГРЕ, ЗАТЕМ WASD', 'CLICK THE GAME, THEN PRESS WASD'],
  rationGot:  ['ПАЁК ДНЯ ПОЛУЧЕН: %1', 'DAILY RATION CLAIMED: %1'],
  btnPlay:    ['ИГРАТЬ', 'PLAY'],
  btnContinue:['ПРОДОЛЖИТЬ • МИССИЯ %1', 'CONTINUE • MISSION %1'],
  btnResume:  ['ПРОДОЛЖИТЬ', 'RESUME'],
  btnMenu:    ['ГЛАВНОЕ МЕНЮ', 'MAIN MENU'],
  btnNext:    ['МИССИЯ', 'MISSION'],
  howTitle:   ['КАК ИГРАТЬ', 'HOW TO PLAY'],
  hudDist:    ['%1 М', '%1 M'],
  hqNew:       ['ПАЁК!', 'RATION!'],
  hqTitle:     ['ШТАБ ФЛОТА', 'FLEET HQ'],
  hqStreak:    ['ДЕНЬ %1 ПОДРЯД • РЕКОРД %2', 'DAY %1 IN A ROW • BEST %2'],
  hqBonus:     ['НАДБАВКА +%1%', 'PAY BONUS +%1%'],
  hqDayN:      ['Д%1', 'D%1'],
  hqClaim:     ['ПОЛУЧИТЬ ПАЁК', 'CLAIM THE RATION'],
  hqClaim2:    ['×2 ЗА РОЛИК', '×2 FOR AN AD'],
  hqClaimed:   ['ПАЁК ПОЛУЧЕН • СЛЕДУЮЩИЙ ЧЕРЕЗ %1', 'RATION CLAIMED • NEXT IN %1'],
  hqClaimed2:  ['ПАЁК ПОЛУЧЕН ВДВОЙНЕ • СЛЕДУЮЩИЙ ЧЕРЕЗ %1', 'DOUBLE RATION CLAIMED • NEXT IN %1'],
  hqTomorrow:  ['ЗАВТРА: %1', 'TOMORROW: %1'],
  hqLeft:      ['%1 Ч %2 МИН', '%1 H %2 MIN'],
  hqLeftM:     ['%1 МИН', '%1 MIN'],
  hqTasks:     ['ЗАДАНИЯ ДНЯ', 'ORDERS OF THE DAY'],
  hqAll:       ['ВСЕ ТРИ ЗАДАНИЯ: +%1 КР И БЕСПЛАТНЫЙ ПРОКРУТ БАРАБАНА',
                'ALL THREE ORDERS: +%1 CR AND A FREE SPIN OF THE DRUM'],
  hqAllOk:     ['ВСЕ ТРИ ВЫПОЛНЕНЫ — БОНУС +%1 ПОЛУЧЕН', 'ALL THREE DONE — +%1 BONUS PAID'],
  hqRank:      ['ЗВАНИЕ', 'RANK'],
  hqNext:      ['ДО СЛЕДУЮЩЕГО: %1', 'NEXT RANK IN %1'],
  hqTop:       ['ВЫСШЕЕ ЗВАНИЕ', 'TOP RANK'],
  hqStart:     ['СТАРТОВЫЙ БОНУС: +%1 КР', 'STARTING BONUS: +%1 CR'],
  hqTotal:     ['ДНЕЙ В СТРОЮ: %1', 'DAYS SERVED: %1'],
  hqSupply:    ['НА СКЛАДЕ: %1', 'IN STORES: %1'],
  hqBack:      ['НАЗАД', 'BACK'],
  hqBackK:     ['ESC — НАЗАД', 'ESC — BACK'],
  hqFight:     ['В БОЙ', 'SET SAIL'],
  hqResume:    ['ПРОДОЛЖИТЬ', 'RESUME'],
  crShort:     ['КР', 'CR'],
  rktShort:    ['РКТ', 'RKT'],
  drGold:      ['ЗОЛОТО', 'GOLD'],
  drSpin:      ['ПРОКРУТ', 'FREE SPIN'],
  giftLine:    ['ШТАБ ВЫДАЛ: %1', 'HQ ISSUED: %1'],
  giftCr:      ['%1 КРЕДИТОВ', '%1 CREDITS'],
  giftAmmo:    ['%1 РАКЕТ', '%1 ROCKETS'],
  tomorrowTip: ['ЗАВТРА В ШТАБЕ — ДЕНЬ %1: %2', 'TOMORROW AT HQ — DAY %1: %2'],
  lbPlace:     ['МЕСТО В ФЛОТЕ: #%1', 'FLEET RANKING: #%1'],
  lbBest:      ['ЛИЧНЫЙ РЕКОРД: %1', 'PERSONAL BEST: %1'],

  dqDone:      ['ЗАДАНИЕ ВЫПОЛНЕНО: %1', 'ORDER COMPLETE: %1'],
  dqPay:       ['+%1 КРЕДИТОВ ОТ ШТАБА', '+%1 CREDITS FROM HQ'],
  dqAll:       ['ВСЕ ЗАДАНИЯ ДНЯ! +%1 И БЕСПЛАТНЫЙ ПРОКРУТ', 'ALL ORDERS DONE! +%1 AND A FREE SPIN'],
  dq_ships:    ['ПОТОПИТЬ КОРАБЛЕЙ', 'SINK SHIPS'],
  dq_planes:   ['СБИТЬ САМОЛЁТОВ', 'SHOOT DOWN AIRCRAFT'],
  dq_bases:    ['УНИЧТОЖИТЬ БАЗ', 'DESTROY BASES'],
  dq_bunkers:  ['СНЕСТИ БУНКЕРОВ', 'LEVEL BUNKERS'],
  dq_mines:    ['ОБЕЗВРЕДИТЬ МИН', 'CLEAR MINES'],
  dq_hostage:  ['СПАСТИ ЗАЛОЖНИКОВ', 'RESCUE HOSTAGES'],
  dq_score:    ['НАБРАТЬ ОЧКОВ', 'SCORE POINTS'],
  dq_level:    ['ДОЙТИ ДО УРОВНЯ', 'REACH MISSION'],
  dq_boss:     ['ПОТОПИТЬ ФЛАГМАНОВ', 'SINK FLAGSHIPS'],
  dq_streak:   ['СЕРИЯ ЦЕЛЕЙ ПОДРЯД', 'KILL STREAK OF'],

  rankUp:      ['НОВОЕ ЗВАНИЕ: %1', 'PROMOTED: %1'],
  rk1:         ['МАТРОС', 'SEAMAN'],
  rk2:         ['СТАРШИНА', 'PETTY OFFICER'],
  rk3:         ['МИЧМАН', 'WARRANT OFFICER'],
  rk4:         ['ЛЕЙТЕНАНТ', 'LIEUTENANT'],
  rk5:         ['КАПИТАН-ЛЕЙТЕНАНТ', 'LT. COMMANDER'],
  rk6:         ['КАПИТАН 3 РАНГА', 'COMMANDER'],
  rk7:         ['КАПИТАН 2 РАНГА', 'CAPTAIN'],
  rk8:         ['КАПИТАН 1 РАНГА', 'SENIOR CAPTAIN'],
  rk9:         ['КОНТР-АДМИРАЛ', 'REAR ADMIRAL'],
  rk10:        ['АДМИРАЛ ФЛОТА', 'FLEET ADMIRAL'],

  /* ---------- прочее ---------- */
  rotate:    ['ПОВЕРНИТЕ УСТРОЙСТВО ГОРИЗОНТАЛЬНО', 'ROTATE YOUR DEVICE TO LANDSCAPE'],
  loading:     ['ЗАГРУЗКА…', 'LOADING…']
};

/* ------------------------------------------------------------
   Языки. Основной — английский: он же запасной для всех строк,
   которых нет в переводе. Русский лежит в STR первым столбцом,
   остальные языки приезжают отдельными файлами src/core/lang-*.js
   и кладут свои словари в TR.
   ------------------------------------------------------------ */
const TR = {};                             /* код языка -> словарь */

const LANG_LIST = ['en', 'es', 'pt', 'fr', 'de', 'it', 'tr', 'pl', 'ru'];
const LANG_NAMES = {
  en: 'ENGLISH', es: 'ESPANOL', pt: 'PORTUGUES', fr: 'FRANCAIS', de: 'DEUTSCH',
  it: 'ITALIANO', tr: 'TURKCE', pl: 'POLSKI', ru: 'РУССКИЙ'
};

let LANG_CODE = 'en';
let LANG = 1;                              /* столбец в STR: 0 — ru, 1 — en */

const langOk = c => LANG_LIST.indexOf(c) >= 0;

function setLang(code) {
  if (typeof code === 'number') code = code ? 'en' : 'ru';   /* старый вызов */
  LANG_CODE = langOk(code) ? code : 'en';
  LANG = LANG_CODE === 'ru' ? 0 : 1;
}
function langName(code) { return LANG_NAMES[code || LANG_CODE] || 'ENGLISH'; }

function T(key) {
  const d = TR[LANG_CODE];
  const e = STR[key];
  let s = (d && d[key]) || (e ? (e[LANG] || e[1] || e[0]) : key);
  for (let i = 1; i < arguments.length; i++) s = s.replace('%' + i, arguments[i]);
  return s;
}

/* ===== src/core/lang-es.js ===== */
;
'use strict';
/* lang-es.js — español. Строк нет — берётся английская. */
TR.es = {
  hull: 'CASCO', boost: 'TURBO', knots: 'ND %1', repairing: 'REPARANDO', pdShort: 'CIWS',
  alert: 'ALERTA', radar: 'RADAR', radarOpen: 'RADAR • RED CAÍDA',
  lvlBases: 'NIV.%1 • BASES %2/%3', rescuedN: 'RESCATADOS %1', missilesN: 'COHETES:%1',
  boostHint: 'SHIFT — TURBO', scoreLbl: 'PUNTOS', creditsLbl: 'CRÉDITOS', streakN: 'RACHA %1',
  arsenalHint: 'E — ARSENAL', arsenalTap: 'ARSENAL', critical: 'DAÑOS CRÍTICOS',

  gameTitle: 'ARCHIPIÉLAGO', operation: '— O P E R A C I Ó N —', carrier: '"NORTE"',
  bossName: 'ACORAZADO "LEVIATÁN"', bossName2: 'PORTAAVIONES "TORMENTA"',
  bossName3: 'MONITOR "FORTALEZA"', transport: 'TRANSPORTE "LADOGA"',
  lvl1: 'PERÍMETRO', lvl2: 'ESTRECHO BRAVO', lvl3: 'ARRECIFES ROJOS',
  lvl4: 'BAJÍOS NEGROS', lvl5: 'CORAZÓN DEL ARCHIPIÉLAGO',

  isl_fang: 'COLMILLO', isl_thund: 'TRUENO', isl_raid: 'INCURSIÓN', isl_serp: 'SERPIENTE',
  isl_storm: 'TORMENTA', isl_ash: 'CENIZAS', isl_crab: 'CANGREJO', isl_gloom: 'PENUMBRA',
  isl_needle: 'AGUJA', isl_wolf: 'LOBO', isl_fort: 'FUERTE', isl_breeze: 'BRISA',
  isl_shark: 'TIBURÓN', isl_cape: 'CABO', isl_reef: 'ARRECIFE', isl_anchor: 'ANCLA',

  mObjective: 'OBJETIVO: DESTRUIR BASES ENEMIGAS — %1',
  mCarryHome: 'LLEVA A LOS REHENES AL PORTAAVIONES %1',
  mArsenal: 'E — ARSENAL JUNTO AL PORTAAVIONES',
  mArsenalT: 'EL ARSENAL ABRE EN EL PORTAAVIONES',
  mMines: 'AVISO: CAMPOS DE MINAS EN LAS ISLAS',
  mAllTargets: '¡OBJETIVOS DESTRUIDOS! ¡RETÍRATE!',
  mBaseDown: 'BASE DESTRUIDA: ISLA %1', mAllBases: '¡TODAS LAS BASES DESTRUIDAS!',
  mBasesLeft: 'ALERTA MÁS ALTA — BASES: %1',
  mRadarDown: 'RADAR ENEMIGO DESTRUIDO — MAPA VISIBLE',
  mDistress: 'SOS: ISLA %1 — %2 PERSONAS',
  mSlowDown: 'REDUCE LA MARCHA JUNTO A LOS REHENES',
  mTakeThem: 'LLEVA A LOS REHENES A %1',
  mEvacuated: 'EVACUADOS: %1 — GRACIAS DE LA TRIPULACIÓN',
  mNoLauncher: 'SIN LANZADOR — CÓMPRALO EN EL ARSENAL',
  mNoAmmo: 'SIN COHETES — REABASTECE', mBossComing: '%1 VA A INTERCEPTARTE',
  mBossSalvo: '¡ANDANADA DEL LEVIATÁN!', mBossLaunch: 'DESPEGA EL GRUPO AÉREO',
  mBossDown: '¡%1 HUNDIDO!', mAirTarget: 'CONTACTO AÉREO: BOMBARDERO',
  mSoundOn: 'SONIDO ACTIVADO', mSoundOff: 'SONIDO APAGADO', mAlarm: 'ALERTA',
  fRepair: '+REPARACIÓN', fRockets: '+%1 COHETES', fCredits: '+%1 cr',

  mTypeAssault: 'ASALTO', mTypeNight: 'OPERACIÓN NOCTURNA', mTypeEscort: 'DESEMBARCO',
  mTypeBoss: 'INTERCEPCIÓN', mTypeConvoy: 'CONVOY',
  objConvoy: 'OBJETIVO: ESCOLTA %1 HASTA LA ISLA %2',
  objConvoy2: 'SI EL TRANSPORTE SE HUNDE, MISIÓN PERDIDA',
  hudConvoy: 'NIV.%1 • CONVOY %2%', mConvoyHit: '¡EL TRANSPORTE ESTÁ BAJO FUEGO!',
  mConvoyLost: 'EL TRANSPORTE SE HA HUNDIDO', mConvoyDone: 'EL TRANSPORTE HA LLEGADO',
  mSubs: 'SONAR: SUBMARINOS EN LA ZONA', mSubNear: 'RUIDO DE HÉLICES ABAJO',
  mSubSurface: 'SUBMARINO EN SUPERFICIE — ¡FUEGO!',
  mNoDC: 'NECESITAS CARGAS DE PROFUNDIDAD — ARSENAL',
  hudSmoke: 'HUMO', hudDC: 'CARGAS',
  mSmokeHint: 'F — CORTINA DE HUMO, CORTA HACES Y PUNTERÍA',
  itDC: 'CARGAS DE PROFUNDIDAD', itDCD: 'Suéltalas por popa con Q. Alcanzan submarinos',

  objAssault: 'OBJETIVO: DESTRUIR BASES ENEMIGAS — %1',
  objNight: 'OBJETIVO: RESCATA EN SILENCIO A %1 PRESOS',
  objNight2: 'EVITA LOS HACES DE LOS FAROS',
  objEscort: 'OBJETIVO: RECOGE A LOS MARINES EN LA ISLA %1',
  objEscort2: 'DESEMBÁRCALOS EN LA ISLA %1 Y LÍMPIALA',
  hudNight: 'NIV.%1 • PRESOS %2/%3', hudEscort: 'NIV.%1 • TROPA %2/%3 • META %4/%5',
  hudStealth: 'SIGILO', hudBlown: 'DETECTADO',
  mMarinesUp: 'MARINES A BORDO: %1', mAllyAboard: 'ALIADO A BORDO: %1 TIRADOR(ES)',
  mAllyLost: 'UN TIRADOR CAYÓ AL AGUA',
  mFriendly: 'MUELLES ALIADOS: REPARAN Y DAN TIRADORES',
  mMarinesGo: '¡DESEMBARCO! SILENCIA LOS NIDOS DE FUEGO',
  mMarinesDead: 'EL ESCUADRÓN HA CAÍDO — TERMINA TÚ',
  mTargetDone: 'ISLA LIMPIA', mSpotted: '¡TE HAN VISTO! ZONA EN ALERTA',
  mBeamWarn: 'HAZ SOBRE TI — VUELVE A LA OSCURIDAD',
  mTornado: 'AVISO: TROMBAS MARINAS', mTornadoNear: '¡TROMBA CERCA!',
  stStealth: 'SIN SER DETECTADO', yesWord: 'SÍ', noWord: 'NO',

  shopTitle: 'ARSENAL DEL PORTAAVIONES %1', shopCredits: 'CRÉDITOS: %1', shopMax: 'MAX',
  shopCost: '%1 cr', shopPick: 'ELIGE UNA MEJORA',
  shopKeys: '↑↓ ELEGIR • ENTER / CLIC IZQ — COMPRAR • E — SALIR',
  shopTouch: 'TOCA DOS VECES PARA COMPRAR • CERRAR ✕', shopNoNeed: 'AHORA NO HACE FALTA',
  shopMaxed: 'NIVEL MÁXIMO', shopPoor: 'CRÉDITOS INSUFICIENTES', shopBought: 'COMPRADO: %1',
  itRepair: 'REPARAR CASCO', itRepairD: 'Recupera +40 puntos de casco',
  itArmor: 'BLINDAJE', itArmorD: '+25 al casco máximo',
  itGun: 'CAÑÓN PRINCIPAL', itGunD: '+4 de daño por proyectil',
  itRate: 'CARGADOR AUTOMÁTICO', itRateD: '+12% de cadencia de tiro',
  itEngine: 'MOTOR', itEngineD: '+12% de velocidad y manejo',
  itBoost: 'POSCOMBUSTIÓN', itBoostD: 'Más reserva y recarga más rápida',
  itMissile: 'COHETES "ARPÓN"', itMissileD: 'Cohetes guiados. Clic derecho (+6)',
  itAmmo: 'COHETES +6', itAmmoD: 'Repone cohetes Arpón',
  itBoat: 'BOTE SALVAVIDAS', itBoatD: '+2 plazas para rehenes a bordo',
  itPd: 'CIWS "AVISPA"', itPdD: 'Derriba proyectiles y cohetes enemigos',
  itRadar: 'RADAR', itRadarD: '+330 de alcance de detección',

  adWatching: 'PUBLICIDAD…', adDemo: 'ANUNCIO DE PRUEBA (FUERA DE CRAZYGAMES)',
  adFailed: 'EL ANUNCIO NO CARGÓ', adNoFill: 'SIN ANUNCIO — RECOMPENSA CONCEDIDA',
  adWait: 'DISPONIBLE EN %1 S',
  revive: 'REVIVIR VIENDO UN ANUNCIO', reviveT: 'TOCA — REVIVIR POR UN ANUNCIO',
  reviveDone: 'NAVE RESTAURADA', reviveNone: 'YA HAS USADO LA REVIVIDA',
  itAdAmmo: '+8 COHETES POR UN ANUNCIO', itAdAmmoD: 'Un anuncio corto y la santabárbara llena',
  itCrate: 'CAJA DE LA SUERTE', itCrateD: 'Gira el tambor: créditos, cohetes, premio raro',
  adFree: 'GRATIS',
  itHull: 'CASCO DE ALMIRANTE', itHullD: 'Para siempre: +40 casco, +10% velocidad, quinto tirador',
  itHarp: 'ARPÓN DORADO', itHarpD: 'Para siempre: +35% de daño, nunca menos de cuatro',
  ownedWord: 'EN POSESIÓN', buyFail: 'LA COMPRA NO SE COMPLETÓ', buyOk: 'DESBLOQUEADO: %1',

  crateTitle: 'CAJA DE LA SUERTE', crateSpin: 'GIRAR', crateAd: 'GIRAR OTRA VEZ POR UN ANUNCIO',
  crateWaitN: 'GRATIS EN %1', crateAdWait: 'ANUNCIO EN %1', crateClose: 'E / ESC — CERRAR',
  crateCloseT: 'CERRAR ✕', crateWon: 'HAS GANADO: %1', crateJack: '¡PREMIO MAYOR!',
  przCredits: '%1 CRÉDITOS', przAmmo: '%1 COHETES', przRepair: 'REPARACIÓN Y TURBO',
  przDC: 'CARGAS DE PROFUNDIDAD', przJack: 'OBJETO PREMIUM', przNothing: 'NADA',

  tagNone: 'VACÍO', tagFix: 'REP',
  adLoading: 'CARGANDO ANUNCIO…', retryBtn: 'REINTENTAR MISIÓN',
  subtitle: 'CAMPAÑA NAVAL SIN FIN', orders: 'ÓRDENES:',
  ord1: '> DESTRUYE BASES, BÚNKERES Y ANTENAS DE RADAR',
  ord2: '> HUNDE BARCOS, DERRIBA AVIONES',
  ord3: '> RESCATA REHENES Y LLÉVALOS A %1',
  ord4: '> ABRE CAJAS DE SUMINISTROS EN LAS ISLAS',
  ord5: '> LAS RACHAS RÁPIDAS AUMENTAN LA PAGA',
  ord6: '> CADA QUINTA MISIÓN TRAE UN BUQUE INSIGNIA',
  ord7: '> CUIDADO CON LAS MINAS Y LOS BAJÍOS NOCTURNOS',
  keysLine1: 'WASD — MOVER • SHIFT — TURBO • CLIC IZQ — FUEGO • CLIC DER — COHETES • F — HUMO • Q — CARGAS',
  keysLine2: 'E — ARSENAL • O — AJUSTES • H — CUARTEL • M — SONIDO • P — PAUSA',
  touchLine1: 'MITAD IZQUIERDA — TIMÓN • DERECHA — APUNTAR Y DISPARAR',
  touchLine2: 'BOTONES A LA DERECHA: TURBO, COHETE, HUMO, CARGAS, ARSENAL',
  pressStart: '► PULSA ESPACIO O HAZ CLIC ◄', tapStart: '► TOCA LA PANTALLA ◄',
  contStart: '► ESPACIO — CONTINUAR LA OPERACIÓN, MISIÓN %1 ◄',
  contStartT: '► TOCA — CONTINUAR, MISIÓN %1 ◄',
  settingsHint: 'O — AJUSTES', settingsBtn: 'AJUSTES',

  lvlDone: 'MISIÓN %1 COMPLETADA', stBases: 'BASES DESTRUIDAS', stBunkers: 'BÚNKERES Y RADARES',
  stShipsAir: 'BARCOS / AVIONES', stHostages: 'REHENES RESCATADOS', stStreak: 'MEJOR RACHA',
  stTime: 'TIEMPO', stBonus: 'BONO DE MISIÓN', stLevel: 'MISIÓN', stScore: 'PUNTOS',
  stBaseBunk: 'BASES / BÚNKERES', stMines: 'MINAS DESACTIVADAS',
  creditsLeft: 'CRÉDITOS: %1 — PASA POR EL ARSENAL',
  nextLevel: 'ESPACIO — MISIÓN %1: %2', nextLevelT: 'TOCA — MISIÓN %1',
  winTitle1: 'SECTOR', winTitle2: 'LIMPIO',
  sectorSub: '%1 HUNDIDO — EL PASO ESTÁ ABIERTO',
  bestRun: 'RÉCORD: MISIÓN %1 • %2 PUNTOS', restartHint: 'R — EMPEZAR DE NUEVO',
  loseTitle1: 'TU NAVE', loseTitle2: 'SE HUNDIÓ',
  againWin: 'ESPACIO — MISIÓN %1 • R — DE NUEVO',
  againLose: 'ESPACIO — REINTENTAR • R — DESDE CERO',
  againWinT: 'TOCA — MISIÓN %1', againLoseT: 'TOCA — REINTENTAR MISIÓN',

  pause: 'PAUSA', pResume: 'P — CONTINUAR', pResumeT: 'TOCA PARA CONTINUAR',
  pSound: 'M — SONIDO: %1', pSettings: 'O — AJUSTES', onWord: 'SÍ', offWord: 'NO',

  setTitle: 'AJUSTES', setLang: 'IDIOMA / LANGUAGE', setSound: 'SONIDO', setMusic: 'MÚSICA',
  setVolume: 'VOLUMEN', setControls: 'CONTROLES', setQuality: 'RESOLUCIÓN',
  setShake: 'SACUDIDA DE CÁMARA', setCrt: 'EFECTO CRT', setDiff: 'DIFICULTAD',
  setReset: 'REINICIAR EL PROGRESO', setBack: 'ATRÁS',
  setKeys: '↑↓ ELEGIR • ←→ CAMBIAR • ESC — ATRÁS', setKeysT: 'TOCA UNA LÍNEA PARA CAMBIAR',
  setReload: 'SE APLICA AL REINICIAR', setDone: 'PROGRESO REINICIADO',
  ctrlAuto: 'AUTO', ctrlKeys: 'TECLADO', ctrlTouch: 'TÁCTIL',
  diffEasy: 'FÁCIL', diffNormal: 'NORMAL', diffHard: 'DIFÍCIL',

  hqBtn: 'CUARTEL', hqNew: '¡RACIÓN!', hqTitle: 'CUARTEL DE LA FLOTA',
  hqStreak: 'DÍA %1 SEGUIDO • RÉCORD %2', hqBonus: 'BONO DE PAGA +%1%', hqDayN: 'D%1',
  hqClaim: 'RECOGER LA RACIÓN', hqClaim2: '×2 POR UN ANUNCIO',
  hqClaimed: 'RACIÓN RECOGIDA • SIGUIENTE EN %1',
  hqClaimed2: 'RACIÓN DOBLE • SIGUIENTE EN %1', hqTomorrow: 'MAÑANA: %1',
  hqLeft: '%1 H %2 MIN', hqLeftM: '%1 MIN', hqTasks: 'ÓRDENES DEL DÍA',
  hqAll: 'LAS TRES ÓRDENES: +%1 CR Y UN GIRO GRATIS',
  hqAllOk: 'LAS TRES HECHAS — +%1 DE BONO',
  hqRank: 'RANGO', hqNext: 'SIGUIENTE RANGO EN %1', hqTop: 'RANGO MÁXIMO',
  hqStart: 'BONO INICIAL: +%1 CR', hqTotal: 'DÍAS DE SERVICIO: %1', hqSupply: 'EN ALMACÉN: %1',
  hqBack: 'ATRÁS', hqBackK: 'ESC — ATRÁS', hqFight: 'ZARPAR', hqResume: 'CONTINUAR',
  crShort: 'CR', rktShort: 'COH', drGold: 'ORO', drSpin: 'GIRO GRATIS',
  giftLine: 'EL CUARTEL DIO: %1', giftCr: '%1 CRÉDITOS', giftAmmo: '%1 COHETES',
  tomorrowTip: 'MAÑANA EN EL CUARTEL — DÍA %1: %2',
  lbPlace: 'RANKING DE LA FLOTA: #%1', lbBest: 'RÉCORD PERSONAL: %1',
  dqDone: 'ORDEN CUMPLIDA: %1', dqPay: '+%1 CRÉDITOS DEL CUARTEL',
  dqAll: '¡TODAS LAS ÓRDENES! +%1 Y UN GIRO GRATIS',
  dq_ships: 'HUNDIR BARCOS', dq_planes: 'DERRIBAR AVIONES', dq_bases: 'DESTRUIR BASES',
  dq_bunkers: 'ARRASAR BÚNKERES', dq_mines: 'LIMPIAR MINAS', dq_hostage: 'RESCATAR REHENES',
  dq_score: 'SUMAR PUNTOS', dq_level: 'LLEGAR A LA MISIÓN', dq_boss: 'HUNDIR INSIGNIAS',
  dq_streak: 'RACHA DE',
  rankUp: 'ASCENDIDO: %1',
  rk1: 'MARINERO', rk2: 'SUBOFICIAL', rk3: 'BRIGADA', rk4: 'TENIENTE',
  rk5: 'CAP. DE CORBETA', rk6: 'CAP. DE FRAGATA', rk7: 'CAPITÁN', rk8: 'CAP. DE NAVÍO',
  rk9: 'CONTRAALMIRANTE', rk10: 'ALMIRANTE',
  rotate: 'GIRA EL DISPOSITIVO EN HORIZONTAL', loading: 'CARGANDO…',
  tutTitle: 'TUTORIAL %1/%2',
  reviveFree: 'SEGUNDA OPORTUNIDAD',
  mercyMsg: 'AYUDA DEL MANDO: ENEMIGO MÁS DÉBIL, BLINDAJE +%1%',
  ev_drop: 'SUMINISTROS',
  ev_ace: 'AS ENEMIGO',
  ev_pilot: 'PILOTO DERRIBADO',
  ev_cargo: 'CONVOY DE BARCAZAS',
  ev_raid: 'ATAQUE AÉREO',
  ev_loot: 'CARGA FLOTANTE',
  evDropMsg: 'NUESTRO AVIÓN SOLTÓ UNA CAJA — ¡TÓMALA ANTES QUE EL ENEMIGO!',
  evAceMsg: 'UN AS ENEMIGO TE CAZA — RECOMPENSA x3',
  evPilotMsg: 'NUESTRO PILOTO ESTÁ EN EL AGUA — RECÓGELO DESPACIO',
  evCargoMsg: 'BARCAZAS ENEMIGAS CON CARGA — HUNDE TODAS',
  evRaidMsg: '¡ATAQUE AÉREO! DERRIBA TODA LA ESCUADRILLA',
  evLootMsg: 'HAY CARGA FLOTANDO — RECÓGELA TODA',
  evOk: 'COMPLETADO',
  evFail: 'DEMASIADO TARDE',
  evLost: 'EL ENEMIGO SE LLEVÓ LA CAJA',
  evCargoEsc: 'BARCAZAS HUNDIDAS: %1 DE %2',
  evAceTag: 'AS',
  bfTriple: 'TRIPLE',
  bfRapid: 'RÁFAGA',
  bfShield: 'ESCUDO',
  bfNitro: 'NITRO',
  bfGot: '%1 DURANTE %2 S',
  mHeliEvac: 'UN HELICÓPTERO RECOGIÓ REHENES: %1',
  btnPlay: 'JUGAR',
  btnContinue: 'CONTINUAR • MISIÓN %1',
  btnResume: 'CONTINUAR',
  btnMenu: 'MENÚ PRINCIPAL',
  btnNext: 'MISIÓN',
  howTitle: 'CÓMO JUGAR',
  hudDist: '%1 M',
  tut1: 'NAVEGA CON LAS TECLAS WASD',
  tut1T: 'DIRIGE CON EL PULGAR IZQUIERDO',
  tut2: 'APUNTA CON EL RATÓN, CLIC IZQUIERDO — FUEGO',
  tut2T: 'EL CAÑÓN DISPARA SOLO — VE AL ENEMIGO',
  tut3: 'TU OBJETIVO ESTÁ ARRIBA. HUNDE UN ENEMIGO',
  tut4: 'EL PORTAAVIONES REPARA Y TIENE EL ARSENAL',
  tut4T: 'EL PORTAAVIONES REPARA Y TIENE EL ARSENAL',
  tut5: 'HABILIDADES: F — HUMO, SHIFT — TURBO',
  tut5T: 'BOTONES DERECHOS: TURBO Y HUMO',
  tutDone: '¡LISTO! ¡SUERTE, COMANDANTE!',
  setResetSure: 'PULSA OTRA VEZ PARA CONFIRMAR',
  tutClick: 'HAZ CLIC EN EL JUEGO Y USA WASD',
  rationGot: 'RACIÓN DIARIA RECIBIDA: %1',
};

/* ===== src/core/lang-pt.js ===== */
;
'use strict';
/* lang-pt.js — português (BR). Строк нет — берётся английская. */
TR.pt = {
  hull: 'CASCO', boost: 'TURBO', knots: 'NÓS %1', repairing: 'REPARANDO', pdShort: 'CIWS',
  alert: 'ALERTA', radar: 'RADAR', radarOpen: 'RADAR • REDE CAIU',
  lvlBases: 'NV.%1 • BASES %2/%3', rescuedN: 'RESGATADOS %1', missilesN: 'FOGUETES:%1',
  boostHint: 'SHIFT — TURBO', scoreLbl: 'PONTOS', creditsLbl: 'CRÉDITOS', streakN: 'SEQUÊNCIA %1',
  arsenalHint: 'E — ARSENAL', arsenalTap: 'ARSENAL', critical: 'DANOS CRÍTICOS',

  gameTitle: 'ARQUIPÉLAGO', operation: '— O P E R A Ç Ã O —', carrier: '"NORTE"',
  bossName: 'COURAÇADO "LEVIATÃ"', bossName2: 'PORTA-AVIÕES "TEMPESTADE"',
  bossName3: 'MONITOR "FORTALEZA"', transport: 'TRANSPORTE "LADOGA"',
  lvl1: 'PERÍMETRO', lvl2: 'ESTREITO BRAVO', lvl3: 'RECIFES VERMELHOS',
  lvl4: 'BAIXIOS NEGROS', lvl5: 'CORAÇÃO DO ARQUIPÉLAGO',

  isl_fang: 'PRESA', isl_thund: 'TROVÃO', isl_raid: 'INCURSÃO', isl_serp: 'SERPENTE',
  isl_storm: 'TEMPESTADE', isl_ash: 'CINZAS', isl_crab: 'CARANGUEJO', isl_gloom: 'PENUMBRA',
  isl_needle: 'AGULHA', isl_wolf: 'LOBO', isl_fort: 'FORTE', isl_breeze: 'BRISA',
  isl_shark: 'TUBARÃO', isl_cape: 'CABO', isl_reef: 'RECIFE', isl_anchor: 'ÂNCORA',

  mObjective: 'OBJETIVO: DESTRUIR BASES INIMIGAS — %1',
  mCarryHome: 'LEVE OS REFÉNS AO PORTA-AVIÕES %1',
  mArsenal: 'E — ARSENAL JUNTO AO PORTA-AVIÕES',
  mArsenalT: 'O ARSENAL ABRE NO PORTA-AVIÕES',
  mMines: 'AVISO: CAMPOS MINADOS NAS ILHAS',
  mAllTargets: 'ALVOS DESTRUÍDOS! RECUE!',
  mBaseDown: 'BASE DESTRUÍDA: ILHA %1', mAllBases: 'TODAS AS BASES DESTRUÍDAS!',
  mBasesLeft: 'ALERTA SUBIU — BASES: %1',
  mRadarDown: 'RADAR INIMIGO DESTRUÍDO — MAPA ABERTO',
  mDistress: 'SOS: ILHA %1 — %2 PESSOAS',
  mSlowDown: 'REDUZA A MARCHA PERTO DOS REFÉNS',
  mTakeThem: 'LEVE OS REFÉNS PARA %1',
  mEvacuated: 'EVACUADOS: %1 — A TRIPULAÇÃO AGRADECE',
  mNoLauncher: 'SEM LANÇADOR — COMPRE NO ARSENAL',
  mNoAmmo: 'SEM FOGUETES — REABASTEÇA', mBossComing: '%1 VEM INTERCEPTAR',
  mBossSalvo: 'SALVA DO LEVIATÃ!', mBossLaunch: 'O GRUPO AÉREO ESTÁ DECOLANDO',
  mBossDown: '%1 AFUNDADO!', mAirTarget: 'CONTATO AÉREO: BOMBARDEIRO',
  mSoundOn: 'SOM LIGADO', mSoundOff: 'SOM DESLIGADO', mAlarm: 'ALERTA',
  fRepair: '+REPARO', fRockets: '+%1 FOGUETES', fCredits: '+%1 cr',

  mTypeAssault: 'ASSALTO', mTypeNight: 'OPERAÇÃO NOTURNA', mTypeEscort: 'DESEMBARQUE',
  mTypeBoss: 'INTERCEPTAÇÃO', mTypeConvoy: 'COMBOIO',
  objConvoy: 'OBJETIVO: ESCOLTE %1 ATÉ A ILHA %2',
  objConvoy2: 'SE O TRANSPORTE AFUNDAR, A MISSÃO ACABA',
  hudConvoy: 'NV.%1 • COMBOIO %2%', mConvoyHit: 'O TRANSPORTE ESTÁ SOB FOGO!',
  mConvoyLost: 'O TRANSPORTE AFUNDOU', mConvoyDone: 'O TRANSPORTE CHEGOU',
  mSubs: 'SONAR: SUBMARINOS NA ÁREA', mSubNear: 'RUÍDO DE HÉLICES ABAIXO',
  mSubSurface: 'SUBMARINO NA SUPERFÍCIE — FOGO!',
  mNoDC: 'VOCÊ PRECISA DE CARGAS DE PROFUNDIDADE',
  hudSmoke: 'FUMAÇA', hudDC: 'CARGAS',
  mSmokeHint: 'F — CORTINA DE FUMAÇA, CORTA FACHOS E MIRA',
  itDC: 'CARGAS DE PROFUNDIDADE', itDCD: 'Solte pela popa com Q. Alcança submarinos',

  objAssault: 'OBJETIVO: DESTRUIR BASES INIMIGAS — %1',
  objNight: 'OBJETIVO: RESGATE EM SILÊNCIO %1 PRISIONEIROS',
  objNight2: 'FIQUE FORA DOS FACHOS DOS FARÓIS',
  objEscort: 'OBJETIVO: PEGUE OS FUZILEIROS NA ILHA %1',
  objEscort2: 'DESEMBARQUE-OS NA ILHA %1 E LIMPE-A',
  hudNight: 'NV.%1 • PRESOS %2/%3', hudEscort: 'NV.%1 • TROPA %2/%3 • ALVO %4/%5',
  hudStealth: 'FURTIVO', hudBlown: 'DETECTADO',
  mMarinesUp: 'FUZILEIROS A BORDO: %1', mAllyAboard: 'ALIADO A BORDO: %1 ATIRADOR(ES)',
  mAllyLost: 'UM ATIRADOR CAIU NA ÁGUA',
  mFriendly: 'PÍERES ALIADOS: REPARO E ATIRADORES',
  mMarinesGo: 'DESEMBARQUE! CALE OS NINHOS DE FOGO',
  mMarinesDead: 'O ESQUADRÃO CAIU — TERMINE VOCÊ',
  mTargetDone: 'ILHA LIMPA', mSpotted: 'VOCÊ FOI VISTO! ÁREA EM ALERTA',
  mBeamWarn: 'FACHO EM VOCÊ — VOLTE PARA O ESCURO',
  mTornado: 'AVISO: TROMBAS-D\'ÁGUA', mTornadoNear: 'TROMBA PERTO!',
  stStealth: 'SEM SER DETECTADO', yesWord: 'SIM', noWord: 'NÃO',

  shopTitle: 'ARSENAL DO PORTA-AVIÕES %1', shopCredits: 'CRÉDITOS: %1', shopMax: 'MAX',
  shopCost: '%1 cr', shopPick: 'ESCOLHA UMA MELHORIA',
  shopKeys: '↑↓ ESCOLHER • ENTER / BOTÃO ESQ — COMPRAR • E — SAIR',
  shopTouch: 'TOQUE DUAS VEZES PARA COMPRAR • FECHAR ✕', shopNoNeed: 'AGORA NÃO PRECISA',
  shopMaxed: 'NÍVEL MÁXIMO', shopPoor: 'CRÉDITOS INSUFICIENTES', shopBought: 'COMPRADO: %1',
  itRepair: 'REPARAR CASCO', itRepairD: 'Recupera +40 pontos de casco',
  itArmor: 'BLINDAGEM', itArmorD: '+25 no casco máximo',
  itGun: 'CANHÃO PRINCIPAL', itGunD: '+4 de dano por tiro',
  itRate: 'CARREGADOR AUTOMÁTICO', itRateD: '+12% de cadência de tiro',
  itEngine: 'MOTOR', itEngineD: '+12% de velocidade e manobra',
  itBoost: 'PÓS-COMBUSTÃO', itBoostD: 'Mais reserva e recarga mais rápida',
  itMissile: 'FOGUETES "ARPÃO"', itMissileD: 'Foguetes guiados. Botão direito (+6)',
  itAmmo: 'FOGUETES +6', itAmmoD: 'Repõe os foguetes Arpão',
  itBoat: 'BOTE SALVA-VIDAS', itBoatD: '+2 lugares para reféns a bordo',
  itPd: 'CIWS "VESPA"', itPdD: 'Derruba tiros e foguetes inimigos',
  itRadar: 'RADAR', itRadarD: '+330 de alcance de detecção',

  adWatching: 'PUBLICIDADE…', adDemo: 'ANÚNCIO DE TESTE (FORA DA CRAZYGAMES)',
  adFailed: 'O ANÚNCIO NÃO CARREGOU', adNoFill: 'SEM ANÚNCIO — PRÊMIO CONCEDIDO',
  adWait: 'DISPONÍVEL EM %1 S',
  revive: 'REVIVER VENDO UM ANÚNCIO', reviveT: 'TOQUE — REVIVER POR UM ANÚNCIO',
  reviveDone: 'NAVIO RESTAURADO', reviveNone: 'A REVIVIDA JÁ FOI USADA',
  itAdAmmo: '+8 FOGUETES POR UM ANÚNCIO', itAdAmmoD: 'Um anúncio curto e o paiol fica cheio',
  itCrate: 'CAIXA DA SORTE', itCrateD: 'Gire o tambor: créditos, foguetes, prêmio raro',
  adFree: 'GRÁTIS',
  itHull: 'CASCO DE ALMIRANTE', itHullD: 'Para sempre: +40 casco, +10% velocidade, 5º atirador',
  itHarp: 'ARPÃO DOURADO', itHarpD: 'Para sempre: +35% de dano, nunca menos de quatro',
  ownedWord: 'ADQUIRIDO', buyFail: 'A COMPRA NÃO FOI CONCLUÍDA', buyOk: 'LIBERADO: %1',

  crateTitle: 'CAIXA DA SORTE', crateSpin: 'GIRAR', crateAd: 'GIRAR DE NOVO POR UM ANÚNCIO',
  crateWaitN: 'GRÁTIS EM %1', crateAdWait: 'ANÚNCIO EM %1', crateClose: 'E / ESC — FECHAR',
  crateCloseT: 'FECHAR ✕', crateWon: 'VOCÊ GANHOU: %1', crateJack: 'PRÊMIO MÁXIMO!',
  przCredits: '%1 CRÉDITOS', przAmmo: '%1 FOGUETES', przRepair: 'REPARO E TURBO',
  przDC: 'CARGAS DE PROFUNDIDADE', przJack: 'ITEM PREMIUM', przNothing: 'NADA',

  tagNone: 'VAZIO', tagFix: 'REP',
  adLoading: 'CARREGANDO ANÚNCIO…', retryBtn: 'TENTAR DE NOVO',
  subtitle: 'CAMPANHA NAVAL SEM FIM', orders: 'ORDENS:',
  ord1: '> DESTRUA BASES, BUNKERS E ANTENAS DE RADAR',
  ord2: '> AFUNDE NAVIOS, DERRUBE AVIÕES',
  ord3: '> RESGATE REFÉNS E LEVE-OS PARA %1',
  ord4: '> ABRA CAIXAS DE SUPRIMENTOS NAS ILHAS',
  ord5: '> SEQUÊNCIAS RÁPIDAS AUMENTAM O PAGAMENTO',
  ord6: '> A CADA QUINTA MISSÃO VEM UMA NAU CAPITÂNIA',
  ord7: '> CUIDADO COM MINAS E BAIXIOS NOTURNOS',
  keysLine1: 'WASD — MOVER • SHIFT — TURBO • BOTÃO ESQ — FOGO • DIR — FOGUETES • F — FUMAÇA • Q — CARGAS',
  keysLine2: 'E — ARSENAL • O — AJUSTES • H — QG • M — SOM • P — PAUSA',
  touchLine1: 'METADE ESQUERDA — LEME • DIREITA — MIRAR E ATIRAR',
  touchLine2: 'BOTÕES À DIREITA: TURBO, FOGUETE, FUMAÇA, CARGAS, ARSENAL',
  pressStart: '► APERTE ESPAÇO OU CLIQUE ◄', tapStart: '► TOQUE NA TELA ◄',
  contStart: '► ESPAÇO — CONTINUAR A OPERAÇÃO, MISSÃO %1 ◄',
  contStartT: '► TOQUE — CONTINUAR, MISSÃO %1 ◄',
  settingsHint: 'O — AJUSTES', settingsBtn: 'AJUSTES',

  lvlDone: 'MISSÃO %1 CONCLUÍDA', stBases: 'BASES DESTRUÍDAS', stBunkers: 'BUNKERS E RADARES',
  stShipsAir: 'NAVIOS / AVIÕES', stHostages: 'REFÉNS RESGATADOS', stStreak: 'MELHOR SEQUÊNCIA',
  stTime: 'TEMPO', stBonus: 'BÔNUS DA MISSÃO', stLevel: 'MISSÃO', stScore: 'PONTOS',
  stBaseBunk: 'BASES / BUNKERS', stMines: 'MINAS LIMPAS',
  creditsLeft: 'CRÉDITOS: %1 — PASSE NO ARSENAL',
  nextLevel: 'ESPAÇO — MISSÃO %1: %2', nextLevelT: 'TOQUE — MISSÃO %1',
  winTitle1: 'SETOR', winTitle2: 'LIMPO',
  sectorSub: '%1 AFUNDADO — O CAMINHO ESTÁ ABERTO',
  bestRun: 'RECORDE: MISSÃO %1 • %2 PONTOS', restartHint: 'R — COMEÇAR DE NOVO',
  loseTitle1: 'SEU NAVIO', loseTitle2: 'AFUNDOU',
  againWin: 'ESPAÇO — MISSÃO %1 • R — RECOMEÇAR',
  againLose: 'ESPAÇO — TENTAR DE NOVO • R — DO ZERO',
  againWinT: 'TOQUE — MISSÃO %1', againLoseT: 'TOQUE — TENTAR DE NOVO',

  pause: 'PAUSA', pResume: 'P — CONTINUAR', pResumeT: 'TOQUE PARA CONTINUAR',
  pSound: 'M — SOM: %1', pSettings: 'O — AJUSTES', onWord: 'LIG', offWord: 'DESL',

  setTitle: 'AJUSTES', setLang: 'IDIOMA / LANGUAGE', setSound: 'SOM', setMusic: 'MÚSICA',
  setVolume: 'VOLUME', setControls: 'CONTROLES', setQuality: 'RESOLUÇÃO',
  setShake: 'TREMOR DE CÂMERA', setCrt: 'EFEITO CRT', setDiff: 'DIFICULDADE',
  setReset: 'ZERAR O PROGRESSO', setBack: 'VOLTAR',
  setKeys: '↑↓ ESCOLHER • ←→ MUDAR • ESC — VOLTAR', setKeysT: 'TOQUE UMA LINHA PARA MUDAR',
  setReload: 'VALE APÓS REINICIAR', setDone: 'PROGRESSO ZERADO',
  ctrlAuto: 'AUTO', ctrlKeys: 'TECLADO', ctrlTouch: 'TOQUE',
  diffEasy: 'FÁCIL', diffNormal: 'NORMAL', diffHard: 'DIFÍCIL',

  hqBtn: 'QG', hqNew: 'RAÇÃO!', hqTitle: 'QG DA FROTA',
  hqStreak: 'DIA %1 SEGUIDO • RECORDE %2', hqBonus: 'BÔNUS DE PAGA +%1%', hqDayN: 'D%1',
  hqClaim: 'PEGAR A RAÇÃO', hqClaim2: '×2 POR UM ANÚNCIO',
  hqClaimed: 'RAÇÃO PEGA • PRÓXIMA EM %1',
  hqClaimed2: 'RAÇÃO DOBRADA • PRÓXIMA EM %1', hqTomorrow: 'AMANHÃ: %1',
  hqLeft: '%1 H %2 MIN', hqLeftM: '%1 MIN', hqTasks: 'ORDENS DO DIA',
  hqAll: 'AS TRÊS ORDENS: +%1 CR E UM GIRO GRÁTIS',
  hqAllOk: 'AS TRÊS FEITAS — +%1 DE BÔNUS',
  hqRank: 'PATENTE', hqNext: 'PRÓXIMA PATENTE EM %1', hqTop: 'PATENTE MÁXIMA',
  hqStart: 'BÔNUS INICIAL: +%1 CR', hqTotal: 'DIAS DE SERVIÇO: %1', hqSupply: 'NO DEPÓSITO: %1',
  hqBack: 'VOLTAR', hqBackK: 'ESC — VOLTAR', hqFight: 'ZARPAR', hqResume: 'CONTINUAR',
  crShort: 'CR', rktShort: 'FOG', drGold: 'OURO', drSpin: 'GIRO GRÁTIS',
  giftLine: 'O QG ENTREGOU: %1', giftCr: '%1 CRÉDITOS', giftAmmo: '%1 FOGUETES',
  tomorrowTip: 'AMANHÃ NO QG — DIA %1: %2',
  lbPlace: 'RANKING DA FROTA: #%1', lbBest: 'RECORDE PESSOAL: %1',
  dqDone: 'ORDEM CUMPRIDA: %1', dqPay: '+%1 CRÉDITOS DO QG',
  dqAll: 'TODAS AS ORDENS! +%1 E UM GIRO GRÁTIS',
  dq_ships: 'AFUNDAR NAVIOS', dq_planes: 'DERRUBAR AVIÕES', dq_bases: 'DESTRUIR BASES',
  dq_bunkers: 'ARRASAR BUNKERS', dq_mines: 'LIMPAR MINAS', dq_hostage: 'RESGATAR REFÉNS',
  dq_score: 'SOMAR PONTOS', dq_level: 'CHEGAR À MISSÃO', dq_boss: 'AFUNDAR CAPITÂNIAS',
  dq_streak: 'SEQUÊNCIA DE',
  rankUp: 'PROMOVIDO: %1',
  rk1: 'MARINHEIRO', rk2: 'SARGENTO', rk3: 'SUBOFICIAL', rk4: 'TENENTE',
  rk5: 'CAP.-TENENTE', rk6: 'CAP. DE CORVETA', rk7: 'CAPITÃO', rk8: 'CAP. DE MAR E GUERRA',
  rk9: 'CONTRA-ALMIRANTE', rk10: 'ALMIRANTE DA FROTA',
  rotate: 'GIRE O APARELHO NA HORIZONTAL', loading: 'CARREGANDO…',
  tutTitle: 'TUTORIAL %1/%2',
  reviveFree: 'SEGUNDA CHANCE',
  mercyMsg: 'AJUDA DO QG: INIMIGO MAIS FRACO, BLINDAGEM +%1%',
  ev_drop: 'SUPRIMENTOS',
  ev_ace: 'ÁS INIMIGO',
  ev_pilot: 'PILOTO ABATIDO',
  ev_cargo: 'COMBOIO DE BARCAÇAS',
  ev_raid: 'ATAQUE AÉREO',
  ev_loot: 'CARGA FLUTUANTE',
  evDropMsg: 'NOSSO AVIÃO SOLTOU UMA CAIXA — PEGUE ANTES DO INIMIGO',
  evAceMsg: 'UM ÁS INIMIGO ESTÁ CAÇANDO VOCÊ — RECOMPENSA x3',
  evPilotMsg: 'NOSSO PILOTO ESTÁ NA ÁGUA — RESGATE DEVAGAR',
  evCargoMsg: 'BARCAÇAS INIMIGAS COM CARGA — AFUNDE TODAS',
  evRaidMsg: 'ATAQUE AÉREO! DERRUBE TODA A ESQUADRILHA',
  evLootMsg: 'HÁ CARGA FLUTUANDO — COLETE TUDO',
  evOk: 'CONCLUÍDO',
  evFail: 'TARDE DEMAIS',
  evLost: 'O INIMIGO PEGOU A CAIXA',
  evCargoEsc: 'BARCAÇAS AFUNDADAS: %1 DE %2',
  evAceTag: 'ÁS',
  bfTriple: 'TRIPLO',
  bfRapid: 'RAJADA',
  bfShield: 'ESCUDO',
  bfNitro: 'NITRO',
  bfGot: '%1 POR %2 S',
  mHeliEvac: 'UM HELICÓPTERO RESGATOU REFÉNS: %1',
  btnPlay: 'JOGAR',
  btnContinue: 'CONTINUAR • MISSÃO %1',
  btnResume: 'CONTINUAR',
  btnMenu: 'MENU PRINCIPAL',
  btnNext: 'MISSÃO',
  howTitle: 'COMO JOGAR',
  hudDist: '%1 M',
  tut1: 'NAVEGUE COM AS TECLAS WASD',
  tut1T: 'PILOTE COM O POLEGAR ESQUERDO',
  tut2: 'MIRE COM O MOUSE, BOTÃO ESQUERDO — FOGO',
  tut2T: 'O CANHÃO ATIRA SOZINHO — VÁ ATÉ O INIMIGO',
  tut3: 'SEU OBJETIVO ESTÁ NO TOPO. AFUNDE UM INIMIGO',
  tut4: 'O PORTA-AVIÕES REPARA E TEM O ARSENAL',
  tut4T: 'O PORTA-AVIÕES REPARA E TEM O ARSENAL',
  tut5: 'HABILIDADES: F — FUMAÇA, SHIFT — TURBO',
  tut5T: 'BOTÕES À DIREITA: TURBO E FUMAÇA',
  tutDone: 'PRONTO! BOA SORTE, COMANDANTE!',
  setResetSure: 'TOQUE DE NOVO PARA CONFIRMAR',
  tutClick: 'CLIQUE NO JOGO E USE WASD',
  rationGot: 'RAÇÃO DIÁRIA RECEBIDA: %1',
};

/* ===== src/core/lang-fr.js ===== */
;
'use strict';
/* lang-fr.js — français. Строк нет — берётся английская. */
TR.fr = {
  hull: 'COQUE', boost: 'BOOST', knots: 'NDS %1', repairing: 'RÉPARATION', pdShort: 'CIWS',
  alert: 'ALERTE', radar: 'RADAR', radarOpen: 'RADAR • RÉSEAU À TERRE',
  lvlBases: 'NIV.%1 • BASES %2/%3', rescuedN: 'SAUVÉS %1', missilesN: 'ROQUETTES:%1',
  boostHint: 'SHIFT — BOOST', scoreLbl: 'SCORE', creditsLbl: 'CRÉDITS', streakN: 'SÉRIE %1',
  arsenalHint: 'E — ARSENAL', arsenalTap: 'ARSENAL', critical: 'DÉGÂTS CRITIQUES',

  gameTitle: 'ARCHIPEL', operation: '— O P É R A T I O N —', carrier: '"NORD"',
  bossName: 'CUIRASSÉ "LÉVIATHAN"', bossName2: 'PORTE-AVIONS "TEMPÊTE"',
  bossName3: 'MONITOR "FORTERESSE"', transport: 'TRANSPORT "LADOGA"',
  lvl1: 'PÉRIMÈTRE', lvl2: 'DÉTROIT DES TEMPÊTES', lvl3: 'RÉCIFS ROUGES',
  lvl4: 'HAUTS-FONDS NOIRS', lvl5: 'CŒUR DE L\'ARCHIPEL',

  isl_fang: 'CROC', isl_thund: 'TONNERRE', isl_raid: 'RAID', isl_serp: 'SERPENT',
  isl_storm: 'TEMPÊTE', isl_ash: 'CENDRES', isl_crab: 'CRABE', isl_gloom: 'PÉNOMBRE',
  isl_needle: 'AIGUILLE', isl_wolf: 'LOUP', isl_fort: 'FORT', isl_breeze: 'BRISE',
  isl_shark: 'REQUIN', isl_cape: 'CAP', isl_reef: 'RÉCIF', isl_anchor: 'ANCRE',

  mObjective: 'OBJECTIF: DÉTRUIRE LES BASES ENNEMIES — %1',
  mCarryHome: 'RAMENEZ LES OTAGES AU PORTE-AVIONS %1',
  mArsenal: 'E — ARSENAL PRÈS DU PORTE-AVIONS',
  mArsenalT: 'L\'ARSENAL OUVRE AU PORTE-AVIONS',
  mMines: 'ALERTE: CHAMPS DE MINES AUTOUR DES ÎLES',
  mAllTargets: 'TOUTES LES CIBLES À TERRE ! REPLIEZ-VOUS !',
  mBaseDown: 'BASE DÉTRUITE: ÎLE %1', mAllBases: 'TOUTES LES BASES DÉTRUITES !',
  mBasesLeft: 'ALERTE RENFORCÉE — BASES: %1',
  mRadarDown: 'RADAR ENNEMI DÉTRUIT — CARTE OUVERTE',
  mDistress: 'SOS: ÎLE %1 — %2 PERSONNES',
  mSlowDown: 'RALENTISSEZ PRÈS DES OTAGES',
  mTakeThem: 'AMENEZ LES OTAGES À %1',
  mEvacuated: 'ÉVACUÉS: %1 — L\'ÉQUIPAGE VOUS REMERCIE',
  mNoLauncher: 'PAS DE LANCEUR — ACHETEZ-EN UN',
  mNoAmmo: 'PLUS DE ROQUETTES — RAVITAILLEZ', mBossComing: '%1 VIENT INTERCEPTER',
  mBossSalvo: 'SALVE DU LÉVIATHAN !', mBossLaunch: 'LE GROUPE AÉRIEN DÉCOLLE',
  mBossDown: '%1 COULÉ !', mAirTarget: 'CONTACT AÉRIEN: BOMBARDIER',
  mSoundOn: 'SON ACTIVÉ', mSoundOff: 'SON COUPÉ', mAlarm: 'ALERTE',
  fRepair: '+RÉPARATION', fRockets: '+%1 ROQUETTES', fCredits: '+%1 cr',

  mTypeAssault: 'ASSAUT', mTypeNight: 'OPÉRATION DE NUIT', mTypeEscort: 'DÉBARQUEMENT',
  mTypeBoss: 'INTERCEPTION', mTypeConvoy: 'CONVOI',
  objConvoy: 'OBJECTIF: ESCORTEZ %1 JUSQU\'À L\'ÎLE %2',
  objConvoy2: 'SI LE TRANSPORT COULE, LA MISSION EST PERDUE',
  hudConvoy: 'NIV.%1 • CONVOI %2%', mConvoyHit: 'LE TRANSPORT EST SOUS LE FEU !',
  mConvoyLost: 'LE TRANSPORT A COULÉ', mConvoyDone: 'LE TRANSPORT EST ARRIVÉ',
  mSubs: 'SONAR: SOUS-MARINS DANS LA ZONE', mSubNear: 'BRUIT D\'HÉLICES EN DESSOUS',
  mSubSurface: 'SOUS-MARIN EN SURFACE — FEU !',
  mNoDC: 'IL VOUS FAUT DES GRENADES — ARSENAL',
  hudSmoke: 'FUMÉE', hudDC: 'GRENADES',
  mSmokeHint: 'F — ÉCRAN DE FUMÉE, COUPE FAISCEAUX ET VISÉE',
  itDC: 'GRENADES SOUS-MARINES', itDCD: 'Larguez par l\'arrière avec Q. Atteint les sous-marins',

  objAssault: 'OBJECTIF: DÉTRUIRE LES BASES ENNEMIES — %1',
  objNight: 'OBJECTIF: EXTRAIRE EN SILENCE %1 PRISONNIERS',
  objNight2: 'RESTEZ HORS DES FAISCEAUX DES PHARES',
  objEscort: 'OBJECTIF: EMBARQUEZ LES MARINES SUR L\'ÎLE %1',
  objEscort2: 'DÉBARQUEZ-LES SUR L\'ÎLE %1 ET NETTOYEZ-LA',
  hudNight: 'NIV.%1 • PRISONNIERS %2/%3', hudEscort: 'NIV.%1 • TROUPE %2/%3 • CIBLE %4/%5',
  hudStealth: 'DISCRÉTION', hudBlown: 'REPÉRÉ',
  mMarinesUp: 'MARINES À BORD: %1', mAllyAboard: 'ALLIÉ À BORD: %1 TIREUR(S)',
  mAllyLost: 'UN TIREUR EST TOMBÉ À L\'EAU',
  mFriendly: 'PONTONS ALLIÉS: RÉPARATION ET TIREURS',
  mMarinesGo: 'DÉBARQUEMENT ! FAITES TAIRE LES NIDS DE TIR',
  mMarinesDead: 'L\'ESCOUADE EST TOMBÉE — FINISSEZ SEUL',
  mTargetDone: 'ÎLE NETTOYÉE', mSpotted: 'VOUS ÊTES REPÉRÉ ! ZONE EN ALERTE',
  mBeamWarn: 'FAISCEAU SUR VOUS — RETOUR DANS LE NOIR',
  mTornado: 'ALERTE: TROMBES MARINES', mTornadoNear: 'TROMBE TOUT PRÈS !',
  stStealth: 'RESTÉ INVISIBLE', yesWord: 'OUI', noWord: 'NON',

  shopTitle: 'ARSENAL DU PORTE-AVIONS %1', shopCredits: 'CRÉDITS: %1', shopMax: 'MAX',
  shopCost: '%1 cr', shopPick: 'CHOISISSEZ UNE AMÉLIORATION',
  shopKeys: '↑↓ CHOISIR • ENTRÉE / CLIC G — ACHETER • E — SORTIR',
  shopTouch: 'TOUCHEZ DEUX FOIS POUR ACHETER • FERMER ✕', shopNoNeed: 'PAS UTILE MAINTENANT',
  shopMaxed: 'NIVEAU MAXIMUM', shopPoor: 'CRÉDITS INSUFFISANTS', shopBought: 'ACHETÉ: %1',
  itRepair: 'RÉPARER LA COQUE', itRepairD: 'Rend +40 points de coque',
  itArmor: 'BLINDAGE', itArmorD: '+25 de coque maximum',
  itGun: 'CANON PRINCIPAL', itGunD: '+4 de dégâts par obus',
  itRate: 'CHARGEUR AUTOMATIQUE', itRateD: '+12% de cadence de tir',
  itEngine: 'MOTEUR', itEngineD: '+12% de vitesse et de maniabilité',
  itBoost: 'POSTCOMBUSTION', itBoostD: 'Plus de réserve, recharge plus vite',
  itMissile: 'ROQUETTES "HARPON"', itMissileD: 'Roquettes guidées. Clic droit (+6)',
  itAmmo: 'ROQUETTES +6', itAmmoD: 'Réapprovisionne les roquettes Harpon',
  itBoat: 'CANOT DE SAUVETAGE', itBoatD: '+2 places pour les otages à bord',
  itPd: 'CIWS "GUÊPE"', itPdD: 'Abat les obus et roquettes ennemis',
  itRadar: 'RADAR', itRadarD: '+330 de portée de détection',

  adWatching: 'PUBLICITÉ…', adDemo: 'SPOT DE DÉMO (HORS CRAZYGAMES)',
  adFailed: 'LA PUB N\'A PAS CHARGÉ', adNoFill: 'PAS DE PUB — RÉCOMPENSE ACCORDÉE',
  adWait: 'DISPONIBLE DANS %1 S',
  revive: 'REVIVRE EN REGARDANT UNE PUB', reviveT: 'TOUCHEZ — REVIVRE POUR UNE PUB',
  reviveDone: 'NAVIRE RESTAURÉ', reviveNone: 'LA RENAISSANCE EST DÉJÀ UTILISÉE',
  itAdAmmo: '+8 ROQUETTES POUR UNE PUB', itAdAmmoD: 'Une courte pub et la soute est pleine',
  itCrate: 'CAISSE DE LA CHANCE', itCrateD: 'Tournez le tambour: crédits, roquettes, gros lot rare',
  adFree: 'GRATUIT',
  itHull: 'COQUE D\'AMIRAL', itHullD: 'À vie: +40 coque, +10% vitesse, un 5e tireur',
  itHarp: 'HARPON DORÉ', itHarpD: 'À vie: +35% de dégâts, jamais moins de quatre',
  ownedWord: 'POSSÉDÉ', buyFail: 'L\'ACHAT N\'A PAS ABOUTI', buyOk: 'DÉBLOQUÉ: %1',

  crateTitle: 'CAISSE DE LA CHANCE', crateSpin: 'TOURNER', crateAd: 'RETOURNER POUR UNE PUB',
  crateWaitN: 'GRATUIT DANS %1', crateAdWait: 'PUB DANS %1', crateClose: 'E / ÉCHAP — FERMER',
  crateCloseT: 'FERMER ✕', crateWon: 'VOUS AVEZ: %1', crateJack: 'GROS LOT !',
  przCredits: '%1 CRÉDITS', przAmmo: '%1 ROQUETTES', przRepair: 'RÉPARATION ET BOOST',
  przDC: 'GRENADES SOUS-MARINES', przJack: 'OBJET PREMIUM', przNothing: 'RIEN',

  tagNone: 'VIDE', tagFix: 'RÉP',
  adLoading: 'CHARGEMENT DE LA PUB…', retryBtn: 'RÉESSAYER',
  subtitle: 'CAMPAGNE NAVALE SANS FIN', orders: 'ORDRES:',
  ord1: '> DÉTRUISEZ BASES, BUNKERS ET MÂTS RADAR',
  ord2: '> COULEZ LES NAVIRES, ABATTEZ LES AVIONS',
  ord3: '> SAUVEZ LES OTAGES ET RAMENEZ-LES À %1',
  ord4: '> OUVREZ LES CAISSES DE RAVITAILLEMENT',
  ord5: '> LES SÉRIES RAPIDES AUGMENTENT LA PAIE',
  ord6: '> UNE MISSION SUR CINQ AMÈNE UN NAVIRE AMIRAL',
  ord7: '> MÉFIEZ-VOUS DES MINES ET DES HAUTS-FONDS',
  keysLine1: 'WASD — NAVIGUER • SHIFT — BOOST • CLIC G — FEU • CLIC D — ROQUETTES • F — FUMÉE • Q — GRENADES',
  keysLine2: 'E — ARSENAL • O — OPTIONS • H — QG • M — SON • P — PAUSE',
  touchLine1: 'MOITIÉ GAUCHE — BARRE • DROITE — VISER ET TIRER',
  touchLine2: 'BOUTONS À DROITE: BOOST, ROQUETTE, FUMÉE, GRENADES, ARSENAL',
  pressStart: '► APPUYEZ SUR ESPACE OU CLIQUEZ ◄', tapStart: '► TOUCHEZ L\'ÉCRAN ◄',
  contStart: '► ESPACE — REPRENDRE L\'OPÉRATION, MISSION %1 ◄',
  contStartT: '► TOUCHEZ — REPRENDRE, MISSION %1 ◄',
  settingsHint: 'O — OPTIONS', settingsBtn: 'OPTIONS',

  lvlDone: 'MISSION %1 ACCOMPLIE', stBases: 'BASES DÉTRUITES', stBunkers: 'BUNKERS ET RADARS',
  stShipsAir: 'NAVIRES / AVIONS', stHostages: 'OTAGES SAUVÉS', stStreak: 'MEILLEURE SÉRIE',
  stTime: 'TEMPS', stBonus: 'BONUS DE MISSION', stLevel: 'MISSION', stScore: 'SCORE',
  stBaseBunk: 'BASES / BUNKERS', stMines: 'MINES NEUTRALISÉES',
  creditsLeft: 'CRÉDITS: %1 — PASSEZ À L\'ARSENAL',
  nextLevel: 'ESPACE — MISSION %1: %2', nextLevelT: 'TOUCHEZ — MISSION %1',
  winTitle1: 'SECTEUR', winTitle2: 'NETTOYÉ',
  sectorSub: '%1 EST COULÉ — LA VOIE EST OUVERTE',
  bestRun: 'RECORD: MISSION %1 • %2 POINTS', restartHint: 'R — RECOMMENCER',
  loseTitle1: 'VOTRE NAVIRE', loseTitle2: 'A COULÉ',
  againWin: 'ESPACE — MISSION %1 • R — RECOMMENCER',
  againLose: 'ESPACE — REESSAYER • R — DEPUIS LE DÉBUT',
  againWinT: 'TOUCHEZ — MISSION %1', againLoseT: 'TOUCHEZ — REESSAYER',

  pause: 'PAUSE', pResume: 'P — REPRENDRE', pResumeT: 'TOUCHEZ POUR REPRENDRE',
  pSound: 'M — SON: %1', pSettings: 'O — OPTIONS', onWord: 'OUI', offWord: 'NON',

  setTitle: 'OPTIONS', setLang: 'LANGUE / LANGUAGE', setSound: 'SON', setMusic: 'MUSIQUE',
  setVolume: 'VOLUME', setControls: 'COMMANDES', setQuality: 'RÉSOLUTION',
  setShake: 'SECOUSSE DE CAMÉRA', setCrt: 'EFFET CRT', setDiff: 'DIFFICULTÉ',
  setReset: 'RÉINITIALISER LA PROGRESSION', setBack: 'RETOUR',
  setKeys: '↑↓ CHOISIR • ←→ MODIFIER • ÉCHAP — RETOUR', setKeysT: 'TOUCHEZ UNE LIGNE POUR CHANGER',
  setReload: 'EFFECTIF APRÈS REDÉMARRAGE', setDone: 'PROGRESSION REMISE À ZÉRO',
  ctrlAuto: 'AUTO', ctrlKeys: 'CLAVIER', ctrlTouch: 'TACTILE',
  diffEasy: 'FACILE', diffNormal: 'NORMAL', diffHard: 'DIFFICILE',

  hqBtn: 'QG', hqNew: 'RATION !', hqTitle: 'QG DE LA FLOTTE',
  hqStreak: 'JOUR %1 D\'AFFILÉE • RECORD %2', hqBonus: 'PRIME DE SOLDE +%1%', hqDayN: 'J%1',
  hqClaim: 'PRENDRE LA RATION', hqClaim2: '×2 POUR UNE PUB',
  hqClaimed: 'RATION PRISE • PROCHAINE DANS %1',
  hqClaimed2: 'RATION DOUBLE • PROCHAINE DANS %1', hqTomorrow: 'DEMAIN: %1',
  hqLeft: '%1 H %2 MIN', hqLeftM: '%1 MIN', hqTasks: 'ORDRES DU JOUR',
  hqAll: 'LES TROIS ORDRES: +%1 CR ET UN TOUR GRATUIT',
  hqAllOk: 'LES TROIS FAITS — +%1 DE PRIME',
  hqRank: 'GRADE', hqNext: 'GRADE SUIVANT DANS %1', hqTop: 'GRADE MAXIMUM',
  hqStart: 'PRIME DE DÉPART: +%1 CR', hqTotal: 'JOURS DE SERVICE: %1', hqSupply: 'EN DÉPÔT: %1',
  hqBack: 'RETOUR', hqBackK: 'ÉCHAP — RETOUR', hqFight: 'APPAREILLER', hqResume: 'REPRENDRE',
  crShort: 'CR', rktShort: 'RQT', drGold: 'OR', drSpin: 'TOUR GRATUIT',
  giftLine: 'LE QG A REMIS: %1', giftCr: '%1 CRÉDITS', giftAmmo: '%1 ROQUETTES',
  tomorrowTip: 'DEMAIN AU QG — JOUR %1: %2',
  lbPlace: 'CLASSEMENT DE LA FLOTTE: #%1', lbBest: 'RECORD PERSONNEL: %1',
  dqDone: 'ORDRE EXÉCUTÉ: %1', dqPay: '+%1 CRÉDITS DU QG',
  dqAll: 'TOUS LES ORDRES ! +%1 ET UN TOUR GRATUIT',
  dq_ships: 'COULER DES NAVIRES', dq_planes: 'ABATTRE DES AVIONS', dq_bases: 'DÉTRUIRE DES BASES',
  dq_bunkers: 'RASER DES BUNKERS', dq_mines: 'NEUTRALISER DES MINES', dq_hostage: 'SAUVER DES OTAGES',
  dq_score: 'MARQUER DES POINTS', dq_level: 'ATTEINDRE LA MISSION', dq_boss: 'COULER DES AMIRAUX',
  dq_streak: 'SÉRIE DE',
  rankUp: 'PROMU: %1',
  rk1: 'MATELOT', rk2: 'QUARTIER-MAÎTRE', rk3: 'MAÎTRE', rk4: 'LIEUTENANT',
  rk5: 'CAP. DE CORVETTE', rk6: 'CAP. DE FRÉGATE', rk7: 'CAPITAINE', rk8: 'CAP. DE VAISSEAU',
  rk9: 'CONTRE-AMIRAL', rk10: 'AMIRAL DE LA FLOTTE',
  rotate: 'TOURNEZ L\'APPAREIL À L\'HORIZONTALE', loading: 'CHARGEMENT…',
  tutTitle: 'TUTORIEL %1/%2',
  reviveFree: 'DEUXIÈME CHANCE',
  mercyMsg: 'AIDE DU QG : ENNEMI AFFAIBLI, BLINDAGE +%1%',
  ev_drop: 'LARGAGE',
  ev_ace: 'AS ENNEMI',
  ev_pilot: 'PILOTE ABATTU',
  ev_cargo: 'CONVOI DE BARGES',
  ev_raid: 'RAID AÉRIEN',
  ev_loot: 'CARGAISON À LA DÉRIVE',
  evDropMsg: 'NOTRE AVION A LARGUÉ UNE CAISSE — PRENEZ-LA AVANT L’ENNEMI',
  evAceMsg: 'UN AS ENNEMI VOUS TRAQUE — PRIME x3',
  evPilotMsg: 'NOTRE PILOTE EST À L’EAU — RÉCUPÉREZ-LE AU RALENTI',
  evCargoMsg: 'DES BARGES ENNEMIES TRANSPORTENT DU FRET — COULEZ-LES',
  evRaidMsg: 'RAID AÉRIEN ! ABATTEZ TOUTE L’ESCADRILLE',
  evLootMsg: 'DU FRET DÉRIVE — RAMASSEZ TOUT',
  evOk: 'RÉUSSI',
  evFail: 'TROP TARD',
  evLost: 'L’ENNEMI A PRIS LA CAISSE',
  evCargoEsc: 'BARGES COULÉES : %1 SUR %2',
  evAceTag: 'AS',
  bfTriple: 'TRIPLE',
  bfRapid: 'RAFALE',
  bfShield: 'BOUCLIER',
  bfNitro: 'NITRO',
  bfGot: '%1 PENDANT %2 S',
  mHeliEvac: 'UN HÉLICO A RÉCUPÉRÉ DES OTAGES : %1',
  btnPlay: 'JOUER',
  btnContinue: 'CONTINUER • MISSION %1',
  btnResume: 'REPRENDRE',
  btnMenu: 'MENU PRINCIPAL',
  btnNext: 'MISSION',
  howTitle: 'COMMENT JOUER',
  hudDist: '%1 M',
  tut1: 'NAVIGUEZ AVEC LES TOUCHES ZQSD/WASD',
  tut1T: 'DIRIGEZ AVEC LE POUCE GAUCHE',
  tut2: 'VISEZ À LA SOURIS, CLIC GAUCHE — FEU',
  tut2T: 'LE CANON TIRE SEUL — ALLEZ VERS L’ENNEMI',
  tut3: 'VOTRE OBJECTIF EST EN HAUT. COULEZ UN ENNEMI',
  tut4: 'LE PORTE-AVIONS RÉPARE ET A L’ARSENAL',
  tut4T: 'LE PORTE-AVIONS RÉPARE ET A L’ARSENAL',
  tut5: 'COMPÉTENCES : F — FUMÉE, SHIFT — BOOST',
  tut5T: 'BOUTONS À DROITE : BOOST ET FUMÉE',
  tutDone: 'C’EST PARTI ! BONNE CHANCE !',
  setResetSure: 'APPUYEZ ENCORE POUR CONFIRMER',
  tutClick: 'CLIQUEZ SUR LE JEU, PUIS WASD',
  rationGot: 'RATION DU JOUR REÇUE : %1',
};

/* ===== src/core/lang-de.js ===== */
;
'use strict';
/* lang-de.js — deutsch. Строк нет — берётся английская. */
TR.de = {
  hull: 'RUMPF', boost: 'BOOST', knots: 'KN %1', repairing: 'REPARATUR', pdShort: 'CIWS',
  alert: 'ALARM', radar: 'RADAR', radarOpen: 'RADAR • NETZ AUSGEFALLEN',
  lvlBases: 'LV.%1 • BASEN %2/%3', rescuedN: 'GERETTET %1', missilesN: 'RAKETEN:%1',
  boostHint: 'SHIFT — BOOST', scoreLbl: 'PUNKTE', creditsLbl: 'KREDITE', streakN: 'SERIE %1',
  arsenalHint: 'E — ARSENAL', arsenalTap: 'ARSENAL', critical: 'KRITISCHER SCHADEN',

  gameTitle: 'ARCHIPEL', operation: '— O P E R A T I O N —', carrier: '"NORD"',
  bossName: 'SCHLACHTSCHIFF "LEVIATHAN"', bossName2: 'TRÄGER "STURM"',
  bossName3: 'MONITOR "FESTUNG"', transport: 'TRANSPORTER "LADOGA"',
  lvl1: 'PERIMETER', lvl2: 'STURMSTRASSE', lvl3: 'ROTE RIFFE',
  lvl4: 'SCHWARZE UNTIEFEN', lvl5: 'HERZ DES ARCHIPELS',

  isl_fang: 'FANGZAHN', isl_thund: 'DONNER', isl_raid: 'RAID', isl_serp: 'SCHLANGE',
  isl_storm: 'STURM', isl_ash: 'ASCHE', isl_crab: 'KRABBE', isl_gloom: 'DÜSTERNIS',
  isl_needle: 'NADEL', isl_wolf: 'WOLF', isl_fort: 'FORT', isl_breeze: 'BRISE',
  isl_shark: 'HAI', isl_cape: 'KAP', isl_reef: 'RIFF', isl_anchor: 'ANKER',

  mObjective: 'AUFTRAG: FEINDBASEN ZERSTÖREN — %1',
  mCarryHome: 'BRINGE DIE GEISELN ZUM TRÄGER %1',
  mArsenal: 'E — ARSENAL AM TRÄGER',
  mArsenalT: 'DAS ARSENAL ÖFFNET AM TRÄGER',
  mMines: 'WARNUNG: MINENFELDER UM DIE INSELN',
  mAllTargets: 'ALLE ZIELE ZERSTÖRT! ZURÜCKZIEHEN!',
  mBaseDown: 'BASIS ZERSTÖRT: INSEL %1', mAllBases: 'ALLE BASEN ZERSTÖRT!',
  mBasesLeft: 'ALARM ERHÖHT — BASEN: %1',
  mRadarDown: 'FEINDRADAR ZERSTÖRT — KARTE OFFEN',
  mDistress: 'SOS: INSEL %1 — %2 MENSCHEN',
  mSlowDown: 'NEBEN DEN GEISELN LANGSAM FAHREN',
  mTakeThem: 'BRINGE DIE GEISELN ZU %1',
  mEvacuated: 'EVAKUIERT: %1 — DIE CREW DANKT DIR',
  mNoLauncher: 'KEIN WERFER — IM ARSENAL KAUFEN',
  mNoAmmo: 'KEINE RAKETEN — NACHLADEN', mBossComing: '%1 GEHT AUF ABFANGKURS',
  mBossSalvo: 'SALVE DES LEVIATHAN!', mBossLaunch: 'DIE FLUGGRUPPE STARTET',
  mBossDown: '%1 VERSENKT!', mAirTarget: 'LUFTKONTAKT: BOMBER',
  mSoundOn: 'TON AN', mSoundOff: 'TON AUS', mAlarm: 'ALARM',
  fRepair: '+REPARATUR', fRockets: '+%1 RAKETEN', fCredits: '+%1 cr',

  mTypeAssault: 'ANGRIFF', mTypeNight: 'NACHTOPERATION', mTypeEscort: 'LANDUNG',
  mTypeBoss: 'ABFANGEN', mTypeConvoy: 'KONVOI',
  objConvoy: 'AUFTRAG: ESKORTIERE %1 ZUR INSEL %2',
  objConvoy2: 'SINKT DER TRANSPORTER, IST DER AUFTRAG VERLOREN',
  hudConvoy: 'LV.%1 • KONVOI %2%', mConvoyHit: 'DER TRANSPORTER IST UNTER FEUER!',
  mConvoyLost: 'DER TRANSPORTER IST GESUNKEN', mConvoyDone: 'DER TRANSPORTER IST DA',
  mSubs: 'SONAR: U-BOOTE IM GEBIET', mSubNear: 'SCHRAUBENGERÄUSCH UNTEN',
  mSubSurface: 'U-BOOT AUFGETAUCHT — FEUER!',
  mNoDC: 'DU BRAUCHST WASSERBOMBEN — ARSENAL',
  hudSmoke: 'RAUCH', hudDC: 'BOMBEN',
  mSmokeHint: 'F — NEBELWAND, BRICHT STRAHLEN UND ZIELEN',
  itDC: 'WASSERBOMBEN', itDCD: 'Mit Q über das Heck werfen. Trifft U-Boote',

  objAssault: 'AUFTRAG: FEINDBASEN ZERSTÖREN — %1',
  objNight: 'AUFTRAG: HOLE LEISE %1 GEFANGENE HERAUS',
  objNight2: 'BLEIB AUS DEN LEUCHTTURMSTRAHLEN',
  objEscort: 'AUFTRAG: NIMM DIE MARINES VON INSEL %1 AUF',
  objEscort2: 'SETZE SIE AUF INSEL %1 AB UND RÄUME SIE',
  hudNight: 'LV.%1 • GEFANGENE %2/%3', hudEscort: 'LV.%1 • TRUPP %2/%3 • ZIEL %4/%5',
  hudStealth: 'TARNUNG', hudBlown: 'ENTDECKT',
  mMarinesUp: 'MARINES AN BORD: %1', mAllyAboard: 'VERBÜNDETE AN BORD: %1 SCHÜTZE(N)',
  mAllyLost: 'EIN SCHÜTZE GING ÜBER BORD',
  mFriendly: 'VERBÜNDETE STEGE: REPARATUR UND SCHÜTZEN',
  mMarinesGo: 'LANDUNG! SCHALTE DIE FEUERNESTER AUS',
  mMarinesDead: 'DER TRUPP IST GEFALLEN — MACH SELBST WEITER',
  mTargetDone: 'INSEL GERÄUMT', mSpotted: 'DU BIST ENTDECKT! GEBIET IN ALARM',
  mBeamWarn: 'STRAHL AUF DIR — ZURÜCK INS DUNKLE',
  mTornado: 'WARNUNG: WASSERHOSEN', mTornadoNear: 'WASSERHOSE NAH!',
  stStealth: 'UNENTDECKT GEBLIEBEN', yesWord: 'JA', noWord: 'NEIN',

  shopTitle: 'ARSENAL DES TRÄGERS %1', shopCredits: 'KREDITE: %1', shopMax: 'MAX',
  shopCost: '%1 cr', shopPick: 'WÄHLE EINE VERBESSERUNG',
  shopKeys: '↑↓ WÄHLEN • ENTER / LINKSKLICK — KAUFEN • E — RAUS',
  shopTouch: 'ZWEIMAL TIPPEN ZUM KAUFEN • SCHLIESSEN ✕', shopNoNeed: 'JETZT NICHT NÖTIG',
  shopMaxed: 'MAXIMALE STUFE', shopPoor: 'ZU WENIG KREDITE', shopBought: 'GEKAUFT: %1',
  itRepair: 'RUMPF REPARIEREN', itRepairD: 'Stellt +40 Rumpfpunkte her',
  itArmor: 'PANZERUNG', itArmorD: '+25 auf den maximalen Rumpf',
  itGun: 'HAUPTGESCHÜTZ', itGunD: '+4 Schaden pro Granate',
  itRate: 'AUTOLADER', itRateD: '+12% Feuerrate des Geschützes',
  itEngine: 'MOTOR', itEngineD: '+12% Tempo und Steuerung',
  itBoost: 'NACHBRENNER', itBoostD: 'Mehr Reserve, schnelleres Aufladen',
  itMissile: 'RAKETEN "HARPUNE"', itMissileD: 'Lenkraketen. Rechtsklick (+6)',
  itAmmo: 'RAKETEN +6', itAmmoD: 'Füllt die Harpunen-Raketen auf',
  itBoat: 'RETTUNGSBOOT', itBoatD: '+2 Plätze für Geiseln an Bord',
  itPd: 'CIWS "WESPE"', itPdD: 'Schießt Granaten und Raketen ab',
  itRadar: 'RADAR', itRadarD: '+330 Ortungsreichweite',

  adWatching: 'WERBUNG…', adDemo: 'DEMO-SPOT (AUSSERHALB VON CRAZYGAMES)',
  adFailed: 'DIE WERBUNG LUD NICHT', adNoFill: 'KEINE WERBUNG — BELOHNUNG TROTZDEM',
  adWait: 'VERFÜGBAR IN %1 S',
  revive: 'FÜR EINEN SPOT WIEDERBELEBEN', reviveT: 'TIPPEN — FÜR EINEN SPOT WEITER',
  reviveDone: 'SCHIFF WIEDERHERGESTELLT', reviveNone: 'WIEDERBELEBUNG SCHON GENUTZT',
  itAdAmmo: '+8 RAKETEN FÜR EINEN SPOT', itAdAmmoD: 'Ein kurzer Spot und die Kammer ist voll',
  itCrate: 'GLÜCKSKISTE', itCrateD: 'Dreh die Trommel: Kredite, Raketen, seltener Hauptpreis',
  adFree: 'GRATIS',
  itHull: 'ADMIRALSRUMPF', itHullD: 'Für immer: +40 Rumpf, +10% Tempo, fünfter Schütze',
  itHarp: 'GOLDENE HARPUNE', itHarpD: 'Für immer: +35% Schaden, nie unter vier im Vorrat',
  ownedWord: 'IM BESITZ', buyFail: 'DER KAUF KAM NICHT ZUSTANDE', buyOk: 'FREIGESCHALTET: %1',

  crateTitle: 'GLÜCKSKISTE', crateSpin: 'DREHEN', crateAd: 'NOCHMAL FÜR EINEN SPOT',
  crateWaitN: 'GRATIS IN %1', crateAdWait: 'SPOT IN %1', crateClose: 'E / ESC — SCHLIESSEN',
  crateCloseT: 'SCHLIESSEN ✕', crateWon: 'DU HAST: %1', crateJack: 'HAUPTPREIS!',
  przCredits: '%1 KREDITE', przAmmo: '%1 RAKETEN', przRepair: 'REPARATUR UND BOOST',
  przDC: 'WASSERBOMBEN', przJack: 'PREMIUM-GEGENSTAND', przNothing: 'NICHTS',

  tagNone: 'LEER', tagFix: 'REP',
  adLoading: 'WERBUNG LÄDT…', retryBtn: 'NOCHMAL VERSUCHEN',
  subtitle: 'ENDLOSE SEEKAMPAGNE', orders: 'BEFEHLE:',
  ord1: '> ZERSTÖRE BASEN, BUNKER UND RADARMASTEN',
  ord2: '> VERSENKE SCHIFFE, SCHIESSE FLUGZEUGE AB',
  ord3: '> RETTE GEISELN UND BRINGE SIE ZU %1',
  ord4: '> ÖFFNE VERSORGUNGSKISTEN AUF DEN INSELN',
  ord5: '> SCHNELLE SERIEN ERHÖHEN DIE PRÄMIE',
  ord6: '> JEDE FÜNFTE MISSION BRINGT EIN FLAGGSCHIFF',
  ord7: '> ACHTUNG VOR MINEN UND NACHTUNTIEFEN',
  keysLine1: 'WASD — FAHREN • SHIFT — BOOST • LINKS — FEUER • RECHTS — RAKETEN • F — RAUCH • Q — BOMBEN',
  keysLine2: 'E — ARSENAL • O — OPTIONEN • H — HQ • M — TON • P — PAUSE',
  touchLine1: 'LINKE HÄLFTE — STEUERN • RECHTE — ZIELEN UND FEUERN',
  touchLine2: 'TASTEN RECHTS: BOOST, RAKETE, RAUCH, BOMBEN, ARSENAL',
  pressStart: '► LEERTASTE DRÜCKEN ODER KLICKEN ◄', tapStart: '► TIPPE AUF DEN BILDSCHIRM ◄',
  contStart: '► LEERTASTE — OPERATION FORTSETZEN, MISSION %1 ◄',
  contStartT: '► TIPPEN — FORTSETZEN, MISSION %1 ◄',
  settingsHint: 'O — OPTIONEN', settingsBtn: 'OPTIONEN',

  lvlDone: 'MISSION %1 ERFÜLLT', stBases: 'BASEN ZERSTÖRT', stBunkers: 'BUNKER UND RADARE',
  stShipsAir: 'SCHIFFE / FLUGZEUGE', stHostages: 'GEISELN GERETTET', stStreak: 'BESTE SERIE',
  stTime: 'ZEIT', stBonus: 'MISSIONSBONUS', stLevel: 'MISSION', stScore: 'PUNKTE',
  stBaseBunk: 'BASEN / BUNKER', stMines: 'MINEN GERÄUMT',
  creditsLeft: 'KREDITE: %1 — SCHAU INS ARSENAL',
  nextLevel: 'LEERTASTE — MISSION %1: %2', nextLevelT: 'TIPPEN — MISSION %1',
  winTitle1: 'SEKTOR', winTitle2: 'GERÄUMT',
  sectorSub: '%1 IST VERSENKT — DER WEG IST FREI',
  bestRun: 'REKORD: MISSION %1 • %2 PUNKTE', restartHint: 'R — VON VORN',
  loseTitle1: 'DEIN SCHIFF', loseTitle2: 'IST GESUNKEN',
  againWin: 'LEERTASTE — MISSION %1 • R — VON VORN',
  againLose: 'LEERTASTE — NOCHMAL • R — NEUSTART',
  againWinT: 'TIPPEN — MISSION %1', againLoseT: 'TIPPEN — NOCHMAL VERSUCHEN',

  pause: 'PAUSE', pResume: 'P — WEITER', pResumeT: 'TIPPEN ZUM WEITERSPIELEN',
  pSound: 'M — TON: %1', pSettings: 'O — OPTIONEN', onWord: 'AN', offWord: 'AUS',

  setTitle: 'OPTIONEN', setLang: 'SPRACHE / LANGUAGE', setSound: 'TON', setMusic: 'MUSIK',
  setVolume: 'LAUTSTÄRKE', setControls: 'STEUERUNG', setQuality: 'AUFLÖSUNG',
  setShake: 'KAMERAWACKELN', setCrt: 'CRT-EFFEKT', setDiff: 'SCHWIERIGKEIT',
  setReset: 'FORTSCHRITT ZURÜCKSETZEN', setBack: 'ZURÜCK',
  setKeys: '↑↓ WÄHLEN • ←→ ÄNDERN • ESC — ZURÜCK', setKeysT: 'ZEILE ANTIPPEN ZUM ÄNDERN',
  setReload: 'GILT NACH NEUSTART', setDone: 'FORTSCHRITT ZURÜCKGESETZT',
  ctrlAuto: 'AUTO', ctrlKeys: 'TASTATUR', ctrlTouch: 'TOUCH',
  diffEasy: 'LEICHT', diffNormal: 'NORMAL', diffHard: 'SCHWER',

  hqBtn: 'HQ', hqNew: 'RATION!', hqTitle: 'FLOTTEN-HQ',
  hqStreak: 'TAG %1 IN FOLGE • REKORD %2', hqBonus: 'SOLDBONUS +%1%', hqDayN: 'T%1',
  hqClaim: 'RATION ABHOLEN', hqClaim2: '×2 FÜR EINEN SPOT',
  hqClaimed: 'RATION ABGEHOLT • NÄCHSTE IN %1',
  hqClaimed2: 'DOPPELTE RATION • NÄCHSTE IN %1', hqTomorrow: 'MORGEN: %1',
  hqLeft: '%1 STD %2 MIN', hqLeftM: '%1 MIN', hqTasks: 'TAGESBEFEHLE',
  hqAll: 'ALLE DREI BEFEHLE: +%1 CR UND EIN GRATISDREH',
  hqAllOk: 'ALLE DREI ERFÜLLT — +%1 BONUS',
  hqRank: 'RANG', hqNext: 'NÄCHSTER RANG IN %1', hqTop: 'HÖCHSTER RANG',
  hqStart: 'STARTBONUS: +%1 CR', hqTotal: 'DIENSTTAGE: %1', hqSupply: 'IM LAGER: %1',
  hqBack: 'ZURÜCK', hqBackK: 'ESC — ZURÜCK', hqFight: 'AUSLAUFEN', hqResume: 'WEITER',
  crShort: 'CR', rktShort: 'RKT', drGold: 'GOLD', drSpin: 'GRATISDREH',
  giftLine: 'DAS HQ GAB: %1', giftCr: '%1 KREDITE', giftAmmo: '%1 RAKETEN',
  tomorrowTip: 'MORGEN IM HQ — TAG %1: %2',
  lbPlace: 'FLOTTENRANGLISTE: #%1', lbBest: 'PERSÖNLICHER REKORD: %1',
  dqDone: 'BEFEHL ERFÜLLT: %1', dqPay: '+%1 KREDITE VOM HQ',
  dqAll: 'ALLE BEFEHLE! +%1 UND EIN GRATISDREH',
  dq_ships: 'SCHIFFE VERSENKEN', dq_planes: 'FLUGZEUGE ABSCHIESSEN', dq_bases: 'BASEN ZERSTÖREN',
  dq_bunkers: 'BUNKER EINEBNEN', dq_mines: 'MINEN RÄUMEN', dq_hostage: 'GEISELN RETTEN',
  dq_score: 'PUNKTE SAMMELN', dq_level: 'MISSION ERREICHEN', dq_boss: 'FLAGGSCHIFFE VERSENKEN',
  dq_streak: 'SERIE VON',
  rankUp: 'BEFÖRDERT: %1',
  rk1: 'MATROSE', rk2: 'MAAT', rk3: 'BOOTSMANN', rk4: 'LEUTNANT',
  rk5: 'KORVETTENKAPITÄN', rk6: 'FREGATTENKAPITÄN', rk7: 'KAPITÄN', rk8: 'KAPITÄN ZUR SEE',
  rk9: 'KONTERADMIRAL', rk10: 'FLOTTENADMIRAL',
  rotate: 'GERÄT INS QUERFORMAT DREHEN', loading: 'LÄDT…',
  tutTitle: 'TUTORIAL %1/%2',
  reviveFree: 'ZWEITE CHANCE',
  mercyMsg: 'HQ HILFT: SCHWÄCHERER FEIND, PANZER +%1%',
  ev_drop: 'NACHSCHUB',
  ev_ace: 'FEINDLICHES ASS',
  ev_pilot: 'ABGESCHOSSENER PILOT',
  ev_cargo: 'FRACHTKONVOI',
  ev_raid: 'LUFTANGRIFF',
  ev_loot: 'TREIBGUT',
  evDropMsg: 'UNSER FLUGZEUG WARF EINE KISTE AB — HOL SIE VOR DEM FEIND',
  evAceMsg: 'EIN FEINDLICHES ASS JAGT DICH — KOPFGELD x3',
  evPilotMsg: 'UNSER PILOT IST IM WASSER — LANGSAM AUFNEHMEN',
  evCargoMsg: 'FEINDLICHE KÄHNE MIT FRACHT — VERSENKE ALLE',
  evRaidMsg: 'LUFTANGRIFF! SCHIESS DIE GANZE STAFFEL AB',
  evLootMsg: 'FRACHT TREIBT IM WASSER — SAMMLE ALLES',
  evOk: 'ERLEDIGT',
  evFail: 'ZU SPÄT',
  evLost: 'DER FEIND HAT DIE KISTE',
  evCargoEsc: 'KÄHNE VERSENKT: %1 VON %2',
  evAceTag: 'ASS',
  bfTriple: 'DREIFACH',
  bfRapid: 'SALVE',
  bfShield: 'SCHILD',
  bfNitro: 'NITRO',
  bfGot: '%1 FÜR %2 S',
  mHeliEvac: 'HUBSCHRAUBER HAT GEISELN GERETTET: %1',
  btnPlay: 'SPIELEN',
  btnContinue: 'WEITER • MISSION %1',
  btnResume: 'WEITER',
  btnMenu: 'HAUPTMENÜ',
  btnNext: 'MISSION',
  howTitle: 'SO WIRD GESPIELT',
  hudDist: '%1 M',
  tut1: 'STEUERN MIT DEN TASTEN WASD',
  tut1T: 'MIT DEM LINKEN DAUMEN STEUERN',
  tut2: 'MIT DER MAUS ZIELEN, LINKSKLICK — FEUER',
  tut2T: 'DIE KANONE FEUERT SELBST — FAHR ZUM FEIND',
  tut3: 'DEIN ZIEL STEHT OBEN. VERSENKE EINEN FEIND',
  tut4: 'DER TRÄGER REPARIERT UND HAT DAS ARSENAL',
  tut4T: 'DER TRÄGER REPARIERT UND HAT DAS ARSENAL',
  tut5: 'FÄHIGKEITEN: F — RAUCH, SHIFT — TURBO',
  tut5T: 'RECHTE TASTEN: TURBO UND RAUCH',
  tutDone: 'FERTIG! VIEL GLÜCK, KOMMANDANT!',
  setResetSure: 'ZUM BESTÄTIGEN NOCHMAL DRÜCKEN',
  tutClick: 'KLICKE INS SPIEL, DANN WASD',
  rationGot: 'TAGESRATION ERHALTEN: %1',
};

/* ===== src/core/lang-it.js ===== */
;
'use strict';
/* lang-it.js — italiano. Строк нет — берётся английская. */
TR.it = {
  hull: 'SCAFO', boost: 'TURBO', knots: 'ND %1', repairing: 'RIPARAZIONE', pdShort: 'CIWS',
  alert: 'ALLARME', radar: 'RADAR', radarOpen: 'RADAR • RETE GIÙ',
  lvlBases: 'LIV.%1 • BASI %2/%3', rescuedN: 'SALVATI %1', missilesN: 'RAZZI:%1',
  boostHint: 'SHIFT — TURBO', scoreLbl: 'PUNTI', creditsLbl: 'CREDITI', streakN: 'SERIE %1',
  arsenalHint: 'E — ARSENALE', arsenalTap: 'ARSENALE', critical: 'DANNI CRITICI',

  gameTitle: 'ARCIPELAGO', operation: '— O P E R A Z I O N E —', carrier: '"NORD"',
  bossName: 'CORAZZATA "LEVIATANO"', bossName2: 'PORTAEREI "TEMPESTA"',
  bossName3: 'MONITORE "FORTEZZA"', transport: 'TRASPORTO "LADOGA"',
  lvl1: 'PERIMETRO', lvl2: 'STRETTO DELLE TEMPESTE', lvl3: 'SCOGLIERE ROSSE',
  lvl4: 'SECCHE NERE', lvl5: 'CUORE DELL\'ARCIPELAGO',

  isl_fang: 'ZANNA', isl_thund: 'TUONO', isl_raid: 'INCURSIONE', isl_serp: 'SERPENTE',
  isl_storm: 'TEMPESTA', isl_ash: 'CENERE', isl_crab: 'GRANCHIO', isl_gloom: 'PENOMBRA',
  isl_needle: 'AGO', isl_wolf: 'LUPO', isl_fort: 'FORTE', isl_breeze: 'BREZZA',
  isl_shark: 'SQUALO', isl_cape: 'CAPO', isl_reef: 'SCOGLIERA', isl_anchor: 'ANCORA',

  mObjective: 'OBIETTIVO: DISTRUGGI LE BASI NEMICHE — %1',
  mCarryHome: 'PORTA GLI OSTAGGI ALLA PORTAEREI %1',
  mArsenal: 'E — ARSENALE VICINO ALLA PORTAEREI',
  mArsenalT: 'L\'ARSENALE APRE ALLA PORTAEREI',
  mMines: 'ATTENZIONE: CAMPI MINATI INTORNO ALLE ISOLE',
  mAllTargets: 'TUTTI I BERSAGLI ABBATTUTI! RITIRATI!',
  mBaseDown: 'BASE DISTRUTTA: ISOLA %1', mAllBases: 'TUTTE LE BASI DISTRUTTE!',
  mBasesLeft: 'ALLARME ALZATO — BASI: %1',
  mRadarDown: 'RADAR NEMICO DISTRUTTO — MAPPA APERTA',
  mDistress: 'SOS: ISOLA %1 — %2 PERSONE',
  mSlowDown: 'RALLENTA VICINO AGLI OSTAGGI',
  mTakeThem: 'PORTA GLI OSTAGGI A %1',
  mEvacuated: 'EVACUATI: %1 — L\'EQUIPAGGIO TI RINGRAZIA',
  mNoLauncher: 'NIENTE LANCIATORE — COMPRALO IN ARSENALE',
  mNoAmmo: 'RAZZI FINITI — RIFORNISCI', mBossComing: '%1 VIENE A INTERCETTARTI',
  mBossSalvo: 'SALVA DEL LEVIATANO!', mBossLaunch: 'IL GRUPPO AEREO DECOLLA',
  mBossDown: '%1 AFFONDATO!', mAirTarget: 'CONTATTO AEREO: BOMBARDIERE',
  mSoundOn: 'AUDIO ACCESO', mSoundOff: 'AUDIO SPENTO', mAlarm: 'ALLARME',
  fRepair: '+RIPARAZIONE', fRockets: '+%1 RAZZI', fCredits: '+%1 cr',

  mTypeAssault: 'ASSALTO', mTypeNight: 'OPERAZIONE NOTTURNA', mTypeEscort: 'SBARCO',
  mTypeBoss: 'INTERCETTAZIONE', mTypeConvoy: 'CONVOGLIO',
  objConvoy: 'OBIETTIVO: SCORTA %1 FINO ALL\'ISOLA %2',
  objConvoy2: 'SE IL TRASPORTO AFFONDA, LA MISSIONE È PERSA',
  hudConvoy: 'LIV.%1 • CONVOGLIO %2%', mConvoyHit: 'IL TRASPORTO È SOTTO TIRO!',
  mConvoyLost: 'IL TRASPORTO È AFFONDATO', mConvoyDone: 'IL TRASPORTO È ARRIVATO',
  mSubs: 'SONAR: SOMMERGIBILI IN ZONA', mSubNear: 'RUMORE DI ELICHE SOTTO',
  mSubSurface: 'SOMMERGIBILE IN SUPERFICIE — FUOCO!',
  mNoDC: 'TI SERVONO BOMBE DI PROFONDITÀ — ARSENALE',
  hudSmoke: 'FUMO', hudDC: 'BOMBE',
  mSmokeHint: 'F — CORTINA FUMOGENA, TAGLIA FASCI E MIRA',
  itDC: 'BOMBE DI PROFONDITÀ', itDCD: 'Sgancia a poppa con Q. Arriva ai sommergibili',

  objAssault: 'OBIETTIVO: DISTRUGGI LE BASI NEMICHE — %1',
  objNight: 'OBIETTIVO: PORTA VIA IN SILENZIO %1 PRIGIONIERI',
  objNight2: 'RESTA FUORI DAI FASCI DEI FARI',
  objEscort: 'OBIETTIVO: IMBARCA I MARINES DALL\'ISOLA %1',
  objEscort2: 'SBARCALI SULL\'ISOLA %1 E RIPULISCILA',
  hudNight: 'LIV.%1 • PRIGIONIERI %2/%3', hudEscort: 'LIV.%1 • TRUPPA %2/%3 • OBIETT. %4/%5',
  hudStealth: 'FURTIVITÀ', hudBlown: 'SCOPERTO',
  mMarinesUp: 'MARINES A BORDO: %1', mAllyAboard: 'ALLEATO A BORDO: %1 TIRATORE/I',
  mAllyLost: 'UN TIRATORE È CADUTO IN MARE',
  mFriendly: 'MOLI ALLEATI: RIPARANO E DANNO TIRATORI',
  mMarinesGo: 'SBARCO! ZITTISCI LE POSTAZIONI DI FUOCO',
  mMarinesDead: 'LA SQUADRA È CADUTA — FINISCI TU',
  mTargetDone: 'ISOLA RIPULITA', mSpotted: 'TI HANNO VISTO! ZONA IN ALLARME',
  mBeamWarn: 'FASCIO ADDOSSO — TORNA NEL BUIO',
  mTornado: 'ALLERTA: TROMBE MARINE', mTornadoNear: 'TROMBA VICINA!',
  stStealth: 'MAI SCOPERTO', yesWord: 'SÌ', noWord: 'NO',

  shopTitle: 'ARSENALE DELLA PORTAEREI %1', shopCredits: 'CREDITI: %1', shopMax: 'MAX',
  shopCost: '%1 cr', shopPick: 'SCEGLI UN MIGLIORAMENTO',
  shopKeys: '↑↓ SCEGLI • INVIO / TASTO SX — COMPRA • E — ESCI',
  shopTouch: 'TOCCA DUE VOLTE PER COMPRARE • CHIUDI ✕', shopNoNeed: 'ORA NON SERVE',
  shopMaxed: 'LIVELLO MASSIMO', shopPoor: 'CREDITI INSUFFICIENTI', shopBought: 'COMPRATO: %1',
  itRepair: 'RIPARA LO SCAFO', itRepairD: 'Recupera +40 punti scafo',
  itArmor: 'CORAZZA', itArmorD: '+25 allo scafo massimo',
  itGun: 'CANNONE PRINCIPALE', itGunD: '+4 danni per colpo',
  itRate: 'CARICATORE AUTOMATICO', itRateD: '+12% di cadenza di tiro',
  itEngine: 'MOTORE', itEngineD: '+12% di velocità e manovra',
  itBoost: 'POSTBRUCIATORE', itBoostD: 'Più riserva e ricarica più rapida',
  itMissile: 'RAZZI "ARPIONE"', itMissileD: 'Razzi guidati. Tasto destro (+6)',
  itAmmo: 'RAZZI +6', itAmmoD: 'Rifornisce i razzi Arpione',
  itBoat: 'SCIALUPPA', itBoatD: '+2 posti per gli ostaggi a bordo',
  itPd: 'CIWS "VESPA"', itPdD: 'Abbatte colpi e razzi in arrivo',
  itRadar: 'RADAR', itRadarD: '+330 di raggio di scoperta',

  adWatching: 'PUBBLICITÀ…', adDemo: 'SPOT DI PROVA (FUORI DA CRAZYGAMES)',
  adFailed: 'LO SPOT NON È PARTITO', adNoFill: 'NIENTE SPOT — PREMIO CONCESSO',
  adWait: 'DISPONIBILE TRA %1 S',
  revive: 'RIVIVI GUARDANDO UNO SPOT', reviveT: 'TOCCA — RIVIVI CON UNO SPOT',
  reviveDone: 'NAVE RIPRISTINATA', reviveNone: 'RINASCITA GIÀ USATA',
  itAdAmmo: '+8 RAZZI PER UNO SPOT', itAdAmmoD: 'Uno spot breve e la santabarbara è piena',
  itCrate: 'CASSA DELLA FORTUNA', itCrateD: 'Gira il tamburo: crediti, razzi, premio raro',
  adFree: 'GRATIS',
  itHull: 'SCAFO DELL\'AMMIRAGLIO', itHullD: 'Per sempre: +40 scafo, +10% velocità, quinto tiratore',
  itHarp: 'ARPIONE DORATO', itHarpD: 'Per sempre: +35% di danno, mai meno di quattro',
  ownedWord: 'POSSEDUTO', buyFail: 'L\'ACQUISTO NON È ANDATO A BUON FINE', buyOk: 'SBLOCCATO: %1',

  crateTitle: 'CASSA DELLA FORTUNA', crateSpin: 'GIRA', crateAd: 'GIRA ANCORA PER UNO SPOT',
  crateWaitN: 'GRATIS TRA %1', crateAdWait: 'SPOT TRA %1', crateClose: 'E / ESC — CHIUDI',
  crateCloseT: 'CHIUDI ✕', crateWon: 'HAI VINTO: %1', crateJack: 'PREMIO GROSSO!',
  przCredits: '%1 CREDITI', przAmmo: '%1 RAZZI', przRepair: 'RIPARAZIONE E TURBO',
  przDC: 'BOMBE DI PROFONDITÀ', przJack: 'OGGETTO PREMIUM', przNothing: 'NIENTE',

  tagNone: 'VUOTO', tagFix: 'RIP',
  adLoading: 'CARICAMENTO SPOT…', retryBtn: 'RIPROVA MISSIONE',
  subtitle: 'CAMPAGNA NAVALE SENZA FINE', orders: 'ORDINI:',
  ord1: '> DISTRUGGI BASI, BUNKER E ANTENNE RADAR',
  ord2: '> AFFONDA NAVI, ABBATTI AEREI',
  ord3: '> SALVA GLI OSTAGGI E PORTALI A %1',
  ord4: '> APRI LE CASSE DI RIFORNIMENTO SULLE ISOLE',
  ord5: '> LE SERIE RAPIDE AUMENTANO LA PAGA',
  ord6: '> OGNI QUINTA MISSIONE PORTA UN\'AMMIRAGLIA',
  ord7: '> ATTENTO A MINE E SECCHE NOTTURNE',
  keysLine1: 'WASD — MUOVI • SHIFT — TURBO • TASTO SX — FUOCO • DX — RAZZI • F — FUMO • Q — BOMBE',
  keysLine2: 'E — ARSENALE • O — OPZIONI • H — QG • M — AUDIO • P — PAUSA',
  touchLine1: 'METÀ SINISTRA — TIMONE • DESTRA — MIRA E SPARA',
  touchLine2: 'TASTI A DESTRA: TURBO, RAZZO, FUMO, BOMBE, ARSENALE',
  pressStart: '► PREMI SPAZIO O CLICCA ◄', tapStart: '► TOCCA LO SCHERMO ◄',
  contStart: '► SPAZIO — RIPRENDI L\'OPERAZIONE, MISSIONE %1 ◄',
  contStartT: '► TOCCA — RIPRENDI, MISSIONE %1 ◄',
  settingsHint: 'O — OPZIONI', settingsBtn: 'OPZIONI',

  lvlDone: 'MISSIONE %1 COMPLETATA', stBases: 'BASI DISTRUTTE', stBunkers: 'BUNKER E RADAR',
  stShipsAir: 'NAVI / AEREI', stHostages: 'OSTAGGI SALVATI', stStreak: 'SERIE MIGLIORE',
  stTime: 'TEMPO', stBonus: 'BONUS MISSIONE', stLevel: 'MISSIONE', stScore: 'PUNTI',
  stBaseBunk: 'BASI / BUNKER', stMines: 'MINE BONIFICATE',
  creditsLeft: 'CREDITI: %1 — PASSA DALL\'ARSENALE',
  nextLevel: 'SPAZIO — MISSIONE %1: %2', nextLevelT: 'TOCCA — MISSIONE %1',
  winTitle1: 'SETTORE', winTitle2: 'RIPULITO',
  sectorSub: '%1 È AFFONDATO — LA VIA È APERTA',
  bestRun: 'RECORD: MISSIONE %1 • %2 PUNTI', restartHint: 'R — RICOMINCIA',
  loseTitle1: 'LA TUA NAVE', loseTitle2: 'È AFFONDATA',
  againWin: 'SPAZIO — MISSIONE %1 • R — RICOMINCIA',
  againLose: 'SPAZIO — RIPROVA • R — DA CAPO',
  againWinT: 'TOCCA — MISSIONE %1', againLoseT: 'TOCCA — RIPROVA LA MISSIONE',

  pause: 'PAUSA', pResume: 'P — RIPRENDI', pResumeT: 'TOCCA PER RIPRENDERE',
  pSound: 'M — AUDIO: %1', pSettings: 'O — OPZIONI', onWord: 'SÌ', offWord: 'NO',

  setTitle: 'OPZIONI', setLang: 'LINGUA / LANGUAGE', setSound: 'AUDIO', setMusic: 'MUSICA',
  setVolume: 'VOLUME', setControls: 'COMANDI', setQuality: 'RISOLUZIONE',
  setShake: 'SCOSSA DELLA CAMERA', setCrt: 'EFFETTO CRT', setDiff: 'DIFFICOLTÀ',
  setReset: 'AZZERA I PROGRESSI', setBack: 'INDIETRO',
  setKeys: '↑↓ SCEGLI • ←→ CAMBIA • ESC — INDIETRO', setKeysT: 'TOCCA UNA RIGA PER CAMBIARE',
  setReload: 'VALE DOPO IL RIAVVIO', setDone: 'PROGRESSI AZZERATI',
  ctrlAuto: 'AUTO', ctrlKeys: 'TASTIERA', ctrlTouch: 'TOCCO',
  diffEasy: 'FACILE', diffNormal: 'NORMALE', diffHard: 'DIFFICILE',

  hqBtn: 'QG', hqNew: 'RAZIONE!', hqTitle: 'QG DELLA FLOTTA',
  hqStreak: 'GIORNO %1 DI FILA • RECORD %2', hqBonus: 'BONUS PAGA +%1%', hqDayN: 'G%1',
  hqClaim: 'RITIRA LA RAZIONE', hqClaim2: '×2 PER UNO SPOT',
  hqClaimed: 'RAZIONE RITIRATA • PROSSIMA TRA %1',
  hqClaimed2: 'RAZIONE DOPPIA • PROSSIMA TRA %1', hqTomorrow: 'DOMANI: %1',
  hqLeft: '%1 H %2 MIN', hqLeftM: '%1 MIN', hqTasks: 'ORDINI DEL GIORNO',
  hqAll: 'TUTTI E TRE GLI ORDINI: +%1 CR E UN GIRO GRATIS',
  hqAllOk: 'TUTTI E TRE FATTI — +%1 DI BONUS',
  hqRank: 'GRADO', hqNext: 'PROSSIMO GRADO TRA %1', hqTop: 'GRADO MASSIMO',
  hqStart: 'BONUS INIZIALE: +%1 CR', hqTotal: 'GIORNI DI SERVIZIO: %1', hqSupply: 'IN DEPOSITO: %1',
  hqBack: 'INDIETRO', hqBackK: 'ESC — INDIETRO', hqFight: 'SALPA', hqResume: 'RIPRENDI',
  crShort: 'CR', rktShort: 'RZZ', drGold: 'ORO', drSpin: 'GIRO GRATIS',
  giftLine: 'IL QG HA DATO: %1', giftCr: '%1 CREDITI', giftAmmo: '%1 RAZZI',
  tomorrowTip: 'DOMANI AL QG — GIORNO %1: %2',
  lbPlace: 'CLASSIFICA DELLA FLOTTA: #%1', lbBest: 'RECORD PERSONALE: %1',
  dqDone: 'ORDINE ESEGUITO: %1', dqPay: '+%1 CREDITI DAL QG',
  dqAll: 'TUTTI GLI ORDINI! +%1 E UN GIRO GRATIS',
  dq_ships: 'AFFONDARE NAVI', dq_planes: 'ABBATTERE AEREI', dq_bases: 'DISTRUGGERE BASI',
  dq_bunkers: 'RADERE BUNKER', dq_mines: 'BONIFICARE MINE', dq_hostage: 'SALVARE OSTAGGI',
  dq_score: 'FARE PUNTI', dq_level: 'ARRIVARE ALLA MISSIONE', dq_boss: 'AFFONDARE AMMIRAGLIE',
  dq_streak: 'SERIE DI',
  rankUp: 'PROMOSSO: %1',
  rk1: 'MARINAIO', rk2: 'SOTTUFFICIALE', rk3: 'CAPO', rk4: 'TENENTE',
  rk5: 'CAP. DI CORVETTA', rk6: 'CAP. DI FREGATA', rk7: 'CAPITANO', rk8: 'CAP. DI VASCELLO',
  rk9: 'CONTRAMMIRAGLIO', rk10: 'AMMIRAGLIO',
  rotate: 'RUOTA IL DISPOSITIVO IN ORIZZONTALE', loading: 'CARICAMENTO…',
  tutTitle: 'TUTORIAL %1/%2',
  reviveFree: 'SECONDA POSSIBILITÀ',
  mercyMsg: 'AIUTO DAL QG: NEMICO PIÙ DEBOLE, CORAZZA +%1%',
  ev_drop: 'LANCIO RIFORNIMENTI',
  ev_ace: 'ASSO NEMICO',
  ev_pilot: 'PILOTA ABBATTUTO',
  ev_cargo: 'CONVOGLIO DI CHIATTE',
  ev_raid: 'RAID AEREO',
  ev_loot: 'CARICO IN MARE',
  evDropMsg: 'IL NOSTRO AEREO HA SGANCIATO UNA CASSA — PRENDILA PRIMA DEL NEMICO',
  evAceMsg: 'UN ASSO NEMICO TI DÀ LA CACCIA — TAGLIA x3',
  evPilotMsg: 'IL NOSTRO PILOTA È IN ACQUA — RECUPERALO PIANO',
  evCargoMsg: 'CHIATTE NEMICHE CON CARICO — AFFONDALE TUTTE',
  evRaidMsg: 'RAID AEREO! ABBATTI TUTTA LA SQUADRIGLIA',
  evLootMsg: 'C’È CARICO IN MARE — RACCOGLI TUTTO',
  evOk: 'COMPLETATO',
  evFail: 'TROPPO TARDI',
  evLost: 'IL NEMICO HA PRESO LA CASSA',
  evCargoEsc: 'CHIATTE AFFONDATE: %1 SU %2',
  evAceTag: 'ASSO',
  bfTriple: 'TRIPLO',
  bfRapid: 'RAFFICA',
  bfShield: 'SCUDO',
  bfNitro: 'NITRO',
  bfGot: '%1 PER %2 S',
  mHeliEvac: 'UN ELICOTTERO HA RECUPERATO OSTAGGI: %1',
  btnPlay: 'GIOCA',
  btnContinue: 'CONTINUA • MISSIONE %1',
  btnResume: 'RIPRENDI',
  btnMenu: 'MENU PRINCIPALE',
  btnNext: 'MISSIONE',
  howTitle: 'COME SI GIOCA',
  hudDist: '%1 M',
  tut1: 'NAVIGA CON I TASTI WASD',
  tut1T: 'GUIDA CON IL POLLICE SINISTRO',
  tut2: 'MIRA COL MOUSE, TASTO SINISTRO — FUOCO',
  tut2T: 'IL CANNONE SPARA DA SOLO — VAI VERSO IL NEMICO',
  tut3: 'L’OBIETTIVO È IN ALTO. AFFONDA UN NEMICO',
  tut4: 'LA PORTAEREI RIPARA E HA L’ARSENALE',
  tut4T: 'LA PORTAEREI RIPARA E HA L’ARSENALE',
  tut5: 'ABILITÀ: F — FUMO, SHIFT — TURBO',
  tut5T: 'TASTI A DESTRA: TURBO E FUMO',
  tutDone: 'FATTO! BUONA FORTUNA, COMANDANTE!',
  setResetSure: 'PREMI ANCORA PER CONFERMARE',
  tutClick: 'CLICCA SUL GIOCO, POI WASD',
  rationGot: 'RAZIONE DEL GIORNO RICEVUTA: %1',
};

/* ===== src/core/lang-tr.js ===== */
;
'use strict';
/* lang-tr.js — türkçe. Строк нет — берётся английская. */
TR.tr = {
  hull: 'GÖVDE', boost: 'TURBO', knots: 'KNOT %1', repairing: 'ONARIM', pdShort: 'CIWS',
  alert: 'ALARM', radar: 'RADAR', radarOpen: 'RADAR • AĞ ÇÖKTÜ',
  lvlBases: 'SV.%1 • ÜSLER %2/%3', rescuedN: 'KURTARILAN %1', missilesN: 'ROKET:%1',
  boostHint: 'SHIFT — TURBO', scoreLbl: 'PUAN', creditsLbl: 'KREDİ', streakN: 'SERİ %1',
  arsenalHint: 'E — CEPHANELİK', arsenalTap: 'CEPHANELİK', critical: 'KRİTİK HASAR',

  gameTitle: 'TAKIMADALAR', operation: '— O P E R A S Y O N —', carrier: '"KUZEY"',
  bossName: 'ZIRHLI "LEVIATHAN"', bossName2: 'UÇAK GEMİSİ "FIRTINA"',
  bossName3: 'MONİTÖR "KALE"', transport: 'NAKLİYE "LADOGA"',
  lvl1: 'ÇEVRE HATTI', lvl2: 'FIRTINA BOĞAZI', lvl3: 'KIZIL RESİFLER',
  lvl4: 'KARA SIĞLIKLAR', lvl5: 'TAKIMADALARIN KALBİ',

  isl_fang: 'DİŞ', isl_thund: 'GÖK GÜRÜLTÜSÜ', isl_raid: 'AKIN', isl_serp: 'YILAN',
  isl_storm: 'FIRTINA', isl_ash: 'KÜL', isl_crab: 'YENGEÇ', isl_gloom: 'KARANLIK',
  isl_needle: 'İĞNE', isl_wolf: 'KURT', isl_fort: 'KALE', isl_breeze: 'MELTEM',
  isl_shark: 'KÖPEKBALIĞI', isl_cape: 'BURUN', isl_reef: 'RESİF', isl_anchor: 'ÇAPA',

  mObjective: 'GÖREV: DÜŞMAN ÜSLERİNİ YOK ET — %1',
  mCarryHome: 'REHİNELERİ %1 GEMİSİNE GÖTÜR',
  mArsenal: 'E — GEMİNİN YANINDA CEPHANELİK',
  mArsenalT: 'CEPHANELİK GEMİDE AÇILIR',
  mMines: 'DİKKAT: ADALARIN ÇEVRESİNDE MAYIN TARLALARI',
  mAllTargets: 'TÜM HEDEFLER YOK EDİLDİ! GERİ ÇEKİL!',
  mBaseDown: 'ÜS YOK EDİLDİ: %1 ADASI', mAllBases: 'TÜM ÜSLER YOK EDİLDİ!',
  mBasesLeft: 'ALARM YÜKSELDİ — KALAN ÜS: %1',
  mRadarDown: 'DÜŞMAN RADARI YOK EDİLDİ — HARİTA AÇIK',
  mDistress: 'İMDAT: %1 ADASI — %2 KİŞİ',
  mSlowDown: 'REHİNELERİN YANINDA YAVAŞLA',
  mTakeThem: 'REHİNELERİ %1 GEMİSİNE GÖTÜR',
  mEvacuated: 'TAHLİYE: %1 — MÜRETTEBAT TEŞEKKÜR EDİYOR',
  mNoLauncher: 'RAMPA YOK — CEPHANELİKTEN AL',
  mNoAmmo: 'ROKET BİTTİ — İKMAL YAP', mBossComing: '%1 ÖNLEMEYE GELİYOR',
  mBossSalvo: 'LEVIATHAN YAYLIM ATEŞİ!', mBossLaunch: 'UÇAK GRUBU KALKIYOR',
  mBossDown: '%1 BATIRILDI!', mAirTarget: 'HAVA TEMASI: BOMBARDIMAN UÇAĞI',
  mSoundOn: 'SES AÇIK', mSoundOff: 'SES KAPALI', mAlarm: 'ALARM',
  fRepair: '+ONARIM', fRockets: '+%1 ROKET', fCredits: '+%1 kr',

  mTypeAssault: 'TAARRUZ', mTypeNight: 'GECE HAREKATI', mTypeEscort: 'ÇIKARMA',
  mTypeBoss: 'ÖNLEME', mTypeConvoy: 'KONVOY',
  objConvoy: 'GÖREV: %1 GEMİSİNİ %2 ADASINA GÖTÜR',
  objConvoy2: 'NAKLİYE BATARSA GÖREV KAYBEDİLİR',
  hudConvoy: 'SV.%1 • KONVOY %2%', mConvoyHit: 'NAKLİYE ATEŞ ALTINDA!',
  mConvoyLost: 'NAKLİYE BATTI', mConvoyDone: 'NAKLİYE VARDI',
  mSubs: 'SONAR: BÖLGEDE DENİZALTILAR', mSubNear: 'ALTTA PERVANE SESİ',
  mSubSurface: 'DENİZALTI SUYÜZÜNDE — ATEŞ!',
  mNoDC: 'DERİNLİK BOMBASI LAZIM — CEPHANELİK',
  hudSmoke: 'SİS', hudDC: 'BOMBA',
  mSmokeHint: 'F — SİS PERDESİ, IŞINLARI VE NİŞANI KESER',
  itDC: 'DERİNLİK BOMBALARI', itDCD: 'Q ile kıçtan bırak. Denizaltılara ulaşır',

  objAssault: 'GÖREV: DÜŞMAN ÜSLERİNİ YOK ET — %1',
  objNight: 'GÖREV: SESSİZCE %1 TUTSAĞI KURTAR',
  objNight2: 'DENİZ FENERİ IŞINLARINDAN UZAK DUR',
  objEscort: 'GÖREV: %1 ADASINDAN DENİZ PİYADELERİNİ AL',
  objEscort2: 'ONLARI %1 ADASINA ÇIKAR VE ADAYI TEMİZLE',
  hudNight: 'SV.%1 • TUTSAK %2/%3', hudEscort: 'SV.%1 • BİRLİK %2/%3 • HEDEF %4/%5',
  hudStealth: 'GİZLİLİK', hudBlown: 'FARK EDİLDİ',
  mMarinesUp: 'GEMİDE PİYADE: %1', mAllyAboard: 'GEMİDE DOST: %1 NİŞANCI',
  mAllyLost: 'BİR NİŞANCI DENİZE DÜŞTÜ',
  mFriendly: 'DOST İSKELELER: ONARIM VE NİŞANCI',
  mMarinesGo: 'ÇIKARMA! ATEŞ YUVALARINI SUSTUR',
  mMarinesDead: 'MANGA DÜŞTÜ — İŞİ SEN BİTİR',
  mTargetDone: 'ADA TEMİZLENDİ', mSpotted: 'FARK EDİLDİN! BÖLGE ALARMDA',
  mBeamWarn: 'IŞIN ÜSTÜNDE — KARANLIĞA DÖN',
  mTornado: 'UYARI: DENİZ HORTUMLARI', mTornadoNear: 'HORTUM YAKINDA!',
  stStealth: 'HİÇ FARK EDİLMEDİ', yesWord: 'EVET', noWord: 'HAYIR',

  shopTitle: '%1 GEMİSİNİN CEPHANELİĞİ', shopCredits: 'KREDİ: %1', shopMax: 'MAX',
  shopCost: '%1 kr', shopPick: 'BİR GELİŞTİRME SEÇ',
  shopKeys: '↑↓ SEÇ • ENTER / SOL TIK — AL • E — ÇIKIŞ',
  shopTouch: 'ALMAK İÇİN İKİ KEZ DOKUN • KAPAT ✕', shopNoNeed: 'ŞİMDİ GEREK YOK',
  shopMaxed: 'EN ÜST SEVİYE', shopPoor: 'KREDİ YETERSİZ', shopBought: 'ALINDI: %1',
  itRepair: 'GÖVDEYİ ONAR', itRepairD: '+40 gövde puanı geri verir',
  itArmor: 'ZIRH', itArmorD: 'Azami gövdeye +25',
  itGun: 'ANA TOP', itGunD: 'Mermi başına +4 hasar',
  itRate: 'OTOMATİK DOLDURUCU', itRateD: 'Topun atış hızına +12%',
  itEngine: 'MOTOR', itEngineD: '+12% hız ve manevra',
  itBoost: 'ART YAKICI', itBoostD: 'Daha çok yedek, daha hızlı dolum',
  itMissile: '"ZIPKIN" ROKETLERİ', itMissileD: 'Güdümlü roket. Sağ tık (+6)',
  itAmmo: 'ROKET +6', itAmmoD: 'Zıpkın roketlerini tazeler',
  itBoat: 'CANKURTARAN', itBoatD: 'Gemide rehineler için +2 yer',
  itPd: 'CIWS "EŞEK ARISI"', itPdD: 'Gelen mermi ve roketleri düşürür',
  itRadar: 'RADAR', itRadarD: '+330 tespit menzili',

  adWatching: 'REKLAM…', adDemo: 'DENEME REKLAMI (CRAZYGAMES DIŞINDA)',
  adFailed: 'REKLAM YÜKLENMEDİ', adNoFill: 'REKLAM YOK — ÖDÜL YİNE VERİLDİ',
  adWait: '%1 SN SONRA HAZIR',
  revive: 'REKLAM İZLEYİP DEVAM ET', reviveT: 'DOKUN — REKLAMLA DEVAM ET',
  reviveDone: 'GEMİ ONARILDI', reviveNone: 'DEVAM HAKKI KULLANILDI',
  itAdAmmo: 'REKLAMA +8 ROKET', itAdAmmoD: 'Kısa bir reklam ve cephanelik dolu',
  itCrate: 'ŞANS SANDIĞI', itCrateD: 'Çarkı çevir: kredi, roket, nadir büyük ödül',
  adFree: 'ÜCRETSİZ',
  itHull: 'AMİRAL GÖVDESİ', itHullD: 'Kalıcı: +40 gövde, +10% hız, beşinci nişancı',
  itHarp: 'ALTIN ZIPKIN', itHarpD: 'Kalıcı: +35% roket hasarı, hiç dörtten az kalmaz',
  ownedWord: 'SAHİPSİN', buyFail: 'SATIN ALMA TAMAMLANMADI', buyOk: 'AÇILDI: %1',

  crateTitle: 'ŞANS SANDIĞI', crateSpin: 'ÇEVİR', crateAd: 'REKLAMLA BİR KEZ DAHA',
  crateWaitN: '%1 SONRA ÜCRETSİZ', crateAdWait: 'REKLAM %1 SONRA', crateClose: 'E / ESC — KAPAT',
  crateCloseT: 'KAPAT ✕', crateWon: 'KAZANDIN: %1', crateJack: 'BÜYÜK ÖDÜL!',
  przCredits: '%1 KREDİ', przAmmo: '%1 ROKET', przRepair: 'ONARIM VE TURBO',
  przDC: 'DERİNLİK BOMBALARI', przJack: 'PREMIUM EŞYA', przNothing: 'BOŞ',

  tagNone: 'BOŞ', tagFix: 'ONAR',
  adLoading: 'REKLAM YÜKLENİYOR…', retryBtn: 'TEKRAR DENE',
  subtitle: 'BİTMEYEN DENİZ HAREKATI', orders: 'EMİRLER:',
  ord1: '> ÜSLERİ, SIĞINAKLARI VE RADAR DİREKLERİNİ YIK',
  ord2: '> GEMİLERİ BATIR, UÇAKLARI DÜŞÜR',
  ord3: '> REHİNELERİ KURTAR VE %1 GEMİSİNE GÖTÜR',
  ord4: '> ADALARDAKİ İKMAL SANDIKLARINI AÇ',
  ord5: '> HIZLI SERİLER ÖDEMEYİ ARTIRIR',
  ord6: '> HER BEŞİNCİ GÖREVDE BİR AMİRAL GEMİSİ VAR',
  ord7: '> MAYINLARA VE GECE SIĞLIKLARINA DİKKAT',
  keysLine1: 'WASD — SÜR • SHIFT — TURBO • SOL TIK — ATEŞ • SAĞ TIK — ROKET • F — SİS • Q — BOMBA',
  keysLine2: 'E — CEPHANELİK • O — AYARLAR • H — KARARGAH • M — SES • P — DURAKLAT',
  touchLine1: 'SOL YARIM — DÜMEN • SAĞ YARIM — NİŞAN VE ATEŞ',
  touchLine2: 'SAĞDAKİ TUŞLAR: TURBO, ROKET, SİS, BOMBA, CEPHANELİK',
  pressStart: '► BOŞLUĞA BAS VEYA TIKLA ◄', tapStart: '► EKRANA DOKUN ◄',
  contStart: '► BOŞLUK — HAREKATA DEVAM, GÖREV %1 ◄',
  contStartT: '► DOKUN — DEVAM, GÖREV %1 ◄',
  settingsHint: 'O — AYARLAR', settingsBtn: 'AYARLAR',

  lvlDone: 'GÖREV %1 TAMAM', stBases: 'YOK EDİLEN ÜSLER', stBunkers: 'SIĞINAK VE RADARLAR',
  stShipsAir: 'GEMİ / UÇAK', stHostages: 'KURTARILAN REHİNE', stStreak: 'EN İYİ SERİ',
  stTime: 'SÜRE', stBonus: 'GÖREV İKRAMİYESİ', stLevel: 'GÖREV', stScore: 'PUAN',
  stBaseBunk: 'ÜS / SIĞINAK', stMines: 'TEMİZLENEN MAYIN',
  creditsLeft: 'KREDİ: %1 — CEPHANELİĞE UĞRA',
  nextLevel: 'BOŞLUK — GÖREV %1: %2', nextLevelT: 'DOKUN — GÖREV %1',
  winTitle1: 'BÖLGE', winTitle2: 'TEMİZ',
  sectorSub: '%1 BATTI — YOL AÇIK',
  bestRun: 'REKOR: GÖREV %1 • %2 PUAN', restartHint: 'R — BAŞTAN BAŞLA',
  loseTitle1: 'GEMİN', loseTitle2: 'BATTI',
  againWin: 'BOŞLUK — GÖREV %1 • R — BAŞTAN',
  againLose: 'BOŞLUK — TEKRAR DENE • R — SIFIRDAN',
  againWinT: 'DOKUN — GÖREV %1', againLoseT: 'DOKUN — TEKRAR DENE',

  pause: 'DURAKLATILDI', pResume: 'P — DEVAM', pResumeT: 'DEVAM İÇİN DOKUN',
  pSound: 'M — SES: %1', pSettings: 'O — AYARLAR', onWord: 'AÇIK', offWord: 'KAPALI',

  setTitle: 'AYARLAR', setLang: 'DİL / LANGUAGE', setSound: 'SES', setMusic: 'MÜZİK',
  setVolume: 'SES SEVİYESİ', setControls: 'KONTROLLER', setQuality: 'ÇÖZÜNÜRLÜK',
  setShake: 'KAMERA SARSINTISI', setCrt: 'CRT ETKİSİ', setDiff: 'ZORLUK',
  setReset: 'İLERLEMEYİ SIFIRLA', setBack: 'GERİ',
  setKeys: '↑↓ SEÇ • ←→ DEĞİŞTİR • ESC — GERİ', setKeysT: 'DEĞİŞTİRMEK İÇİN SATIRA DOKUN',
  setReload: 'YENİDEN BAŞLATINCA GEÇERLİ', setDone: 'İLERLEME SIFIRLANDI',
  ctrlAuto: 'OTOMATİK', ctrlKeys: 'KLAVYE', ctrlTouch: 'DOKUNMATİK',
  diffEasy: 'KOLAY', diffNormal: 'NORMAL', diffHard: 'ZOR',

  hqBtn: 'KARARGAH', hqNew: 'TAYIN!', hqTitle: 'FİLO KARARGAHI',
  hqStreak: 'ÜST ÜSTE %1. GÜN • REKOR %2', hqBonus: 'MAAŞ ZAMMI +%1%', hqDayN: 'G%1',
  hqClaim: 'TAYINI AL', hqClaim2: 'REKLAMLA ×2',
  hqClaimed: 'TAYIN ALINDI • SONRAKİ %1 SONRA',
  hqClaimed2: 'ÇİFT TAYIN • SONRAKİ %1 SONRA', hqTomorrow: 'YARIN: %1',
  hqLeft: '%1 SA %2 DK', hqLeftM: '%1 DK', hqTasks: 'GÜNÜN EMİRLERİ',
  hqAll: 'ÜÇ EMİR DE: +%1 KR VE BEDAVA ÇEVİRME',
  hqAllOk: 'ÜÇÜ DE TAMAM — +%1 İKRAMİYE',
  hqRank: 'RÜTBE', hqNext: 'SONRAKİ RÜTBEYE %1', hqTop: 'EN ÜST RÜTBE',
  hqStart: 'BAŞLANGIÇ İKRAMİYESİ: +%1 KR', hqTotal: 'HİZMET GÜNÜ: %1', hqSupply: 'DEPODA: %1',
  hqBack: 'GERİ', hqBackK: 'ESC — GERİ', hqFight: 'DENİZE AÇIL', hqResume: 'DEVAM',
  crShort: 'KR', rktShort: 'RKT', drGold: 'ALTIN', drSpin: 'BEDAVA ÇEVİRME',
  giftLine: 'KARARGAH VERDİ: %1', giftCr: '%1 KREDİ', giftAmmo: '%1 ROKET',
  tomorrowTip: 'YARIN KARARGAHTA — GÜN %1: %2',
  lbPlace: 'FİLO SIRALAMASI: #%1', lbBest: 'KİŞİSEL REKOR: %1',
  dqDone: 'EMİR TAMAM: %1', dqPay: 'KARARGAHTAN +%1 KREDİ',
  dqAll: 'TÜM EMİRLER! +%1 VE BEDAVA ÇEVİRME',
  dq_ships: 'GEMİ BATIR', dq_planes: 'UÇAK DÜŞÜR', dq_bases: 'ÜS YOK ET',
  dq_bunkers: 'SIĞINAK YIK', dq_mines: 'MAYIN TEMİZLE', dq_hostage: 'REHİNE KURTAR',
  dq_score: 'PUAN TOPLA', dq_level: 'GÖREVE ULAŞ', dq_boss: 'AMİRAL GEMİSİ BATIR',
  dq_streak: 'SERİ:',
  rankUp: 'TERFİ: %1',
  rk1: 'ER', rk2: 'ASTSUBAY', rk3: 'BAŞÇAVUŞ', rk4: 'TEĞMEN',
  rk5: 'YÜZBAŞI', rk6: 'BİNBAŞI', rk7: 'YARBAY', rk8: 'ALBAY',
  rk9: 'TUĞAMİRAL', rk10: 'ORAMİRAL',
  rotate: 'CİHAZI YATAY ÇEVİR', loading: 'YÜKLENİYOR…',
  tutTitle: 'EĞİTİM %1/%2',
  reviveFree: 'İKİNCİ ŞANS',
  mercyMsg: 'KARARGAH YARDIMI: DÜŞMAN ZAYIF, ZIRH +%1%',
  ev_drop: 'İKMAL ATIŞI',
  ev_ace: 'DÜŞMAN ASI',
  ev_pilot: 'DÜŞEN PİLOT',
  ev_cargo: 'MAVNA KONVOYU',
  ev_raid: 'HAVA SALDIRISI',
  ev_loot: 'SUDAKİ KARGO',
  evDropMsg: 'UÇAĞIMIZ BİR SANDIK ATTI — DÜŞMANDAN ÖNCE AL',
  evAceMsg: 'BİR DÜŞMAN ASI SENİ AVLIYOR — ÖDÜL x3',
  evPilotMsg: 'PİLOTUMUZ SUDA — YAVAŞÇA AL',
  evCargoMsg: 'DÜŞMAN MAVNALARI KARGO TAŞIYOR — HEPSİNİ BATIR',
  evRaidMsg: 'HAVA SALDIRISI! TÜM FİLOYU DÜŞÜR',
  evLootMsg: 'SUDA KARGO YÜZÜYOR — HEPSİNİ TOPLA',
  evOk: 'TAMAMLANDI',
  evFail: 'GEÇ KALDIN',
  evLost: 'DÜŞMAN SANDIĞI KAPTI',
  evCargoEsc: 'BATAN MAVNA: %1 / %2',
  evAceTag: 'AS',
  bfTriple: 'ÜÇLÜ',
  bfRapid: 'SERİ',
  bfShield: 'KALKAN',
  bfNitro: 'NİTRO',
  bfGot: '%1: %2 SN',
  mHeliEvac: 'HELİKOPTER REHİNELERİ ALDI: %1',
  btnPlay: 'OYNA',
  btnContinue: 'DEVAM • GÖREV %1',
  btnResume: 'DEVAM',
  btnMenu: 'ANA MENÜ',
  btnNext: 'GÖREV',
  howTitle: 'NASIL OYNANIR',
  hudDist: '%1 M',
  tut1: 'WASD TUŞLARIYLA İLERLE',
  tut1T: 'SOL BAŞPARMAKLA YÖNET',
  tut2: 'FAREYLE NİŞAN AL, SOL TIK — ATEŞ',
  tut2T: 'TOP KENDİ ATEŞ EDER — DÜŞMANA GİT',
  tut3: 'HEDEFİN EKRANIN ÜSTÜNDE. BİR DÜŞMAN BATIR',
  tut4: 'UÇAK GEMİSİ TAMİR EDER, CEPHANELİK ORADA',
  tut4T: 'UÇAK GEMİSİ TAMİR EDER, CEPHANELİK ORADA',
  tut5: 'YETENEKLER: F — DUMAN, SHIFT — TURBO',
  tut5T: 'SAĞ TUŞLAR: TURBO VE DUMAN',
  tutDone: 'TAMAM! BOL ŞANS, KOMUTAN!',
  setResetSure: 'ONAYLAMAK İÇİN TEKRAR BAS',
  tutClick: 'OYUNA TIKLA, SONRA WASD',
  rationGot: 'GÜNLÜK ERZAK ALINDI: %1',
};

/* ===== src/core/lang-pl.js ===== */
;
'use strict';
/* lang-pl.js — polski. Строк нет — берётся английская. */
TR.pl = {
  hull: 'KADŁUB', boost: 'DOPALACZ', knots: 'W %1', repairing: 'NAPRAWA', pdShort: 'CIWS',
  alert: 'ALARM', radar: 'RADAR', radarOpen: 'RADAR • SIEĆ PADŁA',
  lvlBases: 'POZ.%1 • BAZY %2/%3', rescuedN: 'URATOWANI %1', missilesN: 'RAKIETY:%1',
  boostHint: 'SHIFT — DOPALACZ', scoreLbl: 'WYNIK', creditsLbl: 'KREDYTY', streakN: 'SERIA %1',
  arsenalHint: 'E — ARSENAŁ', arsenalTap: 'ARSENAŁ', critical: 'KRYTYCZNE USZKODZENIA',

  gameTitle: 'ARCHIPELAG', operation: '— O P E R A C J A —', carrier: '"PÓŁNOC"',
  bossName: 'PANCERNIK "LEWIATAN"', bossName2: 'LOTNISKOWIEC "BURZA"',
  bossName3: 'MONITOR "TWIERDZA"', transport: 'TRANSPORTOWIEC "ŁADOGA"',
  lvl1: 'PERYMETR', lvl2: 'CIEŚNINA SZTORMÓW', lvl3: 'CZERWONE RAFY',
  lvl4: 'CZARNE MIELIZNY', lvl5: 'SERCE ARCHIPELAGU',

  isl_fang: 'KIEŁ', isl_thund: 'GRZMOT', isl_raid: 'RAJD', isl_serp: 'WĄŻ',
  isl_storm: 'SZTORM', isl_ash: 'POPIOŁY', isl_crab: 'KRAB', isl_gloom: 'MROK',
  isl_needle: 'IGŁA', isl_wolf: 'WILK', isl_fort: 'FORT', isl_breeze: 'BRYZA',
  isl_shark: 'REKIN', isl_cape: 'PRZYLĄDEK', isl_reef: 'RAFA', isl_anchor: 'KOTWICA',

  mObjective: 'ZADANIE: ZNISZCZ BAZY WROGA — %1',
  mCarryHome: 'ZAWIEŹ ZAKŁADNIKÓW NA LOTNISKOWIEC %1',
  mArsenal: 'E — ARSENAŁ PRZY LOTNISKOWCU',
  mArsenalT: 'ARSENAŁ OTWIERA SIĘ PRZY LOTNISKOWCU',
  mMines: 'UWAGA: POLA MINOWE WOKÓŁ WYSP',
  mAllTargets: 'WSZYSTKIE CELE ZNISZCZONE! WYCOFAJ SIĘ!',
  mBaseDown: 'BAZA ZNISZCZONA: WYSPA %1', mAllBases: 'WSZYSTKIE BAZY ZNISZCZONE!',
  mBasesLeft: 'ALARM PODNIESIONY — BAZY: %1',
  mRadarDown: 'RADAR WROGA ZNISZCZONY — MAPA ODKRYTA',
  mDistress: 'SOS: WYSPA %1 — %2 OSÓB',
  mSlowDown: 'ZWOLNIJ PRZY ZAKŁADNIKACH',
  mTakeThem: 'ZAWIEŹ ZAKŁADNIKÓW NA %1',
  mEvacuated: 'EWAKUOWANI: %1 — ZAŁOGA DZIĘKUJE',
  mNoLauncher: 'BRAK WYRZUTNI — KUP W ARSENALE',
  mNoAmmo: 'BRAK RAKIET — UZUPEŁNIJ', mBossComing: '%1 IDZIE NA PRZECHWYCENIE',
  mBossSalvo: 'SALWA LEWIATANA!', mBossLaunch: 'GRUPA LOTNICZA STARTUJE',
  mBossDown: '%1 ZATOPIONY!', mAirTarget: 'KONTAKT POWIETRZNY: BOMBOWIEC',
  mSoundOn: 'DŹWIĘK WŁĄCZONY', mSoundOff: 'DŹWIĘK WYŁĄCZONY', mAlarm: 'ALARM',
  fRepair: '+NAPRAWA', fRockets: '+%1 RAKIET', fCredits: '+%1 kr',

  mTypeAssault: 'SZTURM', mTypeNight: 'OPERACJA NOCNA', mTypeEscort: 'DESANT',
  mTypeBoss: 'PRZECHWYCENIE', mTypeConvoy: 'KONWÓJ',
  objConvoy: 'ZADANIE: ESKORTUJ %1 NA WYSPĘ %2',
  objConvoy2: 'JEŚLI TRANSPORTOWIEC ZATONIE, ZADANIE PRZEPADA',
  hudConvoy: 'POZ.%1 • KONWÓJ %2%', mConvoyHit: 'TRANSPORTOWIEC POD OSTRZAŁEM!',
  mConvoyLost: 'TRANSPORTOWIEC ZATONĄŁ', mConvoyDone: 'TRANSPORTOWIEC DOTARŁ',
  mSubs: 'SONAR: OKRĘTY PODWODNE W REJONIE', mSubNear: 'SZUM ŚRUB POD WODĄ',
  mSubSurface: 'OKRĘT WYNURZONY — OGNIA!',
  mNoDC: 'POTRZEBNE BOMBY GŁĘBINOWE — ARSENAŁ',
  hudSmoke: 'DYM', hudDC: 'BOMBY',
  mSmokeHint: 'F — ZASŁONA DYMNA, TNIE SNOPY I CELOWANIE',
  itDC: 'BOMBY GŁĘBINOWE', itDCD: 'Zrzuć za rufę klawiszem Q. Sięga okrętów podwodnych',

  objAssault: 'ZADANIE: ZNISZCZ BAZY WROGA — %1',
  objNight: 'ZADANIE: PO CICHU ZABIERZ %1 JEŃCÓW',
  objNight2: 'TRZYMAJ SIĘ POZA SNOPAMI LATARNI',
  objEscort: 'ZADANIE: ZABIERZ PIECHOTĘ Z WYSPY %1',
  objEscort2: 'WYSADŹ ICH NA WYSPIE %1 I OCZYŚĆ JĄ',
  hudNight: 'POZ.%1 • JEŃCY %2/%3', hudEscort: 'POZ.%1 • ODDZIAŁ %2/%3 • CEL %4/%5',
  hudStealth: 'SKRYTOŚĆ', hudBlown: 'WYKRYTY',
  mMarinesUp: 'PIECHOTA NA POKŁADZIE: %1', mAllyAboard: 'SOJUSZNIK NA POKŁADZIE: %1 STRZELEC',
  mAllyLost: 'STRZELEC WYPADŁ ZA BURTĘ',
  mFriendly: 'PRZYJAZNE POMOSTY: NAPRAWA I STRZELCY',
  mMarinesGo: 'DESANT! UCISZ GNIAZDA OGNIOWE',
  mMarinesDead: 'ODDZIAŁ POLEGŁ — DOKOŃCZ SAM',
  mTargetDone: 'WYSPA OCZYSZCZONA', mSpotted: 'WYKRYTO CIĘ! REJON W ALARMIE',
  mBeamWarn: 'SNOP NA TOBIE — WRACAJ W CIEMNOŚĆ',
  mTornado: 'OSTRZEŻENIE: TRĄBY WODNE', mTornadoNear: 'TRĄBA BLISKO!',
  stStealth: 'NIEWYKRYTY', yesWord: 'TAK', noWord: 'NIE',

  shopTitle: 'ARSENAŁ LOTNISKOWCA %1', shopCredits: 'KREDYTY: %1', shopMax: 'MAX',
  shopCost: '%1 kr', shopPick: 'WYBIERZ ULEPSZENIE',
  shopKeys: '↑↓ WYBÓR • ENTER / LPM — KUP • E — WYJŚCIE',
  shopTouch: 'DOTKNIJ DWA RAZY, BY KUPIĆ • ZAMKNIJ ✕', shopNoNeed: 'TERAZ NIEPOTRZEBNE',
  shopMaxed: 'MAKSYMALNY POZIOM', shopPoor: 'ZA MAŁO KREDYTÓW', shopBought: 'KUPIONO: %1',
  itRepair: 'NAPRAWA KADŁUBA', itRepairD: 'Przywraca +40 punktów kadłuba',
  itArmor: 'PANCERZ', itArmorD: '+25 do maksimum kadłuba',
  itGun: 'DZIAŁO GŁÓWNE', itGunD: '+4 obrażeń na pocisk',
  itRate: 'AUTOMAT ŁADUJĄCY', itRateD: '+12% szybkostrzelności działa',
  itEngine: 'SILNIK', itEngineD: '+12% prędkości i zwrotności',
  itBoost: 'DOPALACZ', itBoostD: 'Większy zapas, szybsze ładowanie',
  itMissile: 'RAKIETY "HARPUN"', itMissileD: 'Rakiety naprowadzane. PPM (+6)',
  itAmmo: 'RAKIETY +6', itAmmoD: 'Uzupełnia rakiety Harpun',
  itBoat: 'SZALUPA', itBoatD: '+2 miejsca dla zakładników',
  itPd: 'CIWS "OSA"', itPdD: 'Zestrzeliwuje pociski i rakiety',
  itRadar: 'RADAR', itRadarD: '+330 zasięgu wykrywania',

  adWatching: 'REKLAMA…', adDemo: 'REKLAMA TESTOWA (POZA CRAZYGAMES)',
  adFailed: 'REKLAMA SIĘ NIE WCZYTAŁA', adNoFill: 'BRAK REKLAMY — NAGRODA PRZYZNANA',
  adWait: 'DOSTĘPNE ZA %1 S',
  revive: 'WSKRZESZENIE ZA REKLAMĘ', reviveT: 'DOTKNIJ — WSKRZESZENIE ZA REKLAMĘ',
  reviveDone: 'OKRĘT ODBUDOWANY', reviveNone: 'WSKRZESZENIE JUŻ WYKORZYSTANE',
  itAdAmmo: '+8 RAKIET ZA REKLAMĘ', itAdAmmoD: 'Krótka reklama i magazyn pełny',
  itCrate: 'SKRZYNIA SZCZĘŚCIA', itCrateD: 'Zakręć bębnem: kredyty, rakiety, rzadka nagroda',
  adFree: 'ZA DARMO',
  itHull: 'ADMIRALSKI KADŁUB', itHullD: 'Na zawsze: +40 kadłuba, +10% prędkości, piąty strzelec',
  itHarp: 'ZŁOTY HARPUN', itHarpD: 'Na zawsze: +35% obrażeń, nigdy mniej niż cztery',
  ownedWord: 'POSIADANE', buyFail: 'ZAKUP NIE DOSZEDŁ DO SKUTKU', buyOk: 'ODBLOKOWANO: %1',

  crateTitle: 'SKRZYNIA SZCZĘŚCIA', crateSpin: 'ZAKRĘĆ', crateAd: 'JESZCZE RAZ ZA REKLAMĘ',
  crateWaitN: 'ZA DARMO ZA %1', crateAdWait: 'REKLAMA ZA %1', crateClose: 'E / ESC — ZAMKNIJ',
  crateCloseT: 'ZAMKNIJ ✕', crateWon: 'WYGRAŁEŚ: %1', crateJack: 'GŁÓWNA NAGRODA!',
  przCredits: '%1 KREDYTÓW', przAmmo: '%1 RAKIET', przRepair: 'NAPRAWA I DOPALACZ',
  przDC: 'BOMBY GŁĘBINOWE', przJack: 'PRZEDMIOT PREMIUM', przNothing: 'PUSTO',

  tagNone: 'PUSTO', tagFix: 'NAPR',
  adLoading: 'ŁADOWANIE REKLAMY…', retryBtn: 'PONÓW MISJĘ',
  subtitle: 'NIEKOŃCZĄCA SIĘ KAMPANIA MORSKA', orders: 'ROZKAZY:',
  ord1: '> NISZCZ BAZY, BUNKRY I MASZTY RADAROWE',
  ord2: '> TOP OKRĘTY, ZESTRZELIWUJ SAMOLOTY',
  ord3: '> RATUJ ZAKŁADNIKÓW I WOŹ ICH NA %1',
  ord4: '> OTWIERAJ SKRZYNIE ZAOPATRZENIA NA WYSPACH',
  ord5: '> SZYBKIE SERIE ZWIĘKSZAJĄ WYPŁATĘ',
  ord6: '> CO PIĄTA MISJA TO OKRĘT FLAGOWY WROGA',
  ord7: '> UWAŻAJ NA MINY I NOCNE MIELIZNY',
  keysLine1: 'WASD — STER • SHIFT — DOPALACZ • LPM — OGIEŃ • PPM — RAKIETY • F — DYM • Q — BOMBY',
  keysLine2: 'E — ARSENAŁ • O — USTAWIENIA • H — SZTAB • M — DŹWIĘK • P — PAUZA',
  touchLine1: 'LEWA POŁOWA — STER • PRAWA — CELOWANIE I OGIEŃ',
  touchLine2: 'PRZYCISKI PO PRAWEJ: DOPALACZ, RAKIETA, DYM, BOMBY, ARSENAŁ',
  pressStart: '► NACIŚNIJ SPACJĘ LUB KLIKNIJ ◄', tapStart: '► DOTKNIJ EKRANU ◄',
  contStart: '► SPACJA — WRÓĆ DO OPERACJI, MISJA %1 ◄',
  contStartT: '► DOTKNIJ — WRÓĆ, MISJA %1 ◄',
  settingsHint: 'O — USTAWIENIA', settingsBtn: 'USTAWIENIA',

  lvlDone: 'MISJA %1 WYKONANA', stBases: 'ZNISZCZONE BAZY', stBunkers: 'BUNKRY I RADARY',
  stShipsAir: 'OKRĘTY / SAMOLOTY', stHostages: 'URATOWANI ZAKŁADNICY', stStreak: 'NAJLEPSZA SERIA',
  stTime: 'CZAS', stBonus: 'PREMIA ZA MISJĘ', stLevel: 'MISJA', stScore: 'WYNIK',
  stBaseBunk: 'BAZY / BUNKRY', stMines: 'ROZBROJONE MINY',
  creditsLeft: 'KREDYTY: %1 — ZAJRZYJ DO ARSENAŁU',
  nextLevel: 'SPACJA — MISJA %1: %2', nextLevelT: 'DOTKNIJ — MISJA %1',
  winTitle1: 'SEKTOR', winTitle2: 'OCZYSZCZONY',
  sectorSub: '%1 ZATOPIONY — DROGA OTWARTA',
  bestRun: 'REKORD: MISJA %1 • %2 PUNKTÓW', restartHint: 'R — OD NOWA',
  loseTitle1: 'TWÓJ OKRĘT', loseTitle2: 'ZATONĄŁ',
  againWin: 'SPACJA — MISJA %1 • R — OD NOWA',
  againLose: 'SPACJA — PONÓW MISJĘ • R — OD ZERA',
  againWinT: 'DOTKNIJ — MISJA %1', againLoseT: 'DOTKNIJ — PONÓW MISJĘ',

  pause: 'PAUZA', pResume: 'P — WZNÓW', pResumeT: 'DOTKNIJ, BY WZNOWIĆ',
  pSound: 'M — DŹWIĘK: %1', pSettings: 'O — USTAWIENIA', onWord: 'WŁ', offWord: 'WYŁ',

  setTitle: 'USTAWIENIA', setLang: 'JĘZYK / LANGUAGE', setSound: 'DŹWIĘK', setMusic: 'MUZYKA',
  setVolume: 'GŁOŚNOŚĆ', setControls: 'STEROWANIE', setQuality: 'ROZDZIELCZOŚĆ',
  setShake: 'WSTRZĄSY KAMERY', setCrt: 'EFEKT CRT', setDiff: 'POZIOM TRUDNOŚCI',
  setReset: 'WYZERUJ POSTĘPY', setBack: 'WSTECZ',
  setKeys: '↑↓ WYBÓR • ←→ ZMIANA • ESC — WSTECZ', setKeysT: 'DOTKNIJ WIERSZ, BY ZMIENIĆ',
  setReload: 'DZIAŁA PO RESTARCIE', setDone: 'POSTĘPY WYZEROWANE',
  ctrlAuto: 'AUTO', ctrlKeys: 'KLAWIATURA', ctrlTouch: 'DOTYK',
  diffEasy: 'ŁATWY', diffNormal: 'NORMALNY', diffHard: 'TRUDNY',

  hqBtn: 'SZTAB', hqNew: 'RACJA!', hqTitle: 'SZTAB FLOTY',
  hqStreak: 'DZIEŃ %1 Z RZĘDU • REKORD %2', hqBonus: 'DODATEK DO ŻOŁDU +%1%', hqDayN: 'D%1',
  hqClaim: 'ODBIERZ RACJĘ', hqClaim2: '×2 ZA REKLAMĘ',
  hqClaimed: 'RACJA ODEBRANA • NASTĘPNA ZA %1',
  hqClaimed2: 'PODWÓJNA RACJA • NASTĘPNA ZA %1', hqTomorrow: 'JUTRO: %1',
  hqLeft: '%1 G %2 MIN', hqLeftM: '%1 MIN', hqTasks: 'ROZKAZY DNIA',
  hqAll: 'WSZYSTKIE TRZY ROZKAZY: +%1 KR I DARMOWE LOSOWANIE',
  hqAllOk: 'WSZYSTKIE TRZY — PREMIA +%1',
  hqRank: 'STOPIEŃ', hqNext: 'NASTĘPNY STOPIEŃ ZA %1', hqTop: 'NAJWYŻSZY STOPIEŃ',
  hqStart: 'PREMIA NA START: +%1 KR', hqTotal: 'DNI SŁUŻBY: %1', hqSupply: 'W MAGAZYNIE: %1',
  hqBack: 'WSTECZ', hqBackK: 'ESC — WSTECZ', hqFight: 'WYPŁYWAJ', hqResume: 'WZNÓW',
  crShort: 'KR', rktShort: 'RAK', drGold: 'ZŁOTO', drSpin: 'DARMOWE LOSOWANIE',
  giftLine: 'SZTAB WYDAŁ: %1', giftCr: '%1 KREDYTÓW', giftAmmo: '%1 RAKIET',
  tomorrowTip: 'JUTRO W SZTABIE — DZIEŃ %1: %2',
  lbPlace: 'RANKING FLOTY: #%1', lbBest: 'REKORD OSOBISTY: %1',
  dqDone: 'ROZKAZ WYKONANY: %1', dqPay: '+%1 KREDYTÓW ZE SZTABU',
  dqAll: 'WSZYSTKIE ROZKAZY! +%1 I DARMOWE LOSOWANIE',
  dq_ships: 'ZATOP OKRĘTY', dq_planes: 'ZESTRZEL SAMOLOTY', dq_bases: 'ZNISZCZ BAZY',
  dq_bunkers: 'ZRÓWNAJ BUNKRY', dq_mines: 'ROZBRÓJ MINY', dq_hostage: 'URATUJ ZAKŁADNIKÓW',
  dq_score: 'ZDOBĄDŹ PUNKTY', dq_level: 'DOTRZYJ DO MISJI', dq_boss: 'ZATOP OKRĘTY FLAGOWE',
  dq_streak: 'SERIA',
  rankUp: 'AWANS: %1',
  rk1: 'MARYNARZ', rk2: 'BOSMANMAT', rk3: 'CHORĄŻY', rk4: 'PORUCZNIK',
  rk5: 'KAPITAN', rk6: 'KOMANDOR PODPOR.', rk7: 'KOMANDOR POR.', rk8: 'KOMANDOR',
  rk9: 'KONTRADMIRAŁ', rk10: 'ADMIRAŁ FLOTY',
  rotate: 'OBRÓĆ URZĄDZENIE POZIOMO', loading: 'ŁADOWANIE…',
  tutTitle: 'SAMOUCZEK %1/%2',
  reviveFree: 'DRUGA SZANSA',
  mercyMsg: 'POMOC SZTABU: SŁABSZY WRÓG, PANCERZ +%1%',
  ev_drop: 'ZRZUT ZAOPATRZENIA',
  ev_ace: 'WROGI AS',
  ev_pilot: 'ZESTRZELONY PILOT',
  ev_cargo: 'KONWÓJ BAREK',
  ev_raid: 'NALOT',
  ev_loot: 'ŁADUNEK W WODZIE',
  evDropMsg: 'NASZ SAMOLOT ZRZUCIŁ SKRZYNIĘ — ZABIERZ JĄ PRZED WROGIEM',
  evAceMsg: 'WROGI AS NA CIEBIE POLUJE — NAGRODA x3',
  evPilotMsg: 'NASZ PILOT JEST W WODZIE — PODJEDŹ POWOLI',
  evCargoMsg: 'WROGIE BARKI Z ŁADUNKIEM — ZATOP WSZYSTKIE',
  evRaidMsg: 'NALOT! ZESTRZEL CAŁĄ ESKADRĘ',
  evLootMsg: 'W WODZIE PŁYWA ŁADUNEK — ZBIERZ WSZYSTKO',
  evOk: 'WYKONANE',
  evFail: 'ZA PÓŹNO',
  evLost: 'WRÓG PRZEJĄŁ SKRZYNIĘ',
  evCargoEsc: 'ZATOPIONE BARKI: %1 Z %2',
  evAceTag: 'AS',
  bfTriple: 'POTRÓJNY',
  bfRapid: 'SERIA',
  bfShield: 'TARCZA',
  bfNitro: 'NITRO',
  bfGot: '%1 NA %2 S',
  mHeliEvac: 'ŚMIGŁOWIEC ZABRAŁ ZAKŁADNIKÓW: %1',
  btnPlay: 'GRAJ',
  btnContinue: 'KONTYNUUJ • MISJA %1',
  btnResume: 'WZNÓW',
  btnMenu: 'MENU GŁÓWNE',
  btnNext: 'MISJA',
  howTitle: 'JAK GRAĆ',
  hudDist: '%1 M',
  tut1: 'PŁYŃ KLAWISZAMI WASD',
  tut1T: 'STERUJ LEWYM KCIUKIEM',
  tut2: 'CELUJ MYSZĄ, LEWY PRZYCISK — OGIEŃ',
  tut2T: 'DZIAŁO STRZELA SAMO — PŁYŃ DO WROGA',
  tut3: 'TWÓJ CEL JEST NA GÓRZE. ZATOP WROGA',
  tut4: 'LOTNISKOWIEC NAPRAWIA I MA ARSENAŁ',
  tut4T: 'LOTNISKOWIEC NAPRAWIA I MA ARSENAŁ',
  tut5: 'UMIEJĘTNOŚCI: F — DYM, SHIFT — TURBO',
  tut5T: 'PRZYCISKI PO PRAWEJ: TURBO I DYM',
  tutDone: 'GOTOWE! POWODZENIA, DOWÓDCO!',
  setResetSure: 'NACIŚNIJ PONOWNIE, BY POTWIERDZIĆ',
  tutClick: 'KLIKNIJ W GRĘ, POTEM WASD',
  rationGot: 'DZIENNY PRZYDZIAŁ ODEBRANY: %1',
};

/* ===== src/core/utils.js ===== */
;
'use strict';
/* ============================================================
   utils.js — математика, случайности, шум, форматирование
   ============================================================ */

const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const rr    = (a, b) => a + Math.random() * (b - a);
const ri    = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance= p => Math.random() < p;
const pick  = a => a[(Math.random() * a.length) | 0];

const dist  = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
const near  = (x1, y1, x2, y2, r) => dist2(x1, y1, x2, y2) < r * r;

/* дешёвый детерминированный хеш 0..1 */
const h1 = n => { n = Math.sin(n) * 43758.5453; return n - Math.floor(n); };
const h2 = (x, y) => h1(x * 127.1 + y * 311.7);

/* значение-шум с билинейной интерполяцией */
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
/* фрактальный шум: 3 октавы */
function fbm(x, y) {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.13, y * 2.13) * 0.3 + vnoise(x * 4.7, y * 4.7) * 0.15;
}

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function approach(cur, tgt, rate, dt) { return cur + (tgt - cur) * Math.min(1, rate * dt); }

function fmtT(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + String(ss).padStart(2, '0'); }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ease = {
  out : t => 1 - (1 - t) * (1 - t),
  out3: t => 1 - Math.pow(1 - t, 3),
  in  : t => t * t,
  io  : t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  pop : t => Math.sin(Math.min(1, t) * Math.PI)
};

/* rgba-строка из компонентов (без мусора в GC-хот-пути хватает) */
const rgba = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';

/* осветлить/затемнить #rrggbb: k<1 темнее, k>1 светлее */
function shade(hex, k) {
  const v = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((v >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((v >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((v & 255) * k), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
/* смешать два цвета #rrggbb */
function mix(h1c, h2c, t) {
  const a = parseInt(h1c.slice(1), 16), b = parseInt(h2c.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const c = Math.round(lerp(a & 255, b & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | c).toString(16).slice(1);
}

/* ===== src/core/config.js ===== */
;
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

/* ===== src/core/state.js ===== */
;
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

/* ===== src/core/audio.js ===== */
;
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

/* ===== src/core/cgsdk.js ===== */
;
'use strict';
/* ============================================================
   cgsdk.js — CrazyGames: реклама, пауза, сохранения.

   Это замена яндексового ysdk.js в сборке для CrazyGames. Имена
   функций снаружи те же (adFullscreen, adRewarded, cloudSave,
   sdkGameplay, audioGate…), поэтому остальной код игры общий для
   обеих сборок.

   Что даёт площадка (SDK v3):
   • sdk.ad.requestAd('midgame' | 'rewarded', колбэки) — реклама;
   • sdk.game.gameplayStart/Stop — разметка боя и меню;
   • sdk.game.loadingStart/Stop — загрузка;
   • sdk.game.happytime() — «игроку сейчас хорошо»;
   • sdk.data — хранилище прогресса: у вошедшего игрока оно
     переезжает между устройствами, у гостя работает локально.

   Чего у площадки нет: внутриигровых покупок и таблиц рекордов.
   Поэтому донат выключен (PAYMENTS_ON = false), а место в общем
   зачёте в штабе не показывается — только личный рекорд.

   Вне площадки (локальный файл) SDK нет: «ролик» крутится 1.2
   секунды и награда выдаётся, игра не должна ломаться.
   ============================================================ */

const CG = {
  sdk: null, ok: false, env: 'disabled',
  startT: 0,
  busy: false,                     /* пока идёт ролик, игра стоит   */
  paused: false,                   /* пауза по требованию площадки  */
  away: false                      /* окно потеряло фокус           */
};
/* остальной код игры написан под имя YA — держим его же */
const YA = CG;

const nowS = () => performance.now() / 1000;

/* Единственное место, где трогается общая громкость: звук молчит,
   пока идёт реклама, пока площадка держит паузу и пока окно не в фокусе. */
function audioGate() {
  if (typeof master === 'undefined' || !master) return;
  master.gain.value = (CG.busy || CG.paused || CG.away || muted) ? 0 : SETTINGS.volume;
}

/* демо-ролик для игры вне площадки */
let adMockT = 0, adMockCb = null, adNoteT = 0, adNote = '';

/* ---------- постоянные вещи ---------- */
/* У CrazyGames нет внутриигровых покупок, поэтому донат выключен:
   строки в арсенале скрыты, главные призы барабана и седьмого дня
   выдаются кредитами. Список оставлен на случай другой площадки. */
const PAYMENTS_ON = false;

const PRODUCTS = {
  hull_admiral: { perk: 'hull', name: 'itHull', desc: 'itHullD', fallback: '—' },
  harpoon_gold: { perk: 'harp', name: 'itHarp', desc: 'itHarpD', fallback: '—' }
};

function hasPerk(k) { return PAYMENTS_ON && !!(SETTINGS.perks && SETTINGS.perks[k]); }
/* вещи, которые ещё можно выдать призом; без доната — ни одной */
const perksLeft = () => (PAYMENTS_ON ? Object.values(PRODUCTS).filter(p => !hasPerk(p.perk)) : []);
function grantPerk(k, quiet) {
  if (!PAYMENTS_ON) return false;
  if (!SETTINGS.perks) SETTINGS.perks = {};
  if (SETTINGS.perks[k]) return false;
  SETTINGS.perks[k] = true;
  saveSettings();
  if (player) player.maxhp = maxhpVal();
  if (!quiet) {
    const p = Object.values(PRODUCTS).find(x => x.perk === k);
    msg(T('buyOk', p ? T(p.name) : k), '#ffd94a', 4);
    SFX.evac();
  }
  return true;
}
function productPrice(id) { return PRODUCTS[id] ? PRODUCTS[id].fallback : ''; }
function buyProduct() { adToast(T('buyFail')); }      /* покупок на площадке нет */

/* ---------- инициализация ---------- */
function sdkInit() {
  CG.startT = nowS();
  const root = (typeof window !== 'undefined') && window.CrazyGames && window.CrazyGames.SDK;
  if (!root) return;                                   /* играем без площадки */
  try {
    /* Вся графика и звук у игры генерируются кодом и готовы к этому
       моменту, поэтому загрузка начинается и заканчивается сразу. */
    root.init().then(() => {
      CG.sdk = root;
      CG.ok = true;
      try { CG.env = root.environment || 'crazygames'; } catch (e) {}
      try { root.game.loadingStart(); root.game.loadingStop(); } catch (e) {}
      cloudInit();
      adProbe();                     /* Basic Launch и блокировщик — до первой кнопки */
    }).catch(() => { CG.ok = false; });
  } catch (e) { CG.ok = false; }
}
/* старое имя — чтобы обе сборки запускались одинаково */
const ysdkInit = sdkInit;

/* ------------------------------------------------------------
   Пауза. На CrazyGames отдельных событий паузы нет: её задают
   колбэки рекламы (adStarted/adFinished) и наши же обработчики
   потери фокуса. Логика та же — звук глушим, бой останавливаем.
   ------------------------------------------------------------ */
let sdkAutoPaused = false;

function sdkPause(on) {
  if (CG.paused === on) return;
  CG.paused = on;
  audioGate();
  if (on) {
    if (state === 'play') { setState('pause'); sdkAutoPaused = true; }
  } else if (sdkAutoPaused) {
    sdkAutoPaused = false;
    if (state === 'pause') setState('play');
  }
}

/* ------------------------------------------------------------
   Разметка боя и меню. Площадка режет эти вызовы до одного в
   секунду и ругается в консоль, а игра дёргает их на каждой смене
   экрана (пауза, арсенал, штаб). Поэтому запоминаем, чего хотим,
   и отправляем не чаще раза в секунду и только при смене.
   ------------------------------------------------------------ */
let gpWant = null, gpSent = null, gpLast = -1e9, gpTimer = 0;

function sdkGameplay(on) { gpWant = !!on; gpFlush(); }
const ysdkGameplay = sdkGameplay;

function gpFlush() {
  if (!CG.ok || gpWant === null || gpWant === gpSent) return;
  const t = nowS(), wait = 1.05 - (t - gpLast);
  if (wait > 0) {
    /* Рано. Повторим сами: игровой цикл в фоновой вкладке засыпает,
       и дожидаться его нельзя — площадка не увидит начала боя. */
    if (!gpTimer) gpTimer = setTimeout(() => { gpTimer = 0; gpFlush(); }, Math.ceil(wait * 1000) + 30);
    return;
  }
  gpSent = gpWant; gpLast = t;
  try {
    if (gpSent) CG.sdk.game.gameplayStart();
    else CG.sdk.game.gameplayStop();
  } catch (e) {}
}

/* «игроку сейчас хорошо» — зачищенный сектор, потопленный флагман */
function sdkHappy() {
  if (!CG.ok) return;
  try { CG.sdk.game.happytime(); } catch (e) {}
}

/* ------------------------------------------------------------
   Сохранения. sdk.data — то же localStorage по виду, но у вошедшего
   в аккаунт игрока данные переезжают между устройствами. Ведущей
   остаётся локальная копия, облако её догоняет и подтягивает то,
   что больше.
   ------------------------------------------------------------ */
const CLOUD = { on: false, loaded: false, t: 0, dirty: false };
const CLOUD_KEY = 'arhipelag.progress';

function cloudInit() {
  try {
    if (!CG.sdk.data) return;
    CLOUD.on = true;
    let raw = null;
    try { raw = CG.sdk.data.getItem(CLOUD_KEY); } catch (e) {}
    if (raw) { try { cloudMerge(JSON.parse(raw) || {}); } catch (e) {} }
    CLOUD.loaded = true;
    cloudSave(true);                   /* сразу выравниваем облако по слиянию */
  } catch (e) {}
}

function cloudMerge(d) {
  if (d.best) {
    if ((d.best.level | 0) > (SETTINGS.bestLevel | 0)) SETTINGS.bestLevel = d.best.level | 0;
    if ((d.best.score | 0) > (SETTINGS.bestScore | 0)) SETTINGS.bestScore = d.best.score | 0;
  }
  if (d.perks) for (const k in d.perks) if (d.perks[k]) grantPerk(k, true);

  const C = d.meta, M = SETTINGS.meta;
  if (C && typeof C === 'object') {
    if (!M || (C.day | 0) > (M.day | 0)) SETTINGS.meta = C;   /* в облаке свежее */
    else {
      M.xp    = Math.max(M.xp | 0, C.xp | 0);
      M.best  = Math.max(M.best | 0, C.best | 0);
      M.total = Math.max(M.total | 0, C.total | 0);
      M.cr    = Math.max(M.cr | 0, C.cr | 0);
      M.ammo  = Math.max(M.ammo | 0, C.ammo | 0);
      if ((C.day | 0) === (M.day | 0)) {
        M.streak = Math.max(M.streak | 0, C.streak | 0);
        M.claimed = M.claimed || !!C.claimed;                 /* дважды паёк не выдаём */
      } else if ((M.day | 0) - (C.day | 0) === 1) {
        M.streak = Math.max(M.streak | 0, (C.streak | 0) + 1); /* вчера играли на другом устройстве */
      }
      M.best = Math.max(M.best | 0, M.streak | 0);
    }
    if (typeof metaBoot === 'function') metaBoot();           /* пересчёт дня на слитых данных */
  }
  saveSettings();
}

/* пишем не чаще раза в 20 секунд: не дёргаем хранилище на каждый кадр */
function cloudSave(force) {
  if (!CLOUD.on || !CLOUD.loaded) return;
  CLOUD.dirty = true;
  if (!force && CLOUD.t > 0) return;
  cloudFlush();
}
function cloudFlush() {
  if (!CLOUD.on || !CLOUD.loaded || !CLOUD.dirty) return;
  CLOUD.dirty = false;
  CLOUD.t = 20;
  try {
    CG.sdk.data.setItem(CLOUD_KEY, JSON.stringify({
      meta: SETTINGS.meta,
      best: { level: SETTINGS.bestLevel || 0, score: SETTINGS.bestScore || 0 },
      perks: SETTINGS.perks || {}
    }));
  } catch (e) {}
}

/* ------------------------------------------------------------
   РЕКЛАМА — по требованиям CrazyGames (docs.crazygames.com,
   Requirements → Advertisement):
   • звук глушим, только когда ролик реально начался (adStarted),
     а не при запросе;
   • от запроса до adFinished/adError интерфейс заблокирован —
     игрок видит «загрузка рекламы» и ничего не может нажать;
   • при adError за вознаграждение НЕ награждаем;
   • в Basic Launch и при блокировщике кнопок «за ролик» нет вовсе —
     кнопки без эффекта модерация отклоняет;
   • частоту межстраничной рекламы считает сама площадка (раз в
     3 минуты с учётом старта игры и роликов за награду), поэтому
     мы просто запрашиваем её в каждой логичной паузе.
   Коды ошибок: adsDisabledBasicLaunch, unfilled, adblock,
   adCooldown, other — пишутся в консоль.
   ------------------------------------------------------------ */
CG.adsOff = false;                 /* площадка отключила рекламу (Basic Launch) */
CG.adblock = false;                /* у игрока блокировщик рекламы */
CG.req = false;                    /* запрос отправлен, ответа ещё нет */
CG.reqT = 0;                       /* сколько ждём ответа — для анимации */

/* Можно ли вообще предлагать ролик за награду. Вне площадки (локальный
   файл) — да, там показывается демо-ролик для проверки игры. */
function adsAvail() {
  if (!CG.ok) return true;
  return !CG.adsOff && !CG.adblock;
}
/* пока идёт запрос или ролик, ввод в игру не проходит */
const adBlocking = () => CG.req || CG.busy || adMockT > 0;

function adErrCode(e) {
  try { return (e && (e.code || e.message)) || String(e || 'unknown'); } catch (x) { return 'unknown'; }
}
function adLogErr(kind, e) {
  const code = adErrCode(e);
  console.warn('[CrazyGames] ' + kind + ' ad error: ' + code);
  if (code === 'adsDisabledBasicLaunch') CG.adsOff = true;
  if (code === 'adblock') CG.adblock = true;
  return code;
}

/* Разведка при запуске. prefetchAd в Basic Launch сразу бросает
   adsDisabledBasicLaunch — так мы узнаём о нём до первой кнопки.
   В полном запуске он заодно заранее грузит ролик. */
function adProbe() {
  const ad = CG.sdk && CG.sdk.ad;
  if (!ad) return;
  if (typeof ad.prefetchAd === 'function') {
    try { ad.prefetchAd('rewarded'); ad.prefetchAd('midgame'); }
    catch (e) { adLogErr('prefetch', e); }
  }
  if (typeof ad.hasAdblock === 'function') {
    try {
      Promise.resolve(ad.hasAdblock()).then(v => {
        CG.adblock = !!v;
        if (v) console.warn('[CrazyGames] adblock detected: rewarded buttons hidden');
      }).catch(() => {});
    } catch (e) {}
  }
}

/* ---------- звук и пауза на время ролика ---------- */
function adMute(on) { CG.busy = on; audioGate(); }

/* Ролик пошёл: глушим звук и ставим мир на паузу. Ролик кончился (или
   не пришёл): возвращаем. Вызовы идемпотентны — поздний ролик после
   сторожа тоже корректно отпускает игру. */
function adOn() { CG.req = false; adGuardClear(); adMute(true); sdkPause(true); }
function adOff() { CG.req = false; adGuardClear(); sdkPause(false); adMute(false); adRefocus(); }

/* Ролик показывается в родительской странице и забирает фокус у
   фрейма игры — без этого клавиатура молчала бы до первого клика. */
function adRefocus() {
  try { window.focus(); } catch (e) {}
  CG.away = false; audioGate();
}

/* Сторож: SDK всегда отвечает adFinished или adError, но если связь
   оборвалась, игра не должна остаться заблокированной. */
let adGuardT = 0, adGuardCb = null;
function adGuard(sec, cb) { adGuardT = sec; adGuardCb = cb; }
function adGuardClear() { adGuardT = 0; adGuardCb = null; }

/* ---------- межстраничная: в каждой логичной паузе ---------- */
function adFullscreen(done) {
  let fired = false;
  const fin = shown => { if (fired) return; fired = true; done && done(!!shown); };
  if (!CG.ok || CG.adsOff) { fin(false); return; }
  if (CG.req || CG.busy) return;          /* повторное нажатие — первый запрос доведёт */
  CG.req = true; CG.reqT = 0;
  sdkGameplay(false);
  adGuard(15, () => { adOff(); fin(false); });
  try {
    CG.sdk.ad.requestAd('midgame', {
      adStarted: adOn,
      adFinished: () => { adOff(); fin(true); },
      adError: e => { adOff(); adLogErr('midgame', e); fin(false); }
    });
  } catch (e) { adOff(); adLogErr('midgame', e); fin(false); }
}

/* ---------- за вознаграждение ---------- */
function adRewarded(onReward, onDone) {
  if (adBlocking() || CG.paused) return;
  if (!adsAvail()) { adToast(T('adFailed')); return; }     /* кнопки и так скрыты */
  const give = () => { onReward && onReward(); onDone && onDone(); };

  /* вне площадки — демо-ролик, чтобы игру можно было проверить локально */
  if (!CG.ok) {
    adMockT = 1.2;
    adNote = T('adDemo');
    adMute(true);
    adMockCb = () => { adMute(false); give(); };
    return;
  }

  let granted = false;
  CG.req = true; CG.reqT = 0;
  sdkGameplay(false);
  /* сторож только разблокирует игру; награду даёт лишь adFinished,
     даже если ролик всё-таки придёт позже */
  adGuard(15, () => { adOff(); adToast(T('adFailed')); });
  try {
    CG.sdk.ad.requestAd('rewarded', {
      adStarted: adOn,
      adFinished: () => {
        adOff();
        if (granted) return;
        granted = true;
        give();                            /* досмотрел — награда */
      },
      adError: e => {
        adOff();
        adLogErr('rewarded', e);
        adToast(T('adFailed'));            /* правило CrazyGames: без ролика — без награды */
      }
    });
  } catch (e) { adOff(); adLogErr('rewarded', e); adToast(T('adFailed')); }
}

function adToast(text) { adNote = text; adNoteT = 2.2; }

/* сторож, демо-ролик и облако тикают из игрового цикла */
function updAds(dt) {
  gpFlush();                       /* отложенная разметка боя и меню */
  if (CLOUD.t > 0) {
    CLOUD.t -= dt;
    if (CLOUD.t <= 0 && CLOUD.dirty) cloudFlush();
  }
  if (CG.req) CG.reqT += dt;
  if (adGuardT > 0) {
    adGuardT -= dt;
    if (adGuardT <= 0) { const cb = adGuardCb; adGuardCb = null; if (cb) cb(); }
  }
  if (adMockT > 0) {
    adMockT -= dt;
    if (adMockT <= 0) { const cb = adMockCb; adMockCb = null; adNoteT = 1.6; if (cb) cb(); }
  }
  if (adNoteT > 0) adNoteT -= dt;
}

/* поверх всего: «загрузка рекламы», демо-ролик, подсказки */
function drawAdOverlay() {
  if (CG.req && !CG.busy) {
    /* запрос ушёл — блокируем экран, как требует площадка */
    ctx.fillStyle = 'rgba(2,8,14,0.72)';
    ctx.fillRect(0, 0, VW, VH);
    txt(T('adLoading'), VW / 2, VH / 2 - 14, '#ffd94a', 8, 'center', VW - 16);
    const cx = VW / 2, cy = VH / 2 + 8, a = CG.reqT * 5;
    ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(cx, cy, 8, a, a + Math.PI * 1.4); ctx.stroke();
    return true;
  }
  if (adMockT > 0) {
    ctx.fillStyle = 'rgba(2,8,14,0.85)';
    ctx.fillRect(0, 0, VW, VH);
    txt(T('adWatching'), VW / 2, VH / 2 - 12, '#ffd94a', 16, 'center');
    txt(adNote, VW / 2, VH / 2 + 10, '#7fd4e0', 8, 'center', VW - 16);
    const w = 160, k = 1 - adMockT / 1.2;
    bar(VW / 2 - w / 2, VH / 2 + 26, w, 4, k, '#ffd94a');
    return true;
  }
  if (adNoteT > 0) {
    ctx.globalAlpha = Math.min(1, adNoteT);
    txt(adNote, VW / 2, VH - 12, '#ffb454', 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
  }
  return false;
}

/* ------------------------------------------------------------
   Таблицы рекордов у площадки нет, поэтому LB.rank всегда 0 и
   штаб показывает личный рекорд. Заглушки оставлены, чтобы общий
   код обеих сборок не расходился.
   ------------------------------------------------------------ */
const LB = { name: 'best', rank: 0, sent: -1, busy: false };
function lbSubmit() {}
function lbLoad() {}

/* ---------- возрождение за ролик ---------- */
let reviveLeft = 1;

/* Раз за уровень можно вернуться в бой. Есть реклама — за ролик;
   нет (Basic Launch, блокировщик) — второй шанс даём бесплатно,
   иначе гибель без выбора слишком часто заканчивает сессию. */
const reviveFree = () => !adsAvail();
function canRevive() {
  return reviveLeft > 0 && !adBlocking() &&
         !(curCfg.mission === 'convoy' && transport && transport.dead);
}
function tryRevive() {
  if (!canRevive()) { adToast(T('reviveNone')); return; }
  if (reviveFree()) { reviveNow(); return; }
  adRewarded(reviveNow);
}
function reviveNow() {
  reviveLeft--;
  /* поднимаем катер у авианосца и разгоняем всё, что рядом */
  player.dead = false; player.sink = 0; player.sinkRot = 0;
  player.hp = player.maxhp; player.spd = 0; player.fr = 0;
  player.x = CARR.x + 120; player.y = CARR.y;
  player.boostE = boostMax();
  shells.length = 0; eMissiles.length = 0; arcs.length = 0; torps.length = 0;
  for (let i = enemies.length - 1; i >= 0; i--)
    if (dist(enemies[i].x, enemies[i].y, player.x, player.y) < 260) enemies.splice(i, 1);
  setState('play');
  msg(T('reviveDone'), '#4ade80', 3);
  SFX.evac();
  flashScreen = 0.35;
}

/* ===== src/core/meta.js ===== */
;
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
  /* Первые три дня — лёгкие цели за ту же плату: новичок за сессию
     5 минут физически не потопит 14 кораблей и не наберёт 12000 очков.
     Ноль выполненных заданий в первый день = ноль дофамина = нет D1.
     Урезаем только «фарм»-цели, level/boss/streak оставляем как есть. */
  try {
    const total = SETTINGS.meta ? (SETTINGS.meta.total | 0) : 99;
    if (total <= 3) {
      const EASY = { ships: 5, planes: 3, bases: 2, bunkers: 4, mines: 3, hostage: 4, score: 6000 };
      for (const q of out) if (EASY[q.id]) q.goal = Math.min(q.goal, EASY[q.id]);
    }
  } catch (e) {}
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

/* ===== src/gfx/sprites.js ===== */
;
'use strict';
/* ============================================================
   sprites.js — процедурные спрайты, генерируются один раз при загрузке.

   Все спрайты рисуются в ФИЗИЧЕСКИХ пикселях (SC пикселей на единицу
   разметки), поэтому при SC=4 деталей вчетверо больше по каждой оси.
   На экран они выводятся хелперами blit/blitC, которые делят размер
   обратно на SC — так спрайт занимает столько же места в мире,
   но состоит из вчетверо более мелких пикселей.
   Корабли ориентированы носом вверх и поворачиваются при отрисовке.
   ============================================================ */

function newCv(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* вывод спрайта в мировых единицах */
function blit(spr, x, y) {
  ctx.drawImage(spr, x, y, spr.width / SC, spr.height / SC);
}
function blitC(spr, cx, cy) {
  ctx.drawImage(spr, cx - spr.width / (2 * SC), cy - spr.height / (2 * SC),
                spr.width / SC, spr.height / SC);
}

/* Контур корпуса: острый нос с плавными скулами, прямой борт,
   скруглённая корма с транцем. (cx, y0) — нос, L — длина, HW — полуширина. */
function hullPath(g, cx, y0, L, HW, bow, stern) {
  const b = L * (bow || 0.30), s = stern || 0.78;
  g.beginPath();
  g.moveTo(cx, y0);
  g.bezierCurveTo(cx + HW * 0.50, y0 + b * 0.18, cx + HW, y0 + b * 0.62, cx + HW, y0 + b);
  g.lineTo(cx + HW, y0 + L * 0.88);
  g.quadraticCurveTo(cx + HW, y0 + L, cx + HW * s, y0 + L);
  g.lineTo(cx - HW * s, y0 + L);
  g.quadraticCurveTo(cx - HW, y0 + L, cx - HW, y0 + L * 0.88);
  g.lineTo(cx - HW, y0 + b);
  g.bezierCurveTo(cx - HW, y0 + b * 0.62, cx - HW * 0.50, y0 + b * 0.18, cx, y0);
  g.closePath();
}
/* скруглённый прямоугольник */
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
/* объёмный блок надстройки: тень, стенки, крыша со светлой кромкой */
function block(g, x, y, w, h, col, u, rad) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rrect(g, x + u * 0.5, y + u * 0.8, w, h, rad || u * 0.6); g.fill();
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, shade(col, 1.18)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, 0.72));
  g.fillStyle = gr;
  rrect(g, x, y, w, h, rad || u * 0.6); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, u * 0.22); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(x + u * 0.3, y + u * 0.25, w - u * 0.6, Math.max(1, u * 0.3));
}
/* орудийная башня: круглая броня и ствол к носу */
function turretArt(g, x, y, r, col, u, twin) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(x + u * 0.4, y + u * 0.6, r, 0, TAU); g.fill();
  g.fillStyle = '#10161c';
  const bl = r * 1.9, bw = Math.max(1, u * 0.42);
  for (const dx of (twin ? [-r * 0.32, r * 0.32] : [0])) g.fillRect(x + dx - bw / 2, y - bl, bw, bl);
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, shade(col, 1.35)); gr.addColorStop(1, shade(col, 0.7));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.2); g.stroke();
}

/* ------------------------------------------------------------
   Корпус корабля (векторный рисунок в физических пикселях).
   opt: bridge — надстройка с окнами и мачтой; guns — башни (доля
   длины от носа); pods — ракетные контейнеры; mast — только мачта.
   ------------------------------------------------------------ */
function makeShip(lenU, halfU, C, opt) {
  opt = opt || {};
  const u = SC;
  const L  = Math.max(10, Math.round(lenU * u));
  const HW = Math.max(2, Math.round(halfU * u));
  const w  = HW * 2 + 7, h = L + 5;
  const c = newCv(w, h), g = c.getContext('2d');
  const cx = w / 2, y0 = 2;

  /* корпус: светотень поперёк — левый борт на солнце, правый в тени */
  const hg = g.createLinearGradient(cx - HW, 0, cx + HW, 0);
  hg.addColorStop(0, C.lit || shade(C.hull, 1.25));
  hg.addColorStop(0.45, C.hull);
  hg.addColorStop(1, C.dk);
  hullPath(g, cx, y0, L, HW);
  g.fillStyle = hg; g.fill();
  g.strokeStyle = C.out; g.lineWidth = Math.max(1, u * 0.38); g.stroke();
  /* планширь — светлая кромка по борту */
  g.save();
  g.translate(cx, y0 + L / 2); g.scale(0.9, 0.955); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW);
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = Math.max(1, u * 0.22); g.stroke();
  g.restore();

  /* палуба с досками */
  g.save();
  g.translate(cx, y0 + L / 2); g.scale(0.74, 0.9); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW);
  g.fillStyle = C.deck; g.fill();
  g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = Math.max(1, u * 0.14);
  for (let x = cx - HW; x < cx + HW; x += u * 0.9) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + L); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(cx - HW, y0, HW * 0.7, L);
  g.restore();
  /* тень борта на палубе */
  g.save();
  g.translate(cx, y0 + L / 2); g.scale(0.74, 0.9); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW);
  g.strokeStyle = 'rgba(0,0,0,0.30)'; g.lineWidth = Math.max(1, u * 0.35); g.stroke();
  g.restore();

  /* нос: брашпиль и якорная цепь */
  g.fillStyle = '#20282e';
  g.beginPath(); g.arc(cx, y0 + L * 0.11, Math.max(1, u * 0.45), 0, TAU); g.fill();
  g.fillStyle = C.acc; g.fillRect(cx - Math.max(1, u * 0.2), y0 + u * 0.4, Math.max(1, u * 0.4), u * 0.9);
  /* кормовой транец и флагшток */
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(cx - HW * 0.7, y0 + L - u * 0.7, HW * 1.4, u * 0.7);
  g.fillStyle = C.acc;
  g.fillRect(cx + HW * 0.35, y0 + L - u * 1.7, Math.max(1, u * 0.9), Math.max(1, u * 0.55));

  /* леерные стойки по кромке */
  if (u >= 3 && HW >= u * 2) {
    g.fillStyle = 'rgba(230,240,245,0.45)';
    for (let t = 0.3; t < 0.86; t += 0.07) {
      const y = y0 + L * t;
      g.fillRect(cx - HW * 0.84, y, Math.max(1, u * 0.22), Math.max(1, u * 0.22));
      g.fillRect(cx + HW * 0.84 - u * 0.2, y, Math.max(1, u * 0.22), Math.max(1, u * 0.22));
    }
  }

  /* ракетные контейнеры */
  if (opt.pods) {
    const y = y0 + L * 0.26, pw = HW * 0.62, ph = u * 1.2;
    for (const sx of [-1, 1]) {
      g.save(); g.translate(cx + sx * pw * 0.55, y + ph); g.rotate(sx * 0.18);
      block(g, -pw / 2, -ph / 2, pw, ph * 2.2, '#5c4a52', u, u * 0.3);
      g.fillStyle = '#ff6b3d';
      for (let k = 0; k < 3; k++) g.fillRect(-pw / 2 + u * 0.3 + k * (pw - u * 0.6) / 3, -ph / 2 + u * 0.2, (pw - u * 1.2) / 3, u * 0.5);
      g.restore();
    }
  }
  /* башни главного калибра */
  if (opt.guns) for (const gy of opt.guns)
    turretArt(g, cx, y0 + L * gy, Math.max(u * 0.9, HW * 0.52), C.sup || C.deck, u, HW >= u * 4);

  /* надстройка: рубка с окнами, мачта, радар, спасательные круги */
  if (opt.bridge) {
    const bw = HW * 1.15, bh = Math.max(u * 2.4, L * 0.2), by = y0 + L * 0.48;
    block(g, cx - bw / 2, by, bw, bh, C.sup || shade(C.deck, 1.25), u, u * 0.7);
    /* лобовое остекление смотрит в нос */
    g.fillStyle = '#0c1a24';
    rrect(g, cx - bw / 2 + u * 0.5, by + u * 0.45, bw - u, Math.max(1, u * 0.8), u * 0.3); g.fill();
    g.fillStyle = C.glass || '#9fe8ff';
    g.fillRect(cx - bw / 2 + u * 0.8, by + u * 0.55, (bw - u * 1.6) * 0.45, Math.max(1, u * 0.28));
    /* второй ярус */
    if (L > 18 * u) block(g, cx - bw * 0.32, by + bh * 0.42, bw * 0.64, bh * 0.44, shade(C.sup || C.deck, 1.1), u, u * 0.5);
    /* мачта с реей и радаром */
    const my = by + bh * 0.62;
    g.strokeStyle = '#1a2228'; g.lineWidth = Math.max(1, u * 0.3);
    g.beginPath(); g.moveTo(cx - HW * 0.7, my); g.lineTo(cx + HW * 0.7, my); g.stroke();
    g.fillStyle = '#d8e2e8';
    g.beginPath(); g.ellipse(cx, my, u * 0.9, u * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = C.acc; g.fillRect(cx - u * 0.25, my - u * 0.25, u * 0.5, u * 0.5);
    /* спасательные круги на бортах рубки */
    for (const sx of [-1, 1]) {
      const rx = cx + sx * (bw / 2 + u * 0.1), ry = by + bh * 0.7, r = Math.max(1, u * 0.45);
      g.strokeStyle = '#ff7a3d'; g.lineWidth = Math.max(1, u * 0.35);
      g.beginPath(); g.arc(rx, ry, r, 0, TAU); g.stroke();
    }
  }
  /* мелочи на корме: кнехты и люк */
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(cx - HW * 0.45, y0 + L * 0.84, Math.max(1, u * 0.5), Math.max(1, u * 0.5));
  g.fillRect(cx + HW * 0.35, y0 + L * 0.84, Math.max(1, u * 0.5), Math.max(1, u * 0.5));
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(1, u * 0.18);
  g.strokeRect(cx - HW * 0.25, y0 + L * 0.72, HW * 0.5, u * 1.2);
  return c;
}

/* катер игрока: башня рисуется отдельно (поворачивается), на носу пусто */
const PLAYER_GUN_OFF = 5;          /* башня вынесена вперёд от центра, ед. мира */
const sprPlayer = makeShip(24, 4.3,
  { out: '#16222c', hull: '#b9c8cf', dk: '#6d808b', deck: '#8ea3ad',
    acc: '#ffd94a', sup: '#d4e1e7', glass: '#8fe4ff', lit: '#eef5f8' },
  { bridge: true });

const SHIP_SPR = {
  patrol : makeShip(15, 2.6, { out: '#0f151b', hull: '#6b5a60', dk: '#352b30', deck: '#54474c',
                               acc: '#e5484d', lit: '#8e7d82', sup: '#7a6a70', glass: '#c9a0a0' }, { guns: [0.3] }),
  gun    : makeShip(19, 3.2, { out: '#10161c', hull: '#5a6a73', dk: '#2f3a42', deck: '#46545d',
                               acc: '#e5484d', lit: '#7d8f98', sup: '#6f7f88', glass: '#9fe8ff' }, { bridge: true, guns: [0.22] }),
  missile: makeShip(21, 3.2, { out: '#151018', hull: '#62576c', dk: '#352d3c', deck: '#4d4456',
                               acc: '#ff6b3d', lit: '#877b93', sup: '#756a80', glass: '#c0a8ff' }, { bridge: true, pods: true }),
  frigate: makeShip(30, 5, { out: '#0d1218', hull: '#4f5f6a', dk: '#27313a', deck: '#3d4a54',
                             acc: '#e5484d', sup: '#627482', lit: '#728795', glass: '#9fe8ff' },
                    { bridge: true, guns: [0.18, 0.85] })
};

/* ============================================================
   Линкор «Левиафан».

   Корпус и надстройки запечены в спрайт, а четыре башни главного
   калибра — отдельный спрайт: они разворачиваются на игрока и
   откатываются при выстреле (см. drawBoss в scene.js).
   ============================================================ */
const BOSS_TURRETS = [-0.30, -0.19, 0.20, 0.31];   /* смещения башен вдоль корпуса, доли длины */

const sprBoss = (function () {
  const u = SC, L = Math.round(64 * u), HW = Math.round(11 * u);
  const w = HW * 2 + 10, h = L + 8;
  const c = newCv(w, h), g = c.getContext('2d');
  const cx = Math.round(w / 2), y0 = 4;
  const C = {
    out: '#080d12', hull: '#3f4c57', lit: '#5d6f7c', dk: '#212a32',
    deck: '#2e3a43', deck2: '#3a4750', steel: '#55646f', steel2: '#6d7f8b',
    glass: '#ffb46b', acc: '#e5484d', wood: '#4d4130', rust: '#7a4a38'
  };
  const px = Math.max(1, Math.round(u / 2));

  /* профиль корпуса: острый нос, длинная цитадель, срезанная корма */
  const hw = [];
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1); let v;
    if (t < 0.17) v = 0.08 + 0.92 * Math.pow(t / 0.17, 0.60);
    else if (t < 0.80) v = 1;
    else v = 1 - 0.40 * Math.pow((t - 0.80) / 0.20, 1.15);
    hw.push(Math.max(1, Math.round(v * HW)));
  }
  const rowY = i => y0 + i;

  /* тень на воде */
  for (let i = 0; i < L; i++) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(cx - hw[i] - 2, rowY(i) + u * 0.7, hw[i] * 2 + 5, 1);
  }
  /* контур и борта */
  for (let i = 0; i < L; i++) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = C.out;  g.fillRect(cx - r - 2, y, r * 2 + 5, 1);
    g.fillStyle = C.hull; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = C.lit;  g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.30)), 1);
    g.fillStyle = C.dk;   g.fillRect(cx + r - Math.max(1, Math.round(r * 0.24)) + 1,
                                     y, Math.max(1, Math.round(r * 0.24)), 1);
  }
  /* красная ватерлиния по самой кромке */
  for (let i = 2; i < L - 2; i++) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = 'rgba(150,44,44,0.85)';
    g.fillRect(cx - r, y, px, 1);
    g.fillRect(cx + r - px + 1, y, px, 1);
  }
  /* броневой пояс — тёмная полоса чуть внутрь борта */
  for (let i = Math.round(L * 0.14); i < L * 0.86; i++) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = 'rgba(18,24,30,0.45)';
    g.fillRect(cx - r + px, y, px * 2, 1);
    g.fillRect(cx + r - px * 3 + 1, y, px * 2, 1);
  }

  /* палуба */
  const inset = Math.max(2, Math.round(HW * 0.34));
  for (let i = px * 2; i < L - px * 2; i++) {
    const q = hw[i] - inset;
    if (q >= 1) { g.fillStyle = C.deck; g.fillRect(cx - q, rowY(i), q * 2 + 1, 1); }
  }
  /* дощатый настил */
  for (let i = px * 3; i < L - px * 3; i += Math.max(2, Math.round(u * 0.8))) {
    const q = hw[i] - inset;
    if (q >= 1) { g.fillStyle = C.deck2; g.fillRect(cx - q, rowY(i), q * 2 + 1, 1); }
  }
  /* продольные швы настила */
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let k = -2; k <= 2; k++)
    g.fillRect(cx + k * Math.round(HW * 0.30), rowY(px * 3), 1, L - px * 6);

  /* казематы второго калибра по бортам */
  for (let i = Math.round(L * 0.30); i < L * 0.72; i += Math.round(u * 3)) {
    const r = hw[i], y = rowY(i);
    g.fillStyle = C.out;  g.fillRect(cx - r + px, y - px, px * 2 + 1, px * 2);
    g.fillStyle = C.steel; g.fillRect(cx - r + px + 1, y - px + 1, px * 2 - 1, px * 2 - 2);
    g.fillStyle = C.out;  g.fillRect(cx + r - px * 3, y - px, px * 2 + 1, px * 2);
    g.fillStyle = C.steel; g.fillRect(cx + r - px * 3 + 1, y - px + 1, px * 2 - 1, px * 2 - 2);
  }

  /* барбеты под башни — тёмные круги, чтобы башня «сидела» в корпусе */
  for (const t of BOSS_TURRETS) {
    const y = rowY(Math.round((0.5 + t) * L)), br = Math.round(HW * 0.62);
    g.fillStyle = C.out;
    g.beginPath(); g.arc(cx, y, br + 1, 0, TAU); g.fill();
    g.fillStyle = C.steel;
    g.beginPath(); g.arc(cx, y, br, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.arc(cx, y + px, br * 0.8, 0, TAU); g.fill();
  }

  /* --- надстройка: башенноподобная мачта в носовой части --- */
  const supY = Math.round(L * 0.40);
  const tier = (yy, hh, ww, col) => {
    g.fillStyle = C.out;  g.fillRect(cx - ww - 1, yy - 1, ww * 2 + 3, hh + 2);
    g.fillStyle = col;    g.fillRect(cx - ww, yy, ww * 2 + 1, hh);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(cx - ww, yy, ww * 2 + 1, 1);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(cx - ww, yy + hh - 1, ww * 2 + 1, 1);
  };
  tier(supY, Math.round(u * 7), Math.round(HW * 0.58), C.steel);
  tier(supY + Math.round(u * 1.2), Math.round(u * 4.6), Math.round(HW * 0.42), C.steel2);
  tier(supY + Math.round(u * 2.4), Math.round(u * 2.4), Math.round(HW * 0.26), C.steel2);
  /* окна ходового мостика */
  g.fillStyle = C.glass;
  g.fillRect(cx - Math.round(HW * 0.36), supY + Math.round(u * 1.6), Math.round(HW * 0.72), px);
  /* дальномер поперёк мачты */
  g.fillStyle = C.out;
  g.fillRect(cx - Math.round(HW * 0.72), supY + Math.round(u * 0.5), Math.round(HW * 1.44), px);
  /* решётка РЛС на верхушке */
  g.fillStyle = C.steel2;
  g.fillRect(cx - Math.round(HW * 0.30), supY - Math.round(u * 1.4), Math.round(HW * 0.6), px);
  g.fillStyle = C.out;
  for (let k = 0; k < 4; k++)
    g.fillRect(cx - Math.round(HW * 0.24) + k * Math.round(HW * 0.16), supY - Math.round(u * 1.4), 1, px);
  g.fillStyle = C.acc;
  g.fillRect(cx - 1, supY - Math.round(u * 3.2), 2, Math.round(u * 1.8));

  /* --- две трубы с козырьками и копотью --- */
  const funnel = (yy) => {
    const fw = Math.round(HW * 0.44), fh = Math.round(u * 3.4);
    g.fillStyle = C.out;   g.fillRect(cx - fw - 1, yy - 1, fw * 2 + 3, fh + 2);
    g.fillStyle = C.steel; g.fillRect(cx - fw, yy, fw * 2 + 1, fh);
    g.fillStyle = '#151b20'; g.fillRect(cx - fw + px, yy + px, fw * 2 - px * 2 + 1, fh - px * 2);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - fw, yy, fw * 2 + 1, 1);
    g.fillStyle = C.acc;   g.fillRect(cx - fw, yy + fh - px * 2, fw * 2 + 1, px);
  };
  funnel(Math.round(L * 0.50));
  funnel(Math.round(L * 0.59));

  /* --- кормовая мачта и катапульта с гидросамолётом --- */
  const aftY = Math.round(L * 0.66);
  g.fillStyle = C.out;   g.fillRect(cx - px, aftY, px * 2, Math.round(u * 3));
  g.fillStyle = C.steel2; g.fillRect(cx - Math.round(HW * 0.5), aftY + px, Math.round(HW), px);
  const catY = Math.round(L * 0.71);
  g.fillStyle = C.wood;  g.fillRect(cx - Math.round(HW * 0.16), catY, Math.round(HW * 0.32), Math.round(u * 5));
  g.fillStyle = '#39454e';
  g.fillRect(cx - px, catY + Math.round(u * 1.2), px * 2, Math.round(u * 2.4));
  g.fillRect(cx - Math.round(HW * 0.42), catY + Math.round(u * 2), Math.round(HW * 0.84), px);
  g.fillStyle = '#9fe8ff'; g.fillRect(cx - px / 2, catY + Math.round(u * 1.5), px, px);

  /* --- зенитные гнёзда по бортам --- */
  for (let k = 0; k < 6; k++) {
    const i = Math.round(L * (0.34 + k * 0.07));
    const r = hw[i] - inset - px, y = rowY(i);
    for (const sx of [-1, 1]) {
      g.fillStyle = C.out;
      g.beginPath(); g.arc(cx + sx * r, y, px * 1.6, 0, TAU); g.fill();
      g.fillStyle = C.steel2;
      g.beginPath(); g.arc(cx + sx * r, y, px * 1.1, 0, TAU); g.fill();
      g.fillStyle = C.out;
      g.fillRect(cx + sx * r - px * 0.3, y - px * 2.4, px * 0.7, px * 2);
    }
  }

  /* --- нос: якоря, клюзы, бурун --- */
  g.fillStyle = C.out;
  g.fillRect(cx - Math.round(HW * 0.5), rowY(Math.round(L * 0.10)), px * 2, px * 2);
  g.fillRect(cx + Math.round(HW * 0.5) - px, rowY(Math.round(L * 0.10)), px * 2, px * 2);
  g.fillStyle = C.acc; g.fillRect(cx - 1, y0, 2, Math.round(u * 1.2));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(cx - 1, y0 + Math.round(u * 0.4), 2, 1);

  /* --- корма: транец и флагшток --- */
  const yb = L - Math.round(u * 1.6);
  g.fillStyle = C.dk;  g.fillRect(cx - hw[yb] + 1, rowY(yb), hw[yb] * 2 - 1, Math.round(u * 1.2));
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - hw[yb] + 1, rowY(yb), hw[yb] * 2 - 1, 1);
  g.fillStyle = C.acc; g.fillRect(cx - 1, rowY(L - 1), 2, Math.round(u * 1.4));

  /* --- бортовой номер и полосы опознавания --- */
  g.fillStyle = 'rgba(230,238,242,0.75)';
  g.fillRect(cx - Math.round(HW * 0.75), rowY(Math.round(L * 0.235)), px, px * 3);
  g.fillRect(cx - Math.round(HW * 0.75) + px * 2, rowY(Math.round(L * 0.235)), px, px * 3);
  for (let y = Math.round(L * 0.12); y < L * 0.88; y += Math.round(u * 6)) {
    g.fillStyle = 'rgba(229,72,77,0.35)';
    g.fillRect(cx - HW + px, rowY(y), HW * 2 - px * 2, 1);
  }
  /* заклёпки и потёки ржавчины */
  for (let i = 0; i < 90; i++) {
    const yy = ri(Math.round(L * 0.1), Math.round(L * 0.9));
    const r = hw[yy];
    const sx = chance(0.5) ? -1 : 1;
    g.fillStyle = chance(0.25) ? C.rust : 'rgba(0,0,0,0.25)';
    g.fillRect(cx + sx * (r - ri(1, Math.max(2, px * 2))), rowY(yy), 1, ri(1, px));
  }
  return c;
})();

/* башня главного калибра: спарка стволов, смотрит вверх */
const sprBossTurret = (function () {
  const u = SC, W = Math.round(11 * u), H = Math.round(17 * u);
  const c = newCv(W, H), g = c.getContext('2d');
  const cx = Math.round(W / 2), cy = Math.round(H * 0.72);  /* центр вращения */
  const px = Math.max(1, Math.round(u / 2));

  /* стволы */
  for (const dx of [-Math.round(u * 1.5), Math.round(u * 1.5)]) {
    g.fillStyle = '#080d12';
    g.fillRect(cx + dx - px * 1.2, cy - Math.round(u * 10), px * 2.4, Math.round(u * 10));
    g.fillStyle = '#2b353d';
    g.fillRect(cx + dx - px * 0.8, cy - Math.round(u * 10), px * 1.6, Math.round(u * 10));
    g.fillStyle = '#0d1318';
    g.fillRect(cx + dx - px * 1.2, cy - Math.round(u * 10), px * 2.4, px * 1.5);
  }
  /* лоб башни */
  g.fillStyle = '#080d12';
  g.fillRect(cx - Math.round(u * 3.4), cy - Math.round(u * 3.6), Math.round(u * 6.8), Math.round(u * 6.4));
  g.fillStyle = '#4d5c67';
  g.fillRect(cx - Math.round(u * 3.0), cy - Math.round(u * 3.2), Math.round(u * 6.0), Math.round(u * 5.6));
  g.fillStyle = '#63737f';
  g.fillRect(cx - Math.round(u * 3.0), cy - Math.round(u * 3.2), Math.round(u * 6.0), Math.round(u * 1.2));
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(cx - Math.round(u * 3.0), cy + Math.round(u * 1.6), Math.round(u * 6.0), Math.round(u * 0.8));
  /* смотровой колпак и поручни */
  g.fillStyle = '#080d12';
  g.beginPath(); g.arc(cx, cy - Math.round(u * 0.4), px * 1.6, 0, TAU); g.fill();
  g.fillStyle = '#7b8c98';
  g.beginPath(); g.arc(cx, cy - Math.round(u * 0.4), px, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(cx - Math.round(u * 2.6), cy - Math.round(u * 2.4), Math.round(u * 5.2), 1);
  g.fillStyle = '#e5484d';
  g.fillRect(cx - Math.round(u * 0.5), cy + Math.round(u * 2.0), Math.round(u * 1.0), px);
  return c;
})();

/* ---------- подводная лодка ---------- */
const sprSub = (function () {
  const u = SC, L = Math.round(24 * u), HW = Math.round(3.4 * u);
  const c = newCv(HW * 2 + 6, L + 4), g = c.getContext('2d');
  const cx = Math.round(c.width / 2), y0 = 2, px = Math.max(1, Math.round(u / 2));
  const hw = [];
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1);
    /* сигара: острый нос, тупая корма */
    const v = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.92 + 0.14);
    hw.push(Math.max(1, Math.round(v * HW)));
  }
  for (let i = 0; i < L; i++) {
    const r = hw[i], y = y0 + i;
    g.fillStyle = '#0c1116'; g.fillRect(cx - r - 1, y, r * 2 + 3, 1);
    g.fillStyle = '#2f3841'; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = '#414d57'; g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.42)), 1);
    g.fillStyle = '#1b222a'; g.fillRect(cx + r - px, y, px, 1);
  }
  /* палубный настил вдоль корпуса */
  g.fillStyle = '#39434d';
  g.fillRect(cx - px, y0 + Math.round(L * 0.14), px * 2, Math.round(L * 0.72));
  /* рубка */
  const ty = y0 + Math.round(L * 0.38), th = Math.round(u * 5);
  g.fillStyle = '#0c1116'; g.fillRect(cx - px * 3, ty - 1, px * 6, th + 2);
  g.fillStyle = '#414d57'; g.fillRect(cx - px * 2.5, ty, px * 5, th);
  g.fillStyle = '#55636f'; g.fillRect(cx - px * 2.5, ty, px * 2, th);
  /* перископ и антенна */
  g.fillStyle = '#0c1116';
  g.fillRect(cx - px * 0.4, ty - px * 3, px * 0.8, px * 3);
  g.fillStyle = '#8b9aa5'; g.fillRect(cx + px * 1.2, ty - px * 2, px * 0.6, px * 2);
  /* палубное орудие и горизонтальные рули */
  g.fillStyle = '#0c1116';
  g.fillRect(cx - px, ty + th + px, px * 2, px * 3);
  g.fillStyle = '#1b222a';
  g.fillRect(cx - HW - px * 2, y0 + Math.round(L * 0.86), px * 2, px * 2);
  g.fillRect(cx + HW, y0 + Math.round(L * 0.86), px * 2, px * 2);
  /* красная маркировка */
  g.fillStyle = '#a03038'; g.fillRect(cx - px * 2, y0 + Math.round(L * 0.22), px * 4, px);
  return c;
})();

/* ---------- глубинная бомба ---------- */
const sprDC = (function () {
  const u = SC, c = newCv(6 * u, 7 * u), g = c.getContext('2d');
  const cx = 3 * u;
  g.fillStyle = '#1a1f24'; g.fillRect(cx - u * 1.5, u, u * 3, u * 4.6);
  g.fillStyle = '#39454e'; g.fillRect(cx - u * 1.2, u * 1.2, u * 2.4, u * 4.2);
  g.fillStyle = '#4f5d67'; g.fillRect(cx - u * 1.2, u * 1.2, u * 0.9, u * 4.2);
  g.fillStyle = '#1a1f24';
  g.fillRect(cx - u * 1.5, u * 2.2, u * 3, u * 0.4);
  g.fillRect(cx - u * 1.5, u * 4.0, u * 3, u * 0.4);
  g.fillStyle = '#e5484d'; g.fillRect(cx - u * 0.5, u * 0.3, u, u * 0.9);
  return c;
})();

/* ---------- транспорт конвоя ---------- */
const sprTransport = (function () {
  const u = SC, L = Math.round(34 * u), HW = Math.round(6 * u);
  const c = newCv(HW * 2 + 8, L + 6), g = c.getContext('2d');
  const cx = c.width / 2, y0 = 3;
  const hg = g.createLinearGradient(cx - HW, 0, cx + HW, 0);
  hg.addColorStop(0, '#7b8893'); hg.addColorStop(0.45, '#56626d'); hg.addColorStop(1, '#2f3840');
  hullPath(g, cx, y0, L, HW, 0.18, 0.85);
  g.fillStyle = hg; g.fill();
  g.strokeStyle = '#11171c'; g.lineWidth = Math.max(1, u * 0.4); g.stroke();
  /* зелёная полоса своего судна */
  g.save(); g.translate(cx, y0 + L / 2); g.scale(0.93, 0.97); g.translate(-cx, -(y0 + L / 2));
  hullPath(g, cx, y0, L, HW, 0.18, 0.85);
  g.strokeStyle = 'rgba(74,222,128,0.7)'; g.lineWidth = Math.max(1, u * 0.35); g.stroke();
  g.restore();
  /* трюмы с контейнерами */
  const cols = ['#b5523b', '#3b7bb5', '#c9a13b', '#4f9a5b', '#8a4fb5'];
  for (let k = 0; k < 3; k++) {
    const y = y0 + L * (0.16 + k * 0.18);
    g.fillStyle = '#1c2328'; rrect(g, cx - HW + u, y, HW * 2 - 2 * u, 5 * u, u * 0.5); g.fill();
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) {
      const col = cols[(k * 3 + r * 2 + q) % cols.length];
      block(g, cx - HW + 1.6 * u + q * (HW - 1.2 * u), y + 0.5 * u + r * 2.2 * u, HW - 1.8 * u, 1.9 * u, col, u, u * 0.2);
    }
  }
  /* стрелы кранов */
  g.strokeStyle = '#d8b24a'; g.lineWidth = Math.max(1, u * 0.45);
  for (const t of [0.33, 0.51]) {
    g.beginPath(); g.moveTo(cx - HW * 0.7, y0 + L * t); g.lineTo(cx + HW * 0.6, y0 + L * t - 2 * u); g.stroke();
  }
  /* надстройка на корме, труба с зелёной полосой */
  block(g, cx - HW + u, y0 + L * 0.72, HW * 2 - 2 * u, 6 * u, '#c2ccd2', u, u * 0.6);
  g.fillStyle = '#0c1a24'; g.fillRect(cx - HW + 1.6 * u, y0 + L * 0.72 + 0.5 * u, HW * 2 - 3.2 * u, u * 0.9);
  g.fillStyle = '#9fe8ff'; g.fillRect(cx - HW + 2 * u, y0 + L * 0.72 + 0.6 * u, HW * 0.8, u * 0.35);
  g.fillStyle = '#2a3238'; rrect(g, cx - 1.6 * u, y0 + L * 0.72 + 3.6 * u, 3.2 * u, 3.4 * u, u * 0.6); g.fill();
  g.fillStyle = '#4ade80'; g.fillRect(cx - 1.6 * u, y0 + L * 0.72 + 4.2 * u, 3.2 * u, u * 0.7);
  return c;
})();

/* ---------- босс-авианосец «ГРОЗА» ---------- */
const sprBossCarrier = (function () {
  const u = SC, L = Math.round(70 * u), HW = Math.round(13 * u);
  const c = newCv(HW * 2 + 10, L + 8), g = c.getContext('2d');
  const cx = Math.round(c.width / 2), y0 = 4, px = Math.max(1, Math.round(u / 2));
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1); let v;
    if (t < 0.12) v = 0.34 + 0.66 * Math.pow(t / 0.12, 0.7);
    else if (t < 0.88) v = 1;
    else v = 1 - 0.34 * ((t - 0.88) / 0.12);
    const r = Math.round(v * HW), y = y0 + i;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(cx - r - 2, y + px * 2, r * 2 + 5, 1);
    g.fillStyle = '#0a0f14'; g.fillRect(cx - r - 2, y, r * 2 + 5, 1);
    g.fillStyle = '#3b4750'; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = '#4d5b66'; g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.22)), 1);
    g.fillStyle = 'rgba(150,44,44,0.8)'; g.fillRect(cx - r, y, px, 1);
    g.fillStyle = 'rgba(150,44,44,0.8)'; g.fillRect(cx + r - px + 1, y, px, 1);
  }
  /* полётная палуба */
  g.fillStyle = '#2b333a'; g.fillRect(cx - HW + px * 2, y0 + Math.round(L * 0.06), HW * 2 - px * 4, Math.round(L * 0.88));
  /* угловая палуба слева */
  g.fillStyle = '#252c33';
  g.fillRect(cx - HW - px * 2, y0 + Math.round(L * 0.30), HW + px * 2, Math.round(L * 0.42));
  /* осевая разметка и зона посадки */
  for (let y = Math.round(L * 0.12); y < L * 0.9; y += Math.round(u * 7)) {
    g.fillStyle = '#e8f0f2'; g.fillRect(cx - px, y0 + y, px * 2, Math.round(u * 3.4));
  }
  g.fillStyle = '#e5484d';
  g.fillRect(cx - HW + px * 3, y0 + Math.round(L * 0.10), HW * 2 - px * 6, px);
  g.fillRect(cx - HW + px * 3, y0 + Math.round(L * 0.92), HW * 2 - px * 6, px);
  /* аэрофинишёры */
  g.fillStyle = '#1c2229';
  for (let k = 0; k < 4; k++)
    g.fillRect(cx - HW + px * 2, y0 + Math.round(L * (0.70 + k * 0.05)), HW * 2 - px * 4, px * 0.7);
  /* остров-надстройка справа */
  const iy = y0 + Math.round(L * 0.40);
  g.fillStyle = '#0a0f14'; g.fillRect(cx + HW - px * 5, iy, px * 7, Math.round(u * 16));
  g.fillStyle = '#55636f'; g.fillRect(cx + HW - px * 4.4, iy + px, px * 6, Math.round(u * 15));
  g.fillStyle = '#9fe8ff';
  for (let k = 0; k < 3; k++)
    g.fillRect(cx + HW - px * 3.6, iy + px * (2 + k * 3), px * 4.4, px);
  g.fillStyle = '#e5484d'; g.fillRect(cx + HW - px * 2, iy - px * 5, px, px * 5);
  g.fillStyle = '#8b9aa5'; g.fillRect(cx + HW - px * 4, iy - px * 3, px * 5, px);
  /* самолёты на палубе */
  const deckPlane = (x, y, ang) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = '#39454e';
    g.fillRect(-px * 0.9, -px * 4, px * 1.8, px * 8);
    g.fillRect(-px * 4, -px * 0.9, px * 8, px * 1.8);
    g.fillStyle = '#4f5d67'; g.fillRect(-px * 4, -px * 0.9, px * 8, px * 0.7);
    g.fillStyle = '#e5484d'; g.fillRect(-px * 0.5, -px * 4.4, px, px);
    g.restore();
  };
  deckPlane(cx - HW * 0.5, y0 + Math.round(L * 0.20), 0.4);
  deckPlane(cx + HW * 0.3, y0 + Math.round(L * 0.20), -0.3);
  deckPlane(cx - HW * 0.5, y0 + Math.round(L * 0.80), 0.2);
  deckPlane(cx + HW * 0.3, y0 + Math.round(L * 0.86), -0.5);
  /* зенитные спонсоны по бортам */
  for (let k = 0; k < 7; k++) {
    const y = y0 + Math.round(L * (0.16 + k * 0.11));
    for (const sx of [-1, 1]) {
      g.fillStyle = '#0a0f14';
      g.beginPath(); g.arc(cx + sx * (HW + px), y, px * 1.7, 0, TAU); g.fill();
      g.fillStyle = '#63707c';
      g.beginPath(); g.arc(cx + sx * (HW + px), y, px * 1.1, 0, TAU); g.fill();
    }
  }
  return c;
})();

/* ---------- босс-монитор «КРЕПОСТЬ» ---------- */
const sprBossMonitor = (function () {
  const u = SC, L = Math.round(46 * u), HW = Math.round(14 * u);
  const c = newCv(HW * 2 + 10, L + 8), g = c.getContext('2d');
  const cx = Math.round(c.width / 2), y0 = 4, px = Math.max(1, Math.round(u / 2));
  const hw = [];
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1); let v;
    if (t < 0.13) v = 0.44 + 0.56 * Math.pow(t / 0.13, 0.7);
    else if (t < 0.88) v = 1;
    else v = 1 - 0.22 * ((t - 0.88) / 0.12);
    hw.push(Math.max(1, Math.round(v * HW)));
  }
  for (let i = 0; i < L; i++) {
    const r = hw[i], y = y0 + i;
    g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(cx - r - 2, y + px * 2, r * 2 + 5, 1);
    g.fillStyle = '#0a0f14'; g.fillRect(cx - r - 2, y, r * 2 + 5, 1);
    g.fillStyle = '#39434b'; g.fillRect(cx - r, y, r * 2 + 1, 1);
    g.fillStyle = '#4c5860'; g.fillRect(cx - r, y, Math.max(1, Math.round(r * 0.26)), 1);
    g.fillStyle = '#20272d'; g.fillRect(cx + r - Math.round(r * 0.22), y, Math.round(r * 0.22) + 1, 1);
  }
  /* толстый броневой пояс */
  for (let i = Math.round(L * 0.10); i < L * 0.92; i++) {
    const r = hw[i], y = y0 + i;
    g.fillStyle = 'rgba(12,16,20,0.55)';
    g.fillRect(cx - r + px, y, px * 3, 1);
    g.fillRect(cx + r - px * 4, y, px * 3, 1);
  }
  /* приподнятая цитадель */
  g.fillStyle = '#0a0f14';
  g.fillRect(cx - Math.round(HW * 0.72), y0 + Math.round(L * 0.30), Math.round(HW * 1.44), Math.round(L * 0.40));
  g.fillStyle = '#4a5762';
  g.fillRect(cx - Math.round(HW * 0.66), y0 + Math.round(L * 0.315), Math.round(HW * 1.32), Math.round(L * 0.37));
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(cx - Math.round(HW * 0.66), y0 + Math.round(L * 0.315), Math.round(HW * 1.32), px);
  /* командирская башенка */
  const by = y0 + Math.round(L * 0.44);
  g.fillStyle = '#0a0f14'; g.fillRect(cx - px * 4, by, px * 8, px * 8);
  g.fillStyle = '#5c6a76'; g.fillRect(cx - px * 3.4, by + px * 0.6, px * 6.8, px * 6.8);
  g.fillStyle = '#ffb46b'; g.fillRect(cx - px * 2.6, by + px * 2, px * 5.2, px * 1.2);
  g.fillStyle = '#8b9aa5'; g.fillRect(cx - px * 0.5, by - px * 6, px, px * 6);
  g.fillStyle = '#e5484d'; g.fillRect(cx - px * 2, by - px * 6, px * 4, px);
  /* барбеты под две тяжёлые башни */
  for (const t of [-0.18, 0.16]) {
    const y = y0 + Math.round((0.5 + t) * L), br = Math.round(HW * 0.72);
    g.fillStyle = '#0a0f14'; g.beginPath(); g.arc(cx, y, br + 1, 0, TAU); g.fill();
    g.fillStyle = '#55636f'; g.beginPath(); g.arc(cx, y, br, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(cx, y + px, br * 0.8, 0, TAU); g.fill();
  }
  /* противоминные були по бортам */
  g.fillStyle = 'rgba(20,26,32,0.5)';
  g.fillRect(cx - HW - px, y0 + Math.round(L * 0.2), px * 2, Math.round(L * 0.6));
  g.fillRect(cx + HW - px, y0 + Math.round(L * 0.2), px * 2, Math.round(L * 0.6));
  /* жёлто-чёрные полосы у среза палубы */
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? '#d8b23c' : '#1a1f24';
    g.fillRect(cx - HW + px * 2 + k * Math.round(HW * 0.32), y0 + Math.round(L * 0.90), Math.round(HW * 0.30), px);
  }
  return c;
})();

/* привязка типа флагмана к рисунку: где башни и насколько они крупнее */
const BOSS_ART = {
  leviathan: { spr: () => sprBoss,        turrets: BOSS_TURRETS,  len: 64, tScale: 1.0,  r: 20 },
  carrier:   { spr: () => sprBossCarrier, turrets: [],            len: 70, tScale: 1.0,  r: 24 },
  monitor:   { spr: () => sprBossMonitor, turrets: [-0.18, 0.16], len: 46, tScale: 1.75, r: 22 }
};

/* ---------- самолёты ---------- */
function makePlane(C, sizeU) {
  const S = Math.round(sizeU * SC), c = newCv(S, S), g = c.getContext('2d');
  const u = SC, cx = S / 2, heavy = sizeU > 17;
  const lin = (x0, x1, a, b, m) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, a); if (m) gr.addColorStop(0.5, m); gr.addColorStop(1, b); return gr; };
  const edge = () => { g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = Math.max(1, u * 0.22); g.stroke(); };
  /* крылья */
  g.beginPath();
  if (heavy) {
    g.moveTo(cx - S * 0.49, S * 0.40); g.lineTo(cx + S * 0.49, S * 0.40);
    g.lineTo(cx + S * 0.47, S * 0.50); g.lineTo(cx - S * 0.47, S * 0.50);
  } else {
    g.moveTo(cx, S * 0.30); g.lineTo(cx + S * 0.47, S * 0.60); g.lineTo(cx + S * 0.45, S * 0.66);
    g.lineTo(cx, S * 0.55); g.lineTo(cx - S * 0.45, S * 0.66); g.lineTo(cx - S * 0.47, S * 0.60);
  }
  g.closePath(); g.fillStyle = lin(0, S, C.lit, shade(C.body, 0.7), C.body); g.fill(); edge();
  /* двигатели бомбардировщика */
  if (heavy) for (const sx of [-0.24, 0.24]) {
    g.fillStyle = shade(C.body, 0.8);
    rrect(g, cx + S * sx - u * 0.9, S * 0.33, u * 1.8, S * 0.22, u * 0.8); g.fill(); edge();
    g.fillStyle = 'rgba(220,235,240,0.25)';
    g.beginPath(); g.arc(cx + S * sx, S * 0.33, u * 1.6, 0, TAU); g.fill();
  }
  /* стабилизатор */
  g.beginPath();
  g.moveTo(cx, S * 0.80); g.lineTo(cx + S * 0.18, S * 0.90); g.lineTo(cx + S * 0.17, S * 0.94);
  g.lineTo(cx - S * 0.17, S * 0.94); g.lineTo(cx - S * 0.18, S * 0.90); g.closePath();
  g.fillStyle = lin(0, S, C.lit, shade(C.body, 0.7), C.body); g.fill(); edge();
  /* фюзеляж */
  g.beginPath(); g.ellipse(cx, S * 0.52, S * (heavy ? 0.075 : 0.065), S * 0.44, 0, 0, TAU);
  g.fillStyle = lin(cx - S * 0.07, cx + S * 0.07, C.lit, shade(C.body, 0.6), C.body); g.fill(); edge();
  /* фонарь кабины с бликом */
  g.beginPath(); g.ellipse(cx, S * 0.26, S * 0.035, S * 0.07, 0, 0, TAU);
  g.fillStyle = '#123448'; g.fill();
  g.fillStyle = 'rgba(160,235,255,0.8)';
  g.beginPath(); g.ellipse(cx - S * 0.012, S * 0.245, S * 0.012, S * 0.035, 0, 0, TAU); g.fill();
  /* опознавательные знаки и законцовки */
  g.fillStyle = C.acc;
  for (const sx of [-1, 1]) {
    g.beginPath(); g.arc(cx + sx * S * 0.27, heavy ? S * 0.45 : S * 0.55, u * 0.9, 0, TAU); g.fill();
  }
  g.fillRect(cx - u * 0.3, S * 0.08, u * 0.6, u * 0.8);
  if (!heavy) {
    /* винт */
    g.fillStyle = 'rgba(220,235,240,0.22)';
    g.beginPath(); g.arc(cx, S * 0.09, u * 1.8, 0, TAU); g.fill();
  }
  return c;
}
const sprPlane  = makePlane({ body: '#3a444b', lit: '#6b7a84', acc: '#e5484d' }, 15);
const sprPlaneH = makePlane({ body: '#4a3a36', lit: '#7d655d', acc: '#ffb454' }, 19);

/* ---------- авианосец «СЕВЕР» ---------- */
const sprCarrier = (function () {
  const u = SC, W = 40 * u, H = 96 * u;
  const c = newCv(W, H), g = c.getContext('2d'), cx = W / 2;
  /* корпус */
  g.beginPath();
  g.moveTo(cx, u);
  g.bezierCurveTo(cx + 9 * u, 5 * u, cx + 16 * u, 12 * u, cx + 16 * u, 22 * u);
  g.lineTo(cx + 16 * u, H - 8 * u); g.quadraticCurveTo(cx + 16 * u, H - u, cx + 11 * u, H - u);
  g.lineTo(cx - 11 * u, H - u); g.quadraticCurveTo(cx - 16 * u, H - u, cx - 16 * u, H - 8 * u);
  g.lineTo(cx - 16 * u, 22 * u);
  g.bezierCurveTo(cx - 16 * u, 12 * u, cx - 9 * u, 5 * u, cx, u);
  g.closePath();
  const hg = g.createLinearGradient(cx - 16 * u, 0, cx + 16 * u, 0);
  hg.addColorStop(0, '#7a8a95'); hg.addColorStop(0.5, '#56646e'); hg.addColorStop(1, '#343f47');
  g.fillStyle = hg; g.fill();
  g.strokeStyle = '#141b20'; g.lineWidth = Math.max(1, u * 0.4); g.stroke();
  /* полётная палуба — тёмный асфальт с зернистостью */
  g.save();
  g.beginPath();
  g.moveTo(cx - 4 * u, 6 * u); g.lineTo(cx + 5 * u, 6 * u); g.lineTo(cx + 13 * u, 22 * u);
  g.lineTo(cx + 13 * u, H - 5 * u); g.lineTo(cx - 14.5 * u, H - 5 * u); g.lineTo(cx - 14.5 * u, 22 * u);
  g.closePath();
  const dg = g.createLinearGradient(0, 0, W, 0);
  dg.addColorStop(0, '#4d5860'); dg.addColorStop(1, '#3a434a');
  g.fillStyle = dg; g.fill();
  g.clip();
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.fillRect(Math.random() * W, Math.random() * H, Math.max(1, u * 0.3), Math.max(1, u * 0.3));
  }
  /* угловая посадочная полоса */
  g.save(); g.translate(cx - 3 * u, H * 0.62); g.rotate(-0.16);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(-5 * u, -34 * u, 10 * u, 60 * u);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = Math.max(1, u * 0.3);
  g.setLineDash([3 * u, 2.4 * u]);
  g.beginPath(); g.moveTo(0, -34 * u); g.lineTo(0, 26 * u); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,220,90,0.8)';
  g.strokeRect(-5 * u, -34 * u, 10 * u, 60 * u);
  /* тросы аэрофинишёров */
  g.strokeStyle = 'rgba(20,24,28,0.8)';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-5 * u, 14 * u + k * 2.4 * u); g.lineTo(5 * u, 14 * u + k * 2.4 * u); g.stroke(); }
  g.restore();
  /* катапульты на носу */
  g.strokeStyle = 'rgba(230,236,240,0.55)'; g.lineWidth = Math.max(1, u * 0.25);
  for (const dx of [-3, 3]) { g.beginPath(); g.moveTo(cx + dx * u, 9 * u); g.lineTo(cx + dx * u, 30 * u); g.stroke(); }
  /* самолётоподъёмники */
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(cx - 14.5 * u, 40 * u, 5 * u, 7 * u); g.fillRect(cx - 14.5 * u, 58 * u, 5 * u, 7 * u);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.strokeRect(cx - 14.5 * u, 40 * u, 5 * u, 7 * u); g.strokeRect(cx - 14.5 * u, 58 * u, 5 * u, 7 * u);
  /* вертолётная площадка на корме */
  g.strokeStyle = 'rgba(255,220,90,0.8)'; g.lineWidth = Math.max(1, u * 0.3);
  g.beginPath(); g.arc(cx - 5 * u, H - 11 * u, 3.4 * u, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillRect(cx - 6.2 * u, H - 12.8 * u, 0.5 * u, 3.6 * u); g.fillRect(cx - 4.3 * u, H - 12.8 * u, 0.5 * u, 3.6 * u);
  g.fillRect(cx - 6.2 * u, H - 11.2 * u, 2.4 * u, 0.5 * u);
  g.restore();
  /* остров-надстройка по правому борту */
  block(g, cx + 8 * u, 32 * u, 6.5 * u, 20 * u, '#7f8f99', u, u);
  block(g, cx + 9 * u, 36 * u, 4.5 * u, 9 * u, '#8e9ea8', u, u * 0.6);
  g.fillStyle = '#0c1a24'; g.fillRect(cx + 8.6 * u, 33 * u, 5.3 * u, u * 0.9);
  g.fillStyle = '#9fe8ff'; g.fillRect(cx + 8.9 * u, 33.2 * u, 2.4 * u, u * 0.35);
  /* труба и мачта с радаром */
  g.fillStyle = '#2a3238'; rrect(g, cx + 9.6 * u, 46 * u, 3.4 * u, 4 * u, u * 0.6); g.fill();
  g.fillStyle = '#12171b'; g.fillRect(cx + 10.3 * u, 46.8 * u, 2 * u, 2.4 * u);
  g.strokeStyle = '#20282e'; g.lineWidth = Math.max(1, u * 0.35);
  g.beginPath(); g.moveTo(cx + 11.2 * u, 38 * u); g.lineTo(cx + 11.2 * u, 27 * u); g.stroke();
  g.beginPath(); g.moveTo(cx + 8.6 * u, 29 * u); g.lineTo(cx + 13.8 * u, 29 * u); g.stroke();
  g.fillStyle = '#dfe7ec'; g.beginPath(); g.ellipse(cx + 11.2 * u, 31.5 * u, 2 * u, 0.8 * u, 0, 0, TAU); g.fill();
  g.fillStyle = '#e5484d'; g.fillRect(cx + 10.8 * u, 26.6 * u, 0.8 * u, 0.8 * u);
  /* самолёты на стоянке */
  const jet = (x, y, a) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.moveTo(0.4 * u, -2.4 * u); g.lineTo(3 * u, 1.4 * u); g.lineTo(-2.2 * u, 1.4 * u); g.closePath(); g.fill();
    g.fillStyle = '#8796a0';
    g.beginPath(); g.moveTo(0, -3 * u); g.lineTo(2.6 * u, 1 * u); g.lineTo(0.6 * u, 1 * u); g.lineTo(0.6 * u, 2.2 * u);
    g.lineTo(-0.6 * u, 2.2 * u); g.lineTo(-0.6 * u, 1 * u); g.lineTo(-2.6 * u, 1 * u); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.18); g.stroke();
    g.fillStyle = '#123448'; g.fillRect(-0.3 * u, -1.8 * u, 0.6 * u, u);
    g.restore();
  };
  jet(cx - 11 * u, 26 * u, 0.5); jet(cx - 11 * u, 33 * u, 0.5);
  jet(cx - 11 * u, 72 * u, 0.5); jet(cx + 9 * u, 64 * u, -0.4); jet(cx + 9 * u, 71 * u, -0.4);
  return c;
})();

/* ---------- дружеский причал: 1-4 сваи с постовыми ---------- */
const sprPier = (function () {
  const u = SC, c = newCv(20 * u, 12 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(2 * u, 7.5 * u, 16 * u, 2 * u);
  /* настил */
  g.fillStyle = '#4d4130'; g.fillRect(2 * u, 3 * u, 16 * u, 4.5 * u);
  g.fillStyle = '#6b5b40'; g.fillRect(2 * u, 3 * u, 16 * u, 1.2 * u);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 1; k < 8; k++) g.fillRect((2 + k * 2) * u, 3 * u, 1, 4.5 * u);
  /* кранцы-покрышки по кромке */
  g.fillStyle = '#20262a';
  for (let k = 0; k < 5; k++) {
    g.beginPath(); g.arc((3.5 + k * 3.2) * u, 7.6 * u, u * 0.75, 0, TAU); g.fill();
  }
  /* флажок своих */
  g.fillStyle = '#8b9aa5'; g.fillRect(17 * u, 0, u * 0.5, 4 * u);
  g.fillStyle = '#4ade80'; g.fillRect(13.6 * u, 0.3 * u, 3.4 * u, 1.8 * u);
  return c;
})();

/* столб-свая: сколько свай — столько бойцов ждёт на причале */
const sprPile = (function () {
  const u = SC, c = newCv(4 * u, 8 * u), g = c.getContext('2d');
  const cx = 2 * u;
  g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(cx - u * 0.9, 6.6 * u, u * 2.4, u * 1.2);
  g.fillStyle = '#3c3324'; g.fillRect(cx - u * 0.8, u, u * 1.6, 6 * u);
  g.fillStyle = '#5f513a'; g.fillRect(cx - u * 0.8, u, u * 0.7, 6 * u);
  g.fillStyle = '#2a2418'; g.fillRect(cx - u * 0.8, u * 2.4, u * 1.6, u * 0.4);
  g.fillStyle = '#6b5b40'; g.fillRect(cx - u * 1.1, u * 0.5, u * 2.2, u * 0.7);
  return c;
})();

/* ---------- морская мина ---------- */
const sprMine = (function () {
  const u = SC, S = 12 * u, c = newCv(S, S), g = c.getContext('2d'), r = 4.4 * u;
  g.fillStyle = '#141a1f'; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.fill();
  const gr = g.createRadialGradient(S / 2 - r * 0.35, S / 2 - r * 0.35, r * 0.1, S / 2, S / 2, r);
  gr.addColorStop(0, '#6b7780'); gr.addColorStop(0.6, '#39434b'); gr.addColorStop(1, '#212930');
  g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, r - Math.max(1, u * 0.35), 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath(); g.arc(S / 2 - r * 0.35, S / 2 - r * 0.35, r * 0.22, 0, TAU); g.fill();
  /* рожки-взрыватели */
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    g.fillStyle = '#141a1f';
    g.save(); g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.rotate(a);
    g.fillRect(0, -u * 0.35, u * 1.4, u * 0.7);
    g.restore();
  }
  return c;
})();

/* ---------- ящик снабжения ---------- */
const sprCrate = (function () {
  const u = SC, c = newCv(11 * u, 10 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1.2 * u, 7.6 * u, 9.4 * u, 2.2 * u, u); g.fill();
  /* боковина */
  const fg = g.createLinearGradient(0, 3 * u, 0, 9 * u);
  fg.addColorStop(0, '#8a6238'); fg.addColorStop(1, '#5e4024');
  g.fillStyle = fg; g.fillRect(0.5 * u, 3.4 * u, 9.6 * u, 5.4 * u);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 1; k < 3; k++) g.fillRect(0.5 * u, (3.4 + k * 1.8) * u, 9.6 * u, Math.max(1, u * 0.2));
  /* крышка */
  const tg = g.createLinearGradient(0, 0.5 * u, 0, 3.4 * u);
  tg.addColorStop(0, '#c9975a'); tg.addColorStop(1, '#a87a46');
  g.fillStyle = tg; g.fillRect(0.5 * u, 0.6 * u, 9.6 * u, 2.8 * u);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.25);
  g.strokeRect(0.5 * u, 0.6 * u, 9.6 * u, 8.2 * u);
  g.beginPath(); g.moveTo(0.5 * u, 3.4 * u); g.lineTo(10.1 * u, 3.4 * u); g.stroke();
  /* металлические уголки и маркировка */
  g.fillStyle = '#39434b';
  for (const [x, y] of [[0.5, 0.6], [9.1, 0.6], [0.5, 7.8], [9.1, 7.8]]) g.fillRect(x * u, y * u, u, u);
  g.fillStyle = '#ffd94a'; g.fillRect(3.2 * u, 5 * u, 4.2 * u, 1.2 * u);
  g.fillStyle = '#2a1c10'; g.fillRect(4.6 * u, 5.2 * u, 1.4 * u, 0.8 * u);
  return c;
})();

/* ---------- РЛС-вышка ---------- */
const sprTower = (function () {
  const u = SC, c = newCv(15 * u, 21 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 2 * u, 18.6 * u, 11 * u, 2.2 * u, u); g.fill();
  /* аппаратная у основания */
  block(g, 3 * u, 14 * u, 9 * u, 5.4 * u, '#5d6b74', u, u * 0.5);
  g.fillStyle = '#1a2228'; g.fillRect(4.2 * u, 16.4 * u, 1.8 * u, 2.4 * u);
  g.fillStyle = '#7fd4e0'; g.fillRect(8 * u, 16 * u, 2.6 * u, 0.8 * u);
  /* ферма: две стойки и раскосы */
  g.strokeStyle = '#3a454d'; g.lineWidth = Math.max(1, u * 0.45);
  g.beginPath(); g.moveTo(5.8 * u, 14 * u); g.lineTo(6.8 * u, 3 * u); g.moveTo(9.2 * u, 14 * u); g.lineTo(8.2 * u, 3 * u); g.stroke();
  g.strokeStyle = '#6f7d86'; g.lineWidth = Math.max(1, u * 0.25);
  for (let k = 0; k < 5; k++) {
    const y1 = (13.6 - k * 2.1) * u, y2 = y1 - 2.1 * u;
    g.beginPath(); g.moveTo(5.9 * u + k * 0.18 * u, y1); g.lineTo(9.1 * u - (k + 1) * 0.18 * u, y2);
    g.moveTo(9.1 * u - k * 0.18 * u, y1); g.lineTo(5.9 * u + (k + 1) * 0.18 * u, y2); g.stroke();
  }
  /* площадка под антенной */
  g.fillStyle = '#2a3238'; rrect(g, 4.4 * u, 2.2 * u, 6.2 * u, 1.4 * u, u * 0.4); g.fill();
  g.fillStyle = '#8b9aa5'; g.fillRect(4.6 * u, 2.3 * u, 5.8 * u, u * 0.35);
  return c;
})();

/* ---------- бункер ---------- */
const sprBunker = (function () {
  const u = SC, c = newCv(15 * u, 14 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1 * u, 9.8 * u, 13 * u, 3.4 * u, u); g.fill();
  /* стенка */
  const wg = g.createLinearGradient(0, 6 * u, 0, 11 * u);
  wg.addColorStop(0, '#6b767d'); wg.addColorStop(1, '#434d54');
  g.fillStyle = wg; rrect(g, 1.2 * u, 5.6 * u, 12.6 * u, 5 * u, u * 0.6); g.fill();
  /* плита-крыша */
  const rg = g.createLinearGradient(0, 1.5 * u, 0, 6 * u);
  rg.addColorStop(0, '#a6b0b5'); rg.addColorStop(1, '#7f8a90');
  g.fillStyle = rg; rrect(g, 0.8 * u, 1.6 * u, 13.4 * u, 4.6 * u, u * 1.4); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, u * 0.25); g.stroke();
  /* пятна маскировки */
  const spots = [[3, 3, '#5d6b4e'], [8.5, 2.6, '#6b5d45'], [11, 4, '#5d6b4e'], [6, 4.4, '#6b5d45']];
  for (const [x, y, col] of spots) { g.fillStyle = col; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x * u, y * u, 1.6 * u, 0.8 * u, 0.3, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  /* амбразура с бликом */
  g.fillStyle = '#0d1216'; rrect(g, 3.2 * u, 7 * u, 8.6 * u, 1.5 * u, u * 0.4); g.fill();
  g.fillStyle = 'rgba(255,200,120,0.35)'; g.fillRect(4 * u, 7.3 * u, 2 * u, u * 0.3);
  /* мешки с песком */
  for (let k = 0; k < 6; k++) {
    const x = (1.8 + k * 2.3) * u, y = 10.8 * u;
    const sg = g.createLinearGradient(0, y - u, 0, y + u);
    sg.addColorStop(0, '#b4a36a'); sg.addColorStop(1, '#7d6f45');
    g.fillStyle = sg; g.beginPath(); g.ellipse(x, y, 1.3 * u, 0.85 * u, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, u * 0.18); g.stroke();
  }
  return c;
})();

/* ---------- командная база ---------- */
const sprBase = (function () {
  const u = SC, c = newCv(26 * u, 22 * u), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.32)'; rrect(g, 1.5 * u, 17 * u, 24 * u, 4.4 * u, u); g.fill();
  /* фасад */
  const fg = g.createLinearGradient(0, 12 * u, 0, 18 * u);
  fg.addColorStop(0, '#5b666d'); fg.addColorStop(1, '#3b454b');
  g.fillStyle = fg; g.fillRect(1 * u, 12.5 * u, 24 * u, 5.6 * u);
  /* окна со светом */
  for (let k = 0; k < 5; k++) {
    g.fillStyle = '#0c1a24'; g.fillRect((3 + k * 3.2) * u, 13.6 * u, 2 * u, 1.6 * u);
    g.fillStyle = k % 2 ? 'rgba(255,214,130,0.85)' : 'rgba(160,220,240,0.6)';
    g.fillRect((3.2 + k * 3.2) * u, 13.8 * u, 1.6 * u, 0.6 * u);
  }
  /* ворота */
  g.fillStyle = '#20282e'; g.fillRect(19 * u, 13.2 * u, 4.6 * u, 4.9 * u);
  g.fillStyle = 'rgba(255,255,255,0.1)';
  for (let k = 0; k < 4; k++) g.fillRect(19 * u, (13.8 + k * 1.1) * u, 4.6 * u, Math.max(1, u * 0.2));
  /* предупредительная полоса по низу */
  for (let k = 0; k < 12; k++) {
    g.fillStyle = k % 2 ? '#e5c04a' : '#23292e';
    g.fillRect((1 + k * 2) * u, 17.4 * u, 2 * u, 0.7 * u);
  }
  /* крыша */
  const rg = g.createLinearGradient(0, 2 * u, 0, 12.5 * u);
  rg.addColorStop(0, '#aab5bb'); rg.addColorStop(1, '#838f96');
  g.fillStyle = rg; g.fillRect(1 * u, 2 * u, 24 * u, 10.6 * u);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, u * 0.3);
  g.strokeRect(1 * u, 2 * u, 24 * u, 16.1 * u);
  g.beginPath(); g.moveTo(1 * u, 12.6 * u); g.lineTo(25 * u, 12.6 * u); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(1.3 * u, 2.3 * u, 23.4 * u, u * 0.4);
  /* вертолётная площадка */
  g.strokeStyle = 'rgba(255,220,90,0.85)'; g.lineWidth = Math.max(1, u * 0.35);
  g.beginPath(); g.arc(8 * u, 7.2 * u, 3.4 * u, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(6.9 * u, 5.6 * u, 0.5 * u, 3.2 * u); g.fillRect(8.6 * u, 5.6 * u, 0.5 * u, 3.2 * u);
  g.fillRect(6.9 * u, 7 * u, 2.2 * u, 0.45 * u);
  /* вентиляторы и кондиционеры */
  for (const [x, y] of [[15, 4.2], [15, 8]]) {
    block(g, x * u, y * u, 3.4 * u, 2.8 * u, '#6d7a82', u, u * 0.3);
    g.strokeStyle = '#20282e'; g.lineWidth = Math.max(1, u * 0.2);
    g.beginPath(); g.arc((x + 1.7) * u, (y + 1.4) * u, 1 * u, 0, TAU); g.stroke();
  }
  block(g, 19.6 * u, 4.4 * u, 4 * u, 5.4 * u, '#56636b', u, u * 0.4);
  return c;
})();

/* ---------- маяк противника (ночные операции) ---------- */
const sprLighthouse = (function () {
  const u = SC, c = newCv(13 * u, 24 * u), g = c.getContext('2d');
  const cx = 6.5 * u;
  g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1.6 * u, 20.8 * u, 10 * u, 2.8 * u, u); g.fill();
  /* домик смотрителя у основания */
  block(g, 1 * u, 17.4 * u, 11 * u, 4 * u, '#c9c2b3', u, u * 0.5);
  g.fillStyle = '#8a3a2f'; g.fillRect(1 * u, 17.4 * u, 11 * u, 1.2 * u);
  /* ствол: конус с полосами, светлый слева */
  const top = 4.6 * u, bot = 18.6 * u, wT = 3 * u, wB = 4.8 * u;
  g.save();
  g.beginPath();
  g.moveTo(cx - wT / 2, top); g.lineTo(cx + wT / 2, top); g.lineTo(cx + wB / 2, bot); g.lineTo(cx - wB / 2, bot);
  g.closePath(); g.clip();
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? '#e8edf0' : '#c8393f';
    g.fillRect(0, top + i * (bot - top) / 7, 13 * u, (bot - top) / 7 + 1);
  }
  const sg = g.createLinearGradient(cx - wB / 2, 0, cx + wB / 2, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0.25)'); sg.addColorStop(0.45, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = sg; g.fillRect(0, 0, 13 * u, 24 * u);
  g.restore();
  /* галерея, фонарь и купол */
  g.fillStyle = '#23292e'; g.beginPath(); g.ellipse(cx, 4.6 * u, 3.2 * u, 1 * u, 0, 0, TAU); g.fill();
  g.fillStyle = '#39454e'; g.fillRect(cx - 1.8 * u, 1.8 * u, 3.6 * u, 2.8 * u);
  g.fillStyle = '#ffe9a3'; g.fillRect(cx - 1.3 * u, 2.2 * u, 2.6 * u, 2 * u);
  g.fillStyle = '#8a3a2f'; g.beginPath(); g.ellipse(cx, 1.8 * u, 2.2 * u, 1 * u, 0, Math.PI, TAU); g.fill();
  g.fillStyle = '#23292e'; g.fillRect(cx - 0.3 * u, 0.2 * u, 0.6 * u, 0.9 * u);
  return c;
})();

/* бойцы и все остальные люди — процедурная анимация в people.js */

/* ============================================================
   Растительность.
   makeVeg возвращает набор вариантов по видам; мир расставляет их
   рощами: ближе к берегу — пальмы и кусты, в глубине — крупные кроны.
   ============================================================ */
function makeVeg(pal) {
  const u = SC;
  /* палитра листвы: от глубокой тени до блика */
  const L = {
    d2: shade(pal.treeD, 0.72),
    d : pal.treeD,
    m : pal.tree,
    l : shade(pal.tree, 1.28),
    l2: shade(pal.tree, 1.55)
  };
  const cvU = (wu, hu) => newCv(wu * u, hu * u);
  const blob = (g, x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const shadowAt = (g, x, y, rx, ry, a) => {
    g.fillStyle = 'rgba(0,0,0,' + (a === undefined ? 0.26 : a) + ')';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  };
  /* многоярусная крона */
  const canopy = (g, cx, cy, r, lobes, seed) => {
    for (let i = 0; i < lobes; i++) {
      const a = i / lobes * TAU + seed;
      blob(g, cx + Math.cos(a) * r * 0.34, cy + Math.sin(a) * r * 0.30, r * 0.60, L.d2);
    }
    blob(g, cx, cy, r * 0.80, L.d2);
    for (let i = 0; i < lobes; i++) {
      const a = i / lobes * TAU + seed + 0.6;
      blob(g, cx + Math.cos(a) * r * 0.30, cy + Math.sin(a) * r * 0.26, r * 0.52, L.d);
    }
    for (let i = 0; i < lobes; i++) {
      const a = i / lobes * TAU + seed + 1.2;
      blob(g, cx + Math.cos(a) * r * 0.24 - r * 0.10, cy + Math.sin(a) * r * 0.20 - r * 0.14, r * 0.42, L.m);
    }
    blob(g, cx - r * 0.28, cy - r * 0.32, r * 0.34, L.l);
    blob(g, cx - r * 0.12, cy - r * 0.44, r * 0.18, L.l2);
    /* отдельные листья по кромке кроны */
    for (let i = 0; i < 16; i++) {
      const a = rr(0, TAU), d = rr(0.55, 0.98) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * rr(0.09, 0.17),
           chance(0.55) ? L.d : L.m);
    }
  };

  const V = { palm: [], broad: [], big: [], bush: [], fern: [], tuft: [], dead: [], flower: [] };

  /* ---- пальмы ---- */
  for (let v = 0; v < 3; v++) {
    const W = 13, H = 14, c = cvU(W, H), g = c.getContext('2d');
    const bx = W * u * 0.5, by = H * u * 0.92;
    const lean = rr(-1.6, 1.6) * u, crownY = H * u * 0.30;
    shadowAt(g, bx + u * 0.6, by - u * 0.4, u * 2.4, u * 1.0);
    /* ствол сегментами, с наклоном */
    const seg = 9;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const x = bx + lean * t * t, y = by - (by - crownY) * t;
      const w = u * (1.15 - 0.35 * t);
      g.fillStyle = i % 2 ? pal.trunk : pal.trunkD;
      g.fillRect(x - w / 2, y - u * 0.55, w, u * 0.75);
    }
    /* кокосы */
    for (let i = 0; i < 3; i++)
      blob(g, bx + lean + rr(-1, 1) * u, crownY + rr(0, 1) * u, u * 0.45, pal.trunkD);
    /* листья */
    const nf = 7 + (v % 2);
    for (let i = 0; i < nf; i++) {
      const a = i / nf * TAU + rr(-0.15, 0.15);
      const len = u * rr(3.6, 5.4), dr = u * rr(0.8, 1.6);
      const cx0 = bx + lean, cy0 = crownY;
      const mx = cx0 + Math.cos(a) * len * 0.55, my = cy0 + Math.sin(a) * len * 0.45 - dr * 0.5;
      const ex = cx0 + Math.cos(a) * len,        ey = cy0 + Math.sin(a) * len * 0.8 + dr;
      g.lineCap = 'round';
      g.strokeStyle = L.d2; g.lineWidth = u * 1.15;
      g.beginPath(); g.moveTo(cx0, cy0); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      g.strokeStyle = chance(0.5) ? L.m : L.d; g.lineWidth = u * 0.62;
      g.beginPath(); g.moveTo(cx0, cy0); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      /* зубцы листа */
      g.strokeStyle = L.d; g.lineWidth = u * 0.3;
      for (let k = 1; k <= 2; k++) {
        const t = k / 3;
        const px2 = lerp(lerp(cx0, mx, t), lerp(mx, ex, t), t);
        const py2 = lerp(lerp(cy0, my, t), lerp(my, ey, t), t);
        g.beginPath(); g.moveTo(px2, py2);
        g.lineTo(px2 + Math.cos(a + 1.4) * u * 0.9, py2 + Math.sin(a + 1.4) * u * 0.7);
        g.stroke();
      }
    }
    blob(g, bx + lean, crownY, u * 0.7, L.l);
    V.palm.push(c);
  }

  /* ---- широколиственные ---- */
  for (let v = 0; v < 4; v++) {
    const W = 9 + v * 0.6, H = 10 + v * 0.6, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.92, cy = H * u * 0.42, r = u * (2.6 + v * 0.35);
    shadowAt(g, cx + u * 0.5, base - u * 0.5, r * 0.85, r * 0.40);
    g.fillStyle = pal.trunkD; g.fillRect(cx - u * 0.4, cy, u * 0.8, base - cy);
    g.fillStyle = pal.trunk;  g.fillRect(cx - u * 0.4, cy, u * 0.35, base - cy);
    canopy(g, cx, cy, r, 3 + (v % 3), v * 1.7);
    V.broad.push(c);
  }

  /* ---- крупные деревья верхнего яруса ---- */
  for (let v = 0; v < 3; v++) {
    const W = 15, H = 16, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.94, cy = H * u * 0.40, r = u * (4.4 + v * 0.5);
    shadowAt(g, cx + u * 0.8, base - u * 0.6, r * 0.95, r * 0.42, 0.30);
    /* ствол с подпорными корнями */
    g.fillStyle = pal.trunkD;
    g.fillRect(cx - u * 0.75, cy, u * 1.5, base - cy);
    g.beginPath();
    g.moveTo(cx - u * 2.0, base); g.lineTo(cx - u * 0.75, base - u * 2.4);
    g.lineTo(cx + u * 0.75, base - u * 2.4); g.lineTo(cx + u * 2.0, base);
    g.closePath(); g.fill();
    g.fillStyle = pal.trunk; g.fillRect(cx - u * 0.75, cy, u * 0.55, base - cy);
    /* три яруса кроны */
    canopy(g, cx - r * 0.32, cy + r * 0.16, r * 0.66, 3, v);
    canopy(g, cx + r * 0.34, cy + r * 0.10, r * 0.62, 3, v + 2);
    canopy(g, cx, cy - r * 0.22, r * 0.80, 4, v + 4);
    V.big.push(c);
  }

  /* ---- кусты ---- */
  for (let v = 0; v < 4; v++) {
    const W = 7, H = 6, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, cy = H * u * 0.55, r = u * (1.5 + v * 0.22);
    shadowAt(g, cx + u * 0.3, H * u * 0.86, r * 1.05, r * 0.42, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = rr(0, TAU), d = rr(0, 0.7) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r * rr(0.62, 0.90), L.d2);
    }
    for (let i = 0; i < 3; i++) {
      const a = rr(0, TAU), d = rr(0, 0.6) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7 - r * 0.15, r * rr(0.45, 0.68), L.d);
    }
    blob(g, cx - r * 0.25, cy - r * 0.35, r * 0.42, L.m);
    blob(g, cx - r * 0.35, cy - r * 0.45, r * 0.20, L.l);
    V.bush.push(c);
  }

  /* ---- цветущие кусты ---- */
  for (let v = 0; v < 3; v++) {
    const W = 7, H = 6, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, cy = H * u * 0.55, r = u * 1.7;
    shadowAt(g, cx + u * 0.3, H * u * 0.86, r * 1.05, r * 0.42, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = rr(0, TAU), d = rr(0, 0.7) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r * rr(0.60, 0.88), L.d);
    }
    blob(g, cx - r * 0.25, cy - r * 0.30, r * 0.45, L.m);
    const fc = pal.flowers[v % pal.flowers.length];
    for (let i = 0; i < 7; i++) {
      const a = rr(0, TAU), d = rr(0.15, 0.85) * r;
      blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, u * 0.34, fc);
    }
    V.flower.push(c);
  }

  /* ---- папоротники ---- */
  for (let v = 0; v < 3; v++) {
    const W = 7, H = 7, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.85;
    shadowAt(g, cx + u * 0.2, base, u * 1.6, u * 0.5, 0.18);
    const nf = 6 + v;
    g.lineCap = 'round';
    for (let i = 0; i < nf; i++) {
      const a = -Math.PI / 2 + (i / (nf - 1) - 0.5) * 2.5;
      const len = u * rr(2.0, 3.0);
      const ex = cx + Math.cos(a) * len, ey = base + Math.sin(a) * len * 0.85;
      g.strokeStyle = L.d; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(cx, base);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, base + Math.sin(a) * len * 0.75, ex, ey);
      g.stroke();
      g.strokeStyle = L.m; g.lineWidth = u * 0.28;
      g.beginPath(); g.moveTo(cx, base);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, base + Math.sin(a) * len * 0.75, ex, ey);
      g.stroke();
    }
    V.fern.push(c);
  }

  /* ---- пучки травы ---- */
  for (let v = 0; v < 4; v++) {
    const W = 5, H = 4, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.86;
    g.lineCap = 'round';
    for (let i = 0; i < 4 + v; i++) {
      const a = -Math.PI / 2 + rr(-0.8, 0.8), len = u * rr(1.1, 1.9);
      g.strokeStyle = chance(0.5) ? L.d : L.m; g.lineWidth = u * 0.32;
      g.beginPath(); g.moveTo(cx + rr(-0.6, 0.6) * u, base);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, base + Math.sin(a) * len * 0.7,
                         cx + Math.cos(a) * len, base + Math.sin(a) * len * 0.9);
      g.stroke();
    }
    V.tuft.push(c);
  }

  /* ---- сухие деревья ---- */
  for (let v = 0; v < 3; v++) {
    const W = 9, H = 11, c = cvU(W, H), g = c.getContext('2d');
    const cx = W * u * 0.5, base = H * u * 0.94, top = H * u * 0.22;
    shadowAt(g, cx + u * 0.6, base - u * 0.4, u * 1.8, u * 0.7, 0.22);
    g.lineCap = 'round';
    g.strokeStyle = pal.trunkD; g.lineWidth = u * 0.9;
    g.beginPath(); g.moveTo(cx, base); g.lineTo(cx + rr(-0.6, 0.6) * u, top); g.stroke();
    g.strokeStyle = pal.dead; g.lineWidth = u * 0.45;
    for (let i = 0; i < 5; i++) {
      const t = rr(0.15, 0.8), y = lerp(base, top, t);
      const dir = chance(0.5) ? 1 : -1;
      g.beginPath(); g.moveTo(cx, y);
      g.lineTo(cx + dir * u * rr(1.4, 2.6), y - u * rr(1.0, 2.2));
      g.stroke();
    }
    V.dead.push(c);
  }

  return V;
}

/* ---------- камни ---------- */
function makeRocks(pal) {
  const u = SC, out = [];
  for (let v = 0; v < 3; v++) {
    const S = Math.round(7 * u), c = newCv(S, S), g = c.getContext('2d');
    const cx = S / 2, cy = S / 2, r = (1.5 + v * 0.4) * u;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(cx + u * 0.3, cy + r * 0.6, r, r * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = pal.rockD;
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, rr2 = r * (0.75 + h1(k + v * 3) * 0.5);
      const x = cx + Math.cos(a) * rr2, y = cy + Math.sin(a) * rr2 * 0.8;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill();
    g.fillStyle = pal.rock;
    g.beginPath(); g.ellipse(cx - r * 0.2, cy - r * 0.25, r * 0.55, r * 0.4, 0, 0, TAU); g.fill();
    out.push(c);
  }
  return out;
}

/* ===== src/gfx/people.js ===== */
;
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

/* ===== src/gfx/fx.js ===== */
;
'use strict';
/* ============================================================
   fx.js — частицы, свет, взрывы, всплывающие числа и сообщения
   ============================================================ */

/* при высокой плотности пикселей частиц нужно больше, а размер — мельче */
const MAX_PARTS = 1500;

function addP(o) {
  parts.push(Object.assign({
    life: 0.6, max: 0.6, size: 0.75, col: '#fff',
    vx: 0, vy: 0, g: 0, drag: 0, spin: 0, rot: 0,
    layer: 1, type: 'px', r: 6
  }, o));
  if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
}

/* точечный источник света для аддитивного слоя */
function addLight(x, y, r, col, life) {
  lights.push({ x, y, r, col: col || '#ffc46b', life: life || 0.25, max: life || 0.25 });
  if (lights.length > 120) lights.shift();
}

function updParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.g) p.vy += p.g * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    if (p.spin) p.rot += p.spin * dt;
    if (p.type === 'smoke') { p.vy -= 6 * dt; p.vx *= 0.98; }
  }
  for (let i = lights.length - 1; i >= 0; i--) {
    lights[i].life -= dt;
    if (lights[i].life <= 0) lights.splice(i, 1);
  }
}

/* ---------- взрыв ---------- */
function boom(x, y, pow, cols) {
  pow = pow || 1;
  cols = cols || ['#fff2c0', '#ffd94a', '#ffb454', '#ff6b3d', '#e5484d'];

  /* вспышка не больше катера: у мощных взрывов она заливала пол-экрана белым */
  addP({ x, y, life: 0.14, max: 0.14, type: 'flash', size: Math.min(12, 10 * pow) });
  addP({ x, y, life: 0.42, max: 0.42, type: 'ring',  r: 17 * pow, col: '#ffe9b0' });
  addP({ x, y, life: 0.55, max: 0.55, type: 'ring',  r: 28 * pow, col: 'rgba(255,255,255,0.5)' });
  addP({ x, y, life: 0.30, max: 0.30, type: 'fire',  size: 6 * pow });

  const n = Math.round(26 * pow);
  for (let i = 0; i < n; i++) {
    const a = rr(0, TAU), v = rr(28, 96) * pow;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4,
           life: rr(0.28, 0.62), max: 0.62, size: rr(0.4, 1.7), col: pick(cols) });
  }
  /* горящие обломки с гравитацией */
  for (let i = 0; i < Math.round(9 * pow); i++) {
    const a = rr(0, TAU), v = rr(30, 80) * pow;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 92, drag: 0.5,
           life: rr(0.6, 1.1), max: 1.1, size: rr(0.5, 1.5), col: '#ffb454', type: 'debris',
           spin: rr(-9, 9) });
  }
  /* дымовой столб */
  for (let i = 0; i < Math.round(9 * pow); i++)
    addP({ x: x + rr(-4, 4), y: y + rr(-4, 4), vx: rr(-9, 9), vy: rr(-16, -5),
           life: rr(0.9, 1.7), max: 1.7, size: rr(1.6, 4), col: '#5b666d', type: 'smoke' });

  addLight(x, y, 46 * pow, '#ffb054', 0.32 * pow);
  addShake(2.2 * pow, x, y);
  zoomPunch(0.012 * pow);
  boomGlow(x, y, pow);
  sndAt(x, y); SFX.boom(Math.min(1.4, pow));
}

/* крупный взрыв (босс, база) */
function bigBoom(x, y) {
  boom(x, y, 2.6);
  for (let k = 0; k < 4; k++) setTimeout(() => {
    if (state === 'title') return;
    boom(x + rr(-20, 20), y + rr(-20, 20), rr(0.8, 1.6));
  }, 110 + k * 130);
  flashScreen = Math.max(flashScreen, 0.55);
  freeze(0.09);
  sndAt(x, y); SFX.bigboom();
}

/* ---------- вода ---------- */
function splashFx(x, y, k) {
  k = k || 1;
  for (let i = 0; i < 18 * k; i++) {
    const a = rr(0, TAU), v = rr(12, 46) * k;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14 * k, g: 60, drag: 1.2,
           life: rr(0.25, 0.5), max: 0.5, size: rr(0.35, 1.1),
           col: chance(0.5) ? '#dffaff' : '#7fd4e0' });
  }
  addP({ x, y, life: 0.34, max: 0.34, type: 'ring', r: 10 * k, col: '#cdf3f8' });
  if (k >= 0.6) splashColumn(x, y, k);
  sndAt(x, y); SFX.splash();
}

/* кильватерный след: пенная точка, живёт долго */
function addWake(x, y, ang, strength) {
  wakes.push({ x, y, ang, life: 1.5, max: 1.5, w: strength });
  if (wakes.length > 460) wakes.shift();
}
function updWakes(dt) {
  for (let i = wakes.length - 1; i >= 0; i--) {
    const w = wakes[i]; w.life -= dt;
    if (w.life <= 0) wakes.splice(i, 1);
  }
}

/* ---------- дульная вспышка ---------- */
function muzzle(x, y, ang, k) {
  k = k || 1;
  addP({ x, y, life: 0.08, max: 0.08, type: 'flash', size: 5 * k });
  addP({ x, y, life: 0.1, max: 0.1, type: 'glow', size: 10 * k, col: GLOW.hot });
  for (let i = 0; i < 7; i++)
    addP({ x, y, vx: Math.cos(ang) * rr(40, 110) + rr(-20, 20), vy: Math.sin(ang) * rr(40, 110) + rr(-20, 20),
           life: 0.13, max: 0.13, size: rr(0.35, 0.8), col: '#ffe9a3', drag: 3 });
  for (let i = 0; i < 2; i++)
    addP({ x: x + Math.cos(ang) * 3, y: y + Math.sin(ang) * 3, vx: rr(-8, 8), vy: rr(-10, 0),
           life: 0.45, max: 0.45, size: 1.3, col: '#6a7680', type: 'smoke' });
  addLight(x, y, 22 * k, '#ffd08a', 0.09);
}

/* ---------- текст ---------- */
function addFloat(x, y, txtStr, col) {
  floats.push({ x, y, txt: txtStr, col: col || '#ffd94a', life: 1.3, max: 1.3, vy: -13 });
}
function updFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

function msg(text, col, dur, delay) {
  msgs.push({ text, col: col || '#ffd94a', dur: dur === undefined ? 3 : dur, delay: delay || 0, age: 0 });
}
function updMsgs(dt) {
  for (const m of msgs) m.age += dt;
  msgs = msgs.filter(m => m.age < m.delay + m.dur + 0.5);
}

/* ---------- награда и комбо ---------- */
/* Кредиты и очки живут на разных шкалах: очки остаются «аркадно»
   большими, а кредиты намеренно скупы — от них зависит темп прокачки. */
const comboMul = () => 1 + Math.min(ECON.comboMax, combo) * ECON.comboStep;

function reward(n, x, y, col) {
  const mult = comboMul();
  const cash = Math.round(n * mult * diff().cash * ECON.levelMul(level) * metaCashMul());
  money += cash;
  score += Math.round(n * mult * ECON.scoreMul);
  if (x !== undefined) addFloat(x, y, T('fCredits', cash), col);
}
function bumpCombo() {
  combo++; comboT = 4.0;
  if (combo > comboBest) comboBest = combo;
  if (combo >= 2) {
    SFX.combo(combo);
    if (player) addFloat(player.x, player.y - 18, 'x' + comboMul().toFixed(2), '#ff9ad5');
  }
}
function updCombo(dt) {
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
}

/* ===== src/gfx/weather.js ===== */
;
'use strict';
/* ============================================================
   weather.js — дождь, туман, дымка, молнии, освещение сцены
   ============================================================ */

let rainDrops = [], rainSplash = [], lightT = 0, lightFlash = 0, fogOff = 0;
let WEA = {};

function initWeather(cfg) {
  WEA = cfg.weather || {};
  rainDrops = []; rainSplash = []; lightFlash = 0;
  lightT = rr(6, 14);
  const n = Math.round((WEA.rain || 0) * 460);
  for (let i = 0; i < n; i++)
    rainDrops.push({ x: rr(0, VW), y: rr(0, VH), v: rr(430, 660), len: rr(4, 12),
                     a: rr(0.14, 0.42), w: rr(0.28, 0.6) });
}

function updWeather(dt) {
  const wind = (WEA.wind || 0) * 260;
  for (const d of rainDrops) {
    d.y += d.v * dt; d.x += wind * dt;
    if (d.y > VH) {
      d.y = -6; d.x = rr(-40, VW + 40);
      if (chance(0.35)) rainSplash.push({ x: d.x, y: rr(0, VH), life: 0.22 });
    }
    if (d.x < -40) d.x += VW + 80; else if (d.x > VW + 40) d.x -= VW + 80;
  }
  for (let i = rainSplash.length - 1; i >= 0; i--) {
    rainSplash[i].life -= dt;
    if (rainSplash[i].life <= 0) rainSplash.splice(i, 1);
  }
  if (WEA.lightning) {
    lightT -= dt;
    if (lightT <= 0) {
      lightT = rr(7, 18);
      lightFlash = 0.42;
      SFX.thunder();
    }
  }
  if (lightFlash > 0) lightFlash -= dt * 1.6;
  fogOff += dt * 8;
}

/* дождь и брызги — поверх сцены, но под интерфейсом */
function drawRain() {
  if (!rainDrops.length) return;
  const wind = (WEA.wind || 0);
  for (const d of rainDrops) {
    ctx.lineWidth = d.w;
    ctx.strokeStyle = 'rgba(190,225,240,' + d.a.toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + wind * d.len * 0.9, d.y + d.len);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (const s of rainSplash) {
    const k = s.life / 0.22;
    ctx.strokeStyle = 'rgba(210,240,250,' + (0.30 * k).toFixed(3) + ')';
    ctx.lineWidth = D;
    ctx.beginPath(); ctx.arc(s.x, s.y, (1 - k) * 2 + 0.4, 0, TAU); ctx.stroke();
  }
}

/* туман: две ползущие полосы шума */
function drawFog() {
  const f = WEA.fog || 0;
  if (!f) return;
  for (let layer = 0; layer < 2; layer++) {
    const sp = layer ? 0.55 : 1.0, off = fogOff * sp;
    for (let i = 0; i < 40; i++) {
      const y = (h1(i * 7.3 + layer * 31) * VH + off * 0.35) % VH;
      const x = (h1(i * 3.1 + layer * 17) * VW + off) % (VW + 120) - 60;
      const w = 60 + h1(i * 9.7 + layer) * 110;
      ctx.fillStyle = 'rgba(190,210,220,' + (f * 0.10).toFixed(3) + ')';
      ctx.fillRect(x, y, w, 10 + (i % 3) * 6);
    }
  }
  ctx.fillStyle = 'rgba(178,198,210,' + (f * 0.16).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
}

/* дымка (тепловая мгла) — лёгкий цветной налёт */
function drawHaze() {
  const h = WEA.haze || 0;
  if (!h) return;
  ctx.fillStyle = 'rgba(255,168,120,' + (h * 0.5).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
}

/* ---------- слой света ---------- */
/* Затемняем кадр по ambient уровня и «прожигаем» дыры источниками света. */
function drawLighting() {
  const amb = curCfg.ambient || 0;
  if (amb <= 0.01 && lights.length === 0 && lightFlash <= 0) return;

  if (amb > 0.01) {
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, VW, VH);
    const nightTint = curCfg.biome === 'ash' ? '10,18,30' : '8,14,26';
    lightCtx.fillStyle = 'rgba(' + nightTint + ',' + amb.toFixed(3) + ')';
    lightCtx.fillRect(0, 0, VW, VH);

    lightCtx.globalCompositeOperation = 'destination-out';
    const z = cam.z;
    const punch = (wx, wy, r, str) => {
      const sx = (wx - ox) * z, sy = (wy - oy) * z, R = r * z;
      if (sx < -R || sx > VW + R || sy < -R || sy > VH + R) return;
      const gr = lightCtx.createRadialGradient(sx, sy, 0, sx, sy, R);
      gr.addColorStop(0, 'rgba(0,0,0,' + str + ')');
      gr.addColorStop(0.55, 'rgba(0,0,0,' + str * 0.55 + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lightCtx.fillStyle = gr;
      lightCtx.beginPath(); lightCtx.arc(sx, sy, R, 0, TAU); lightCtx.fill();
    };
    if (player && !player.dead) punch(player.x, player.y, 96, 0.9);
    punch(CARR.x, CARR.y, 150, 0.85);
    for (const s of structs) if (!s.dead) punch(s.x, s.y, s.type === 'base' ? 78 : 46, 0.55);
    for (const e of enemies) punch(e.x, e.y, 40, 0.4);
    if (boss) punch(boss.x, boss.y, 110, 0.6);
    for (const l of lights) punch(l.x, l.y, l.r, 0.95 * (l.life / l.max));
    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0, VW, VH);
  }

  /* аддитивное свечение источников */
  ctx.globalCompositeOperation = 'lighter';
  const z = cam.z;
  for (const l of lights) {
    const t = l.life / l.max;
    const sx = (l.x - ox) * z, sy = (l.y - oy) * z, R = l.r * z * (0.6 + 0.4 * t);
    if (sx < -R || sx > VW + R || sy < -R || sy > VH + R) continue;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    gr.addColorStop(0, 'rgba(255,205,140,' + (0.42 * t).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  /* вспышка молнии */
  if (lightFlash > 0) {
    const a = Math.min(0.55, lightFlash) * (chance(0.5) ? 1 : 0.55);
    ctx.fillStyle = 'rgba(206,230,255,' + a.toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}

/* ===== src/gfx/depth.js ===== */
;
'use strict';
/* ============================================================
   depth.js — псевдо-3D поверх плоской сцены.

   Приёмы дешёвые, всё тяжёлое готовится один раз:
   • корабли «стопкой спрайтов»: затемнённый силуэт корпуса
     повторяется со сдвигом вверх на физический пиксель — получается
     борт настоящей высоты, который виден при любом развороте;
     сверху кладётся сама палуба, на воду падает тень;
   • у построек и самолётов — тени, отброшенные солнцем;
   • облака с параллаксом: висят выше камеры и плывут быстрее
     моря, а их тени скользят по воде и кораблям.
   Слоёв борта ровно столько, сколько физических пикселей в его
   высоте, поэтому на низком качестве графики их меньше сами собой.
   ============================================================ */

/* солнце слева сверху: тень уходит вправо-вниз на единицу высоты */
const SUN = { x: 0.62, y: 0.78 };

/* высота борта (в единицах мира) для спрайтов кораблей */
sprPlayer._h = 2.4;
SHIP_SPR.patrol._h = 1.6;
SHIP_SPR.gun._h = 2.2;
SHIP_SPR.missile._h = 2.3;
SHIP_SPR.frigate._h = 3.2;
sprTransport._h = 3.4;

/* силуэт спрайта одним цветом (для тени) */
function silhouette(spr, col) {
  const c = newCv(spr.width, spr.height), g = c.getContext('2d');
  g.drawImage(spr, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
}
/* средний цвет корпуса — из непрозрачных пикселей спрайта */
function avgColor(spr) {
  try {
    const d = spr.getContext('2d').getImageData(0, 0, spr.width, spr.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (n) return [r / n, g / n, b / n];
  } catch (e) {}
  return [80, 90, 100];
}
/* Борт — ровный силуэт цвета корпуса в тени (детали палубы на нём
   дали бы рябь). Нижние слои — тёмная ватерлиния. */
function sideOf(spr) {
  if (spr._side) return spr._side;
  const [r, g, b] = avgColor(spr);
  const col = (k) => 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')';
  spr._side = silhouette(spr, col(0.62));
  spr._sideW = silhouette(spr, col(0.34));
  return spr._side;
}
const shadowOf = spr => spr._shd || (spr._shd = silhouette(spr, '#021018'));

/* Корабль: тень, борт стопкой, палуба сверху.
   ang — угол поворота спрайта (уже с +PI/2), H — высота борта. */
function drawStack(spr, x, y, ang, H, roll, alpha) {
  const w = spr.width / SC, h = spr.height / SC;
  const a0 = alpha === undefined ? 1 : alpha;
  /* тень на воде: смещена от солнца на высоту борта */
  ctx.globalAlpha = 0.30 * a0;
  ctx.save();
  ctx.translate(x + 0.6 + H * SUN.x, y + 0.8 + H * SUN.y);
  ctx.rotate(ang);
  ctx.drawImage(shadowOf(spr), -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = a0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  /* шаг «вверх по миру» в повёрнутой системе координат */
  const st = D * (SC >= 4 ? 1.5 : 1);
  const n = Math.max(1, Math.round(H / st));
  const du = -Math.sin(ang) * (H / n), dv = -Math.cos(ang) * (H / n);
  const side = sideOf(spr), water = spr._sideW;
  for (let k = 0; k < n; k++) {
    ctx.drawImage(k < n * 0.35 ? water : side, -w / 2, -h / 2, w, h);
    ctx.translate(du, dv);
  }
  if (roll) ctx.transform(1, 0, roll * 0.5, 1, 0, 0);
  ctx.drawImage(spr, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* Тень высокой постройки: силуэт «ложится» на землю вправо-вниз.
   (x, yb) — точка основания, hb — сколько спрайта выше основания. */
function drawCastShadow(spr, x, yb, hb, k) {
  const w = spr.width / SC, h = spr.height / SC;
  ctx.globalAlpha = 0.26 * (k || 1);
  ctx.save();
  ctx.translate(x, yb);
  ctx.transform(1, 0, -SUN.x * 0.9, -SUN.y * 0.55, 0, 0);
  ctx.drawImage(shadowOf(spr), -w / 2, -hb, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------- облака ---------- */
/* Бесшовная текстура мягких облаков в низком разрешении: растягивается
   со сглаживанием, поэтому стоит одну заливку шаблоном на кадр. */
let cloudCv = null, cloudShCv = null, cloudPat = null, cloudShPat = null;
const CLOUD_S = 160, CLOUD_T = 620;     /* размер текстуры, px; размер плитки на экране, ед. */

function buildClouds() {
  const S = CLOUD_S;
  cloudCv = newCv(S, S);
  const g = cloudCv.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * S, cy = rnd() * S;
    const n = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * 34, y = cy + (rnd() - 0.5) * 16, r = 7 + rnd() * 14;
      /* рисуем с переносом через края — плитка без швов */
      for (const ox2 of [-S, 0, S]) for (const oy2 of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox2, y + oy2, 0, x + ox2, y + oy2, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)');
        gr.addColorStop(0.6, 'rgba(255,255,255,0.22)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox2 - r, y + oy2 - r, r * 2, r * 2);
      }
    }
  }
  cloudShCv = silhouette(cloudCv, '#02101a');
  cloudPat = ctx.createPattern(cloudCv, 'repeat');
  cloudShPat = ctx.createPattern(cloudShCv, 'repeat');
}

/* насколько облачно: днём заметно, ночью и в тумане почти нет */
function cloudiness() {
  if (!FXQ) return 0;
  const amb = curCfg.ambient || 0, w = curCfg.weather || {};
  if (amb > 0.6) return 0;
  return clamp(0.55 + (w.rain ? 0.35 : 0) + (w.haze ? 0.1 : 0) - amb * 0.6 - (w.fog || 0), 0, 1);
}

function cloudLayer(pat, par, alpha, dx, dy) {
  const z = cam.z, T = CLOUD_T;
  const drift = tGlobal * (4 + Math.abs((WEA && WEA.wind) || 0) * 14);
  const offx = (((ox * z * par + drift + dx) % T) + T) % T;
  const offy = (((oy * z * par + drift * 0.35 + dy) % T) + T) % T;
  const k = T / CLOUD_S;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.translate(-offx, -offy);
  ctx.scale(k, k);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, (VW + T) / k, (VH + T) / k);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
}

/* тени облаков лежат на воде (параллакс 1), сами облака выше (1.35) */
function drawCloudShadows() {
  const c = cloudiness();
  if (c <= 0) return;
  if (!cloudCv) buildClouds();
  cloudLayer(cloudShPat, 1.0, 0.16 * c, 60, 80);
}
function drawClouds() {
  const c = cloudiness();
  if (c <= 0) return;
  if (!cloudCv) buildClouds();
  cloudLayer(cloudPat, 1.35, 0.20 * c, 0, 0);
}

/* лёгкий наклон взгляда: даль (верх кадра) светлее, ближний край темнее */
let tiltGrad = null;
function drawTilt() {
  if (!tiltGrad) {
    tiltGrad = ctx.createLinearGradient(0, 0, 0, VH);
    tiltGrad.addColorStop(0, 'rgba(200,235,255,0.07)');
    tiltGrad.addColorStop(0.45, 'rgba(200,235,255,0)');
    tiltGrad.addColorStop(1, 'rgba(0,8,16,0.12)');
  }
  ctx.fillStyle = tiltGrad;
  ctx.fillRect(0, 0, VW, VH);
}

/* ===== src/gfx/vfx.js ===== */
;
'use strict';
/* ============================================================
   vfx.js — «дорогие на вид, дешёвые по цене» эффекты.

   • свечения — один заранее нарисованный радиальный спрайт на цвет,
     кладётся аддитивно (без градиентов на каждый кадр);
   • водяные столбы от разрывов: белый столб растёт и опадает,
     тень ложится на воду — вертикаль добавляет глубины;
   • носовые буруны у идущих кораблей;
   • чайки с тенями на воде — живая высота над морем;
   • солнечная дорожка бликов, виньетка и цветокоррекция по биому.

   FXQ — уровень эффектов. Игра сама следит за частотой кадров:
   если устройство не справляется, дорогие слои отключаются.
   ============================================================ */

let FXQ = 1;                       /* 1 — полные эффекты, 0 — облегчённые */
let perfAcc = 0, perfN = 0, perfLast = 0, perfLow = 0;

/* замер реальной длительности кадра (не игрового dt — стоп-кадры его искажают) */
function vfxPerf() {
  const t = performance.now();
  if (perfLast) {
    const d = Math.min(100, t - perfLast);
    perfAcc += d; perfN++;
    if (perfN >= 60) {
      const avg = perfAcc / perfN;
      perfAcc = 0; perfN = 0;
      /* дольше ~24 мс (меньше ~42 к/с) три замера подряд — облегчаем */
      if (avg > 24) { if (++perfLow >= 3 && FXQ) { FXQ = 0; } }
      else perfLow = 0;
    }
  }
  perfLast = t;
}

/* ---------- спрайт свечения ---------- */
const glowCache = {};
function glowSpr(col) {
  if (glowCache[col]) return glowCache[col];
  const S = 64, c = newCv(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, col);
  gr.addColorStop(0.35, col.replace(/rgb\(([^)]+)\)/, 'rgba($1,0.45)'));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return (glowCache[col] = c);
}
/* цвета свечений заданы как rgb(), чтобы собрать полупрозрачную середину */
const GLOW = { fire: 'rgb(255,170,80)', hot: 'rgb(255,236,180)', tracer: 'rgb(255,214,120)',
               etracer: 'rgb(255,110,90)', blue: 'rgb(140,220,255)' };

function glowAt(x, y, r, col, a) {
  const s = glowSpr(col);
  ctx.globalAlpha = a;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
}

/* ---------- новые виды частиц ---------- */
/* вызывается из верхнего слоя частиц в scene.js; true — нарисовано */
function drawPartX(p, al) {
  if (p.type === 'glow') {
    if (!FXQ && p.size < 20) return true;
    ctx.globalCompositeOperation = 'lighter';
    glowAt(p.x, p.y, p.size * (0.6 + 0.4 * al), p.col, al * 0.75);
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  if (p.type === 'column') {
    /* водяной столб: растёт и опадает, у основания пена, рядом тень */
    const t = 1 - al, H = p.size * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const w = p.r * (0.6 + t * 0.8);
    ctx.globalAlpha = 0.22 * al;
    ctx.fillStyle = '#021018';
    ctx.beginPath(); ctx.ellipse(p.x + H * SUN.x * 0.6, p.y + H * SUN.y * 0.35, w, w * 0.45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85 * al;
    ctx.fillStyle = '#e8fbff';
    ctx.beginPath();
    ctx.moveTo(p.x - w, p.y);
    ctx.quadraticCurveTo(p.x - w * 0.3, p.y - H * 0.6, p.x - w * 0.15, p.y - H);
    ctx.lineTo(p.x + w * 0.15, p.y - H);
    ctx.quadraticCurveTo(p.x + w * 0.3, p.y - H * 0.6, p.x + w, p.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,220,235,' + (0.55 * al).toFixed(3) + ')';
    ctx.fillRect(p.x + w * 0.1, p.y - H * 0.8, w * 0.5, H * 0.8);
    ctx.globalAlpha = 0.6 * al;
    ctx.strokeStyle = '#f4feff'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 1.4 + t * 4, (w * 1.4 + t * 4) * 0.5, 0, 0, TAU); ctx.stroke();
    return true;
  }
  return false;
}

/* огненный шар и свечение взрыва — дополняют boom() */
function boomGlow(x, y, pow) {
  /* размер свечения ограничен: цепочка крупных взрывов складывалась
     аддитивно и засвечивала весь остров */
  addP({ x, y, life: 0.22, max: 0.22, type: 'glow', size: Math.min(22, 13 * pow), col: GLOW.hot });
  addP({ x, y, life: 0.55, max: 0.55, type: 'glow', size: Math.min(40, 24 * pow), col: GLOW.fire });
  /* на воде — водяной столб, на суше — нет */
  if (isWater(x, y) && pow >= 0.8)
    addP({ x, y, life: 0.9, max: 0.9, type: 'column', size: 16 * pow, r: 3.2 * pow, layer: 1 });
}
function splashColumn(x, y, k) {
  addP({ x, y, life: 0.7, max: 0.7, type: 'column', size: 9 * k, r: 2 * k, layer: 1 });
}

/* ---------- носовой бурун ---------- */
function bowWave(e, H) {
  /* белый бурун под форштевнем: пятно пены, растёт со скоростью */
  const sp = Math.abs(e.spd || 0);
  if (sp < 18 || !FXQ) return;
  const k = Math.min(1, sp / 110);
  const L = (e.T ? e.T.r : 9) + 1.5;
  const bx = e.x + Math.cos(e.ang) * L, by = e.y + Math.sin(e.ang) * L;
  ctx.fillStyle = 'rgba(240,252,255,' + (0.18 + 0.3 * k).toFixed(2) + ')';
  ctx.beginPath(); ctx.ellipse(bx, by, 1.6 + k * 2.2, 1 + k * 1.2, e.ang, 0, TAU); ctx.fill();
}

/* ---------- чайки ---------- */
let gulls = [];
function gullsReset() {
  gulls = [];
  for (let i = 0; i < 9; i++) {
    const isl = islands.length ? pick(islands) : { x: CARR.x, y: CARR.y };
    gulls.push({ x: isl.x + rr(-120, 120), y: isl.y + rr(-120, 120), a: rr(0, TAU), v: rr(22, 34),
                 h: rr(18, 34), ph: rr(0, TAU), turn: rr(-0.5, 0.5), home: isl });
  }
}
function updGulls(dt) {
  for (const g of gulls) {
    /* кружат вокруг своего острова, от катера держатся подальше */
    const hx = g.home.x - g.x, hy = g.home.y - g.y;
    const want = Math.atan2(hy, hx) + 1.2;
    g.a += clamp(angDiff(g.a, want), -1, 1) * 0.5 * dt + g.turn * dt;
    if (player && dist(g.x, g.y, player.x, player.y) < 60) g.a += 2 * dt;
    g.x += Math.cos(g.a) * g.v * dt; g.y += Math.sin(g.a) * g.v * dt;
    g.ph += dt * (6 + g.v * 0.1);
    if (chance(0.004)) g.turn = rr(-0.5, 0.5);
  }
}
function drawGulls() {
  if (!FXQ || curCfg.ambient > 0.6) return;
  const vw = VW / cam.z, vh = VH / cam.z;
  for (const g of gulls) {
    if (g.x < ox - 40 || g.x > ox + vw + 40 || g.y < oy - 40 || g.y > oy + vh + 40) continue;
    const flap = Math.sin(g.ph), sx = g.x, sy = g.y - g.h;
    /* тень на воде */
    ctx.fillStyle = 'rgba(2,16,24,0.20)';
    ctx.fillRect(g.x + g.h * SUN.x * 0.6 - 1.5, g.y + g.h * SUN.y * 0.4, 3, 0.8);
    /* крылья «галочкой», взмах меняет изгиб */
    const c = Math.cos(g.a), s = Math.sin(g.a), px = -s, py = c;
    const wy = flap * 1.3;
    ctx.strokeStyle = '#f4f8fa'; ctx.lineWidth = D * 2;
    ctx.beginPath();
    ctx.moveTo(sx + px * 3.2 - c * 0.8, sy + py * 3.2 - s * 0.8 - wy);
    ctx.lineTo(sx, sy);
    ctx.lineTo(sx - px * 3.2 - c * 0.8, sy - py * 3.2 - s * 0.8 - wy);
    ctx.stroke();
    ctx.fillStyle = '#3a4650'; ctx.fillRect(sx - D, sy - D, D * 2, D * 2);
  }
}

/* ---------- солнечная дорожка ---------- */
/* мягкое пятно отражения солнца и искры в нём (экранные координаты) */
let sunGrad = null;
function drawSunGlint() {
  if (!FXQ) return;
  const amb = curCfg.ambient || 0;
  if (amb > 0.45) return;
  const k = 1 - amb / 0.45;
  const cx = VW * 0.78, cy = VH * 0.18;
  if (!sunGrad) {
    sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
    sunGrad.addColorStop(0, 'rgba(255,246,214,0.16)');
    sunGrad.addColorStop(0.5, 'rgba(255,240,200,0.05)');
    sunGrad.addColorStop(1, 'rgba(255,240,200,0)');
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k;
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, VW, VH);
  /* искры: хаотично, но гуще к центру дорожки */
  const tt = Math.floor(tGlobal * 6);
  for (let i = 0; i < 70; i++) {
    const s = i * 91.7 + tt * 53.1;
    const r = Math.pow(h1(s), 1.6) * 170, a = h1(s + 3.3) * TAU;
    const x = cx + Math.cos(a) * r * 1.3, y = cy + Math.sin(a) * r * 0.7;
    const al = (1 - r / 170) * (0.35 + 0.65 * h1(s + 7.7));
    ctx.fillStyle = 'rgba(255,250,225,' + (al * 0.8).toFixed(2) + ')';
    ctx.fillRect(x, y, D * (2 + (i % 3)), D);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- виньетка и цветокоррекция ---------- */
let vigGrad = null;
const GRADE = { tropic: 'rgba(255,214,150,0.10)', atoll: 'rgba(120,255,230,0.08)',
                rust: 'rgba(255,140,90,0.12)', ash: 'rgba(120,150,200,0.12)',
                jungle: 'rgba(150,255,170,0.08)' };
function drawPost() {
  if (FXQ) {
    /* мягкий свет «солнечного часа» поверх — у каждого биома свой */
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = GRADE[curCfg.biome] || GRADE.tropic;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!vigGrad) {
    /* радиусы от меньшей стороны и диагонали — верно при любых пропорциях кадра */
    vigGrad = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.42,
                                       VW / 2, VH / 2, Math.hypot(VW, VH) * 0.56);
    vigGrad.addColorStop(0, 'rgba(0,6,12,0)');
    vigGrad.addColorStop(1, 'rgba(0,6,12,0.42)');
  }
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, VW, VH);
}

/* ---------- полоска здоровья над кораблём ---------- */
function hpBar(x, y, w, frac, col) {
  ctx.fillStyle = 'rgba(4,12,18,0.8)';
  ctx.fillRect(x - w / 2 - 0.5, y - 0.5, w + 1, 2.4);
  ctx.fillStyle = col || (frac > 0.5 ? '#ff6b5e' : frac > 0.25 ? '#ffb454' : '#ffd94a');
  ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 1.4);
}

/* ---------- кильватер: непрерывная лента ---------- */
/* Каждый корабль оставляет точки за кормой. След рисуется кусками:
   бурун винтов по центру (широкий, быстро тает) и два расходящихся
   «уса» волн по бокам — классическая V-образная картина Кельвина.
   Куски по возрасту — по 2 штриха на кусок, дешево даже для флота. */
const WAKE_LIFE = 2.4, WAKE_STEP = 3.2, WAKE_PARTS = 8;
function shipWake(e, sternOff, halfW) {
  const now = tGlobal;
  if (!e._tr) e._tr = [];
  const tr = e._tr;
  const sx = e.x - Math.cos(e.ang) * sternOff, sy = e.y - Math.sin(e.ang) * sternOff;
  const sp = Math.abs(e.spd || 0);
  const k = Math.min(1, sp / 90);
  /* tr[0] — «голова» у самой кормы, ползёт за кораблём; как только
     отошла от последней закреплённой точки на шаг — закрепляется */
  const pt = () => ({ x: sx, y: sy, a: e.ang, t: now, k });
  if (!tr.length) tr.push(pt());
  if (tr.length === 1 || dist(tr[1].x, tr[1].y, sx, sy) > WAKE_STEP) tr.unshift(pt());
  else { const h = tr[0]; h.x = sx; h.y = sy; h.a = e.ang; h.t = now; h.k = k; }
  while (tr.length && now - tr[tr.length - 1].t > WAKE_LIFE) tr.pop();
  if (tr.length > 70) tr.length = 70;
  const n = tr.length;
  if (n < 2) return;
  const per = Math.max(1, Math.ceil((n - 1) / WAKE_PARTS));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let s0 = 0; s0 < n - 1; s0 += per) {
    const s1 = Math.min(n - 1, s0 + per);
    const pm = tr[Math.min(n - 1, (s0 + s1) >> 1)];
    const age = now - pm.t, f = Math.max(0, 1 - age / WAKE_LIFE), kk = pm.k;
    if (f <= 0 || kk < 0.04) continue;
    /* взбитая винтами пена: широкая бледная полоса и яркая сердцевина */
    ctx.strokeStyle = 'rgba(236,250,255,' + (0.16 * f * kk).toFixed(3) + ')';
    ctx.lineWidth = halfW * 1.6 + age * 3.2;
    ctx.beginPath();
    for (let i = s0; i <= s1; i++) { const p = tr[i]; if (i === s0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244,252,255,' + (0.38 * f * f * kk).toFixed(3) + ')';
    ctx.lineWidth = halfW * 0.8 + age * 1.4;
    ctx.beginPath();
    for (let i = s0; i <= s1; i++) { const p = tr[i]; if (i === s0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}

/* ===== src/world/world.js ===== */
;
'use strict';
/* ============================================================
   world.js — генерация архипелага, пре-рендер карты, геометрия

   Карта не хранится одним огромным холстом: при SC=4 он весил бы
   сотни мегабайт. Вместо этого:
     * seaDepth — карта глубин в 1/6 разрешения, растягивается со сглаживанием;
     * seaTex   — два бесшовных тайла ряби, выводятся 1:1 к пикселям экрана;
     * каждый остров — собственный холст полного разрешения по своей
       ограничивающей рамке (вытянутые острова не платят за пустоту).
   ============================================================ */

const NAME_POOL = ['isl_fang', 'isl_thund', 'isl_raid', 'isl_serp', 'isl_storm', 'isl_ash',
                   'isl_crab', 'isl_gloom', 'isl_needle', 'isl_wolf', 'isl_fort', 'isl_breeze',
                   'isl_shark', 'isl_cape', 'isl_reef', 'isl_anchor'];
const islName = isl => T(isl.nameKey);

const ISL_MARGIN = 1.38;              /* запас вокруг берега под отмели и тень */
const D = 1 / SC;                     /* один физический пиксель в единицах мира */
const ISL_N = 96;                     /* точек в контуре берега */

let vegSpr = null, rockSpr = null;

/* ------------------------------------------------------------
   Форма острова.
   Базис — эллипс произвольного поворота, поверх него необязательные
   доли (twin), залив (bay) и круговой шум. Контур всегда звёздчатый
   относительно центра, поэтому radiusAt/isWater остаются корректными.
   ------------------------------------------------------------ */
function makeShape(r0) {
  const kind = pick(['round', 'round', 'long', 'long', 'bay', 'twin', 'ragged', 'ragged']);
  const n = ISL_N, rad = new Array(n);
  const phi = rr(0, TAU);

  let b = 1, lobes = 0, bayD = 0;
  if (kind === 'long')        b = rr(0.32, 0.54);
  else if (kind === 'twin') { b = rr(0.50, 0.72); lobes = rr(0.20, 0.32); }
  else if (kind === 'bay')  { b = rr(0.70, 1.00); bayD = rr(0.34, 0.52); }
  else if (kind === 'ragged') b = rr(0.66, 1.00);

  const bayA = rr(0, TAU), bayW = rr(0.55, 0.95);
  const s1 = rr(0, 100), s2 = rr(0, 100), s3 = rr(0, 100);
  const amp = kind === 'ragged' ? 1.8 : 1.0;

  for (let i = 0; i < n; i++) {
    const t = i / n * TAU;
    const c = Math.cos(t - phi), s = Math.sin(t - phi);
    let f = 1 / Math.sqrt(c * c + (s * s) / (b * b));      /* полярная форма эллипса */
    if (lobes) f *= 1 + lobes * Math.cos(2 * (t - phi));
    if (bayD) {
      const dd = angDiff(t, bayA);
      f *= 1 - bayD * Math.exp(-(dd * dd) / (bayW * bayW));
    }
    const nz = 1 + amp * (0.13 * Math.sin(t * 3 + s1) +
                          0.09 * Math.sin(t * 5 + s2) +
                          0.06 * Math.sin(t * 8 + s3));
    rad[i] = Math.max(r0 * 0.20, r0 * f * nz);
  }
  const passes = kind === 'ragged' ? 1 : 2;
  for (let p = 0; p < passes; p++) {
    const cp = rad.slice();
    for (let i = 0; i < n; i++) rad[i] = (cp[(i - 1 + n) % n] + cp[i] * 2 + cp[(i + 1) % n]) / 4;
  }
  return { rad, kind };
}

/* размер: островки, средние и крупные острова */
function pickIslandSize() {
  const q = Math.random();
  if (q < 0.28) return rr(26, 40);
  if (q < 0.72) return rr(48, 74);
  return rr(80, 108);
}

function radiusAt(isl, a) {
  const n = isl.rad.length;
  let i = (a / TAU) * n; i = ((i % n) + n) % n;
  const i0 = Math.floor(i), i1 = (i0 + 1) % n, f = i - i0;
  return isl.rad[i0] * (1 - f) + isl.rad[i1] * f;
}
function islandPath(g, isl, s) {
  const n = isl.rad.length, pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, r = isl.rad[i] * s;
    pts.push([isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r]);
  }
  g.beginPath();
  g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.closePath();
}

/* точка на острове с гарантированным отступом от воды */
function placeOn(isl, frac, margin) {
  for (let t = 0; t < 40; t++) {
    const a = rr(0, TAU), rHere = radiusAt(isl, a);
    const d = Math.min(rHere * frac, rHere * 0.90 - margin);
    if (d < 2) continue;
    return { x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d };
  }
  return { x: isl.x, y: isl.y };
}

/* ---------- генерация ---------- */
function genWorld(cfg) {
  curCfg = cfg;
  PAL = BIOMES[cfg.biome] || BIOMES.tropic;
  vegSpr = makeVeg(PAL);
  rockSpr = makeRocks(PAL);
  islands = []; structs = []; mines = [];

  const names = shuffle(NAME_POOL.slice());
  let tries = 0, gap = 165;
  while (islands.length < cfg.isl && tries < 24000) {
    tries++;
    if (tries % 2500 === 0) gap = Math.max(60, gap - 22);
    const r0 = pickIslandSize();
    const sh = makeShape(r0);
    let maxR = 0, sum = 0;
    for (const v of sh.rad) { if (v > maxR) maxR = v; sum += v; }
    const pad = maxR * ISL_MARGIN;
    const xMax = cfg.span ? Math.min(WORLD.w, CARR.x + cfg.span) : WORLD.w;
    const x = rr(pad + 40, xMax - pad - 40), y = rr(pad + 40, WORLD.h - pad - 40);
    if (dist(x, y, CARR.x, CARR.y) < 380 + maxR) continue;
    let ok = true;
    for (const o of islands) if (dist(x, y, o.x, o.y) < maxR + o.r + gap) { ok = false; break; }
    if (!ok) continue;
    islands.push({
      x, y, r: maxR, rAvg: sum / sh.rad.length, r0, rad: sh.rad, kind: sh.kind,
      nameKey: names[islands.length % names.length],
      hasBase: false, friendly: false, cv: null, bx: 0, by: 0, bw: 0, bh: 0
    });
  }

  /* базы — на самых крупных островах, чтобы постройки не свисали в воду */
  const bySize = islands.slice().sort((a, b) => b.rAvg - a.rAvg);
  for (let i = 0; i < Math.min(cfg.bases, bySize.length); i++) bySize[i].hasBase = true;

  /* дружеские островки: самые мелкие, без вражеских построек */
  piers = [];
  const smalls = islands.filter(i => !i.hasBase).sort((a, b) => a.rAvg - b.rAvg);
  const nFriendly = clamp(Math.round(cfg.isl / 5), 1, 3);
  for (let i = 0; i < nFriendly && i < smalls.length; i++) smalls[i].friendly = true;

  /* строения */
  let towerPlaced = false;
  for (const isl of islands) {
    if (isl.friendly) continue;
    const small = isl.rAvg < 36;
    if (isl.hasBase) {
      const p = placeOn(isl, 0.42, 14);
      structs.push(mkStruct('base', p.x, p.y, cfg.baseHp, 11, isl));
      const nb = 1 + (chance(0.6) ? 1 : 0);
      for (let k = 0; k < nb; k++) {
        const q = placeOn(isl, 0.72, 9);
        structs.push(mkStruct('bunker', q.x, q.y, cfg.bHp, 7, isl));
      }
    } else {
      const nb = small ? 1 : 2;
      for (let k = 0; k < nb; k++) {
        const q = placeOn(isl, 0.70, 9);
        structs.push(mkStruct('bunker', q.x, q.y, cfg.bHp, 7, isl));
      }
    }
    if (!towerPlaced && !isl.hasBase && isl.rAvg > 42 && chance(0.6)) {
      towerPlaced = true;
      const q = placeOn(isl, 0.35, 9);
      structs.push(mkStruct('tower', q.x, q.y, cfg.bHp * 0.8, 7, isl));
    }
    const nc = small ? ri(0, 1) : ri(0, 2);
    for (let k = 0; k < nc; k++) {
      const q = placeOn(isl, rr(0.5, 0.85), 6);
      structs.push(mkStruct('crate', q.x, q.y, 18, 5, isl));
    }
  }
  if (!towerPlaced && islands.length) {
    const isl = bySize[Math.min(bySize.length - 1, cfg.bases)] || islands[0];
    const q = placeOn(isl, 0.35, 9);
    structs.push(mkStruct('tower', q.x, q.y, cfg.bHp * 0.8, 7, isl));
  }

  /* маяки для ночной операции */
  if (cfg.lights) {
    const pool = islands.filter(i => !i.friendly).sort((a, b) => b.rAvg - a.rAvg);
    for (let i = 0; i < cfg.lights && i < pool.length; i++) {
      const isl = pool[i];
      const q = placeOn(isl, 0.55, 10);
      const L = mkStruct('light', q.x, q.y, cfg.bHp * 0.7, 6, isl);
      L.spin = (chance(0.5) ? 1 : -1) * rr(0.30, 0.55);
      L.range = rr(190, 260);
      L.arc = rr(0.30, 0.44);
      structs.push(L);
    }
  }

  /* острова десантной операции */
  allyIsl = null; targetIsl = null;
  if (cfg.mission === 'escort' && islands.length > 1) {
    const bySz = islands.filter(i => !i.friendly).sort((a, b) => b.rAvg - a.rAvg);
    targetIsl = bySz.find(i => i.hasBase) || bySz[0];
    const rest = islands.filter(i => i !== targetIsl && !i.friendly);
    rest.sort((a, b) => dist(a.x, a.y, CARR.x, CARR.y) - dist(b.x, b.y, CARR.x, CARR.y));
    allyIsl = rest.find(i => !i.hasBase) || rest[0];
  }

  /* минные банки */
  for (let i = 0; i < (cfg.mines || 0); i++) {
    for (let t = 0; t < 30; t++) {
      const isl = pick(islands);
      const a = rr(0, TAU), d = radiusAt(isl, a) + rr(24, 90);
      const x = isl.x + Math.cos(a) * d, y = isl.y + Math.sin(a) * d;
      if (!isWater(x, y)) continue;
      if (dist(x, y, CARR.x, CARR.y) < 320) continue;
      mines.push({ x, y, ph: rr(0, TAU), hp: 12, armed: 0.6 });
      break;
    }
  }

  for (const isl of islands) if (isl.friendly) piers.push(mkPier(isl));

  totalBases = structs.filter(s => s.type === 'base').length;
  crates = structs.filter(s => s.type === 'crate').length;

  gullsReset();
  buildSeaDepth(cfg.sea);
  buildSeaTiles(cfg.sea);
  for (const isl of islands) buildIslandCanvas(isl, cfg.sea);
}

function mkStruct(type, x, y, hp, r, isl) {
  return { type, x, y, hp, max: hp, r, isl, cool: rr(0, 2), flash: 0, dead: false,
           rad: rr(0, TAU), shakeT: 0, seed: Math.random() * 100 };
}

/* ---------- море ---------- */
function hexRGB(h) {
  return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
}

/* карта глубин: крупные пятна светлее/темнее, растягивается со сглаживанием */
function buildSeaDepth(SP) {
  const K = 6;
  const w = Math.ceil(WORLD.w / K), h = Math.ceil(WORLD.h / K);
  seaDepth = document.createElement('canvas');
  seaDepth.width = w; seaDepth.height = h;
  const g = seaDepth.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const base = hexRGB(SP.sea), deep = hexRGB(SP.deep || SP.sea);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = x * K, wy = y * K;
      const n = fbm(wx / 300, wy / 300) * 0.68 + fbm(wx / 90, wy / 90) * 0.32;
      const t = clamp((n - 0.34) / 0.34, 0, 1);
      const i = (y * w + x) * 4;
      d[i]     = lerp(deep[0], base[0] * 1.12, t);
      d[i + 1] = lerp(deep[1], base[1] * 1.12, t);
      d[i + 2] = lerp(deep[2], base[2] * 1.12, t);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/* два бесшовных тайла ряби в физических пикселях:
   слой 0 — мелкая рябь, слой 1 — длинные гребни */
function buildSeaTiles(SP) {
  const S = 192;
  for (let layer = 0; layer < 2; layer++) {
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const streak = (x, y, len, th, col) => {
      for (let ox2 = -S; ox2 <= S; ox2 += S)
        for (let oy2 = -S; oy2 <= S; oy2 += S) {
          g.fillStyle = col;
          g.fillRect(x + ox2, y + oy2, len, th);
          g.fillRect(x + ox2 + len * 0.25, y + oy2 - th, len * 0.5, th);
        }
    };
    const nStreak = layer ? 30 : 16;
    for (let i = 0; i < nStreak; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const len = layer ? rr(14, 46) : rr(8, 22);
      streak(x, y, len, 1, 'rgba(255,255,255,' + rr(0.035, layer ? 0.085 : 0.06).toFixed(3) + ')');
      streak(x + rr(-6, 6), y + rr(2, 5), len * 0.7, 1, 'rgba(0,0,0,' + rr(0.03, 0.06).toFixed(3) + ')');
    }
    const n = layer ? 420 : 900;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * S) | 0, y = (Math.random() * S) | 0, w = ri(1, layer ? 4 : 2);
      g.fillStyle = 'rgba(255,255,255,' + rr(0.02, layer ? 0.05 : 0.08).toFixed(3) + ')';
      g.fillRect(x, y, w, 1);
    }
    for (let i = 0; i < n * 0.5; i++) {
      const x = (Math.random() * S) | 0, y = (Math.random() * S) | 0, w = ri(1, 3);
      g.fillStyle = 'rgba(0,0,0,' + rr(0.02, 0.05).toFixed(3) + ')';
      g.fillRect(x, y, w, 1);
    }
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() * S) | 0, y = (Math.random() * S) | 0;
      g.fillStyle = SP.sp;
      g.fillRect(x, y, ri(2, 5), 1);
    }
    seaTex[layer] = c;
  }
}

/* ---------- растительность ---------- */
/* вес вида зависит от того, насколько точка близка к берегу */
function pickVeg(mixList, t) {
  const shore = t > 0.70;
  let tot = 0;
  const w = [];
  for (const pair of mixList) {
    const k = pair[0];
    let q = pair[1];
    if (shore) {
      if (k === 'palm') q *= 2.4;
      else if (k === 'big') q *= 0.12;
      else if (k === 'broad') q *= 0.45;
      else if (k === 'tuft') q *= 1.7;
      else if (k === 'bush') q *= 1.4;
      else if (k === 'fern') q *= 0.5;
    } else {
      if (k === 'palm') q *= 0.65;
      else if (k === 'big') q *= 1.6;
      else if (k === 'fern') q *= 1.3;
    }
    w.push([k, q]); tot += q;
  }
  let r = Math.random() * tot;
  for (const pair of w) { r -= pair[1]; if (r <= 0) return pair[0]; }
  return w[0][0];
}

function nearStruct(isl, x, y) {
  for (const s of structs) {
    if (s.isl !== isl) continue;
    const need = s.type === 'base' ? 17 : s.type === 'crate' ? 7 : 11;
    if (dist(x, y, s.x, s.y) < need) return true;
  }
  return false;
}

function placeVegetation(g, isl) {
  const cfgv = VEG_MIX[curCfg.biome] || VEG_MIX.tropic;
  /* плотность от площади: одно растение примерно на 42 кв. единицы */
  const area = Math.PI * isl.rAvg * isl.rAvg * 0.62;
  const total = Math.round(area / 42 * cfgv.dens);

  /* рощи — растения кучкуются вокруг них, остальное рассыпано */
  const groves = [];
  const ng = 4 + Math.round(isl.rAvg / 11);
  for (let i = 0; i < ng; i++) {
    const a = rr(0, TAU), d = rr(0.05, 0.68) * radiusAt(isl, a);
    groves.push({ x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
                  r: rr(0.20, 0.46) * isl.rAvg });
  }

  const plants = [];
  let guard = 0;
  while (plants.length < total && guard < total * 7 + 200) {
    guard++;
    let x, y;
    if (chance(0.55) && groves.length) {
      const G = pick(groves);
      const a = rr(0, TAU), d = Math.pow(Math.random(), 0.55) * G.r;
      x = G.x + Math.cos(a) * d; y = G.y + Math.sin(a) * d;
    } else {
      const a = rr(0, TAU), d = Math.sqrt(Math.random());
      const rHere = radiusAt(isl, a);
      x = isl.x + Math.cos(a) * rHere * d * 0.88;
      y = isl.y + Math.sin(a) * rHere * d * 0.88;
    }
    const dx = x - isl.x, dy = y - isl.y;
    const rHere = radiusAt(isl, Math.atan2(dy, dx));
    const t = Math.hypot(dx, dy) / rHere;
    if (t > 0.90) continue;                       /* мокрый песок оставляем пустым */
    if (nearStruct(isl, x, y)) continue;          /* вокруг построек — расчищено */
    const kind = pickVeg(cfgv.mix, t);
    const bank = vegSpr[kind];
    if (!bank || !bank.length) continue;
    plants.push({ x, y, spr: pick(bank) });
  }

  /* дальние перекрываются ближними */
  plants.sort((p, q) => p.y - q.y);
  for (const p of plants) {
    const w = p.spr.width / SC, h = p.spr.height / SC;
    g.drawImage(p.spr, p.x - w / 2, p.y - h * 0.80, w, h);
  }
}

/* ---------- остров ---------- */
function buildIslandCanvas(isl, SP) {
  /* ограничивающая рамка по контуру с запасом */
  const n = isl.rad.length;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU, r = isl.rad[i] * ISL_MARGIN;
    const px = Math.cos(t) * r, py = Math.sin(t) * r;
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
  isl.bx = x0; isl.by = y0; isl.bw = x1 - x0; isl.bh = y1 - y0;

  const c = document.createElement('canvas');
  c.width = Math.ceil(isl.bw * SC);
  c.height = Math.ceil(isl.bh * SC);
  const g = c.getContext('2d');
  /* рисуем в мировых координатах: единица = SC пикселей */
  g.setTransform(SC, 0, 0, SC, (-isl.x - x0) * SC, (-isl.y - y0) * SC);
  isl.cv = c;

  const grain = (count, s0, s1, col, sz) => {
    for (let k = 0; k < count; k++) {
      const a = rr(0, TAU), d = radiusAt(isl, a) * rr(s0, s1);
      g.fillStyle = col;
      g.fillRect(isl.x + Math.cos(a) * d, isl.y + Math.sin(a) * d, sz || D, sz || D);
    }
  };
  const K = isl.rAvg / 60;                       /* масштабный коэффициент деталей */

  /* тень на глубине */
  g.fillStyle = 'rgba(4,16,28,0.34)'; islandPath(g, isl, 1.34); g.fill();
  /* ступени отмели */
  g.fillStyle = SP.sh1; islandPath(g, isl, 1.24); g.fill();
  g.fillStyle = SP.sh2; islandPath(g, isl, 1.13); g.fill();
  g.fillStyle = SP.sh3; islandPath(g, isl, 1.05); g.fill();
  grain(Math.round(isl.rAvg * 14), 1.05, 1.23, 'rgba(20,50,60,0.30)', D * 2);
  grain(Math.round(isl.rAvg * 8), 1.02, 1.22, 'rgba(255,255,255,0.10)', D * 2);

  /* пляж */
  g.fillStyle = PAL.sand; islandPath(g, isl, 1.0); g.fill();
  g.fillStyle = PAL.wet;  islandPath(g, isl, 0.972); g.fill();
  g.fillStyle = PAL.sand; islandPath(g, isl, 0.935); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = D * 2;
  islandPath(g, isl, 0.998); g.stroke();
  grain(Math.round(isl.rAvg * 26), 0.84, 0.995, PAL.sandD);
  grain(Math.round(isl.rAvg * 12), 0.84, 0.995, 'rgba(255,255,255,0.30)');
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = D;
  for (let k = 0; k < 5; k++) { islandPath(g, isl, 0.945 + k * 0.012); g.stroke(); }

  /* Псевдо-3D: плато поднято над пляжем. Слои земляного обрыва
     со сдвигом вверх дают видимую стенку с южной стороны; всё, что
     стоит на траве (и постройки в drawStruct), рисуется выше на lift. */
  const H = isl.lift = clamp(isl.rAvg * 0.065, 1.6, 4.6);
  g.fillStyle = 'rgba(40,30,16,0.22)';
  g.save(); g.translate(H * SUN.x * 0.8, H * 0.2); islandPath(g, isl, 0.85); g.fill(); g.restore();
  const cliffD = shade(PAL.sandD, 0.52), cliffL = shade(PAL.sandD, 0.74);
  for (let k = 0; k < H; k += D) {
    g.save(); g.translate(0, -k);
    g.fillStyle = k < H * 0.5 ? cliffD : cliffL;
    islandPath(g, isl, 0.84); g.fill();
    g.restore();
  }
  g.save();
  g.translate(0, -H);
  /* кромка обрыва подсвечена солнцем */
  g.strokeStyle = 'rgba(255,240,200,0.28)'; g.lineWidth = D * 2;
  islandPath(g, isl, 0.838); g.stroke();

  /* зелёный покров */
  g.fillStyle = PAL.grassD; islandPath(g, isl, 0.828); g.fill();
  g.fillStyle = PAL.grass;  islandPath(g, isl, 0.80); g.fill();
  /* поляны и подлесок */
  const litG = shade(PAL.grass, 1.16), darkG = shade(PAL.grassD, 0.88);
  g.globalAlpha = 0.42;
  for (let k = 0; k < Math.round(9 * K) + 5; k++) {
    const a = rr(0, TAU), d = rr(0, 0.5) * radiusAt(isl, a);
    const cx0 = isl.x + Math.cos(a) * d, cy0 = isl.y + Math.sin(a) * d;
    const rx = isl.rAvg * rr(0.07, 0.19), ry = isl.rAvg * rr(0.05, 0.15), rot = rr(0, TAU);
    g.fillStyle = chance(0.55) ? darkG : litG;
    /* пятно из нескольких эллипсов — кромка получается рваной */
    for (let q = 0; q < 3; q++) {
      g.beginPath();
      g.ellipse(cx0 + rr(-rx, rx) * 0.5, cy0 + rr(-ry, ry) * 0.5,
                rx * rr(0.5, 0.9), ry * rr(0.5, 0.9), rot, 0, TAU);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  grain(Math.round(isl.rAvg * 22), 0.10, 0.78, 'rgba(255,255,255,0.08)');
  grain(Math.round(isl.rAvg * 22), 0.10, 0.78, 'rgba(0,0,0,0.09)');

  /* тропинки между постройками */
  const pts = structs.filter(s => s.isl === isl);
  g.strokeStyle = 'rgba(92,72,44,0.26)'; g.lineWidth = D * 6;
  g.lineCap = 'round';
  for (let i = 0; i + 1 < pts.length; i++) {
    g.beginPath();
    g.moveTo(pts[i].x, pts[i].y);
    g.quadraticCurveTo((pts[i].x + pts[i + 1].x) / 2 + rr(-8, 8),
                       (pts[i].y + pts[i + 1].y) / 2 + rr(-8, 8),
                       pts[i + 1].x, pts[i + 1].y);
    g.stroke();
  }
  /* тропинка к берегу */
  if (pts.length) {
    const a0 = rr(0, TAU), rEdge = radiusAt(isl, a0) * 0.95;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    g.quadraticCurveTo(isl.x + rr(-12, 12), isl.y + rr(-12, 12),
                       isl.x + Math.cos(a0) * rEdge, isl.y + Math.sin(a0) * rEdge);
    g.stroke();
  }
  /* утоптанные площадки под постройками */
  for (const s of pts) {
    const rp = s.type === 'base' ? 17 : s.type === 'crate' ? 6 : 10;
    g.fillStyle = 'rgba(104,84,52,0.30)';
    g.beginPath(); g.ellipse(s.x, s.y + 1, rp, rp * 0.72, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,140,100,0.14)';
    g.beginPath(); g.ellipse(s.x, s.y, rp * 0.7, rp * 0.5, 0, 0, TAU); g.fill();
  }

  /* растительность */
  placeVegetation(g, isl);

  /* камни у кромки и в глубине */
  for (let k = 0; k < Math.round(7 * K) + 4; k++) {
    const a = rr(0, TAU), d = radiusAt(isl, a) * rr(0.55, 1.0);
    const spr = pick(rockSpr);
    g.drawImage(spr, isl.x + Math.cos(a) * d - spr.width / (2 * SC),
                isl.y + Math.sin(a) * d - spr.height / (2 * SC),
                spr.width / SC, spr.height / SC);
  }
  g.restore();                       /* конец плато */
}

/* ---------- геометрия / столкновения ---------- */
function collideIslands(o, rad) {
  let hit = false;
  for (const isl of islands) {
    const dx = o.x - isl.x, dy = o.y - isl.y, d = Math.hypot(dx, dy);
    if (d > isl.r + rad + 2) continue;
    const need = radiusAt(isl, Math.atan2(dy, dx)) + rad;
    if (d < need && d > 0.001) { o.x = isl.x + dx / d * need; o.y = isl.y + dy / d * need; hit = true; }
  }
  const dc = dist(o.x, o.y, CARR.x, CARR.y);
  if (dc < 32 + rad && dc > 0.001) {
    o.x = CARR.x + (o.x - CARR.x) / dc * (32 + rad);
    o.y = CARR.y + (o.y - CARR.y) / dc * (32 + rad);
    hit = true;
  }
  return hit;
}
function isWater(x, y) {
  for (const isl of islands) {
    const d = dist(x, y, isl.x, isl.y);
    if (d > isl.r) continue;
    if (d < radiusAt(isl, Math.atan2(y - isl.y, x - isl.x))) return false;
  }
  return true;
}

/* ===== src/entities/player.js ===== */
;
'use strict';
/* ============================================================
   player.js — катер игрока: ход, форсаж, орудие, ПВО, спасение
   ============================================================ */

function makePlayer() {
  return {
    x: CARR.x + 150, y: CARR.y, ang: 0, spd: 0,
    hp: maxhpVal(), maxhp: maxhpVal(),
    cool: 0, turret: 0, flash: 0, recoil: 0, fr: 0,
    roll: 0, rollV: 0,
    aboard: 0, dead: false, sink: 0, sinkRot: 0, repT: 0,
    boostE: boostMax(), boosting: false, boostLock: 0, troops: 0,
    wakeT: 0, pdCool: 0, engineHum: 0
  };
}

function damagePlayer(d) {
  if (!player || player.dead) return;
  if (buffOn('shield')) { shieldHit(); return; }    /* щит гасит попадание */
  player.hp -= d * diff().dmg;
  player.fr = 0.35;
  shakeOffCrew(d);
  addShake(3, player.x + rr(-6, 6), player.y + rr(-6, 6));
  freeze(0.02);
  SFX.hit();
  for (let i = 0; i < 5; i++)
    addP({ x: player.x, y: player.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3,
           life: 0.25, max: 0.25, size: 0.7, col: '#ffd94a' });
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.sink = 0;
    recordBest();
    setState('dying');
    bigBoom(player.x, player.y);
    SFX.sink();
    addShake(10);
  }
}

/* ---------- ПВО «ОСА»: сбивает снаряды и ракеты рядом ---------- */
function pointDefense(dt) {
  if (upg.pd <= 0 || player.dead) return;
  player.pdCool -= dt;
  if (player.pdCool > 0) return;
  const R = pdRange();
  let tgt = null, bd = R;
  for (const s of shells) {
    if (s.from === 'p') continue;
    const d = dist(s.x, s.y, player.x, player.y);
    if (d < bd) { bd = d; tgt = s; }
  }
  if (!tgt) for (const m of eMissiles) {
    const d = dist(m.x, m.y, player.x, player.y);
    if (d < bd) { bd = d; tgt = m; }
  }
  if (!tgt) return;
  player.pdCool = 0.16 - upg.pd * 0.03;
  tgt.dead = true;
  const a = Math.atan2(tgt.y - player.y, tgt.x - player.x);
  muzzle(player.x + Math.cos(a) * 7, player.y + Math.sin(a) * 7, a, 0.5);
  addP({ x: tgt.x, y: tgt.y, life: 0.22, max: 0.22, type: 'ring', r: 6, col: '#9fe8ff' });
  SFX.pd();
}

function updPlayer(dt) {
  const P = player;

  /* ---- гибель: медленное погружение ---- */
  if (P.dead) {
    P.sink += dt; P.sinkRot += dt * 0.55;
    if (chance(0.5)) addP({ x: P.x + rr(-7, 7), y: P.y + rr(-7, 7), vx: rr(-6, 6), vy: rr(-16, -4),
                            life: 0.8, max: 0.8, size: rr(1, 2), col: '#bfeff2' });
    if (chance(0.14)) boom(P.x + rr(-9, 9), P.y + rr(-9, 9), 0.6);
    if (P.sink > 2.8) setState('over');
    return;
  }

  /* ---- управление: клавиатура или виртуальный стик ---- */
  let th = 0, turn = 0;
  const touch = touchMode();
  if (touch && tMove.active && tMove.mag > 0.14) {
    /* стик задаёт курс: катер доворачивает к пальцу, тяга по отклонению */
    th = Math.min(1, (tMove.mag - 0.14) / 0.6);
    const want = Math.atan2(tMove.dy, tMove.dx);
    turn = clamp(angDiff(P.ang, want) * 2.0, -1, 1);
  } else {                /* клавиатура работает всегда, даже в сенсорном режиме */
    if (keys['KeyW'] || keys['ArrowUp']) th = 1;
    else if (keys['KeyS'] || keys['ArrowDown']) th = -1;
    if (keys['KeyA'] || keys['ArrowLeft']) turn = -1;
    else if (keys['KeyD'] || keys['ArrowRight']) turn = 1;
  }

  /* форсаж */
  const boostKey = touch ? touchBoosting() : (keys['ShiftLeft'] || keys['ShiftRight']);
  const wantBoost = boostKey && th > 0 && P.boostE > 4 && P.boostLock <= 0;
  P.boosting = wantBoost;
  if (wantBoost) {
    P.boostE -= 34 * dt;
    if (P.boostE <= 0) { P.boostE = 0; P.boostLock = 1.4; P.boosting = false; }
    if (chance(0.85)) {
      const bx = P.x - Math.cos(P.ang) * 13, by = P.y - Math.sin(P.ang) * 13;
      addP({ x: bx, y: by, vx: -Math.cos(P.ang) * rr(30, 70) + rr(-10, 10),
             vy: -Math.sin(P.ang) * rr(30, 70) + rr(-10, 10), drag: 2.2,
             life: rr(0.2, 0.45), max: 0.45, size: rr(0.4, 1.6), col: chance(0.25) ? '#ffd94a' : '#dffaff' });
    }
  } else {
    P.boostLock = Math.max(0, P.boostLock - dt);
    P.boostE = Math.min(boostMax(), P.boostE + boostRegen() * dt);
  }
  if (P.boosting && chance(0.06)) SFX.boost();

  const slow  = 1 - (P.aboard + P.troops) * 0.028;
  const bmul  = P.boosting ? 1.75 : 1;
  const tgtSp = th > 0 ? maxSpd() * slow * bmul * (touch ? th : 1) : th < 0 ? -42 : 0;
  P.spd = approach(P.spd, tgtSp, th !== 0 ? 2.2 : 3.0, dt);

  const agility = 0.35 + Math.min(1, Math.abs(P.spd) / 70) * 0.65;
  const dAng = turn * turnSpd() * dt * agility;
  P.ang += dAng;

  /* крен корпуса на повороте (визуал) */
  P.rollV += (-turn * Math.min(1, Math.abs(P.spd) / 70) * 0.28 - P.roll) * 9 * dt;
  P.rollV *= Math.max(0, 1 - 4 * dt);
  P.roll += P.rollV * dt * 8;
  P.roll = clamp(P.roll, -0.3, 0.3);

  P.x += Math.cos(P.ang) * P.spd * dt;
  P.y += Math.sin(P.ang) * P.spd * dt;
  P.x = clamp(P.x, 12, WORLD.w - 12);
  P.y = clamp(P.y, 12, WORLD.h - 12);

  if (collideIslands(P, 9) && Math.abs(P.spd) > 50) {
    P.spd *= 0.32; damagePlayer(3); splashFx(P.x, P.y, 1.2);
  }

  /* ---- кильватер ---- */
  if (Math.abs(P.spd) > 20) {
    /* сам след рисует shipWake (vfx.js), здесь — только брызги из-под кормы */
    if (chance(0.65)) {
      const bx = P.x - Math.cos(P.ang) * 12, by = P.y - Math.sin(P.ang) * 12;
      addP({ x: bx + rr(-2, 2), y: by + rr(-2, 2), vx: rr(-6, 6), vy: rr(-6, 6),
             life: rr(0.4, 0.8), max: 0.8, size: rr(0.4, 1.2), col: 'rgba(220,245,248,0.8)', layer: 0 });
    }
  }

  /* ---- башня и огонь ---- */
  const ta = Math.atan2(mouseWY() - P.y, mouseWX() - P.x);
  P.turret += clamp(angDiff(P.turret, ta), -12 * dt, 12 * dt);
  P.cool -= dt; P.flash -= dt; P.fr = Math.max(0, P.fr - dt);
  P.recoil = Math.max(0, P.recoil - dt * 14);

  if ((mouse.down || keys['Space']) && P.cool <= 0) {
    P.cool = fireCd() * (buffOn('rapid') ? 0.5 : 1); P.flash = 0.06; P.recoil = 3;
    addShake(0.45);
    /* башня стоит на носу — снаряд вылетает из её ствола */
    const gx = P.x + Math.cos(P.ang) * PLAYER_GUN_OFF + Math.cos(P.turret) * 9;
    const gy = P.y + Math.sin(P.ang) * PLAYER_GUN_OFF + Math.sin(P.turret) * 9;
    const spread = rr(-0.012, 0.012);
    /* тройной залп — веер из трёх снарядов */
    for (const f of (buffOn('triple') ? [-0.13, 0, 0.13] : [0]))
      shells.push({ x: gx, y: gy,
                    vx: Math.cos(P.turret + spread + f) * 335, vy: Math.sin(P.turret + spread + f) * 335,
                    life: 0.85, from: 'p', dmg: shellDmg(), dead: false });
    muzzle(gx, gy, P.turret, 1);
    /* отдача сдвигает катер */
    P.x -= Math.cos(P.turret) * 0.5; P.y -= Math.sin(P.turret) * 0.5;
    SFX.shoot();
  }

  pointDefense(dt);
  tryLanding();
  updPiers(dt);
  updCrew(dt);

  /* дым от повреждений */
  if (P.hp < P.maxhp * 0.4 && chance(0.18))
    addP({ x: P.x + rr(-3, 3), y: P.y + rr(-4, 4), vx: rr(-5, 5), vy: rr(-12, -5),
           life: 1.1, max: 1.1, size: 2.5, col: '#4a545e', type: 'smoke' });
  if (P.hp < P.maxhp * 0.2 && chance(0.12))
    addP({ x: P.x + rr(-3, 3), y: P.y + rr(-3, 3), life: 0.3, max: 0.3, type: 'fire', size: 3 });

  /* ---- ремонт у авианосца ---- */
  const dc = dist(P.x, P.y, CARR.x, CARR.y);
  if (dc < 115 && P.hp < P.maxhp) {
    P.hp = Math.min(P.maxhp, P.hp + 9 * dt);
    P.repT -= dt;
    if (P.repT <= 0) {
      P.repT = 0.75; SFX.repair();
      addP({ x: P.x + rr(-6, 6), y: P.y - 10, vx: 0, vy: -16, life: 0.7, max: 0.7, size: 2, col: '#4ade80' });
    }
  }

  /* ---- посадка заложников ---- */
  let nearWait = false;
  for (const h of hostages) {
    if (h.state !== 'wait') continue;
    if (dist(P.x, P.y, h.x, h.y) < 32 && Math.abs(P.spd) < 55 && P.aboard < capacity()) {
      nearWait = true;
      h.board -= dt;
      if (h.board <= 0) {
        h.state = 'swim'; h.tx = P.x; h.ty = P.y; h.t = 0;
      }
    } else h.board = Math.max(h.board, 0.35);
  }
  if (nearWait && !hints.h) { hints.h = true; msg(T('mSlowDown'), '#7fd4e0', 3); }

  /* ---- эвакуация ---- */
  if (P.aboard > 0 && dc < 92) {
    const n = P.aboard; P.aboard = 0; rescued += n;
    reward(ECON.hostageEvac * n, CARR.x, CARR.y - 54, '#4ade80');
    msg(T('mEvacuated', n), '#4ade80', 3.5);
    for (let i = 0; i < 18; i++)
      addP({ x: CARR.x + rr(-16, 16), y: CARR.y + rr(-34, 34), vx: rr(-12, 12), vy: rr(-36, -12),
             g: 40, life: rr(0.6, 1.2), max: 1.2, size: 2, col: '#4ade80' });
    addLight(CARR.x, CARR.y, 80, '#4ade80', 0.5);
    SFX.evac();
  }
}

/* ===== src/entities/enemies.js ===== */
;
'use strict';
/* ============================================================
   enemies.js — вражеские корабли (4 типа) и линкор-босс
   ============================================================ */

function rollShipType() {
  const mix = curCfg.mix;
  let r = Math.random(), acc = 0;
  for (const [t, p] of mix) { acc += p; if (r <= acc) return t; }
  return mix[mix.length - 1][0];
}

function spawnEnemy(forceType) {
  for (let t = 0; t < 40; t++) {
    const isl = pick(islands);
    const a = rr(0, TAU), d = isl.r + rr(60, 120);
    const x = isl.x + Math.cos(a) * d, y = isl.y + Math.sin(a) * d;
    if (x < 20 || x > WORLD.w - 20 || y < 20 || y > WORLD.h - 20) continue;
    if (!isWater(x, y)) continue;
    if (player && dist(x, y, player.x, player.y) < 360) continue;
    const type = forceType || rollShipType();
    const ST = SHIP_TYPES[type];
    const hp = curCfg.eHp * ST.hp * (1 + alert * 0.08) * diff().hp;
    enemies.push({
      type, T: ST, x, y, ang: rr(0, TAU), spd: 0,
      hp, max: hp, state: 'patrol', isl, wa: a + 1.5,
      cool: rr(1, 2), flash: 0, smk: 0, roll: 0, wakeT: 0, alertT: 0
    });
    return true;
  }
  return false;
}

/* кого атакует корабль: транспорт конвоя важнее катера */
function enemyTarget(e) {
  if (transport && !transport.dead && !transport.done) {
    const dT = dist(e.x, e.y, transport.x, transport.y);
    const dP = player.dead ? 1e9 : dist(e.x, e.y, player.x, player.y);
    if (dT < dP * 1.4) return transport;
  }
  return player;
}

function enemyFire(e, dp, tg) {
  const ST = e.T;
  tg = tg || player;
  e.cool = rr(ST.cd[0], ST.cd[1]) * (1 - alert * 0.05);
  const pvx = Math.cos(tg.ang || 0) * (tg.spd || 0), pvy = Math.sin(tg.ang || 0) * (tg.spd || 0);
  const lead = Math.min(0.7, dp / 420);
  const tx = tg.x + pvx * lead, ty = tg.y + pvy * lead;

  if (ST.homing) {
    const a = Math.atan2(ty - e.y, tx - e.x);
    eMissiles.push({ x: e.x, y: e.y, ang: a, spd: 70, life: 4.6, dmg: curCfg.eDmg * 1.8, dead: false });
    muzzle(e.x, e.y, a, 1.1);
    sndAt(e.x, e.y); SFX.rocket();
    return;
  }
  const a = Math.atan2(ty - e.y, tx - e.x);
  const spread = ST.salvo > 1 ? 0.06 : 0.0;
  for (let i = 0; i < ST.salvo; i++) {
    const off = (i - (ST.salvo - 1) / 2) * spread + rr(-0.03, 0.03);
    shells.push({ x: e.x + Math.cos(e.ang) * 9, y: e.y + Math.sin(e.ang) * 9,
                  vx: Math.cos(a + off) * 215, vy: Math.sin(a + off) * 215,
                  life: 1.8, from: 'e', dmg: curCfg.eDmg * ST.dmg, dead: false });
  }
  muzzle(e.x + Math.cos(e.ang) * 9, e.y + Math.sin(e.ang) * 9, a, 0.7);
  sndAt(e.x, e.y);
  if (e.type === 'patrol') SFX.mg(); else SFX.eshoot();
}

function killEnemy(e, i) {
  blowCover();
  boom(e.x, e.y, e.T.tough ? 2.3 : 1.6);
  bumpCombo();
  reward(e.T.reward * (e.bounty || 1), e.x, e.y - 12, e.ace ? '#ffd94a' : '#ffd94a');
  kills.ships++;
  /* обломки и масляное пятно */
  for (let k = 0; k < 8; k++)
    addP({ x: e.x, y: e.y, vx: rr(-55, 55), vy: rr(-55, 55), g: 60, drag: 1.2,
           life: rr(0.5, 1.0), max: 1.0, size: rr(0.5, 1.4), col: '#39454e', type: 'debris', spin: rr(-8, 8) });
  if (chance(0.3)) pickups.push({ x: e.x, y: e.y, type: 'repair', ph: rr(0, TAU), life: 30 });
  else if (chance(0.22) && upg.msl) pickups.push({ x: e.x, y: e.y, type: 'ammo', ph: rr(0, TAU), life: 30 });
  /* ас всегда оставляет усиление, обычный корабль — изредка */
  if (e.drop || chance(0.08)) dropBuff(e.x + rr(-6, 6), e.y + rr(-6, 6));
  evKilled(e);
  enemies.splice(i, 1);
}

function updEnemies(dt) {
  const P = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], ST = e.T;
    e.flash -= dt; e.cool -= dt; e.alertT = Math.max(0, e.alertT - dt);
    const dp = P.dead ? 9999 : dist(e.x, e.y, P.x, P.y);
    const prevAng = e.ang;

    if (e.route) evSteer(e, dt);          /* баржи и гонщики событий идут по маршруту */
    else if (e.state === 'patrol') {
      /* точка маршрута — вокруг родного острова; если острова нет
         (спецспавн рядом с игроком), просто держим курс и крутимся */
      const wp = e.isl
        ? { x: e.isl.x + Math.cos(e.wa) * (e.isl.r + 72), y: e.isl.y + Math.sin(e.wa) * (e.isl.r + 72) }
        : null;
      if (wp) {
        const da = angDiff(e.ang, Math.atan2(wp.y - e.y, wp.x - e.x));
        e.ang += clamp(da, -1, 1) * ST.turn * 0.85 * dt;
        e.spd = approach(e.spd, ST.spd * 0.5, 1.5, dt);
        if (dist(e.x, e.y, wp.x, wp.y) < 26) e.wa += rr(1.2, 2.6) * (chance(0.5) ? -1 : 1);
      } else {
        e.wa += dt * 0.25;
        e.ang += clamp(angDiff(e.ang, e.wa), -1, 1) * ST.turn * 0.6 * dt;
        e.spd = approach(e.spd, ST.spd * 0.45, 1.5, dt);
      }
      const seesConvoy = transport && !transport.dead && !transport.done &&
                         dist(e.x, e.y, transport.x, transport.y) < ST.radar;
      if ((seesConvoy || (dp < ST.radar && !losBlocked(e.x, e.y, P.x, P.y))) && !nightQuiet()) {
        e.state = 'fight'; e.alertT = 0.6;
      }
    } else {
      const tg = enemyTarget(e);
      const dtg = dist(e.x, e.y, tg.x, tg.y);
      if ((dp > ST.radar * 1.5 && dtg > ST.radar * 1.5) || (P.dead && tg === P)) e.state = 'patrol';
      else {
        const da = angDiff(e.ang, Math.atan2(tg.y - e.y, tg.x - e.x));
        e.ang += clamp(da, -1, 1) * ST.turn * dt;
        /* ракетный держится далеко, катер лезет в упор */
        const keep = ST.keep || (ST.tough ? 200 : 150);
        const want = dtg > keep + 60 ? ST.spd : dtg < keep - 40 ? -ST.spd * 0.45 : ST.spd * 0.25;
        e.spd = approach(e.spd, want, 2, dt);
        if (e.cool <= 0 && dtg < ST.rng && Math.abs(da) < 0.95 && !losBlocked(e.x, e.y, tg.x, tg.y))
          enemyFire(e, dtg, tg);
      }
    }

    /* обход островов */
    for (const isl of islands) {
      const dx = e.x - isl.x, dy = e.y - isl.y, d2v = dx * dx + dy * dy, rq = isl.r + 38;
      if (d2v < rq * rq) { const away = Math.atan2(dy, dx); e.ang += clamp(angDiff(e.ang, away), -1, 1) * 3.2 * dt; }
    }

    e.x += Math.cos(e.ang) * e.spd * dt;
    e.y += Math.sin(e.ang) * e.spd * dt;
    e.x = clamp(e.x, 10, WORLD.w - 10);
    e.y = clamp(e.y, 10, WORLD.h - 10);
    collideIslands(e, ST.r);

    /* крен и след */
    e.roll = approach(e.roll, -angDiff(prevAng, e.ang) / Math.max(dt, 0.001) * 0.06, 6, dt);
    if (Math.abs(e.spd) > 20) {
      e.wakeT -= dt;
      if (e.wakeT <= 0) e.wakeT = 0.055;       /* след рисует shipWake (vfx.js) */
      if (chance(0.35))
        addP({ x: e.x - Math.cos(e.ang) * 9, y: e.y - Math.sin(e.ang) * 9, vx: rr(-4, 4), vy: rr(-4, 4),
               life: 0.5, max: 0.5, size: 0.6, col: 'rgba(220,245,248,0.65)', layer: 0 });
    }

    if (e.hp < e.max * 0.4) {
      e.smk -= dt;
      if (e.smk <= 0) {
        e.smk = 0.12;
        addP({ x: e.x, y: e.y, vx: rr(-4, 4), vy: rr(-10, -3), life: 0.95, max: 0.95, size: 2.2,
               col: '#4a545e', type: 'smoke' });
      }
    }

    /* таран */
    if (!P.dead && dist(e.x, e.y, P.x, P.y) < 8 + ST.r) {
      damagePlayer(6 + level);
      e.hp -= 12; e.flash = 0.15;
      const a = Math.atan2(P.y - e.y, P.x - e.x);
      P.x += Math.cos(a) * 6; P.y += Math.sin(a) * 6;
      e.x -= Math.cos(a) * 6; e.y -= Math.sin(a) * 6;
      P.spd *= 0.6; e.spd *= 0.6;
      boom((e.x + P.x) / 2, (e.y + P.y) / 2, 0.5);
    }

    if (e.hp <= 0) killEnemy(e, i);
  }

  /* пополнение флота — зависит от тревоги */
  shipT -= dt;
  const target = curCfg.enemies + Math.min(4, Math.floor(alert * 1.2));
  if (shipT <= 0) {
    shipT = Math.max(3, 6 - alert * 0.8);
    if (enemies.length < target) spawnEnemy();
  }
}

/* ============================================================
   ФЛАГМАНЫ. Каждый круг приходит другой:
     leviathan — линкор: веер главного калибра и ракетные залпы;
     carrier   — авианосец: сам почти не стреляет, но поднимает
                 авиагруппу волна за волной, вблизи огрызается флаком;
     monitor   — монитор: навесная артиллерия на полкарты с кругами
                 накрытия, медленный и очень живучий.
   ============================================================ */
const BOSS_NAME_KEY = { leviathan: 'bossName', carrier: 'bossName2', monitor: 'bossName3' };
const bossTitle = () => T(BOSS_NAME_KEY[(boss && boss.kind) || curCfg.bossKind || 'leviathan']);
const bossArt = k => BOSS_ART[k] || BOSS_ART.leviathan;

function spawnBoss() {
  const kind = curCfg.bossKind || 'leviathan';
  const side = chance(0.5) ? 1 : -1;
  const tough = kind === 'monitor' ? 1.35 : kind === 'carrier' ? 1.15 : 1;
  const bhp = (curCfg.bossHp || BOSS.hp) * tough * diff().hp;
  boss = {
    kind,
    x: clamp(player.x + 520 * side, 120, WORLD.w - 120),
    y: clamp(player.y + rr(-200, 200), 120, WORLD.h - 120),
    ang: 0, spd: 0, hp: bhp, max: bhp,
    cool: 2, saloCool: 6, aaCool: 3, flash: 0, phase: 1, wakeT: 0, roll: 0, dead: false,
    launchQ: 0, launchT: 0,
    tur: [0, 0, 0, 0], turRec: [0, 0, 0, 0]
  };
  banner = { main: T('mAlarm'), sub: bossTitle(), t: 4.2 };
  msg(T('mBossComing', bossTitle()), '#e5484d', 5);
  alert = 3;
  SFX.bossAlarm();
}

/* залп главного калибра из ближайшей к цели башни */
function bossSalvo(B, a, n, spread, spd, dmg, life) {
  const art = bossArt(B.kind);
  let ti = 0, best = 9;
  for (let i = 0; i < art.turrets.length; i++) {
    const d = Math.abs(angDiff(B.tur[i], a));
    if (d < best) { best = d; ti = i; }
  }
  const off = (art.turrets[ti] || 0) * art.len;
  const mx = B.x - Math.cos(B.ang) * off, my = B.y - Math.sin(B.ang) * off;
  B.turRec[ti] = 3.2;
  for (let i = 0; i < n; i++) {
    const q = (i - (n - 1) / 2) * spread;
    shells.push({ x: mx + Math.cos(a) * 14, y: my + Math.sin(a) * 14,
                  vx: Math.cos(a + q) * spd, vy: Math.sin(a + q) * spd,
                  life, from: 'e', dmg, dead: false });
  }
  muzzle(mx + Math.cos(a) * 16, my + Math.sin(a) * 16, a, 1.6);
  addShake(1.2, B.x, B.y);
  sndAt(mx, my); SFX.eshoot();
}

function updBoss(dt) {
  if (!boss) return;
  const B = boss, P = player;
  const art = bossArt(B.kind);
  B.flash -= dt; B.cool -= dt; B.saloCool -= dt; B.aaCool -= dt;
  B.phase = B.hp > B.max * 0.6 ? 1 : B.hp > B.max * 0.28 ? 2 : 3;

  /* башни доворачиваются на игрока и откатываются после залпа */
  const ta = P.dead ? B.ang : Math.atan2(P.y - B.y, P.x - B.x);
  for (let i = 0; i < 4; i++) {
    B.tur[i] += clamp(angDiff(B.tur[i], ta), -1.5 * dt, 1.5 * dt);
    B.turRec[i] = Math.max(0, B.turRec[i] - dt * 9);
  }

  if (!P.dead) {
    const dp = dist(B.x, B.y, P.x, P.y);
    const da = angDiff(B.ang, Math.atan2(P.y - B.y, P.x - B.x));
    const pvx = Math.cos(P.ang) * P.spd, pvy = Math.sin(P.ang) * P.spd;
    const aim = Math.atan2(P.y + pvy * 0.45 - B.y, P.x + pvx * 0.45 - B.x);

    if (B.kind === 'carrier') {
      /* держится подальше и всё время поднимает авиагруппу */
      B.ang += clamp(da, -1, 1) * 0.45 * dt;
      B.spd = approach(B.spd, dp < 320 ? -34 : 48, 1.0, dt);
      if (B.aaCool <= 0) {
        B.aaCool = B.phase === 3 ? 5.5 : B.phase === 2 ? 7 : 9;
        B.launchQ = 1 + B.phase;               /* самолёты уходят по одному, а не залпом */
        B.launchT = 0;
        msg(T('mBossLaunch'), '#ff9ad5', 2);
        SFX.bossAlarm();
      }
      /* вблизи огрызается зенитками */
      if (B.cool <= 0 && dp < 220) {
        B.cool = 0.5;
        for (let i = 0; i < 2; i++) {
          const q = aim + rr(-0.16, 0.16);
          shells.push({ x: B.x + Math.cos(q) * 18, y: B.y + Math.sin(q) * 18,
                        vx: Math.cos(q) * 250, vy: Math.sin(q) * 250,
                        life: 1.1, from: 'e', dmg: curCfg.eDmg * 0.75, dead: false });
        }
        muzzle(B.x + Math.cos(aim) * 20, B.y + Math.sin(aim) * 20, aim, 0.8);
        sndAt(B.x, B.y); SFX.mg();
      }

    } else if (B.kind === 'monitor') {
      /* ползёт медленно, бьёт навесом почти через всю карту */
      B.ang += clamp(da, -1, 1) * 0.35 * dt;
      B.spd = approach(B.spd, dp > 300 ? 30 : dp < 170 ? -18 : 10, 0.8, dt);
      if (B.cool <= 0 && dp < 620) {
        B.cool = B.phase === 3 ? 2.6 : B.phase === 2 ? 3.2 : 4.0;
        const n = 1 + B.phase;
        for (let i = 0; i < n; i++) {
          arcs.push({ x0: B.x, y0: B.y,
                      x1: clamp(P.x + pvx * 0.9 + rr(-34, 34), 10, WORLD.w - 10),
                      y1: clamp(P.y + pvy * 0.9 + rr(-34, 34), 10, WORLD.h - 10),
                      t: -i * 0.18, dur: 2.1, dmg: curCfg.eDmg * 2.2, rad: 40, from: 'bomb' });
        }
        muzzle(B.x + Math.cos(aim) * 18, B.y + Math.sin(aim) * 18, aim, 2.0);
        addShake(2.0, B.x, B.y);
        sndAt(B.x, B.y); SFX.boom(0.8);
      }
      /* в упор работает казематами */
      if (B.saloCool <= 0 && dp < 200) {
        B.saloCool = 1.6;
        bossSalvo(B, aim, 2, 0.10, 215, curCfg.eDmg * 1.2, 1.6);
      }

    } else {
      /* линкор: веер главного калибра плюс ракетные залпы */
      B.ang += clamp(da, -1, 1) * 0.55 * dt;
      B.spd = approach(B.spd, dp > 260 ? 62 : dp < 150 ? -25 : 18, 1.2, dt);
      if (B.cool <= 0 && dp < 430) {
        B.cool = B.phase === 3 ? 1.3 : B.phase === 2 ? 1.7 : 2.2;
        bossSalvo(B, aim, 2 + B.phase, 0.075, 230, curCfg.eDmg * 1.5, 2.2);
      }
      if (B.saloCool <= 0) {
        B.saloCool = B.phase === 3 ? 5.5 : 8;
        for (let i = 0; i < 2 + B.phase; i++) {
          const a = Math.atan2(P.y - B.y, P.x - B.x) + rr(-0.7, 0.7);
          eMissiles.push({ x: B.x, y: B.y, ang: a, spd: 60, life: 6, dmg: curCfg.eDmg * 1.6, dead: false });
        }
        msg(T('mBossSalvo'), '#ff6b3d', 1.6);
        sndAt(B.x, B.y); SFX.rocket();
      }
      if (B.aaCool <= 0 && B.phase >= 2) { B.aaCool = 12; spawnPlane(true); }
    }
  }

  /* очередь взлёта авиагруппы */
  if (B.launchQ > 0) {
    B.launchT -= dt;
    if (B.launchT <= 0) { B.launchT = 0.45; B.launchQ--; spawnPlane(chance(0.4)); }
  }

  B.x += Math.cos(B.ang) * B.spd * dt;
  B.y += Math.sin(B.ang) * B.spd * dt;
  B.x = clamp(B.x, 60, WORLD.w - 60);
  B.y = clamp(B.y, 60, WORLD.h - 60);
  collideIslands(B, art.r + 2);

  B.wakeT -= dt;
  if (B.wakeT <= 0 && Math.abs(B.spd) > 10) {
    B.wakeT = 0.07;
    /* след флагмана рисует shipWake (vfx.js) */
  }
  if (B.phase >= 2 && chance(0.5))
    addP({ x: B.x + rr(-14, 14), y: B.y + rr(-24, 24), vx: rr(-5, 5), vy: rr(-14, -5),
           life: 1.3, max: 1.3, size: 3, col: '#4a545e', type: 'smoke' });
  if (B.phase === 3 && chance(0.25))
    addP({ x: B.x + rr(-12, 12), y: B.y + rr(-22, 22), life: 0.35, max: 0.35, type: 'fire', size: 4 });

  if (!P.dead && dist(B.x, B.y, P.x, P.y) < art.r + 6) {
    damagePlayer(14);
    const a = Math.atan2(P.y - B.y, P.x - B.x);
    P.x += Math.cos(a) * 14; P.y += Math.sin(a) * 14; P.spd *= 0.4;
  }

  if (B.hp <= 0 && !B.dead) {
    B.dead = true;
    const title = bossTitle();
    for (let k = 0; k < 9; k++) setTimeout(() => {
      if (!boss) return;
      boom(boss.x + rr(-26, 26), boss.y + rr(-40, 40), rr(1.0, 2.0));
    }, k * 150);
    setTimeout(() => {
      if (!boss) return;
      bigBoom(boss.x, boss.y);
      reward(ECON.boss, boss.x, boss.y - 30, '#4ade80');
      msg(T('mBossDown', title), '#4ade80', 4);
      kills.ships++;
      boss = null;
    }, 1500);
  }
}

/* ===== src/entities/planes.js ===== */
;
'use strict';
/* ============================================================
   planes.js — авиация противника: штурмовик и тяжёлый бомбардировщик
   ============================================================ */

function spawnPlane(heavy) {
  if (!player) return;
  const side = (Math.random() * 4) | 0;
  let x, y;
  if (side === 0) { x = rr(0, WORLD.w); y = -30; }
  else if (side === 1) { x = WORLD.w + 30; y = rr(0, WORLD.h); }
  else if (side === 2) { x = rr(0, WORLD.w); y = WORLD.h + 30; }
  else { x = -30; y = rr(0, WORLD.h); }

  const pvx = Math.cos(player.ang) * player.spd, pvy = Math.sin(player.ang) * player.spd;
  const dp = { x: clamp(player.x + pvx * 0.6 + rr(-24, 24), 40, WORLD.w - 40),
               y: clamp(player.y + pvy * 0.6 + rr(-24, 24), 40, WORLD.h - 40) };
  const ang = Math.atan2(dp.y - y, dp.x - x);

  planes.push({
    x, y, ang, heavy: !!heavy,
    spd: (heavy ? rr(90, 110) : rr(118, 158)) + level * 6,
    hp: (heavy ? 60 : 24) + level * 4,
    dp, drops: heavy ? 3 : 1, dropT: 0, smk: 0, bank: 0, engT: 0
  });
  if (heavy) msg(T('mAirTarget'), '#ff9ad5', 2.5);
}

function updPlanes(dt) {
  planeT -= dt;
  if (planeT <= 0) {
    planeT = Math.max(5, curCfg.plane - destroyedBases * 1.2 - alert * 1.1);
    spawnPlane(level >= 3 && chance(0.25));
  }

  for (let i = planes.length - 1; i >= 0; i--) {
    const p = planes[i];
    p.x += Math.cos(p.ang) * p.spd * dt;
    p.y += Math.sin(p.ang) * p.spd * dt;
    p.bank = approach(p.bank, 0, 3, dt);

    /* сброс бомб над точкой прицеливания */
    if (p.drops > 0 && dist(p.x, p.y, p.dp.x, p.dp.y) < 18) {
      p.dropT -= dt;
      if (p.dropT <= 0) {
        p.dropT = 0.35;
        p.drops--;
        const pvx = Math.cos(player.ang) * player.spd, pvy = Math.sin(player.ang) * player.spd;
        arcs.push({ x0: p.x, y0: p.y,
                    x1: clamp(player.x + pvx * 0.35 + rr(-8, 8), 8, WORLD.w - 8),
                    y1: clamp(player.y + pvy * 0.35 + rr(-8, 8), 8, WORLD.h - 8),
                    t: 0, dur: 1.1, dmg: (p.heavy ? 30 : 24) + level * 3, rad: p.heavy ? 32 : 26, from: 'bomb' });
        if (p.drops > 0) p.dp = { x: p.x + Math.cos(p.ang) * 70, y: p.y + Math.sin(p.ang) * 70 };
      }
    }

    /* инверсионный след */
    p.engT -= dt;
    if (p.engT <= 0) {
      p.engT = 0.06;
      addP({ x: p.x - Math.cos(p.ang) * 6, y: p.y - Math.sin(p.ang) * 6, vx: rr(-3, 3), vy: rr(-3, 3),
             life: 0.5, max: 0.5, size: 0.7, col: 'rgba(230,245,250,0.32)' });
    }
    if (p.hp <= (p.heavy ? 24 : 12)) {
      p.smk -= dt;
      if (p.smk <= 0) {
        p.smk = 0.08;
        addP({ x: p.x, y: p.y, vx: rr(-6, 6), vy: rr(-6, 6), life: 0.85, max: 0.85, size: 2.2,
               col: '#4a545e', type: 'smoke' });
      }
    }

    if (p.hp <= 0) {
      boom(p.x, p.y, p.heavy ? 1.8 : 1.2);
      bumpCombo();
      reward(p.heavy ? ECON.planeHeavy : ECON.plane, p.x, p.y, '#7fd4e0');
      kills.planes++;
      /* падающие обломки */
      for (let k = 0; k < 7; k++)
        addP({ x: p.x, y: p.y, vx: rr(-60, 60), vy: rr(-60, 60), g: 80, drag: 1.0,
               life: rr(0.5, 1.1), max: 1.1, size: rr(0.5, 1.4), col: '#39454e', type: 'debris', spin: rr(-10, 10) });
      planes.splice(i, 1);
      continue;
    }
    if (p.x < -90 || p.x > WORLD.w + 90 || p.y < -90 || p.y > WORLD.h + 90) planes.splice(i, 1);
  }
}

/* ===== src/entities/structs.js ===== */
;
'use strict';
/* ============================================================
   structs.js — береговые цели: базы, бункеры, РЛС-вышки, ящики
   ============================================================ */

function damageStruct(s, dmg) {
  s.hp -= dmg;
  s.flash = 0.09;
  s.shakeT = 0.16;
  if (s.hp <= 0) killStruct(s); else { sndAt(s.x, s.y); SFX.hit(); }
}

function killStruct(s) {
  s.dead = true;
  blowCover();
  s.rub = [];
  for (let i = 0; i < 7; i++) s.rub.push([rr(-6, 5), rr(-5, 4), rr(2, 4), rr(1, 3), chance(0.5)]);

  if (s.type === 'crate') {
    boom(s.x, s.y, 0.6, ['#ffd94a', '#ffb454', '#8a6238']);
    const kind = chance(0.5) && upg.msl ? 'ammo' : 'money';
    if (kind === 'ammo') {
      upg.ammo += ECON.crateAmmo;
      addFloat(s.x, s.y - 10, T('fRockets', ECON.crateAmmo), '#7fd4e0');
      SFX.pickup();
    } else reward(ECON.crate, s.x, s.y - 10, '#ffd94a');
    return;
  }

  if (s.type === 'light') {
    boom(s.x, s.y, 1.4);
    reward(ECON.tower * 0.6, s.x, s.y - 16, '#ffd94a');
    kills.bunkers++;
    return;
  }

  if (s.type === 'tower') {
    boom(s.x, s.y, 1.5);
    radarHacked = true;
    reward(ECON.tower, s.x, s.y - 14, '#7fd4e0');
    msg(T('mRadarDown'), '#7fd4e0', 4);
    kills.bunkers++;
    return;
  }

  boom(s.x, s.y, s.type === 'base' ? 2.3 : 1.35);
  bumpCombo();

  if (s.type === 'base') {
    bigBoom(s.x, s.y);
    reward(ECON.base, s.x, s.y - 14, '#4ade80');
    kills.bases++; destroyedBases++;
    alert = Math.min(3, alert + 1);
    msg(T('mBaseDown', '«' + islName(s.isl) + '»'), '#4ade80', 3);
    if (chance(0.75)) spawnHostages(s.isl);
    if (destroyedBases >= totalBases) {
      msg(T('mAllBases'), '#4ade80', 4, 1);
      if (curCfg.boss && !boss && !bossKilled) bossTimer = 1.6;
    } else {
      msg(T('mBasesLeft', totalBases - destroyedBases), '#ffb454', 3, 1.2);
    }
  } else {
    reward(ECON.bunker, s.x, s.y - 12, '#ffd94a');
    kills.bunkers++;
  }
}

/* тихая фаза ночной операции: пока не засекли, берег не стреляет */
const nightQuiet = () => curCfg.mission === 'night' && !stealth.blown;

function blowCover(silent) {
  if (curCfg.mission !== 'night' || stealth.blown) return;
  stealth.blown = true;
  stealth.meter = 1;
  alert = 3;
  if (!silent) { msg(T('mSpotted'), '#e5484d', 4); SFX.alarm(); }
  for (let i = 0; i < 3; i++) spawnEnemy();
}

/* лучи маяков: держат игрока в свету — и через пару секунд поднимают тревогу */
function updStealth(dt) {
  if (curCfg.mission !== 'night' || !player || player.dead) return;
  let lit = false;
  for (const s of structs) {
    if (s.type !== 'light' || s.dead) continue;
    const d = dist(s.x, s.y, player.x, player.y);
    if (d > s.range) continue;
    if (Math.abs(angDiff(s.rad, Math.atan2(player.y - s.y, player.x - s.x))) < s.arc * 0.5 &&
        !losBlocked(s.x, s.y, player.x, player.y)) { lit = true; break; }
  }
  stealth.lit = lit;
  if (stealth.blown) return;
  stealth.meter = clamp(stealth.meter + (lit ? 0.70 : -0.40) * dt, 0, 1);
  if (lit && stealth.meter > 0.12 && !stealth.warned) {
    stealth.warned = true;
    msg(T('mBeamWarn'), '#ffb454', 2.5);
  }
  if (stealth.meter >= 1) blowCover();
}

function updStructs(dt) {
  const P = player;
  for (const s of structs) {
    if (s.shakeT > 0) s.shakeT -= dt;
    if (s.dead) {
      if (s.type !== 'crate' && chance(0.02 * dt * 60))
        addP({ x: s.x + rr(-5, 5), y: s.y + rr(-4, 4), vx: rr(-3, 3), vy: rr(-10, -3),
               life: rr(0.9, 1.6), max: 1.6, size: rr(2, 3), col: '#4a545e', type: 'smoke' });
      continue;
    }
    s.cool -= dt; s.flash -= dt;
    if (s.type === 'base') s.rad += dt * 2;
    if (s.type === 'tower') { s.rad += dt * 1.4; continue; }
    if (s.type === 'light') { s.rad += s.spin * dt; continue; }
    if (s.type === 'crate') continue;
    if (P.dead || state !== 'play' || nightQuiet()) continue;

    const d = dist(s.x, s.y, P.x, P.y);
    const range = s.type === 'base' ? 400 : 350;
    if (d < range && s.cool <= 0 && !losBlocked(s.x, s.y, P.x, P.y)) {
      const pvx = Math.cos(P.ang) * P.spd, pvy = Math.sin(P.ang) * P.spd;
      if (s.type === 'bunker') {
        s.cool = (2.6 + Math.random()) * (1 - alert * 0.06);
        s.flash = 0.08;
        arcs.push({ x0: s.x, y0: s.y, x1: P.x + pvx * 0.8 + rr(-12, 12), y1: P.y + pvy * 0.8 + rr(-12, 12),
                    t: 0, dur: 1.5, dmg: 16 + level * 2, rad: 22, from: 'mortar' });
        sndAt(s.x, s.y); SFX.eshoot();
      } else {
        s.cool = (1.9 + Math.random() * 0.6) * (1 - alert * 0.06);
        s.flash = 0.08;
        const a = Math.atan2(P.y + pvy * 0.4 - s.y, P.x + pvx * 0.4 - s.x);
        for (const off of [-0.06, 0.06])
          shells.push({ x: s.x, y: s.y, vx: Math.cos(a + off) * 210, vy: Math.sin(a + off) * 210,
                        life: 1.9, from: 'e', dmg: curCfg.eDmg, dead: false });
        muzzle(s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8, a, 0.8);
        sndAt(s.x, s.y); SFX.eshoot();
      }
    }
  }
}

/* ===== src/entities/projectiles.js ===== */
;
'use strict';
/* ============================================================
   projectiles.js — снаряды, навесной огонь, ракеты «Гарпун»,
                    вражеские ракеты и морские мины
   ============================================================ */

/* ---------- ракеты игрока ---------- */
function fireMissile() {
  if (!player || player.dead) return;
  if (upg.msl < 1) { msg(T('mNoLauncher'), '#e5484d', 2); return; }
  if (upg.ammo <= 0) { msg(T('mNoAmmo'), '#e5484d', 2); return; }
  if (mCool > 0) return;
  mCool = 0.5; upg.ammo--;
  const a = Math.atan2(mouseWY() - player.y, mouseWX() - player.x);
  missiles.push({ x: player.x, y: player.y, ang: a, spd: 120, life: 3.4, trail: 0 });
  addShake(1);
  muzzle(player.x + Math.cos(a) * 8, player.y + Math.sin(a) * 8, a, 1.2);
  SFX.rocket();
}

function nearestTarget(x, y, r) {
  let best = null, bd = r;
  for (const e of enemies) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  /* ракета наводится только на всплывшую лодку */
  for (const s of subs) if (subExposed(s)) { const d = dist(x, y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
  for (const p of planes) { const d = dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
  for (const s of structs) if (!s.dead && s.type !== 'crate') { const d = dist(x, y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
  if (boss && !boss.dead) { const d = dist(x, y, boss.x, boss.y); if (d < bd) { bd = d; best = boss; } }
  return best;
}

const mslDmg = k => k * (hasPerk('harp') ? 1.35 : 1);

function detMissile(m) {
  boom(m.x, m.y, 1.35);
  const R = 26;
  for (const e of enemies) if (dist(m.x, m.y, e.x, e.y) < R) { e.hp -= mslDmg(38); e.flash = 0.15; }
  for (const p of planes)  if (dist(m.x, m.y, p.x, p.y) < R) p.hp -= mslDmg(38);
  for (const s of structs) if (!s.dead && dist(m.x, m.y, s.x, s.y) < R) damageStruct(s, mslDmg(38));
  for (const mn of mines)  if (dist(m.x, m.y, mn.x, mn.y) < R) mn.hp -= 38;
  for (let k = subs.length - 1; k >= 0; k--) {
    const s = subs[k];
    if (dist(m.x, m.y, s.x, s.y) < R && damageSub(s, mslDmg(38)) && s.hp <= 0) killSub(s, k);
  }
  if (boss && !boss.dead && dist(m.x, m.y, boss.x, boss.y) < R + bossArt(boss.kind).r * 0.6) {
    boss.hp -= mslDmg(45); boss.flash = 0.14;
  }
}

function updMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    const t = nearestTarget(m.x, m.y, 340);
    if (t) {
      const ta = Math.atan2(t.y - m.y, t.x - m.x);
      m.ang += clamp(angDiff(m.ang, ta), -4.5 * dt, 4.5 * dt);
    }
    m.spd = Math.min(290, m.spd + 240 * dt);
    m.x += Math.cos(m.ang) * m.spd * dt;
    m.y += Math.sin(m.ang) * m.spd * dt;
    m.life -= dt;

    m.trail -= dt;
    if (m.trail <= 0) {
      m.trail = 0.02;
      addP({ x: m.x - Math.cos(m.ang) * 5, y: m.y - Math.sin(m.ang) * 5, vx: rr(-6, 6), vy: rr(-6, 6),
             life: 0.5, max: 0.5, size: 1.3, col: 'rgba(215,228,232,0.65)', type: 'smoke' });
      addLight(m.x, m.y, 14, '#ffb454', 0.08);
    }

    let dead = false;
    for (const e of enemies) if (dist(m.x, m.y, e.x, e.y) < 10) { dead = true; break; }
    if (!dead) for (const p of planes) if (dist(m.x, m.y, p.x, p.y) < 10) { dead = true; break; }
    if (!dead) for (const s of structs) if (!s.dead && dist(m.x, m.y, s.x, s.y) < s.r + 3) { dead = true; break; }
    if (!dead) for (const s of subs) if (subExposed(s) && dist(m.x, m.y, s.x, s.y) < 10) { dead = true; break; }
    if (!dead && boss && !boss.dead && dist(m.x, m.y, boss.x, boss.y) < bossArt(boss.kind).r) dead = true;
    if (!dead && !isWater(m.x, m.y)) dead = true;
    if (m.life <= 0) dead = true;

    if (dead) { detMissile(m); missiles.splice(i, 1); }
  }
}

/* ---------- вражеские ракеты (медленные, но упорные) ---------- */
function updEMissiles(dt) {
  const P = player;
  for (let i = eMissiles.length - 1; i >= 0; i--) {
    const m = eMissiles[i];
    if (m.dead) { boom(m.x, m.y, 0.7); eMissiles.splice(i, 1); continue; }
    if (!P.dead) {
      const ta = Math.atan2(P.y - m.y, P.x - m.x);
      m.ang += clamp(angDiff(m.ang, ta), -2.0 * dt, 2.0 * dt);
    }
    m.spd = Math.min(190, m.spd + 110 * dt);
    m.x += Math.cos(m.ang) * m.spd * dt;
    m.y += Math.sin(m.ang) * m.spd * dt;
    m.life -= dt;
    if (chance(0.8)) {
      addP({ x: m.x - Math.cos(m.ang) * 4, y: m.y - Math.sin(m.ang) * 4, vx: rr(-5, 5), vy: rr(-5, 5),
             life: 0.45, max: 0.45, size: 1.3, col: 'rgba(230,190,180,0.55)', type: 'smoke' });
      addLight(m.x, m.y, 12, '#ff6b3d', 0.07);
    }
    let dead = m.life <= 0;
    if (!dead && !P.dead && dist(m.x, m.y, P.x, P.y) < 10) { damagePlayer(m.dmg); dead = true; }
    if (!dead && transport && !transport.dead && !transport.done &&
        dist(m.x, m.y, transport.x, transport.y) < CONVOY.r) { damageTransport(m.dmg); dead = true; }
    if (!dead && !isWater(m.x, m.y)) dead = true;
    if (dead) { boom(m.x, m.y, 1.0); eMissiles.splice(i, 1); }
  }
}

/* ---------- снаряды ---------- */
function updShells(dt) {
  const P = player;
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    if (s.dead) { addP({ x: s.x, y: s.y, life: 0.18, max: 0.18, type: 'ring', r: 5, col: '#9fe8ff' }); shells.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let dead = false;

    if (s.from === 'p') {
      for (const e of enemies) if (dist(s.x, s.y, e.x, e.y) < 6 + e.T.r) {
        e.hp -= s.dmg; e.flash = 0.15; dead = true;
        for (let k = 0; k < 4; k++)
          addP({ x: s.x, y: s.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#ffd94a' });
        sndAt(s.x, s.y); SFX.clang(); break;
      }
      if (!dead) for (let k = subs.length - 1; k >= 0; k--) {
        const sb = subs[k];
        if (dist(s.x, s.y, sb.x, sb.y) < 6 + SUB.r) {
          if (damageSub(sb, s.dmg)) {
            dead = true;
            for (let q = 0; q < 4; q++)
              addP({ x: s.x, y: s.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#9fe8ff' });
            sndAt(s.x, s.y); SFX.clang();
            if (sb.hp <= 0) killSub(sb, k);
          }
          break;
        }
      }
      if (!dead && boss && !boss.dead && dist(s.x, s.y, boss.x, boss.y) < bossArt(boss.kind).r) {
        boss.hp -= s.dmg; boss.flash = 0.12; dead = true;
        for (let k = 0; k < 5; k++)
          addP({ x: s.x, y: s.y, vx: rr(-50, 50), vy: rr(-50, 50), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#ffd94a' });
        sndAt(s.x, s.y); SFX.clang();
      }
      if (!dead) for (const st of structs) if (!st.dead && dist(s.x, s.y, st.x, st.y) < st.r + 3) {
        damageStruct(st, s.dmg); dead = true;
        for (let k = 0; k < 4; k++)
          addP({ x: s.x, y: s.y, vx: rr(-45, 45), vy: rr(-45, 45), drag: 3, life: 0.22, max: 0.22, size: 0.7, col: '#ffb454' });
        break;
      }
      if (!dead) for (const p of planes) if (dist(s.x, s.y, p.x, p.y) < 8) {
        p.hp -= s.dmg; dead = true;
        addP({ x: s.x, y: s.y, life: 0.25, max: 0.25, type: 'ring', r: 6, col: '#f4f8fa' });
        sndAt(s.x, s.y); SFX.hit(); break;
      }
      if (!dead) for (const mn of mines) if (dist(s.x, s.y, mn.x, mn.y) < 7) { mn.hp -= s.dmg; dead = true; sndAt(s.x, s.y); SFX.clang(); break; }
    } else if (!P.dead && dist(s.x, s.y, P.x, P.y) < 8) {
      damagePlayer(s.dmg); dead = true;
    } else if (transport && !transport.dead && !transport.done &&
               dist(s.x, s.y, transport.x, transport.y) < CONVOY.r) {
      damageTransport(s.dmg * 1.1); dead = true;
    }

    if (!dead && s.life <= 0) {
      dead = true;
      if (isWater(s.x, s.y)) splashFx(s.x, s.y, 0.7);
      else boom(s.x, s.y, s.from === 'p' ? 0.4 : 0.6);
    }
    if (dead) shells.splice(i, 1);
  }
}

/* ---------- навесной огонь (миномёт / бомбы) ---------- */
function updArcs(dt) {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i];
    a.t += dt / a.dur;
    if (a.t >= 1) {
      boom(a.x1, a.y1, a.from === 'bomb' ? 1.6 : 1.05);
      if (!player.dead && dist(a.x1, a.y1, player.x, player.y) < a.rad) damagePlayer(a.dmg);
      if (transport && !transport.dead && dist(a.x1, a.y1, transport.x, transport.y) < a.rad + 8)
        damageTransport(a.dmg);
      for (const e of enemies) if (dist(a.x1, a.y1, e.x, e.y) < a.rad * 0.6) { e.hp -= a.dmg * 0.4; e.flash = 0.12; }
      arcs.splice(i, 1);
    }
  }
}

/* ---------- морские мины ---------- */
function updMines(dt) {
  const P = player;
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.ph += dt;
    let det = false;
    if (m.hp <= 0) det = true;
    if (!P.dead && dist(m.x, m.y, P.x, P.y) < 12) { det = true; damagePlayer(26); }
    if (!det && transport && !transport.dead && dist(m.x, m.y, transport.x, transport.y) < CONVOY.r) {
      det = true; damageTransport(60);
    }
    if (!det) for (const e of enemies) if (dist(m.x, m.y, e.x, e.y) < 12) { det = true; e.hp -= 40; e.flash = 0.15; break; }
    if (det) {
      boom(m.x, m.y, 1.5);
      splashFx(m.x, m.y, 1.6);
      if (m.hp <= 0) { reward(ECON.mine, m.x, m.y - 8, '#7fd4e0'); kills.mines++; }
      mines.splice(i, 1);
    }
  }
}

/* ===== src/entities/hostages.js ===== */
;
'use strict';
/* ============================================================
   hostages.js — заложники: сигнал, ожидание, заплыв, посадка
   ============================================================ */

function spawnHostages(isl, count, quiet) {
  const n = count || (2 + (chance(0.45) ? 1 : 0));
  let placed = 0, tr = 0;
  while (placed < n && tr < 80) {
    tr++;
    const a = rr(0, TAU), d = radiusAt(isl, a) - 3;
    if (d < 8) continue;
    hostages.push({
      x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
      state: 'wait', board: 0.6, wave: Math.random(), isl,
      t: 0, tx: 0, ty: 0, flare: rr(0, 3)
    });
    placed++;
  }
  spawned += placed;
  if (placed && !quiet) {
    msg(T('mDistress', '«' + islName(isl) + '»', placed), '#ffb454', 4);
    SFX.alarm();
    addLight(isl.x, isl.y, 120, '#ffb454', 0.8);
  }
  return placed;
}

function updHostages(dt) {
  const P = player;
  for (let i = hostages.length - 1; i >= 0; i--) {
    const h = hostages[i];

    if (h.state === 'wait') {
      /* сигнальная ракета время от времени */
      h.flare -= dt;
      if (h.flare <= 0) {
        h.flare = rr(3.5, 7);
        addP({ x: h.x, y: h.y - 4, vx: rr(-4, 4), vy: -46, g: 34, life: 1.5, max: 1.5,
               size: 2, col: '#ff8b3d', type: 'flare' });
        addLight(h.x, h.y - 14, 40, '#ff8b3d', 0.6);
      }
      continue;
    }

    if (h.state === 'swim') {
      if (P.dead) { h.state = 'wait'; h.board = 0.6; continue; }
      h.t += dt;
      const a = Math.atan2(P.y - h.y, P.x - h.x);
      h.x += Math.cos(a) * 46 * dt;
      h.y += Math.sin(a) * 46 * dt;
      if (chance(0.4))
        addP({ x: h.x, y: h.y, vx: rr(-5, 5), vy: rr(-5, 5), life: 0.4, max: 0.4, size: 0.6,
               col: 'rgba(220,245,248,0.7)', layer: 0 });
      if (dist(h.x, h.y, P.x, P.y) < 11 || h.t > 6) {
        if (P.aboard < capacity()) {
          h.state = 'aboard'; P.aboard++;
          reward(ECON.hostageTake, P.x, P.y - 12, '#ffb454');
          SFX.pickup();
          addP({ x: P.x, y: P.y, life: 0.3, max: 0.3, type: 'ring', r: 10, col: '#ffb454' });
          if (!hints.c) { hints.c = true; msg(T('mTakeThem', T('carrier')), '#4ade80', 4, 0.5); }
        } else { h.state = 'wait'; h.board = 0.6; }
        hostages.splice(i, 1);
      }
    }
  }
}

/* ===== src/entities/pickups.js ===== */
;
'use strict';
/* ============================================================
   pickups.js — плавающие контейнеры: ремонт и боезапас
   ============================================================ */

function updPickups(dt) {
  const P = player;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    /* мигают перед исчезновением */
    if (p.life <= 0) { pickups.splice(i, 1); continue; }
    if (!P.dead && dist(p.x, p.y, P.x, P.y) < (p.type === 'coin' || p.type === 'buff' ? 16 : 14)) {
      if (p.type === 'buff') giveBuff(p.kind, p.x, p.y);
      else if (p.type === 'coin') reward(45, p.x, p.y - 8, '#ffd94a');
      else if (p.type === 'repair') {
        P.hp = Math.min(P.maxhp, P.hp + 20);
        addFloat(p.x, p.y - 8, T('fRepair'), '#4ade80');
      } else {
        upg.ammo += 3;
        addFloat(p.x, p.y - 8, T('fRockets', 3), '#7fd4e0');
      }
      addP({ x: p.x, y: p.y, life: 0.3, max: 0.3, type: 'ring', r: 12, col: '#4ade80' });
      SFX.pickup();
      evPicked(p);
      pickups.splice(i, 1);
    }
  }
}

function drawPickups() {
  for (const p of pickups) {
    const by = p.y + Math.sin(tGlobal * 3 + p.ph) * 1.6;
    if (p.life < 5 && Math.floor(p.life * 6) % 2) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x - 3, by + 3, 7, 2);
    if (p.type === 'buff') { drawBuffPickup(p, by); continue; }
    if (p.type === 'coin') { drawCoin(p, by); continue; }
    if (p.type === 'repair') {
      ctx.fillStyle = '#ff8b3d'; ctx.fillRect(p.x - 3, by - 3, 7, 7);
      ctx.fillStyle = '#f4f8fa'; ctx.fillRect(p.x - 0.5, by - 2, 2, 5); ctx.fillRect(p.x - 2, by - 0.5, 5, 2);
    } else {
      ctx.fillStyle = '#2f6b7a'; ctx.fillRect(p.x - 3, by - 3, 7, 7);
      ctx.fillStyle = '#7fd4e0'; ctx.fillRect(p.x - 2, by - 2, 2, 5);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(p.x + 1, by - 2, 2, 2);
    }
  }
}

/* ===== src/entities/allies.js ===== */
;
'use strict';
/* ============================================================
   allies.js — десантная операция.

   На одном острове ждёт группа морпехов: её надо подобрать так же,
   как заложников, довезти до острова-цели и высадить. Дальше отряд
   сам идёт на огневые точки, но без поддержки с воды его перебьют —
   задача игрока подавлять бункеры, пока десант работает.
   ============================================================ */

const SQUAD_HP = 72;

function spawnMarines(isl, n) {
  let placed = 0, tr = 0;
  while (placed < n && tr < 120) {
    tr++;
    const a = rr(0, TAU), d = radiusAt(isl, a) - 3;
    if (d < 8) continue;
    marines.push({
      x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
      state: 'wait', board: 0.6, wave: Math.random(), isl, t: 0,
      face: a                                  /* стоят лицом к воде */
    });
    placed++;
  }
  return placed;
}

/* ---------- посадка на катер ---------- */
function updMarines(dt) {
  const P = player;
  for (let i = marines.length - 1; i >= 0; i--) {
    const m = marines[i];

    if (m.state === 'wait') {
      if (!P.dead && dist(P.x, P.y, m.x, m.y) < 32 && Math.abs(P.spd) < 55 &&
          P.aboard + P.troops < capacity()) {
        m.board -= dt;
        if (m.board <= 0) { m.state = 'swim'; m.t = 0; }
      } else m.board = Math.max(m.board, 0.35);
      continue;
    }

    if (m.state === 'swim') {
      if (P.dead) { m.state = 'wait'; m.board = 0.6; continue; }
      m.t += dt;
      const a = Math.atan2(P.y - m.y, P.x - m.x);
      m.x += Math.cos(a) * 52 * dt;
      m.y += Math.sin(a) * 52 * dt;
      if (chance(0.4))
        addP({ x: m.x, y: m.y, vx: rr(-5, 5), vy: rr(-5, 5), life: 0.4, max: 0.4,
               size: 0.6, col: 'rgba(220,245,248,0.7)', layer: 0 });
      if (dist(m.x, m.y, P.x, P.y) < 11 || m.t > 6) {
        if (P.aboard + P.troops < capacity()) {
          P.troops++;
          SFX.pickup();
          addP({ x: P.x, y: P.y, life: 0.3, max: 0.3, type: 'ring', r: 10, col: '#6fae5a' });
          msg(T('mMarinesUp', P.troops), '#6fae5a', 1.6);
        } else { m.state = 'wait'; m.board = 0.6; continue; }
        marines.splice(i, 1);
      }
    }
  }
}

/* ---------- высадка ---------- */
function tryLanding() {
  const P = player;
  if (!targetIsl || P.troops <= 0 || P.dead) return;
  const a = Math.atan2(P.y - targetIsl.y, P.x - targetIsl.x);
  const sh = radiusAt(targetIsl, a);
  if (dist(P.x, P.y, targetIsl.x, targetIsl.y) > sh + 40) return;

  const n = P.troops; P.troops = 0; landed += n;
  for (let i = 0; i < n; i++) {
    const aa = a + rr(-0.22, 0.22);
    const d = radiusAt(targetIsl, aa) - rr(2, 8);
    squad.push({
      x: targetIsl.x + Math.cos(aa) * d, y: targetIsl.y + Math.sin(aa) * d,
      ang: aa + Math.PI, bodyAng: aa + Math.PI, hp: SQUAD_HP, cool: rr(0.4, 1.2), step: 0, fire: 0
    });
  }
  msg(T('mMarinesGo'), '#6fae5a', 3);
  SFX.evac();
  for (let i = 0; i < 14; i++)
    addP({ x: P.x + rr(-8, 8), y: P.y + rr(-8, 8), vx: rr(-14, 14), vy: rr(-20, -6),
           g: 40, life: rr(0.5, 1), max: 1, size: 1.2, col: '#6fae5a' });
}

/* ближайшая живая постройка острова-цели */
function squadTarget(s) {
  let best = null, bd = 1e9;
  for (const st of structs) {
    if (st.isl !== targetIsl || st.dead || st.type === 'crate') continue;
    const d = dist(s.x, s.y, st.x, st.y);
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

function updSquad(dt) {
  for (let i = squad.length - 1; i >= 0; i--) {
    const s = squad[i];
    s.cool -= dt; s.fire = Math.max(0, s.fire - dt);
    const tgt = squadTarget(s);

    if (tgt) {
      const d = dist(s.x, s.y, tgt.x, tgt.y);
      const a = Math.atan2(tgt.y - s.y, tgt.x - s.x);
      s.ang = a;
      if (d > 30) {                                   /* подходим на дистанцию огня */
        s.x += Math.cos(a) * 26 * dt;
        s.y += Math.sin(a) * 26 * dt;
        s.bodyAng = a;                                /* корпус развёрнут по ходу */
        s.step += dt * 6;
      } else if (s.cool <= 0) {                       /* короткая очередь по амбразуре */
        s.cool = rr(0.8, 1.3);
        s.fire = 0.12;
        damageStruct(tgt, 12);
        muzzle(s.x + Math.cos(a) * 3, s.y + Math.sin(a) * 3, a, 0.35);
        SFX.mg();
      }
      /* огневая точка бьёт в ответ: без поддержки с воды отряд не выстоит */
      if (d < 62 && chance(0.34 * dt)) {
        s.hp -= 22;
        addP({ x: s.x, y: s.y, vx: rr(-20, 20), vy: rr(-20, 20), life: 0.2, max: 0.2,
               size: 0.7, col: '#ffb454' });
      }
    }

    if (s.hp <= 0) {
      boom(s.x, s.y, 0.35, ['#c8484d', '#8a5a3a']);
      squad.splice(i, 1);
      if (!squad.length && landed > 0 && !allTargetStructsDead())
        msg(T('mMarinesDead'), '#e5484d', 3);
    }
  }
}

function allTargetStructsDead() {
  if (!targetIsl) return false;
  return !structs.some(s => s.isl === targetIsl && !s.dead && s.type !== 'crate');
}

/* ---------- отрисовка ---------- */
function drawMarines() {
  for (const m of marines) {
    if (m.state === 'aboard') continue;
    if (m.state === 'swim') {
      const face = Math.atan2(player.y - m.y, player.x - m.x);
      drawTrooper(TROOP_MARINE, m.x, m.y, face, face, { mode: 'swim', seed: m.wave });
      continue;
    }
    drawTrooper(TROOP_MARINE, m.x, m.y, m.face, m.face, { seed: m.wave });
    if (m.state === 'wait' && Math.floor(tGlobal * 2) % 2) {
      ctx.fillStyle = '#6fae5a';
      ctx.fillRect(m.x - 0.45, m.y - 9.5, 0.9, 2.6);
    }
  }
}

function drawSquad() {
  for (const s of squad) {
    /* идёт, пока растёт фаза шага; остановился — плавно встаёт в стойку */
    s.mv = (s.mv || 0) + ((s.step !== s.ps ? 1 : 0) - (s.mv || 0)) * 0.2;
    s.ps = s.step;
    /* корпус стоит как шёл, руки с оружием доворачиваются на цель */
    drawTrooper(TROOP_MARINE, s.x, s.y, s.bodyAng, s.ang, { walk: s.step, move: s.mv, fire: s.fire, seed: s.x * 0.013 });
    if (s.fire > 0) {
      const mx2 = s.x + Math.cos(s.ang) * TROOP_MUZZLE;
      const my2 = s.y - HUMAN_LIFT + Math.sin(s.ang) * TROOP_MUZZLE;
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(mx2 - 0.9, my2 - 0.9, 1.8, 1.8);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(mx2 - 0.5, my2 - 0.5, 1, 1);
    }
    if (s.hp < SQUAD_HP) {
      ctx.fillStyle = 'rgba(6,16,24,0.8)'; ctx.fillRect(s.x - 3, s.y - 6.5, 6, 1.8);
      ctx.fillStyle = '#6fae5a'; ctx.fillRect(s.x - 2.6, s.y - 6.1, 5.2 * (s.hp / SQUAD_HP), 1);
    }
  }
}

/* ===== src/entities/hazards.js ===== */
;
'use strict';
/* ============================================================
   hazards.js — смерчи.

   В ливень над водой встают водяные смерчи. Они не разбирают своих
   и чужих: тянут к себе всё, что рядом, рвут обшивку вражеских
   кораблей и катера игрока одинаково. Обходить их — часть манёвра.
   ============================================================ */

const TORN_R = 46;          /* радиус притяжения */
const TORN_KILL = 17;       /* внутри этого радиуса рвёт корпус */
let tornT = 0, tornWarnT = 0;

function maxTornados() { return Math.min(3, 1 + (curCfg.cycle || 0)); }

function spawnTornado() {
  for (let t = 0; t < 40; t++) {
    const x = rr(120, WORLD.w - 120), y = rr(120, WORLD.h - 120);
    if (!isWater(x, y)) continue;
    if (player && dist(x, y, player.x, player.y) < 300) continue;
    if (dist(x, y, CARR.x, CARR.y) < 340) continue;
    const wind = (curCfg.weather && curCfg.weather.wind) || 0;
    tornados.push({
      x, y,
      ang: Math.atan2(rr(-0.6, 0.6), wind >= 0 ? 1 : -1),
      spd: rr(26, 44), life: rr(26, 46), age: 0,
      phase: rr(0, TAU), wob: rr(0, TAU), grow: 0
    });
    return true;
  }
  return false;
}

function updTornados(dt) {
  if (!curCfg.tornado) return;

  tornT -= dt;
  if (tornT <= 0) {
    tornT = rr(12, 22);
    if (tornados.length < maxTornados()) spawnTornado();
  }
  tornWarnT -= dt;

  for (let i = tornados.length - 1; i >= 0; i--) {
    const T2 = tornados[i];
    T2.age += dt; T2.life -= dt;
    T2.phase += dt * 5.5;
    T2.wob += dt * 0.7;
    /* рождается и умирает плавно, чтобы не бить внезапно */
    T2.grow = Math.min(1, Math.min(T2.age / 2.2, Math.max(0, T2.life / 2.2)));

    /* блуждающий дрейф с поправкой на ветер */
    T2.ang += Math.sin(T2.wob) * 0.5 * dt;
    T2.x += Math.cos(T2.ang) * T2.spd * dt;
    T2.y += Math.sin(T2.ang) * T2.spd * dt;
    if (T2.x < 80 || T2.x > WORLD.w - 80) { T2.ang = Math.PI - T2.ang; T2.x = clamp(T2.x, 80, WORLD.w - 80); }
    if (T2.y < 80 || T2.y > WORLD.h - 80) { T2.ang = -T2.ang; T2.y = clamp(T2.y, 80, WORLD.h - 80); }

    const R = TORN_R * T2.grow, KILL = TORN_KILL * T2.grow;

    /* брызги и мусор в воронке */
    for (let k = 0; k < 3; k++) {
      const a = rr(0, TAU), d = rr(6, R);
      addP({ x: T2.x + Math.cos(a) * d, y: T2.y + Math.sin(a) * d,
             vx: Math.cos(a + 1.9) * d * 2.2, vy: Math.sin(a + 1.9) * d * 2.2,
             drag: 1.4, life: rr(0.25, 0.6), max: 0.6, size: rr(0.4, 1.3),
             col: chance(0.6) ? 'rgba(220,245,250,0.75)' : 'rgba(150,200,215,0.6)' });
    }

    /* засасывает и рвёт всё живое */
    const suck = (o, rad, pull) => {
      const dx = T2.x - o.x, dy = T2.y - o.y, d = Math.hypot(dx, dy);
      if (d > R + rad || d < 0.01) return 0;
      const f = (1 - d / (R + rad)) * pull * dt;
      o.x += dx / d * f;
      o.y += dy / d * f;
      /* закрутка по касательной — объект уходит по спирали */
      o.x += -dy / d * f * 0.85;
      o.y += dx / d * f * 0.85;
      return d;
    };

    if (player && !player.dead) {
      const d = suck(player, 9, 120);
      if (d && d < KILL + 9) {
        damagePlayer(24 * dt);
        addShake(1.4 * dt * 60, T2.x, T2.y);
      }
      if (d && d < R + 60 && tornWarnT <= 0) {
        tornWarnT = 8;
        msg(T('mTornadoNear'), '#7fd4e0', 2);
      }
    }
    for (let e = enemies.length - 1; e >= 0; e--) {
      const en = enemies[e];
      const d = suck(en, en.T.r, 150);
      if (d && d < KILL + en.T.r) {
        en.hp -= 70 * dt; en.flash = 0.1;
        if (en.hp <= 0) killEnemy(en, e);
      }
    }
    if (boss && !boss.dead) suck(boss, 24, 26);
    for (let m = mines.length - 1; m >= 0; m--) {
      const mn = mines[m];
      const d = suck(mn, 6, 130);
      if (d && d < KILL) { boom(mn.x, mn.y, 1.4); splashFx(mn.x, mn.y, 1.4); mines.splice(m, 1); }
    }
    for (const p of pickups) suck(p, 4, 90);

    if (T2.life <= 0) {
      splashFx(T2.x, T2.y, 2.2);
      tornados.splice(i, 1);
    }
  }
}

/* воронка сверху: несколько закрученных колец плюс пенное основание */
function drawTornados() {
  for (const T2 of tornados) {
    const R = TORN_R * T2.grow;
    /* пенный круг у основания */
    ctx.fillStyle = 'rgba(226,248,252,0.16)';
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.92, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(226,248,252,0.30)'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.92, 0, TAU); ctx.stroke();

    /* спираль: дуги разного радиуса, каждая повёрнута сильнее */
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const r = R * (0.85 - t * 0.72);
      const a0 = T2.phase * (1 + t * 1.8) + i * 1.1;
      ctx.strokeStyle = 'rgba(214,238,246,' + (0.18 + t * 0.42).toFixed(3) + ')';
      ctx.lineWidth = D * (2 + t * 3);
      ctx.beginPath();
      ctx.arc(T2.x + Math.cos(a0) * r * 0.18, T2.y + Math.sin(a0) * r * 0.18,
              r, a0, a0 + 4.2);
      ctx.stroke();
    }
    /* тёмное жерло */
    ctx.fillStyle = 'rgba(12,30,42,0.55)';
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,252,255,0.85)';
    ctx.beginPath(); ctx.arc(T2.x, T2.y, R * 0.07, 0, TAU); ctx.fill();
  }
}

/* ===== src/entities/crew.js ===== */
;
'use strict';
/* ============================================================
   crew.js — дружеские причалы и стрелки на борту.

   На маленьких островах без баз стоят свои: дощатый причал и от одной
   до четырёх свай — сколько свай, столько бойцов там ждёт. Подойти,
   сбросить ход — катер чинят, а бойцы по одному перебираются на борт
   и дальше бьют из стрелкового по всему, что подходит близко.
   ============================================================ */

const maxCrew = () => 4 + (hasPerk('hull') ? 1 : 0);   /* адмиральский корпус даёт пятое место */
const PIER_R = 46;                    /* с какого расстояния работает причал */
/* места на палубе: вдоль корпуса, в шахматном порядке */
const CREW_SLOTS = [[-8.4, -2.7], [-3.4, 2.7], [3.4, -2.7], [8.4, 2.7], [0, -3.2]];

function crewPos(P, i) {
  const s = CREW_SLOTS[i % CREW_SLOTS.length];
  const c = Math.cos(P.ang), sn = Math.sin(P.ang);
  return { x: P.x + c * s[0] - sn * s[1], y: P.y + sn * s[0] + c * s[1] };
}

function mkPier(isl) {
  const a = rr(0, TAU), d = radiusAt(isl, a) * 0.99;
  return {
    isl, ang: a,
    x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d,
    stock: ri(1, 4), boardT: 0.9, repT: 0, near: false, seed: rr(0, 10)
  };
}

/* ---------- причал: ремонт и подсадка ---------- */
function updPiers(dt) {
  const P = player;
  if (!P || P.dead) return;
  for (const q of piers) {
    const d = dist(P.x, P.y, q.x, q.y);
    q.near = d < PIER_R;
    if (!q.near || Math.abs(P.spd) > 40) { q.boardT = Math.min(q.boardT, 0.9); continue; }

    if (P.hp < P.maxhp) {
      P.hp = Math.min(P.maxhp, P.hp + 9 * dt);
      q.repT -= dt;
      if (q.repT <= 0) {
        q.repT = 0.7; SFX.repair();
        addP({ x: P.x + rr(-6, 6), y: P.y - 10, vx: 0, vy: -16,
               life: 0.7, max: 0.7, size: 1.4, col: '#4ade80' });
      }
    }

    q.boardT -= dt;
    if (q.boardT <= 0 && q.stock > 0 && crew.length < maxCrew()) {
      q.boardT = 1.5;
      q.stock--;
      crew.push({ cool: rr(0.1, 0.5), fire: 0, ang: P.ang });
      SFX.pickup();
      addP({ x: P.x, y: P.y, life: 0.3, max: 0.3, type: 'ring', r: 10, col: '#7fb8d8' });
      msg(T('mAllyAboard', crew.length), '#7fb8d8', 1.8);
    }
  }
}

/* ближайшая цель для стрелкового: корабли, самолёты, линкор */
function nearestFoe(x, y, r) {
  let best = null, bd = r;
  for (const e of enemies) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  for (const p of planes)  { const d = dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
  if (boss && !boss.dead) { const d = dist(x, y, boss.x, boss.y); if (d < bd) { bd = d; best = boss; } }
  return best;
}

function updCrew(dt) {
  const P = player;
  if (!P || P.dead) return;
  for (let i = 0; i < crew.length; i++) {
    const k = crew[i];
    k.cool -= dt;
    k.fire = Math.max(0, k.fire - dt);
    const pos = crewPos(P, i);
    const t = nearestFoe(pos.x, pos.y, 155);
    if (!t) { k.ang = P.turret; continue; }
    k.ang = Math.atan2(t.y - pos.y, t.x - pos.x);
    if (k.cool <= 0) {
      k.cool = rr(0.45, 0.75);
      k.fire = 0.09;
      const sp = k.ang + rr(-0.055, 0.055);
      shells.push({ x: pos.x, y: pos.y,
                    vx: Math.cos(sp) * 265, vy: Math.sin(sp) * 265,
                    life: 0.6, from: 'p', dmg: 7, dead: false });
      addP({ x: pos.x, y: pos.y, vx: Math.cos(k.ang) * rr(20, 45), vy: Math.sin(k.ang) * rr(20, 45),
             drag: 3, life: 0.1, max: 0.1, size: 0.5, col: '#ffe9a3' });
      SFX.mg();
    }
  }
}

/* при тяжёлом попадании кого-то из бойцов смывает за борт */
function shakeOffCrew(dmg) {
  if (crew.length && dmg >= 14 && chance(0.30)) {
    crew.pop();
    if (player) splashFx(player.x + rr(-6, 6), player.y + rr(-6, 6), 0.8);
    msg(T('mAllyLost'), '#e5484d', 1.8);
  }
}

/* ---------- отрисовка ---------- */
function drawPiers() {
  for (const q of piers) {
    /* причал уходит от берега в воду */
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.ang);
    ctx.drawImage(sprPier, -sprPier.width / (2 * SC), -sprPier.height / (2 * SC),
                  sprPier.width / SC, sprPier.height / SC);
    ctx.restore();

    /* сваи: сколько осталось бойцов, столько и «палочек» */
    const pw = sprPile.width / SC, ph = sprPile.height / SC;
    for (let i = 0; i < q.stock; i++) {
      const off = (i - (q.stock - 1) / 2) * 4.4;
      const px2 = q.x + Math.cos(q.ang + Math.PI / 2) * off + Math.cos(q.ang) * 3;
      const py2 = q.y + Math.sin(q.ang + Math.PI / 2) * off + Math.sin(q.ang) * 3;
      ctx.drawImage(sprPile, px2 - pw / 2, py2 - ph * 0.8, pw, ph);
      /* боец ждёт на свае, лицом к воде */
      drawTrooper(TROOP_ALLY, px2, py2 - 5, q.ang, q.ang, { seed: i + q.seed });
    }

    /* подсказка, когда подошли близко */
    if (q.near && Math.floor(tGlobal * 2) % 2) {
      ctx.strokeStyle = 'rgba(127,184,216,0.5)';
      ctx.lineWidth = D * 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, PIER_R, 0, TAU); ctx.stroke();
    }
  }
}

function drawCrew() {
  const P = player;
  if (!P || P.dead) return;
  for (let i = 0; i < crew.length; i++) {
    const k = crew[i], pos = crewPos(P, i);
    /* стрелок стоит по-походному вдоль палубы, целится только руками */
    drawTrooper(TROOP_ALLY, pos.x, pos.y, P.ang, k.ang, { fire: k.fire, seed: i * 1.7 });
    if (k.fire > 0) {
      const mx2 = pos.x + Math.cos(k.ang) * TROOP_MUZZLE;
      const my2 = pos.y - HUMAN_LIFT + Math.sin(k.ang) * TROOP_MUZZLE;
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(mx2 - 0.9, my2 - 0.9, 1.8, 1.8);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(mx2 - 0.5, my2 - 0.5, 1, 1);
    }
  }
}

/* ===== src/entities/abilities.js ===== */
;
'use strict';
/* ============================================================
   abilities.js — расходные приёмы катера.

   F — дымовая завеса: облако рвёт линию огня и луч маяка, даётся
       бесплатно с откатом, это тактика, а не покупка.
   Q — глубинная бомба: сбрасывается за корму, тонет и рвёт под водой.
       Достаёт подлодки, но и своему корпусу рядом достанется.
   ============================================================ */

const SMOKE_CD = 14, SMOKE_R = 34, SMOKE_LIFE = 13;
const DC_CD = 3.5, DC_SINK = 1.3, DC_R = 42;
let smokeCD = 0, dcCD = 0;

/* ---------- дымовая завеса ---------- */
function dropSmoke() {
  if (!player || player.dead || smokeCD > 0) return;
  smokeCD = SMOKE_CD;
  const bx = player.x - Math.cos(player.ang) * 10;
  const by = player.y - Math.sin(player.ang) * 10;
  const puffs = [];
  for (let i = 0; i < 7; i++)
    puffs.push({ dx: rr(-10, 10), dy: rr(-10, 10), r: rr(9, 16), ph: rr(0, TAU), vx: rr(-3, 3), vy: rr(-3, 3) });
  smokes.push({ x: bx, y: by, r: 4, maxR: SMOKE_R, life: SMOKE_LIFE, max: SMOKE_LIFE, puffs });
  SFX.boost();
  for (let i = 0; i < 16; i++)
    addP({ x: bx + rr(-6, 6), y: by + rr(-6, 6), vx: rr(-16, 16), vy: rr(-16, 16), drag: 1.6,
           life: rr(0.6, 1.3), max: 1.3, size: rr(2, 4), col: '#6a7680', type: 'smoke' });
}

function updSmokes(dt) {
  smokeCD = Math.max(0, smokeCD - dt);
  const wind = (curCfg.weather && curCfg.weather.wind) || 0;
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.life -= dt;
    s.r = Math.min(s.maxR, s.r + 26 * dt);
    s.x += wind * 6 * dt;                       /* завесу сносит ветром */
    for (const p of s.puffs) { p.dx += p.vx * dt; p.dy += p.vy * dt; p.ph += dt * 0.6; }
    if (s.life <= 0) smokes.splice(i, 1);
  }
}

/* густая часть облака — по ней и режется видимость */
function inSmoke(x, y) {
  for (const s of smokes) {
    if (s.life < 0.6) continue;
    if (dist2(x, y, s.x, s.y) < s.r * s.r * 0.85) return true;
  }
  return false;
}
/* пересекает ли отрезок хоть одну завесу */
function losBlocked(x1, y1, x2, y2) {
  if (!smokes.length) return false;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    if (inSmoke(lerp(x1, x2, t), lerp(y1, y2, t))) return true;
  }
  return false;
}

function drawSmokes() {
  for (const s of smokes) {
    const fade = Math.min(1, s.life / 2.5) * Math.min(1, (s.max - s.life) / 0.5);
    for (const p of s.puffs) {
      const rr2 = p.r * (s.r / s.maxR) * (1 + 0.08 * Math.sin(p.ph));
      ctx.fillStyle = 'rgba(126,138,148,' + (0.30 * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x + p.dx, s.y + p.dy, rr2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(176,188,198,' + (0.16 * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x + p.dx - rr2 * 0.2, s.y + p.dy - rr2 * 0.25, rr2 * 0.6, 0, TAU); ctx.fill();
    }
  }
}

/* ---------- глубинные бомбы ---------- */
function dropCharge() {
  if (!player || player.dead) return;
  if (!upg.dc) { msg(T('mNoDC'), '#e5484d', 2); return; }
  if (dcCD > 0) return;
  dcCD = DC_CD;
  const bx = player.x - Math.cos(player.ang) * 13;
  const by = player.y - Math.sin(player.ang) * 13;
  charges.push({ x: bx, y: by, t: 0, spin: rr(-4, 4), rot: 0 });
  splashFx(bx, by, 0.7);
}

function updCharges(dt) {
  dcCD = Math.max(0, dcCD - dt);
  for (let i = charges.length - 1; i >= 0; i--) {
    const c = charges[i];
    c.t += dt;
    c.rot += c.spin * dt;
    if (chance(0.5))
      addP({ x: c.x + rr(-2, 2), y: c.y + rr(-2, 2), vx: 0, vy: 0, life: 0.5, max: 0.5,
             size: 0.6, col: 'rgba(220,245,248,0.6)', layer: 0 });
    if (c.t < DC_SINK) continue;

    /* подводный разрыв: столб воды, ударная волна */
    boom(c.x, c.y, 1.7, ['#dff6ff', '#9fd8e8', '#5fa8c0']);
    splashFx(c.x, c.y, 2.4);
    addP({ x: c.x, y: c.y, life: 0.6, max: 0.6, type: 'ring', r: DC_R, col: 'rgba(226,248,252,0.8)' });
    for (let k = 0; k < 22; k++) {
      const a = rr(0, TAU), v = rr(30, 95);
      addP({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 90, drag: 1.1,
             life: rr(0.4, 0.9), max: 0.9, size: rr(0.5, 1.6), col: '#dffaff' });
    }
    for (let k = subs.length - 1; k >= 0; k--) {
      const s = subs[k];
      const d = dist(c.x, c.y, s.x, s.y);
      if (d < DC_R) {
        damageSub(s, 120 * (1 - d / DC_R * 0.55), true);
        if (s.hp <= 0) killSub(s, k);
      }
    }
    for (const e of enemies) if (dist(c.x, c.y, e.x, e.y) < DC_R * 0.7) { e.hp -= 34; e.flash = 0.14; }
    for (let k = mines.length - 1; k >= 0; k--)
      if (dist(c.x, c.y, mines[k].x, mines[k].y) < DC_R * 0.8) {
        boom(mines[k].x, mines[k].y, 1.3); mines.splice(k, 1);
      }
    /* своим тоже прилетает, если не отошли */
    if (player && !player.dead) {
      const d = dist(c.x, c.y, player.x, player.y);
      if (d < 26) damagePlayer(20 * (1 - d / 26));
    }
    charges.splice(i, 1);
  }
}

function drawCharges() {
  for (const c of charges) {
    const t = c.t / DC_SINK;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * (1 - t);          /* уходит вглубь и тускнеет */
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    const k = 1 - t * 0.35;
    ctx.drawImage(sprDC, -sprDC.width / (2 * SC) * k, -sprDC.height / (2 * SC) * k,
                  sprDC.width / SC * k, sprDC.height / SC * k);
    ctx.restore();
    ctx.globalAlpha = 1;
    /* круг предупреждения перед разрывом */
    if (t > 0.55) {
      const q = (t - 0.55) / 0.45;
      ctx.strokeStyle = 'rgba(226,248,252,' + (0.15 + 0.4 * q).toFixed(2) + ')';
      ctx.lineWidth = D * 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, DC_R * (0.35 + q * 0.65), 0, TAU); ctx.stroke();
    }
  }
}

/* ===== src/entities/subs.js ===== */
;
'use strict';
/* ============================================================
   subs.js — подводные лодки и торпеды.

   Лодка почти всё время под водой: снаряды и ракеты проходят мимо,
   на поверхности виден только бурун перископа. Достать её можно
   глубинными бомбами, а когда ей крепко достаётся — она вынуждена
   всплыть, и вот тогда её добивают из пушки.
   ============================================================ */

let subPingT = 0;

function spawnSub() {
  for (let t = 0; t < 40; t++) {
    const x = rr(140, WORLD.w - 140), y = rr(140, WORLD.h - 140);
    if (!isWater(x, y)) continue;
    if (player && dist(x, y, player.x, player.y) < 340) continue;
    if (dist(x, y, CARR.x, CARR.y) < 360) continue;
    const hp = SUB.hp * (1 + (curCfg.n || 0) * 0.09) * diff().hp;
    subs.push({
      x, y, ang: rr(0, TAU), spd: 0, hp, max: hp,
      depth: 1, mode: 'hunt', cool: rr(2, 5), forced: 0, flash: 0, wakeT: 0
    });
    return true;
  }
  return false;
}

/* кого лодка сегодня топит: транспорт конвоя важнее катера */
function subPrey(s) {
  if (transport && !transport.dead && dist(s.x, s.y, transport.x, transport.y) <
      dist(s.x, s.y, player.x, player.y) * 1.35) return transport;
  return player;
}

function launchTorpedo(s, tg) {
  const lead = dist(s.x, s.y, tg.x, tg.y) / SUB.torpSpd;
  const vx = Math.cos(tg.ang || 0) * (tg.spd || 0), vy = Math.sin(tg.ang || 0) * (tg.spd || 0);
  const a = Math.atan2(tg.y + vy * lead * 0.8 - s.y, tg.x + vx * lead * 0.8 - s.x);
  torps.push({ x: s.x + Math.cos(a) * 12, y: s.y + Math.sin(a) * 12,
               ang: a, spd: SUB.torpSpd, life: 7, dmg: SUB.torpDmg * diff().dmg, trail: 0 });
  sndAt(s.x, s.y); SFX.rocket();
}

function killSub(s, i) {
  boom(s.x, s.y, 1.9);
  splashFx(s.x, s.y, 2.0);
  bumpCombo();
  reward(SUB.reward, s.x, s.y - 12, '#7fd4e0');
  kills.ships++;
  blowCover();
  for (let k = 0; k < 10; k++)
    addP({ x: s.x, y: s.y, vx: rr(-40, 40), vy: rr(-40, 40), g: 40, drag: 1.4,
           life: rr(0.6, 1.3), max: 1.3, size: rr(0.5, 1.4), col: '#2f3841', type: 'debris', spin: rr(-8, 8) });
  subs.splice(i, 1);
}

function updSubs(dt) {
  const P = player;
  if (curCfg.subs && subs.length < curCfg.subs) {
    subPingT -= dt;
    if (subPingT <= 0) { subPingT = rr(10, 18); spawnSub(); }
  }

  for (let i = subs.length - 1; i >= 0; i--) {
    const s = subs[i];
    s.cool -= dt; s.flash -= dt;
    const tg = P.dead ? (transport && !transport.dead ? transport : null) : subPrey(s);

    /* принудительное всплытие после тяжёлых повреждений */
    if (s.forced > 0) {
      s.forced -= dt;
      s.depth = approach(s.depth, 0, 2, dt);
      s.spd = approach(s.spd, SUB.spd * 0.5, 1.2, dt);
      if (tg) s.ang += clamp(angDiff(s.ang, Math.atan2(s.y - tg.y, s.x - tg.x)), -1, 1) * SUB.turn * dt;
      if (chance(0.5))
        addP({ x: s.x + rr(-5, 5), y: s.y + rr(-5, 5), vx: rr(-4, 4), vy: rr(-12, -4),
               life: 1.1, max: 1.1, size: 2.4, col: '#4a545e', type: 'smoke' });
    } else if (tg) {
      const d = dist(s.x, s.y, tg.x, tg.y);
      const want = d > SUB.range ? SUB.spd : d < SUB.range * 0.55 ? -SUB.spd * 0.4 : SUB.spd * 0.3;
      s.spd = approach(s.spd, want, 1.4, dt);
      s.ang += clamp(angDiff(s.ang, Math.atan2(tg.y - s.y, tg.x - s.x)), -1, 1) * SUB.turn * dt;
      /* к моменту пуска поднимается на перископную глубину */
      s.depth = approach(s.depth, s.cool < 1.1 ? 0.45 : 1, 1.6, dt);
      if (s.cool <= 0 && d < SUB.range) {
        s.cool = rr(SUB.cd[0], SUB.cd[1]);
        launchTorpedo(s, tg);
      }
    } else {
      s.spd = approach(s.spd, SUB.spd * 0.4, 1, dt);
      s.depth = approach(s.depth, 1, 1.2, dt);
    }

    s.x += Math.cos(s.ang) * s.spd * dt;
    s.y += Math.sin(s.ang) * s.spd * dt;
    s.x = clamp(s.x, 30, WORLD.w - 30);
    s.y = clamp(s.y, 30, WORLD.h - 30);
    collideIslands(s, SUB.r);

    /* бурун перископа выдаёт лодку на поверхности */
    if (Math.abs(s.spd) > 18) {
      s.wakeT -= dt;
      if (s.wakeT <= 0) {
        s.wakeT = 0.09;
        addWake(s.x - Math.cos(s.ang) * 6, s.y - Math.sin(s.ang) * 6, s.ang, 0.35 * (1.2 - s.depth * 0.6));
      }
    }
    if (s.depth < 0.9 && chance(0.35))
      addP({ x: s.x + rr(-3, 3), y: s.y + rr(-3, 3), vx: 0, vy: 0, life: 0.5, max: 0.5,
             size: 0.6, col: 'rgba(220,245,248,0.55)', layer: 0 });

    if (s.hp <= 0) { killSub(s, i); continue; }
    if (s.forced <= 0 && s.hp < s.max * SUB.surfaceAt && s.depth > 0.5) {
      s.forced = 7;
      msg(T('mSubSurface'), '#ffd94a', 2.5);
      SFX.alarm();
    }
  }
}

/* снаряды достают лодку только когда она наверху */
const subExposed = s => s.depth < 0.45;

function damageSub(s, dmg, deep) {
  if (!deep && !subExposed(s)) return false;
  s.hp -= dmg;
  s.flash = 0.14;
  return true;
}

/* ---------- торпеды ---------- */
function updTorps(dt) {
  for (let i = torps.length - 1; i >= 0; i--) {
    const t = torps[i];
    t.x += Math.cos(t.ang) * t.spd * dt;
    t.y += Math.sin(t.ang) * t.spd * dt;
    t.life -= dt;
    t.trail -= dt;
    if (t.trail <= 0) {
      t.trail = 0.045;
      addP({ x: t.x - Math.cos(t.ang) * 4, y: t.y - Math.sin(t.ang) * 4,
             vx: rr(-3, 3), vy: rr(-3, 3), life: 0.9, max: 0.9, size: rr(0.5, 1.1),
             col: 'rgba(226,248,252,0.75)', layer: 0 });
    }
    let dead = t.life <= 0 || !isWater(t.x, t.y);
    if (!dead && player && !player.dead && dist(t.x, t.y, player.x, player.y) < 10) {
      damagePlayer(t.dmg); dead = true;
    }
    if (!dead && transport && !transport.dead && dist(t.x, t.y, transport.x, transport.y) < CONVOY.r) {
      damageTransport(t.dmg * 1.2); dead = true;
    }
    if (dead) { boom(t.x, t.y, 1.2); splashFx(t.x, t.y, 1.3); torps.splice(i, 1); }
  }
}

/* ---------- отрисовка ---------- */
function drawSubs() {
  for (const s of subs) {
    const vis = 1 - s.depth * 0.72;                 /* под водой видно силуэт */
    ctx.save();
    ctx.globalAlpha = vis;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang + Math.PI / 2);
    ctx.drawImage(sprSub, -sprSub.width / (2 * SC), -sprSub.height / (2 * SC),
                  sprSub.width / SC, sprSub.height / SC);
    ctx.restore();
    ctx.globalAlpha = 1;

    /* перископ торчит даже на глубине */
    if (s.depth > 0.3) {
      const px2 = s.x + Math.cos(s.ang) * 3, py2 = s.y + Math.sin(s.ang) * 3;
      ctx.fillStyle = '#1b222a'; ctx.fillRect(px2 - 0.6, py2 - 0.6, 1.2, 1.2);
      ctx.fillStyle = 'rgba(226,248,252,0.45)';
      ctx.fillRect(px2 - Math.cos(s.ang) * 2 - 0.5, py2 - Math.sin(s.ang) * 2 - 0.5, 1, 1);
    }
    if (s.flash > 0) {
      ctx.globalAlpha = Math.min(1, s.flash * 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, SUB.r + 1, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (s.forced > 0 && s.hp < s.max) {
      ctx.fillStyle = 'rgba(6,16,24,0.85)'; ctx.fillRect(s.x - 7, s.y - 13, 14, 2.5);
      ctx.fillStyle = '#e5484d'; ctx.fillRect(s.x - 6.5, s.y - 12.6, 13 * (s.hp / s.max), 1.6);
    }
  }
}

function drawTorps() {
  for (const t of torps) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.ang);
    ctx.fillStyle = '#20272d'; ctx.fillRect(-4.5, -1, 9, 2);
    ctx.fillStyle = '#495663'; ctx.fillRect(-4.5, -1, 9, 0.7);
    ctx.fillStyle = '#c8393f'; ctx.fillRect(3, -1, 1.6, 2);
    ctx.restore();
  }
}

/* ===== src/entities/convoy.js ===== */
;
'use strict';
/* ============================================================
   convoy.js — проводка транспорта.

   «Ладога» выходит от авианосца и своим ходом идёт к порту на
   дальнем острове. Она безоружна и медлительна, по ней бьют все:
   корабли, авиация, подлодки и береговые батареи. Утонет — задание
   сорвано, поэтому катер идёт впереди и расчищает дорогу.
   ============================================================ */

let convoyWarnT = 0;

function makeTransport(destIsl) {
  /* маршрут: от авианосца в обход островов к берегу назначения */
  const wp = [];
  const ax = Math.atan2(destIsl.y - CARR.y, destIsl.x - CARR.x);
  const total = dist(CARR.x, CARR.y, destIsl.x, destIsl.y);
  const legs = Math.max(2, Math.round(total / 420));
  for (let i = 1; i <= legs; i++) {
    const t = i / legs;
    let x = lerp(CARR.x + Math.cos(ax) * 70, destIsl.x, t);
    let y = lerp(CARR.y + Math.sin(ax) * 70, destIsl.y, t);
    /* точку сдвигаем в воду, если она попала на сушу */
    for (let k = 0; k < 24 && !isWater(x, y); k++) {
      const a = k / 24 * TAU;
      x += Math.cos(a) * 26; y += Math.sin(a) * 26;
    }
    wp.push({ x, y });
  }
  /* последняя точка — у самого берега порта */
  const la = Math.atan2(CARR.y - destIsl.y, CARR.x - destIsl.x);
  wp[wp.length - 1] = { x: destIsl.x + Math.cos(la) * (radiusAt(destIsl, la) + 34),
                        y: destIsl.y + Math.sin(la) * (radiusAt(destIsl, la) + 34) };

  const hp = CONVOY.hp * (1 + (curCfg.n || 0) * 0.10);
  return {
    x: CARR.x + Math.cos(ax) * 56, y: CARR.y + Math.sin(ax) * 56,
    ang: ax, spd: 0, hp, max: hp, dead: false, done: false,
    wp, wpi: 0, wakeT: 0, hitT: 0, smk: 0, dest: destIsl,
    total: 0, gone: 0
  };
}

function damageTransport(d) {
  if (!transport || transport.dead || transport.done) return;
  transport.hp -= d;
  transport.hitT = 0.35;
  addShake(1.2, transport.x, transport.y);
  if (convoyWarnT <= 0) { convoyWarnT = 9; msg(T('mConvoyHit'), '#e5484d', 2.5); SFX.alarm(); }
  if (transport.hp <= 0) {
    transport.dead = true;
    bigBoom(transport.x, transport.y);
    msg(T('mConvoyLost'), '#e5484d', 4);
  }
}

function convoyProgress() {
  if (!transport) return 0;
  return clamp(transport.gone / Math.max(1, transport.total), 0, 1);
}

function updTransport(dt) {
  const t = transport;
  if (!t) return;
  convoyWarnT -= dt;
  t.hitT = Math.max(0, t.hitT - dt);
  if (t.dead) return;

  if (t.done) {                                  /* пришла — стоит у причала */
    t.spd = approach(t.spd, 0, 2, dt);
    t.x += Math.cos(t.ang) * t.spd * dt;
    t.y += Math.sin(t.ang) * t.spd * dt;
    return;
  }

  const wp = t.wp[t.wpi];
  const da = angDiff(t.ang, Math.atan2(wp.y - t.y, wp.x - t.x));
  t.ang += clamp(da, -1, 1) * 0.55 * dt;
  t.spd = approach(t.spd, CONVOY.spd, 0.9, dt);

  /* обход островов, чтобы не сесть на мель по дороге */
  for (const isl of islands) {
    const dx = t.x - isl.x, dy = t.y - isl.y, d2v = dx * dx + dy * dy, rq = isl.r + 46;
    if (d2v < rq * rq) t.ang += clamp(angDiff(t.ang, Math.atan2(dy, dx)), -1, 1) * 1.6 * dt;
  }

  const mx = Math.cos(t.ang) * t.spd * dt, my = Math.sin(t.ang) * t.spd * dt;
  t.x += mx; t.y += my;
  t.gone += Math.hypot(mx, my);
  collideIslands(t, CONVOY.r);

  if (dist(t.x, t.y, wp.x, wp.y) < 44) {
    t.wpi++;
    if (t.wpi >= t.wp.length) {
      t.done = true;
      msg(T('mConvoyDone'), '#4ade80', 3);
      SFX.evac();
      for (let i = 0; i < 20; i++)
        addP({ x: t.x + rr(-16, 16), y: t.y + rr(-24, 24), vx: rr(-12, 12), vy: rr(-30, -10),
               g: 40, life: rr(0.6, 1.2), max: 1.2, size: 1.6, col: '#4ade80' });
    }
  }

  t.wakeT -= dt;
  if (t.wakeT <= 0 && t.spd > 8) {
    t.wakeT = 0.07;
    /* след транспорта рисует shipWake (vfx.js) */
  }
  if (t.hp < t.max * 0.5) {
    t.smk -= dt;
    if (t.smk <= 0) {
      t.smk = 0.14;
      addP({ x: t.x + rr(-8, 8), y: t.y + rr(-12, 12), vx: rr(-5, 5), vy: rr(-13, -4),
             life: 1.2, max: 1.2, size: 2.6, col: '#4a545e', type: 'smoke' });
    }
  }
}

function drawTransport() {
  const t = transport;
  if (!t || t.dead) return;
  shipWake(t, 18, 5);
  drawStack(sprTransport, t.x, t.y + Math.sin(tGlobal * 1.7) * 0.4, t.ang + Math.PI / 2, sprTransport._h, 0);
  if (t.hitT > 0) {
    ctx.globalAlpha = Math.min(1, t.hitT * 3);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(t.x, t.y, CONVOY.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  /* полоса живучести всегда на виду — от неё зависит миссия */
  const w = 26;
  ctx.fillStyle = 'rgba(6,16,24,0.85)';
  ctx.fillRect(t.x - w / 2 - 0.5, t.y - 24, w + 1, 3.5);
  ctx.fillStyle = t.hp / t.max > 0.5 ? '#4ade80' : t.hp / t.max > 0.25 ? '#ffb454' : '#e5484d';
  ctx.fillRect(t.x - w / 2, t.y - 23.5, w * clamp(t.hp / t.max, 0, 1), 2.5);
  if (Math.floor(tGlobal * 2) % 2) {
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(t.x - 0.8, t.y - 29, 1.6, 1.6);
  }
}

/* пунктир маршрута — видно, куда вести */
function drawConvoyRoute() {
  const t = transport;
  if (!t || t.dead || t.done) return;
  ctx.strokeStyle = 'rgba(74,222,128,0.22)';
  ctx.lineWidth = D * 2;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  for (let i = t.wpi; i < t.wp.length; i++) ctx.lineTo(t.wp[i].x, t.wp[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ===== src/entities/events.js ===== */
;
'use strict';
/* ============================================================
   events.js — события боя и временные усиления.

   Штурм баз сам по себе однообразен, поэтому раз в полминуты
   в бою что-то происходит: самолёт сбрасывает контейнер (и враг
   идёт наперегонки), на охоту выходит вражеский ас с наградой за
   голову, в воде ждёт сбитый лётчик, мимо идёт караван барж,
   налетает авиазвено или всплывает рассыпанный груз. У каждого
   события свой таймер и награда — поводы свернуть с маршрута.

   Усиления (тройной залп, скорострельность, щит, нитро) выпадают
   из контейнеров, с аса и изредка с обычных кораблей.
   ============================================================ */

/* ---------- усиления ---------- */
const BUFFS = {
  triple: { dur: 12, col: '#ffd94a', key: 'bfTriple' },
  rapid : { dur: 10, col: '#ff8b3d', key: 'bfRapid' },
  shield: { dur: 8,  col: '#7fd4e0', key: 'bfShield' },
  nitro : { dur: 12, col: '#4ade80', key: 'bfNitro' }
};
const BUFF_IDS = Object.keys(BUFFS);
let buffs = { triple: 0, rapid: 0, shield: 0, nitro: 0 };
const buffOn = id => buffs[id] > 0;

function giveBuff(id, x, y) {
  const B = BUFFS[id];
  buffs[id] = Math.max(buffs[id], B.dur);
  addFloat(x, y - 10, T(B.key), B.col);
  msg(T('bfGot', T(B.key), B.dur), B.col, 2.5);
  addP({ x, y, life: 0.45, max: 0.45, type: 'ring', r: 18, col: B.col });
  addLight(x, y, 60, B.col, 0.5);
  SFX.buy();
}
function dropBuff(x, y, id) {
  pickups.push({ x, y, type: 'buff', kind: id || pick(BUFF_IDS), ph: rr(0, TAU), life: 22 });
}

/* щит гасит попадание целиком */
function shieldHit() {
  addP({ x: player.x, y: player.y, life: 0.25, max: 0.25, type: 'ring', r: 15, col: '#9fe8ff' });
  SFX.clang();
}

function updBuffs(dt) {
  for (const id of BUFF_IDS) if (buffs[id] > 0) buffs[id] = Math.max(0, buffs[id] - dt);
  if (buffs.nitro > 0 && player && !player.dead) { player.boostE = boostMax(); player.boostLock = 0; }
}

/* ---------- спрайты событий ---------- */
const sprBarge = makeShip(26, 5, { out: '#14100c', hull: '#6b5a44', dk: '#3f3326', deck: '#574838',
                                   acc: '#ffb454', lit: '#8a7658', glass: '#e0c890' }, {});
const sprPlaneF = makePlane({ body: '#50663f', lit: '#7f9868', acc: '#4ade80' }, 21);

SHIP_TYPES.barge = { name: 'БАРЖА', hp: 1.5, spd: 36, turn: 1.0, rng: 0, cd: [99, 99], dmg: 0,
                     salvo: 0, reward: 170, r: 9, radar: 0 };
SHIP_SPR.barge = sprBarge;

/* ---------- события ---------- */
const EV_COL = '#c07bff';                 /* цвет событий: стрелки, радар, рамка */
const EV_KINDS = ['drop', 'ace', 'pilot', 'cargo', 'raid', 'loot'];
const EV_QUIET = { drop: 1, pilot: 1, loot: 1 };   /* подходят для тихой ночной фазы */
let ev = null, evT = 0, evLast = '', evN = 0;

function evReset() {
  ev = null; evN = 0; evLast = '';
  evT = rr(18, 24);
  buffs = { triple: 0, rapid: 0, shield: 0, nitro: 0 };
}

/* свободная вода на расстоянии d0..d1 от катера */
function evSpot(d0, d1, from) {
  from = from || player;
  for (let t = 0; t < 80; t++) {
    const a = rr(0, TAU), d = rr(d0, d1);
    const x = from.x + Math.cos(a) * d, y = from.y + Math.sin(a) * d;
    if (x < 60 || x > WORLD.w - 60 || y < 60 || y > WORLD.h - 60) continue;
    if (!isWater(x, y) || !isWater(x + 16, y) || !isWater(x - 16, y) ||
        !isWater(x, y + 16) || !isWater(x, y - 16)) continue;
    if (dist(x, y, CARR.x, CARR.y) < 150) continue;
    return { x, y };
  }
  return null;
}

function nearestIsl(x, y) {
  let best = islands[0], bd = 1e9;
  for (const i of islands) { const d = dist(x, y, i.x, i.y); if (d < bd) { bd = d; best = i; } }
  return best;
}

/* корабль события в заданной точке (spawnEnemy ставит только у островов) */
function evShip(type, x, y, ang) {
  const ST = SHIP_TYPES[type];
  const hp = curCfg.eHp * ST.hp * diff().hp;
  const e = { type, T: ST, x, y, ang: ang || 0, spd: 0, hp, max: hp, state: 'patrol',
              isl: nearestIsl(x, y), wa: rr(0, TAU), cool: rr(1, 2), flash: 0, smk: 0,
              roll: 0, wakeT: 0, alertT: 0 };
  enemies.push(e);
  return e;
}

/* корабль с маршрутом идёт к точке и не ввязывается в бой (см. updEnemies) */
function evSteer(e, dt) {
  const r = e.route;
  const d = dist(e.x, e.y, r.x, r.y);
  e.ang += clamp(angDiff(e.ang, Math.atan2(r.y - e.y, r.x - e.x)), -1, 1) * e.T.turn * dt;
  e.spd = approach(e.spd, d < 18 ? 0 : e.routeSpd, 1.5, dt);
}

function evPickKind() {
  if (level === 0 && evN === 0) return 'drop';            /* первым делом — знакомство с усилениями */
  const quiet = nightQuiet();
  let pool = EV_KINDS.filter(k => k !== evLast && (!quiet || EV_QUIET[k]));
  if (level === 0) pool = pool.filter(k => k !== 'raid');  /* новичку хватит и штурмовиков */
  return pick(pool);
}

function evStart() {
  const kind = evPickKind();
  const P = player;
  let e = null;
  if (kind === 'drop') {
    const s = evSpot(220, 400);
    if (!s) return false;
    const a = rr(0, TAU);
    e = { x: s.x, y: s.y, t: 32, max: 32, fall: 2.4,
          px: s.x - Math.cos(a) * 260, py: s.y - Math.sin(a) * 260, pa: a };
    if (!nightQuiet()) {
      /* враг тоже видел парашют и идёт наперегонки */
      const q = evSpot(170, 230, s);
      if (q) {
        const r = evShip('patrol', q.x, q.y, Math.atan2(s.y - q.y, s.x - q.x));
        r.route = { x: s.x, y: s.y }; r.routeSpd = r.T.spd * 0.5; r.racer = true;
        e.racer = r;
      }
    }
    msg(T('evDropMsg'), EV_COL, 4);
  } else if (kind === 'ace') {
    const type = level < 2 ? 'gun' : level < 5 ? pick(['gun', 'missile']) : 'frigate';
    const n0 = enemies.length;
    if (!spawnEnemy(type) || enemies.length === n0) return false;
    const a = enemies[enemies.length - 1];
    a.hp = a.max = a.max * 2.4;
    a.T = Object.assign({}, a.T, { radar: 1200, spd: a.T.spd * 1.12 });
    a.ace = true; a.bounty = 3; a.drop = true;
    a.state = 'fight';
    e = { ship: a, t: 60, max: 60 };
    msg(T('evAceMsg'), '#ffd94a', 4);
  } else if (kind === 'pilot') {
    const s = evSpot(260, 440);
    if (!s) return false;
    e = { x: s.x, y: s.y, t: 40, max: 40, hold: 0 };
    if (!nightQuiet()) {
      const q = evSpot(150, 210, s);
      if (q) evShip(level < 2 ? 'patrol' : 'gun', q.x, q.y, 0).state = 'fight';
    }
    msg(T('evPilotMsg'), EV_COL, 4);
  } else if (kind === 'cargo') {
    /* караван идёт мимо катера: из-за экрана с одной стороны на другую */
    let ok = false;
    for (let t = 0; t < 16 && !ok; t++) {
      const a = rr(0, TAU), c = Math.cos(a), s = Math.sin(a);
      const side = rr(-1, 1) * 90;
      const sx = clamp(P.x + c * 480 - s * side, 80, WORLD.w - 80);
      const sy = clamp(P.y + s * 480 + c * side, 80, WORLD.h - 80);
      const ex = clamp(P.x - c * 700, 40, WORLD.w - 40), ey = clamp(P.y - s * 700, 40, WORLD.h - 40);
      if (dist(sx, sy, P.x, P.y) < 360 || dist(sx, sy, ex, ey) < 700) continue;
      const hd = Math.atan2(ey - sy, ex - sx);
      const list = [];
      for (let k = 0; k < 3; k++) {
        const bx = sx - Math.cos(hd) * k * 38, by = sy - Math.sin(hd) * k * 38;
        if (!isWater(bx, by)) continue;
        const b = evShip('barge', bx, by, hd);
        b.route = { x: ex, y: ey }; b.routeSpd = b.T.spd; b.cargo = true;
        list.push(b);
      }
      if (list.length < 2) { for (const b of list) enemies.splice(enemies.indexOf(b), 1); continue; }
      /* охранение */
      const gx = sx + Math.cos(hd + 1.6) * 40, gy = sy + Math.sin(hd + 1.6) * 40;
      if (isWater(gx, gy)) evShip(level < 2 ? 'patrol' : 'gun', gx, gy, hd).state = 'fight';
      e = { list, n: list.length, sunk: 0, t: 55, max: 55 };
      ok = true;
    }
    if (!ok) return false;
    msg(T('evCargoMsg'), EV_COL, 4);
  } else if (kind === 'raid') {
    const n = level < 3 ? 3 : 4;
    e = { k0: kills.planes, n, queue: n, qT: 0, heavy: level >= 2 ? 1 : 0, t: 32, max: 32 };
    msg(T('evRaidMsg'), '#ff9ad5', 4);
    SFX.bossAlarm();
  } else if (kind === 'loot') {
    const s = evSpot(280, 460);
    if (!s) return false;
    const list = [];
    for (let k = 0; k < 6; k++) {
      let x = s.x, y = s.y;
      for (let t = 0; t < 12; t++) {
        const a = rr(0, TAU), d = rr(8, 46);
        if (isWater(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d)) { x = s.x + Math.cos(a) * d; y = s.y + Math.sin(a) * d; break; }
      }
      const p = k === 5 ? { x, y, type: 'buff', kind: pick(BUFF_IDS), ph: rr(0, TAU), life: 30 }
                        : { x, y, type: 'coin', ph: rr(0, TAU), life: 30 };
      pickups.push(p); list.push(p);
    }
    e = { x: s.x, y: s.y, list, n: list.length, t: 30, max: 30 };
    msg(T('evLootMsg'), EV_COL, 4);
  }
  if (!e) return false;
  e.kind = kind; e.done = false; e.ok = false;
  ev = e; evLast = kind; evN++;
  if (kind !== 'raid') SFX.alarm();
  return true;
}

/* итог события: награда — поверх той, что уже дали за цели */
function evEnd(ok, why) {
  const e = ev;
  ev = null;
  evT = rr(26, 38);
  if (ok) {
    const pay = { drop: 150, ace: 200, pilot: 260, cargo: 300, raid: 300, loot: 200 }[e.kind] || 150;
    reward(pay, player.x, player.y - 22, EV_COL);
    msg(T('evOk') + ' • ' + T('ev_' + e.kind), '#4ade80', 3);
    bumpCombo();
    SFX.evac();
  } else {
    msg(why || T('evFail'), '#ff9166', 3);
  }
  /* ас, не пойманный вовремя, остаётся обычным кораблём */
  if (e.kind === 'ace' && e.ship && enemies.indexOf(e.ship) >= 0) {
    e.ship.ace = false; e.ship.bounty = 1;
  }
  if (e.racer && enemies.indexOf(e.racer) >= 0) { delete e.racer.route; e.racer.state = 'fight'; }
}

function evTick(dt) {
  updBuffs(dt);
  if (state !== 'play' || !player || player.dead) return;
  const P = player;

  if (ev) {
    const e = ev;
    e.t -= dt;
    if (e.kind === 'drop') {
      e.fall = Math.max(0, e.fall - dt);
      e.px += Math.cos(e.pa) * 150 * dt; e.py += Math.sin(e.pa) * 150 * dt;
      if (e.fall <= 0) {
        if (dist(P.x, P.y, e.x, e.y) < 18) {
          giveBuff(pick(BUFF_IDS), e.x, e.y);
          return evEnd(true);
        }
        const r = e.racer;
        if (r && enemies.indexOf(r) >= 0 && dist(r.x, r.y, e.x, e.y) < 22) return evEnd(false, T('evLost'));
        if (Math.floor(e.t * 1.2) !== Math.floor((e.t + dt) * 1.2)) addLight(e.x, e.y, 46, EV_COL, 0.5);
      }
    } else if (e.kind === 'ace') {
      if (enemies.indexOf(e.ship) < 0) return evEnd(true);
    } else if (e.kind === 'pilot') {
      if (dist(P.x, P.y, e.x, e.y) < 28 && Math.abs(P.spd) < 60) {
        e.hold += dt;
        if (e.hold > 0.7) {
          P.hp = Math.min(P.maxhp, P.hp + 30);
          addFloat(e.x, e.y - 18, T('fRepair'), '#4ade80');
          return evEnd(true);
        }
      } else e.hold = Math.max(0, e.hold - dt);
      if (chance(0.35))
        addP({ x: e.x + rr(-1, 1), y: e.y - 3, vx: rr(-4, 4), vy: rr(-18, -8), life: 1.1, max: 1.1,
               size: 2, col: 'rgba(192,123,255,0.8)', type: 'smoke' });
    } else if (e.kind === 'cargo') {
      for (let i = e.list.length - 1; i >= 0; i--) {
        const b = e.list[i];
        const k = enemies.indexOf(b);
        if (k < 0) { e.sunk++; e.list.splice(i, 1); continue; }
        if (dist(b.x, b.y, b.route.x, b.route.y) < 30) { enemies.splice(k, 1); e.list.splice(i, 1); }
      }
      if (!e.list.length) return evEnd(e.sunk === e.n, T('evCargoEsc', e.sunk, e.n));
      if (e.t <= 0) {          /* ушли за горизонт */
        for (const b of e.list) { const k = enemies.indexOf(b); if (k >= 0) enemies.splice(k, 1); }
        return evEnd(false, T('evCargoEsc', e.sunk, e.n));
      }
      return;
    } else if (e.kind === 'raid') {
      if (e.queue > 0) {
        e.qT -= dt;
        if (e.qT <= 0) { e.qT = 0.7; e.queue--; spawnPlane(e.heavy > 0 && e.queue === 0); }
      }
      if (kills.planes - e.k0 >= e.n) return evEnd(true);
      if (e.queue === 0 && !planes.length) return evEnd(false);
    } else if (e.kind === 'loot') {
      e.list = e.list.filter(p => pickups.indexOf(p) >= 0);
      if (!e.list.length) return evEnd(e.got >= e.n);
    }
    if (e.t <= 0) evEnd(false);
    return;
  }

  if (boss || winPend) return;
  /* обучение новичка сначала: ход и огонь */
  if (typeof tut !== 'undefined' && tut && !tut.done && tut.step < 2) return;
  evT -= dt;
  if (evT <= 0 && !evStart()) evT = 4;
}

/* подобрали монету или усиление — счёт для «собери всё» */
function evPicked(p) {
  if (ev && ev.kind === 'loot' && ev.list.indexOf(p) >= 0) ev.got = (ev.got || 0) + 1;
}

/* корабль события потоплен */
function evKilled(e) {
  if (e.cargo && chance(0.4)) dropBuff(e.x, e.y);
}

/* ---------- эвакуация вертолётом ---------- */
/* Цель уровня выполнена — оставшихся заложников забирает вертолёт
   (за меньшую награду), чтобы не гонять катер через всю карту. */
function heliEvac() {
  const P = player;
  let n = P.aboard;
  P.aboard = 0; P.troops = 0;
  for (let i = hostages.length - 1; i >= 0; i--) {
    const h = hostages[i];
    if (h.state === 'wait' || h.state === 'swim') { n++; hostages.splice(i, 1); }
  }
  if (!n) return;
  rescued += n;
  reward(Math.round(ECON.hostageEvac * 0.6) * n, P.x, P.y - 30, '#4ade80');
  msg(T('mHeliEvac', n), '#4ade80', 3.5);
  SFX.evac();
}

/* ---------- отрисовка в мире ---------- */
function drawEvents() {
  const P = player;
  /* метки асов и контейнеры на баржах */
  for (const e of enemies) {
    if (e.ace) {
      const r = e.T.r + 7;
      ctx.strokeStyle = 'rgba(255,217,74,' + (0.55 + 0.35 * Math.sin(tGlobal * 6)).toFixed(2) + ')';
      ctx.lineWidth = D * 2;
      ctx.setLineDash([3, 3]); ctx.lineDashOffset = -tGlobal * 12;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      txt(T('evAceTag'), e.x, e.y - r - 10, '#ffd94a', 8, 'center');
      bar(e.x - 12, e.y - r - 2, 24, 2, e.hp / e.max, '#ffd94a');
    } else if (e.type === 'barge') {
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(e.ang + Math.PI / 2);
      const cols = ['#b5523b', '#3b7bb5', '#c9a13b'];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#10161c'; ctx.fillRect(-3.5, -8 + k * 5.2, 7, 4.4);
        ctx.fillStyle = cols[(k + (e.x | 0)) % 3]; ctx.fillRect(-3, -7.6 + k * 5.2, 6, 3.6);
      }
      ctx.restore();
    }
  }
  if (ev) {
    const e = ev;
    if (e.kind === 'drop') {
      /* транспортник уходит дальше, контейнер спускается на парашюте */
      if (dist(e.px, e.py, e.x, e.y) < 900) {
        ctx.save(); ctx.translate(e.px, e.py); ctx.rotate(e.pa + Math.PI / 2);
        ctx.drawImage(sprPlaneF, -sprPlaneF.width / (2 * SC), -sprPlaneF.height / (2 * SC),
                      sprPlaneF.width / SC, sprPlaneF.height / SC);
        ctx.restore();
      }
      const h = e.fall * 16;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.35 - e.fall * 0.1).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 3, 5 - e.fall, 2, 0, 0, TAU); ctx.fill();
      const by = e.y - h + (e.fall > 0 ? 0 : Math.sin(tGlobal * 3) * 1.2);
      if (e.fall > 0) {
        ctx.strokeStyle = '#dfe6ea'; ctx.lineWidth = D * 2;
        ctx.beginPath(); ctx.moveTo(e.x - 3, by - 3); ctx.lineTo(e.x - 7, by - 12);
        ctx.moveTo(e.x + 3, by - 3); ctx.lineTo(e.x + 7, by - 12); ctx.stroke();
        ctx.fillStyle = '#f4f8fa';
        ctx.beginPath(); ctx.arc(e.x, by - 12, 8, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#ff8b3d'; ctx.fillRect(e.x - 2, by - 20, 4, 8);
      }
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(e.x - 4.5, by - 4.5, 9, 9);
      ctx.fillStyle = EV_COL; ctx.fillRect(e.x - 3.5, by - 3.5, 7, 7);
      ctx.fillStyle = '#f4f8fa'; ctx.fillRect(e.x - 0.5, by - 3.5, 1, 7); ctx.fillRect(e.x - 3.5, by - 0.5, 7, 1);
      if (e.fall <= 0) evRing(e.x, e.y, 18);
    } else if (e.kind === 'pilot') {
      drawHuman(PPL.pilot, e.x, e.y, { mode: 'raft', seed: 1.3 });     /* машет из плота */
      evRing(e.x, e.y, 28, e.hold / 0.7);
    } else if (e.kind === 'loot') {
      evRing(e.x, e.y, 54);
    }
  }
  /* щит вокруг катера */
  if (P && !P.dead && buffOn('shield')) {
    const k = buffs.shield < 2 && Math.floor(tGlobal * 8) % 2 ? 0.25 : 0.7;
    ctx.strokeStyle = 'rgba(127,212,224,' + (k * (0.7 + 0.3 * Math.sin(tGlobal * 7))).toFixed(2) + ')';
    ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(P.x, P.y, 15, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(127,212,224,0.08)';
    ctx.beginPath(); ctx.arc(P.x, P.y, 15, 0, TAU); ctx.fill();
  }
}

/* пульсирующий круг зоны события; prog — дуга прогресса */
function evRing(x, y, r, prog) {
  ctx.strokeStyle = 'rgba(192,123,255,' + (0.35 + 0.25 * Math.sin(tGlobal * 4)).toFixed(2) + ')';
  ctx.lineWidth = D * 2;
  ctx.setLineDash([4, 4]); ctx.lineDashOffset = tGlobal * 10;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  if (prog > 0) {
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(prog, 0, 1)); ctx.stroke();
  }
}

/* куда смотрит стрелка события */
function evTarget() {
  if (!ev) return null;
  const e = ev;
  if (e.kind === 'drop' || e.kind === 'pilot' || e.kind === 'loot') return e;
  if (e.kind === 'ace') return e.ship;
  if (e.kind === 'cargo') {
    let best = null, bd = 1e9;
    for (const b of e.list) { const d = dist(player.x, player.y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  if (e.kind === 'raid') {
    let best = null, bd = 1e9;
    for (const p of planes) { const d = dist(player.x, player.y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  return null;
}

/* ---------- плавающие усиления и монеты ---------- */
function drawBuffPickup(p, by) {
  const B = BUFFS[p.kind] || BUFFS.triple;
  const x = p.x;
  addLightOnce(p);
  ctx.fillStyle = '#0c1822';
  ctx.beginPath(); ctx.arc(x, by, 5.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = B.col; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(x, by, 5, 0, TAU); ctx.stroke();
  ctx.fillStyle = B.col;
  if (p.kind === 'triple') {
    ctx.fillRect(x - 3, by - 0.5, 1.5, 1.5); ctx.fillRect(x - 0.75, by - 2.5, 1.5, 1.5); ctx.fillRect(x + 1.5, by - 0.5, 1.5, 1.5);
  } else if (p.kind === 'rapid') {
    ctx.fillRect(x - 2.5, by - 2, 1.2, 4); ctx.fillRect(x - 0.6, by - 2, 1.2, 4); ctx.fillRect(x + 1.3, by - 2, 1.2, 4);
  } else if (p.kind === 'shield') {
    ctx.beginPath(); ctx.moveTo(x - 2.5, by - 2.5); ctx.lineTo(x + 2.5, by - 2.5);
    ctx.lineTo(x + 2.5, by); ctx.lineTo(x, by + 2.8); ctx.lineTo(x - 2.5, by); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(x + 1, by - 3); ctx.lineTo(x - 2, by + 0.5); ctx.lineTo(x, by + 0.5);
    ctx.lineTo(x - 1, by + 3); ctx.lineTo(x + 2, by - 0.5); ctx.lineTo(x, by - 0.5); ctx.closePath(); ctx.fill();
  }
}
/* мягкий отсвет раз в полсекунды, чтобы усиление было видно ночью */
function addLightOnce(p) {
  const k = Math.floor(tGlobal * 2 + p.ph);
  if (p.lk !== k) { p.lk = k; addLight(p.x, p.y, 34, (BUFFS[p.kind] || BUFFS.triple).col, 0.35); }
}
function drawCoin(p, by) {
  ctx.fillStyle = '#5a3e1a'; ctx.fillRect(p.x - 3.5, by - 3.5, 7, 7);
  ctx.fillStyle = '#c98a2e'; ctx.fillRect(p.x - 2.5, by - 3, 5, 6);
  ctx.fillStyle = '#ffd94a'; ctx.fillRect(p.x - 2.5, by - 1, 5, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(p.x - 2.5, by - 3, 1, 6);
}

/* ---------- радар ---------- */
function evRadar(blip) {
  if (!ev) return;
  const t = evTarget();
  if (ev.kind === 'cargo') { for (const b of ev.list) blip(b.x, b.y, EV_COL, 2.4); }
  else if (t) blip(t.x, t.y, ev.kind === 'ace' ? '#ffd94a' : EV_COL, 2.6);
}

/* ---------- HUD: панель события и усиления ---------- */
function drawEvHud() {
  if (!player) return;
  const P = player;
  if (ev && !boss) {
    const e = ev;
    const W = 176, X = VW / 2 - W / 2, Y = 28;
    panel(X, Y, W, 22, EV_COL);
    let title = T('ev_' + e.kind);
    if (e.kind === 'cargo') title += ' ' + e.sunk + '/' + e.n;
    else if (e.kind === 'raid') title += ' ' + Math.min(e.n, kills.planes - e.k0) + '/' + e.n;
    else if (e.kind === 'loot') title += ' ' + (e.got || 0) + '/' + e.n;
    txt(title, X + 6, Y + 4, '#e0c8ff', 8, 'left', W - 44);
    const sec = Math.max(0, Math.ceil(e.t));
    txt('0:' + String(sec).padStart(2, '0'), X + W - 6, Y + 4, sec <= 8 ? '#ff9166' : '#cfe8f0', 8, 'right');
    bar(X + 6, Y + 15, W - 12, 3, e.t / e.max, sec <= 8 ? '#ff9166' : EV_COL);
    const t = evTarget();
    if (t) edgeArrow(t.x, t.y, e.kind === 'ace' ? '#ffd94a' : EV_COL);
  }
  /* активные усиления — строкой над панелью задач */
  let x = 6;
  const y = VH - 62;
  for (const id of BUFF_IDS) {
    if (!buffOn(id)) continue;
    const B = BUFFS[id];
    const blink = buffs[id] < 2 && Math.floor(tGlobal * 8) % 2;
    ctx.globalAlpha = blink ? 0.45 : 1;
    panel(x, y, 66, 13, B.col);
    txt(T(B.key), x + 33, y + 2, B.col, 8, 'center', 58);
    bar(x + 4, y + 10, 58, 1, buffs[id] / B.dur, B.col);
    ctx.globalAlpha = 1;
    x += 70;
  }
}

/* ===== src/gfx/scene.js ===== */
;
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

/* ===== src/ui/hud.js ===== */
;
'use strict';
/* ============================================================
   hud.js — интерфейс: панели, шкалы, радар, указатели, сообщения
   ============================================================ */

/* maxW — необязательная ширина: моноширинный шрифт на разных устройствах
   разный (Consolas узкий, у телефонов и Mac шире на 10-15%), и длинная
   строка в узком месте ужимается, а не вылезает за панель */
function txt(s, x, y, col, size, align, maxW) {
  size = size || 8; align = align || 'left';
  ctx.font = size + 'px monospace';
  ctx.textAlign = align;
  const fit = maxW > 0 && ctx.measureText(s).width > maxW;
  ctx.fillStyle = '#06131c';
  if (fit) ctx.fillText(s, x + 1, y + 1, maxW); else ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = col || '#cfe8f0';
  if (fit) ctx.fillText(s, x, y, maxW); else ctx.fillText(s, x, y);
}
/* VK Play: скрипт площадки mailru.core.js содержит MD5 с утечкой
   глобальной переменной (txt = '' без var) и затирает эту функцию —
   после этого игра падает на каждом кадре. Запрещаем перезапись: их
   код нестрогий, и присваивание там просто молча пропускается. */
try { Object.defineProperty(window, 'txt', { writable: false }); } catch (e) {}

/* ширина надписи в единицах разметки */
function txtW(s, size) {
  ctx.font = (size || 8) + 'px monospace';
  return ctx.measureText(s).width;
}

function panel(x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(4,18,30,0.84)';
  ctx.fillRect(x, y, w, h);
  const t = D * 2;                                  /* тонкая рамка: 2 физических пикселя */
  ctx.strokeStyle = accent || '#2c5a70';
  ctx.lineWidth = t;
  ctx.strokeRect(x + t / 2, y + t / 2, w - t, h - t);
  /* уголки */
  ctx.fillStyle = accent || '#4a86a3';
  ctx.fillRect(x, y, 3.5, t); ctx.fillRect(x, y, t, 3.5);
  ctx.fillRect(x + w - 3.5, y, 3.5, t); ctx.fillRect(x + w - t, y, t, 3.5);
  ctx.fillRect(x, y + h - t, 3.5, t); ctx.fillRect(x, y + h - 3.5, t, 3.5);
  ctx.fillRect(x + w - 3.5, y + h - t, 3.5, t); ctx.fillRect(x + w - t, y + h - 3.5, t, 3.5);
}

function segBar(x, y, frac, segs, colOverride) {
  frac = clamp(frac, 0, 1);
  const col = colOverride || (frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#ffb454' : '#e5484d');
  ctx.fillStyle = '#0a1620'; ctx.fillRect(x - 1, y - 1, segs * 5 + 2, 8);
  for (let i = 0; i < segs; i++) {
    const on = frac * segs > i;
    ctx.fillStyle = on ? col : '#182a36';
    ctx.fillRect(x + i * 5, y, 4, 6);
    if (on) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + i * 5, y, 4, 1); }
  }
  /* пульсация последнего сегмента при низком значении */
  if (frac < 0.25 && Math.floor(tGlobal * 6) % 2) {
    ctx.fillStyle = 'rgba(229,72,77,0.5)';
    ctx.fillRect(x - 1, y - 1, segs * 5 + 2, 8);
  }
}

function bar(x, y, w, h, frac, col, bg) {
  ctx.fillStyle = bg || '#0a1620'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

/* стрелка к цели за краем экрана */
/* Где встаёт стрелка к цели за краем. Стрелки ходят по внутренней
   рамке, а не по краю экрана: у края лежат панели HUD, радар и сенсорные
   кнопки, и стрелка ложилась прямо на них. */
function arrowPos(a) {
  const L = 16, R = VW - 16, Tp = 58, B = VH - 88;     /* ниже верхних панелей, выше нижних и блока серии */
  const cx = (L + R) / 2, cy = (Tp + B) / 2;
  const c = Math.cos(a), s = Math.sin(a);
  const t = Math.min((R - cx) / Math.max(0.001, Math.abs(c)), (B - cy) / Math.max(0.001, Math.abs(s)));
  let x = cx + c * t, y = cy + s * t;
  /* радар в правом верхнем углу */
  if (x > VW - 100 && y < 100) { if (x >= R - 0.5) y = 100; else x = VW - 100; }
  /* колонка сенсорных кнопок справа */
  if (touchMode() && x > VW - 192 && y > 96) { if (x >= R - 0.5) y = 96; else x = VW - 192; }
  return { x, y };
}

function edgeArrow(tx, ty, col) {
  const a = Math.atan2(ty - player.y, tx - player.x);
  const sxp = sX(tx), syp = sY(ty);
  if (sxp > 24 && sxp < VW - 24 && syp > 24 && syp < VH - 24) return;
  const p = arrowPos(a);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tGlobal * 5);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------- радар: круглый полупрозрачный скоп ---------- */
/* Рамки нет — только диск поверх сцены. Мир вписан в круг по диагонали,
   поэтому ни один угол карты не теряется. Отметки вспыхивают в момент
   прохода луча и гаснут за оборот. */
function drawRadar(P) {
  const cx = VW - 48, cy = 50, R = 40;
  const RA = 0.88;                          /* общая непрозрачность скопа */

  const k = (R * 2 - 3) / Math.hypot(WORLD.w, WORLD.h);
  const mx = cx - WORLD.w * k / 2, my = cy - WORLD.h * k / 2;
  const px = x => mx + x * k, py = y => my + y * k;

  const range = radarRange(), seeAll = radarHacked;
  const vis = (x, y) => seeAll || dist(x, y, P.x, P.y) < range;
  const sweep = tGlobal * 1.1;
  const ping = (x, y) => {
    let age = (sweep - Math.atan2(py(y) - cy, px(x) - cx)) % TAU;
    if (age < 0) age += TAU;
    return 0.40 + 0.60 * (1 - age / TAU);
  };

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  /* сквозь диск видно море */
  ctx.fillStyle = 'rgba(4,18,30,0.46)';
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  /* силуэты островов */
  ctx.fillStyle = 'rgba(52,120,92,0.68)';
  for (const isl of islands) {
    const n = isl.rad.length, step = Math.max(1, Math.round(n / 14));
    ctx.beginPath();
    for (let i = 0; i < n; i += step) {
      const a = i / n * TAU, r = isl.rad[i];
      const X = px(isl.x + Math.cos(a) * r), Y = py(isl.y + Math.sin(a) * r);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath(); ctx.fill();
    if (isl.r * k < 1.6) { ctx.beginPath(); ctx.arc(px(isl.x), py(isl.y), 1.1, 0, TAU); ctx.fill(); }
  }

  /* зона обнаружения и видимая область экрана */
  if (!seeAll) {
    ctx.strokeStyle = 'rgba(110,255,170,0.16)'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(px(P.x), py(P.y), range * k, 0, TAU); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(244,248,250,0.20)'; ctx.lineWidth = D * 2;
  ctx.strokeRect(px(ox), py(oy), (VW / cam.z) * k, (VH / cam.z) * k);

  const blip = (x, y, col, sz) => {
    ctx.globalAlpha = RA * ping(x, y);
    ctx.fillStyle = col;
    ctx.fillRect(px(x) - sz / 2, py(y) - sz / 2, sz, sz);
    ctx.globalAlpha = 1;
  };
  for (const s of structs) {
    if (s.type === 'crate' || !vis(s.x, s.y)) continue;
    const col = s.type === 'tower' ? (s.dead ? '#2a3a3a' : '#7fd4e0')
              : s.dead ? '#3a2020'
              : (s.type === 'base' ? '#ff5a5a' : '#c8484d');
    blip(s.x, s.y, col, s.type === 'base' ? 2.6 : 1.8);
  }
  for (const e of enemies) if (vis(e.x, e.y)) blip(e.x, e.y, '#ff5a5a', 1.8);
  for (const p of planes)  if (vis(p.x, p.y)) blip(p.x, p.y, '#ff9ad5', 1.8);
  for (const h of hostages) if (h.state === 'wait') blip(h.x, h.y, '#ffd94a', 1.8);
  for (const m of marines) if (m.state === 'wait') blip(m.x, m.y, '#6fae5a', 1.8);
  evRadar(blip);
  if (targetIsl) {
    ctx.globalAlpha = RA * (0.5 + 0.5 * Math.sin(tGlobal * 3));
    ctx.strokeStyle = '#ff9166'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(px(targetIsl.x), py(targetIsl.y), 4.5, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const s of subs) if (subExposed(s) || dist(s.x, s.y, P.x, P.y) < range * 0.55)
    blip(s.x, s.y, subExposed(s) ? '#ff9166' : '#5f7f8c', 1.8);
  if (transport && !transport.dead) {
    ctx.globalAlpha = RA;
    ctx.fillStyle = transport.done ? '#4ade80' : (Math.floor(tGlobal * 3) % 2 ? '#4ade80' : '#2f7a4a');
    ctx.fillRect(px(transport.x) - 2, py(transport.y) - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = RA * 0.85;
  for (const t of tornados) {
    ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(px(t.x), py(t.y), 2.6, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (boss && vis(boss.x, boss.y)) {
    ctx.globalAlpha = RA;
    ctx.fillStyle = Math.floor(tGlobal * 5) % 2 ? '#ff2a2a' : '#ffd94a';
    ctx.fillRect(px(boss.x) - 2, py(boss.y) - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  /* авианосец и свой катер горят постоянно */
  ctx.globalAlpha = RA;
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(px(CARR.x) - 2, py(CARR.y) - 0.5, 4, 1);
  ctx.fillRect(px(CARR.x) - 0.5, py(CARR.y) - 2, 1, 4);
  ctx.fillStyle = '#f4f8fa';
  ctx.fillRect(px(P.x) - 1, py(P.y) - 1, 2, 2);
  ctx.globalAlpha = 1;

  /* луч развёртки с затухающим хвостом */
  for (let i = 0; i < 12; i++) {
    const a0 = sweep - i * 0.06;
    ctx.fillStyle = 'rgba(110,255,170,' + (0.10 * (1 - i / 12)).toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0 - 0.061, a0); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(150,255,190,0.42)'; ctx.lineWidth = D * 2;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
  ctx.stroke();
  ctx.restore();

  /* сетка скопа */
  ctx.strokeStyle = 'rgba(110,255,170,0.13)'; ctx.lineWidth = D * 2;
  for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, TAU); ctx.stroke(); }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  /* обод и риски */
  ctx.strokeStyle = 'rgba(122,190,215,0.50)'; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(122,190,215,0.30)'; ctx.lineWidth = D * 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  if (seeAll && Math.floor(tGlobal * 2) % 2)
    txt(T('radarOpen'), cx, cy + R + 4, '#7fd4e0', 8, 'center');
}

/* ---------- основной HUD ---------- */
function drawHUD() {
  const P = player;

  /* три зоны на значках: «я», «что делать», «чем» (см. hudx.js) */
  const touchHud = touchMode();
  hudStatus(P);
  drawRadar(P);
  hudObjective(P);
  hudAbilities(P);

  /* серия: множитель растёт кеглем; на телефоне — строкой под «я» */
  if (combo >= 2) {
    const k = clamp(comboT / 4, 0, 1);
    ctx.globalAlpha = 0.5 + 0.5 * k;
    if (touchHud) {
      txt('x' + comboMul().toFixed(2) + ' • ' + T('streakN', combo), 8, 49, '#ff9ad5', 8, 'left', 150);
      ctx.globalAlpha = 1;
      hudBar(8, 58, 100, 2, k, '#ff9ad5');
    } else {
      const sz = 8 + Math.min(6, combo);
      txt('x' + comboMul().toFixed(2), VW - 50, VH - 40, '#ff9ad5', sz, 'center');
      txt(T('streakN', combo), VW - 50, VH - 22, '#ff9ad5', 8, 'center');
      ctx.globalAlpha = 1;
      hudBar(VW - 86, VH - 12, 72, 3, k, '#ff9ad5');
    }
    ctx.globalAlpha = 1;
  }

  /* событие боя и активные усиления */
  drawEvHud();

  /* подсказка магазина */
  const dc = dist(P.x, P.y, CARR.x, CARR.y);
  if (dc < 145 && !P.dead && touchMode() && Math.floor(tGlobal * 2) % 2)
    txt(touchMode() ? T('arsenalTap') : T('arsenalHint'),
        clamp(sX(CARR.x), 50, VW - 50), clamp(sY(CARR.y) - 62, 12, VH - 30), '#4ade80', 8, 'center');

  /* Сообщения и баннер — только в самом бою. Под затемнением паузы
     и итогов они просвечивали и ложились на заголовки экранов. */
  const live = state === 'play' || state === 'dying';

  /* сообщения */
  let yy = touchHud ? 66 : 54;              /* под плашками «я» и «цель» */
  if (boss || ev) yy = Math.max(yy, 54);
  if (live) for (const m of msgs) {
    if (m.age < m.delay) continue;
    const rem = m.delay + m.dur - m.age;
    if (rem <= 0) continue;
    const shown = Math.min(m.text.length, Math.floor((m.age - m.delay) * 40));
    /* пока висит баннер (74..116), стопка сообщений перепрыгивает под него */
    if (banner.t > 0 && yy + 10 > 73 && yy < 117) yy = 120;
    ctx.globalAlpha = Math.min(1, rem / 0.4);
    txt(m.text.slice(0, shown), VW / 2, yy, m.col, 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
    yy += 13;
  }

  /* баннер уровня */
  if (live && banner.t > 0) {
    const a = Math.min(1, banner.t / 0.6);
    const slide = (1 - Math.min(1, (3.6 - banner.t) * 4)) * 30;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,14,24,0.6)'; ctx.fillRect(0, 74, VW, 42);
    ctx.fillStyle = '#e5484d'; ctx.fillRect(0, 74, VW, 1); ctx.fillRect(0, 115, VW, 1);
    txt(banner.main, VW / 2 + slide, 80, '#ffb454', 16, 'center');
    txt(banner.sub, VW / 2 - slide, 104, '#f4f8fa', 8, 'center', VW - 16);
    ctx.globalAlpha = 1;
  }

  tutDraw();                               /* обучение новичка */

  /* указатели целей */
  let nearest = null, nd = 1e9;
  for (const h of hostages) if (h.state === 'wait') {
    const d = dist(P.x, P.y, h.x, h.y);
    if (d < nd) { nd = d; nearest = h; }
  }
  if (curCfg.mission === 'convoy' && transport && !transport.dead && !transport.done)
    edgeArrow(transport.x, transport.y, '#4ade80');
  if (curCfg.mission === 'escort') {
    if (P.troops > 0 && targetIsl) edgeArrow(targetIsl.x, targetIsl.y, '#ff9166');
    else if (marines.length && allyIsl) edgeArrow(allyIsl.x, allyIsl.y, '#6fae5a');
    else if (targetIsl && !allTargetStructsDead()) edgeArrow(targetIsl.x, targetIsl.y, '#ff9166');
  }
  if (nearest) edgeArrow(nearest.x, nearest.y, '#ffd94a');
  if (P.aboard > 0) edgeArrow(CARR.x, CARR.y, '#4ade80');
  if (boss) edgeArrow(boss.x, boss.y, '#ff2a2a');
  if (!nearest && !boss && destroyedBases < totalBases) {
    let nb = null, nbd = 1e9;
    for (const s of structs) if (!s.dead && s.type === 'base') {
      const d = dist(P.x, P.y, s.x, s.y);
      if (d < nbd) { nbd = d; nb = s; }
    }
    if (nb && nbd > 260) edgeArrow(nb.x, nb.y, '#ff6b5e');
  }

  /* кнопки для мыши: пауза и арсенал */
  drawHudButtons();

  /* экранные кнопки и стик */
  drawTouchUI();

  /* прицел */
  if (!P.dead && (!touchMode() || tAim.id >= 0)) {
    const rdy = P.cool <= 0;
    ctx.strokeStyle = rdy ? '#ffd94a' : '#7a6a30';
    ctx.lineWidth = D * 2;
    const mx = mouse.x, my = mouse.y;
    const g = rdy ? 2 : 3.5;
    ctx.beginPath();
    ctx.moveTo(mx - 7, my); ctx.lineTo(mx - g, my);
    ctx.moveTo(mx + g, my); ctx.lineTo(mx + 7, my);
    ctx.moveTo(mx, my - 7); ctx.lineTo(mx, my - g);
    ctx.moveTo(mx, my + g); ctx.lineTo(mx, my + 7);
    ctx.stroke();
    if (rdy) { ctx.fillStyle = '#ffd94a'; ctx.fillRect(mx - D, my - D, D * 2, D * 2); }
    /* радиус ПВО */
    if (upg.pd > 0) {
      ctx.strokeStyle = 'rgba(127,212,224,0.13)';
      ctx.lineWidth = D * 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(sX(P.x), sY(P.y), pdRange() * cam.z, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* повреждения — рамка */
  if (P.fr > 0) {
    ctx.fillStyle = 'rgba(229,72,77,' + (P.fr * 0.8).toFixed(2) + ')';
    ctx.fillRect(0, 0, VW, 3); ctx.fillRect(0, VH - 3, VW, 3);
    ctx.fillRect(0, 0, 3, VH); ctx.fillRect(VW - 3, 0, 3, VH);
  }
  if (P.hp < P.maxhp * 0.3 && !P.dead) {
    const a = 0.12 + 0.1 * Math.sin(tGlobal * 6);
    ctx.fillStyle = 'rgba(229,72,77,' + a.toFixed(2) + ')';
    ctx.fillRect(0, 0, VW, 2); ctx.fillRect(0, VH - 2, VW, 2);
    if (Math.floor(tGlobal * 2) % 2) txt(T('critical'), VW / 2, VH - 74, '#e5484d', 8, 'center');
  }
}

/* ===== src/ui/hudx.js ===== */
;
'use strict';
/* ============================================================
   hudx.js — HUD на значках вместо слов.

   Три зоны, и в каждой одна мысль:
   • слева вверху — «я»: щит-прочность, молния-форсаж, кредиты и очки;
   • сверху по центру — «что делать»: значок цели, прогресс,
     расстояние до цели и сирена тревоги;
   • слева внизу — «чем»: ячейки умений с откатом и клавишей,
     места в шлюпке.
   Значки нарисованы векторно: читаются на любом экране и языке.
   ============================================================ */

/* ---------- значки (x, y — левый верхний угол, s — размер) ---------- */
const ICON = {
  shield(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y); ctx.lineTo(x + s, y + s * 0.2); ctx.lineTo(x + s * 0.92, y + s * 0.62);
    ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.9, x + s / 2, y + s);
    ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.9, x + s * 0.08, y + s * 0.62);
    ctx.lineTo(x, y + s * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + s * 0.3, y + s * 0.22, s * 0.14, s * 0.5);
  },
  bolt(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.62, y); ctx.lineTo(x + s * 0.15, y + s * 0.58); ctx.lineTo(x + s * 0.48, y + s * 0.58);
    ctx.lineTo(x + s * 0.36, y + s); ctx.lineTo(x + s * 0.85, y + s * 0.4); ctx.lineTo(x + s * 0.52, y + s * 0.4);
    ctx.closePath(); ctx.fill();
  },
  coin(x, y, s) {
    const r = s / 2;
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x + r, y + r, r * 0.78, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b8860b'; ctx.fillRect(x + r - s * 0.08, y + s * 0.25, s * 0.16, s * 0.5);
  },
  star(x, y, s, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.22 : s * 0.5;
      const px = x + s / 2 + Math.cos(a) * r, py = y + s / 2 + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  },
  base(x, y, s, col) {           /* укрепление с флажком */
    ctx.fillStyle = col;
    ctx.fillRect(x + s * 0.1, y + s * 0.5, s * 0.8, s * 0.5);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + s * (0.1 + i * 0.3), y + s * 0.38, s * 0.2, s * 0.14);
    ctx.fillRect(x + s * 0.48, y, s * 0.08, s * 0.5);
    ctx.beginPath(); ctx.moveTo(x + s * 0.56, y); ctx.lineTo(x + s * 0.9, y + s * 0.12); ctx.lineTo(x + s * 0.56, y + s * 0.24); ctx.fill();
  },
  person(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.22, s * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y + s); ctx.quadraticCurveTo(x + s * 0.15, y + s * 0.46, x + s / 2, y + s * 0.46);
    ctx.quadraticCurveTo(x + s * 0.85, y + s * 0.46, x + s * 0.85, y + s); ctx.closePath(); ctx.fill();
  },
  eye(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y + s / 2);
    ctx.quadraticCurveTo(x + s / 2, y - s * 0.05, x + s, y + s / 2);
    ctx.quadraticCurveTo(x + s / 2, y + s * 1.05, x, y + s / 2); ctx.fill();
    ctx.fillStyle = '#06131c'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.2, 0, TAU); ctx.fill();
  },
  ship(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.55); ctx.lineTo(x + s, y + s * 0.55);
    ctx.lineTo(x + s * 0.82, y + s * 0.88); ctx.lineTo(x + s * 0.12, y + s * 0.88); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + s * 0.32, y + s * 0.25, s * 0.34, s * 0.3);
    ctx.fillRect(x + s * 0.46, y + s * 0.05, s * 0.08, s * 0.2);
  },
  skull(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.42, s * 0.4, 0, TAU); ctx.fill();
    ctx.fillRect(x + s * 0.28, y + s * 0.62, s * 0.44, s * 0.32);
    ctx.fillStyle = '#06131c';
    ctx.beginPath(); ctx.arc(x + s * 0.34, y + s * 0.42, s * 0.1, 0, TAU); ctx.arc(x + s * 0.66, y + s * 0.42, s * 0.1, 0, TAU); ctx.fill();
  },
  siren(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * 0.8); ctx.lineTo(x + s * 0.18, y + s * 0.45);
    ctx.quadraticCurveTo(x + s / 2, y + s * 0.02, x + s * 0.82, y + s * 0.45); ctx.lineTo(x + s * 0.82, y + s * 0.8); ctx.fill();
    ctx.fillRect(x + s * 0.05, y + s * 0.82, s * 0.9, s * 0.16);
  },
  cloud(x, y, s, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.arc(x + s * 0.3, y + s * 0.6, s * 0.24, 0, TAU); ctx.arc(x + s * 0.55, y + s * 0.45, s * 0.3, 0, TAU);
    ctx.arc(x + s * 0.76, y + s * 0.64, s * 0.22, 0, TAU); ctx.fill();
    ctx.fillRect(x + s * 0.3, y + s * 0.62, s * 0.46, s * 0.22);
  },
  barrel(x, y, s, col) {
    ctx.fillStyle = col;
    rrect(ctx, x + s * 0.2, y + s * 0.08, s * 0.6, s * 0.84, s * 0.12); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + s * 0.2, y + s * 0.3, s * 0.6, s * 0.08); ctx.fillRect(x + s * 0.2, y + s * 0.62, s * 0.6, s * 0.08);
  },
  rocket(x, y, s, col) {
    ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.18, -s * 0.2, s * 0.14, s * 0.3);
    ctx.lineTo(-s * 0.14, s * 0.3); ctx.quadraticCurveTo(-s * 0.18, -s * 0.2, 0, -s * 0.5); ctx.fill();
    ctx.fillRect(-s * 0.28, s * 0.18, s * 0.56, s * 0.14);
    ctx.fillStyle = '#ff8b3d'; ctx.fillRect(-s * 0.08, s * 0.3, s * 0.16, s * 0.18);
    ctx.restore();
  },
  anchor(x, y, s, col) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(D * 2, s * 0.12);
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.14, s * 0.12, 0, TAU);
    ctx.moveTo(x + s / 2, y + s * 0.26); ctx.lineTo(x + s / 2, y + s * 0.92);
    ctx.moveTo(x + s * 0.28, y + s * 0.42); ctx.lineTo(x + s * 0.72, y + s * 0.42);
    ctx.moveTo(x + s * 0.12, y + s * 0.62); ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.95, x + s / 2, y + s * 0.92);
    ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.95, x + s * 0.88, y + s * 0.62);
    ctx.stroke();
  }
};

/* плашка с мягкими краями под значками */
function hudPlate(x, y, w, h, col) {
  ctx.fillStyle = 'rgba(4,16,26,0.62)';
  rrect(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = col || 'rgba(120,190,215,0.28)'; ctx.lineWidth = D * 2;
  ctx.stroke();
}
/* полоса с закруглением и бликом */
function hudBar(x, y, w, h, frac, col, bg) {
  frac = clamp(frac, 0, 1);
  ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
  rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = col;
    rrect(ctx, x, y, Math.max(h, w * frac), h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + h / 2, y + h * 0.15, Math.max(0, w * frac - h), Math.max(D, h * 0.22));
  }
}
const hullCol = f => f > 0.6 ? '#4ade80' : f > 0.3 ? '#ffd94a' : '#e5484d';

/* ---------- «я»: прочность, форсаж, кредиты, очки ---------- */
function hudStatus(P) {
  hudPlate(5, 5, 152, 40);
  const f = P.hp / P.maxhp;
  const low = f < 0.3 && Math.floor(tGlobal * 5) % 2;
  const rep = dist(P.x, P.y, CARR.x, CARR.y) < 115 && P.hp < P.maxhp;
  ICON.shield(10, 8, 10, low ? '#ff6b5e' : hullCol(f));
  if (rep && Math.floor(tGlobal * 3) % 2) {        /* ремонт у авианосца */
    ctx.fillStyle = '#ffffff'; ctx.fillRect(13.8, 10.6, 2.4, 5.6); ctx.fillRect(12.2, 12.2, 5.6, 2.4);
  }
  hudBar(24, 9, 104, 8, f, hullCol(f));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 1; k < 4; k++) ctx.fillRect(24 + 104 * k / 4, 9, D * 2, 8);
  txt(String(Math.ceil(P.hp)), 153, 9, low ? '#ff6b5e' : '#f4f8fa', 8, 'right');

  const lock = P.boostLock > 0;
  ICON.bolt(11, 20, 8, lock ? '#ff8b3d' : (typeof buffOn === 'function' && buffOn('nitro')) ? '#4ade80' : '#7fd4e0');
  hudBar(24, 22, 104, 4, P.boostE / boostMax(), lock ? '#b86a3a' : '#7fd4e0');
  if (upg.pd > 0) {                                    /* ПВО: маленький радар-кружок */
    ctx.strokeStyle = Math.floor(tGlobal * 3) % 2 ? '#7fd4e0' : '#3d6b78'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(145, 24, 3, 0, TAU); ctx.stroke();
  }

  ICON.coin(10, 31, 8);
  txt(String(money), 22, 31, '#ffd94a', 8, 'left', 58);
  ICON.star(82, 31, 8, '#cfe8f0');
  txt(String(score), 94, 31, '#cfe8f0', 8, 'left', 60);
}

/* ---------- «что делать»: цель уровня ---------- */
function hudObjective(P) {
  const m = curCfg.mission;
  const parts = [];               /* [ширина, отрисовщик(x)] */
  const Y = 6, H = 18, cy = Y + 5;
  const add = (w, fn) => parts.push([w, fn]);

  if (m === 'night') {
    add(10, x => ICON.person(x, cy - 1, 9, '#ffd94a'));
    const s = rescued + '/' + spawned;
    add(txtW(s) + 4, x => txt(s, x, cy, '#ffd94a'));
    add(10, x => ICON.eye(x, cy, 9, stealth.blown ? '#e5484d' : stealth.lit ? '#ffb454' : '#7fd4e0'));
    add(44, x => hudBar(x, cy + 2, 40, 4, stealth.blown ? 1 : stealth.meter,
                        stealth.blown ? '#e5484d' : stealth.meter > 0.55 ? '#ffb454' : '#4ade80'));
  } else if (m === 'escort') {
    const tl = targetLeft();
    add(10, x => ICON.person(x, cy - 1, 9, '#6fae5a'));
    const sq = landed + '/' + (landed + P.troops + marines.length);
    add(txtW(sq) + 6, x => txt(sq, x, cy, '#6fae5a'));
    add(10, x => ICON.base(x, cy - 1, 9, '#ff9166'));
    const ts = tl[0] + '/' + tl[1];
    add(txtW(ts) + 4, x => txt(ts, x, cy, '#ff9166'));
  } else if (m === 'convoy' && transport) {
    add(11, x => ICON.ship(x, cy - 1, 10, transport.dead ? '#e5484d' : '#4ade80'));
    add(56, x => {
      hudBar(x, cy, 52, 4, convoyProgress(), '#4ade80');
      hudBar(x, cy + 6, 52, 2, transport.hp / transport.max, transport.hp / transport.max > 0.4 ? '#9fe8ff' : '#e5484d');
    });
    const pc = Math.round(convoyProgress() * 100) + '%';
    add(txtW(pc) + 4, x => txt(pc, x, cy, '#4ade80'));
  } else {
    add(10, x => ICON.base(x, cy - 1, 9, '#ff9166'));
    /* по флажку на базу: закрашенные — уничтожены */
    const n = totalBases;
    add(n * 8 + 2, x => {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < destroyedBases ? '#4ade80' : 'rgba(255,145,102,0.35)';
        rrect(ctx, x + i * 8, cy, 6, 6, 1.5); ctx.fill();
      }
    });
  }
  let rsIdx = -1;
  if (spawned && m !== 'night') {
    rsIdx = parts.length;
    const rs = rescued + '/' + spawned;
    add(9, x => ICON.person(x, cy - 1, 8, '#ffd94a'));
    add(txtW(rs) + 4, x => txt(rs, x, cy, '#ffd94a'));
  }
  /* куда плыть */
  const tg = objTarget();
  if (tg && dist(P.x, P.y, tg.x, tg.y) > 60) {
    const ds = T('hudDist', Math.round(dist(P.x, P.y, tg.x, tg.y) * 2 / 10) * 10);
    const col = tg === CARR ? '#4ade80' : '#ffffff';
    add(txtW(ds) + 12, x => {
      const a = Math.atan2(tg.y - P.y, tg.x - P.x);
      ctx.save(); ctx.translate(x + 4, cy + 3.5); ctx.rotate(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-1.5, 0); ctx.lineTo(-3, 3); ctx.fill();
      ctx.restore();
      txt(ds, x + 10, cy, col);
    });
  }
  /* тревога: сирена и три деления */
  const alertCol = ['#4ade80', '#ffd94a', '#ffb454', '#e5484d'][alert] || '#e5484d';
  add(30, x => {
    const blink = alert >= 3 && Math.floor(tGlobal * 4) % 2;
    ICON.siren(x, cy - 1, 9, blink ? '#ffffff' : alertCol);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < alert ? alertCol : 'rgba(255,255,255,0.14)';
      rrect(ctx, x + 12 + i * 6, cy + 1, 4, 6, 1); ctx.fill();
    }
  });

  /* плашка живёт между блоком «я» (до x=160) и радаром (от x=388);
     если не влезает — сначала уходит счётчик заложников */
  const gap = 5, L0 = 162, R0 = VW - 94;
  const width = () => parts.reduce((a, p) => a + p[0], 0) + gap * (parts.length - 1) + 14;
  if (width() > R0 - L0 && rsIdx >= 0) parts.splice(rsIdx, 2);
  const W = width();
  const X = clamp(VW / 2 - W / 2, L0, Math.max(L0, R0 - W));
  hudPlate(X, Y, W, H, alert >= 2 ? 'rgba(229,72,77,0.55)' : 'rgba(255,180,84,0.45)');
  let x = X + 7;
  for (const [w, fn] of parts) { fn(x); x += w + gap; }
  hudObjRect = { x: X, y: Y, w: W, h: H };          /* для подсветки обучением */

  /* флагман: полоса жизни прямо под целью */
  if (boss) {
    const bw = 190, bx = VW / 2 - bw / 2;
    hudPlate(bx, 28, bw, 17, 'rgba(229,72,77,0.7)');
    ICON.skull(bx + 5, 31, 10, '#ff9166');
    txt(bossTitle(), bx + 18, 30, '#ff9166', 8, 'left', bw - 24);
    hudBar(bx + 18, 39, bw - 24, 3, boss.hp / boss.max, boss.hp / boss.max > 0.3 ? '#e5484d' : '#ffb454');
  }
}
let hudObjRect = { x: 0, y: 0, w: 0, h: 0 };

/* ---------- «чем»: умения и шлюпка ---------- */
let hudAbilRect = { x: 0, y: 0, w: 0, h: 0 };
function hudSlot(x, y, icon, col, cdFrac, key, count) {
  const S = 22;
  hudPlate(x, y, S, S, cdFrac > 0 ? 'rgba(120,190,215,0.2)' : col);
  icon(x + 5, y + 4, 12, cdFrac > 0 ? '#4d6b7a' : col);
  if (cdFrac > 0) {               /* откат — тёмный сектор, уходящий по часовой */
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.moveTo(x + S / 2, y + S / 2);
    ctx.arc(x + S / 2, y + S / 2, S * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * cdFrac);
    ctx.closePath(); ctx.save(); rrect(ctx, x, y, S, S, 3); ctx.clip(); ctx.fill(); ctx.restore();
  }
  if (key && !touchMode()) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; rrect(ctx, x + S - 9, y + S - 8, 10, 9, 2); ctx.fill();
    txt(key, x + S - 4, y + S - 7.5, '#cfe8f0', 8, 'center');
  }
  if (count !== undefined) txt(String(count), x + 2, y + S - 8.5, count > 0 ? '#ffffff' : '#e5484d', 8, 'left');
}
function hudAbilities(P) {
  const touch = touchMode();
  let x = 8;
  const y = VH - 30;
  if (!touch) {
    hudSlot(x, y, ICON.cloud, '#9fe8ff', smokeCD / SMOKE_CD, 'F'); x += 26;
    if (upg.dc) { hudSlot(x, y, ICON.barrel, '#ffb454', dcCD / DC_CD, 'Q'); x += 26; }
    if (upg.msl) { hudSlot(x, y, ICON.rocket, '#7fd4e0', mCool > 0 ? mCool / 0.5 : 0, '', upg.ammo); x += 26; }
    hudAbilRect = { x: 6, y: y - 2, w: x - 6, h: 26 };
  }                                   /* на телефоне ракеты считает своя кнопка */
  /* шлюпка: места — человечки; заняты заложниками или десантом */
  const cap = capacity();
  if (P.aboard || P.troops || touch) {
    const yy = touch ? VH - 20 : y - 14;
    for (let i = 0; i < cap; i++) {
      const col = i < P.aboard ? '#ff8b3d' : i < P.aboard + P.troops ? '#6fae5a' : 'rgba(255,255,255,0.18)';
      ICON.person(8 + i * 9, yy, 8, col);
    }
  }
}

/* ===== src/ui/shop.js ===== */
;
'use strict';
/* ============================================================
   shop.js — арсенал «СЕВЕР»: список улучшений, покупка, отрисовка.

   Цены подобраны так, чтобы полное дерево (~27 000 кредитов) нельзя
   было выкупить за один-два уровня: доход растёт медленнее стоимости.
   ============================================================ */

const ITEMS = [
  { name: 'itRepair', desc: 'itRepairD',
    lvl: () => 0, max: 99, cost: () => 150, can: () => player.hp < player.maxhp,
    buy: () => { player.hp = Math.min(player.maxhp, player.hp + 40); } },

  { name: 'itArmor', desc: 'itArmorD',
    lvl: () => upg.armor, max: 5, cost: () => 600 + upg.armor * 420,
    buy: () => { upg.armor++; player.maxhp = maxhpVal(); player.hp = Math.min(player.maxhp, player.hp + 25); } },

  { name: 'itGun', desc: 'itGunD',
    lvl: () => upg.dmg, max: 4, cost: () => 500 + upg.dmg * 450, buy: () => { upg.dmg++; } },

  { name: 'itRate', desc: 'itRateD',
    lvl: () => upg.rate, max: 4, cost: () => 500 + upg.rate * 450, buy: () => { upg.rate++; } },

  { name: 'itEngine', desc: 'itEngineD',
    lvl: () => upg.eng, max: 3, cost: () => 400 + upg.eng * 350, buy: () => { upg.eng++; } },

  { name: 'itBoost', desc: 'itBoostD',
    lvl: () => upg.boost, max: 3, cost: () => 450 + upg.boost * 350,
    buy: () => { upg.boost++; player.boostE = boostMax(); } },

  { name: 'itMissile', desc: 'itMissileD',
    lvl: () => upg.msl, max: 1, cost: () => 900, buy: () => { upg.msl = 1; upg.ammo += 6; } },

  { name: 'itAmmo', desc: 'itAmmoD',
    lvl: () => 0, max: 99, cost: () => 260, can: () => upg.msl > 0, buy: () => { upg.ammo += 6; } },

  { name: 'itBoat', desc: 'itBoatD',
    lvl: () => upg.boat, max: 2, cost: () => 600 + upg.boat * 500, buy: () => { upg.boat++; } },

  { name: 'itPd', desc: 'itPdD',
    lvl: () => upg.pd, max: 2, cost: () => 1500 + upg.pd * 1100, buy: () => { upg.pd++; } },

  { name: 'itRadar', desc: 'itRadarD',
    lvl: () => upg.radar, max: 3, cost: () => 400 + upg.radar * 350, buy: () => { upg.radar++; } },

  { name: 'itDC', desc: 'itDCD',
    lvl: () => upg.dc, max: 1, cost: () => 850, buy: () => { upg.dc = 1; } }
];

/* ------------------------------------------------------------
   Нижний блок арсенала: барабан, ракеты за ролик и две постоянные
   вещи. Они живут отдельным списком под чертой, чтобы не мешаться
   с обычной прокачкой.
   ------------------------------------------------------------ */
let adAmmoT = 0;                       /* откат ролика за ракеты */

const PREMIUM_ALL = [
  { name: 'itCrate', desc: 'itCrateD',
    tag: () => (crateT > 0 ? fmtT(crateT) : T('adFree')),
    on: () => true, act: () => openCrate('shop'), col: '#ff9ad5' },

  { ad: true, name: 'itAdAmmo', desc: 'itAdAmmoD',
    tag: () => (adAmmoT > 0 ? fmtT(adAmmoT) : '▶'),
    on: () => upg.msl > 0 && adAmmoT <= 0,
    act: () => {
      if (!upg.msl) { shopMsg = T('mNoLauncher'); shopMsgGood = false; shopMsgT = 1.6; SFX.hit(); return; }
      if (adAmmoT > 0) return;
      adRewarded(() => { upg.ammo += 8; adAmmoT = 90; shopMsg = T('shopBought', T('itAdAmmo')); shopMsgGood = true; shopMsgT = 2; });
    }, col: '#7fd4e0' },

  /* pay: true — строка за реальные деньги, скрывается при PAYMENTS_ON = false */
  { pay: true, name: 'itHull', desc: 'itHullD', id: 'hull_admiral', perk: 'hull',
    tag: () => (hasPerk('hull') ? T('ownedWord') : productPrice('hull_admiral')),
    on: () => !hasPerk('hull'), act: () => buyProduct('hull_admiral'), col: '#ffd94a' },

  { pay: true, name: 'itHarp', desc: 'itHarpD', id: 'harpoon_gold', perk: 'harp',
    tag: () => (hasPerk('harp') ? T('ownedWord') : productPrice('harpoon_gold')),
    on: () => !hasPerk('harp'), act: () => buyProduct('harpoon_gold'), col: '#ffd94a' }
];

/* Нижний блок собирается на лету: пока площадка не показывает рекламу
   (Basic Launch, блокировщик), строк «за ролик» нет — CrazyGames
   отклоняет игры с кнопками рекламы, которые ничего не делают. */
const premList = () => PREMIUM_ALL.filter(p => (!p.pay || PAYMENTS_ON) && (!p.ad || adsAvail()));

let shopRows = [], shopHover = -1, shopSel = 0, shopMsg = '', shopMsgT = 0;
let shopArmed = -1;                    /* телефон: строка, выбранная первым касанием */
let shopClose = { x: 0, y: 0, w: 0, h: 0 }, shopMsgGood = false;

function shopAvail(it) {
  const maxed = it.lvl() >= it.max;
  return (!it.can || it.can()) && !maxed;
}

const shopCount = () => ITEMS.length + premList().length;

function buyItem(i) {
  if (i >= ITEMS.length) {                       /* нижний блок живёт своей логикой */
    const p = premList()[i - ITEMS.length];
    if (p) p.act();
    return;
  }
  const it = ITEMS[i];
  if (!it) return;
  if (it.can && !it.can()) { shopMsg = T('shopNoNeed'); shopMsgGood = false; shopMsgT = 1.5; SFX.hit(); return; }
  if (it.lvl() >= it.max) { shopMsg = T('shopMaxed'); shopMsgGood = false; shopMsgT = 1.5; SFX.hit(); return; }
  const c = it.cost();
  if (money < c) { shopMsg = T('shopPoor'); shopMsgGood = false; shopMsgT = 1.5; SFX.hit(); return; }
  money -= c;
  it.buy();
  SFX.buy();
  shopMsg = T('shopBought', T(it.name));
  shopMsgGood = true; shopMsgT = 2;
  if (runTrack) runSave();            /* покупка сразу попадает в снимок операции */
  for (let k = 0; k < 10; k++)
    addP({ x: player.x + rr(-8, 8), y: player.y + rr(-8, 8), vx: rr(-14, 14), vy: rr(-26, -8),
           life: rr(0.5, 0.9), max: 0.9, size: 1.2, col: '#ffd94a' });
}

function shopMove(d) {
  const n = shopCount();
  for (let k = 0; k < n; k++) {
    shopSel = (shopSel + d + n) % n;
    if (shopSel >= ITEMS.length ? premList()[shopSel - ITEMS.length].on() : shopAvail(ITEMS[shopSel])) break;
  }
  SFX.move();
}

/* касание по экрану арсенала */
function shopTap(x, y) {
  if (x >= shopClose.x && x <= shopClose.x + shopClose.w &&
      y >= shopClose.y && y <= shopClose.y + shopClose.h) { setState('play'); SFX.ui(); return; }
  for (const r of shopRows) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      /* На телефоне первое касание только выделяет строку и показывает
         описание, второе покупает: промах пальцем по соседней строке
         больше не тратит кредиты. */
      if (touchMode() && shopArmed !== r.i) { shopArmed = r.i; shopSel = r.i; shopMsgT = 0; SFX.move(); return; }
      shopSel = r.i; buyItem(r.i); return;
    }
  }
}

function renderShop() {
  if (stT < 0.05) shopArmed = -1;          /* арсенал только открыли */
  drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.72)';
  ctx.fillRect(0, 0, VW, VH);

  const X = 58, W = 364, Y = 8, H = 254;
  panel(X, Y, W, H, '#4a86a3');
  const credW = txtW(T('shopCredits', money));
  /* заголовок ужимается так, чтобы не дойти до строки кредитов */
  txt(T('shopTitle', T('carrier')), VW / 2, Y + 6, '#ffb454', 8, 'center',
      Math.max(80, (X + W - 26 - credW - 8 - VW / 2) * 2));
  txt(T('shopCredits', money), X + W - 26, Y + 6, '#ffd94a', 8, 'right', W - 120);

  /* крестик закрытия — нужен на сенсоре, мышью тоже работает */
  shopClose = { x: X + W - 20, y: Y + 3, w: 16, h: 14 };
  ctx.strokeStyle = '#7fd4e0'; ctx.lineWidth = D * 2;
  ctx.beginPath();
  ctx.moveTo(shopClose.x + 5, shopClose.y + 4); ctx.lineTo(shopClose.x + 11, shopClose.y + 10);
  ctx.moveTo(shopClose.x + 11, shopClose.y + 4); ctx.lineTo(shopClose.x + 5, shopClose.y + 10);
  ctx.stroke();

  ctx.fillStyle = '#2c5a70'; ctx.fillRect(X + 6, Y + 16, W - 12, 1);

  shopRows = []; shopHover = -1;
  const rowH = 13, y0 = Y + 18;

  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i], y = y0 + i * rowH;
    const lvl = it.lvl(), maxed = lvl >= it.max;
    const avail = shopAvail(it);
    const afford = money >= it.cost();
    const row = { x: X + 6, y, w: W - 12, h: rowH - 1, i };
    shopRows.push(row);

    const hov = !touchMode() && mouse.x >= row.x && mouse.x <= row.x + row.w &&
                mouse.y >= row.y && mouse.y <= row.y + row.h;
    if (hov && avail) { shopHover = i; shopSel = i; }
    const active = (i === shopSel);

    if (active && avail) {
      ctx.fillStyle = '#123246'; ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = '#ffb454'; ctx.fillRect(row.x, row.y, 2, row.h);
    }

    const nameCol = !avail ? '#4a5f6d' : afford ? '#f4f8fa' : '#8fa3ad';
    txt(i < 9 ? String(i + 1) : (i === 9 ? '0' : '-'), row.x + 6, y + 3, '#5d8299');
    txt(T(it.name), row.x + 22, y + 3, nameCol);

    if (it.max <= 5) {
      for (let p = 0; p < it.max; p++) {
        ctx.fillStyle = p < lvl ? '#4ade80' : '#182a36';
        ctx.fillRect(X + 236 + p * 8, y + 4, 6, 6);
      }
    }
    if (maxed) txt(T('shopMax'), X + W - 14, y + 3, '#4ade80', 8, 'right');
    else txt(T('shopCost', it.cost()), X + W - 14, y + 3, afford ? '#ffd94a' : '#e5484d', 8, 'right');
  }

  /* черта и блок за рекламу и деньги */
  const pRow = 12, py0 = y0 + ITEMS.length * rowH + 3;
  ctx.fillStyle = '#4a86a3'; ctx.fillRect(X + 6, py0 - 3, W - 12, 1);
  const PREMIUM = premList();
  if (shopSel >= shopCount()) shopSel = 0;      /* строка «за ролик» могла исчезнуть */
  for (let i = 0; i < PREMIUM.length; i++) {
    const p = PREMIUM[i], y = py0 + i * pRow, idx = ITEMS.length + i;
    const row = { x: X + 6, y, w: W - 12, h: pRow - 1, i: idx };
    shopRows.push(row);
    const hov = !touchMode() && mouse.x >= row.x && mouse.x <= row.x + row.w &&
                mouse.y >= row.y && mouse.y <= row.y + row.h;
    if (hov && p.on()) { shopHover = idx; shopSel = idx; }
    if (shopSel === idx && p.on()) {
      ctx.fillStyle = '#123246'; ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = p.col; ctx.fillRect(row.x, row.y, 2, row.h);
    }
    txt(p.perk ? '★' : '▶', row.x + 6, y + 2, p.on() ? p.col : '#4a5f6d');
    txt(T(p.name), row.x + 22, y + 2, p.on() ? '#f4f8fa' : '#4a5f6d');
    txt(p.tag(), X + W - 14, y + 2, p.on() ? p.col : '#4a5f6d', 8, 'right');
  }

  ctx.fillStyle = '#2c5a70'; ctx.fillRect(X + 6, Y + H - 28, W - 12, 1);
  const ci = shopHover >= 0 ? shopHover : shopSel;
  const cur = ci >= ITEMS.length ? premList()[ci - ITEMS.length] : ITEMS[ci];
  const foot = shopMsgT > 0 ? shopMsg : (cur ? T(cur.desc) : T('shopPick'));
  const footCol = shopMsgT > 0 ? (shopMsgGood ? '#4ade80' : '#e5484d') : '#7fd4e0';
  txt(foot, VW / 2, Y + H - 23, footCol, 8, 'center', W - 20);
  txt(touchMode() ? T('shopTouch') : T('shopKeys'), VW / 2, Y + H - 13, '#5d8299', 8, 'center', W - 20);
}

/* ===== src/ui/screens.js ===== */
;
'use strict';
/* ============================================================
   screens.js — заставка, пауза, итоги уровня и финалы
   ============================================================ */

/* имя уровня: тема по кругу плюс римская цифра круга */
function lvlName(n) {
  const c = levelCycle(n);
  return T(themeOf(n).key) + (c ? ' ' + (ROMAN[c] || '+' + c) : '');
}

let titleSetRect = { x: 12, y: VH - 24, w: 88, h: 17 };
let pauseSetRect = { x: VW / 2 - 44, y: 214, w: 88, h: 17 };
let reviveRect = { x: VW / 2 - 186, y: 198, w: 180, h: 18 };
let retryRect = { x: VW / 2 + 6, y: 198, w: 180, h: 18 };
let titleCrateRect = { x: VW - 108, y: VH - 24, w: 96, h: 17 };   /* правый угол: центр занят подсказкой */
let titleHqRect = { x: VW - 108, y: 10, w: 96, h: 17 };           /* штаб — верхний правый угол */

/* строчка «завтра дадут вот это» для экранов итогов */
function tomorrowLine() {
  const M = SETTINGS.meta;
  if (!M) return '';
  const s = M.claimed ? M.streak + 1 : M.streak;
  const tag = rewardTag(dayReward(s));
  return T('tomorrowTip', dayIdx(s) + 1, (tag[0] + ' ' + tag[1]).trim());
}

function titleText(s, x, y, size, col) {
  ctx.font = size + 'px monospace';
  ctx.textAlign = 'left';
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width;
  let xx = x - w / 2, i = 0;
  for (const ch of s) {
    const yy = y + Math.sin(tGlobal * 2.4 + i * 0.55) * 2.2;
    ctx.fillStyle = '#071c2c'; ctx.fillText(ch, xx + 2, yy + 2);
    ctx.fillStyle = col; ctx.fillText(ch, xx, yy);
    xx += ctx.measureText(ch).width;
    i++;
  }
  return w;
}

/* фон заставки без надписей — используется и экраном настроек */
function renderTitleBackdrop() {
  drawScene(1 / 60);
  for (const tp of titlePlanes) {
    ctx.save(); ctx.translate(tp.x, tp.y); ctx.rotate(Math.PI / 2);
    ctx.drawImage(sprPlane, -sprPlane.width / (2 * SC), -sprPlane.height / (2 * SC),
                  sprPlane.width / SC, sprPlane.height / SC);
    ctx.restore();
  }
}

/* renderTitle — см. ui/uikit.js */
function hitTitleSettings(x, y) {
  const r = titleSetRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function hitTitleCrate(x, y) {
  const r = titleCrateRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function hitTitleHq(x, y) {
  const r = titleHqRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function statLine(label, value, x, y, col) {
  txt(label, x, y, '#5d8299');
  txt(value, x + 244, y, col || '#cfe8f0', 8, 'right');
}

function renderLevelClear() {
  drawScene(0); drawHUD();
  ctx.fillStyle = 'rgba(2,8,14,0.74)';
  ctx.fillRect(0, 0, VW, VH);

  const pop = ease.out(Math.min(1, stT * 2.5));
  ctx.save();
  ctx.translate(VW / 2, 52);
  ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
  ctx.translate(-VW / 2, -52);
  titleText(T('lvlDone', level + 1), VW / 2, 44, 16, '#4ade80');
  ctx.restore();
  txt('«' + lvlName(level) + '»', VW / 2, 74, '#7fd4e0', 8, 'center', VW - 16);

  panel(VW / 2 - 134, 90, 268, 96);
  const x = VW / 2 - 124;
  statLine(T('stBases'),    kills.bases + '/' + totalBases,          x, 96, '#4ade80');
  statLine(T('stBunkers'),  String(kills.bunkers),                   x, 108);
  statLine(T('stShipsAir'), kills.ships + ' / ' + kills.planes,      x, 120);
  statLine(T('stHostages'), rescued + '/' + spawned,                 x, 132, '#ffb454');
  if (curCfg.mission === 'night')
    statLine(T('stStealth'), stealth.blown ? T('noWord') : T('yesWord'), x, 144,
             stealth.blown ? '#e5484d' : '#4ade80');
  else
    statLine(T('stStreak'), 'x' + comboBest, x, 144, '#ff9ad5');
  statLine(T('stTime'),     fmtT(playTime),                          x, 156);
  ctx.fillStyle = '#2c5a70'; ctx.fillRect(VW / 2 - 124, 168, 248, 1);
  statLine(T('stBonus'), '+' + ECON.levelBonus(level) + ' ' + T('crShort').toLowerCase(), x, 173, '#ffd94a');

  txt(T('creditsLeft', money), VW / 2, 194, '#ffb454', 8, 'center');
  uiNextButton(206, T('btnNext') + ' ' + (level + 2) + ' ▶');
  drawReturnHooks(232);                  /* звание, задания дня, паёк */
}

function renderEnd(win) {
  drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.76)';
  ctx.fillRect(0, 0, VW, VH);
  if (win) {
    titleText(T('winTitle1'), VW / 2, 40, 16, '#4ade80');
    titleText(T('winTitle2'), VW / 2, 62, 16, '#4ade80');
    txt(T('sectorSub', bossTitle()), VW / 2, 84, '#7fd4e0', 8, 'center', VW - 16);
  } else {
    titleText(T('loseTitle1'), VW / 2, 46, 16, '#e5484d');
    titleText(T('loseTitle2'), VW / 2, 68, 16, '#e5484d');
    if (SETTINGS.bestLevel)
      txt(T('bestRun', SETTINGS.bestLevel, SETTINGS.bestScore || 0), VW / 2, 87, '#ffb454', 8, 'center', VW - 16);
  }

  panel(VW / 2 - 134, 100, 268, 94);
  const x = VW / 2 - 124;
  statLine(T('stLevel'),    String(level + 1),                       x, 106, '#9fc3d0');
  statLine(T('stScore'),    String(score),                           x, 118, '#ffd94a');
  statLine(T('stBaseBunk'), kills.bases + ' / ' + kills.bunkers,     x, 130);
  statLine(T('stShipsAir'), kills.ships + ' / ' + kills.planes,      x, 142);
  statLine(T('stMines'),    String(kills.mines),                     x, 154);
  statLine(T('stHostages'), rescued + '/' + spawned,                 x, 166, '#ffb454');
  statLine(T('stTime'),     fmtT(playTime),                          x, 178);

  /* вторая жизнь за рекламный ролик */
  if (!win && canRevive()) {
    /* Правило CrazyGames: вариант без рекламы — того же размера, шрифта
       и цвета, что и кнопка за ролик. Поэтому две одинаковые кнопки. */
    const btn = (r, label) => {
      ctx.fillStyle = 'rgba(8,30,20,0.92)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = D * 2;
      ctx.strokeRect(r.x + D, r.y + D, r.w - D * 2, r.h - D * 2);
      txt(label, r.x + r.w / 2, r.y + 5.5, '#4ade80', 8, 'center', r.w - 14);
    };
    btn(reviveRect, reviveFree() ? T('reviveFree') : T('revive'));
    btn(retryRect, T('retryBtn'));
  }

  if (stT > 0.8 && Math.floor(tGlobal * 2) % 2) {
    const touch = touchMode();
    const y = (!win && canRevive()) ? 222 : 210;
    if (win) { /* кнопка ниже */ }
    else txt(touch ? T('againLoseT') : T('againLose'), VW / 2, y, '#f4f8fa', 8, 'center', VW - 16);
  }
  if (win) uiNextButton(202, T('btnNext') + ' ' + (level + 2) + ' ▶');
  drawReturnHooks(236);                  /* звание, задания дня, паёк */
}
function hitRevive(x, y) {
  const r = reviveRect;
  return !!(state === 'over' && canRevive() &&
            x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

/* renderPause — см. ui/uikit.js */
function hitPauseSettings(x, y) {
  const r = pauseSetRect;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/* подсказка повернуть телефон */
function renderRotateHint() {
  ctx.fillStyle = 'rgba(2,8,14,0.88)';
  ctx.fillRect(0, 0, VW, VH);
  const cx = VW / 2, cy = VH / 2 - 14;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(tGlobal * 1.6) * 0.5 - 0.4);
  ctx.strokeStyle = '#7fd4e0'; ctx.lineWidth = D * 3;
  ctx.strokeRect(-14, -24, 28, 48);
  ctx.fillStyle = '#7fd4e0'; ctx.fillRect(-5, 20, 10, 2);
  ctx.restore();
  txt(T('rotate'), cx, cy + 44, '#cfe8f0', 8, 'center');
}

/* ===== src/ui/uikit.js ===== */
;
'use strict';
/* ============================================================
   uikit.js — кнопки интерфейса и экраны, собранные из них.

   Кнопка рисуется в render и в тот же момент регистрирует свою
   область; клик или касание ищет её в списке прошлого кадра.
   Поэтому любой экран одинаково работает мышью, пальцем и
   клавишами (клавиши по-прежнему обрабатывает input.js).
   ============================================================ */

let uiBtns = [];

function uiFrame() { uiBtns = []; }

const uiIn = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/* o: { primary, col, size, badge, pulse, disabled, hint } */
function uiButton(x, y, w, h, label, act, o) {
  o = o || {};
  const hov = !touchMode() && !o.disabled && uiIn({ x, y, w, h }, mouse.x, mouse.y);
  const col = o.disabled ? '#3d5566' : (o.col || (o.primary ? '#4ade80' : '#7fd4e0'));
  const lift = hov ? 1 : 0;
  const yy = y - lift;
  /* тень под кнопкой — она «стоит» над фоном */
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 1.5, y + 1.5, w, h);
  ctx.fillStyle = o.primary ? (hov ? 'rgba(18,70,44,0.96)' : 'rgba(10,44,28,0.94)')
                            : (hov ? 'rgba(16,46,66,0.96)' : 'rgba(6,24,36,0.92)');
  ctx.fillRect(x, yy, w, h);
  /* светлая кромка сверху, тёмная снизу — объём */
  ctx.fillStyle = 'rgba(255,255,255,' + (hov ? 0.16 : 0.08) + ')';
  ctx.fillRect(x, yy, w, Math.max(D * 2, h * 0.08));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, yy + h - D * 3, w, D * 3);
  const pul = o.pulse ? 0.55 + 0.45 * Math.sin(tGlobal * 4) : 1;
  ctx.globalAlpha = pul;
  ctx.strokeStyle = col; ctx.lineWidth = D * (o.primary || hov ? 3 : 2);
  ctx.strokeRect(x + D, yy + D, w - D * 2, h - D * 2);
  ctx.globalAlpha = 1;
  const sz = o.size || 8;
  /* значок слева, подсказка клавиши справа — надпись встаёт между ними */
  const hint = o.hint && !touchMode() ? o.hint : '';
  const bw = o.badge ? Math.max(9, txtW(o.badge) + 6) : 0;
  const padL = bw ? bw + 7 : 6, padR = hint ? txtW(hint) + 10 : 6;
  const cy = yy + (h - 8) / 2 + 0.5;
  txt(label, x + padL + (w - padL - padR) / 2, yy + (h - sz) / 2 + 0.5,
      o.disabled ? '#4a5f6d' : (hov ? '#ffffff' : col), sz, 'center', w - padL - padR);
  if (hint) txt(hint, x + w - 6, cy, 'rgba(160,190,205,0.55)', 8, 'right');
  if (bw) {
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(x + 4, yy + (h - 10) / 2, bw, 10);
    txt(o.badge, x + 4 + bw / 2, cy, '#fff', 8, 'center');
  }
  if (!o.disabled) uiBtns.push({ x, y, w, h, act, st: state });
}

/* клик/касание: true — попали в кнопку */
function uiTap(x, y) {
  for (let i = uiBtns.length - 1; i >= 0; i--) {
    const b = uiBtns[i];
    if (b.st !== state || !uiIn(b, x, y)) continue;
    SFX.ui();
    if (b.act) b.act();
    return true;
  }
  return false;
}

/* старые области кликов заставки и паузы больше не нужны — кнопки свои */
titleSetRect = titleCrateRect = titleHqRect = pauseSetRect = { x: -99, y: -99, w: 0, h: 0 };

/* ---------- заставка ---------- */
function renderTitle() {
  renderTitleBackdrop();
  ctx.fillStyle = 'rgba(3,12,20,0.5)';
  ctx.fillRect(0, 0, VW, VH);
  const touch = touchMode();

  txt(T('hqRank') + ': ' + T(metaRank().key), 12, 10, '#7fa4b5', 8, 'left', 160);
  txt(T('operation'), VW / 2, 18, '#ffb454', 8, 'center');
  const w = titleText(T('gameTitle'), VW / 2, 34, 24, '#f4f8fa');
  ctx.fillStyle = '#e5484d'; ctx.fillRect(VW / 2 - w / 2, 64, w, 2);
  ctx.fillStyle = '#ffb454'; ctx.fillRect(VW / 2 - w / 2, 67, w, 1);
  txt(T('subtitle'), VW / 2, 74, '#7fd4e0', 8, 'center', VW - 20);

  /* главное действие — одна крупная кнопка */
  const cont = runPending();
  const n = cont ? (SETTINGS.run.lvl | 0) + 1 : 0;
  uiButton(VW / 2 - 116, 92, 232, 30, cont ? '▶ ' + T('btnContinue', n) : '▶ ' + T('btnPlay'),
           () => { if (touchMode()) goFullscreen(); startCampaign(); },
           { primary: true, size: cont ? 8 : 16, pulse: false, hint: touch ? '' : 'SPACE' });

  /* второй ряд: штаб, барабан, настройки */
  const bw = 112, gap = 8, bx = VW / 2 - (bw * 3 + gap * 2) / 2, by = 132;
  uiButton(bx, by, bw, 20, T('hqBtn'), () => openHQ('title'),
           { col: META.ready ? '#ffd94a' : '#7fd4e0', pulse: META.ready, badge: META.ready ? '!' : '', hint: touch ? '' : 'H' });
  uiButton(bx + bw + gap, by, bw, 20, T('crateTitle'), () => openCrate('title'),
           { col: '#ff9ad5', badge: crateT <= 0 ? T('adFree') : '' });
  uiButton(bx + (bw + gap) * 2, by, bw, 20, T('settingsBtn'), () => openSettings('title'),
           { hint: touch ? '' : 'O' });

  /* как играть — три строки вместо простыни приказов */
  panel(VW / 2 - 176, 164, 352, 50);
  txt(T('howTitle'), VW / 2 - 168, 169, '#ffb454', 8, 'left', 200);
  txt('◆ ' + T('ord1').replace(/^>\s*/, ''), VW / 2 - 168, 180, '#cfe8f0', 8, 'left', 336);
  txt('✚ ' + T('ord3', T('carrier')).replace(/^>\s*/, ''), VW / 2 - 168, 191, '#cfe8f0', 8, 'left', 336);
  txt('▲ ' + (touch ? T('mArsenalT') : T('mArsenal')), VW / 2 - 168, 202, '#4ade80', 8, 'left', 336);

  if (SETTINGS.bestLevel)
    txt(T('bestRun', SETTINGS.bestLevel, SETTINGS.bestScore || 0), VW / 2, 222, '#ffb454', 8, 'center', VW - 16);
  txt(touch ? T('touchLine1') : T('keysLine1'), VW / 2, 238, '#5d8299', 8, 'center', VW - 16);
  txt(touch ? T('touchLine2') : T('keysLine2'), VW / 2, 249, '#5d8299', 8, 'center', VW - 16);
}

/* ---------- пауза ---------- */
function quitToTitle() {
  msgs.length = 0;
  setState('title');
}
function renderPause() {
  ctx.fillStyle = 'rgba(2,8,14,0.7)';
  ctx.fillRect(0, 0, VW, VH);
  titleText(T('pause'), VW / 2, 44, 16, '#7fd4e0');
  const touch = touchMode();
  const bx = VW / 2 - 95, bw = 190, bh = 20;
  uiButton(bx, 76, bw, bh + 4, '▶ ' + T('btnResume'), () => setState('play'),
           { primary: true, hint: touch ? '' : 'P' });
  uiButton(bx, 108, bw, bh, T('settingsBtn'), () => openSettings('pause'), { hint: touch ? '' : 'O' });
  uiButton(bx, 134, bw, bh, muted ? T('mSoundOff') : T('mSoundOn'), () => {
    toggleMute(); SETTINGS.sound = !muted; saveSettings();
  }, { col: muted ? '#8fa3ad' : '#7fd4e0', hint: touch ? '' : 'M' });
  uiButton(bx, 160, bw, bh, T('btnMenu'), quitToTitle, { col: '#ffb454' });

  txt(T('stLevel') + ' ' + (level + 1) + ' «' + lvlName(level) + '» • ' + T(missionKey(curCfg.mission)),
      VW / 2, 192, '#ffb454', 8, 'center', VW - 20);
  const keysL = touch ? T('touchLine1') : T('keysLine1');
  const keysL2 = touch ? T('touchLine2') : T('keysLine2');
  txt(keysL, VW / 2, 212, '#5d8299', 8, 'center', VW - 16);
  txt(keysL2, VW / 2, 223, '#5d8299', 8, 'center', VW - 16);
}

/* ---------- итоги уровня и финал круга ---------- */
function uiNextButton(y, label) {
  const ready = stT > 0.6;
  uiButton(VW / 2 - 110, y, 220, 22, label, () => adThenLevel(level + 1),
           { primary: true, disabled: !ready, pulse: ready, hint: touchMode() ? '' : 'SPACE' });
}

/* ---------- HUD ---------- */
/* куда плыть сейчас: ближайшая цель задачи уровня */
function objTarget() {
  const P = player;
  if (!P) return null;
  if (boss && !boss.dead) return boss;
  if (P.aboard > 0) return CARR;
  const m = curCfg.mission;
  let best = null, bd = 1e9;
  const see = o => { const d = dist(P.x, P.y, o.x, o.y); if (d < bd) { bd = d; best = o; } };
  if (m === 'night') { for (const h of hostages) if (h.state === 'wait') see(h); }
  else if (m === 'escort') {
    if (P.troops > 0 || !marines.length) { if (targetIsl && !allTargetStructsDead()) see(targetIsl); }
    else if (allyIsl) see(allyIsl);
  } else if (m === 'convoy') { if (transport && !transport.dead && !transport.done) see(transport); }
  else for (const s of structs) if (!s.dead && s.type === 'base') see(s);
  return best;
}
/* расстояние до цели — в «метрах» (1 единица мира = 2 м) */
function drawObjDist(x, y) {
  const t = objTarget();
  if (!t || !player) return;
  const d = dist(player.x, player.y, t.x, t.y);
  if (d < 60) return;
  const m = Math.round(d * 2 / 10) * 10;
  txt('▸ ' + T('hudDist', m), x, y, t === CARR ? '#4ade80' : '#ff9166', 8, 'right');
}

/* кнопки HUD для мыши: пауза и арсенал у авианосца */
function drawHudButtons() {
  if (touchMode() || !player || player.dead || state !== 'play') return;
  uiButton(VW - 32, 94, 26, 16, 'II', () => setState('pause'), { hint: '' });
  const dc = dist(player.x, player.y, CARR.x, CARR.y);
  if (dc < 145) {
    const lab = T('arsenalHint'), w = txtW(lab) + 18;
    const x = clamp(sX(CARR.x) - w / 2, 8, VW - w - 8), y = clamp(sY(CARR.y) - 70, 30, VH - 90);
    uiButton(x, y, w, 16, lab, () => { setState('shop'); shopSel = 0; shopMsgT = 0; },
             { primary: true, pulse: true });
  }
}

/* ---------- поводы вернуться: на экранах итогов ---------- */
/* звание с полосой до следующего, задания дня, паёк сегодня и завтра */
function drawReturnHooks(y) {
  const rk = metaRank(), x0 = VW / 2 - 150;
  ICON.star(x0, y, 8, '#ffd94a');
  txt(T(rk.key), x0 + 11, y, '#ffd94a', 8, 'left', 92);
  hudBar(x0 + 106, y + 2, 64, 4, rk.frac, '#ffd94a');
  txt(Math.round(rk.frac * 100) + '%', x0 + 174, y, '#7fa4b5', 8, 'left');
  const dq = dqDoneCount();
  txt(T('hqTasks') + ' ' + dq + '/3', VW / 2 + 150, y, dq === 3 ? '#4ade80' : '#7fa4b5', 8, 'right', 104);
  let yy = y + 12;
  if (typeof rationNote !== 'undefined' && rationNote && rationLvl === level) {
    txt('✓ ' + rationNote, VW / 2, yy, '#4ade80', 8, 'center', VW - 16);
    yy += 12;
  }
  txt('► ' + tomorrowLine(), VW / 2, yy, '#ffd94a', 8, 'center', VW - 16);
}

/* ===== src/ui/settings.js ===== */
;
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

/* ===== src/ui/crate.js ===== */
;
'use strict';
/* ============================================================
   crate.js — «ИРП удачи»: барабан с призами.

   Бесплатная прокрутка раз в три минуты, между ними — за рекламный
   ролик. Главный приз выпадает редко и даёт постоянную вещь, ту же,
   что продаётся за деньги: кто не хочет платить, докрутится.
   ============================================================ */

const CRATE_FREE_CD = 300;            /* бесплатная прокрутка раз в пять минут */
const CRATE_AD_CD = 180;              /* за ролик — раз в три минуты */
const CRATE_R = 66;
let crateAngle = 0, cratePhase = 'idle', crateIdx = 0;
let crateFrom = 0, crateTo = 0, crateSpinT = 0, crateSpinDur = 3.4;
let crateT = 0, crateAdT = 0, crateBackTo = 'title', crateBtns = [];

/* приз, короткая подпись на секторе, вес выпадения */
const CRATE_PRIZES = [
  { key: 'przNothing', arg: null, tag: () => T('tagNone'), w: 22, col: '#5d7484', give: () => {} },
  { key: 'przCredits', arg: 100,  tag: '100',   w: 20, col: '#8f8250', give: () => { money += 100; } },
  { key: 'przAmmo',    arg: 3,    tag: () => '3 ' + T('rktShort'), w: 18, col: '#7fd4e0', give: () => { upg.msl = 1; upg.ammo += 3; } },
  { key: 'przCredits', arg: 250,  tag: '250',   w: 14, col: '#ffd94a', give: () => { money += 250; } },
  { key: 'przNothing', arg: null, tag: () => T('tagNone'), w: 10, col: '#5d7484', give: () => {} },
  { key: 'przCredits', arg: 600,  tag: '600',   w: 8,  col: '#ffd94a', give: () => { money += 600; } },
  { key: 'przRepair',  arg: null, tag: () => T('tagFix'), w: 6,  col: '#4ade80',
    give: () => { if (player) { player.hp = player.maxhp; player.boostE = boostMax(); } } },
  /* без доната главный приз — 3000 кредитов (выдаёт ветка «всё собрано» ниже) */
  { key: PAYMENTS_ON ? 'przJack' : 'przCredits', arg: PAYMENTS_ON ? null : 3000, tag: '★',     w: 2,  col: '#ff9ad5', jack: true,
    give: () => {
      /* даём вещь, которой ещё нет; если всё собрано — кредиты */
      const left = perksLeft();
      if (left.length) grantPerk(pick(left).perk);
      else metaGive(3000, 0);            /* из меню — на склад, в бою — в кошелёк */
    } }
];


const crateLabel = p => (p.arg === null ? T(p.key) : T(p.key, p.arg));

function openCrate(from) {
  crateBackTo = from || 'title';
  cratePhase = 'idle';
  setState('crate');
  SFX.ui();
}
function closeCrate() { setState(crateBackTo); SFX.ui(); }

function crateRoll() {
  let tot = 0;
  for (const p of CRATE_PRIZES) tot += p.w;
  let r = Math.random() * tot;
  for (let i = 0; i < CRATE_PRIZES.length; i++) {
    r -= CRATE_PRIZES[i].w;
    if (r <= 0) return i;
  }
  return 0;
}

function crateStart(paid) {
  if (cratePhase === 'spin') return;
  if (paid && !adsAvail()) return;          /* рекламы нет — кнопки «за ролик» тоже */
  if (paid ? crateAdT > 0 : crateT > 0) return;
  const go = () => {
    crateIdx = crateRoll();
    const sec = TAU / CRATE_PRIZES.length;
    /* доводим сектор до стрелки наверху и добавляем шесть полных оборотов */
    let to = -Math.PI / 2 - (crateIdx * sec + sec / 2);
    while (to < crateAngle + TAU * 6) to += TAU;
    crateFrom = crateAngle; crateTo = to;
    crateSpinT = 0; cratePhase = 'spin';
    SFX.boost();
  };
  /* откат «за ролик» ставим только после досмотренного ролика */
  if (paid) adRewarded(() => { crateAdT = CRATE_AD_CD; go(); });
  else { crateT = CRATE_FREE_CD; go(); }
}

function updCrate(dt) {
  if (crateT > 0) crateT = Math.max(0, crateT - dt);
  if (crateAdT > 0) crateAdT = Math.max(0, crateAdT - dt);
  if (cratePhase !== 'spin') return;
  crateSpinT += dt;
  const k = ease.out3(Math.min(1, crateSpinT / crateSpinDur));
  crateAngle = lerp(crateFrom, crateTo, k);
  /* пощёлкивание барабана по секторам */
  if (Math.floor(crateAngle / (TAU / CRATE_PRIZES.length)) !==
      Math.floor((crateAngle - dt * (crateTo - crateFrom) / crateSpinDur) / (TAU / CRATE_PRIZES.length)))
    SFX.move();
  if (crateSpinT >= crateSpinDur) {
    cratePhase = 'won';
    const p = CRATE_PRIZES[crateIdx];
    p.give();
    if (p.jack) { SFX.evac(); flashScreen = 0.4; for (let i = 0; i < 40; i++)
      addP({ x: rr(0, VW), y: rr(0, VH), vx: rr(-30, 30), vy: rr(-40, 10), g: 60,
             life: rr(0.8, 1.6), max: 1.6, size: rr(1, 2.4), col: pick(['#ff9ad5', '#ffd94a', '#7fd4e0']) });
    } else SFX.buy();
  }
}

function crateTap(x, y) {
  for (const b of crateBtns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'free') crateStart(false);
      else if (b.id === 'ad') crateStart(true);
      else if (b.id === 'close') closeCrate();
      return true;
    }
  }
  return false;
}

function renderCrate() {
  if (crateBackTo === 'title') renderTitleBackdrop(); else drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.80)';
  ctx.fillRect(0, 0, VW, VH);

  const cx = VW / 2, cy = 128, n = CRATE_PRIZES.length, sec = TAU / n;

  txt(T('crateTitle'), cx, 14, '#ffb454', 16, 'center');

  /* барабан */
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(crateAngle);
  for (let i = 0; i < n; i++) {
    const p = CRATE_PRIZES[i], a0 = i * sec, a1 = a0 + sec;
    ctx.fillStyle = i % 2 ? 'rgba(10,26,40,0.95)' : 'rgba(16,38,56,0.95)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, CRATE_R, a0, a1); ctx.closePath(); ctx.fill();
    /* цветной ободок сектора */
    ctx.strokeStyle = p.col; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(0, 0, CRATE_R - 2, a0 + 0.02, a1 - 0.02); ctx.stroke();
    ctx.strokeStyle = 'rgba(74,134,163,0.5)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * CRATE_R, Math.sin(a0) * CRATE_R); ctx.stroke();
    /* подпись вдоль радиуса */
    ctx.save();
    ctx.rotate(a0 + sec / 2);
    ctx.font = (p.jack ? 13 : 8) + 'px monospace';
    ctx.textAlign = 'center';
    const tg = (typeof p.tag === 'function') ? p.tag() : p.tag;
    ctx.fillStyle = '#06131c'; ctx.fillText(tg, CRATE_R * 0.62 + 1, -3 + 1);
    ctx.fillStyle = p.col;     ctx.fillText(tg, CRATE_R * 0.62, -3);
    ctx.restore();
  }
  ctx.restore();

  /* ступица и стрелка */
  ctx.fillStyle = '#0a1a26';
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a86a3'; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, CRATE_R, 0, TAU); ctx.stroke();
  blitC(sprCrate, cx, cy);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - CRATE_R + 9);
  ctx.lineTo(cx - 6, cy - CRATE_R - 5);
  ctx.lineTo(cx + 6, cy - CRATE_R - 5);
  ctx.closePath(); ctx.fill();

  /* результат: главный приз выносим наверх, чтобы не лез на кнопки */
  if (cratePhase === 'won') {
    const p = CRATE_PRIZES[crateIdx];
    if (p.jack) txt(T('crateJack'), cx, 38, '#ff9ad5', 16, 'center');
    txt(T('crateWon', crateLabel(p)), cx, 200, p.col, 8, 'center');
  }

  /* кнопки */
  crateBtns = [];
  const mkBtn = (id, label, x, y, w, col, on) => {
    const b = { id, x, y, w, h: 18 };
    crateBtns.push(b);
    ctx.fillStyle = on ? 'rgba(8,28,42,0.95)' : 'rgba(8,18,26,0.8)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = on ? col : '#2c4450'; ctx.lineWidth = D * 2;
    ctx.strokeRect(b.x + D, b.y + D, b.w - D * 2, b.h - D * 2);
    txt(label, b.x + b.w / 2, b.y + 5.5, on ? col : '#4a5f6d', 8, 'center', b.w - 14);
  };
  const spinning = cratePhase === 'spin';
  const freeOn = crateT <= 0 && !spinning;
  const adOn = crateAdT <= 0 && !spinning;
  /* обе кнопки одного вида: вариант без рекламы не должен выглядеть хуже */
  if (adsAvail()) {
    mkBtn('free', freeOn ? T('crateSpin') + ' — ' + T('adFree') : T('crateWaitN', fmtT(crateT)),
          cx - 172, 236, 164, '#4ade80', freeOn);
    mkBtn('ad', adOn ? T('crateAd') : T('crateAdWait', fmtT(crateAdT)),
          cx + 8, 236, 164, '#4ade80', adOn);
  } else {
    mkBtn('free', freeOn ? T('crateSpin') + ' — ' + T('adFree') : T('crateWaitN', fmtT(crateT)),
          cx - 100, 236, 200, '#4ade80', freeOn);
  }
  mkBtn('close', touchMode() ? T('crateCloseT') : T('crateClose'), cx - 60, 212, 120, '#9fc3d0', !spinning);
}

/* ===== src/ui/hq.js ===== */
;
'use strict';
/* ============================================================
   hq.js — ШТАБ: паёк за вход, календарь серии, задания дня,
   звание и место в таблице рекордов.

   Экран открывается сам при первом за сутки запуске: игрок сразу
   видит, что за возвращение ему что-то дали, и что завтра дадут
   больше. Дальше — по кнопке с заставки.
   ============================================================ */

let hqBackTo = 'title', hqBtns = [], hqFlash = 0;

function openHQ(from) {
  hqBackTo = from || 'title';
  hqFlash = 0;
  lbLoad();                       /* место в таблице подтянется асинхронно */
  setState('hq');
  SFX.ui();
}
function closeHQ() { setState(hqBackTo); SFX.ui(); }

/* «в бой» с экрана штаба — начинаем кампанию с нуля */
function hqFight() {
  if (hqBackTo === 'title') startCampaign();
  else setState(hqBackTo);
  SFX.ui();
}

function hqClaim(x2) {
  const M = SETTINGS.meta;
  if (!M || M.claimed) return;
  const go = () => {
    metaClaim(x2);
    hqFlash = 1;
    SFX.evac();
    flashScreen = 0.3;
    for (let i = 0; i < 34; i++)
      addP({ x: rr(60, VW - 60), y: rr(40, 110), vx: rr(-26, 26), vy: rr(-40, 6), g: 55,
             life: rr(0.7, 1.5), max: 1.5, size: rr(1, 2.2),
             col: pick(['#ffd94a', '#4ade80', '#7fd4e0']) });
  };
  if (x2) adRewarded(go); else go();
}

function hqTap(x, y) {
  for (const b of hqBtns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'claim') hqClaim(false);
      else if (b.id === 'claim2' && adsAvail()) hqClaim(true);
      else if (b.id === 'fight') hqFight();
      else if (b.id === 'back') closeHQ();
      return true;
    }
  }
  return false;
}

function hqBtn(id, label, x, y, w, col, on) {
  const b = { id: id, x: x, y: y, w: w, h: 18 };
  hqBtns.push(b);
  ctx.fillStyle = on ? 'rgba(8,28,42,0.95)' : 'rgba(8,18,26,0.8)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = on ? col : '#2c4450'; ctx.lineWidth = D * 2;
  ctx.strokeRect(b.x + D, b.y + D, b.w - D * 2, b.h - D * 2);
  txt(label, b.x + b.w / 2, b.y + 5.5, on ? col : '#4a5f6d', 8, 'center', b.w - 14);
}

/* одна клетка календаря */
function hqDayCell(x, y, w, h, n, done, today) {
  const r = DAY_REWARDS[n];
  const gold = !!r.gold;
  ctx.fillStyle = done ? 'rgba(10,34,26,0.9)' : today ? 'rgba(34,28,8,0.95)' : 'rgba(8,20,30,0.85)';
  ctx.fillRect(x, y, w, h);
  const pulse = today ? 0.55 + 0.45 * Math.sin(tGlobal * 4) : 1;
  ctx.strokeStyle = done ? '#2f6b4a'
                  : today ? 'rgba(255,217,74,' + pulse.toFixed(2) + ')'
                  : gold ? '#6b4f22' : '#25414f';
  ctx.lineWidth = D * 2;
  ctx.strokeRect(x + D, y + D, w - D * 2, h - D * 2);

  txt(T('hqDayN', n + 1), x + w / 2, y + 4, done ? '#4ade80' : today ? '#ffd94a' : '#5d8299', 8, 'center', w - 20);
  const tag = rewardTag(r);
  const col = gold ? '#ff9ad5' : done ? '#3f7f63' : today ? '#f4f8fa' : '#7fa4b5';
  if (tag[0]) txt(tag[0], x + w / 2, y + 16, col, 8, 'center', w - 6);
  if (tag[1]) txt(tag[1], x + w / 2, y + 27, col, 8, 'center', w - 6);
  if (done) txt('✓', x + w - 8, y + 4, '#4ade80', 8, 'center');
}

function renderHQ() {
  if (hqBackTo === 'title') renderTitleBackdrop(); else drawScene(0);
  ctx.fillStyle = 'rgba(2,8,14,0.84)';
  ctx.fillRect(0, 0, VW, VH);

  const M = SETTINGS.meta || META_DEF();
  hqBtns = [];
  hqFlash = Math.max(0, hqFlash - 0.02);

  txt(T('hqTitle'), VW / 2, 8, '#ffb454', 16, 'center');
  txt(T('hqStreak', M.streak, M.best) + '   ' + T('hqBonus', metaStreakPct()),
      VW / 2, 28, '#7fd4e0', 8, 'center', VW - 16);

  /* ---- календарь недели ---- */
  const cw = 58, gap = 4, x0 = (VW - (cw * 7 + gap * 6)) / 2, cy = 40, ch = 40;
  const cur = dayIdx(M.streak);
  for (let i = 0; i < 7; i++)
    hqDayCell(x0 + i * (cw + gap), cy, cw, ch, i, i < cur || (i === cur && M.claimed), i === cur && !M.claimed);

  /* ---- кнопки пайка ---- */
  if (!M.claimed) {
    /* обе кнопки одного вида; без рекламы — одна, по центру */
    if (adsAvail()) {
      hqBtn('claim', T('hqClaim'), 60, 86, 160, '#4ade80', true);
      hqBtn('claim2', T('hqClaim2'), 260, 86, 160, '#4ade80', true);
    } else hqBtn('claim', T('hqClaim'), VW / 2 - 100, 86, 200, '#4ade80', true);
  } else {
    const line = M.doubled ? T('hqClaimed2', metaTillText())
                           : T('hqClaimed', metaTillText());
    txt(line, VW / 2, 90, hqFlash > 0 ? '#ffd94a' : '#5d8299', 8, 'center', VW - 16);
    const nx = dayReward(M.streak + 1), tag = rewardTag(nx);
    txt(T('hqTomorrow', (tag[0] + ' ' + tag[1]).trim()), VW / 2, 100, '#7fa4b5', 8, 'center', VW - 16);
  }

  /* ---- задания дня ---- */
  panel(24, 110, 432, 76);
  txt(T('hqTasks'), 34, 114, '#ffb454');
  txt(dqDoneCount() + '/3', 446, 114, dqDoneCount() === 3 ? '#4ade80' : '#9fc3d0', 8, 'right');
  const list = dqToday(M.dqDay);
  for (let i = 0; i < 3; i++) {
    const q = list[i], y = 128 + i * 16, done = !!M.dqDone[i];
    const pr = Math.min(M.dqProg[i], q.goal);
    txt(T('dq_' + q.id) + ' ' + q.goal, 34, y, done ? '#4ade80' : '#cfe8f0', 8, 'left', 210);
    txt(pr + '/' + q.goal, 300, y, done ? '#4ade80' : '#9fc3d0', 8, 'right');
    bar(310, y + 2, 96, 4, pr / q.goal, done ? '#4ade80' : '#ffb454');
    txt((done ? '✓ ' : '+') + q.pay, 450, y, done ? '#4ade80' : '#ffd94a', 8, 'right');
  }
  txt(M.dqBonus ? T('hqAllOk', DQ_ALL_BONUS) : T('hqAll', DQ_ALL_BONUS),
      VW / 2, 172, M.dqBonus ? '#4ade80' : '#ff9ad5', 8, 'center', 412);

  /* ---- звание ---- */
  const rk = metaRank();
  panel(24, 190, 432, 37);
  txt(T('hqRank') + ': ' + T(rk.key), 34, 195, '#ffd94a', 8, 'left', 230);
  txt(rk.next ? T('hqNext', rk.need) : T('hqTop'), 446, 195, '#9fc3d0', 8, 'right', 170);
  bar(34, 206, 412, 4, rk.frac, '#ffb454');
  txt(T('hqStart', rk.cash), 34, 214, '#5d8299', 8, 'left', 230);
  txt(T('hqTotal', M.total), 446, 214, '#5d8299', 8, 'right', 170);

  /* ---- склад и место в таблице ---- */
  const sup = [];
  if (M.cr) sup.push(M.cr + ' ' + T('crShort'));
  if (M.ammo) sup.push(M.ammo + ' ' + T('rktShort'));
  if (sup.length) txt(T('hqSupply', sup.join(', ')), 24, 231, '#4ade80', 8, 'left', 230);
  if (LB.rank) txt(T('lbPlace', LB.rank), 456, 231, '#7fd4e0', 8, 'right', 190);
  else if (SETTINGS.bestScore) txt(T('lbBest', SETTINGS.bestScore), 456, 231, '#5d8299', 8, 'right', 190);

  /* ---- нижние кнопки ---- */
  hqBtn('back', touchMode() ? T('hqBack') : T('hqBackK'), 24, 244, 130, '#9fc3d0', true);
  hqBtn('fight', hqBackTo === 'title' ? T('hqFight') : T('hqResume'), VW - 154, 244, 130, '#4ade80', true);
}

/* ===== src/ui/tutor.js ===== */
;
'use strict';
/* ============================================================
   tutor.js — обучение на первой миссии.

   Не текстом, а показом: каждый шаг подсвечивает то место экрана,
   о котором говорит, и рисует, что нажать — клавиши WASD у катера,
   мышь с горящей кнопкой у прицела, «призрачный» палец на стике.
   Внизу — одна короткая строка-подсказка и точки прогресса.
   Шаг засчитывается действием (проплыл, выстрелил, потопил), а не
   временем; пройдено один раз — больше не мешает.
   ============================================================ */

const TUT_STEPS = 5;
let tut = null;          /* { step, t, sx, sy, fire, k0, done } */

const tutKills = () => kills.ships + kills.planes + kills.bases + kills.bunkers + kills.mines;

/* вызывается из startLevel: только первая миссия и только новичку */
function tutStart(idx) {
  tut = null;
  if (idx !== 0 || SETTINGS.tutDone || !player) return;
  tut = { step: 0, t: 0, sx: player.x, sy: player.y, fire: 0, k0: 0, done: 0 };
}

const tutActive = () => !!tut && state === 'play' && banner.t <= 0;

function tutNext() {
  tut.step++;
  tut.t = 0;
  SFX.pickup();
  if (tut.step === 2) tut.k0 = tutKills();
  if (tut.step >= TUT_STEPS) {
    SETTINGS.tutDone = true;
    saveSettings();
    tut.done = 3;
  }
}

function tutTick(dt) {
  if (!tut || state !== 'play' || banner.t > 0) return;
  tut.t += dt;
  if (tut.done > 0) { tut.done -= dt; if (tut.done <= 0) tut = null; return; }
  const P = player;
  switch (tut.step) {
    case 0:                                                                            /* ход */
      if (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown ||
          keys.ArrowLeft || keys.ArrowRight) tut.keyed = true;
      if (dist(P.x, P.y, tut.sx, tut.sy) > 70) tutNext();
      break;
    case 1: if (mouse.down) tut.fire += dt; if (tut.fire > 0.6) tutNext(); break;       /* огонь */
    /* Таймауты короткие: рядом с новичком теперь стоит слабый катер,
       kill приходит за ~20 секунд. Долгое «висение» на шаге без действия —
       главная причина выхода раньше минуты. */
    case 2: if (tutKills() > tut.k0 || tut.t > 30) tutNext(); break;                   /* цель */
    case 3: if (dist(P.x, P.y, CARR.x, CARR.y) < 145 || tut.t > 25) tutNext(); break;  /* авианосец */
    case 4: if (smokeCD > 0 || P.boosting || tut.t > 10) tutNext(); break;             /* умения */
  }
}

/* ---------- рисование ---------- */
const tutPulse = () => 0.5 + 0.5 * Math.sin(tGlobal * 6);

/* клавиша: скруглённый колпачок с буквой */
function keycap(x, y, label, hot, w) {
  w = w || 12;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; rrect(ctx, x + 1, y + 1.5, w, 12, 2.5); ctx.fill();
  ctx.fillStyle = hot ? '#ffd94a' : '#e8eef1'; rrect(ctx, x, y, w, 12, 2.5); ctx.fill();
  ctx.fillStyle = hot ? '#c9a52a' : '#b9c4ca'; ctx.fillRect(x + 1, y + 9.5, w - 2, 2);
  ctx.font = '8px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#1a2228'; ctx.fillText(label, x + w / 2, y + 1.5);   /* без тени — на светлой клавише она двоит букву */
}
/* мышь с подсвеченной левой кнопкой */
function mouseIcon(x, y) {
  ctx.fillStyle = '#e8eef1'; rrect(ctx, x, y, 12, 17, 6); ctx.fill();
  ctx.strokeStyle = '#1a2228'; ctx.lineWidth = D * 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,217,74,' + (0.5 + 0.5 * tutPulse()).toFixed(2) + ')';
  ctx.beginPath(); ctx.moveTo(x + 6, y + 0.8); ctx.lineTo(x + 6, y + 7);
  ctx.lineTo(x + 0.8, y + 7); ctx.quadraticCurveTo(x + 0.8, y + 0.8, x + 6, y + 0.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, y + 7); ctx.moveTo(x, y + 7); ctx.lineTo(x + 12, y + 7); ctx.stroke();
}
/* пульсирующая рамка вокруг области экрана */
function tutFrame(r, col) {
  const k = tutPulse(), pad = 2 + k * 2;
  ctx.strokeStyle = col || '#ffd94a';
  ctx.globalAlpha = 0.55 + 0.45 * k;
  ctx.lineWidth = D * 3;
  rrect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 4); ctx.stroke();
  ctx.globalAlpha = 1;
}
/* кольцо вокруг точки экрана */
function tutRing(x, y, r, col) {
  const k = tutPulse();
  ctx.strokeStyle = col || '#ffd94a';
  ctx.globalAlpha = 0.5 + 0.5 * k; ctx.lineWidth = D * 3;
  ctx.beginPath(); ctx.arc(x, y, r + k * 3, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
}
/* стрелка-указатель, прыгающая к цели (сверху вниз по умолчанию) */
function tutArrow(x, y, dir) {
  const b = Math.sin(tGlobal * 7) * 2.5;
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir || 0); ctx.translate(0, -8 - b);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-5, -1); ctx.lineTo(-2, -1); ctx.lineTo(-2, -8);
  ctx.lineTo(2, -8); ctx.lineTo(2, -1); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a2228'; ctx.lineWidth = D * 2; ctx.stroke();
  ctx.restore();
}
/* строка-подсказка с точками прогресса */
function tutBubble(text, col) {
  const touch = touchMode();
  const w = Math.min(touch ? 250 : 300, txtW(text) + 26);
  const x = VW / 2 - w / 2, y = touch ? VH - 104 : VH - 58;
  ctx.fillStyle = 'rgba(4,16,26,0.86)'; rrect(ctx, x, y, w, 22, 5); ctx.fill();
  ctx.strokeStyle = col || '#ffb454'; ctx.lineWidth = D * 3; ctx.stroke();
  for (let i = 0; i < TUT_STEPS; i++) {
    ctx.fillStyle = i < tut.step ? '#4ade80' : i === tut.step ? '#ffd94a' : 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(VW / 2 - (TUT_STEPS - 1) * 3.5 + i * 7, y + 4.5, 1.8, 0, TAU); ctx.fill();
  }
  txt(text, VW / 2, y + 9.5, col === '#4ade80' ? '#4ade80' : '#f4f8fa', 8, 'center', w - 12);
}

function tutDraw() {
  if (!tutActive()) return;
  if (tut.done > 0) { tutBubble(T('tutDone'), '#4ade80'); return; }
  const touch = touchMode(), P = player;
  const key = k => T(touch && STR[k + 'T'] ? k + 'T' : k);
  const px = sX(P.x), py = sY(P.y);

  if (tut.step === 0) {
    if (touch) {
      /* призрачный палец водит стик по кругу */
      const cx = STICK_HINT_X, cy = STICK_HINT_Y, a = tGlobal * 2.2;
      ctx.strokeStyle = 'rgba(255,217,74,0.8)'; ctx.lineWidth = D * 3;
      ctx.beginPath(); ctx.arc(cx, cy, STICK_R, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,217,74,0.55)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * STICK_R * 0.6, cy + Math.sin(a) * STICK_R * 0.6, 9, 0, TAU); ctx.fill();
    } else {
      const kx = clamp(px - 20, 6, VW - 46), ky = clamp(py + 16, 50, VH - 80);
      keycap(kx + 13, ky, 'W', keys.KeyW || keys.ArrowUp);
      keycap(kx, ky + 14, 'A', keys.KeyA || keys.ArrowLeft);
      keycap(kx + 13, ky + 14, 'S', keys.KeyS || keys.ArrowDown);
      keycap(kx + 26, ky + 14, 'D', keys.KeyD || keys.ArrowRight);
    }
    /* клавиши молчат 4 секунды — скорее всего, фокус у страницы площадки */
    tutBubble(!touch && !tut.keyed && tut.t > 4 ? T('tutClick') : key('tut1'));
  } else if (tut.step === 1) {
    if (touch) {
      /* касание справа — расходящиеся круги */
      const x = VW * 0.72, y = VH * 0.45, k = (tGlobal * 1.4) % 1;
      ctx.strokeStyle = 'rgba(255,217,74,' + (1 - k).toFixed(2) + ')'; ctx.lineWidth = D * 3;
      ctx.beginPath(); ctx.arc(x, y, 4 + k * 16, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,217,74,0.6)'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
    } else {
      mouseIcon(clamp(mouse.x + 12, 4, VW - 18), clamp(mouse.y + 8, 4, VH - 22));
    }
    /* ближайший враг — в кольцо */
    let best = null, bd = 380;
    for (const e of enemies) { const d = dist(e.x, e.y, P.x, P.y); if (d < bd) { bd = d; best = e; } }
    if (best) tutRing(sX(best.x), sY(best.y), 14, '#ff6b5e');
    tutBubble(key('tut2'));
  } else if (tut.step === 2) {
    /* цель уровня — плашка вверху по центру */
    tutFrame(hudObjRect);
    tutArrow(hudObjRect.x + hudObjRect.w / 2, hudObjRect.y + hudObjRect.h + 16, Math.PI);
    const t = objTarget();
    if (t) {
      const x = sX(t.x), y = sY(t.y);
      if (x > 10 && x < VW - 10 && y > 10 && y < VH - 10) tutRing(x, y, 18, '#ff9166');
    }
    tutBubble(key('tut3'));
  } else if (tut.step === 3) {
    const x = sX(CARR.x), y = sY(CARR.y);
    if (x > 0 && x < VW && y > 0 && y < VH) { tutRing(x, y, 40, '#4ade80'); tutArrow(x, y - 52); }
    else edgeArrow(CARR.x, CARR.y, '#4ade80');
    tutBubble(key('tut4'));
  } else if (tut.step === 4) {
    if (touch && typeof tButtons === 'function') {
      for (const b of tButtons()) if (b.id === 'boost' || b.id === 'smoke') tutRing(b.x, b.y, b.r + 2);
    } else {
      tutFrame(hudAbilRect);
      tutFrame({ x: 22, y: 20, w: 108, h: 8 }, '#7fd4e0');
      keycap(161, 18, 'SHIFT', P.boosting, 26);
    }
    tutBubble(key('tut5'));
  }
}

/* ===== src/core/touch.js ===== */
;
'use strict';
/* ============================================================
   touch.js — сенсорное управление.

   Левая половина экрана — виртуальный стик: катер поворачивает
   к направлению пальца, скорость пропорциональна отклонению.
   Правая половина — ручной прицел и огонь. Пока палец её не
   касается, работает автоприцел: башня сама бьёт ближайшую цель.
   Крупные кнопки дугой под большим пальцем справа внизу.

   Чтобы не дублировать логику, касание прицела просто выставляет
   mouse.x/mouse.y/mouse.down — весь остальной код работает как есть.
   ============================================================ */

const tMove = { active: false, dx: 0, dy: 0, mag: 0, bx: 0, by: 0, x: 0, y: 0, id: -1 };
const tAim  = { id: -1 };
const tHeld = {};                       /* имя кнопки -> id пальца */
let touchUsed = false;                  /* был ли хоть один тач: для подсказок */

const STICK_R = 34;                     /* радиус отклонения стика, единицы разметки */
const STICK_KNOB = 12;                  /* ручка стика */
const STICK_HINT_X = 70, STICK_HINT_Y = VH - 112;   /* где рисуется подсказка стика */

function tButtons() {
  const near = player && !player.dead && dist(player.x, player.y, CARR.x, CARR.y) < 145;
  /* Дуга под большим пальцем в правом нижнем углу: ракета — ближе всего
     к пальцу и крупнее всех, остальное вокруг. Счёт на телефоне живёт
     в верхней левой панели, поэтому угол целиком отдан кнопкам. */
  const b = [
    { id: 'rocket', x: VW - 44,  y: VH - 52,  r: 28 },
    { id: 'boost',  x: VW - 44,  y: VH - 122, r: 22 },
    { id: 'smoke',  x: VW - 110, y: VH - 36,  r: 20 },
    { id: 'pause',  x: VW - 22,  y: 108,      r: 13 }
  ];
  if (upg.dc) b.push({ id: 'dc', x: VW - 106, y: VH - 96, r: 20 });
  if (near) b.push({ id: 'shop', x: VW - 168, y: VH - 40, r: 18 });
  return b;
}

/* экранные координаты касания в единицах разметки */
function tPos(t) {
  const r = cv.getBoundingClientRect();
  return {
    x: clamp((t.clientX - r.left) * (VW / r.width), 0, VW),
    y: clamp((t.clientY - r.top) * (VH / r.height), 0, VH)
  };
}

/* зона нажатия шире самой кнопки; при перекрытии берём ближайшую */
function hitButton(p) {
  let best = null, bd = 1e9;
  for (const b of tButtons()) {
    const d = dist(p.x, p.y, b.x, b.y);
    if (d < b.r + 9 && d - b.r < bd) { bd = d - b.r; best = b.id; }
  }
  return best;
}

/* ---------- нажатия вне боя: меню, магазин, настройки ---------- */
function touchTapUI(p) {
  mouse.x = p.x; mouse.y = p.y;
  if (uiTap(p.x, p.y)) return true;
  if (state === 'title') {
    if (hitTitleSettings(p.x, p.y)) { openSettings('title'); return true; }
    if (hitTitleCrate(p.x, p.y)) { openCrate('title'); return true; }
    if (hitTitleHq(p.x, p.y)) { openHQ('title'); return true; }
    goFullscreen(); startCampaign(); return true;
  }
  if (state === 'hq') { hqTap(p.x, p.y); return true; }
  if (state === 'crate') { crateTap(p.x, p.y); return true; }
  if (state === 'settings')   { settingsTap(p.x, p.y); return true; }
  if (state === 'shop')       { shopTap(p.x, p.y); return true; }
  if (state === 'pause') {
    if (hitPauseSettings(p.x, p.y)) { openSettings('pause'); return true; }
    setState('play'); SFX.ui(); return true;
  }
  if (state === 'over' && hitRevive(p.x, p.y)) { tryRevive(); return true; }
  if (state === 'levelclear' && stT > 0.6) { adThenLevel(level + 1); return true; }
  if (state === 'over' && stT > 0.8)       { adThenLevel(level); return true; }
  if (state === 'win'  && stT > 0.8)       { adThenLevel(level + 1); return true; }
  return false;
}

function goFullscreen() {
  if (!touchMode()) return;
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  } catch (e) {}
}

/* ---------- обработчики ---------- */
function onTouchStart(e) {
  if (!touchMode()) return;
  e.preventDefault();
  try { window.focus(); } catch (err) {}      /* фокус окну игры — иначе клавиатура уходит странице площадки */
  if (typeof adBlocking === 'function' && adBlocking()) return;
  touchUsed = true;
  initAudio();
  for (const t of e.changedTouches) {
    const p = tPos(t);
    if (state !== 'play' && state !== 'dying') { touchTapUI(p); continue; }

    const btn = hitButton(p);
    if (btn) {
      tHeld[btn] = t.identifier;
      if (btn === 'rocket') { mouse.rdown = true; fireMissile(); }
      else if (btn === 'smoke') dropSmoke();
      else if (btn === 'dc') dropCharge();
      else if (btn === 'shop') {
        if (player && !player.dead && dist(player.x, player.y, CARR.x, CARR.y) < 145) {
          setState('shop'); shopSel = 0; shopMsgT = 0; SFX.ui();
        }
      } else if (btn === 'pause') { setState('pause'); SFX.ui(); }
      continue;
    }
    if (p.x < VW * 0.44 && tMove.id < 0) {
      tMove.id = t.identifier; tMove.active = true;
      tMove.bx = p.x; tMove.by = p.y; tMove.x = p.x; tMove.y = p.y;
      tMove.dx = 0; tMove.dy = 0; tMove.mag = 0;
    } else if (tAim.id < 0) {
      tAim.id = t.identifier;
      mouse.x = p.x; mouse.y = p.y; mouse.down = true;
    }
  }
}

function onTouchMove(e) {
  if (!touchMode()) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = tPos(t);
    if (t.identifier === tMove.id) {
      let dx = p.x - tMove.bx, dy = p.y - tMove.by;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {                       /* база подтягивается за пальцем */
        tMove.bx += dx * (1 - STICK_R / d);
        tMove.by += dy * (1 - STICK_R / d);
        dx = p.x - tMove.bx; dy = p.y - tMove.by;
      }
      tMove.x = p.x; tMove.y = p.y;
      tMove.dx = dx; tMove.dy = dy;
      tMove.mag = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    } else if (t.identifier === tAim.id) {
      mouse.x = p.x; mouse.y = p.y;
    }
  }
}

function onTouchEnd(e) {
  if (!touchMode()) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === tMove.id) {
      tMove.id = -1; tMove.active = false; tMove.mag = 0; tMove.dx = 0; tMove.dy = 0;
    }
    if (t.identifier === tAim.id) { tAim.id = -1; mouse.down = false; }
    for (const k in tHeld) if (tHeld[k] === t.identifier) {
      delete tHeld[k];
      if (k === 'rocket') mouse.rdown = false;
    }
  }
}

function touchBoosting() { return tHeld.boost !== undefined; }

function bindTouch() {
  const opt = { passive: false };
  cv.addEventListener('touchstart', onTouchStart, opt);
  cv.addEventListener('touchmove', onTouchMove, opt);
  cv.addEventListener('touchend', onTouchEnd, opt);
  cv.addEventListener('touchcancel', onTouchEnd, opt);
}

/* ------------------------------------------------------------
   Автоприцел на телефоне. Двумя пальцами рулить и целиться неудобно,
   поэтому, пока правый палец не лежит на экране, башня сама берёт
   ближайшую цель в зоне поражения и стреляет. Коснулся правой
   половины — прицел снова ручной. Ночью, пока катер не обнаружен,
   сама не стреляет: операция тихая, выдавать себя не будем.
   ------------------------------------------------------------ */
const AUTO_RANGE = 230;                 /* дальше снаряд почти не долетает */
let autoTgt = null;

function touchAutoAim() {
  autoTgt = null;
  if (!touchMode()) return;
  if (state !== 'play' || !player || player.dead) { if (tAim.id < 0) mouse.down = false; return; }
  if (tAim.id >= 0) return;             /* палец на экране — прицел ручной */
  const quiet = curCfg.mission === 'night' && !stealth.blown;
  const t = nearestTarget(player.x, player.y, AUTO_RANGE);
  if (t) {
    autoTgt = t;
    mouse.x = clamp((t.x - ox) * cam.z, 0, VW);
    mouse.y = clamp((t.y - oy) * cam.z, 0, VH);
    mouse.down = !quiet;
  } else {
    /* целей нет — башня смотрит по ходу катера */
    mouse.x = clamp(sX(player.x + Math.cos(player.ang) * 60), 0, VW);
    mouse.y = clamp(sY(player.y + Math.sin(player.ang) * 60), 0, VH);
    mouse.down = false;
  }
}

/* ---------- отрисовка ---------- */
/* Исходные радиусы кнопок, под которые нарисованы значки: значки
   масштабируются вместе с кнопкой. */
const BTN_BASE_R = { rocket: 19, boost: 15, smoke: 14, dc: 14, shop: 15, pause: 11, mute: 11 };

function drawTouchUI() {
  if (!touchMode()) return;

  /* стик */
  if (tMove.active) {
    ctx.strokeStyle = 'rgba(160,220,235,0.36)'; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(tMove.bx, tMove.by, STICK_R, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(160,220,235,0.12)';
    ctx.beginPath(); ctx.arc(tMove.bx, tMove.by, STICK_R, 0, TAU); ctx.fill();
    const kx = tMove.bx + tMove.dx, ky = tMove.by + tMove.dy;
    ctx.fillStyle = 'rgba(200,240,250,0.6)';
    ctx.beginPath(); ctx.arc(kx, ky, STICK_KNOB, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(kx, ky, STICK_KNOB, 0, TAU); ctx.stroke();
  } else {
    /* подсказка, пока игрок не трогал стик */
    ctx.globalAlpha = 0.24 + 0.08 * Math.sin(tGlobal * 2);
    ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = D * 2;
    ctx.beginPath(); ctx.arc(STICK_HINT_X, STICK_HINT_Y, STICK_R, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath(); ctx.arc(STICK_HINT_X, STICK_HINT_Y, STICK_KNOB - 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* рамка на цели автоприцела — видно, куда стреляет башня */
  if (autoTgt && state === 'play') {
    const sx = sX(autoTgt.x), sy = sY(autoTgt.y), s = 9 + Math.sin(tGlobal * 8) * 1.2;
    ctx.strokeStyle = (curCfg.mission === 'night' && !stealth.blown) ? 'rgba(159,232,255,0.7)' : 'rgba(255,145,102,0.85)';
    ctx.lineWidth = D * 2;
    for (let q = 0; q < 4; q++) {
      const ax = q & 1 ? 1 : -1, ay = q & 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(sx + ax * s, sy + ay * (s - 4)); ctx.lineTo(sx + ax * s, sy + ay * s); ctx.lineTo(sx + ax * (s - 4), sy + ay * s);
      ctx.stroke();
    }
  }

  /* кнопки */
  for (const b of tButtons()) {
    const held = tHeld[b.id] !== undefined;
    let col = '#7fd4e0', label = '';
    if (b.id === 'rocket') { col = upg.msl && upg.ammo > 0 ? '#ffb454' : '#5b6b72'; label = String(upg.ammo); }
    else if (b.id === 'boost') { col = player && player.boostE > 4 ? '#7fd4e0' : '#5b6b72'; }
    else if (b.id === 'smoke') { col = smokeCD > 0 ? '#3d5f70' : '#9fe8ff'; }
    else if (b.id === 'dc') { col = dcCD > 0 ? '#5b6b72' : '#ffb454'; }
    else if (b.id === 'shop') col = '#4ade80';
    else if (b.id === 'pause') col = '#9fc3d0';
    else if (b.id === 'mute') col = muted ? '#5b6b72' : '#9fc3d0';

    ctx.fillStyle = held ? 'rgba(80,140,170,0.6)' : 'rgba(6,20,32,0.58)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = D * 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();

    /* кольцо отката — по краю кнопки */
    const ring = f => {
      ctx.strokeStyle = col; ctx.lineWidth = D * 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 4, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    };
    if (b.id === 'boost' && player) ring(clamp(player.boostE / boostMax(), 0, 1));
    else if (b.id === 'smoke' && smokeCD > 0) ring(1 - smokeCD / SMOKE_CD);
    else if (b.id === 'dc' && dcCD > 0) ring(1 - dcCD / DC_CD);

    /* значок — в масштабе кнопки */
    const k = b.r / (BTN_BASE_R[b.id] || b.r);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.scale(k, k); ctx.translate(-b.x, -b.y);
    ctx.fillStyle = col;
    if (b.id === 'rocket') {
      ctx.save(); ctx.translate(b.x, b.y - 2); ctx.rotate(-Math.PI / 2);
      ctx.fillRect(-6, -1.6, 9, 3.2);
      ctx.beginPath(); ctx.moveTo(3, -1.6); ctx.lineTo(6.5, 0); ctx.lineTo(3, 1.6); ctx.closePath(); ctx.fill();
      ctx.restore();
      txt(label, b.x, b.y + 5, col, 8, 'center');
    } else if (b.id === 'boost') {
      ctx.beginPath();
      ctx.moveTo(b.x + 2, b.y - 8); ctx.lineTo(b.x - 4, b.y + 1);
      ctx.lineTo(b.x, b.y + 1); ctx.lineTo(b.x - 2, b.y + 8);
      ctx.lineTo(b.x + 5, b.y - 1); ctx.lineTo(b.x + 1, b.y - 1);
      ctx.closePath(); ctx.fill();
    } else if (b.id === 'smoke') {
      for (let q = 0; q < 3; q++) {
        ctx.beginPath();
        ctx.arc(b.x - 4 + q * 4, b.y + (q === 1 ? -3 : 1), 3.4 - q * 0.4, 0, TAU);
        ctx.fill();
      }
    } else if (b.id === 'dc') {
      ctx.fillRect(b.x - 3, b.y - 5, 6, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x - 3, b.y - 2, 6, 1.4); ctx.fillRect(b.x - 3, b.y + 2, 6, 1.4);
    } else if (b.id === 'shop') {
      txt('E', b.x, b.y - 4, col, 8, 'center');
    } else if (b.id === 'pause') {
      ctx.fillRect(b.x - 3.5, b.y - 4, 2.5, 8);
      ctx.fillRect(b.x + 1, b.y - 4, 2.5, 8);
    } else if (b.id === 'mute') {
      /* динамик; выключен — перечёркнут */
      ctx.fillRect(b.x - 5, b.y - 2, 3, 4);
      ctx.beginPath(); ctx.moveTo(b.x - 2, b.y - 2); ctx.lineTo(b.x + 2, b.y - 5);
      ctx.lineTo(b.x + 2, b.y + 5); ctx.lineTo(b.x - 2, b.y + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = D * 2;
      ctx.beginPath();
      if (muted) { ctx.moveTo(b.x + 4, b.y - 3); ctx.lineTo(b.x + 7, b.y + 3); ctx.moveTo(b.x + 7, b.y - 3); ctx.lineTo(b.x + 4, b.y + 3); }
      else ctx.arc(b.x + 2, b.y, 5, -0.8, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ===== src/core/input.js ===== */
;
'use strict';
/* ============================================================
   input.js — клавиатура и мышь
   ============================================================ */

addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  /* правило CrazyGames: от запроса рекламы до её конца интерфейс заблокирован */
  if (typeof adBlocking === 'function' && adBlocking()) return;
  initAudio();              /* бой мог начаться сам: звук включаем с первой клавиши */
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
  e.preventDefault();
  /* preventDefault у mousedown не даёт браузеру отдать фокус окну игры:
     в iframe площадки клавиши тогда уходят её странице, и катер не
     слушается WASD, пока не нажмёшь «полный экран». Берём фокус сами. */
  try { window.focus(); } catch (err) {}
  initAudio();
  setMouseFrom(e);          /* клик может прийти без предшествующего mousemove */
  /* кнопки интерфейса — раньше всего остального */
  if (e.button !== 2 && !(typeof adBlocking === 'function' && adBlocking()) && uiTap(mouse.x, mouse.y)) return;
  if (typeof adBlocking === 'function' && adBlocking()) return;

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
   Но пауза — только когда вкладка реально скрыта (поворот экрана, сворачивание,
   рекламный ролик). Обычный blur в iframe площадки срабатывает и при загрузке
   без фокуса, и при клике мимо — мгновенная пауза для новичка выглядит как
   «игра сломалась» и режет конверсию в геймплей. */
function focusLost(hard) {
  YA.away = true; audioGate();
  if (hard && state === 'play') setState('pause');
  mouse.down = false; mouse.rdown = false;
  for (const k in keys) keys[k] = false;
}
function focusBack() { YA.away = false; audioGate(); }

addEventListener('blur', () => focusLost(false));
addEventListener('focus', focusBack);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) focusLost(true); else focusBack();
});

/* удержание ПКМ — залп ракет с задержкой */
setInterval(() => {
  if (mouse.rdown && state === 'play' && player && !player.dead && mCool <= 0) fireMissile();
}, 90);

/* ===== src/main.js ===== */
;
'use strict';
/* ============================================================
   main.js — запуск уровней, главный цикл, обновление и вывод
   ============================================================ */

let bossKilled = false, bossTimer = 0;

/* Гибель подряд на одном уровне: штаб понемногу помогает (до трёх раз),
   чтобы застрявший игрок не бросил игру. Новый уровень — всё с нуля. */
const MERCY_MAX = 3;
let mercyN = 0;

function startLevel(idx) {
  mercyN = (state === 'over' && idx === level) ? Math.min(MERCY_MAX, mercyN + 1) : 0;
  level = idx;
  const L = makeLevel(idx);
  if (mercyN) {
    L.eDmg = +(L.eDmg * (1 - 0.12 * mercyN)).toFixed(2);
    L.enemies = Math.max(2, L.enemies - mercyN);
    L.mines = Math.round(L.mines * (1 - 0.2 * mercyN));
  }
  genWorld(L);
  initWeather(L);

  player = makePlayer();
  if (mercyN) { player.maxhp = Math.round(player.maxhp * (1 + 0.1 * mercyN)); player.hp = player.maxhp; }
  boss = null; bossKilled = false; bossTimer = 0;
  tornados = []; marines = []; squad = []; crew = []; landed = 0;
  subs = []; torps = []; charges = []; smokes = []; transport = null;
  smokeCD = 0; dcCD = 0; subPingT = rr(6, 12); convoyWarnT = 0;
  reviveLeft = 1; adAmmoT = 0;
  if (upg.msl && hasPerk('harp')) upg.ammo = Math.max(upg.ammo, 4);
  stealth = { meter: 0, lit: false, blown: false, warned: false };
  tornT = rr(5, 12); tornWarnT = 0;
  enemies = []; planes = []; shells = []; arcs = []; missiles = []; eMissiles = [];
  parts = []; lights = []; floats = []; pickups = []; hostages = []; msgs = []; wakes = [];

  kills = { ships:0, planes:0, bases:0, bunkers:0, mines:0 };
  rescued = 0; spawned = 0; destroyedBases = 0; playTime = 0; mCool = 0;
  alert = 0; combo = 0; comboT = 0; comboBest = 0; radarHacked = false;
  planeT = L.plane * 0.7; shipT = 6;
  winPend = false; shake = 0; hitStop = 0; flashScreen = 0;
  hints = { h:false, c:false, b:false };
  evReset();                 /* события боя и усиления — с нуля на каждом уровне */
  cam.x = player.x; cam.y = player.y; cam.z = cam.zt = camBase();

  for (let i = 0; i < L.enemies; i++) spawnEnemy();
  /* Первая миссия: один слабый катер ставим рядом с игроком (~280px),
     чтобы новичок открыл огонь и потопил цель в первые 20 секунд.
     Дальний спавн за 360+ пикселей давал «пустое море» и выход
     из игры раньше минуты (gameplay conversion, CrazyGames). */
  if (idx === 0 && player) {
    for (let t = 0; t < 40; t++) {
      const a = rr(0, TAU), d = rr(250, 320);
      const x = clamp(player.x + Math.cos(a) * d, 20, WORLD.w - 20);
      const y = clamp(player.y + Math.sin(a) * d, 20, WORLD.h - 20);
      if (!isWater(x, y)) continue;
      /* isl обязателен: патрульный строит точку маршрута от него
         (enemies.js, updEnemies), без острова падал весь кадр */
      let home = islands[0];
      for (const o of islands) if (dist(x, y, o.x, o.y) < dist(x, y, home.x, home.y)) home = o;
      const hp = curCfg.eHp * SHIP_TYPES.patrol.hp * diff().hp;
      enemies.push({
        type: 'patrol', T: SHIP_TYPES.patrol, x, y, ang: a + Math.PI, spd: 0,
        hp, max: hp, state: 'patrol', isl: home, wa: a + 1.5,
        cool: rr(1.5, 2.5), flash: 0, smk: 0, roll: 0, wakeT: 0, alertT: 0
      });
      break;
    }
  }

  /* особые задачи уровня */
  if (L.mission === 'night') {
    const pool = shuffle(islands.slice());
    let left = L.prisoners, i = 0;
    while (left > 0 && i < pool.length) {
      const take = Math.min(left, ri(2, 3));
      left -= spawnHostages(pool[i], take, true);
      i++;
    }
  }
  if (L.mission === 'escort' && allyIsl) spawnMarines(allyIsl, L.marines);
  if (L.mission === 'convoy') {
    /* порт назначения — самый дальний от авианосца остров */
    const far = islands.slice().sort((a, b) =>
      dist(b.x, b.y, CARR.x, CARR.y) - dist(a.x, a.y, CARR.x, CARR.y))[0];
    if (far) {
      transport = makeTransport(far);
      transport.total = 0;
      let px = transport.x, py = transport.y;
      for (const w of transport.wp) { transport.total += dist(px, py, w.x, w.y); px = w.x; py = w.y; }
    }
  }

  banner = { main: T('stLevel') + ' ' + (idx + 1),
             sub: '«' + lvlName(idx) + '» • ' + T(missionKey(L.mission)),
             /* первая миссия короче: обучение стартует раньше, игрок
                быстрее делает первое действие (важно для конверсии) */
             t: idx === 0 ? 2.2 : 3.0 };

  /* что выдал штаб на старте кампании: склад плюс надбавка за звание */
  if (idx === 0 && startGift && (startGift.cr || startGift.ammo)) {
    const g = [];
    if (startGift.cr) g.push(T('giftCr', startGift.cr));
    if (startGift.ammo) g.push(T('giftAmmo', startGift.ammo));
    msg(T('giftLine', g.join(' + ')), '#ffd94a', 4, 2.4);
    startGift = { cr: 0, ammo: 0 };
  }
  if (L.mission === 'night') {
    msg(T('objNight', spawned), '#ffd94a', 4, 0.8);
    msg(T('objNight2'), '#7fd4e0', 4, 5.2);
  } else if (L.mission === 'escort') {
    msg(T('objEscort', '«' + islName(allyIsl) + '»'), '#6fae5a', 4, 0.8);
    msg(T('objEscort2', '«' + islName(targetIsl) + '»'), '#7fd4e0', 4, 5.2);
  } else if (L.mission === 'convoy' && transport) {
    msg(T('objConvoy', T('transport'), '«' + islName(transport.dest) + '»'), '#4ade80', 4.5, 0.8);
    msg(T('objConvoy2'), '#ffb454', 4, 5.2);
  } else {
    msg(T('objAssault', totalBases), '#ffd94a', 4, 0.8);
  }
  if (L.tornado) msg(T('mTornado'), '#e5484d', 4, 12.0);
  if (L.subs) msg(T('mSubs'), '#7fd4e0', 3.5, 17.5);
  tutStart(idx);             /* обучение новичка на первой миссии */
  if (mercyN) msg(T('mercyMsg', mercyN * 10), '#4ade80', 4, 0.4);
  if (L.mines) msg(T('mMines'), '#e5484d', 3.5, 13.4);
  setState('play');
  if (runTrack && !SETTINGS.played) { SETTINGS.played = true; saveSettings(); }
  if (runTrack) runSave();   /* снимок на случай перезагрузки страницы */
}

/* начать игру с заставки: недоигранную операцию поднимаем, иначе с нуля */
function startCampaign() {
  initAudio();
  runTrack = true;
  if (runPending() && runRestore()) return;
  resetAll();
  startLevel(0);
}

const missionKey = m => m === 'night' ? 'mTypeNight'
                      : m === 'escort' ? 'mTypeEscort'
                      : m === 'boss' ? 'mTypeBoss' : 'mTypeAssault';

/* сколько огневых точек осталось на острове-цели */
function targetLeft() {
  if (!targetIsl) return [0, 0];
  let left = 0, all = 0;
  for (const s of structs) {
    if (s.isl !== targetIsl || s.type === 'crate') continue;
    all++; if (!s.dead) left++;
  }
  return [all - left, all];
}

/* ---------- условия завершения уровня ---------- */
function checkLevelDone(dt) {
  if (boss && boss.dead) bossKilled = true;
  if (bossTimer > 0) { bossTimer -= dt; if (bossTimer <= 0 && !boss && !bossKilled) spawnBoss(); }
  const bossOk = !curCfg.boss || (bossKilled && !boss);
  const nothingPending = player.aboard === 0 && player.troops === 0 &&
        !hostages.some(h => h.state === 'wait' || h.state === 'swim');
  const m = curCfg.mission;
  const objOk = m === 'night'  ? (spawned > 0 && rescued >= spawned)
              : m === 'escort' ? allTargetStructsDead()
              : m === 'convoy' ? !!(transport && transport.done)
              : destroyedBases >= totalBases;

  /* цель выполнена — оставшихся заложников забирает вертолёт,
     чтобы не гонять катер через всю карту ради последней шлюпки */
  if (!winPend && objOk && bossOk && m !== 'night' &&
      (player.aboard || player.troops || hostages.some(h => h.state === 'wait' || h.state === 'swim')))
    heliEvac();

  /* транспорт на дне — задание сорвано */
  if (m === 'convoy' && transport && transport.dead && !winPend && state === 'play') {
    recordBest();
    setState('over');
    return;
  }

  if (!winPend && objOk && bossOk && nothingPending) {
    winPend = true; winT = 1.6;
    msg(T('mAllTargets'), '#4ade80', 3);
    score += Math.max(0, Math.floor(player.hp)) * 3;
  }
  if (winPend) {
    winT -= dt;
    if (winT <= 0) {
      let mul = curCfg.boss ? 2.5 : 1;
      if (curCfg.mission === 'night' && !stealth.blown) mul *= 1.6;   /* прошли тихо */
      const bonus = Math.round(ECON.levelBonus(level) * mul);
      money += bonus; score += Math.round(bonus * ECON.scoreMul);
      recordBest();
      sdkHappy();                       /* площадке: игроку сейчас хорошо */
      metaAutoRation();                 /* первый день: паёк сам, и видно, что будет завтра */
      setState(curCfg.boss ? 'win' : 'levelclear');
    }
  }
}

/* лучший забег — показываем на заставке и на экране гибели */
function recordBest() {
  if ((SETTINGS.bestLevel || 0) < level + 1) SETTINGS.bestLevel = level + 1;
  if ((SETTINGS.bestScore || 0) < score) SETTINGS.bestScore = score;
  metaAddXp(score);                    /* счёт забега идёт в звание */
  lbSubmit(SETTINGS.bestScore);        /* и в таблицу рекордов площадки */
  saveSettings();
}

/* ---------- камера ---------- */
function updCamera(dt) {
  const P = player;
  /* небольшое упреждение в сторону прицела и хода */
  const aimX = clamp((mouse.x - VW / 2) * 0.28, -46, 46);
  const aimY = clamp((mouse.y - VH / 2) * 0.28, -30, 30);
  const velX = Math.cos(P.ang) * P.spd * 0.16;
  const velY = Math.sin(P.ang) * P.spd * 0.16;
  const tx = P.x + aimX + velX, ty = P.y + aimY + velY;
  cam.x = approach(cam.x, tx, 7, dt);
  cam.y = approach(cam.y, ty, 7, dt);
  const zb = camBase();                   /* 1 — компьютер, ближе — телефон */
  cam.zt = approach(cam.zt, zb, 3.5, dt);
  cam.z  = approach(cam.z, cam.zt, 12, dt);
  if (Math.abs(cam.z - zb) < 0.004) cam.z = zb;
}

/* ---------- обновление ---------- */
/* межстраничный ролик на переходе между попытками и уровнями */
function adThenLevel(n) {
  adFullscreen(() => startLevel(n));   /* колбэк придёт всегда: есть сторож */
}

function update(dt) {
  tGlobal += dt; stT += dt;
  updAds(dt);
  updCrate(dt);
  adAmmoT = Math.max(0, adAmmoT - dt);
  /* задания дня считаются по приросту счётчиков боя */
  if (state === 'play' || state === 'dying' || state === 'levelclear' ||
      state === 'over' || state === 'win') dqTick();
  /* пока крутится ролик или площадка держит паузу — мир стоит */
  if (YA.busy || adMockT > 0 || YA.paused) return;
  shake = Math.max(0, shake - shake * 6 * dt - 1.5 * dt);
  flashScreen = Math.max(0, flashScreen - dt * 2.2);

  if (state === 'title') {
    updParts(dt); updWakes(dt); updWeather(dt);
    const tt = tGlobal * 0.045;
    cam.x = (Math.sin(tt) * 0.5 + 0.5) * (WORLD.w - VW) + VW / 2;
    cam.y = (Math.sin(tt * 0.8 + 2) * 0.5 + 0.5) * (WORLD.h - VH) + VH / 2;
    titlePT -= dt;
    if (titlePT <= 0) { titlePT = rr(5, 9); titlePlanes.push({ x: -20, y: rr(30, 140), vx: rr(45, 70) }); }
    for (let i = titlePlanes.length - 1; i >= 0; i--) {
      titlePlanes[i].x += titlePlanes[i].vx * dt;
      if (titlePlanes[i].x > VW + 30) titlePlanes.splice(i, 1);
    }
    return;
  }
  if (state === 'hq') { updParts(dt); updWeather(dt); return; }
  if (state === 'pause' || state === 'settings' || state === 'crate') { setNoteT -= dt; return; }
  if (state === 'shop') { updParts(dt); updWeather(dt); shopMsgT -= dt; return; }
  if (state === 'levelclear') { updParts(dt); updFloats(dt); updWeather(dt); return; }
  if (state === 'over' || state === 'win') {
    updParts(dt); updFloats(dt); updWeather(dt);
    if (state === 'win') {
      fwT -= dt;
      if (fwT <= 0) {
        fwT = rr(0.3, 0.7);
        boom(ox + rr(60, VW - 60), oy + rr(40, VH - 80), 0.7, ['#4ade80', '#ffd94a', '#7fd4e0', '#ff9ad5']);
      }
    }
    return;
  }

  /* Телефон в портретной ориентации: сразу ставить на паузу нельзя —
     игрок в iframe площадки видит только «паузу» и уходит раньше минуты.
     Даём 12 секунд рассмотреть бой и повернуть устройство, подсказка
     о повороте всё равно рисуется поверх (renderRotateHint). */
  if (isPortrait() && playTime > 12) { setState('pause'); return; }
  playTime += dt;
  banner.t -= dt;
  mCool -= dt;

  touchAutoAim();              /* телефон: автоприцел, пока правый палец свободен */
  updPlayer(dt);
  updStructs(dt);
  updEnemies(dt);
  updBoss(dt);
  updPlanes(dt);
  updShells(dt);
  updArcs(dt);
  updMissiles(dt);
  updEMissiles(dt);
  updMines(dt);
  updPickups(dt);
  updHostages(dt);
  updMarines(dt);
  updSquad(dt);
  updStealth(dt);
  updTornados(dt);
  updSubs(dt);
  updTorps(dt);
  updSmokes(dt);
  updCharges(dt);
  updTransport(dt);
  evTick(dt);
  updParts(dt);
  updWakes(dt);
  updFloats(dt);
  updMsgs(dt);
  updCombo(dt);
  updWeather(dt);
  updCamera(dt);
  tutTick(dt);

  /* тревога медленно растёт со временем боя */
  if (state === 'play') {
    const target = Math.min(3, Math.floor(destroyedBases) + (playTime > 150 ? 1 : 0));
    if (target > alert) alert = target;
    checkLevelDone(dt);
  }
}

/* ---------- вывод ---------- */
const isPortrait = () => touchMode() && innerHeight > innerWidth * 1.04;

const MENU_STATES = { title: 1, pause: 1, settings: 1, shop: 1, crate: 1, hq: 1,
                      levelclear: 1, over: 1, win: 1 };
let lastCursor = '';
function syncCursor() {
  const want = MENU_STATES[state] ? 'default' : 'none';
  if (want !== lastCursor) { lastCursor = want; cv.style.cursor = want; }
}

function render(dt) {
  syncCursor();
  uiFrame();                 /* кнопки кадра регистрируются заново */
  /* единицы разметки -> физические пиксели */
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  if (state === 'hq') { renderHQ(); }
  else if (state === 'crate') { renderCrate(); }
  else if (state === 'settings') { renderSettings(); }
  else if (state === 'title') { renderTitle(); }
  else if (state === 'shop') { renderShop(); }
  else if (state === 'levelclear') { renderLevelClear(); }
  else {
    drawScene(dt);
    if (state === 'play' || state === 'dying') drawHUD();
    if (state === 'pause') { drawHUD(); renderPause(); }
    if (state === 'over') renderEnd(false);
    if (state === 'win') renderEnd(true);
  }
  if (isPortrait()) renderRotateHint();
  drawAdOverlay();
}

/* ---------- масштабирование окна ---------- */
function resize() {
  const s = Math.min(innerWidth / PW, innerHeight / PH);
  cv.style.width  = Math.round(PW * s) + 'px';
  cv.style.height = Math.round(PH * s) + 'px';
}
addEventListener('resize', resize);
/* Выход из полноэкранного режима площадки: внутри iframe событие resize
   приходит не всегда или раньше, чем окно получит итоговый размер, —
   холст оставался полноэкранным, обрезался и игра казалась
   «приближенной». Пересчитываем при смене режима и сверяем размер окна. */
const refit = () => { resize(); setTimeout(resize, 120); setTimeout(resize, 500); };
document.addEventListener('fullscreenchange', refit);
document.addEventListener('webkitfullscreenchange', refit);
let fitW = 0, fitH = 0;
setInterval(() => {
  if (innerWidth !== fitW || innerHeight !== fitH) { fitW = innerWidth; fitH = innerHeight; resize(); }
}, 250);

/* ---------- старт ---------- */
ysdkInit();
applySettings();
/* Язык браузера — после загрузки переводов (settings.js выполняется раньше
   i18n.js, поэтому detectLang() на старте всегда давал 'en'). Новичок,
   не понявший обучение, уходит раньше минуты — это конверсия в геймплей. */
if (!SETTINGS.langSet && typeof langOk === 'function') {
  try {
    const b = detectBrowserLang();
    if (b && b !== SETTINGS.lang && langOk(b)) { SETTINGS.lang = b; applySettings(); }
  } catch (e) {}
}
metaBoot();                /* серия дней, задания дня, звание */
bindTouch();
try { window.focus(); } catch (e) {}      /* клавиатура — сразу игре, а не странице площадки */
resetAll();
startLevel(0);
setState('title');
msgs.length = 0;
banner.t = 0;
resize();
/* Новичок — сразу в бой, без заставки и штаба: меню на первом заходе
   теряло больше половины игроков. Обучение ведёт прямо в бою. */
if (!SETTINGS.played && !SETTINGS.bestLevel && !runPending()) {
  runTrack = true;
  resetAll();
  startLevel(0);
}
/* первый заход за сутки — сразу показываем штаб с невыданным пайком */
else if (META.ready) openHQ('title');

let last = performance.now();

/* Сторож кадра. Раньше исключение в update/render просто убивало цепочку
   requestAnimationFrame: экран замирал на последнем кадре, а звук
   продолжал играть — игрок видел «зависшую» игру (так выглядел баг с
   патрульным без острова). Теперь цикл переживает ошибку, пишет её в
   консоль один раз и, если ошибки сыпятся, уходит в паузу: игрок может
   выйти в меню, а не сидит перед мёртвым кадром. */
let frameErr = 0, frameErrT = 0, frameErrShown = 0;
function frame(t) {
  let dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }   /* стоп-кадр на мощных попаданиях */
  try {
    update(dt);
    render(dt);
    frameErr = 0;                 /* успешный кадр сбрасывает счётчик ошибок */
  } catch (err) {
    frameErr++;
    if (frameErr === 1 || t - frameErrShown > 4000) {
      frameErrShown = t;
      console.error('[Archipelago] frame error:', err && err.stack || err);
    }
    /* серия ошибок — гасим бой, чтобы не крутить сломанный мир */
    if (frameErr >= 30 && state === 'play') { frameErr = 0; setState('pause'); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
