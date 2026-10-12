#!/usr/bin/env python3
"""Put a Miniature B board together: src/pages/<suburb>.html with its slot, build/<suburb>.data.js, src/engine.js and
src/boot.js inlined into one page.

    python3 tools/build_page.py adelaide        # → dist/adelaide/adelaide/miniature/index.html
    python3 tools/build_page.py henley-beach    # → dist/adelaide/henley-beach/miniature/index.b.html (the B arm)

A suburb that already has a Miniature A page gets its B page beside it as index.b.html, so the A file is never
overwritten; the server decides who sees which. A suburb with no A page gets index.html.
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAS_A = {'henley-beach'}          # suburbs live in Miniature A: their B page is the test arm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('suburb', nargs='?', default='adelaide')
    ap.add_argument('--out')
    a = ap.parse_args()
    src = lambda *p: open(os.path.join(HERE, 'src', *p), encoding='utf-8').read()
    slot = json.loads(src('pages', a.suburb + '.slot.json'))
    data = open(os.path.join(HERE, 'build', a.suburb + '.data.js'), encoding='utf-8').read().strip()
    out = a.out or os.path.join(HERE, 'dist', 'adelaide', a.suburb, 'miniature', 'index.b.html' if a.suburb in HAS_A else 'index.html')
    page = src('pages', a.suburb + '.html')
    for k, v in (('{{SLOT}}', json.dumps(slot, separators=(',', ':'), ensure_ascii=False)), ('{{DATA}}', data),
                 ('{{ENGINE}}', src('engine.js').strip()), ('{{BOOT}}', src('boot.js').strip())):
        assert page.count(k) == 1, k
        assert '</script' not in v.lower(), 'a script part would close its own tag: ' + k
        page = page.replace(k, v)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(page)
    print('wrote %s (%.0f KB)' % (out, os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
