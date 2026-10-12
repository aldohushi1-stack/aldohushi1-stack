#!/usr/bin/env python3
"""The CBD miniature for the 3D skyline (v3.43): every building in Adelaide 5000, from OpenStreetMap,
in the flat map's own units, written to assets/cbd-3d.json. map3d.js stands them on the city's roof.

    python3 tools/build_cbd.py                       # fetch from Overpass, read the CBD outline from aldo.today
    python3 tools/build_cbd.py --osm cbd.json --page index.html --out assets/cbd-3d.json

Standard library only. Heights stay in real metres in the file; map3d.js scales them (CBD_VX).

Projection: the flat map is plain lon/lat, x = 1604.8242·lon − 222141.2537 and z = −1962.4464·lat − 67845.4553
(≈ 56.7 m a unit both ways). Fitted to the OSM outlines of Adelaide, North Adelaide, Glenelg, Semaphore,
Port Adelaide, Elizabeth, Stirling and Aldinga Beach: every edge within a unit, the CBD's within 0.6.
If the map build has its own constants, use those instead.
"""
import argparse
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request

AX, BX = 1604.8242, -222141.2537
AZ, BZ = -1962.4464, -67845.4553
M_PER_UNIT = 56.7
Q = 0.01                 # stored coordinates are hundredths of a map unit (≈ 0.57 m)
SIMPLIFY = 0.012         # Douglas-Peucker tolerance, map units (≈ 0.7 m): corners stay square
MIN_AREA_M2 = 12         # sheds and bin stores go
LEVEL_M = 3.4
CBD_REL = 3114051        # OSM relation: Adelaide (the suburb, 5000)
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
           'https://overpass.kumi.systems/api/interpreter']
QUERY = """[out:json][timeout:180];
area(%d)->.cbd;
(way["building"](area.cbd); rel["type"="multipolygon"]["building"](area.cbd);
 way["building:part"](area.cbd); rel["type"="multipolygon"]["building:part"](area.cbd););
out geom;""" % (3600000000 + CBD_REL)
# no levels and no height: what a building of that kind usually is
DEFAULT_LEVELS = {'house': 1, 'detached': 1, 'semidetached_house': 1, 'terrace': 2, 'garage': 1, 'garages': 1,
                  'carport': 0.8, 'shed': 0.8, 'roof': 1.2, 'kiosk': 1, 'toilets': 1, 'hut': 1, 'service': 1,
                  'church': 4, 'cathedral': 8, 'parking': 4}


def log(*a):
    print(*a, file=sys.stderr)


def fetch(url, data=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': 'aldo.today build_cbd.py'})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 — a mirror being down is normal, try the next
            log('  %s: %s' % (url.split('/')[2], e))
            time.sleep(4 * (i + 1))
    return None


def overpass():
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    for m in MIRRORS:
        raw = fetch(m, body, tries=1)
        if raw and raw.lstrip()[:1] == b'{':
            return json.loads(raw)
    sys.exit('Overpass: every mirror failed; try again later or pass --osm')


# ---------------------------------------------------------------- geometry
def proj(lon, lat):
    return (AX * lon + BX, AZ * lat + BZ)


def area(r):
    s = 0.0
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        s += a[0] * b[1] - b[0] * a[1]
    return s / 2


def inside(p, r):
    c = False
    j = len(r) - 1
    for i in range(len(r)):
        if (r[i][1] > p[1]) != (r[j][1] > p[1]) and p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]:
            c = not c
        j = i
    return c


def centroid(r):
    a = area(r)
    if abs(a) < 1e-12:
        return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    cx = cz = 0.0
    for i in range(len(r)):
        p, q = r[i], r[(i + 1) % len(r)]
        f = p[0] * q[1] - q[0] * p[1]
        cx += (p[0] + q[0]) * f
        cz += (p[1] + q[1]) * f
    return (cx / (6 * a), cz / (6 * a))


def seg_dist(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    i, dmax = 0, 0
    for k in range(1, len(pts) - 1):
        d = seg_dist(pts[k], pts[0], pts[-1])
        if d > dmax:
            i, dmax = k, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol)


