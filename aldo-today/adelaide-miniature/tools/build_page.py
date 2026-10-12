#!/usr/bin/env python3
"""Put the CBD board together: src/page.html with the slot, build/data.js, src/engine.js and src/boot.js inlined,
written to dist/adelaide/adelaide/miniature/index.html (upload it to that path on aldo.today).

    python3 tools/build_page.py [--data build/data.js] [--out dist/adelaide/adelaide/miniature/index.html]
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLOT = {'mode': 'public', 'suburb': 'Adelaide', 'agent': None,
        'links': {'ask': '/adelaide/adelaide#ask', 'price': '/adelaide/adelaide', 'advertise': '/advertise'},
        'poster': '/mini/adelaide.jpg', 'beacon': '/adelaide/adelaide/miniature/seen'}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', default=os.path.join(HERE, 'build', 'data.js'))
    ap.add_argument('--out', default=os.path.join(HERE, 'dist', 'adelaide', 'adelaide', 'miniature', 'index.html'))
    a = ap.parse_args()
    src = lambda n: open(os.path.join(HERE, 'src', n), encoding='utf-8').read()
    page = src('page.html')
    for k, v in (('{{SLOT}}', json.dumps(SLOT, separators=(',', ':'))), ('{{DATA}}', open(a.data, encoding='utf-8').read().strip()),
                 ('{{ENGINE}}', src('engine.js').strip()), ('{{BOOT}}', src('boot.js').strip())):
        assert page.count(k) == 1, k
        assert '</script' not in v.lower(), 'a script part would close its own tag: ' + k
        page = page.replace(k, v)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    open(a.out, 'w', encoding='utf-8').write(page)
    print('wrote %s (%.0f KB)' % (a.out, os.path.getsize(a.out) / 1024))


if __name__ == '__main__':
    main()
