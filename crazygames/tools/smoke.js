'use strict';
/* smoke.js — загрузочный smoke-тест бандла без браузера.
 * Подменяет DOM/Canvas/WebAudio заглушками и выполняет dist/game.js:
 * проверяет, что игра стартует (fresh user -> сразу бой, уровень 0,
 * игрок и враги созданы, рядом с новичком есть слабый катер).
 * Запуск: node tools/smoke.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'game.js'), 'utf8');

function makeCtx2d() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 8 });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (p === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'getChannelData') return () => new Float32Array(8);
      if (p === 'createLinearGradient' || p === 'createRadialGradient')
        return () => ({ addColorStop() {} });
      if (p === 'createPattern') return () => ({});
      if (p === 'canvas') return {};
      return (...a) => {};
    },
    set() { return true; }
  });
}
function makeCanvas() {
  return {
    width: 300, height: 150, style: {},
    getContext: () => makeCtx2d(),
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 150 })
  };
}
const store = {};
/* Стандартные объекты (Math/Object/Array/JSON) НЕ подменяем: у контекста
   vm свои интpинсики, подмена ломает defineProperty по глобалу. */
/* window НЕ подменяем на объект песочницы: иначе Object.defineProperty(window,…)
   в игре (hud.js защищает txt от чужих скриптов) создаёт на нём свойство
   txt=undefined, и все функции-хелперы перестают быть видны. Настоящий
   глобал контекста ставим window уже после createContext. */
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  innerWidth: 1920, innerHeight: 1080,
  navigator: { language: 'ru-RU', hardwareConcurrency: 8 },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  matchMedia: () => ({ matches: false }),
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame(cb) { rafs.push(cb); return rafs.length; },
  document: {
    hidden: false,
    getElementById: () => makeCanvas(),
    createElement: () => makeCanvas(),
    addEventListener() {},
    body: { classList: { toggle() {} } },
    documentElement: {}
  }
};
/* Настоящие таймеры: нужен setInterval для музыки/области и rAF для кадра */
sandbox.setInterval = setInterval;
sandbox.setTimeout = setTimeout;
sandbox.clearInterval = clearInterval;
sandbox.clearTimeout = clearTimeout;
const rafs = [];
sandbox.requestAnimationFrame = cb => { rafs.push(cb); return rafs.length; };
vm.createContext(sandbox);
/* window = настоящий глобал контекста (см. комментарий выше) */
vm.runInContext('globalThis.window = globalThis;', sandbox);
vm.runInContext(bundle, sandbox, { timeout: 20000 });

const assert = require('assert');
const ctx = () => vm.runInContext('({state, level, playTime, tGlobal, enemies: enemies.length})', sandbox);

/* 1. Новичок попадает в бой, а не в меню */
let c = ctx();
assert.strictEqual(c.state, 'play', 'fresh user must autostart into battle');
assert.ok(c.enemies >= 4, 'level0 enemies (3 far + 1 close), got ' + c.enemies);
const near = vm.runInContext('enemies.filter(e => Math.hypot(e.x - player.x, e.y - player.y) < 360).length', sandbox);
assert.ok(near >= 1, 'close patrol for instant action');
console.log('boot: state=%s level=%d enemies=%d near=%d', c.state, c.level, c.enemies, near);

/* 2. Кадры реально идут: 120 кадров боя. Раньше тест крутил только загрузку
      и пропустил падение в updEnemies — цикл умирал, звук продолжал играть. */
const errors = [];
const realErr = console.error;
console.error = (...a) => { errors.push(a.join(' ')); realErr(...a); };
let t = Date.now();
for (let i = 0; i < 120; i++) {
  const cbs = rafs.splice(0, rafs.length);
  assert.ok(cbs.length > 0, 'rAF chain died at frame ' + i);
  t += 16.7;
  for (const cb of cbs) cb(t);
}
console.error = realErr;
assert.strictEqual(errors.length, 0, 'frame errors: ' + errors.slice(0, 3).join(' | '));
c = ctx();
assert.ok(c.tGlobal > 0, 'clock must advance');
assert.ok(c.playTime > 1, 'playTime must advance in battle, got ' + c.playTime.toFixed(2));
console.log('120 frames: tGlobal=%d playTime=%s state=%s', Math.round(c.tGlobal), c.playTime.toFixed(1), c.state);

/* 3. Ближний патрульный держит остров (регрессия, из-за которой игра «висла») */
const noIsl = vm.runInContext('enemies.filter(e => !e.isl && e.state === "patrol").length', sandbox);
assert.strictEqual(noIsl, 0, 'patrol enemies must always have a home island');

console.log('SMOKE PASS');
