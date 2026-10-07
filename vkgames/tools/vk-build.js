'use strict';
/* Собирает папку build/ для выкладки на хостинг VK (vk-miniapps-deploy):
   только файлы игры — index.html, css и src. Инструменты не попадают. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'build');

fs.rmSync(out, { recursive: true, force: true });
function copy(rel) {
  const s = path.join(root, rel), d = path.join(out, rel);
  if (fs.statSync(s).isDirectory()) {
    fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(s)) copy(path.join(rel, f));
  } else {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
  }
}
['index.html', 'css', 'src'].forEach(copy);
console.log('build/ готов к выкладке');