def simplify_ring(r, tol):
    if len(r) < 4:
        return r
    far = max(range(len(r)), key=lambda k: (r[k][0] - r[0][0]) ** 2 + (r[k][1] - r[0][1]) ** 2)
    a = dp(r[:far + 1], tol)
    b = dp(r[far:] + [r[0]], tol)
    return a[:-1] + b[:-1]


def clean(r):
    """quantise, drop repeats, closing points and straight-through points"""
    q = []
    for x, z in r:
        p = (round(x / Q), round(z / Q))
        if not q or q[-1] != p:
            q.append(p)
    while len(q) > 1 and q[0] == q[-1]:
        q.pop()
    changed = True
    while changed and len(q) >= 3:
        changed = False
        for i in range(len(q)):
            a, b, c = q[i - 1], q[i], q[(i + 1) % len(q)]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) == 0:
                q.pop(i)
                changed = True
                break
    return q


def join(ways):
    """multipolygon member ways → closed rings"""
    rings, open_ = [], [list(w) for w in ways if len(w) >= 2]
    while open_:
        cur = open_.pop(0)
        while cur[0] != cur[-1]:
            for k, w in enumerate(open_):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w[:-1] + cur
                elif w[0] == cur[0]:
                    cur = w[::-1][:-1] + cur
                else:
                    continue
                open_.pop(k)
                break
            else:
                break       # can't close it: drop
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur[:-1])
    return rings


def shapes(el):
    """an OSM element → [outer, holes...] in map units, or None"""
    if el['type'] == 'way':
        g = [(p['lon'], p['lat']) for p in el.get('geometry') or []]
        if len(g) < 4 or g[0] != g[-1]:
            return None
        return [[proj(*p) for p in g[:-1]]], []
    outs = join([[(p['lon'], p['lat']) for p in m.get('geometry') or []] for m in el.get('members', []) if m.get('role') == 'outer'])
    ins = join([[(p['lon'], p['lat']) for p in m.get('geometry') or []] for m in el.get('members', []) if m.get('role') == 'inner'])
    if not outs:
        return None
    return [[proj(*p) for p in r] for r in outs], [[proj(*p) for p in r] for r in ins]


def num(s):
    m = re.match(r'\s*(-?\d+(?:\.\d+)?)', s or '')
    return float(m.group(1)) if m else None


def heights(t, warn):
    h, lv = num(t.get('height') or t.get('building:height')), num(t.get('building:levels'))
    mh, ml = num(t.get('min_height')), num(t.get('building:min_level'))
    kind = t.get('building') or t.get('building:part') or 'yes'
    if h and lv and lv < 5 and h > lv * 8 + 12:          # "height=91, levels=2": one of them is wrong; the levels are the safer bet
        warn.append('%s: height %g but %g levels, using levels' % (t.get('name') or kind, h, lv))
        h = None
    if not h:
        lv = lv if lv is not None else DEFAULT_LEVELS.get(kind, 2)
        h = max(lv, 0.8) * LEVEL_M + (t.get('roof:shape', 'flat') not in ('flat', '') and 1.5 or 0)
    base = mh if mh is not None else (ml * LEVEL_M if ml else 0)
    if base >= h:
        base = 0
    return h, base


