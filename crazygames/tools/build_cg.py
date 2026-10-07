#!/usr/bin/env python3
"""build_cg.py — сборка CrazyGames-пакета в один JS-файл.

Проблема: index.html грузит ~50 отдельных скриптов с ?v=35. На медленном
интернете это секунды лишней загрузки до первого кадра — CrazyGames прямо
подсказывает (gameplay conversion): "Reduce initial loading size and simplify
flow to start gameplay". Один game.js вместо 50 запросов убирает почти весь
этот налог.

Что делает:
  1. Читает порядок <script src="..."> из index.html (внешний SDK пропускает).
  2. Склеивает файлы в том же порядке в dist/game.js.
  3. Пишет dist/index.html с одним <script src="game.js?v=...">.
  4. Копирует css/ и пакует CG-dist.zip (index.html в корне — так ждёт площадка).

Запуск:  python3 tools/build_cg.py [36]
Аргумент — номер версии для ?v= (кэш-бастинг). По умолчанию 36.

Проверки после сборки — руками:
  node --check dist/game.js
"""
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER = sys.argv[1] if len(sys.argv) > 1 else "36"
DIST = os.path.join(ROOT, "dist")


def main():
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()
    srcs = re.findall(r'<script\s+src="([^"]+)"', html)
    local = [s.split("?")[0] for s in srcs if not s.startswith("http")]
    print("scripts: %d local" % len(local))

    os.makedirs(os.path.join(DIST, "css"), exist_ok=True)
    parts = []
    for s in local:
        p = os.path.join(ROOT, s.replace("/", os.sep))
        with open(p, encoding="utf-8") as f:
            code = f.read()
        # защита от склейки без точки с запятой + пометка источника для отладки
        parts.append("\n/* ===== %s ===== */\n;\n%s" % (s, code.rstrip()))
    bundle = "'use strict';\n/* Operation Archipelago CG bundle v%s (%d files) */\n" % (VER, len(local))
    bundle += "\n".join(parts) + "\n"
    with open(os.path.join(DIST, "game.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(bundle)

    # index.html: все локальные скрипты -> один, внешний SDK не трогаем
    lines = []
    inserted = False
    for line in html.splitlines():
        m = re.match(r'\s*<script\s+src="([^"]+)".*', line)
        if m and not m.group(1).startswith("http"):
            if not inserted:
                lines.append('<script src="game.js?v=%s"></script>' % VER)
                inserted = True
            continue
        lines.append(line)
    with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    shutil.copyfile(os.path.join(ROOT, "css", "style.css"),
                    os.path.join(DIST, "css", "style.css"))

    zpath = os.path.join(ROOT, "CG-dist.zip")
    if os.path.exists(zpath):
        os.remove(zpath)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(os.path.join(DIST, "index.html"), "index.html")
        z.write(os.path.join(DIST, "game.js"), "game.js")
        z.write(os.path.join(DIST, "css", "style.css"), "css/style.css")

    gz = os.path.getsize(os.path.join(DIST, "game.js"))
    print("dist/game.js: %.1f KB" % (gz / 1024))
    print("CG-dist.zip: %.1f KB" % (os.path.getsize(zpath) / 1024))
    print("OK — заливай на площадку CG-dist.zip")


if __name__ == "__main__":
    main()
