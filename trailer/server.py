"""
Сервер записи роликов.

Раздаёт файлы проекта (как python -m http.server) и принимает готовое
видео от страницы tools/trailer/trailer.html: кадры H.264 закодированы
в браузере через WebCodecs, здесь они только укладываются в контейнер
MP4 (ISO BMFF) — без ffmpeg и сторонних библиотек.

Запуск:  python tools/trailer/server.py 8124
POST /mp4?name=<имя>  тело: [uint32 LE длина JSON][JSON][данные кадров]
   JSON: { w, h, timescale, desc: base64(avcC), samples: [[size, key, dur], ...] }
Готовые файлы: tools/trailer/out/<имя>.mp4
"""
import base64, json, os, struct, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')


def box(kind, *payload):
    data = b''.join(payload)
    return struct.pack('>I', 8 + len(data)) + kind + data


def fbox(kind, ver, flags, *payload):
    return box(kind, struct.pack('>I', (ver << 24) | flags), *payload)


MATRIX = struct.pack('>9I', 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)


def mux_mp4(w, h, timescale, samples, data, avcc):
    """samples: [(size, key, dur)], data: сэмплы подряд (AVCC, длина+NAL)."""
    dur = sum(s[2] for s in samples)
    ftyp = box(b'ftyp', b'isom', struct.pack('>I', 512), b'isomiso2avc1mp41')

    def moov(offset):
        mvhd = fbox(b'mvhd', 0, 0, struct.pack('>IIII', 0, 0, timescale, dur),
                    struct.pack('>IH', 0x00010000, 0x0100), b'\0' * 10, MATRIX, b'\0' * 24,
                    struct.pack('>I', 2))
        tkhd = fbox(b'tkhd', 0, 3, struct.pack('>IIIII', 0, 0, 1, 0, dur), b'\0' * 8,
                    struct.pack('>hhhH', 0, 0, 0, 0), MATRIX, struct.pack('>II', w << 16, h << 16))
        mdhd = fbox(b'mdhd', 0, 0, struct.pack('>IIII', 0, 0, timescale, dur), struct.pack('>HH', 0x55C4, 0))
        hdlr = fbox(b'hdlr', 0, 0, struct.pack('>I', 0), b'vide', b'\0' * 12, b'VideoHandler\0')
        vmhd = fbox(b'vmhd', 0, 1, b'\0' * 8)
        dinf = box(b'dinf', fbox(b'dref', 0, 0, struct.pack('>I', 1), fbox(b'url ', 0, 1)))
        avc1 = box(b'avc1', b'\0' * 6, struct.pack('>H', 1), b'\0' * 16, struct.pack('>HH', w, h),
                   struct.pack('>II', 0x00480000, 0x00480000), struct.pack('>I', 0), struct.pack('>H', 1),
                   b'\0' * 32, struct.pack('>Hh', 0x0018, -1), box(b'avcC', avcc))
        stsd = fbox(b'stsd', 0, 0, struct.pack('>I', 1), avc1)
        runs = []                                   # stts: подряд одинаковые длительности
        for s in samples:
            if runs and runs[-1][1] == s[2]: runs[-1][0] += 1
            else: runs.append([1, s[2]])
        stts = fbox(b'stts', 0, 0, struct.pack('>I', len(runs)), b''.join(struct.pack('>II', *r) for r in runs))
        keys = [i + 1 for i, s in enumerate(samples) if s[1]]
        stss = fbox(b'stss', 0, 0, struct.pack('>I', len(keys)), b''.join(struct.pack('>I', k) for k in keys))
        stsc = fbox(b'stsc', 0, 0, struct.pack('>I', 1), struct.pack('>III', 1, len(samples), 1))
        stsz = fbox(b'stsz', 0, 0, struct.pack('>II', 0, len(samples)), b''.join(struct.pack('>I', s[0]) for s in samples))
        stco = fbox(b'stco', 0, 0, struct.pack('>II', 1, offset))
        stbl = box(b'stbl', stsd, stts, stss, stsc, stsz, stco)
        minf = box(b'minf', vmhd, dinf, stbl)
        mdia = box(b'mdia', mdhd, hdlr, minf)
        trak = box(b'trak', tkhd, mdia)
        return box(b'moov', mvhd, trak)

    # moov перед mdat («faststart»): сначала узнаём его размер, потом ставим смещение
    m = moov(0)
    offset = len(ftyp) + len(m) + 8
    m = moov(offset)
    return ftyp + m + struct.pack('>I', 8 + len(data)) + b'mdat' + data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.command == 'POST':
            super().log_message(fmt, *args)

    def do_POST(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n)
        try:
            if url.path == '/mp4':
                name = ''.join(ch for ch in q.get('name', ['video'])[0] if ch.isalnum() or ch in '-_')
                jl = struct.unpack('<I', body[:4])[0]
                meta = json.loads(body[4:4 + jl].decode('utf-8'))
                data = body[4 + jl:]
                samples = [tuple(s) for s in meta['samples']]
                assert sum(s[0] for s in samples) == len(data), 'размеры кадров не сходятся'
                mp4 = mux_mp4(meta['w'], meta['h'], meta['timescale'], samples, data,
                              base64.b64decode(meta['desc']))
                os.makedirs(OUT, exist_ok=True)
                path = os.path.join(OUT, name + '.mp4')
                with open(path, 'wb') as f: f.write(mp4)
                msg = {'ok': True, 'path': path, 'bytes': len(mp4), 'frames': len(samples)}
            elif url.path == '/png':
                # отдельный кадр для проверки композиции
                name = ''.join(ch for ch in q.get('name', ['frame'])[0] if ch.isalnum() or ch in '-_')
                os.makedirs(OUT, exist_ok=True)
                path = os.path.join(OUT, name + '.png')
                with open(path, 'wb') as f: f.write(body)
                msg = {'ok': True, 'path': path}
            else:
                self.send_error(404); return
        except Exception as e:
            msg = {'ok': False, 'error': repr(e)}
        out = json.dumps(msg).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    print('trailer server on', port, 'root', ROOT)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