def cbd_outline(page):
    if re.match(r'https?://', page):
        html = fetch(page).decode('utf-8')
    else:
        html = open(page, encoding='utf-8').read()
    m = re.search(r'<path class="[^"]*" d="([^"]+)" data-s="adelaide"', html) or re.search(r'd="([^"]+)" data-s="adelaide"', html)
    if not m:
        sys.exit('no data-s="adelaide" path in %s' % page)
    rings = []
    for part in re.findall(r'M[^M]+', m.group(1)):
        pts = [(float(a), float(b)) for a, b in re.findall(r'(-?[\d.]+),(-?[\d.]+)', part)]
        if len(pts) >= 3:
            rings.append(pts)
    return rings


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--osm', help='a saved Overpass JSON answer (skips the fetch)')
    ap.add_argument('--page', default='https://aldo.today/', help='a built homepage (file or URL) with the flat map')
    ap.add_argument('--out', default='assets/cbd-3d.json')
    a = ap.parse_args()

    raw = json.load(open(a.osm)) if a.osm else overpass()
    plate = cbd_outline(a.page)
    on_plate = lambda p: any(inside(p, r) for r in plate)
    els = [e for e in raw['elements'] if e['type'] in ('way', 'relation') and e.get('tags')]
    log('%d OSM elements' % len(els))

    warn, items = [], []
    for e in els:
        t = e['tags']
        is_part = 'building:part' in t and t['building:part'] != 'no'
        is_bldg = 'building' in t and t['building'] not in ('no', 'demolished', 'razed', 'proposed')
        if not (is_part or is_bldg) or e['type'] == 'relation' and t.get('type') != 'multipolygon':
            continue
        s = shapes(e)
        if not s:
            continue
        outs, holes = s
        h, base = heights(t, warn)
        for o in outs:
            if area(o) < 0:
                o.reverse()
            hs = [hh[::-1] if area(hh) > 0 else hh for hh in holes if inside(hh[0], o)]
            items.append({'part': is_part and not is_bldg, 'outer': o, 'holes': hs, 'h': h, 'b': base,
                          'c': centroid(o), 'name': t.get('name') or '', 'id': e['id']})

    # a building drawn as parts (podium, tower…) is drawn by its parts alone
    parts = [i for i in items if i['part']]
    keep = []
    for i in items:
        if i['part']:
            keep.append(i)
            continue
        o = i['outer']
        x0, x1 = min(p[0] for p in o), max(p[0] for p in o)
        z0, z1 = min(p[1] for p in o), max(p[1] for p in o)
        if any(x0 <= p['c'][0] <= x1 and z0 <= p['c'][1] <= z1 and inside(p['c'], o) for p in parts):
            continue
        keep.append(i)
    log('%d shapes, %d after parts replace their outlines' % (len(items), len(keep)))

    out, off, small = [], [], 0
    min_area = MIN_AREA_M2 / M_PER_UNIT ** 2
    for i in keep:
        if abs(area(i['outer'])) < min_area:
            small += 1
            continue
        if not all(on_plate(p) for p in i['outer']):
            off.append(i)
            continue
        rings = []
        for k, r in enumerate([i['outer']] + i['holes']):
            q = clean(simplify_ring(r, SIMPLIFY))
            if len(q) < 3 or (k == 0 and abs(area(q)) * Q * Q < min_area):
                if k == 0:
                    rings = []
                    break
                continue
            rings.append(q)
        if rings:
            out.append((i, rings))
    log('%d buildings on the plate; %d too small; %d off the plate%s' % (
        len(out), small, len(off), (' (named: ' + ', '.join(sorted({o['name'] for o in off if o['name']})) + ')') if off else ''))
    for w in warn:
        log('  height fix: ' + w)

    # origin: the plate's corner, so every stored number is a small positive integer
    ox = math.floor(min(p[0] for r in plate for p in r))
    oz = math.floor(min(p[1] for r in plate for p in r))
    oq = (round(ox / Q), round(oz / Q))
    out.sort(key=lambda t: (t[0]['c'][1], t[0]['c'][0]))
    B = []
    for i, rings in out:
        row = [round(i['h'] * 10), round(i['b'] * 10)]
        for r in rings:
            flat, px, pz = [], oq[0], oq[1]
            for x, z in r:               # first point from the origin, the rest as steps
                flat += [x - px, z - pz]
                px, pz = x, z
            row.append(flat)
        B.append(row)
    tall = sorted(out, key=lambda t: -t[0]['h'])[:8]
    log('tallest: ' + ', '.join('%s %.0fm' % (t[0]['name'] or 'way %d' % t[0]['id'], t[0]['h']) for t in tall))

    doc = {'v': 1, 'src': '© OpenStreetMap contributors, ODbL', 'osm': raw.get('osm3s', {}).get('timestamp_osm_base', ''),
           'm': M_PER_UNIT, 'q': Q, 'o': [ox, oz], 'b': B}
    with open(a.out, 'w') as f:
        json.dump(doc, f, separators=(',', ':'))
    log('wrote %s: %d buildings, %.0f KB' % (a.out, len(B), len(json.dumps(doc, separators=(',', ':'))) / 1024))


if __name__ == '__main__':
    main()
