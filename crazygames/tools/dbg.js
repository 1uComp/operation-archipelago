const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('tools/smoke.js', 'utf8');
// грузим песочницу из smoke, но без проверок: копируем до строки "const assert"
const head = src.split('const assert')[0];
const mod = { exports: {} };
const fn = new Function('require', '__dirname', 'process', head + '\nreturn { sandbox, vm };');
const out = fn(require, __dirname, process);
const s = out.sandbox;
const r = vm.runInContext('JSON.stringify({ typeofTxt: typeof txt, isFn: typeof txt === "function", desc: Object.getOwnPropertyDescriptor(globalThis,"txt") ? [Object.getOwnPropertyDescriptor(globalThis,"txt").writable, Object.getOwnPropertyDescriptor(globalThis,"txt").configurable, Object.getOwnPropertyDescriptor(globalThis,"txt").enumerable, typeof Object.getOwnPropertyDescriptor(globalThis,"txt").value].join("|") : "none", sameWindow: window === globalThis })', s);
console.log(r);