#!/usr/bin/env python3
"""Adelaide (5000) in miniature: the board's map data and plan, from OpenStreetMap.

    python3 tools/extract_cbd.py                      # fetch (cached in .osm-cache/), write build/adelaide.data.js
    python3 tools/extract_cbd.py --cache DIR --out build/adelaide.data.js

Writes the D_* constants and PLAN that the bait page reads (format 2), plus three the CBD board adds:
  D_FOOT   real footprints: "H B k[r] x,z dx,dz …[/x,z dx,dz …]" joined by ";" — wall height and base in metres,
           kind (g glass tower, o office, a apartments/hotel, h heritage stone, c church, u institution, m shops,
           s house, p car park, x shed, z stadium), roof (h hipped, g gabled, d dome; flat if none);
           first point in metres from the origin, the rest as steps
  D_TREES  every mapped tree, tree row and wood, as "x,z x,z …"
  D_ROADS  as format 2 but the code carries the road's width: "p22 x,z …" (upper case: one way)
Metres from the middle of the suburb; x = east, z = south. Standard library only.
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

REL = 3114051                    # Adelaide (the suburb, 5000)
MARGIN = 110                     # tray beyond the suburb's outline, metres
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
           'https://overpass.kumi.systems/api/interpreter']
LEVEL = 3.4


def log(*a):
    print(*a, file=sys.stderr)


# ---------------------------------------------------------------- fetching
def overpass(q, cache, name):
    path = os.path.join(cache, name + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    body = urllib.parse.urlencode({'data': q}).encode()
    for attempt in range(2):
        for m in MIRRORS:
            try:
                req = urllib.request.Request(m, data=body, headers={'User-Agent': 'aldo.today extract_cbd.py'})
                raw = urllib.request.urlopen(req, timeout=400).read()
                if raw.lstrip()[:1] == b'{':
                    os.makedirs(cache, exist_ok=True)
                    open(path, 'wb').write(raw)
                    return json.loads(raw)
            except Exception as e:  # noqa: BLE001 — a busy mirror is normal; try the next
                log('  %s: %s' % (m.split('/')[2], e))
        time.sleep(15)
    sys.exit('Overpass: every mirror failed for %s' % name)


# ---------------------------------------------------------------- geometry
class Proj:
    def __init__(self, lat0, lon0):
        p = math.radians(lat0)
        self.lat0, self.lon0 = lat0, lon0
        self.mz = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
        self.mx = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)

    def __call__(self, lon, lat):
        return ((lon - self.lon0) * self.mx, -(lat - self.lat0) * self.mz)


def area(r):
    s = 0.0
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        s += a[0] * b[1] - b[0] * a[1]
    return s / 2


def centroid(r):
    a = area(r)
    if abs(a) < 1e-9:
        return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    cx = cz = 0.0
    for i in range(len(r)):
        p, q = r[i], r[(i + 1) % len(r)]
        f = p[0] * q[1] - q[0] * p[1]
        cx += (p[0] + q[0]) * f
        cz += (p[1] + q[1]) * f
    return (cx / (6 * a), cz / (6 * a))


def inside(p, r):
    c, j = False, len(r) - 1
    for i in range(len(r)):
        if (r[i][1] > p[1]) != (r[j][1] > p[1]) and p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]:
            c = not c
        j = i
    return c


def seg_dist(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)


def dist_line(p, line):
    return min(seg_dist(p, line[i], line[i + 1]) for i in range(len(line) - 1)) if len(line) > 1 else math.hypot(p[0] - line[0][0], p[1] - line[0][1])


def length(line):
    return sum(math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]) for i in range(len(line) - 1))


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
    return dp(r[:far + 1], tol)[:-1] + dp(r[far:] + [r[0]], tol)[:-1]


def qring(r, q=1.0):
    """round to q metres; drop repeats and straight-through points"""
    out = []
    for x, z in r:
        p = (round(x / q) * q, round(z / q) * q)
        if not out or out[-1] != p:
            out.append(p)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    changed = True
    while changed and len(out) >= 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            if abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9:
                out.pop(i)
                changed = True
                break
    return out


def clip_poly(r, box):
    """Sutherland–Hodgman against the tray"""
    X0, X1, Z0, Z1 = box
    for edge in range(4):
        if not r:
            return r
        inp, r = r, []
        def ins(p):
            return [p[0] >= X0, p[0] <= X1, p[1] >= Z0, p[1] <= Z1][edge]
        def cut(a, b):
            if edge < 2:
                xe = X0 if edge == 0 else X1
                t = (xe - a[0]) / (b[0] - a[0])
                return (xe, a[1] + t * (b[1] - a[1]))
            ze = Z0 if edge == 2 else Z1
            t = (ze - a[1]) / (b[1] - a[1])
            return (a[0] + t * (b[0] - a[0]), ze)
        for i in range(len(inp)):
            a, b = inp[i - 1], inp[i]
            if ins(b):
                if not ins(a):
                    r.append(cut(a, b))
                r.append(b)
            elif ins(a):
                r.append(cut(a, b))
    return r


def clip_line(pts, box):
    """Liang–Barsky: the pieces of a polyline on the tray"""
    X0, X1, Z0, Z1 = box
    out, cur = [], []
    for i in range(len(pts) - 1):
        p, q = pts[i], pts[i + 1]
        t0, t1, dx, dz, ok = 0.0, 1.0, q[0] - p[0], q[1] - p[1], True
        for pp, qq in ((-dx, p[0] - X0), (dx, X1 - p[0]), (-dz, p[1] - Z0), (dz, Z1 - p[1])):
            if pp == 0:
                if qq < 0:
                    ok = False
            else:
                rr = qq / pp
                if pp < 0:
                    if rr > t1:
                        ok = False
                    elif rr > t0:
                        t0 = rr
                else:
                    if rr < t0:
                        ok = False
                    elif rr < t1:
                        t1 = rr
        if not ok:
            if len(cur) > 1:
                out.append(cur)
            cur = []
            continue
        a, b = (p[0] + t0 * dx, p[1] + t0 * dz), (p[0] + t1 * dx, p[1] + t1 * dz)
        if not cur:
            cur.append(a)
        cur.append(b)
        if t1 < 1:
            out.append(cur)
            cur = []
    if len(cur) > 1:
        out.append(cur)
    return out


def join(ways):
    """member ways → closed rings"""
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
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur[:-1])
    return rings


def stitch(lines, tol=1.0):
    lines = [list(l) for l in lines]
    out = []
    near = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1]) < tol
    while lines:
        cur, grew = lines.pop(0), True
        while grew:
            grew = False
            for i, s in enumerate(lines):
                if near(s[0], cur[-1]):
                    cur += s[1:]
                elif near(s[-1], cur[0]):
                    cur = s[:-1] + cur
                elif near(s[-1], cur[-1]):
                    cur += s[::-1][1:]
                elif near(s[0], cur[0]):
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                lines.pop(i)
                grew = True
                break
        out.append(cur)
    return out


def obb(r):
    """minimum-area rectangle of a ring: centre, long side, short side, angle of the long side"""
    best = None
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        c, s = math.cos(ang), math.sin(ang)
        us = [p[0] * c + p[1] * s for p in r]
        vs = [-p[0] * s + p[1] * c for p in r]
        A = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or A < best[0]:
            best = (A, ang, min(us), max(us), min(vs), max(vs))
    _, ang, u0, u1, v0, v1 = best
    c, s = math.cos(ang), math.sin(ang)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    w, d = u1 - u0, v1 - v0
    if d > w:
        w, d, ang = d, w, ang + math.pi / 2
    return (uc * c - vc * s, uc * s + vc * c, w, d, ang)


def num(s):
    m = re.match(r'\s*(-?\d+(?:\.\d+)?)', s or '')
    return float(m.group(1)) if m else None


def geom_of(el, P):
    """an OSM way or multipolygon → ([outer rings], [inner rings]) in metres"""
    if el['type'] == 'way':
        g = [(p['lon'], p['lat']) for p in el.get('geometry') or [] if p]
        if len(g) < 4 or g[0] != g[-1]:
            return None
        return [[P(*p) for p in g[:-1]]], []
    mem = el.get('members', [])
    outs = join([[(p['lon'], p['lat']) for p in m.get('geometry') or [] if p] for m in mem if m.get('role') == 'outer'])
    ins = join([[(p['lon'], p['lat']) for p in m.get('geometry') or [] if p] for m in mem if m.get('role') == 'inner'])
    if not outs:
        return None
    return [[P(*p) for p in r] for r in outs], [[P(*p) for p in r] for r in ins]


def line_of(el, P):
    return [P(p['lon'], p['lat']) for p in el.get('geometry') or [] if p]


def pts_str(pts, nd=0):
    f = (lambda v: str(int(round(v)))) if nd == 0 else (lambda v: ('%.*f' % (nd, v)).rstrip('0').rstrip('.'))
    return ' '.join('%s,%s' % (f(x), f(z)) for x, z in pts)


# ---------------------------------------------------------------- buildings
HERITAGE_NAMES = re.compile(r'church|cathedral|chapel|town hall|post office|parliament house|museum|art gallery|state library|'
                            r'mitchell building|bonython hall|elder hall|ayers house|edmund wright|treasury|government house|'
                            r'gaol|institute|exhibition|conservatorium|barracks|bank of|stock exchange|old ', re.I)
SMALL = {'garage', 'garages', 'carport', 'shed', 'roof', 'hut', 'kiosk', 'toilets', 'service', 'bunker', 'greenhouse',
         'shelter', 'cabin', 'gatehouse', 'transformer_tower'}
HOUSE = {'house', 'detached', 'semidetached_house', 'terrace', 'bungalow'}
INST = {'university', 'college', 'school', 'hospital', 'government', 'public', 'civic', 'museum', 'train_station',
        'transportation', 'library', 'kindergarten', 'fire_station', 'police'}


def stable(i):
    return int(hashlib.md5(str(i).encode()).hexdigest()[:8], 16)


def heights(t, warn):
    h, lv = num(t.get('height') or t.get('building:height')), num(t.get('building:levels'))
    mh, ml = num(t.get('min_height')), num(t.get('building:min_level'))
    b = t.get('building') or t.get('building:part') or 'yes'
    if h and lv and lv < 5 and h > lv * 8 + 12:
        warn.append('%s: height %g but %g levels, using levels' % (t.get('name') or b, h, lv))
        h = None
    if h and t.get('roof:height') and t.get('roof:shape') not in (None, 'flat'):
        h = max(1.0, h - (num(t.get('roof:height')) or 0))
    if not h:
        if lv is None:
            lv = {'house': 1, 'detached': 1, 'semidetached_house': 1, 'bungalow': 1, 'terrace': 2, 'church': 3,
                  'cathedral': 5, 'chapel': 2, 'parking': 4}.get(b, 0.8 if b in SMALL else 2)
        h = max(lv, 0.75) * LEVEL
    base = mh if mh is not None else (ml * LEVEL if ml else 0)
    if base >= h:
        base = 0
    return h, base, lv


def kind_of(t, h, lv, a, oid):
    b = t.get('building') or t.get('building:part') or 'yes'
    name = t.get('name') or ''
    year = num(t.get('start_date'))
    if b in ('church', 'cathedral', 'chapel') or t.get('amenity') == 'place_of_worship':
        return 'c'
    if b in SMALL:
        return 'x'
    if b == 'parking' or t.get('amenity') == 'parking' or t.get('parking') == 'multi-storey':
        return 'p'
    if b in ('stadium', 'grandstand') or t.get('leisure') == 'stadium':
        return 'z'
    if t.get('historic') or t.get('heritage') or (year and year < 1935) or t.get('building:material') == 'stone' or (name and HERITAGE_NAMES.search(name)):
        return 'h' if h < 45 else 'o'
    if b in HOUSE:
        return 's' if h < 9 else 'a'
    if b == 'yes' and a < 260 and h <= 7.5:
        return 's'
    if b in INST:
        return 'u' if h < 32 else 'o'
    if b in ('apartments', 'residential', 'hotel', 'dormitory'):
        return 'a' if h >= 9 else 's'
    k = stable(oid) % 10
    if h >= 40:
        return 'g' if k < 7 else 'o'
    if h >= 18:
        return 'o' if k < 5 else ('g' if h >= 28 and k < 8 else 'a')
    if b in ('industrial', 'warehouse'):
        return 'm'
    return 'm' if h <= 13 else 'o'


def roof_of(t, k, h, a):
    rs = t.get('roof:shape')
    if rs in ('gabled', 'pitched', 'saltbox'):
        return 'g'
    if rs in ('hipped', 'pyramidal', 'round_hipped', 'half-hipped', 'gambrel', 'mansard'):
        return 'h'
    if rs in ('dome', 'onion'):
        return 'd'
    if rs in ('flat', 'skillion', 'many'):
        return ''
    if k == 's':
        return 'h'
    if k == 'c':
        return 'g' if a < 1400 else ''
    if k == 'h' and h <= 11 and a < 700:
        return 'h'
    return ''


def buildings(raw, P, box, warn):
    items = []
    for e in raw:
        t = e.get('tags') or {}
        is_part = 'building:part' in t and t['building:part'] != 'no'
        is_b = 'building' in t and t['building'] not in ('no', 'demolished', 'razed', 'proposed', 'construction')
        if not (is_part or is_b) or (e['type'] == 'relation' and t.get('type') != 'multipolygon'):
            continue
        g = geom_of(e, P)
        if not g:
            continue
        outs, holes = g
        h, base, lv = heights(t, warn)
        for o in outs:
            if area(o) < 0:
                o.reverse()
            hs = [hh[::-1] if area(hh) > 0 else hh for hh in holes if inside(hh[0], o)]
            items.append({'part': is_part and not is_b, 'o': o, 'holes': hs, 'h': h, 'b': base, 'lv': lv, 't': t,
                          'c': centroid(o), 'id': e['id']})
    parts = [i for i in items if i['part']]
    keep = []
    for i in items:
        if not i['part']:
            o = i['o']
            x0, x1 = min(p[0] for p in o), max(p[0] for p in o)
            z0, z1 = min(p[1] for p in o), max(p[1] for p in o)
            if any(x0 <= p['c'][0] <= x1 and z0 <= p['c'][1] <= z1 and inside(p['c'], o) for p in parts):
                continue
        keep.append(i)
    X0, X1, Z0, Z1 = box
    out = []
    for i in keep:
        a = abs(area(i['o']))
        if a < 10:
            continue
        if any(not (X0 + 2 <= p[0] <= X1 - 2 and Z0 + 2 <= p[1] <= Z1 - 2) for p in i['o']):
            continue
        rings = []
        for j, r in enumerate([i['o']] + i['holes']):
            q = qring(simplify_ring(r, 0.6))
            if len(q) < 3 or abs(area(q)) < (10 if j == 0 else 4):
                if j == 0:
                    break
                continue
            if (area(q) > 0) != (j == 0):
                q.reverse()
            rings.append(q)
        if not rings:
            continue
        k = kind_of(i['t'], i['h'], i['lv'], a, i['id'])
        out.append({'rings': rings, 'h': i['h'], 'b': i['b'], 'k': k, 'r': roof_of(i['t'], k, i['h'], a), 'c': i['c'],
                    'name': i['t'].get('name') or '', 'a': a, 'id': i['id']})
    out.sort(key=lambda b: (round(b['c'][1] / 200), b['c'][0]))
    return out


def foot_str(bs):
    rows = []
    for b in bs:
        rs = []
        for r in b['rings']:
            px, pz = 0, 0
            s = []
            for k, (x, z) in enumerate(r):
                x, z = int(x), int(z)
                s.append('%d,%d' % ((x, z) if k == 0 else (x - px, z - pz)))
                px, pz = x, z
            rs.append(' '.join(s))
        f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
        rows.append('%s %s %s%s %s' % (f(b['h']), f(b['b']), b['k'], b['r'], ' / '.join(rs)))
    return ';'.join(rows)


# ---------------------------------------------------------------- roads, areas, water, trees
ROAD = {'motorway': 'p', 'trunk': 'p', 'primary': 'p', 'motorway_link': 'p', 'trunk_link': 'p', 'primary_link': 'p',
        'secondary': 's', 'secondary_link': 's', 'tertiary': 't', 'tertiary_link': 't',
        'residential': 'r', 'unclassified': 'r', 'living_street': 'r', 'road': 'r',
        'service': 'v', 'pedestrian': 'q',
        'footway': 'y', 'path': 'y', 'cycleway': 'y', 'steps': 'y', 'track': 'y', 'bridleway': 'y'}
WIDTH = {'p': (20, 11), 's': (15, 8), 't': (12, 7), 'r': (9, 6), 'v': (4.5, 4), 'q': (10, 10), 'y': (2.6, 2.6)}


def roads(raw, P, box):
    out, names = [], {}
    for e in raw:
        t = e.get('tags') or {}
        hw = t.get('highway')
        c = ROAD.get(hw)
        if not c or e['type'] != 'way':
            continue
        if t.get('area') == 'yes' or t.get('tunnel') in ('yes', 'building_passage') or t.get('covered') == 'yes' or t.get('indoor') == 'yes':
            continue
        if hw == 'footway' and t.get('footway') in ('sidewalk', 'crossing', 'traffic_island'):
            continue
        if hw == 'cycleway' and t.get('cycleway') == 'crossing':
            continue
        if hw == 'service' and t.get('service') in ('parking_aisle', 'driveway', 'drive-through'):
            continue
        if t.get('access') == 'private' and c in ('v', 'y'):
            continue
        oneway = t.get('oneway') in ('yes', '1', '-1') or hw in ('motorway', 'motorway_link')
        w = num(t.get('width'))
        lanes = num(t.get('lanes'))
        if not w or not (2 <= w <= 45):
            w = (lanes * 3.3 + (1.5 if c in 'pst' else 0)) if lanes and c in 'pstr' else WIDTH[c][1 if oneway else 0]
        line = line_of(e, P)
        if t.get('oneway') == '-1':
            line.reverse()
        for piece in clip_line(line, box):
            p = dp(piece, 0.8)
            p = [(round(x), round(z)) for x, z in p]
            p = [q for i, q in enumerate(p) if i == 0 or q != p[i - 1]]
            if len(p) < 2 or length(p) < {'y': 12, 'v': 15}.get(c, 3):
                continue
            out.append({'c': c.upper() if oneway else c, 'w': round(w, 1), 'p': p, 'name': t.get('name') or '', 'hw': hw})
    return out


def roads_str(rs):
    f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
    return '|'.join('%s%s %s' % (r['c'], f(r['w']), pts_str(r['p'])) for r in rs)


AREA = [  # (code, test) in priority order
    ('n', lambda t: t.get('leisure') == 'swimming_pool' and t.get('indoor') != 'yes' and t.get('location') != 'indoor'),
    ('f', lambda t: t.get('leisure') == 'pitch' and t.get('surface') not in ('asphalt', 'concrete', 'acrylic', 'hard', 'paved', 'tartan')),
    ('h', lambda t: t.get('leisure') == 'pitch'),
    ('e', lambda t: t.get('leisure') == 'track'),
    ('q', lambda t: t.get('place') == 'square' or (t.get('highway') == 'pedestrian' and t.get('area') == 'yes') or t.get('leisure') == 'outdoor_seating'),
    ('p', lambda t: t.get('amenity') == 'parking' and t.get('parking', 'surface') in ('surface', 'lane', 'street_side')),
    ('w', lambda t: t.get('natural') == 'wood' or t.get('landuse') == 'forest'),
    ('k', lambda t: t.get('leisure') == 'garden' or t.get('landuse') == 'flowerbed' or t.get('natural') == 'scrub'),
    ('c', lambda t: t.get('landuse') == 'cemetery' or t.get('amenity') == 'grave_yard'),
    ('o', lambda t: t.get('leisure') in ('park', 'common', 'golf_course', 'playground', 'dog_park') or t.get('landuse') in ('grass', 'recreation_ground', 'meadow', 'village_green') or t.get('natural') == 'grassland'),
    ('l', lambda t: t.get('landuse') == 'railway'),
    ('x', lambda t: t.get('landuse') in ('construction', 'brownfield')),
]


def areas(raw, P, box):
    out = []
    for e in raw:
        t = e.get('tags') or {}
        code = next((c for c, f in AREA if f(t)), None)
        if not code:
            continue
        g = geom_of(e, P)
        if not g:
            continue
        for o in g[0]:
            r = clip_poly(o, box)
            if len(r) < 3:
                continue
            r = qring(simplify_ring(r, 0.8))
            if len(r) >= 3 and abs(area(r)) >= (220 if code == 'p' else 30):
                out.append({'c': code, 'p': r, 'name': t.get('name') or '', 'a': abs(area(r))})
    order = 'oclxwkpqfhen'
    out.sort(key=lambda a: (order.index(a['c']), -a['a']))
    return out


def water(raw, P, box):
    lakes = []
    for e in raw:
        t = e.get('tags') or {}
        if not (t.get('natural') == 'water' or t.get('waterway') == 'riverbank' or t.get('landuse') in ('reservoir', 'basin')):
            continue
        if t.get('water') in ('fountain',) or t.get('amenity') == 'fountain':
            continue
        g = geom_of(e, P)
        if not g:
            continue
        outs, holes = g
        for o in outs:
            r = clip_poly(o, box)
            if len(r) < 3:
                continue
            r = qring(simplify_ring(r, 0.8))
            if len(r) < 3 or abs(area(r)) < 40:
                continue
            if area(r) < 0:
                r.reverse()
            hs = []
            for h in holes:
                if inside(h[0], o):
                    hh = qring(simplify_ring(clip_poly(h, box), 0.8))
                    if len(hh) >= 3 and abs(area(hh)) > 20:
                        hs.append(hh)
            lakes.append({'outer': r, 'holes': hs, 'name': t.get('name') or '', 'a': abs(area(r))})
    return lakes


def trees(poi, rest, P, box, rnd):
    X0, X1, Z0, Z1 = box
    pts = []
    for e in poi:
        if e['type'] == 'node' and (e.get('tags') or {}).get('natural') == 'tree':
            pts.append(P(e['lon'], e['lat']))
    rows = 0
    for e in rest:
        t = e.get('tags') or {}
        if t.get('natural') == 'tree_row' and e['type'] == 'way':
            line = line_of(e, P)
            for piece in clip_line(line, box):
                L, s = length(piece), 0.0
                acc = 0.0
                for i in range(len(piece) - 1):
                    a, b = piece[i], piece[i + 1]
                    l = math.hypot(b[0] - a[0], b[1] - a[1])
                    while s <= acc + l:
                        k = (s - acc) / l if l else 0
                        pts.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))
                        rows += 1
                        s += 8.5 + rnd() * 2
                    acc += l
        if t.get('natural') == 'wood' or t.get('landuse') == 'forest':
            g = geom_of(e, P)
            if not g:
                continue
            for o in g[0]:
                xs, zs = [p[0] for p in o], [p[1] for p in o]
                x = min(xs)
                while x < max(xs):
                    z = min(zs)
                    while z < max(zs):
                        q = (x + rnd() * 6, z + rnd() * 6)
                        if inside(q, o):
                            pts.append(q)
                        z += 8
                    x += 8
    pts = [p for p in pts if X0 + 3 < p[0] < X1 - 3 and Z0 + 3 < p[1] < Z1 - 3]
    log('  trees: %d mapped, %d from tree rows' % (len(pts) - rows, rows))
    return pts


def mulberry(seed):
    a = [seed & 0xffffffff]
    def r():
        a[0] = (a[0] + 0x6D2B79F5) & 0xffffffff
        t = a[0]
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xffffffff
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xffffffff) ^ t) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return r


# ---------------------------------------------------------------- the plan
def plan(P, box, bnd, bs, rds, ars, lakes, tree_pts, rest, poi):
    X0, X1, Z0, Z1 = box
    insub = lambda p: inside(p, bnd)
    named = {}
    for r in rds:
        if r['name'] and r['c'].lower() in 'pstrvq':
            named.setdefault(r['name'], []).append(r)

    # the fly-over: up and down King William Street, from the north-north-east (the sun is in the north)
    # (the grid runs from North Terrace to South Terrace; King William Street comes in pieces, so bin it by z)
    kpts = sorted((p for r in named.get('King William Street', []) for p in r['p']), key=lambda p: p[1])
    kx = sorted(p[0] for p in kpts)[len(kpts) // 2] if kpts else 0
    kpts = [p for p in kpts if abs(p[0] - kx) < 200]          # Kent Town has a King William Street too
    def tz(name, default):
        q = [p[1] for r in named.get(name, []) for p in r['p'] if abs(p[0] - kx) < 160]
        return sum(q) / len(q) if q else default
    grid_n, grid_s = tz('North Terrace', Z0 / 3), tz('South Terrace', Z1 / 3)
    path, zb = [], grid_n - 260
    while zb <= grid_s + 60:
        xs = sorted(p[0] for p in kpts if abs(p[1] - zb) < 40)
        path.append([round(xs[len(xs) // 2] if xs else kx), round(zb)])
        zb += 80
    xs = [p[0] for p in path]
    for i in range(len(path)):                                # Victoria Square splits the street: smooth the line through it
        w = xs[max(0, i - 2):i + 3]
        path[i][0] = round(sum(w) / len(w))
    fly = {'path': path, 'axis': 'z', 'centre': round((grid_n + grid_s) / 2 - 40), 'amp': round((grid_s - grid_n) / 2 * 0.86),
           'offset': 0, 'heading': round(math.pi - 0.38, 4), 'period': 150, 'phase': 0.25, 'dist': 820, 'swing': 150, 'elev': 0.56}

    # traffic: the long named roads, both ways (or one way on a one-way carriageway)
    traffic = []
    for name, rs in named.items():
        if not any(r['c'].lower() in 'pst' for r in rs):
            continue
        for ow in (False, True):
            group = [r for r in rs if (r['c'].isupper()) == ow and r['c'].lower() in 'pst']
            for line in stitch([r['p'] for r in group], 2):
                L = length(line)
                if L < 380:
                    continue
                wide = max(r['w'] for r in group)
                traffic.append({'name': name, 'path': [[round(x), round(z)] for x, z in line], 'loop': False, 'oneway': ow,
                                'cars': max(2, min(16, round(L / 95))), 'dirs': [1] if ow else [1, -1],
                                'lanes': ([-1.7, 1.7] if wide >= 7 else [0]) if ow else ([-2.4, -5.6] if wide >= 16 else [-2.3]),
                                'speed': [9, 14], 'len': round(L)})
    traffic.sort(key=lambda t: -t['len'])
    traffic = traffic[:18]
    for t in traffic:
        del t['len'], t['name']

    # the board: open park ground on the city's side of the river, facing the fly-over's camera
    face = fly['heading']
    fx, fz = math.sin(face), math.cos(face)
    cand = []
    lake_rings = [l['outer'] for l in lakes]
    for a in ars:
        if a['c'] not in 'ok':
            continue
        xs, zs = [p[0] for p in a['p']], [p[1] for p in a['p']]
        for x in range(int(min(xs)), int(max(xs)), 12):
            for z in range(int(min(zs)), int(max(zs)), 12):
                q = (x, z)
                if not inside(q, a['p']) or not insub(q) or any(inside(q, r) for r in lake_rings):
                    continue
                cand.append(q)
    def clear(q):
        if any(abs(b['c'][0] - q[0]) < 90 and abs(b['c'][1] - q[1]) < 90 and min(math.hypot(p[0] - q[0], p[1] - q[1]) for p in b['rings'][0]) < 34 for b in bs):
            return False
        if any(r['c'].lower() != 'y' and dist_line(q, r['p']) < r['w'] / 2 + 14 for r in rds if abs(r['p'][0][0] - q[0]) < 1500):
            return False
        return True
    lake_c = max(lakes, key=lambda l: l['a'])['outer'] if lakes else None
    river_z = sum(p[1] for p in lake_c) / len(lake_c) if lake_c else grid_n - 200
    cand.sort(key=lambda q: abs(q[1] - (river_z + 70)) + abs(q[0] - 120) * 0.6)
    board = None
    for q in cand[:4000]:
        if clear(q):
            board = {'x': q[0], 'z': q[1], 'face': round(face, 4)}
            break
    if not board:
        board = {'x': 0, 'z': grid_n - 120, 'face': round(face, 4)}

    # labels
    labels = []
    def top_near(x, z, r=40):
        hs = [b['h'] for b in bs if abs(b['c'][0] - x) < r and abs(b['c'][1] - z) < r]
        return max(hs) if hs else 0
    def add(text, x, z, y=None):
        labels.append({'text': text, 'x': round(x, 1), 'y': round(y if y is not None else top_near(x, z) + 8, 1), 'z': round(z, 1)})
    for e in poi:
        t = e.get('tags') or {}
        c = e.get('center') or ({'lat': e['lat'], 'lon': e['lon']} if 'lat' in e else None)
        if not c:
            continue
        x, z = P(c['lon'], c['lat'])
        n = t.get('name', '')
        if n == 'Adelaide Oval':
            add('Adelaide Oval', x, z, 42)
        elif n.startswith('Victoria Square') and t.get('place') == 'square':
            add('Victoria Square', x, z, 8)
        elif n == 'Adelaide Botanic Gardens':
            add('Botanic Garden', x, z, 12)
        elif n == 'Adelaide Central Markets':
            add('Central Market', x, z)
        elif n == 'Adelaide' and t.get('railway') == 'station':
            add('Adelaide Railway Station', x, z, max(20, top_near(x, z, 25) + 8))
    rm = [r for r in rds if r['name'] == 'Rundle Mall']
    if rm:
        line = max(rm, key=lambda r: length(r['p']))['p']
        mid = line[len(line) // 2]
        add('Rundle Mall', mid[0], mid[1], 12)
    if lake_c:
        tl = [l for l in lakes if 'Torrens' in l['name']] or [max(lakes, key=lambda l: l['a'])]
        o = max(tl, key=lambda l: l['a'])['outer']
        c = centroid(o)
        spots = [(x, z) for x in range(int(c[0]) - 600, int(c[0]) + 600, 10) for z in range(int(c[1]) - 300, int(c[1]) + 300, 10) if inside((x, z), o)]
        spots = [q for q in spots if min(seg_dist(q, o[i], o[(i + 1) % len(o)]) for i in range(len(o))) > 25] or spots
        if spots:
            m = min(spots, key=lambda q: math.hypot(q[0] - c[0], q[1] - c[1]))
            add('Torrens Lake', m[0], m[1], 6)

    # streets to find: every named road with a piece inside the suburb
    streets = []
    for name, rs in named.items():
        best = None
        for r in rs:
            for i in range(len(r['p']) - 1):
                a, b = r['p'][i], r['p'][i + 1]
                m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                if insub(m) and (best is None or L > best[0]):
                    best = (L, m)
        if best:
            streets.append({'name': name, 'x': round(best[1][0]), 'z': round(best[1][1])})
    streets.sort(key=lambda s: s['name'])

    # moving things: trains into the station, trams down King William Street, rowers and riders on the Torrens
    lms = []
    rail = [line_of(e, P) for e in rest if (e.get('tags') or {}).get('railway') == 'rail' and e['type'] == 'way'
            and (e.get('tags') or {}).get('tunnel') != 'yes']
    rail = [p for l in rail for p in clip_line(l, box)]
    rail = [[(round(x, 1), round(z, 1)) for x, z in dp(l, 0.5)] for l in rail]
    if rail:
        lms.append({'kind': 'tracks', 'lines': [[list(p) for p in l] for l in rail]})
    st = next((P(e['lon'], e['lat']) for e in poi if (e.get('tags') or {}).get('railway') == 'station' and (e.get('tags') or {}).get('name') == 'Adelaide' and 'lat' in e), None)
    main_rail = [line_of(e, P) for e in rest if (e.get('tags') or {}).get('railway') == 'rail' and e['type'] == 'way'
                 and 'service' not in (e.get('tags') or {}) and (e.get('tags') or {}).get('tunnel') != 'yes']
    main_rail = [p for l in main_rail for p in clip_line(l, box)]
    if st and main_rail:
        lines = stitch(main_rail, 1.5)
        lines = [l if math.hypot(l[0][0] - st[0], l[0][1] - st[1]) < math.hypot(l[-1][0] - st[0], l[-1][1] - st[1]) else l[::-1] for l in lines]
        lines = [l for l in lines if math.hypot(l[0][0] - st[0], l[0][1] - st[1]) < 420 and length(l) > 900]
        lines.sort(key=length, reverse=True)
        if len(lines) >= 2:
            lms.append({'kind': 'train', 'lines': [[[round(x, 1), round(z, 1)] for x, z in l] for l in lines[:2]], 'stops': [[round(st[0]), round(st[1])]]})
    tram = [line_of(e, P) for e in rest if (e.get('tags') or {}).get('railway') == 'tram' and e['type'] == 'way']
    tram = [p for l in tram for p in clip_line(l, box)]
    if tram:
        tl = stitch([dp(l, 0.5) for l in tram], 2.5)
        tl.sort(key=length, reverse=True)
        main = tl[0]
        if main[0][1] < main[-1][1]:
            main = main[::-1]                     # in from the south, as the Glenelg trams come
        lms.append({'kind': 'tram', 'lines': [[[round(x, 1), round(z, 1)] for x, z in main]]})
    if lake_c:
        river = [line_of(e, P) for e in rest if (e.get('tags') or {}).get('waterway') == 'river' and e['type'] == 'way']
        lk = max(lakes, key=lambda l: l['a'])
        best = []
        for l in river:
            for piece in clip_line(l, box):
                cur = []
                for p in piece:
                    if inside(p, lk['outer']):
                        cur.append(p)
                    elif cur:
                        best.append(cur)
                        cur = []
                if cur:
                    best.append(cur)
        best = [b for b in best if length(b) > 300]
        if best:
            path = max(stitch(best, 3), key=length)
            L = length(path)
            trim = 40
            def cut(line, s0, s1):
                out, acc = [], 0.0
                for i in range(len(line) - 1):
                    a, b = line[i], line[i + 1]
                    l = math.hypot(b[0] - a[0], b[1] - a[1])
                    for s in (s0, s1):
                        if acc <= s <= acc + l and l:
                            k = (s - acc) / l
                            out.append((s, (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)))
                    if s0 < acc + l and acc < s1 and acc > s0:
                        out.append((acc, a))
                    acc += l
                return [p for _, p in sorted(out)]
            path = cut(path, trim, L - trim)
            lms.append({'kind': 'rowers', 'path': [[round(x, 1), round(z, 1)] for x, z in path],
                        'boats': [{'len': 17.5, 'seats': 8}, {'len': 13, 'seats': 4}, {'len': 13, 'seats': 4}, {'len': 10, 'seats': 2}]})
        cyc = [r for r in rds if r['c'].lower() == 'y' and r['hw'] in ('cycleway', 'path', 'footway')]
        near = [r['p'] for r in cyc if min(dist_line(p, lk['outer'] + [lk['outer'][0]]) for p in r['p'][:: max(1, len(r['p']) // 4)]) < 60]
        if near:
            line = max(stitch(near, 3), key=length)
            if length(line) > 500:
                lms.append({'kind': 'cyclists', 'lines': [[[round(x, 1), round(z, 1)] for x, z in line]], 'riders': 9})

    return {'fly': fly, 'traffic': traffic, 'board': board, 'labels': labels, 'streets': streets, 'landmarks': lms,
            'lakes': [{'outer': [list(p) for p in l['outer']], 'holes': [[list(p) for p in h] for h in l['holes']]} for l in lakes]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cache', default='.osm-cache')
    ap.add_argument('--out', default='build/adelaide.data.js')
    a = ap.parse_args()

    bq = '[out:json][timeout:120];rel(%d);out geom;' % REL
    brel = overpass(bq, a.cache, 'boundary')['elements'][0]
    lat0 = (brel['bounds']['minlat'] + brel['bounds']['maxlat']) / 2
    lon0 = (brel['bounds']['minlon'] + brel['bounds']['maxlon']) / 2
    P = Proj(lat0, lon0)
    outs = join([[(p['lon'], p['lat']) for p in m['geometry']] for m in brel['members'] if m.get('role') == 'outer' and m.get('geometry')])
    ring = max(([P(*p) for p in r] for r in outs), key=lambda r: abs(area(r)))
    if area(ring) < 0:
        ring.reverse()
    bnd = qring(simplify_ring(ring, 2.0))
    xs, zs = [p[0] for p in ring], [p[1] for p in ring]
    box = (math.floor((min(xs) - MARGIN) / 10) * 10, math.ceil((max(xs) + MARGIN) / 10) * 10,
           math.floor((min(zs) - MARGIN) / 10) * 10, math.ceil((max(zs) + MARGIN) / 10) * 10)
    X0, X1, Z0, Z1 = box
    s = lat0 + Z1 / P.mz * -1 - 0.0005
    n = lat0 - Z0 / P.mz + 0.0005
    w = lon0 + X0 / P.mx - 0.0005
    e = lon0 + X1 / P.mx + 0.0005
    bb = '%.5f,%.5f,%.5f,%.5f' % (s, w, n, e)
    log('origin %.6f %.6f, tray %s, bbox %s' % (lat0, lon0, box, bb))
    raw_b = overpass('[out:json][timeout:240];(way["building"](%s);rel["type"="multipolygon"]["building"](%s);way["building:part"](%s);rel["type"="multipolygon"]["building:part"](%s););out geom;' % ((bb,) * 4), a.cache, 'bld')['elements']
    raw_r = overpass(('[out:json][timeout:240];(way["highway"](B);way["railway"](B);way["natural"~"^(water|wood|scrub|grassland|tree_row)$"](B);rel["natural"="water"](B);'
                      'way["waterway"](B);rel["waterway"="riverbank"](B);way["leisure"](B);rel["leisure"](B);way["landuse"](B);rel["landuse"](B);'
                      'way["amenity"~"^(parking|grave_yard)$"](B);way["place"="square"](B););out geom;').replace('B', bb), a.cache, 'rest')['elements']
    raw_p = overpass(('[out:json][timeout:120];(node["natural"="tree"](B);nwr["tourism"~"^(attraction|museum|gallery)$"]["name"](B);'
                      'nwr["leisure"~"^(stadium|park|garden)$"]["name"](B);nwr["railway"="station"]["name"](B);nwr["place"="square"]["name"](B);'
                      'nwr["amenity"~"^(marketplace|townhall|place_of_worship)$"]["name"](B););out center tags;').replace('B', bb), a.cache, 'poi')['elements']
    stamp = max((os.path.getmtime(os.path.join(a.cache, f)) for f in os.listdir(a.cache)), default=time.time())

    warn = []
    bs = buildings(raw_b, P, box, warn)
    insub = sum(1 for b in bs if inside(b['c'], bnd) and b['k'] != 'x')
    log('buildings: %d on the tray, %d in the suburb' % (len(bs), insub))
    for w_ in warn:
        log('  height fix: ' + w_)
    from collections import Counter
    log('  kinds: %s' % dict(Counter(b['k'] + b['r'] for b in bs).most_common()))
    rds = roads(raw_r, P, box)
    log('roads: %d pieces' % len(rds))
    ars = areas(raw_r, P, box)
    log('areas: %s' % dict(Counter(x['c'] for x in ars)))
    lakes = water(raw_r, P, box)
    log('water: %d pieces, %.0f m²' % (len(lakes), sum(l['a'] for l in lakes)))
    rnd = mulberry(0x5000)
    tp = trees(raw_p, raw_r, P, box, rnd)
    pl = plan(P, box, bnd, bs, rds, ars, lakes, tp, raw_r, raw_p)

    names = {'roads': [], 'areas': [], 'water': [], 'piers': []}
    agg = {}
    for r in rds:
        if r['name'] and r['c'].lower() != 'y':
            g = agg.setdefault(r['name'], {'name': r['name'], 'code': r['c'].lower(), 'len': 0, 'x': r['p'][0][0], 'z': r['p'][0][1]})
            g['len'] += round(length(r['p']))
    names['roads'] = sorted(agg.values(), key=lambda g: -g['len'])
    for x in ars:
        if x['name'] and x['a'] > 2000:
            c = centroid(x['p'])
            names['areas'].append({'name': x['name'], 'code': x['c'], 'area': round(x['a']), 'x': round(c[0]), 'z': round(c[1])})
    for l in lakes:
        if l['name']:
            c = centroid(l['outer'])
            names['water'].append({'name': l['name'], 'area': round(l['a']), 'x': round(c[0]), 'z': round(c[1])})

    PLAN = {'slug': 'adelaide', 'name': 'Adelaide', 'postcode': '5000', 'seed': 50000501, 'box': list(box),
            'buildingsInSuburb': insub, 'zoom': [70, 3800], 'ground': 0x88837a, 'fly': pl['fly'], 'traffic': pl['traffic'], 'localCars': 26, 'board': pl['board'],
            'labels': pl['labels'], 'sea': [], 'lakes': pl['lakes'], 'yachts': [], 'jetties': [], 'landmarks': pl['landmarks'],
            'hideBld': [], 'rowing': None, 'regatta': None, 'bldMoves': [], 'clear': [], 'streets': pl['streets'], 'warnings': warn}
    when = time.strftime('%Y-%m-%d', time.gmtime(stamp))
    js = ['// Adelaide — OpenStreetMap extract (© OpenStreetMap contributors, ODbL), pulled %s by tools/extract_cbd.py.' % when,
          '// Buildings, heights and trees from OpenStreetMap. Metres from %.5f, %.5f; x = east, z = south. Boundary relation %d.' % (lat0, lon0, REL),
          'const D_FORMAT = 2;', 'const D_NAME = "Adelaide";', 'const D_RELID = %d;' % REL,
          'const D_ORIGIN = "%.6f %.6f";' % (lat0, lon0),
          'const D_BOX = "%d %d %d %d";' % box,
          'const D_COAST = "";',
          'const D_BND = %s;' % json.dumps(pts_str(bnd)),
          'const D_ROADS = %s;' % json.dumps(roads_str(rds)),
          'const D_AREAS = %s;' % json.dumps('|'.join('%s %s' % (x['c'], pts_str(x['p'])) for x in ars)),
          'const D_LAKEO = %s;' % json.dumps('|'.join(pts_str(l['outer']) for l in lakes)),
          'const D_LAKEI = %s;' % json.dumps('|'.join(pts_str(h) for l in lakes for h in l['holes'])),
          'const D_BLD = "";',
          'const D_FOOT = %s;' % json.dumps(foot_str(bs)),
          'const D_TREES = %s;' % json.dumps(pts_str(tp)),
          'const D_PIERS = "";',
          'const D_NAMES = %s;' % json.dumps(names, separators=(',', ':')),
          'const D_SRC = null;',
          'const PLAN = %s;' % json.dumps(PLAN, separators=(',', ':'))]
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    open(a.out, 'w').write('\n'.join(js) + '\n')
    log('wrote %s (%.0f KB): %d traffic routes, %d labels, %d streets, landmarks %s, board at %s' % (
        a.out, os.path.getsize(a.out) / 1024, len(pl['traffic']), len(pl['labels']), len(pl['streets']),
        [l['kind'] for l in pl['landmarks']], pl['board']))


if __name__ == '__main__':
    main()
