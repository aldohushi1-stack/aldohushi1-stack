
/* The main code. Nothing here runs until the boot script (below) has checked WebGL and loaded three.js. */
var BAIT = (function(){
'use strict';
const $ = s => document.querySelector(s);

/* ---------- shared, tested code (lib/geo.mjs, lib/data.mjs, lib/page.mjs), inlined by the build ---------- */
/* lib/geo.mjs */
// bait — geometry shared by the planner (Node) and the page (build.mjs inlines this file).
// Pure functions only: no DOM, no THREE, no randomness except the seeded generator.
// Points are [x, z] in metres; x = east, z = south.

const EPS = 1e-9;

/** Even-odd point-in-polygon test. */
function pip(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}

function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}
const polyArea = p => Math.abs(signedArea(p));

/** Area-weighted centroid of a ring; falls back to the vertex mean for degenerate rings. */
function centroid(p) {
  const A = signedArea(p);
  if (Math.abs(A) < EPS) { let x = 0, z = 0; p.forEach(q => { x += q[0]; z += q[1]; }); return [x / p.length, z / p.length]; }
  let cx = 0, cz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f; cz += (a[1] + b[1]) * f;
  }
  return [cx / (6 * A), cz / (6 * A)];
}

/** [minX, minZ, maxX, maxZ] */
/** Share (0–1) of a ring's area where inside(x, z) holds, sampled on a 20 × 20 grid over its bounds. */
function shareWhere(ring, inside) {
  const b = bbox(ring); let n = 0, k = 0;
  for (let i = 0; i < 400; i++) {
    const x = b[0] + (b[2] - b[0]) * ((i % 20) + 0.5) / 20, z = b[1] + (b[3] - b[1]) * (Math.floor(i / 20) + 0.5) / 20;
    if (!pip(x, z, ring)) continue;
    n++; if (inside(x, z)) k++;
  }
  return n ? k / n : 0;
}

function bbox(pts) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }
  return b;
}

function polylineLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }

/** Distance from (px,pz) to segment a–b. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 < EPS ? 0 : ((px - ax) * dx + (pz - az) * dz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
function distToPolyline(x, z, p) { let d = Infinity; for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return p.length === 1 ? Math.hypot(x - p[0][0], z - p[0][1]) : d; }
function distToRing(x, z, r) { return distToPolyline(x, z, r.concat([r[0]])); }

/** Nearest point on a polyline: { x, z, d, s (arc length), tx, tz (unit tangent) }. */
function nearestOnPolyline(x, z, p) {
  let best = null, s0 = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < EPS) continue;
    let t = ((x - ax) * dx + (z - az) * dz) / (L * L); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx, qz = az + t * dz, d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.d) best = { x: qx, z: qz, d, s: s0 + t * L, tx: dx / L, tz: dz / L };
    s0 += L;
  }
  return best;
}

/** Arc-length parameterised path, as used by moving things (cars, boats). */
function mkPath(p) {
  const segs = []; let L = 0;
  for (let i = 0; i < p.length - 1; i++) { const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); if (l < 0.01) continue; segs.push({ a: p[i], b: p[i + 1], s: L, l }); L += l; }
  return { segs, L };
}
/** Point and unit tangent at arc length s: [x, z, tx, tz]. */
function at(path, s) {
  s = Math.max(0, Math.min(path.L - 0.001, s));
  let lo = 0, hi = path.segs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (path.segs[mid].s <= s) lo = mid; else hi = mid - 1; }
  const g = path.segs[lo], t = (s - g.s) / g.l;
  return [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t, (g.b[0] - g.a[0]) / g.l, (g.b[1] - g.a[1]) / g.l];
}

/**
 * Cross-axis coordinate of a path at a value along an axis.
 * axis 'z': returns x at the given z.  axis 'x': returns z at the given x.
 * The first segment spanning v wins; beyond the ends, the nearest end's value.
 */
function interpAxis(path, axis, v) {
  const a = axis === 'z' ? 1 : 0, c = 1 - a;
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1], lo = Math.min(p[a], q[a]), hi = Math.max(p[a], q[a]);
    if (v >= lo && v <= hi) { const t = (v - p[a]) / ((q[a] - p[a]) || 1); return p[c] + t * (q[c] - p[c]); }
  }
  let mn = path[0], mx = path[0];
  for (const p of path) { if (p[a] < mn[a]) mn = p; if (p[a] > mx[a]) mx = p; }
  return v < mn[a] ? mn[c] : mx[c];
}

/** Offset a polyline sideways by d (positive = right of travel, with x east and z south). */
function offsetLine(p, d) {
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [q[0] - dz / L * d, q[1] + dx / L * d];
  });
}

/** Liang–Barsky clip of a polyline to box {X0,X1,Z0,Z1}; returns the inside pieces. */
function clipLine(pts, box) {
  const { X0, X1, Z0, Z1 } = box, out = []; let cur = [];
  const lb = (p, q) => {
    let t0 = 0, t1 = 1; const dx = q[0] - p[0], dz = q[1] - p[1];
    for (const [pp, qq] of [[-dx, p[0] - X0], [dx, X1 - p[0]], [-dz, p[1] - Z0], [dz, Z1 - p[1]]]) {
      if (pp === 0) { if (qq < 0) return null; }
      else { const r = qq / pp; if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
    }
    return [[p[0] + t0 * dx, p[1] + t0 * dz], [p[0] + t1 * dx, p[1] + t1 * dz], t0, t1];
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const c = lb(pts[i], pts[i + 1]);
    if (!c) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    if (cur.length === 0) cur.push(c[0]);
    cur.push(c[1]);
    if (c[3] < 1) { out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Position of a point on the tray's edge, walking clockwise from the north-west corner (map view, north up). Null if not on the edge. */
function perimeterT(x, z, box, tol = 1.5) {
  const { X0, X1, Z0, Z1 } = box, W = X1 - X0, H = Z1 - Z0;
  const d = [Math.abs(z - Z0), Math.abs(x - X1), Math.abs(z - Z1), Math.abs(x - X0)];
  const e = d.indexOf(Math.min(...d));
  if (d[e] > tol) return null;
  if (e === 0) return Math.max(0, Math.min(W, x - X0));
  if (e === 1) return W + Math.max(0, Math.min(H, z - Z0));
  if (e === 2) return W + H + Math.max(0, Math.min(W, X1 - x));
  return 2 * W + H + Math.max(0, Math.min(H, Z1 - z));
}

/**
 * Close coastline pieces into sea polygons against the tray edge.
 * OpenStreetMap draws coastlines with the land on the left and the sea on the right,
 * so after each piece ends we walk the tray edge clockwise to the next piece's start.
 * Pieces that don't start and end on the tray edge are returned in `skipped`.
 */
function assembleSea(pieces, box) {
  const { X0, X1, Z0, Z1 } = box, W = X1 - X0, H = Z1 - Z0, P = 2 * W + 2 * H;
  const corners = [[W, [X1, Z0]], [W + H, [X1, Z1]], [2 * W + H, [X0, Z1]], [P, [X0, Z0]]];
  const ok = [], skipped = [];
  for (const p of pieces) {
    if (p.length < 2) { skipped.push(p); continue; }
    const ts = perimeterT(p[0][0], p[0][1], box), te = perimeterT(p[p.length - 1][0], p[p.length - 1][1], box);
    if (ts === null || te === null) skipped.push(p); else ok.push({ p, ts, te });
  }
  const used = new Set(), rings = [];
  for (let k = 0; k < ok.length; k++) {
    if (used.has(k)) continue;
    const ring = []; let cur = k; used.add(k);
    for (let guard = 0; guard <= ok.length; guard++) {
      ring.push(...ok[cur].p);
      const tEnd = ok[cur].te;
      let next = -1, best = Infinity;
      for (let j = 0; j < ok.length; j++) {
        if (used.has(j) && j !== k) continue;
        const gap = ((ok[j].ts - tEnd) % P + P) % P;
        if (gap < best - 1e-9) { best = gap; next = j; }
      }
      // the tray corners passed on the way, in walking order
      corners.map(([ct, pt]) => [((ct - tEnd) % P + P) % P, pt])
        .filter(([g]) => g > 1e-9 && g < best - 1e-9)
        .sort((a, b) => a[0] - b[0])
        .forEach(([, pt]) => ring.push(pt));
      if (next === k || next === -1) break;
      used.add(next); cur = next;
    }
    rings.push(ring);
  }
  return { rings, skipped };
}

/** Join polylines end to end (joins within tol), extending at both ends. Direction of the first piece is kept. */
function stitchLines(segs, tol = 0.5) {
  segs = segs.slice(); const lines = [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  while (segs.length) {
    let line = segs.shift(), grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (near(s[0], line[line.length - 1])) { line = line.concat(s.slice(1)); segs.splice(i, 1); grew = true; break; }
        if (near(s[s.length - 1], line[0])) { line = s.slice(0, -1).concat(line); segs.splice(i, 1); grew = true; break; }
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Seeded generator (mulberry32). Same seed, same sequence, every browser. */
function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Stable 32-bit seed from text (FNV-1a). */
function hashSeed(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

/* lib/data.mjs */
// bait — reads a suburb's packed map data (the D_* strings) into plain structures.
// Shared by the planner (Node) and the page (build.mjs inlines this file).
// Contract: DESIGN.md §2.1. Format 1 is the original Tennyson file (no D_FORMAT).

const ROAD_WIDTH = { s: 13, t: 10, r: 8, y: 3.4 };

function parsePts(s) {
  s = (s || '').trim();
  if (!s) return [];
  return s.split(/\s+/).map(p => { const i = p.indexOf(','); return [+p.slice(0, i), +p.slice(i + 1)]; });
}
const parseRings = s => (s || '').split('|').map(parsePts).filter(r => r.length > 0);

/**
 * D: object holding the D_* constants. fallbackBox: [X0,X1,Z0,Z1] for format-1 files.
 * Returns { format, name, box:{X0,X1,Z0,Z1}, bnd, bld, roads, areas, coast, lakeO, lakeI, piers, names, src }.
 * piers: jetties and walkways, [{ kind: 'a', p: ring }] decks or [{ kind: 'l', w, p: line }] (D_PIERS, absent = none).
 * src: where the buildings came from — null for OpenStreetMap, else D_SRC ({ buildings: 'overture', release, sources }).
 */
function parseData(D, fallbackBox) {
  const format = D.D_FORMAT || 1;
  const bx = D.D_BOX ? D.D_BOX.trim().split(/\s+/).map(Number) : fallbackBox;
  if (!bx || bx.length !== 4 || bx.some(v => !Number.isFinite(v))) throw new Error('No tray: the data has no D_BOX and the suburb card has no pin.box');
  const box = { X0: bx[0], X1: bx[1], Z0: bx[2], Z1: bx[3] };
  const bld = (D.D_BLD || '').split(';').filter(Boolean).map(s => {
    const a = s.split(' ');
    return { x: +a[0], z: +a[1], w: +a[2], d: +a[3], ang: (+a[4]) * Math.PI / 180, t: a[5][0], lv: a[5].length > 1 ? +a[5].slice(1) : 0 };
  });
  /* the code may carry the road's width in metres ("p22 x,z …", the CBD board); without it, the width of its kind */
  const roads = (D.D_ROADS || '').split('|').filter(Boolean).map(r => {
    const sp = r.indexOf(' '), c = r[0].toLowerCase(), w = +r.slice(1, sp);
    return { c, oneway: r[0] !== c, w: w > 0 ? w : (ROAD_WIDTH[c] || 8), p: parsePts(r.slice(sp + 1)) };
  });
  /* real footprints (D_FOOT): "H B k[r] x,z dx,dz …[ / x,z dx,dz …]" — wall height and base in metres, kind, roof */
  const foot = (D.D_FOOT || '').split(';').filter(Boolean).map(s => {
    const a = s.indexOf(' '), b = s.indexOf(' ', a + 1), c = s.indexOf(' ', b + 1), kr = s.slice(b + 1, c);
    const rings = s.slice(c + 1).split(' / ').map(t => { let x = 0, z = 0; return parsePts(t).map((p, i) => i ? [x += p[0], z += p[1]] : [x = p[0], z = p[1]]); }).filter(r => r.length >= 3);
    return { h: +s.slice(0, a), b: +s.slice(a + 1, b), k: kr[0], r: kr[1] || '', rings };
  }).filter(f => f.rings.length && f.h > f.b);
  const trees = parsePts(D.D_TREES || '');
  const areas = (D.D_AREAS || '').split('|').filter(Boolean).map(r => ({ c: r[0], p: parsePts(r.slice(2)) }));
  const piers = (D.D_PIERS || '').split('|').filter(Boolean).map(s => {
    const i = s.indexOf(' '), head = s.slice(0, i);
    return head === 'a' ? { kind: 'a', p: parsePts(s.slice(i + 1)) } : { kind: 'l', w: +head.slice(1) || 2.5, p: parsePts(s.slice(i + 1)) };
  }).filter(q => q.p.length >= (q.kind === 'a' ? 3 : 2));
  let names = { roads: [], areas: [], water: [], piers: [] };
  if (D.D_NAMES) names = Object.assign(names, typeof D.D_NAMES === 'string' ? JSON.parse(D.D_NAMES) : D.D_NAMES);
  return {
    format, name: D.D_NAME || null, box,
    origin: D.D_ORIGIN ? String(D.D_ORIGIN).trim().split(/\s+/).map(Number) : null,
    bnd: parsePts(D.D_BND), bld, roads, areas, foot, trees,
    coast: parseRings(D.D_COAST), lakeO: parseRings(D.D_LAKEO), lakeI: parseRings(D.D_LAKEI), piers, names,
    src: D.D_SRC ? (typeof D.D_SRC === 'string' ? JSON.parse(D.D_SRC) : D.D_SRC) : null,
  };
}

/* lib/page.mjs */
// bait — the page's decisions as pure functions: the slot, the board's words, links, phone budgets.
// build.mjs inlines this file into both pages (pitch and site), so it must not import anything
// and must not touch the DOM. Contract: DESIGN.md §2.4 (the slot) and §8 (modes).

const PAGE_RULES = {
  nameMax: 40,          // characters of an agent's name the board will take from the slot
  agencyMax: 60,
  hostLineMax: 60,      // the host's line under the photo (a card field, not from the slot)
  hostPhoneMax: 20,     // the host's number under the line
  hostNameMax: 40,      // the host's name under the photo
  suburbMax: 40,
  pathMax: 512,
  phoneMinSide: 760,    // px: a screen whose short side is under this is a phone
  phoneDpr: 1.25,       // pixel-ratio cap on phones
  deskDpr: 2,
  phoneFrameMs: 33,     // phones render at most every 33 ms (30 fps)
  tapPx: 8,             // a pointer that moves this far is a drag, not a tap
  tapMs: 500,           // …or that stays down this long
  idleFlyMs: 45000,     // idle time before the fly-over starts again by itself
  scriptMs: 15000,      // three.js gets this long to arrive
};
const FALLBACK_WHY = ['nogl', 'timeout', 'lost', 'savedata'];

/** Plain one-line text: control, zero-width and bidi-override characters become spaces; cut to max code points. */
function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  let s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  const cp = Array.from(s);
  if (cp.length > max) s = cp.slice(0, max - 1).join('').trimEnd() + '…';
  return s;
}

/** A same-origin path ("/…", not "//…" or "/\…", no spaces or quotes), or null. */
function safePath(v) {
  if (typeof v !== 'string' || v.length > PAGE_RULES.pathMax) return null;
  return /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(v) ? v : null;
}

function defaultLinks(slug, base = '') {
  const s = encodeURIComponent(slug);
  return { ask: `${base}/adelaide/${s}#ask`, price: `${base}/adelaide/${s}`, advertise: `${base}/advertise` };
}

/**
 * The slot the server put in the page (DESIGN.md §2.4), checked field by field.
 * text: the JSON text of <script id="bait-slot">, or null. ctx: { page:'pitch'|'site', slug, name, postcode, linkBase }.
 * Unfilled (the server never replaced the token), missing or unreadable → public, open board, links from the slug.
 */
function resolveSlot(text, ctx) {
  const out = { mode: ctx.page === 'pitch' ? 'pitch' : 'public', filled: false, suburb: ctx.name, postcode: ctx.postcode, agent: null, links: defaultLinks(ctx.slug, ctx.linkBase || ''), poster: null, beacon: null };
  if (ctx.page !== 'site' || typeof text !== 'string') return out;
  let raw = null;
  try { raw = JSON.parse(text); } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.filled = true;
  out.mode = raw.mode === 'pitch' ? 'pitch' : 'public';
  const sub = cleanText(raw.suburb, PAGE_RULES.suburbMax);
  if (sub) out.suburb = sub;
  const a = raw.agent;
  if (out.mode === 'public' && a && typeof a === 'object' && !Array.isArray(a)) {
    const name = cleanText(a.name, PAGE_RULES.nameMax);
    if (name) out.agent = { name, agency: cleanText(a.agency, PAGE_RULES.agencyMax) || null };
  }
  const L = raw.links && typeof raw.links === 'object' ? raw.links : {};
  const links = { ...out.links };
  for (const k of ['ask', 'price', 'advertise']) { const p = safePath(L[k]); if (p) links[k] = p; }
  out.links = links;
  out.poster = safePath(raw.poster);
  out.beacon = safePath(raw.beacon);
  return out;
}

const endsS = s => /s$/i.test(s);
/** "Tennyson’s", "St Peters’" */
const possessive = s => s + (endsS(s) ? '’' : '’s');
const boardHead = s => s.toUpperCase() + (endsS(s) ? "' AGENT" : "'S AGENT");

/** The host's board: their photo (drawn by the page), their name under it, one line, and their number, each if given. */
const hostBoard = host => ({ head: '', big: '', name: cleanText(host.name, PAGE_RULES.hostNameMax), low: cleanText(host.line, PAGE_RULES.hostLineMax), phone: cleanText(host.phone, PAGE_RULES.hostPhoneMax), paid: false, placeholder: false, host: true });

/**
 * What the board says. mode 'public' reads agent; mode 'pitch' reads typed {name, agency}.
 * host ({ line, name?, phone? }, from the suburb's card, DESIGN.md §2.7): whoever holds the board while it is open.
 * A paying agent (public) or a typed name (pitch) takes their place.
 */
function boardLines({ mode, suburb, postcode, agent, typed, host = null }) {
  const home = `${suburb}, SA ${postcode}`;
  if (mode === 'public') {
    if (agent) return { head: boardHead(suburb), big: agent.name, low: agent.agency || home, paid: true, placeholder: false };
    if (host) return hostBoard(host);
    return { head: `SELLING IN ${suburb.toUpperCase()}?`, big: 'Free appraisal', low: 'Tap the board to ask  ·  Agents: this board is open', paid: false, placeholder: false };
  }
  const name = cleanText(typed && typed.name, PAGE_RULES.nameMax), agency = cleanText(typed && typed.agency, PAGE_RULES.agencyMax);
  if (name) return { head: boardHead(suburb), big: name, low: agency || home, paid: true, placeholder: false };
  if (host) return hostBoard(host);
  return { head: boardHead(suburb), big: 'Your name here', low: 'One board in the suburb', paid: false, placeholder: true };
}

/** The gold line in the panel. */
function panelLine(slot) {
  if (slot.mode === 'pitch') return 'One board in the suburb. One name on it.';
  return slot.agent ? `${slot.agent.name} is ${possessive(slot.suburb)} agent.` : `Selling in ${slot.suburb}? Ask what your place is worth.`;
}
/** The board's line, as plain text, on the fallback card. */
function fallbackLine(slot) {
  return slot.mode === 'public' && slot.agent ? `${slot.agent.name} is ${possessive(slot.suburb)} agent.` : `Selling in ${slot.suburb}? Ask for a free appraisal.`;
}

/** Put ?street=… (or &street=…) before the hash. */
function withStreet(link, street) {
  const h = link.indexOf('#'), base = h < 0 ? link : link.slice(0, h), hash = h < 0 ? '' : link.slice(h);
  return base + (base.includes('?') ? '&' : '?') + 'street=' + encodeURIComponent(street) + hash;
}

const fold = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
function findStreet(streets, q) {
  const k = fold(q);
  if (!k) return null;
  return (streets || []).find(s => fold(s.name) === k) || null;
}

const isPhone = (w, h, coarse) => Math.min(w, h) < PAGE_RULES.phoneMinSide || !!coarse;
const pixelRatio = (dpr, phone) => Math.min(dpr || 1, phone ? PAGE_RULES.phoneDpr : PAGE_RULES.deskDpr);
const frameDue = (now, last, phone, test) => !!test || !phone || now - last >= PAGE_RULES.phoneFrameMs;
const isTap = (dx, dy, ms) => Math.hypot(dx, dy) < PAGE_RULES.tapPx && ms < PAGE_RULES.tapMs;
const autoFly = ({ reduce, formOpen, idleMs }) => !reduce && !formOpen && idleMs > PAGE_RULES.idleFlyMs;

/** The fields of one beacon (sent as URLSearchParams). */
function beaconFields(ev, ms, phone, why) {
  return { ev, ms: String(Math.round(ms)), phone: phone ? '1' : '0', why: FALLBACK_WHY.includes(why) ? why : '' };
}

/**
 * The map credit lines, from where the buildings came from (DESIGN.md §2.6).
 * src: null / undefined for OpenStreetMap (every suburb before Overture: the words are unchanged),
 * or D_SRC { buildings: 'overture', release, sources: { '@geometry_source': count } }.
 * Every line keeps "© OpenStreetMap contributors": the streets are always OpenStreetMap's (gold check G7).
 * Returns { long, short, plaque, poster }: the panel credit, the fallback card's, the tail of the
 * plaque on the tray's front rail, and the poster/share card's.
 */
function credits(src) {
  if (!src || src.buildings !== 'overture') return {
    long: 'Buildings, streets and shoreline © OpenStreetMap contributors. Roof colours are the model‑maker’s.',
    short: 'Buildings, streets and shoreline © OpenStreetMap contributors.',
    plaque: 'from OpenStreetMap footprints  ·  map data © OpenStreetMap contributors',
    poster: 'Map data © OpenStreetMap contributors',
  };
  const NAMES = {
    'Microsoft ML Buildings': ['Microsoft Global ML Building Footprints', 'Microsoft'],
    'Google Open Buildings': ['Google Open Buildings (CC BY 4.0)', 'Google'],
    'Esri Community Maps': ['Esri Community Maps contributors (CC BY 4.0)', 'Esri'],
  };
  const ranked = Object.entries(src.sources || {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);
  const others = ranked.filter(k => NAMES[k]);
  const full = others.map(k => NAMES[k][0]), brief = others.map(k => NAMES[k][1]);
  if (ranked.includes('OpenStreetMap') || !full.length) { full.push('OpenStreetMap contributors'); brief.push('OpenStreetMap'); }
  const join = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  return {
    long: `Streets and shoreline © OpenStreetMap contributors. Buildings from Overture Maps (ODbL): ${join(full)}. Roof colours are the model‑maker’s.`,
    short: `Streets © OpenStreetMap contributors. Buildings: Overture Maps (${brief.join(', ')}).`,
    plaque: 'from Overture Maps footprints  ·  map data © OpenStreetMap contributors, Overture Maps',
    poster: `Map data © OpenStreetMap contributors · buildings Overture Maps (${brief.join(', ')})`,
  };
}


/* ---------- how this page was built, and what the server put in the slot (DESIGN.md §2.4) ---------- */
const BUILD = {"page":"site","scripts":["/assets/vendor/three-r128.min.js","/assets/vendor/three-r128-mapcontrols.js"],"linkBase":""};
const TEST = window.__BAIT_TEST || null;   /* test hook: only set by a test harness before load */
const PHONE = isPhone(innerWidth, innerHeight, !!(window.matchMedia && matchMedia('(pointer:coarse)').matches));
const slotEl = document.getElementById('bait-slot');
const SLOT = resolveSlot(slotEl ? slotEl.textContent : null, { page: BUILD.page, slug: PLAN.slug, name: PLAN.name, postcode: PLAN.postcode, linkBase: BUILD.linkBase });
const loading = $('#loading');

/* one line to the server about how the page went; never in tests, never throws */
function beacon(ev, why){
  if (TEST || !SLOT.beacon) return;
  try { navigator.sendBeacon(SLOT.beacon, new URLSearchParams(beaconFields(ev, performance.now(), PHONE, why))); } catch (e) { /* the page carries on */ }
}
/* every link the slot gives is already a checked same-origin path; the pitch page's own links open a new tab */
function setLink(a, href){ a.setAttribute('href', href); if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } }

/* the fallback card: no dead ends */
let fellBack = false, running = false;
function fallback(why, proceed){
  if (fellBack) return;
  fellBack = true; running = false;
  const card = $('#fallback');
  $('#fbLine').textContent = fallbackLine(SLOT);
  const fa = $('#fbAsk'); setLink(fa, SLOT.links.ask); fa.onclick = () => beacon('ask');
  setLink($('#fbPrice'), SLOT.links.price);
  $('#fbPrice').textContent = `${SLOT.suburb} prices`;
  const img = $('#fbPoster');
  if (SLOT.poster) { img.onerror = () => { img.hidden = true; }; img.src = SLOT.poster; img.hidden = false; }
  $('#fbMsg').hidden = why !== 'lost';
  const reload = $('#fbReload'); reload.hidden = why !== 'lost'; reload.onclick = () => location.reload();
  const more = $('#fbLoad'); more.hidden = why !== 'savedata';
  more.onclick = () => { card.hidden = true; fellBack = false; if (loading) loading.hidden = false; proceed(); };
  if (loading) loading.hidden = true;
  card.hidden = false;
  beacon('fallback', why);
}

function start(){
running = true;
/* ---------- data and plan: the only suburb-specific input ---------- */
const DATA = parseData({ D_FORMAT: typeof D_FORMAT!=='undefined' ? D_FORMAT : 1, D_BOX: typeof D_BOX!=='undefined' ? D_BOX : null, D_SRC: typeof D_SRC!=='undefined' ? D_SRC : null, D_PIERS: typeof D_PIERS!=='undefined' ? D_PIERS : '', D_FOOT: typeof D_FOOT!=='undefined' ? D_FOOT : '', D_TREES: typeof D_TREES!=='undefined' ? D_TREES : '', D_BND, D_BLD, D_ROADS, D_AREAS, D_COAST, D_LAKEO, D_LAKEI }, PLAN.box);
const { X0, X1, Z0, Z1 } = DATA.box;
const BND=DATA.bnd, ROADS=DATA.roads, BLD=DATA.bld, COAST=DATA.coast, SEA=PLAN.sea, LAKES=PLAN.lakes;
const inLake = (x,z) => LAKES.some(l => pip(x,z,l.outer) && !l.holes.some(h => pip(x,z,h)));
const inSuburb = (x,z) => pip(x,z,BND);
const inSea = (x,z) => SEA.some(r => pip(x,z,r));
/* ground that is mostly sea isn't ground: a reserve drawn over water (Largs Bay's Adelaide Dolphin Sanctuary) leaves the water showing */
const AREAS = SEA.length ? DATA.areas.filter(a => shareWhere(a.p, inSea) <= 0.5) : DATA.areas;
const rnd = mulberry32(PLAN.seed);
const pick = (arr) => { let tot=0; arr.forEach(a=>tot+=a[1]); let r=rnd()*tot; for(const a of arr){ if((r-=a[1])<=0) return a[0]; } return arr[0][0]; };


/* ---------- renderer ---------- */
const canvas=$('#scene');
const renderer=new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'}); /* if this throws, the boot shows the fallback card */
/* phones get a lower pixel-ratio cap (PAGE_RULES.phoneDpr); the lens blur below scales with the ratio actually used */
const DPR = pixelRatio(window.devicePixelRatio, PHONE);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.localClippingEnabled=true;
/* the real-world look: colours worked in linear light, a filmic curve, sRGB out (the cartoon boards work in display colour) */
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.97;
const C=hex=>new THREE.Color(hex).convertSRGBToLinear();   /* a colour as the eye sees it → the light the renderer adds up */
const srgbTex=t=>{ t.encoding=THREE.sRGBEncoding; return t; };

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32, innerWidth/innerHeight, 20, 14000);

/* sky: deep blue overhead to a pale, dusty horizon; the haze is the horizon's colour */
const SKY={ top:'#4f7fae', mid:'#9fbbd2', low:'#d4dad8', haze:'#c4cdd0' };
(function(){
  const c=document.createElement('canvas'); c.width=4; c.height=256; const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,0,256);
  gr.addColorStop(0,SKY.top); gr.addColorStop(.5,SKY.mid); gr.addColorStop(1,SKY.low);
  g.fillStyle=gr; g.fillRect(0,0,4,256);
  scene.background=srgbTex(new THREE.CanvasTexture(c));
})();
scene.fog=new THREE.Fog(C(SKY.haze), 2400, 8200);   /* air at a few kilometres: the far side of the Park Lands goes soft, the table beyond fades out */

/* light: a clear spring afternoon, the sun in the north-west and a third of the way up, so the towers throw long shadows */
scene.add(new THREE.HemisphereLight(C(0xcfe0f2), C(0x6d6253), 0.62));
const sun=new THREE.DirectionalLight(C(0xfff1de), 2.9);
const SUNDIR=new THREE.Vector3(-0.66, 0.58, -0.48).normalize();
sun.position.copy(SUNDIR).multiplyScalar(5200);
sun.castShadow=true;
const smap = (!PHONE && renderer.capabilities.maxTextureSize>=4096) ? 4096 : 2048;
sun.shadow.mapSize.set(smap, smap);
const SH=Math.max(1580, Math.hypot(X1-X0, Z1-Z0)/2+40); const sc=sun.shadow.camera; sc.left=-SH; sc.right=SH; sc.top=SH; sc.bottom=-SH; sc.near=10; sc.far=Math.max(4200, SH*3.2);
sun.shadow.bias=-0.0003; sun.shadow.normalBias=1.1;
scene.add(sun); scene.add(sun.target);

/* what glass and metal reflect: the same sky, blurred (PMREM), over warm ground */
(function(){
  const sky=new THREE.Scene();
  const m=new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, uniforms:{ top:{value:C(SKY.top)}, mid:{value:C(SKY.mid)}, low:{value:C(SKY.low)}, ground:{value:C(0x6e675c)}, sun:{value:SUNDIR.clone()} },
    vertexShader:'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform vec3 top,mid,low,ground,sun; varying vec3 vD; void main(){ float y=vD.y; vec3 c=y>0. ? mix(mix(low,mid,smoothstep(0.,.25,y)),top,smoothstep(.25,1.,y)) : mix(low,ground,smoothstep(0.,.12,-y)); c+=vec3(1.,.93,.8)*pow(max(dot(vD,sun),0.),180.)*6.; gl_FragColor=linearToOutputTexel(vec4(c,1.)); }'   /* PMREM renders into RGBE: encode, or the reflections blow up */ });
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(100,32,16), m));
  const pm=new THREE.PMREMGenerator(renderer);
  scene.environment=pm.fromScene(sky, 0.02).texture;
  pm.dispose();
})();

const clip=[ new THREE.Plane(new THREE.Vector3(1,0,0),-X0), new THREE.Plane(new THREE.Vector3(-1,0,0),X1), new THREE.Plane(new THREE.Vector3(0,0,1),-Z0), new THREE.Plane(new THREE.Vector3(0,0,-1),Z1) ];

/* ---------- helpers ---------- */
const V2=(x,z)=>new THREE.Vector2(x,-z);
function shapeOf(ring, holes){ const s=new THREE.Shape(ring.map(p=>V2(p[0],p[1]))); (holes||[]).forEach(h=>s.holes.push(new THREE.Path(h.map(p=>V2(p[0],p[1]))))); return s; }
function flatShapeGeom(shape, y){ const g=new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI/2); g.translate(0,y,0); return g; }
function mergeFlat(geoms){
  const parts=geoms.map(g=>g.index ? g.toNonIndexed() : g); let n=0; parts.forEach(g=>n+=g.attributes.position.count);
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3), uv=new Float32Array(n*2); let o=0;
  parts.forEach(g=>{ pos.set(g.attributes.position.array, o*3); o+=g.attributes.position.count; });
  for(let i=0;i<n;i++){ nor[i*3+1]=1; uv[i*2]=pos[i*3]; uv[i*2+1]=pos[i*3+2]; }
  const out=new THREE.BufferGeometry(); out.setAttribute('position',new THREE.BufferAttribute(pos,3)); out.setAttribute('normal',new THREE.BufferAttribute(nor,3)); out.setAttribute('uv',new THREE.BufferAttribute(uv,2)); return out;
}
function ribbonGeom(list, y){
  const pos=[], idx=[]; let v=0;
  for(const it of list){ const p=it.p, h=it.w/2;
    for(let i=0;i<p.length-1;i++){ const ax=p[i][0], az=p[i][1], bx=p[i+1][0], bz=p[i+1][1]; let dx=bx-ax, dz=bz-az; const L=Math.hypot(dx,dz); if(L<0.01) continue; dx/=L; dz/=L; const nx=-dz, nz=dx;
      pos.push(ax+nx*h,y,az+nz*h, ax-nx*h,y,az-nz*h, bx+nx*h,y,bz+nz*h, bx-nx*h,y,bz-nz*h); idx.push(v,v+2,v+1, v+1,v+2,v+3); v+=4; }
    if(it.joints!==false) for(let i=0;i<p.length;i++){ const cx=p[i][0], cz=p[i][1], c=v; pos.push(cx,y,cz); v++; for(let k=0;k<8;k++){ const a=k/8*Math.PI*2; pos.push(cx+Math.cos(a)*h,y,cz+Math.sin(a)*h); v++; } for(let k=0;k<8;k++) idx.push(c, c+1+((k+1)%8), c+1+k); }
  }
  const g=new THREE.BufferGeometry(); const P=new Float32Array(pos); g.setAttribute('position',new THREE.BufferAttribute(P,3));
  const N=new Float32Array(P.length); for(let i=1;i<N.length;i+=3) N[i]=1; g.setAttribute('normal',new THREE.BufferAttribute(N,3));
  const U=new Float32Array(P.length/3*2); for(let i=0;i<P.length/3;i++){ U[i*2]=P[i*3]; U[i*2+1]=P[i*3+2]; } g.setAttribute('uv',new THREE.BufferAttribute(U,2));
  g.setIndex(idx); return g;
}
const lam=(c,o)=>{ o=Object.assign({},o||{}); if(typeof o.emissive==='number') o.emissive=C(o.emissive); return new THREE.MeshLambertMaterial(Object.assign({color:C(c)},o)); };
/* a grey noise tile, for grass, asphalt and roofs: real ground is never one flat colour */
function noiseTex(size, cells, lo, hi, seed){
  const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'), img=g.createImageData(size,size), r=mulberry32(seed);
  const n=cells, v=[]; for(let i=0;i<n*n;i++) v.push(r());
  const at=(x,y)=>v[((y%n+n)%n)*n+((x%n+n)%n)];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){ const fx=x/size*n, fy=y/size*n, ix=Math.floor(fx), iy=Math.floor(fy), tx=fx-ix, ty=fy-iy, sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty);
    const a=at(ix,iy)+(at(ix+1,iy)-at(ix,iy))*sx, b=at(ix,iy+1)+(at(ix+1,iy+1)-at(ix,iy+1))*sx, k=(a+(b-a)*sy)*.65+r()*.35, l=Math.round((lo+(hi-lo)*k)*255), i=(y*size+x)*4;
    img.data[i]=img.data[i+1]=img.data[i+2]=l; img.data[i+3]=255; }
  g.putImageData(img,0,0); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}

/* water normal map, drawn once */
function waterNormals(){
  const S=256, c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'); const img=g.createImageData(S,S);
  const wr=mulberry32(77), waves=[]; for(let i=0;i<14;i++){ let kx=0,ky=0; while(!kx&&!ky){ kx=Math.round((wr()*2-1)*10); ky=Math.round((wr()*2-1)*10); } waves.push([kx,ky,wr()*6.283,1/Math.hypot(kx,ky)]); }
  const H=(x,y)=>{ let h=0; for(const w of waves) h+=Math.sin((w[0]*x+w[1]*y)*Math.PI*2/S+w[2])*w[3]; return h*3; };
  for(let y=0;y<S;y++) for(let x=0;x<S;x++){ const dx=H(x+1,y)-H(x-1,y), dy=H(x,y+1)-H(x,y-1); const nx=-dx*1.2, ny=-dy*1.2, nz=1, l=Math.hypot(nx,ny,nz); const i=(y*S+x)*4; img.data[i]=(nx/l*.5+.5)*255; img.data[i+1]=(ny/l*.5+.5)*255; img.data[i+2]=(nz/l*.5+.5)*255; img.data[i+3]=255; }
  g.putImageData(img,0,0); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/120,1/120); return t;
}
const wn1=waterNormals(), wn2=wn1.clone(); wn2.needsUpdate=true; wn2.repeat.set(1/90,1/90);

/* ---------- the tray ---------- */
const RIM=16, RIMTOP=3, BASE=-34;
/* the ground between things: the city's pale, worn concrete and gravel */
const groundTex=noiseTex(256, 24, .82, 1.0, 11); groundTex.repeat.set((X1-X0)/60, (Z1-Z0)/60);
const land=new THREE.Mesh(new THREE.BoxGeometry(X1-X0, -BASE, Z1-Z0), [lam(0x5b3b27),lam(0x5b3b27),lam(0x88837a,{map:groundTex}),lam(0x3a281b),lam(0x5b3b27),lam(0x5b3b27)]);
land.position.set((X0+X1)/2, BASE/2, (Z0+Z1)/2); land.receiveShadow=true; scene.add(land);
const wood=new THREE.MeshPhongMaterial({color:C(0x4b2f1f), shininess:28, specular:C(0x3a2a20)});
const rimH=RIMTOP-BASE, rimY=(RIMTOP+BASE)/2, W=X1-X0, Dz=Z1-Z0;
[[W+2*RIM, RIM, (X0+X1)/2, Z0-RIM/2],[W+2*RIM, RIM, (X0+X1)/2, Z1+RIM/2],[RIM, Dz, X0-RIM/2, (Z0+Z1)/2],[RIM, Dz, X1+RIM/2, (Z0+Z1)/2]].forEach(r=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(r[0], rimH, r[1]), wood); m.position.set(r[2], rimY, r[3]); m.castShadow=true; m.receiveShadow=true; scene.add(m); });
const table=new THREE.Mesh(new THREE.PlaneGeometry(14000,14000), lam(0x332b25)); table.rotation.x=-Math.PI/2; table.position.y=BASE-0.5; table.receiveShadow=true; scene.add(table);

/* ---------- sea, lake, foam ---------- */
const seaMat=new THREE.MeshPhongMaterial({vertexColors:true, normalMap:wn1, normalScale:new THREE.Vector2(.28,.28), shininess:90, specular:0xfff1d6});
SEA.forEach(ring=>{
  const g=flatShapeGeom(shapeOf(ring), 0.15), p=g.attributes.position, col=new Float32Array(p.count*3), sh=new THREE.Color(0x67c6c3), dp=new THREE.Color(0x1d6a86), c=new THREE.Color();
  // shallow at the shore, deep offshore: colour by distance to the nearest coastline
  for(let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i); const d=Math.min(...COAST.map(l=>distToPolyline(x,z,l))); c.copy(sh).lerp(dp, Math.min(1, d/520)); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  const m=new THREE.Mesh(g, seaMat); m.receiveShadow=true; scene.add(m); });
/* the Torrens: still, green-brown water that mirrors the sky */
const lakeMat=new THREE.MeshStandardMaterial({color:C(0x34493f), normalMap:wn2, normalScale:new THREE.Vector2(.22,.22), roughness:.2, metalness:.05, envMapIntensity:.55, clippingPlanes:clip});
LAKES.forEach(l=>{ const m=new THREE.Mesh(flatShapeGeom(shapeOf(l.outer,l.holes), 0.42), lakeMat); m.receiveShadow=true; scene.add(m); });
const foamMat=new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.7, depthWrite:false});
const foamMat2=foamMat.clone(); foamMat2.opacity=.35;
if(SEA.length){
  scene.add(new THREE.Mesh(ribbonGeom(COAST.map(l=>({p:offsetLine(l,4), w:4.5})),0.3), foamMat));
  scene.add(new THREE.Mesh(ribbonGeom(COAST.map(l=>({p:offsetLine(l,16), w:2.2, joints:false})),0.28), foamMat2)); }

/* ---------- ground areas ---------- */
/* colours from the ground itself: spring grass in the Park Lands, darker garden beds, worn car parks, sandstone paving */
const grassTex=noiseTex(256, 10, .72, 1.0, 21), fineTex=noiseTex(256, 48, .86, 1.0, 22);
grassTex.repeat.set(1/70,1/70); fineTex.repeat.set(1/22,1/22);
const AREA_STYLE={ b:[0xd8c7a0,0.10,fineTex], d:[0x9c9a72,0.12,grassTex], o:[0x6c7f4a,0.12,grassTex], c:[0x8e9163,0.13,grassTex], l:[0x7a7368,0.14,fineTex], x:[0x9e8a6c,0.15,fineTex],
  w:[0x5c7440,0.16,grassTex], k:[0x5a7140,0.18,grassTex], p:[0x55585b,0.20,fineTex], q:[0xc3baa9,0.11,fineTex], f:[0x5b8040,0.26,grassTex], h:[0x4d7a70,0.28,null], e:[0x9c4f3c,0.30,null], n:[0x3f9ab5,0.32,null] };
Object.keys(AREA_STYLE).forEach(k=>{ const list=AREAS.filter(a=>a.c===k); if(!list.length) return; const st=AREA_STYLE[k]; const g=mergeFlat(list.map(a=>flatShapeGeom(shapeOf(a.p), st[1])));
  const m=new THREE.Mesh(g, k==='n' ? new THREE.MeshStandardMaterial({color:C(st[0]), roughness:.1, metalness:.1, emissive:C(0x0b3a48)}) : lam(st[0], st[2] ? {map:st[2]} : {})); m.receiveShadow=true; scene.add(m); });
/* white lines on the sports pitches */
(function(){ const list=AREAS.filter(a=>a.c==='f'||a.c==='h').map(a=>({p:a.p.concat([a.p[0]]), w:0.35, joints:false})); const m=new THREE.Mesh(ribbonGeom(list,0.40), lam(0xe8e8e2)); m.receiveShadow=true; scene.add(m); })();

/* ---------- streets ---------- */
/* every road at its own width (from its lanes, or its kind); concrete footpaths either side of the streets; a mall paved */
const KERB={ p:8, s:7, t:6, r:4.5, v:0, q:0 };
const footpaths=ROADS.filter(r=>KERB[r.c]).map(r=>({p:r.p, w:r.w+KERB[r.c]}));
const fp=new THREE.Mesh(ribbonGeom(footpaths,0.46), lam(0xa39e94,{map:fineTex})); fp.receiveShadow=true; scene.add(fp);
const asphaltTex=noiseTex(256, 64, .84, 1.0, 31); asphaltTex.repeat.set(1/14,1/14);
const asphalt=new THREE.Mesh(ribbonGeom(ROADS.filter(r=>r.c!=='y'&&r.c!=='q').map(r=>({p:r.p, w:r.w})),0.54), lam(0x3f4245,{map:asphaltTex})); asphalt.receiveShadow=true; scene.add(asphalt);
const mall=new THREE.Mesh(ribbonGeom(ROADS.filter(r=>r.c==='q').map(r=>({p:r.p, w:r.w})),0.56), lam(0xcbc2b2,{map:fineTex})); mall.receiveShadow=true; scene.add(mall);
const paths=new THREE.Mesh(ribbonGeom(ROADS.filter(r=>r.c==='y').map(r=>({p:r.p, w:r.w})),0.50), lam(0xc4b89f,{map:fineTex})); paths.receiveShadow=true; scene.add(paths);
/* lane lines: short white dashes along the main roads */
(function(){ const dashes=[]; PLAN.traffic.map(t=>t.path).forEach(path=>{ for(let i=0;i<path.length-1;i++){ const a=path[i], b=path[i+1]; const L=Math.hypot(b[0]-a[0],b[1]-a[1]); for(let s=0;s<L-3;s+=9){ const t0=s/L, t1=(s+3)/L; dashes.push({p:[[a[0]+(b[0]-a[0])*t0, a[1]+(b[1]-a[1])*t0],[a[0]+(b[0]-a[0])*t1, a[1]+(b[1]-a[1])*t1]], w:0.3, joints:false}); } } });
  scene.add(new THREE.Mesh(ribbonGeom(dashes,0.62), lam(0xdedbd2))); })();

/* the suburb's edge */
const edgeMat=new THREE.MeshBasicMaterial({color:C(0xf2c14e), transparent:true, opacity:.92, depthWrite:false, toneMapped:false});
scene.add(new THREE.Mesh(ribbonGeom([{p:BND.concat([BND[0]]), w:3.2}],0.75), edgeMat));

/* ---------- occupancy grid (keeps trees off roofs and roads) ---------- */
const CELL=3, GW=Math.ceil((X1-X0)/CELL), GH=Math.ceil((Z1-Z0)/CELL), grid=new Uint8Array(GW*GH);
const gi=(x,z)=>{ const i=Math.floor((x-X0)/CELL), j=Math.floor((z-Z0)/CELL); return (i<0||j<0||i>=GW||j>=GH) ? -1 : j*GW+i; };
function markDisc(x,z,r,val){ const n=Math.ceil(r/CELL); const ci=Math.floor((x-X0)/CELL), cj=Math.floor((z-Z0)/CELL); for(let j=cj-n;j<=cj+n;j++) for(let i=ci-n;i<=ci+n;i++){ if(i<0||j<0||i>=GW||j>=GH) continue; const cx=X0+(i+.5)*CELL, cz=Z0+(j+.5)*CELL; if((cx-x)**2+(cz-z)**2<=r*r) grid[j*GW+i]=Math.max(grid[j*GW+i],val); } }
function freeAt(x,z,r){ const n=Math.ceil(r/CELL); const ci=Math.floor((x-X0)/CELL), cj=Math.floor((z-Z0)/CELL); for(let j=cj-n;j<=cj+n;j++) for(let i=ci-n;i<=ci+n;i++){ if(i<0||j<0||i>=GW||j>=GH) return false; if(grid[j*GW+i]) return false; } return true; }
ROADS.forEach(r=>{ const w=r.w/2+(r.c==='y'?1:(KERB[r.c]||0)/2+1); for(let i=0;i<r.p.length-1;i++){ const a=r.p[i], b=r.p[i+1]; const L=Math.hypot(b[0]-a[0],b[1]-a[1]); for(let s=0;s<=L;s+=2){ const t=s/L; markDisc(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, w, 2); } } });

/* ---------- jetties: a deck on piles, level with the esplanade, rising as it walks out to sea ---------- */
const PIERS=DATA.piers||[];
const deckY=(x,z)=>{ if(!inSea(x,z)) return 0.9; const d=COAST.length ? Math.min(...COAST.map(l=>distToPolyline(x,z,l))) : 30; return 0.9+1.8*Math.min(1, d/30); };
(function(){
  if(!PIERS.length) return;
  const densify=(ring, step)=>{ const out=[]; for(let i=0;i<ring.length;i++){ const a=ring[i], b=ring[(i+1)%ring.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]), n=Math.max(1, Math.ceil(L/step)); for(let k=0;k<n;k++) out.push([a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n]); } return out; };
  /* every jetty becomes a ring: decks as drawn, walkways widened to their width */
  const rings=PIERS.map(q=>q.kind==='a' ? q.p : offsetLine(q.p, q.w/2).concat(offsetLine(q.p, -q.w/2).reverse())).map(r=>densify(r, 4));
  const tops=[], side=[], rail=[], piles=[];
  rings.forEach(r=>{
    const g=flatShapeGeom(shapeOf(r), 0), p=g.attributes.position;
    for(let i=0;i<p.count;i++) p.setY(i, deckY(p.getX(i), p.getZ(i)));
    tops.push(g);
    r.forEach((a,i)=>{ const b=r[(i+1)%r.length], ya=deckY(a[0],a[1]), yb=deckY(b[0],b[1]);
      side.push(a[0],ya,a[1], b[0],yb,b[1], b[0],yb-0.8,b[1],  a[0],ya,a[1], b[0],yb-0.8,b[1], a[0],ya-0.8,a[1]);
      if(inSea(a[0],a[1]) && inSea(b[0],b[1])) rail.push(a[0],ya,a[1], b[0],yb,b[1], b[0],yb+0.9,b[1],  a[0],ya,a[1], b[0],yb+0.9,b[1], a[0],ya+0.9,a[1]);
      if(i%2===0 && inSea(a[0],a[1])) piles.push([a[0],a[1],ya-0.8]); });
    /* nothing grows on a jetty */
    let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9; r.forEach(q=>{mnx=Math.min(mnx,q[0]);mxx=Math.max(mxx,q[0]);mnz=Math.min(mnz,q[1]);mxz=Math.max(mxz,q[1]);});
    for(let z=mnz-CELL;z<=mxz+CELL;z+=CELL) for(let x=mnx-CELL;x<=mxx+CELL;x+=CELL){ const k=gi(x,z); if(k>=0 && (pip(x,z,r) || distToRing(x,z,r)<2)) grid[k]=3; }
  });
  const deckGeo=mergeFlat(tops); /* mergeFlat keeps the heights and points every normal up */
  const deck=new THREE.Mesh(deckGeo, lam(0xcbbd9f)); deck.castShadow=true; deck.receiveShadow=true; scene.add(deck);
  const tri=(arr, color, opts)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr),3)); g.computeVertexNormals(); const m=new THREE.Mesh(g, lam(color, Object.assign({side:THREE.DoubleSide}, opts||{}))); m.castShadow=true; m.receiveShadow=true; scene.add(m); };
  tri(side, 0x7d6b55); if(rail.length) tri(rail, 0xf1ece2, {emissive:0x6b675f}); /* lit from both sides: the rail reads white whichever way it faces */
  if(piles.length){ const pg=new THREE.CylinderGeometry(.42,.42,1,6); pg.translate(0,.5,0); const pm=new THREE.InstancedMesh(pg, lam(0x5a4636), piles.length);
    const m=new THREE.Matrix4(); piles.forEach((q,i)=>{ m.makeScale(1,q[2]+0.6,1); m.setPosition(q[0],-0.6,q[1]); pm.setMatrixAt(i,m); }); pm.instanceMatrix.needsUpdate=true; pm.castShadow=true; scene.add(pm); }
})();

/* ---------- buildings: every footprint as it is drawn, at its real height (D_FOOT) ---------- */
/* The city is painted in: glass and concrete towers, sandstone on North Terrace, shopfronts, cottages with tin roofs.
   Its neighbours are plaster, the same shapes in one colour. Walls carry a facade drawn on a canvas, one window bay by
   one storey, repeated; floors line up across the street because v counts storeys from the ground. */
let suburbCount=0;
const unitBox=new THREE.BoxGeometry(1,1,1); unitBox.translate(0,.5,0);
const hip=(function(){ const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],R1=[-.22,1,0],R2=[.22,1,0]; const tri=[D,C,R2, D,R2,R1, B,A,R1, B,R1,R2, A,D,R1, C,B,R2]; const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tri.flat()),3)); g.computeVertexNormals(); return g; })();
const gable=(function(){ const A=[-.5,0,-.5],B=[.5,0,-.5],C=[.5,0,.5],D=[-.5,0,.5],R1=[-.5,1,0],R2=[.5,1,0]; const tri=[A,R1,R2, A,R2,B, D,C,R2, D,R2,R1, A,D,R1, B,R2,C]; const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tri.flat()),3)); g.computeVertexNormals(); return g; })();
const M4=new THREE.Matrix4(), Q=new THREE.Quaternion(), S3=new THREE.Vector3(), P3=new THREE.Vector3(), UP=new THREE.Vector3(0,1,0), col=new THREE.Color();
function place(mesh,i,x,y,z,ang,sx,sy,sz){ Q.setFromAxisAngle(UP,-ang); P3.set(x,y,z); S3.set(sx,sy,sz); M4.compose(P3,Q,S3); mesh.setMatrixAt(i,M4); }
function markRect(b,pad){ if(b.grid) b=b.grid; const r=Math.hypot(b.w,b.d)/2+pad, c=Math.cos(b.ang), s=Math.sin(b.ang); const n=Math.ceil(r/CELL), ci=Math.floor((b.x-X0)/CELL), cj=Math.floor((b.z-Z0)/CELL);
  for(let j=cj-n;j<=cj+n;j++) for(let i=ci-n;i<=ci+n;i++){ if(i<0||j<0||i>=GW||j>=GH) continue; const dx=X0+(i+.5)*CELL-b.x, dz=Z0+(j+.5)*CELL-b.z; const u=dx*c+dz*s, v=-dx*s+dz*c; if(Math.abs(u)<=b.w/2+pad && Math.abs(v)<=b.d/2+pad) grid[j*GW+i]=3; } }
/* every cell under a footprint, so no tree grows through a roof */
function markPoly(r){ const b=bbox(r); for(let z=Math.floor((b[1]-Z0)/CELL);z<=Math.floor((b[3]-Z0)/CELL);z++) for(let x=Math.floor((b[0]-X0)/CELL);x<=Math.floor((b[2]-X0)/CELL);x++){ if(x<0||z<0||x>=GW||z>=GH) continue; if(pip(X0+(x+.5)*CELL, Z0+(z+.5)*CELL, r)) grid[z*GW+x]=3; } }
/* the smallest box around a footprint: centre, long side, short side, and the long side's heading */
function obb(r){ let best=null; for(let i=0;i<r.length;i++){ const a=r[i], b=r[(i+1)%r.length], ang=Math.atan2(b[1]-a[1],b[0]-a[0]), c=Math.cos(ang), s=Math.sin(ang); let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(const p of r){ const u=p[0]*c+p[1]*s, v=-p[0]*s+p[1]*c; if(u<u0)u0=u; if(u>u1)u1=u; if(v<v0)v0=v; if(v>v1)v1=v; }
    const A=(u1-u0)*(v1-v0); if(!best||A<best.A) best={A,ang,u0,u1,v0,v1}; }
  const c=Math.cos(best.ang), s=Math.sin(best.ang), uc=(best.u0+best.u1)/2, vc=(best.v0+best.v1)/2; let w=best.u1-best.u0, d=best.v1-best.v0, ang=best.ang;
  if(d>w){ const t=w; w=d; d=t; ang+=Math.PI/2; } return { x:uc*c-vc*s, z:uc*s+vc*c, w, d, ang }; }

/* facades: drawn once, one window bay wide and one storey tall */
const ANISO=Math.min(8, renderer.capabilities.getMaxAnisotropy());
function facade(w, h, draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); draw(g, w, h, mulberry32(w*7+h)); const t=srgbTex(new THREE.CanvasTexture(c)); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=ANISO; return t; }
const speckle=(g,w,h,r,n,a)=>{ for(let i=0;i<n;i++){ g.fillStyle=`rgba(${r()<.5?0:255},${r()<.5?0:255},${r()<.5?0:255},${a*r()})`; g.fillRect(r()*w, r()*h, 1+r()*2, 1+r()*2); } };
const glassPane=(g,x,y,w,h,top,bot)=>{ const gr=g.createLinearGradient(0,y,0,y+h); gr.addColorStop(0,top); gr.addColorStop(1,bot); g.fillStyle=gr; g.fillRect(x,y,w,h); };
const FACADE={
  /* curtain wall: tall panes, a dark spandrel at each floor, slim light mullions */
  g: { bay:1.55, st:3.7, tex: facade(64,128,(g,w,h)=>{ glassPane(g,0,0,w,h,'#5d7684','#2c3c47'); g.fillStyle='#24303a'; g.fillRect(0,h*.8,w,h*.2); g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(w*.15,0,w*.25,h*.8); g.fillStyle='#a3abb0'; g.fillRect(0,0,3,h); g.fillRect(0,h*.8,w,2); }) },
  /* concrete office: punched windows with deep reveals */
  o: { bay:3.3, st:3.6, tex: facade(128,128,(g,w,h,r)=>{ g.fillStyle='#cbc5ba'; g.fillRect(0,0,w,h); speckle(g,w,h,r,500,.05); g.fillStyle='#9c968c'; g.fillRect(w*.12,h*.18,w*.76,h*.62); glassPane(g,w*.15,h*.2,w*.7,h*.56,'#536977','#27333c'); g.fillStyle='#b4aea3'; g.fillRect(w*.1,h*.78,w*.8,h*.05); }) },
  /* the other office: ribbon windows, a band of glass right round each floor */
  o2: { bay:1.8, st:3.6, tex: facade(64,128,(g,w,h,r)=>{ g.fillStyle='#d2cdc3'; g.fillRect(0,0,w,h); speckle(g,w,h,r,200,.04); glassPane(g,0,h*.3,w,h*.5,'#4c6270','#26323b'); g.fillStyle='#8f9aa0'; g.fillRect(0,h*.3,2,h*.5); g.fillStyle='#b9b3a8'; g.fillRect(0,h*.8,w,h*.03); }) },
  /* apartments: wide windows, a slab edge and a glass balustrade at every floor */
  a: { bay:4.2, st:3.05, tex: facade(128,128,(g,w,h,r)=>{ g.fillStyle='#e0d9cc'; g.fillRect(0,0,w,h); speckle(g,w,h,r,300,.04); glassPane(g,w*.08,h*.14,w*.6,h*.66,'#5e7380','#2b3843'); g.fillStyle='#d1cbbf'; g.fillRect(w*.72,h*.14,w*.2,h*.66); g.fillStyle='rgba(180,200,210,.55)'; g.fillRect(0,h*.6,w,h*.26); g.fillStyle='#8f8a80'; g.fillRect(0,h*.86,w,h*.14); }) },
  /* sandstone: a tall window under a lintel, a string course at each floor */
  h: { bay:3.8, st:4.6, tex: facade(128,256,(g,w,h,r)=>{ g.fillStyle='#c9ad7e'; g.fillRect(0,0,w,h); speckle(g,w,h,r,1500,.08); g.fillStyle='rgba(90,60,30,.12)'; for(let y=0;y<h;y+=16) g.fillRect(0,y,w,1); g.fillStyle='#dcc69c'; g.fillRect(w*.26,h*.14,w*.48,h*.66); g.fillStyle='#262b2e'; g.fillRect(w*.32,h*.2,w*.36,h*.56); g.fillStyle='#d9c49b'; g.fillRect(w*.48,h*.2,w*.04,h*.56); g.fillRect(0,h*.92,w,h*.08); }) },
  c: { bay:3.6, st:5.4, tex: null },
  /* institutions: red-brown brick, framed windows */
  u: { bay:3.6, st:3.8, tex: facade(128,128,(g,w,h,r)=>{ g.fillStyle='#a46f58'; g.fillRect(0,0,w,h); g.fillStyle='rgba(230,220,200,.18)'; for(let y=0;y<h;y+=6) g.fillRect(0,y,w,1); speckle(g,w,h,r,700,.1); g.fillStyle='#d5cec0'; g.fillRect(w*.18,h*.2,w*.64,h*.58); glassPane(g,w*.22,h*.24,w*.56,h*.5,'#4f6370','#28333b'); }) },
  /* shops and small offices: a rendered front with a wide window, a cornice line */
  m: { bay:4.0, st:4.0, tex: facade(128,128,(g,w,h,r)=>{ g.fillStyle='#d4cab8'; g.fillRect(0,0,w,h); speckle(g,w,h,r,400,.05); glassPane(g,w*.12,h*.2,w*.76,h*.52,'#53646e','#2a343c'); g.fillStyle='#bdb19d'; g.fillRect(0,0,w,h*.07); g.fillStyle='#c9bfac'; g.fillRect(w*.1,h*.72,w*.8,h*.04); }) },
  /* cottages: rendered or brick, a window with a white frame */
  s: { bay:4.6, st:3.3, tex: facade(128,128,(g,w,h,r)=>{ g.fillStyle='#ded5c3'; g.fillRect(0,0,w,h); speckle(g,w,h,r,400,.06); g.fillStyle='#f1ede4'; g.fillRect(w*.36,h*.24,w*.32,h*.52); glassPane(g,w*.39,h*.27,w*.26,h*.46,'#4a5a64','#29333a'); g.fillStyle='rgba(0,0,0,.18)'; g.fillRect(0,0,w,h*.06); }) },
  /* car parks: open decks between concrete edges */
  p: { bay:6, st:3.0, tex: facade(128,64,(g,w,h,r)=>{ g.fillStyle='#bbb7ae'; g.fillRect(0,0,w,h); speckle(g,w,h,r,200,.06); g.fillStyle='#2b2d2f'; g.fillRect(0,h*.3,w,h*.52); g.fillStyle='#8d8a84'; g.fillRect(0,h*.3,w,2); g.fillStyle='#9a968f'; g.fillRect(w*.47,h*.3,w*.06,h*.52); }) },
  x: { bay:3, st:3, tex: facade(64,64,(g,w,h)=>{ g.fillStyle='#b4b6b3'; g.fillRect(0,0,w,h); g.fillStyle='rgba(0,0,0,.12)'; for(let x=0;x<w;x+=4) g.fillRect(x,0,1,h); }) },
  z: { bay:6, st:6, tex: null },
};
FACADE.c.tex=FACADE.h.tex;
/* per-building tints over the facade: a teal, grey or bronze glass; cream, grey or warm concrete; brick, bluestone or render */
const TINT={ g:[[0xa9c3cc,3],[0x96a6ad,3],[0xb2c0b8,2],[0xc2b39c,1],[0xd2dbdf,2]], o:[[0xffffff,3],[0xece5d8,2],[0xdedad3,2],[0xf2e5cf,1],[0xc9c7c2,1]], o2:[[0xffffff,3],[0xe4e0d8,2],[0xd0d3d4,2],[0xeee2cc,1]],
  a:[[0xffffff,3],[0xf4ebdc,2],[0xe8e4dc,2],[0xe9dccb,1]], h:[[0xffffff,4],[0xece0cb,2],[0x8c8f92,2]], c:[[0xffffff,3],[0x8f9295,2]], u:[[0xffffff,3],[0xd9b9a6,1],[0xe8e0d4,2]],
  m:[[0xffffff,3],[0xf1e2cb,2],[0xe2d4c2,2],[0xdcdcda,2],[0xeccdb5,1],[0xcbd6d0,1],[0xd8c3a5,1]], s:[[0xffffff,3],[0xe6d2b2,2],[0xc58067,2],[0xb3b6b6,1],[0xf1ebe0,2]],
  p:[[0xffffff,3],[0xe9e4da,1]], x:[[0xffffff,2],[0xd9d4ca,1]], z:[[0xf4f4f0,1]] };
const ROOF_FLAT=[[0xb9b7b0,3],[0xd3d1ca,3],[0x8e9091,2],[0xa59f94,2],[0x717578,1],[0xdedbd2,2]];
const ROOF_TIN=[[0x9ea5a8,3],[0x4d5155,3],[0x6d7068,2],[0x8a5a47,2],[0x6c3b30,1],[0x50575b,1]];
const ROOF_SLATE=[[0x4f5559,2],[0x5b6062,2],[0x8d9497,1]];
const PLASTER=0xe6e2d9, PLASTER_ROOF=0xd6d2c9;
/* walls darken toward the ground (the light they don't get), so each building sits on the street */
function ao(m){ m.onBeforeCompile=s=>{ s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying float vAoY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvAoY=position.y;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vAoY;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(.5,1.,smoothstep(0.,7.,vAoY));'); }; return m; }
const std=(o)=>ao(new THREE.MeshStandardMaterial(Object.assign({ vertexColors:true, side:THREE.DoubleSide }, o)));
const WALL_MAT={ g:std({map:FACADE.g.tex, roughness:.14, metalness:.55, envMapIntensity:1.25}), o:std({map:FACADE.o.tex, roughness:.72, metalness:.05, envMapIntensity:.6}), o2:std({map:FACADE.o2.tex, roughness:.5, metalness:.15, envMapIntensity:.8}),
  a:std({map:FACADE.a.tex, roughness:.75, envMapIntensity:.55}), h:std({map:FACADE.h.tex, roughness:.92}), c:std({map:FACADE.h.tex, roughness:.92}), u:std({map:FACADE.u.tex, roughness:.85}),
  m:std({map:FACADE.m.tex, roughness:.8, envMapIntensity:.5}), s:std({map:FACADE.s.tex, roughness:.9}), p:std({map:FACADE.p.tex, roughness:.92}), x:std({map:FACADE.x.tex, roughness:.6, metalness:.3}),
  z:std({roughness:.55, color:C(0xf3f3ef)}), plaster:std({roughness:.95}) };
const roofTex=noiseTex(128, 16, .8, 1.0, 41); roofTex.repeat.set(1/12,1/12);
const ROOF_MAT=std({map:roofTex, roughness:.9}), PLANT_MAT=std({roughness:.55, metalness:.35});

function Bucket(){ this.P=[]; this.N=[]; this.U=[]; this.Cl=[]; this.I=[]; this.n=0; }
Bucket.prototype.v=function(x,y,z,nx,ny,nz,u,v,c){ this.P.push(x,y,z); this.N.push(nx,ny,nz); this.U.push(u,v); this.Cl.push(c.r,c.g,c.b); return this.n++; };
Bucket.prototype.mesh=function(mat){ if(!this.n) return null; const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(this.P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(this.N,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.U,2)); g.setAttribute('color',new THREE.Float32BufferAttribute(this.Cl,3)); g.setIndex(this.I); const m=new THREE.Mesh(g, mat); m.castShadow=true; m.receiveShadow=true; return m; };
/* a wall per footprint edge, facing out of the building (courtyard walls face into the courtyard) */
function walls(B, ring, lo, hi, bay, st, c){
  for(let i=0;i<ring.length;i++){ const a=ring[i], b=ring[(i+1)%ring.length], dx=b[0]-a[0], dz=b[1]-a[1], L=Math.hypot(dx,dz); if(L<.05) continue;
    const nx=dz/L, nz=-dx/L, tiles=Math.max(1, Math.round(L/bay)), v0=lo/st, v1=hi/st;
    const k=B.v(a[0],lo,a[1],nx,0,nz,0,v0,c); B.v(b[0],lo,b[1],nx,0,nz,tiles,v0,c); B.v(b[0],hi,b[1],nx,0,nz,tiles,v1,c); B.v(a[0],hi,a[1],nx,0,nz,0,v1,c);
    /* wound so the front face looks along the outward normal (the walls are two-sided: the inside of a parapet shows) */
    B.I.push(k,k+2,k+1, k,k+3,k+2); }
}
function cap(B, rings, y, c, uvs){
  const tri=THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(p[0],p[1])), rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(p[0],p[1]))));
  const all=[].concat(...rings), k=B.n; all.forEach(p=>B.v(p[0],y,p[1],0,1,0,p[0]/uvs,p[1]/uvs,c));
  tri.forEach(f=>{ const a=all[f[0]], b=all[f[1]], d=all[f[2]]; const cr=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]); if(cr<0) B.I.push(k+f[0],k+f[1],k+f[2]); else B.I.push(k+f[0],k+f[2],k+f[1]); });
}
function box(B, x, z, w, d, ang, y0, h, c){
  const co=Math.cos(ang), si=Math.sin(ang), P=(u,v)=>[x+u*co-v*si, z+u*si+v*co], r=[P(-w/2,-d/2),P(w/2,-d/2),P(w/2,d/2),P(-w/2,d/2)];
  walls(B, r, y0, y0+h, 1e9, 1e9, c); cap(B, [r], y0+h, c, 1e9);
}
const tintPick=(arr,r)=>{ let tot=0; arr.forEach(a=>tot+=a[1]); let x=r()*tot; for(const a of arr){ if((x-=a[1])<=0) return a[0]; } return arr[0][0]; };
const brng=mulberry32((PLAN.seed^0xb1d9)>>>0);
const WB={}, roofB=new Bucket(), plantB=new Bucket(), pitched=[];
DATA.foot.forEach(f=>{
  const ring=f.rings[0], ctr=centroid(ring), inside=inSuburb(ctr[0],ctr[1]), A=polyArea(ring);
  if(inside && f.k!=='x') suburbCount++;
  f.rings.forEach((r,i)=>{ if(i===0) markPoly(r); });
  const fk = f.k==='o' && brng()<.45 ? 'o2' : (f.k==='u' && brng()<.5) || (f.k==='m' && f.h<14 && brng()<.2) ? 'h' : f.k;
  const k=inside ? fk : 'plaster', fs=FACADE[fk]||FACADE.m, tint=C(inside ? tintPick(TINT[fk]||TINT.m, brng) : PLASTER).multiplyScalar(inside ? .86+brng()*.1 : .98+brng()*.04);
  const B=WB[k]||(WB[k]=new Bucket());
  const roof=f.r && A<4000 ? f.r : '';
  f.rings.forEach(r=>walls(B, r, f.b, f.h, fs.bay, fs.st, tint));
  if(roof){ const o=obb(ring); pitched.push({o, y:f.h, kind:roof, k:f.k, inside}); return; }
  /* flat roofs: sunk a little behind a parapet on anything over two storeys */
  const ry=f.h-(f.h>8 && A>150 ? .9 : 0), rc=C(inside ? tintPick(ROOF_FLAT, brng) : PLASTER_ROOF);
  cap(roofB, f.rings, ry, rc, 12);
  /* plant on the roof: air-handling boxes, and a lift overrun on the towers */
  if(inside && f.h>10 && A>220){ const b=bbox(ring); const n=Math.min(7, Math.floor(A/450)+1), pc=C(tintPick([[0xc9cbcb,3],[0xa9adb0,2],[0xe3e3df,2],[0x7f8487,1]], brng));
    if(f.h>30){ const w=5+brng()*3; if(pip(ctr[0],ctr[1],ring)) box(plantB, ctr[0], ctr[1], w, w*.8, obb(ring).ang, ry, 3.2+brng()*1.6, pc); }
    for(let t=0, made=0; t<n*8 && made<n; t++){ const x=b[0]+brng()*(b[2]-b[0]), z=b[1]+brng()*(b[3]-b[1]), w=2+brng()*3.5, d=1.6+brng()*2.4;
      if(!pip(x,z,ring) || distToRing(x,z,ring)<Math.hypot(w,d)/2+1) continue; box(plantB, x, z, w, d, obb(ring).ang, ry, 1+brng()*1.8, pc); made++; } }
});
Object.keys(WB).forEach(k=>{ const m=WB[k].mesh(k==='plaster' ? WALL_MAT.plaster : WALL_MAT[k]); if(m) scene.add(m); });
/* the ground darkens where it meets a wall (sky it can't see): a soft skirt round each footprint, fading out over a few metres */
(function(){
  const c=document.createElement('canvas'); c.width=4; c.height=64; const g=c.getContext('2d'), gr=g.createLinearGradient(0,0,0,64);
  gr.addColorStop(0,'rgba(0,0,0,.55)'); gr.addColorStop(.35,'rgba(0,0,0,.22)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,4,64);
  const P=[], U=[], I=[]; let n=0;
  DATA.foot.forEach(f=>{ if(f.b>0) return; const r=f.rings[0], W=Math.min(3.5, 1.2+f.h*.08);
    for(let i=0;i<r.length;i++){ const a=r[i], b=r[(i+1)%r.length], dx=b[0]-a[0], dz=b[1]-a[1], L=Math.hypot(dx,dz); if(L<.5) continue; const nx=dz/L*W, nz=-dx/L*W;
      P.push(a[0],.66,a[1], b[0],.66,b[1], b[0]+nx,.66,b[1]+nz, a[0]+nx,.66,a[1]+nz); U.push(0,0, 1,0, 1,1, 0,1); I.push(n,n+2,n+1, n,n+3,n+2); n+=4; } });
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute(U,2)); geo.setIndex(I);
  const m=new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2}));
  m.renderOrder=1; scene.add(m);
})();
[roofB.mesh(ROOF_MAT), plantB.mesh(PLANT_MAT)].forEach(m=>{ if(m) scene.add(m); });
/* pitched roofs: hipped on cottages, steep gables on churches, a dome where the map says so */
(function(){
  const roofMat=new THREE.MeshStandardMaterial({ roughness:.62, metalness:.25, side:THREE.DoubleSide }), byKind={h:[], g:[], d:[]};
  pitched.forEach(p=>(byKind[p.kind]||byKind.h).push(p));
  const dome=new THREE.SphereGeometry(.5,20,10,0,Math.PI*2,0,Math.PI/2); dome.scale(1,2,1);
  [['h',hip],['g',gable],['d',dome]].forEach(([kind,geo])=>{ const list=byKind[kind]; if(!list.length) return;
    const m=new THREE.InstancedMesh(geo, roofMat, list.length); m.castShadow=m.receiveShadow=true;
    list.forEach((p,i)=>{ const o=p.o, steep=p.k==='c', rh=kind==='d' ? Math.min(o.w,o.d)*.5 : steep ? Math.min(14, o.d*.55) : Math.min(4.4, Math.max(1.5, o.d*(kind==='g' ? .4 : .32)));
      place(m,i,o.x,p.y,o.z,o.ang,kind==='d' ? Math.min(o.w,o.d) : o.w*1.04,rh,kind==='d' ? Math.min(o.w,o.d) : o.d*1.08);
      m.setColorAt(i, C(p.inside ? tintPick(steep||p.k==='h' ? ROOF_SLATE : ROOF_TIN, brng) : PLASTER_ROOF)); });
    m.instanceMatrix.needsUpdate=true; if(m.instanceColor) m.instanceColor.needsUpdate=true; scene.add(m); });
})();

/* ---------- trees: every tree OpenStreetMap has, where it stands, and a scatter more across the Park Lands ---------- */
/* River red and blue gums in the parks (grey-green, open, tall), plane trees down the streets (fresh green in spring),
   small ornamentals, and the odd dark pine. The neighbours' trees are paler, like their plaster. */
markDisc(PLAN.board.x, PLAN.board.z, 24, 3);
const trees=[];
const roadNear=(x,z,r)=>{ const n=Math.ceil(r/CELL), ci=Math.floor((x-X0)/CELL), cj=Math.floor((z-Z0)/CELL); for(let j=cj-n;j<=cj+n;j+=2) for(let i=ci-n;i<=ci+n;i+=2){ if(i<0||j<0||i>=GW||j>=GH) continue; if(grid[j*GW+i]===2) return true; } return false; };
function addTree(x,z,real){ if(x<X0+4||x>X1-4||z<Z0+4||z>Z1-4||inLake(x,z)) return false; const k=gi(x,z); if(k<0||grid[k]===3) return false;
  const street=roadNear(x,z,9), inside=inSuburb(x,z), r=rnd(); let kind;
  if(street) kind = r<.62 ? 'plane' : r<.86 ? 'small' : 'gum'; else kind = r<.72 ? 'gum' : r<.88 ? 'plane' : 'small';
  trees.push({x,z,kind,inside,real}); markDisc(x,z,real ? 5 : 6,1); return true; }
DATA.trees.forEach(p=>addTree(p[0],p[1],true));
/* the Park Lands are open woodland: fill the parks where the map has no trees, never closer than the trees already there */
AREAS.filter(a=>a.c==='o'||a.c==='k'||a.c==='c').forEach(a=>{ const per=a.c==='k' ? 900 : a.c==='c' ? 3000 : 2200, n=Math.min(600, Math.floor(polyArea(a.p)/per)); const b=bbox(a.p);
  for(let made=0, tries=0; made<n && tries<n*10; tries++){ const x=b[0]+rnd()*(b[2]-b[0]), z=b[1]+rnd()*(b[3]-b[1]); if(!pip(x,z,a.p) || !freeAt(x,z,7)) continue; if(addTree(x,z,false)) made++; } });
(function(){
  const wob=mulberry32(7), LOBES=PHONE ? [1,1] : [3,3];   /* 15,000 trees: twenty triangles a lobe is the budget */
  /* a lumpy ball, lit as if round (normals from the centre): foliage, not facets */
  /* a crown: three to five lumpy lobes around the middle, each lit as if round (normals from the crown's centre),
     so it reads as foliage, not a faceted ball on a stick */
  const blob=seed=>{ const r=mulberry32(seed), lobes=LOBES[0]+Math.floor(r()*(LOBES[1]-LOBES[0]+1)), P=[], N=[];
    for(let l=0;l<lobes;l++){ const g=new THREE.IcosahedronGeometry(1,0), p=g.attributes.position, cache={};
      const a=l/lobes*Math.PI*2+r()*.8, d=l===0 ? 0 : .36+r()*.2, ox=Math.cos(a)*d, oz=Math.sin(a)*d, oy=(l===0 ? .1 : -.08+r()*.3), s=lobes===1 ? 1 : l===0 ? .8 : .58+r()*.18;
      for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i), key=x.toFixed(3)+','+y.toFixed(3)+','+z.toFixed(3); const k=cache[key]||(cache[key]=.8+r()*.4);
        const X=ox+x*s*k, Y=oy+y*s*k, Z=oz+z*s*k, L=Math.hypot(X,Y*1.2,Z)||1; P.push(X,Y,Z); N.push(X/L,Y*1.2/L,Z/L); } }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); return g; };
  const shapes=[blob(1),blob(2),blob(3)], cone=new THREE.ConeGeometry(1,1,8); cone.translate(0,.5,0);
  const trunk=new THREE.CylinderGeometry(.2,.32,1,4,1,true); trunk.translate(0,.5,0);
  const GUM=[0x59624a,0x646b4f,0x4e573f,0x6d7357,0x566048], PLANE=[0x52703a,0x5b7a3e,0x4a6634,0x668243], SMALL=[0x5a7440,0x6b7b45,0x66603f,0x4d663b], PINE=[0x33462f,0x3c4f34];
  const plaster=C(0xd4d6c6), byShape=[[],[],[]], pines=[];
  trees.forEach(t=>{ if(t.kind==='pine') pines.push(t); else byShape[Math.floor(wob()*3)].push(t); });
  const lambF=new THREE.MeshLambertMaterial({color:0xffffff}), all=[];
  byShape.forEach((list,si)=>{ if(!list.length) return; const m=new THREE.InstancedMesh(shapes[si], lambF, list.length); all.push(m);
    list.forEach((t,i)=>{ const pal=t.kind==='gum' ? GUM : t.kind==='plane' ? PLANE : SMALL;
      const r = t.kind==='gum' ? 4+rnd()*3.8 : t.kind==='plane' ? 3.6+rnd()*2.2 : 2+rnd()*1.3, h = t.kind==='gum' ? 5.5+rnd()*5 : t.kind==='plane' ? 3.8+rnd()*2 : 1.8+rnd()*1.2;
      t.r=r; t.h=h; place(m,i,t.x,h+r*.6,t.z,rnd()*6,r*(.9+rnd()*.25),r*(t.kind==='gum' ? .78 : .92),r*(.9+rnd()*.25));
      col.copy(C(pal[Math.floor(rnd()*pal.length)])).multiplyScalar(.9+rnd()*.2); if(!t.inside) col.lerp(plaster,.42); m.setColorAt(i,col); }); });
  if(pines.length){ const m=new THREE.InstancedMesh(cone, lambF, pines.length); all.push(m);
    pines.forEach((t,i)=>{ const r=2.8+rnd()*1.8, h=9+rnd()*7; t.r=r; t.h=2; place(m,i,t.x,2,t.z,0,r,h,r); col.copy(C(PINE[i%2])); if(!t.inside) col.lerp(plaster,.42); m.setColorAt(i,col); }); }
  const tm=new THREE.InstancedMesh(trunk, lam(0x5d4c3b), trees.length); all.push(tm);
  trees.forEach((t,i)=>place(tm,i,t.x,0,t.z,0,t.kind==='gum' ? 1.5 : 1.1,t.h+(t.r||2)*.3,t.kind==='gum' ? 1.5 : 1.1));
  all.forEach(m=>{ m.castShadow=true; m.receiveShadow=true; m.instanceMatrix.needsUpdate=true; if(m.instanceColor) m.instanceColor.needsUpdate=true; scene.add(m); });
})();

/* ---------- the board ---------- */
const BOARD=PLAN.board;
const boardCanvas=document.createElement('canvas'); boardCanvas.width=1024; boardCanvas.height=400;
const boardTex=srgbTex(new THREE.CanvasTexture(boardCanvas)); boardTex.anisotropy=Math.min(8, renderer.capabilities.getMaxAnisotropy());
function fitFont(g, text, weight, maxW, start, family){ let s=start; do { g.font=`${weight} ${s}px ${family}`; if(g.measureText(text).width<=maxW) break; s-=4; } while(s>28); return s; }
/* fit by shrinking, then by cutting with an ellipsis: a name from the server can be any length */
function fitLine(g, text, weight, maxW, start, family){ fitFont(g, text, weight, maxW, start, family); if(g.measureText(text).width<=maxW) return text; const cp=Array.from(text); while(cp.length>1 && g.measureText(cp.join('')+'…').width>maxW) cp.pop(); return cp.join('').trimEnd()+'…'; }
/* the host's photo (DESIGN.md §2.7): built into the page as a data: URI, so it loads from nowhere */
const HOST=PLAN.host||null, hostImg=HOST ? new Image() : null;
let boardNow=null;
if(hostImg){ hostImg.onload=()=>{ if(boardNow && boardNow.host) drawBoard(boardNow); }; hostImg.src=HOST.photo; }
/* the host's board: their photo in a gold ring, then their name, their line and their number under it (each if given) */
function drawHost(g, L, F){
  const cx=530, both=L.name && L.phone, cy=both ? 100 : (L.name || L.phone) ? 122 : 150, r=both ? 84 : (L.name || L.phone) ? 100 : 118;
  g.fillStyle='#f2c14e'; g.beginPath(); g.arc(cx,cy,r+11,0,Math.PI*2); g.fill();
  g.save(); g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.clip();
  g.fillStyle='#e4ddcf'; g.fillRect(cx-r,cy-r,2*r,2*r);
  if(hostImg && hostImg.complete && hostImg.naturalWidth){ const s=Math.min(hostImg.naturalWidth, hostImg.naturalHeight); g.drawImage(hostImg, (hostImg.naturalWidth-s)/2, (hostImg.naturalHeight-s)/2, s, s, cx-r, cy-r, 2*r, 2*r); }
  g.restore();
  g.fillStyle='#1b2326'; g.textAlign='center'; g.textBaseline='alphabetic';
  if(both){
    g.fillStyle='#3a4345'; g.fillText(fitLine(g, L.name, 700, 900, 40, F), cx, 240);
    g.fillStyle='#1b2326'; g.fillText(fitLine(g, L.low, 800, 900, 46, F), cx, 304);
    g.fillStyle='#b5583c'; g.fillText(fitLine(g, L.phone, 800, 900, 58, F), cx, 370);
  } else if(L.name){
    g.fillStyle='#3a4345'; g.fillText(fitLine(g, L.name, 700, 900, 42, F), cx, 278);
    g.fillStyle='#1b2326'; g.fillText(fitLine(g, L.low, 800, 900, 52, F), cx, 350);
  } else if(L.phone){
    g.fillText(fitLine(g, L.low, 700, 900, 46, F), cx, 296);
    g.fillStyle='#b5583c'; g.fillText(fitLine(g, L.phone, 800, 900, 62, F), cx, 370);
  } else g.fillText(fitLine(g, L.low, 800, 900, 54, F), cx, 350);
  g.textAlign='left';
}
/* L: { head, big, low, paid, placeholder, host } from boardLines() (lib/page.mjs) */
function drawBoard(L){
  const g=boardCanvas.getContext('2d'), Wc=1024, Hc=400, F='Figtree, system-ui, sans-serif';
  boardNow=L;
  g.fillStyle='#f6f2e9'; g.fillRect(0,0,Wc,Hc);
  g.fillStyle='#173a35'; g.fillRect(0,0,26,Hc);
  g.fillStyle='#f2c14e'; g.fillRect(26,0,10,Hc);
  if(L.host){ drawHost(g, L, F); boardTex.needsUpdate=true; return; }
  g.fillStyle='#b5583c'; g.textBaseline='alphabetic';
  g.fillText(fitLine(g, L.head, 800, 880, 40, F), 78, 92);
  g.fillStyle=L.placeholder ? '#9a958b' : '#1b2326';
  g.fillText(fitLine(g, L.big, 800, 880, 150, F), 74, 250);
  if(L.placeholder){ g.strokeStyle='#c9c3b6'; g.setLineDash([18,14]); g.lineWidth=5; g.strokeRect(58,128,920,150); g.setLineDash([]); }
  g.fillStyle='#4c5658';
  g.fillText(fitLine(g, L.low, 600, 880, 48, F), 78, 344);
  if(L.paid){ /* the disclosure, top-right: what a paying agent's board looks like */
    const t='PAID PLACEMENT', sp=3.2; g.font=`700 21px ${F}`; let tw=-sp; for(const ch of t) tw+=g.measureText(ch).width+sp;
    const h=34, w=Math.ceil(tw)+30, x=Wc-22-w, y=20;
    g.fillStyle='#1b2326'; g.beginPath(); g.moveTo(x+h/2,y); g.arcTo(x+w,y,x+w,y+h,h/2); g.arcTo(x+w,y+h,x,y+h,h/2); g.arcTo(x,y+h,x,y,h/2); g.arcTo(x,y,x+w,y,h/2); g.fill();
    g.fillStyle='#f6f2e9'; g.textBaseline='middle'; let cx=x+15; for(const ch of t){ g.fillText(ch, cx, y+h/2+1); cx+=g.measureText(ch).width+sp; } g.textBaseline='alphabetic'; }
  boardTex.needsUpdate=true;
}
let boardFace=null;
(function(){
  const grp=new THREE.Group(); grp.position.set(BOARD.x,0,BOARD.z); grp.rotation.y=BOARD.face;
  const steel=lam(0x2f3a3a);
  [-17,17].forEach(x=>{ const p=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,32,10), steel); p.position.set(x,16,-.7); p.castShadow=true; grp.add(p); });
  const frame=new THREE.Mesh(new THREE.BoxGeometry(52.5,21.5,1), lam(0x173a35)); frame.position.set(0,22.5,-.8); frame.castShadow=true; grp.add(frame);
  const faceMat=new THREE.MeshLambertMaterial({map:boardTex, emissive:0xffffff, emissiveMap:boardTex, emissiveIntensity:.38});
  const face=new THREE.Mesh(new THREE.BoxGeometry(50,19.5,1.2), [steel,steel,steel,steel,faceMat,steel]); face.position.set(0,22.5,0); face.castShadow=true; grp.add(face); boardFace=face;
  const walk=new THREE.Mesh(new THREE.BoxGeometry(50,.6,2.8), steel); walk.position.set(0,12.4,1.4); grp.add(walk);
  scene.add(grp);
  markDisc(BOARD.x,BOARD.z,22,3);
})();

/* ---------- the plaque on the front rail ---------- */
function makePlaque(){
  const c=document.createElement('canvas'); c.width=1536; c.height=128; const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,0,128); gr.addColorStop(0,'#d9b56a'); gr.addColorStop(.5,'#b98d43'); gr.addColorStop(1,'#a77b35'); g.fillStyle=gr; g.fillRect(0,0,1536,128);
  g.strokeStyle='rgba(60,40,10,.55)'; g.lineWidth=4; g.strokeRect(10,10,1516,108);
  g.fillStyle='#3a2a10'; g.textAlign='center'; const head=`${PLAN.name.toUpperCase()}  ·  SOUTH AUSTRALIA ${PLAN.postcode}`; fitFont(g, head, 400, 1440, 58, '"Young Serif", Georgia, serif'); g.fillText(head, 768, 70);
  g.font='600 26px Figtree, system-ui, sans-serif'; g.fillText(`${suburbCount} buildings in the suburb, ${credits(DATA.src).plaque}`, 768, 106);
  const t=srgbTex(new THREE.CanvasTexture(c)); t.anisotropy=Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const m=new THREE.Mesh(new THREE.PlaneGeometry(330,27.5), new THREE.MeshLambertMaterial({map:t, emissive:0xffffff, emissiveMap:t, emissiveIntensity:.25}));
  m.position.set((X0+X1)/2, -14, Z1+RIM+0.3); scene.add(m);
}

/* ---------- labels: their own scene, drawn after the lens so they stay sharp ---------- */
const labelScene=new THREE.Scene();
function label(text, x, y, z){
  const c=document.createElement('canvas'), g=c.getContext('2d'); const F='600 40px Figtree, system-ui, sans-serif'; g.font=F; const w=Math.ceil(g.measureText(text).width)+56; c.width=w; c.height=72;
  g.font=F; g.fillStyle='rgba(250,247,240,.92)'; const r=36; g.beginPath(); g.moveTo(r,0); g.arcTo(w,0,w,72,r); g.arcTo(w,72,0,72,r); g.arcTo(0,72,0,0,r); g.arcTo(0,0,w,0,r); g.fill();
  g.fillStyle='#1d2a2e'; g.textBaseline='middle'; g.fillText(text, 28, 38);
  const t=srgbTex(new THREE.CanvasTexture(c)); const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t, depthTest:false, sizeAttenuation:false, transparent:true, toneMapped:false}));
  const h=0.021; s.scale.set(h*w/72, h, 1); s.position.set(x,y,z); s.renderOrder=10; s.center.set(.5,0); labelScene.add(s); return s;
}
function makeLabels(){ PLAN.labels.forEach(l=>label(l.text, l.x, l.y, l.z)); }

/* ---------- traffic and boats ---------- */
const cars=[];
const TP=PLAN.traffic.map(t=>({...t, P:mkPath(t.path)})), maxCars=Math.max(0, ...TP.map(t=>t.cars));
for(let i=0;i<maxCars;i++) TP.forEach(t=>{ if(i>=t.cars) return;
  cars.push({path:t.P, s: t.loop ? t.P.L*i/t.cars+rnd()*40 : rnd()*t.P.L, dir: t.dirs.length>1 ? t.dirs[i%t.dirs.length] : t.dirs[0], loop:t.loop, v:t.speed[0]+rnd()*(t.speed[1]-t.speed[0]), lane: t.lanes.length>1 ? (rnd()<.5?t.lanes[0]:t.lanes[1]) : t.lanes[0]}); });
ROADS.filter(r=>(r.c==='t'||r.c==='r')).map(r=>({P:mkPath(r.p), oneway:r.oneway})).filter(o=>o.P.L>260).sort((a,b)=>b.P.L-a.P.L).slice(0,PLAN.localCars).forEach(o=>{ const p=o.P; cars.push({path:p, s:rnd()*p.L, dir: o.oneway ? 1 : (rnd()<.5?1:-1), loop:false, v:7+rnd()*4, lane:-2.2}); });
const CAR_COLS=[0xeaeae7,0xb9bdc1,0x1f2124,0xeaeae7,0x6d7277,0xb9bdc1,0x23272b,0xeaeae7,0x2c3d5b,0x8b2b25,0xc8c0ad,0x6d7277,0x1f2124,0x3e4a40];
const body=new THREE.BoxGeometry(4.6,.95,1.85); body.translate(0,.75,0);
const cab=new THREE.BoxGeometry(2.6,.7,1.7); cab.translate(-.25,1.55,0);
const carBody=new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({color:0xffffff, roughness:.35, metalness:.5}), Math.max(1,cars.length)), carCab=new THREE.InstancedMesh(cab, lam(0x27313a), Math.max(1,cars.length)); carBody.count=carCab.count=cars.length;
cars.forEach((c,i)=>carBody.setColorAt(i, C(CAR_COLS[(i*7)%CAR_COLS.length])));
if(carBody.instanceColor) carBody.instanceColor.needsUpdate=true; carBody.receiveShadow=carCab.receiveShadow=true; scene.add(carBody); scene.add(carCab);
function updateCars(dt){
  cars.forEach((c,i)=>{ c.s+=c.v*dt*c.dir; if(c.loop){ if(c.s>c.path.L) c.s-=c.path.L; if(c.s<0) c.s+=c.path.L; } else { if(c.s>c.path.L){ c.s=c.path.L; c.dir=-1; } if(c.s<0){ c.s=0; c.dir=1; } }
    const q=at(c.path,c.s); const tx=q[2]*c.dir, tz=q[3]*c.dir; const lx=tz, lz=-tx; const x=q[0]-lx*c.lane, z=q[1]-lz*c.lane;
    place(carBody,i,x,0.3,z,Math.atan2(tz,tx),1,1,1); place(carCab,i,x,0.3,z,Math.atan2(tz,tx),1,1,1); });
  carBody.instanceMatrix.needsUpdate=true; carCab.instanceMatrix.needsUpdate=true;
}
/* a rowing eight on the lake */
const rowPath=PLAN.rowing ? mkPath(PLAN.rowing) : null; const eight=new THREE.Group();
(function(){ const hull=new THREE.Mesh(new THREE.BoxGeometry(24,.9,2), lam(0xf6f3ec)); hull.position.y=.6; eight.add(hull); for(let i=0;i<8;i++){ const r=new THREE.Mesh(new THREE.BoxGeometry(.9,1.6,1.1), lam(i%2?0x1e3d6b:0xb5583c)); r.position.set(-9+i*2.4,1.7,0); eight.add(r); const oar=new THREE.Mesh(new THREE.BoxGeometry(.35,.2,13), lam(0xf2c14e)); oar.position.set(-9+i*2.4,1.2,0); oar.rotation.y=.35; eight.add(oar); } if(rowPath) scene.add(eight); })();
let rowS=0, rowDir=1;
/* sailing boats on the gulf */
const yachts=PLAN.yachts.map((p,i)=>{ const g=new THREE.Group(); const h=new THREE.Mesh(new THREE.BoxGeometry(11,1.6,3.6), lam(0xf6f3ec)); h.position.y=.8; g.add(h); const mast=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,15,5), lam(0x8d8f91)); mast.position.set(.8,8,0); g.add(mast);
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([.8,1.8,0, .8,15,0, -5.2,1.8,0]),3)); sg.computeVertexNormals(); const sail=new THREE.Mesh(sg, new THREE.MeshLambertMaterial({color:i%2?0xffffff:0xf3e6c4, side:THREE.DoubleSide})); g.add(sail); g.position.set(p[0],0,p[1]); g.userData={x:p[0], z:p[1], r:p[2]||60, ph:i*1.7}; scene.add(g); return g; });
/* a regatta (PLAN.regatta): a buoyed course down the lake, red buoys on its outer lines and white between the lanes,
   and an eight in every lane racing it; then they paddle back to the start and race again */
const regatta=(function(){
  const R=PLAN.regatta; if(!R) return null;
  const rr=mulberry32((PLAN.seed^0x40ea7a)>>>0);
  const bp=[]; R.lines.forEach(l=>{ const P=mkPath(l.p); for(let s=0;s<=P.L+.01;s+=R.buoyGap){ const q=at(P,Math.min(s,P.L-.01)); bp.push({x:q[0], z:q[1], red:l.outer, ph:rr()*6.28}); } });
  const bg=new THREE.SphereGeometry(.8,10,7), reds=bp.filter(b=>b.red), whites=bp.filter(b=>!b.red);
  const rm=new THREE.InstancedMesh(bg, lam(0xd8443a,{emissive:0x4a0d08}), reds.length), wm=new THREE.InstancedMesh(bg, lam(0xf7f5f0,{emissive:0x3a3a36}), whites.length);
  scene.add(rm); scene.add(wm);
  const BLADES=[0xd8443a,0x2f6db5,0xf2c14e,0x3c8c6a,0xe07a2f,0x7b3fa0,0xf4f1ea,0x1d2a2e];
  const boats=R.lanes.map((lane,k)=>{ const P=mkPath(lane), g=new THREE.Group(); scene.add(g);
    const hull=new THREE.Mesh(new THREE.BoxGeometry(24,.9,2), lam(0xf6f3ec)); hull.position.y=.55; g.add(hull);
    const bow=new THREE.Mesh(new THREE.ConeGeometry(1,3,4), lam(0xf6f3ec)); bow.rotation.z=-Math.PI/2; bow.rotation.x=Math.PI/4; bow.position.set(13.4,.55,0); g.add(bow);
    const c=BLADES[k%BLADES.length], oars=[];
    for(let i=0;i<8;i++){ const x=-8.5+i*2.4, side=i%2?1:-1;
      const r=new THREE.Mesh(new THREE.BoxGeometry(.9,1.5,1.1), lam(c)); r.position.set(x,1.65,0); g.add(r);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6), lam(0xe0b48c)); head.position.set(x,2.7,0); g.add(head);
      const piv=new THREE.Group(); piv.position.set(x,1.25,side*.9); g.add(piv);
      const og=new THREE.BoxGeometry(.28,.18,7.5); og.translate(0,0,side*3.75); const oar=new THREE.Mesh(og, lam(0xf2ead8)); piv.add(oar);
      const blade=new THREE.Mesh(new THREE.BoxGeometry(1.1,.12,.9), lam(c)); blade.position.set(0,0,side*7.3); piv.add(blade);
      oars.push({piv, side}); }
    const cox=new THREE.Mesh(new THREE.BoxGeometry(.8,1.0,.9), lam(0x2c2f33)); cox.position.set(10.6,1.3,0); g.add(cox);
    /* a race: base speed with surges that change the lead, never going backwards */
    const v=7.4+rr()*1.2, a=4+rr()*6, w=.05+rr()*.06, p=rr()*6.28, rate=.55+rr()*.12;
    const sAt=t=>v*t+a*Math.sin(w*t+p)-a*Math.sin(p);
    let fin=0; while(sAt(fin)<P.L && fin<1e4) fin+=.25;
    return {g, P, oars, sAt, fin, rate, ph:rr()*6.28};
  });
  const pre=8, post=12, back=Math.max(...boats.map(b=>b.P.L))/4.5, T=pre+Math.max(...boats.map(b=>b.fin))+post+back;
  const M=new THREE.Matrix4(), Q=new THREE.Quaternion(), S=new THREE.Vector3(1,1,1), V=new THREE.Vector3();
  return { update(){
    const bob=(b,i,m)=>{ M.compose(V.set(b.x, .35+.18*Math.sin(clockT*1.6+b.ph), b.z), Q.identity(), S); m.setMatrixAt(i,M); };
    reds.forEach((b,i)=>bob(b,i,rm)); whites.forEach((b,i)=>bob(b,i,wm)); rm.instanceMatrix.needsUpdate=true; wm.instanceMatrix.needsUpdate=true;
    const u=((clockT%T)+T)%T;
    boats.forEach(b=>{ const L=b.P.L, tau=u-pre; let s, dir=1, rowing=false, rate=b.rate;
      if(tau<0) s=0;                                            /* on the start line */
      else if(tau<b.fin){ s=b.sAt(tau); rowing=true; }          /* racing */
      else if(u<T-back) s=L;                                    /* over the line, waiting for the others */
      else { s=L*(1-(u-(T-back))/back); dir=-1; rowing=true; rate=.35; }   /* paddling back to the start */
      const q=at(b.P, Math.max(.01,Math.min(L-.01,s))); b.g.position.set(q[0],0,q[1]); b.g.rotation.y=-Math.atan2(q[3]*dir,q[2]*dir);
      const ph=clockT*rate*Math.PI*2+b.ph;
      b.oars.forEach(o=>{ o.piv.rotation.y=rowing ? o.side*.55*Math.sin(ph) : 0; o.piv.rotation.x=rowing ? o.side*.12*Math.cos(ph) : 0; }); });
  } };
})();
/* people strolling out along the jetty and back (their own random stream: the rest of the model doesn't move) */
const walkers=[]; (function(){ const jr=mulberry32((PLAN.seed^0x6a3e77)>>>0), SHIRTS=[0xd8443a,0xf4f1ea,0x2f6db5,0xf2c14e,0x3c8c6a,0xe07a2f,0x1d2a2e];
  (PLAN.jetties||[]).forEach(j=>{ const P=mkPath(j.path); for(let i=0;i<j.walkers;i++) walkers.push({P, s0:jr()*P.L*2, v:.9+jr()*.6, lane:(jr()-.5)*2.2, c:SHIRTS[Math.floor(jr()*SHIRTS.length)]}); });
  if(!walkers.length) return;
  const bg=new THREE.BoxGeometry(.9,1.5,.7); bg.translate(0,.75,0); const hg=new THREE.BoxGeometry(.6,.6,.6); hg.translate(0,1.85,0);
  const wb=new THREE.InstancedMesh(bg, lam(0xffffff), walkers.length), wh=new THREE.InstancedMesh(hg, lam(0xe0b48c), walkers.length);
  walkers.forEach((w,i)=>wb.setColorAt(i, new THREE.Color(w.c))); wb.instanceColor.needsUpdate=true; wb.castShadow=true; walkers.mesh=[wb,wh]; scene.add(wb); scene.add(wh); })();
function updateWalkers(){ if(!walkers.length) return; const [wb,wh]=walkers.mesh, m=new THREE.Matrix4(), q=new THREE.Quaternion(), up=new THREE.Vector3(0,1,0), sc=new THREE.Vector3(1,1,1), ps=new THREE.Vector3();
  walkers.forEach((w,i)=>{ const L=w.P.L, u=(w.s0+w.v*clockT)%(2*L), back=u>L, s=back ? 2*L-u : u, a=at(w.P,s), dir=back?-1:1;
    const x=a[0]-a[3]*w.lane*dir, z=a[1]+a[2]*w.lane*dir; ps.set(x, deckY(x,z), z); q.setFromAxisAngle(up, -Math.atan2(a[3]*dir, a[2]*dir)); m.compose(ps,q,sc); wb.setMatrixAt(i,m); wh.setMatrixAt(i,m); });
  wb.instanceMatrix.needsUpdate=true; wh.instanceMatrix.needsUpdate=true; }

/* ---------- hand-picked landmarks (DESIGN.md §2.9): a small kit of models, placed from the suburb card ---------- */
/* Adelaide's time, for the clock and the time ball: tests freeze it at 12:59:50 plus TEST.t seconds */
const adlTime=(function(){ let f=null; try{ f=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}); }catch(e){}
  let last=-1, t={h:0,m:0,s:0};
  return ()=>{ if(TEST){ const s=50+(TEST.t||0); return {h:12+Math.floor((59*60+s)/3600)%12, m:Math.floor((59*60+s)/60)%60, s:s%60}; }
    const now=Date.now(); if(now-last<200) return t; last=now; const d=new Date(now);
    if(f){ const p={}; f.formatToParts(d).forEach(x=>{ p[x.type]=+x.value; }); t={h:p.hour%24, m:p.minute, s:p.second+(now%1000)/1000}; }
    else t={h:d.getHours(), m:d.getMinutes(), s:d.getSeconds()+(now%1000)/1000};
    return t; }; })();
const lmTick=[], lmMovers=[];   /* lmMovers: where each tram and train is now, for the test hook */
(function(){
  const LMS=PLAN.landmarks||[]; if(!LMS.length) return;
  const STONE=0xdcc49a, CREAM=0xf0e6cf, SLATE=0x3e4144, WHITE=0xf4f0e6, DARK=0x26313a, RED=0xb5583c;
  const box=(w,h,d,c,x,y,z,o)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), lam(c,o)); m.position.set(x||0,y||0,z||0); m.castShadow=true; m.receiveShadow=true; return m; };
  const cyl=(r1,r2,h,c,seg)=>{ const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg||10), lam(c)); m.castShadow=true; return m; };
  const roadAng=(x,z)=>{ let best=Infinity, ang=0; ROADS.forEach(r=>{ for(let i=0;i<r.p.length-1;i++){ const a=r.p[i], b=r.p[i+1], d=segDist(x,z,a[0],a[1],b[0],b[1]); if(d<best){ best=d; ang=Math.atan2(b[1]-a[1],b[0]-a[0]); } } }); return ang; };
  /* a footprint's group: local x along its long side, local z across; front(): the side that looks at l.face (or the sea) */
  const footGroup=l=>{ const g=new THREE.Group(); g.position.set(l.rx,0,l.rz); g.rotation.y=-l.ang; scene.add(g); return g; };
  const front=l=>{ let fx, fz; if(l.face){ fx=l.face[0]; fz=l.face[1]; } else { let b=null; for(let k=0;k<16;k++){ const a=k/16*Math.PI*2, x=l.rx+Math.cos(a)*120, z=l.rz+Math.sin(a)*120; if(inSea(x,z)){ b=[x,z]; break; } } [fx,fz]=b||[l.rx, l.rz-1]; }
    const c=Math.cos(l.ang), s=Math.sin(l.ang), du=(fx-l.rx)*c+(fz-l.rz)*s, dv=-(fx-l.rx)*s+(fz-l.rz)*c;
    return Math.abs(dv)/(l.d/2) >= Math.abs(du)/(l.w/2) ? { axis:'z', sign:Math.sign(dv)||1 } : { axis:'x', sign:Math.sign(du)||1 }; };
  /* turn a part so its own +z looks out of the given side */
  const faceYaw=f=>f.axis==='z' ? (f.sign>0 ? 0 : Math.PI) : (f.sign>0 ? Math.PI/2 : -Math.PI/2);
  /* a path that stays on the tray (trams and trains run off the model's edge and come back) */
  const onTray=(x,z,m)=>x>=X0+m && x<=X1-m && z>=Z0+m && z<=Z1-m;
  const ZERO=new THREE.Vector3(0,0,0), ONE=new THREE.Vector3(1,1,1);
  const rails=(lines, gauge, w, c, y, bed)=>{ const list=[]; lines.forEach(line=>clipLine(line,{X0,X1,Z0,Z1}).forEach(seg=>{ if(bed) list.push({p:seg, w:bed, bed:true}); list.push({p:offsetLine(seg,gauge/2), w}); list.push({p:offsetLine(seg,-gauge/2), w}); }));
    const beds=list.filter(o=>o.bed), rs=list.filter(o=>!o.bed);
    if(beds.length){ const m=new THREE.Mesh(ribbonGeom(beds, y-0.06), lam(0x9a8b74)); m.receiveShadow=true; scene.add(m); }
    const m=new THREE.Mesh(ribbonGeom(rs.map(o=>({p:o.p, w:o.w, joints:false})), y), lam(c)); m.receiveShadow=true; scene.add(m); };
  /* a vehicle on a path: its centre s metres along, nose along the path */
  const seat=(g,P,s,y)=>{ const q=at(P,s); g.position.set(q[0],y||0,q[1]); g.rotation.y=-Math.atan2(q[3],q[2]); g.visible=onTray(q[0],q[1],4); };

  const kit={
    /* track on ballast, nothing running: the station's yard and the lines out of it */
    tracks(l){ rails(l.lines, 1.6, .2, 0x6d6a66, .6, 3.4); },
    /* a two-storey hall with a clock tower on the side that faces l.face; the clock keeps Adelaide time */
    clocktower(l){ const g=footGroup(l), H=9;
      g.add(box(l.w,H,l.d,STONE,0,H/2,0)); g.add(box(l.w+.2,.35,l.d+.2,CREAM,0,4.6,0)); g.add(box(l.w+.8,.7,l.d+.8,CREAM,0,H+.35,0)); g.add(box(l.w-1,.5,l.d-1,SLATE,0,H+.95,0));
      const f=front(l), t=new THREE.Group(); t.rotation.y=faceYaw(f);
      if(f.axis==='z') t.position.set(0,0,f.sign*(l.d/2-2.4)); else t.position.set(f.sign*(l.w/2-2.4),0,0);
      g.add(t); t.add(box(5,22,5,STONE,0,11,0)); t.add(box(5.6,.6,5.6,CREAM,0,16,0)); t.add(box(4.4,4,4.4,0xe7d8b8,0,24,0)); t.add(box(5.4,.5,5.4,CREAM,0,22.2,0));
      for(let k=0;k<4;k++){ const a=k*Math.PI/2, arch=box(1.4,2.3,.3,DARK,Math.sin(a)*2.12,24,Math.cos(a)*2.12); arch.rotation.y=a; arch.castShadow=false; t.add(arch); }
      const roof=new THREE.Mesh(new THREE.ConeGeometry(3.5,4.6,4), lam(SLATE)); roof.rotation.y=Math.PI/4; roof.position.y=28.3; roof.castShadow=true; t.add(roof);
      const pole=cyl(.08,.08,3,0xd9d4c8,5); pole.position.y=32; t.add(pole); const flag=box(1.4,.8,.05,RED,.72,32.9,0); flag.castShadow=false; t.add(flag);
      const hands=[], hg=new THREE.BoxGeometry(.24,1.0,.1), mg=new THREE.BoxGeometry(.16,1.45,.1); hg.translate(0,.5,0); mg.translate(0,.72,0);
      for(let k=0;k<4;k++){ const fg=new THREE.Group(); fg.rotation.y=k*Math.PI/2; t.add(fg);
        const face=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,.2,28), lam(0xfaf6ec,{emissive:0x5a564c})); face.rotation.x=Math.PI/2; face.position.set(0,19.4,2.56); fg.add(face);
        const rim=new THREE.Mesh(new THREE.TorusGeometry(1.6,.14,6,28), lam(SLATE)); rim.position.set(0,19.4,2.62); fg.add(rim);
        const hh=new THREE.Mesh(hg, lam(DARK)), mm=new THREE.Mesh(mg, lam(DARK)); hh.position.set(0,19.4,2.72); mm.position.set(0,19.4,2.78); fg.add(hh); fg.add(mm); hands.push([hh,mm]); }
      lmTick.push(()=>{ const tm=adlTime(), hA=((tm.h%12)+tm.m/60)/12*Math.PI*2, mA=(tm.m+tm.s/60)/60*Math.PI*2; hands.forEach(([hh,mm])=>{ hh.rotation.z=-hA; mm.rotation.z=-mA; }); }); },

    /* a stone signal tower: its ball climbs the mast through the minute and drops on the minute (the real one drops at 1 pm) */
    timeball(l){ const g=new THREE.Group(); g.position.set(l.x,0,l.z); g.rotation.y=-roadAng(l.x,l.z); scene.add(g); const S=0xcfb187;
      g.add(box(7,11,7,S,0,5.5,0)); g.add(box(7.8,.6,7.8,CREAM,0,11.3,0)); g.add(box(5.2,5,5.2,S,0,14.1,0)); g.add(box(5.9,.5,5.9,CREAM,0,16.85,0));
      for(let k=0;k<4;k++){ const a=k*Math.PI/2; [3.6,7.6,14].forEach(y=>{ const w=box(1.1,y>12?1.8:2.2,.25,DARK,Math.sin(a)*(y>12?2.62:3.52),y,Math.cos(a)*(y>12?2.62:3.52)); w.rotation.y=a; w.castShadow=false; g.add(w); }); }
      const mast=cyl(.2,.28,10.5,0xeeeae0,6); mast.position.y=22.3; g.add(mast); g.add(box(3.2,.18,.18,0xeeeae0,0,26,0));
      const ball=new THREE.Mesh(new THREE.SphereGeometry(1.25,16,10), lam(0x9b2f22,{emissive:0x2a0a06})); g.add(ball);
      const LO=18.6, HI=25.8;
      lmTick.push(()=>{ const s=adlTime().s; let y;
        if(s<0.6){ const k=s/0.6; y=HI-(HI-LO)*k*k; } else if(s<8) y=LO+Math.max(0,.35*Math.sin((s-.6)*9)*Math.exp(-(s-.6)*4));
        else if(s<50){ const k=(s-8)/42; y=LO+(HI-LO)*k*k*(3-2*k); } else y=HI;
        ball.position.y=y; }); },

    /* a white seaside pavilion: verandahs on the side that faces the sea, a dome at each front corner */
    pavilion(l){ const g=footGroup(l), H=7;
      g.add(box(l.w,H,l.d,WHITE,0,H/2,0)); const roof=new THREE.Mesh(hip, lam(0xdcd8cf)); roof.scale.set(l.w*1.03,2.6,l.d*1.06); roof.position.y=H; roof.castShadow=true; g.add(roof);
      const f=front(l), fr=new THREE.Group(); fr.rotation.y=faceYaw(f); g.add(fr);
      const W=f.axis==='z' ? l.w : l.d, D=f.axis==='z' ? l.d : l.w, e=D/2;
      fr.add(box(W*.94,.35,3.2,0xe6e0d4,0,3.5,e+1.5)); fr.add(box(W*.96,.35,3.6,0xdcd8cf,0,H+.1,e+1.7));
      for(let x=-W*.45;x<=W*.45+.01;x+=Math.max(2.4,W*.9/12)){ const c=cyl(.22,.22,H,WHITE,6); c.position.set(x,H/2,e+3.1); fr.add(c); }
      [-1,1].forEach(sd=>{ const dx=sd*(W/2-2.2); fr.add(box(4.4,2.6,4.4,WHITE,dx,H+1.3,e-1.8));
        const dome=new THREE.Mesh(new THREE.SphereGeometry(2.5,18,9,0,Math.PI*2,0,Math.PI/2), lam(0xe9e3d6)); dome.position.set(dx,H+2.6,e-1.8); dome.castShadow=true; fr.add(dome);
        const fin=cyl(.1,.1,1.4,0xb98d43,5); fin.position.set(dx,H+5.6,e-1.8); fr.add(fin); });
      fr.add(box(Math.min(8,W*.3),2.4,1,WHITE,0,H+1.2,e-.2)); fr.add(box(Math.min(8,W*.3)+.6,.4,1.2,0xb98d43,0,H+2.5,e-.2)); },

    /* a Ferris wheel in the line of its footprint, turning once every two minutes; the cabins hang level */
    ferris(l){ const g=footGroup(l), R=14, hub=R+3, N=16;
      const plat=box(Math.max(12,l.w),.6,Math.max(6,l.d),0x8f9294,0,.3,0); g.add(plat);
      [-2.8,2.8].forEach(z=>[-1,1].forEach(sd=>{ const dx=sd*7, L=Math.hypot(dx,hub), leg=cyl(.32,.4,L,0xe9ecef,6); leg.position.set(dx/2,hub/2,z); leg.rotation.z=Math.atan2(dx,hub); leg.castShadow=true; g.add(leg); }));
      const wg=new THREE.Group(); wg.position.y=hub; g.add(wg);
      const white=lam(0xf6f7f4,{emissive:0x3a3c40});
      [-1.2,1.2].forEach(z=>{ const rim=new THREE.Mesh(new THREE.TorusGeometry(R,.32,6,64), white); rim.position.z=z; wg.add(rim);
        for(let k=0;k<N;k++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(.16,R,.16), white); sp.geometry.translate(0,R/2,0); sp.rotation.z=k/N*Math.PI*2; sp.position.z=z; wg.add(sp); } });
      const ax=cyl(.7,.7,3.4,0x9aa0a6,10); ax.rotation.x=Math.PI/2; wg.add(ax);
      const cabs=[]; for(let k=0;k<N;k++){ const c=box(1.7,1.9,1.9,CAR_COLS[k%CAR_COLS.length],0,0,0); c.castShadow=false; g.add(c); cabs.push(c); }
      lmTick.push(()=>{ const r=clockT*Math.PI*2/120; wg.rotation.z=r; cabs.forEach((c,k)=>{ const a=r+k/N*Math.PI*2; c.position.set(Math.cos(a)*R, hub+Math.sin(a)*R-1.3, 0); }); }); },

    /* trams: out along the first line, back along the second, waiting at the start; two of them, half a trip apart */
    tram(l){ const lines=l.lines, loop=lines.length>1 ? lines[0].concat(lines[1].slice(1)) : lines[0].concat(lines[0].slice(0,-1).reverse());
      rails(lines, 1.44, .22, 0x6d6a66, .6);
      const P=mkPath(loop), v=9, dwell=25, T=dwell+P.L/v, LEN=10.2;
      const car=k=>{ const g=new THREE.Group(); g.add(box(9.6,2.9,2.65,0xf4f2ec,0,1.95,0)); g.add(box(9.7,1.0,2.7,DARK,0,2.45,0)); g.add(box(9.7,.25,2.7,RED,0,.85,0)); g.add(box(9.2,.35,2.4,0xc9ccce,0,3.55,0));
        if(k===1){ g.add(box(.12,1.1,1.6,0x3e4144,0,4.25,0)); g.add(box(1.6,.1,.12,0x3e4144,0,4.8,0)); }
        g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); scene.add(g); return g; };
      const trams=[0,1].map(()=>[0,1,2].map(car)); trams.forEach(cs=>lmMovers.push(()=>cs[1].position.toArray()));
      lmTick.push(()=>{ trams.forEach((cars,i)=>{ const u=((clockT+i*T/2)%T+T)%T, s=u<dwell ? 0 : (u-dwell)*v;
        cars.forEach((g,k)=>{ const c=s+3*LEN-(k+.5)*LEN; seat(g,P,Math.min(P.L-.01,c),.1); }); }); }); },

    /* a white stone memorial arch on a stepped base: its opening looks at l.face, or across the nearest road */
    arch(l){ const g=new THREE.Group(); g.position.set(l.x,0,l.z); scene.add(g);
      g.rotation.y=l.face ? -Math.atan2(l.face[1]-l.z, l.face[0]-l.x)+Math.PI/2 : -roadAng(l.x,l.z);
      const W=0xece6d8, T=0xd9d0bd;
      g.add(box(10.4,.5,4.4,T,0,.25,0)); g.add(box(9.4,.4,3.6,W,0,.7,0));
      [-1,1].forEach(sd=>{ g.add(box(1.9,6.6,2.3,W,sd*2.9,4.2,0)); g.add(box(2.2,.4,2.6,T,sd*2.9,1.1,0)); });
      g.add(box(7.9,1.5,2.4,W,0,8.2,0)); g.add(box(8.5,.45,2.8,T,0,9.15,0)); g.add(box(4.2,1.1,2.2,W,0,9.9,0));
      const plaque=box(2.4,.8,.12,0x3e4144,0,8.2,1.24); plaque.castShadow=false; g.add(plaque);
      const back=plaque.clone(); back.position.z=-1.24; g.add(back); },

    /* a surf club: a cream clubhouse with a glazed upper floor and a lookout on the roof; on the sand towards the sea,
       the red-and-yellow flags fluttering, a lifesaver between them, and swimmers bobbing out in the water */
    surfclub(l){ const g=footGroup(l), H=8.2;
      g.add(box(l.w,H,l.d,0xf2efe6,0,H/2,0)); g.add(box(l.w+.2,1.5,l.d+.2,DARK,0,6,0)); g.add(box(l.w+.8,.6,l.d+.8,0xd8443a,0,H+.3,0)); g.add(box(l.w-.6,.3,l.d-.6,0xb9bab4,0,H+.55,0));
      const look=new THREE.Group(); look.position.set(l.w*.22,H+.5,0); g.add(look);
      look.add(box(3.6,2.6,3.6,0xf2efe6,0,1.3,0)); look.add(box(3.7,1.0,3.7,DARK,0,1.6,0)); look.add(box(4.2,.35,4.2,0xf2c14e,0,2.75,0));
      /* the beach: walk from the club towards the sea until the water starts */
      const fx=l.face[0]-l.x, fz=l.face[1]-l.z, fl=Math.hypot(fx,fz)||1, ux=fx/fl, uz=fz/fl, vx=-uz, vz=ux;
      let e=0; while(e<400 && !inSea(l.x+ux*e, l.z+uz*e)) e+=2;
      if(e>=400) return;
      const at=(u,v)=>[l.x+ux*u+vx*v, l.z+uz*u+vz*v], flags=[];
      [-16,16].forEach(v=>{ const [x,z]=at(e-7,v), f=new THREE.Group(); f.position.set(x,0,z); scene.add(f);
        const pole=cyl(.09,.09,5.2,0xeeeae0,5); pole.position.y=2.6; f.add(pole);
        const fl2=new THREE.Group(); fl2.position.set(0,4.4,0); f.add(fl2);
        fl2.add(box(2.2,.62,.06,0xd8443a,1.12,.31,0)); fl2.add(box(2.2,.62,.06,0xf2c14e,1.12,-.31,0)); flags.push(fl2); });
      const [gx,gz]=at(e-5,-12.5), guard=new THREE.Group(); guard.position.set(gx,0,gz); guard.rotation.y=-Math.atan2(uz,ux); scene.add(guard);
      [-.22,.22].forEach(z=>guard.add(box(.3,.95,.3,0xe7b98f,0,.48,z))); guard.add(box(.62,.5,.9,0xd8443a,0,1.15,0)); guard.add(box(.6,.85,.9,0xf2c14e,0,1.8,0));
      guard.add(box(.62,.62,.62,0xe7b98f,0,2.55,0)); guard.add(box(.9,.12,.9,0xf2c14e,0,2.92,0));
      const sw=[]; const sr=mulberry32((PLAN.seed^0x5a1f)>>>0);
      for(let k=0;k<7;k++){ const [x,z]=at(e+6+sr()*22, -12+sr()*24); if(!inSea(x,z)) continue; const h=new THREE.Group(); h.position.set(x,0,z); scene.add(h);
        h.add(new THREE.Mesh(new THREE.SphereGeometry(.42,8,6), lam(0xe7b98f))); const cap=new THREE.Mesh(new THREE.SphereGeometry(.44,8,5,0,Math.PI*2,0,Math.PI/2), lam(CAR_COLS[k%CAR_COLS.length])); cap.position.y=.06; h.add(cap);
        sw.push({h, ph:sr()*6.28}); }
      [look,guard].forEach(o=>o.traverse(m=>{ if(m.isMesh) m.castShadow=true; }));
      lmTick.push(()=>{ flags.forEach((f,i)=>{ f.rotation.y=Math.sin(clockT*3.1+i)*.35; });
        sw.forEach(s=>{ s.h.position.y=.25+Math.sin(clockT*1.4+s.ph)*.22; }); }); },

    /* a two-storey corner hotel: sandstone walls, a low hipped roof, an iron-lace balcony along every side that
       looks onto a road, and its name on the parapet */
    hotel(l){ const n=l.storeys||2, H=3.8*n, g=footGroup(l), c=Math.cos(l.ang), s=Math.sin(l.ang);
      g.add(box(l.w,H,l.d,0xe8d9b5,0,H/2,0)); for(let f=1;f<n;f++) g.add(box(l.w+.3,.35,l.d+.3,0xf3ead6,0,3.7+(f-1)*3.8,0)); g.add(box(l.w+.4,.9,l.d+.4,0xf3ead6,0,H+.45,0));
      const roof=new THREE.Mesh(hip, lam(0x8a3f2f)); roof.scale.set(l.w*.96,2.2,l.d*.96); roof.position.y=H+.9; roof.castShadow=true; g.add(roof);
      const GREEN=0x2f5d4f, LACE=0xf4f1ea, sides=[['x',1],['x',-1],['z',1],['z',-1]];
      sides.forEach(([ax,sg])=>{ const out=(ax==='x' ? l.w : l.d)/2+6, lu=ax==='x' ? sg*out : 0, lv=ax==='z' ? sg*out : 0;
        const wx=l.rx+lu*c-lv*s, wz=l.rz+lu*s+lv*c; let near=Infinity;
        ROADS.forEach(r=>{ if(r.c==='y') return; for(let i=0;i<r.p.length-1;i++) near=Math.min(near, segDist(wx,wz,r.p[i][0],r.p[i][1],r.p[i+1][0],r.p[i+1][1])); });
        if(near>14) return;
        const side=new THREE.Group(); side.rotation.y=ax==='x' ? (sg>0 ? Math.PI/2 : -Math.PI/2) : (sg>0 ? 0 : Math.PI); g.add(side);
        const L=ax==='x' ? l.d : l.w, e=(ax==='x' ? l.w : l.d)/2;
        /* a balcony on every upper floor, a roof over the top one, posts from the ground up */
        for(let f=1;f<n;f++){ const y=3.75+(f-1)*3.8; side.add(box(L+.4,.3,2.6,GREEN,0,y,e+1.3)); side.add(box(L+.4,.55,.08,LACE,0,y+.65,e+2.55)); }
        side.add(box(L+.6,.25,2.9,GREEN,0,H-.3,e+1.45));
        for(let x=-L/2;x<=L/2+.01;x+=Math.max(2.2,L/10)){ const p=cyl(.11,.11,H-.4,GREEN,5); p.position.set(x,(H-.4)/2,e+2.5); side.add(p); } });
      const sc=document.createElement('canvas'); sc.width=512; sc.height=64; const x=sc.getContext('2d');
      x.fillStyle='#f3ead6'; x.fillRect(0,0,512,64); x.fillStyle='#5a3a22'; x.textAlign='center'; x.textBaseline='middle'; fitFont(x, l.name.toUpperCase(), 800, 490, 44, '"Young Serif", Georgia, serif'); x.fillText(l.name.toUpperCase(),256,36);
      const st=new THREE.CanvasTexture(sc), sm=new THREE.MeshBasicMaterial({map:st});
      const f=front(l), sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(14,(f.axis==='z' ? l.w : l.d)*.8),1.0), sm), fr=new THREE.Group(); fr.rotation.y=faceYaw(f); g.add(fr);
      sign.position.set(0,H+.45,(f.axis==='z' ? l.d : l.w)/2+.23); fr.add(sign); },

    /* electric trains: out along the first line and back along the second, easing into each stop and waiting there;
       two of them, half a round apart */
    train(l){ const lines=l.lines, loop=lines.length>1 ? lines[0].concat(lines[1].slice().reverse()) : lines[0].concat(lines[0].slice(0,-1).reverse());
      rails(lines, 1.6, .24, 0x6d6a66, .62, 4.2);
      const P=mkPath(loop), L=P.L, half=polylineLength(lines[0]);
      /* where each stop falls on the round: once on the way out, once on the way back */
      const sOf=(p,a,b)=>{ let best=a, bd=Infinity; for(let s=a;s<=b;s+=2){ const q=at(P,s), d=Math.hypot(q[0]-p[0],q[1]-p[1]); if(d<bd){ bd=d; best=s; } } return bd<45 ? best : null; };
      const marks=[0]; (l.stops||[]).forEach(p=>{ [sOf(p,0,half), sOf(p,half,L)].forEach(s=>{ if(s!==null) marks.push(s); }); }); marks.push(L); marks.sort((a,b)=>a-b);
      const v=15, dwell=18, legs=[]; let T=0;
      for(let i=0;i<marks.length-1;i++){ const d=marks[i+1]-marks[i]; if(d<1) continue; const dur=d/v+3; legs.push({t0:T, t1:T+dur, s0:marks[i], s1:marks[i+1]}); T+=dur+(i+1<marks.length-1 ? dwell : 0); }
      const sAt=t=>{ const u=((t%T)+T)%T; for(const g of legs){ if(u<g.t0) return g.s0; if(u<=g.t1){ const k=(u-g.t0)/(g.t1-g.t0); return g.s0+(g.s1-g.s0)*k*k*(3-2*k); } } return L; };
      const LEN=20.5, car=k=>{ const g=new THREE.Group(); g.add(box(19.8,3.3,3.0,0xdadde0,0,2.15,0)); g.add(box(19.9,1.05,3.05,DARK,0,2.65,0)); g.add(box(19.9,.32,3.05,0x2f6db5,0,1.1,0)); g.add(box(19.4,.35,2.7,0xb9bdc1,0,3.95,0));
        if(k===1){ g.add(box(.14,1.2,1.9,0x3e4144,0,4.65,0)); g.add(box(2.2,.12,.14,0x3e4144,0,5.25,0)); }
        if(k!==1){ const nose=box(.4,3.2,2.9,0x1d2224,k===0 ? 9.95 : -9.95,2.1,0); g.add(nose); }
        g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); scene.add(g); return g; };
      const trains=[0,1].map(()=>[0,1,2].map(car));
      trains.forEach(cs=>lmMovers.push(()=>cs[1].position.toArray()));
      lmTick.push(()=>{ trains.forEach((cars,i)=>{ const s=sAt(clockT+i*T/2); cars.forEach((g,k)=>seat(g,P,Math.max(.01,Math.min(L-.01,s-(k+.5)*LEN+1.5*LEN)),.2)); }); }); },
    /* rowers (l.path, l.boats): sculling boats from one club training together up and down the water in a line, the
       same gap apart; at each end they rest, bring their sculls in along the hull and spin round, then row back */
    rowers(l){ const P=mkPath(l.path), L=P.L, rr=mulberry32((PLAN.seed^0x50c0e5)>>>0), GAP=6, WY=.5, SKIN=0xe0b48c;   /* hulls stand from the water (.42) to WY+.5, clear of the suburb's edge line (.75) where a river is the boundary */
      const BLADES=[0xd8443a,0x2f6db5,0xf2c14e,0x3c8c6a,0x7b3fa0,0x1d2a2e], TOPS=[0xf4f1ea,0x1d2a2e,0x2f6db5,0xd8443a];
      const blade=BLADES[Math.floor(rr()*BLADES.length)], top=TOPS[Math.floor(rr()*TOPS.length)];
      const boats=l.boats.map((b,k)=>{ const g=new THREE.Group(), n=b.seats; scene.add(g);
        g.add(box(b.len*.7,.6,.8,0xf6f3ec,0,WY+.2,0)); [-1,1].forEach(e=>g.add(box(b.len*.15,.45,.45,0xf6f3ec,e*b.len*.425,WY+.22,0)));
        g.add(box(b.len*.12,.05,.5,blade,b.len*.38,WY+.52,0));
        const oars=[]; for(let i=0;i<n;i++){ const x=(i-(n-1)/2)*1.6;
          g.add(box(.7,1.05,.8,top,x,WY+.85,0)); g.add(box(.45,.45,.45,SKIN,x,WY+1.6,0));
          [-1,1].forEach(side=>{ const piv=new THREE.Group(); piv.position.set(x+.35,WY+.55,side*.75); g.add(piv);
            const og=new THREE.BoxGeometry(.12,.1,2.6); og.translate(0,0,side*1.3); piv.add(new THREE.Mesh(og, lam(0xf2ead8)));
            const bl=new THREE.Mesh(new THREE.BoxGeometry(.5,.08,.45), lam(blade)); bl.position.set(0,0,side*2.6); piv.add(bl); oars.push({piv, side}); }); }
        g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); return {g, oars, ph:k*.9}; });
      /* where each boat sits in the line: the first one leads on the way up (and is last on the way down) */
      const S=l.boats.reduce((a,b)=>a+b.len,0)+GAP*(l.boats.length-1), base=[]; let o=S;
      l.boats.forEach(b=>{ base.push(o-b.len/2); o-=b.len+GAP; });
      const R=Math.max(1,L-S-2), v=4.2, tr=4, rest=14, Tl=R/v+tr, T=2*(Tl+rest), acc=v/tr;
      const dist=t=>t<tr ? .5*acc*t*t : t>Tl-tr ? R-.5*acc*(Tl-t)*(Tl-t) : v*(t-tr/2);
      const sm=k=>{ k=Math.max(0,Math.min(1,k)); return k*k*(3-2*k); };
      /* at u seconds into a round: how far up the line (F), the turn added to the heading, how far in the sculls are */
      const pose=u=>{ if(u<rest){ const r=u; return {F:0, add:Math.PI*(1+sm((r-3)/(rest-6))), f:sm(Math.min(r/2,(rest-r)/2))}; }
        u-=rest; if(u<Tl) return {F:dist(u), add:0, f:0};
        u-=Tl; if(u<rest){ const r=u; return {F:R, add:Math.PI*sm((r-3)/(rest-6)), f:sm(Math.min(r/2,(rest-r)/2))}; }
        u-=rest; return {F:R-dist(u), add:Math.PI, f:0}; };
      lmMovers.push(()=>boats[0].g.position.toArray());
      lmTick.push(()=>{ const p=pose(((clockT%T)+T)%T), ph0=clockT*Math.PI;
        boats.forEach((bt,k)=>{ const q=at(P,Math.max(.01,Math.min(L-.01,1+p.F+base[k])));
          bt.g.position.set(q[0],.04*Math.sin(clockT*1.3+k),q[1]); bt.g.rotation.y=-Math.atan2(q[3],q[2])+p.add;
          const ph=ph0+bt.ph; bt.oars.forEach(a=>{ a.piv.rotation.y=a.side*.5*Math.sin(ph)*(1-p.f)-a.side*1.35*p.f; a.piv.rotation.x=a.side*.1*Math.cos(ph)*(1-p.f); }); }); }); },
    /* cyclists (l.lines, l.riders): people on bikes riding the path out and back, each at their own pace, keeping left
       (0.6 m left of the path's middle) and swinging out to pass a slower rider; off the tray's edge they vanish and come back */
    cyclists(l){ const line=l.lines[0], P=mkPath(line), L=P.L, rr=mulberry32((PLAN.seed^0xc1c1e5)>>>0), PY=.5, SKIN=0xe0b48c;
      const SHIRTS=[0xd8443a,0xf2c14e,0x2f6db5,0x3c8c6a,0xe07a2f,0xf4f1ea,0x7b3fa0,0x1d2a2e], LEGS=[0x1d2a2e,0x2c2f33,0x3e4144];
      const riders=[]; for(let i=0;i<l.riders;i++){ const g=new THREE.Group(); scene.add(g); const shirt=SHIRTS[Math.floor(rr()*SHIRTS.length)];
        [-.55,.55].forEach(x=>{ const w=cyl(.34,.34,.07,DARK,14); w.rotation.x=Math.PI/2; w.position.set(x,PY+.34,0); g.add(w); });
        g.add(box(1.0,.07,.07,0x8d8f91,0,PY+.62,0)); g.add(box(.07,.4,.07,0x8d8f91,-.2,PY+.8,0)); g.add(box(.07,.07,.5,DARK,.48,PY+1.0,0));
        const body=box(.42,.7,.38,shirt,0,0,0); body.position.set(.02,PY+1.3,0); body.rotation.z=-.55; g.add(body);
        const head=box(.3,.3,.3,SKIN,.26,PY+1.68,0); g.add(head); g.add(box(.36,.14,.34,SHIRTS[Math.floor(rr()*SHIRTS.length)],.26,PY+1.87,0));
        const leg=LEGS[Math.floor(rr()*LEGS.length)], legs=[-1,1].map(side=>{ const piv=new THREE.Group(); piv.position.set(-.18,PY+1.0,side*.13); g.add(piv);
          const lg=new THREE.BoxGeometry(.14,.62,.14); lg.translate(.08,-.31,0); piv.add(new THREE.Mesh(lg, lam(leg))); return {piv, side}; });
        g.traverse(o=>{ if(o.isMesh) o.castShadow=false; });
        riders.push({g, legs, v:4.2+rr()*3, s0:rr()*2*L, lat:.6, s:0, dir:1}); }
      riders.forEach(r=>lmMovers.push(()=>r.g.position.toArray()));
      let last=null;
      lmTick.push(()=>{ const dt=last===null ? 0 : Math.max(0,Math.min(.25,clockT-last)); last=clockT;
        riders.forEach(r=>{ const u=((r.s0+r.v*clockT)%(2*L)+2*L)%(2*L); r.dir=u>L ? -1 : 1; r.s=u>L ? 2*L-u : u; });
        riders.forEach(r=>{ /* someone slower just ahead on this side: pass them near the middle */
          const blocked=riders.some(o=>o!==r && o.dir===r.dir && o.v<r.v && (o.s-r.s)*r.dir>0 && (o.s-r.s)*r.dir<6);
          const want=blocked ? -.3 : .6; r.lat=dt ? r.lat+(want-r.lat)*Math.min(1,dt*1.5) : want;
          const q=at(P,Math.max(.01,Math.min(L-.01,r.s))), tx=q[2]*r.dir, tz=q[3]*r.dir, x=q[0]+tz*r.lat, z=q[1]-tx*r.lat;
          r.g.position.set(x,0,z); r.g.rotation.y=-Math.atan2(tz,tx); r.g.visible=onTray(x,z,4);
          const crank=r.s*r.dir/1.4; r.legs.forEach(o=>{ o.piv.rotation.z=.55*Math.sin(crank+(o.side>0 ? 0 : Math.PI)); }); }); }); },
    /* a shiny silver car trying to park nose-in towards l.face, and not managing: in, crooked, out, the other way,
       then up and down an inch at a time, and off round again; brake lights glow when it backs up */
    parker(l){ const fx=l.face[0]-l.x, fz=l.face[1]-l.z, fl=Math.hypot(fx,fz)||1, ux=fx/fl, uz=fz/fl, vx=-uz, vz=ux, h0=Math.atan2(uz,ux);
      const silver=new THREE.MeshPhongMaterial({color:0xaab1b9, specular:0xffffff, shininess:160, emissive:0x101214});
      const g=new THREE.Group(); scene.add(g);
      const body=new THREE.Mesh(new THREE.BoxGeometry(6.2,1.5,2.9), silver); body.position.y=1.15; g.add(body);
      const cab=new THREE.Mesh(new THREE.BoxGeometry(3.3,1.15,2.6), silver); cab.position.set(-.3,2.45,0); g.add(cab);
      const glass=new THREE.Mesh(new THREE.BoxGeometry(3.42,.72,2.66), lam(0x27313a,{emissive:0x0b1013})); glass.position.set(-.3,2.42,0); g.add(glass);
      [-1.9,1.9].forEach(x=>[-1.36,1.36].forEach(z=>{ const w=cyl(.55,.55,.42,0x1d2224,12); w.rotation.x=Math.PI/2; w.position.set(x,.55,z); w.castShadow=false; g.add(w); }));
      [-.9,.9].forEach(z=>g.add(box(.12,.34,.62,0xfffbe8,3.12,1.35,z,{emissive:0x8a8670})));
      const brake=new THREE.MeshLambertMaterial({color:0x8a1a12, emissive:0xff2a14, emissiveIntensity:.15});
      [-.9,.9].forEach(z=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(.12,.34,.62), brake); b.position.set(-3.12,1.35,z); g.add(b); });
      if(l.plate){ const c=document.createElement('canvas'); c.width=256; c.height=64; const x=c.getContext('2d');
        x.fillStyle='#f7f5ef'; x.fillRect(0,0,256,64); x.strokeStyle='#1d2224'; x.lineWidth=5; x.strokeRect(3,3,250,58);
        x.fillStyle='#1d2224'; x.textAlign='center'; x.textBaseline='middle'; fitFont(x, l.plate, 800, 230, 46, 'Figtree, system-ui, sans-serif'); x.fillText(l.plate,128,35);
        const t=new THREE.CanvasTexture(c), pm=new THREE.MeshBasicMaterial({map:t});
        [[3.14,Math.PI/2],[-3.14,-Math.PI/2]].forEach(([px,ry])=>{ const p=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.38), pm); p.position.set(px,.8,0); p.rotation.y=ry; g.add(p); }); }
      g.traverse(o=>{ if(o.isMesh) o.castShadow=false; });
      /* [seconds, metres in towards face, metres across, turn (rad)]: in crooked, out, in the other way, out, nearly,
         then forward a bit, back a bit, forward, back... and away again */
      const K=[[0,-15,3.2,.62],[3,-6.5,1.6,.36],[4.4,-5,1.3,.3],[6.4,-9.5,2.6,.5],[8,-9.5,2.6,.5],[10.4,-3.4,-1.7,-.36],[11.6,-2.4,-2,-.42],[13.6,-7,-.8,-.16],
        [15.4,-1.4,.7,.13],[16.4,.4,1,.19],[17.6,-.8,.75,.15],[18.8,.5,.3,.09],[19.9,-.5,.15,.05],[20.9,.35,.35,.08],[21.9,-.3,.2,.05],[22.9,.25,.3,.07],
        [l.family ? 50.5 : 25.4,.25,.3,.07],[l.family ? 54.5 : 29,-15,3.2,.62]];
      /* when it stops, the family gets out: toy people (legs, top or dress, head, hair) who walk from the door to a line on
         the grass beside the car, stand there (the little ones bouncing), and walk back in before it tries again */
      const fam=(l.family||[]).map((p,k,all)=>{ const H={adult:1, child:.72, toddler:.5}[p.size], q=new THREE.Group(); scene.add(q);
        const JEANS=0x2f5d8f, TOP=0xf6f5f0, PINK=0xf08bb4, SKINC=0xe7b98f, HAIR=0x3b2a20;
        if(p.outfit==='dress'){ const d=new THREE.Mesh(new THREE.CylinderGeometry(.42*H+.12,.78*H+.15,1.45*H,10), lam(PINK)); d.position.y=.55*H+.72*H; q.add(d);
          [-.2,.2].forEach(z=>q.add(box(.22*H+.06,.55*H,.22*H+.06,SKINC,0,.28*H,z*H))); }
        else { [-.2,.2].forEach(z=>q.add(box(.3*H+.06,1.05*H,.3*H+.06,JEANS,0,.52*H,z*H))); q.add(box(.55*H+.12,.95*H,.85*H+.1,TOP,0,1.5*H,0)); }
        q.add(box(.62*H+.1,.62*H+.1,.62*H+.1,SKINC,0,2.25*H,0));
        q.add(box(.66*H+.1,.2*H+.05,.66*H+.1,HAIR,0,2.6*H,0));
        if(p.outfit==='dress') q.add(box(.2*H+.06,.7*H,.62*H+.1,HAIR,-.3*H-.06,2.2*H,0));
        /* arms from the shoulder: a sleeve (the top's colour, or the dress's) and a hand */
        const zo=(p.outfit==='dress' ? .42*H+.12 : (.85*H+.1)/2)+(.22*H+.06)/2, arms=[-1,1].map(sd=>{ const a=new THREE.Group(); a.position.set(0,1.92*H,sd*zo); q.add(a);
          a.add(box(.22*H+.06,.5*H,.22*H+.06,p.outfit==='dress' ? PINK : TOP,0,-.25*H,0)); a.add(box(.2*H+.05,.38*H,.2*H+.05,SKINC,0,-.69*H,0)); return a; });
        q.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); q.visible=false;
        /* in a line out from the car's side, in the card's order (first nearest the car) */
        return { q, H, arms, spot:[.2, -3.7-k*1.45], door:[k%2 ? -1.4 : .6, -1.6], ph:k*1.3 }; });
      const OUT=23.4, WALK=1.8, BACK=48.2;
      /* standing, they face back along the way the car came in: towards the road, and whoever is watching from it */
      const famAt=t=>{ const fy=Math.atan2(-uz*.9-vz*.3, -ux*.9-vx*.3);
        fam.forEach((m,k)=>{ const t0=OUT+k*.5, t1=BACK-(fam.length-1-k)*.4; let f;
          if(t<t0 || t>t1+WALK) { m.q.visible=false; return; }
          f = t<t0+WALK ? (t-t0)/WALK : t<t1 ? 1 : 1-(t-t1)/WALK; f=f*f*(3-2*f);
          const pu=m.door[0]+(m.spot[0]-m.door[0])*f, pv=m.door[1]+(m.spot[1]-m.door[1])*f, walking=f>0 && f<1;
          const hop=walking ? Math.abs(Math.sin(t*9+m.ph))*.25 : (m.H<.8 ? Math.max(0,Math.sin(t*4.2+m.ph))*.55*m.H : 0);
          m.q.visible=true; m.q.position.set(l.x+pu*ux+pv*vx, hop, l.z+pu*uz+pv*vz);
          const sg=t>t1 ? -1 : 1, du=(m.spot[0]-m.door[0])*sg, dv=(m.spot[1]-m.door[1])*sg;   /* out towards the spot, back towards the door */
          m.q.rotation.y=walking ? -Math.atan2(du*uz+dv*vz, du*ux+dv*vx) : -fy;
          m.q.rotation.z=walking ? 0 : Math.sin(t*1.7+m.ph)*.04;
          /* arms swing as they walk; on arriving, one goes up and waves for a few seconds (a ripple down the line) */
          const since=t-(t0+WALK), wave=!walking && t<t1 && since>=k*.35 && since<6.5+k*.35;
          m.arms[0].rotation.z=walking ? Math.sin(t*9+m.ph)*.5 : 0;
          m.arms[1].rotation.z=walking ? -Math.sin(t*9+m.ph)*.5 : 0;
          m.arms[1].rotation.x=wave ? -(2.55+.38*Math.sin((since-k*.35)*10)) : 0; }); };
      const T=K[K.length-1][0];
      lmMovers.push(()=>g.position.toArray());
      lmTick.push(()=>{ const t=((clockT%T)+T)%T; let i=0; while(i<K.length-2 && K[i+1][0]<=t) i++;
        const a=K[i], b=K[i+1], k0=Math.min(1,Math.max(0,(t-a[0])/(b[0]-a[0]))), k=k0*k0*(3-2*k0);
        const u=a[1]+(b[1]-a[1])*k, v=a[2]+(b[2]-a[2])*k, yaw=a[3]+(b[3]-a[3])*k;
        g.position.set(l.x+u*ux+v*vx, 0, l.z+u*uz+v*vz); g.rotation.y=-(h0+yaw);
        brake.emissiveIntensity=(b[1]<a[1] && k0<1) ? 1.6 : (k0<1 && b[1]!==a[1]) ? .15 : .7; if(fam.length) famAt(t); }); },
    /* a little steam train on its own track: back and forth along the stretch on the tray, a pause at each end, steam */
    steamtrain(l){ rails(l.lines, .8, .14, 0x55504a, .56, 1.9);
      const segs=l.lines.flatMap(line=>clipLine(line,{X0:X0+12,X1:X1-12,Z0:Z0+12,Z1:Z1-12})).sort((a,b)=>polylineLength(b)-polylineLength(a));
      if(!segs.length) return;
      /* it starts (and rests) at the end nearer the middle of the model: its home station, not the far edge */
      const cx=(X0+X1)/2, cz=(Z0+Z1)/2, sg=segs[0], home=Math.hypot(sg[0][0]-cx,sg[0][1]-cz)<=Math.hypot(sg[sg.length-1][0]-cx,sg[sg.length-1][1]-cz) ? sg : sg.slice().reverse();
      const P=mkPath(home), v=3.2, dwell=12, run=Math.max(1,P.L-17), T=2*(run/v+dwell);
      const GREEN=0x24503f, BLACK=0x1d2224, MAROON=0x8a3f2f, SKIN=0xe0b48c;
      const unit=(len)=>{ const g=new THREE.Group(); scene.add(g); g.userData.len=len; return g; };
      const eng=unit(4.4); eng.add(box(4.2,.5,1.4,BLACK,0,.55,0)); const boiler=cyl(.75,.75,3,GREEN,14); boiler.rotation.z=Math.PI/2; boiler.position.set(.3,1.45,0); eng.add(boiler);
      const smoke=cyl(.78,.78,.6,BLACK,14); smoke.rotation.z=Math.PI/2; smoke.position.set(1.6,1.45,0); eng.add(smoke);
      const chim=cyl(.26,.32,1.0,BLACK,8); chim.position.set(1.5,2.6,0); eng.add(chim); eng.add(box(1.4,1.9,1.6,GREEN,-1.4,1.65,0)); eng.add(box(1.6,.2,1.8,BLACK,-1.4,2.7,0)); eng.add(box(.2,.4,1.6,RED,2.15,.7,0));
      [-1.2,0,1.2].forEach(x=>[-.78,.78].forEach(z=>{ const w=cyl(.45,.45,.18,0x7a2a20,12); w.rotation.x=Math.PI/2; w.position.set(x,.45,z); eng.add(w); }));
      const tender=unit(2.4); tender.add(box(2.2,1.2,1.5,GREEN,0,1.0,0)); tender.add(box(2.0,.3,1.3,BLACK,0,1.7,0));
      const cars=[0,1,2].map(k=>{ const g=unit(3.4); g.add(box(3.2,.35,1.4,MAROON,0,.7,0)); g.add(box(3.2,.5,.1,0xf0e6cf,0,1.1,.68)); g.add(box(3.2,.5,.1,0xf0e6cf,0,1.1,-.68));
        [-1,0,1].forEach((x,j)=>{ if((k+j)%3===2) return; g.add(box(.5,.8,.5,CAR_COLS[(k*3+j)%CAR_COLS.length],x,1.3,0)); g.add(box(.36,.36,.36,SKIN,x,1.9,0)); }); return g; });
      const consist=[eng,tender,...cars]; lmMovers.push(()=>eng.position.toArray()); consist.forEach(g=>g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }));
      const offs=[]; let o=0; consist.forEach(g=>{ offs.push(o+g.userData.len/2); o+=g.userData.len+.4; });
      const frontAt=t=>{ const u=((t%T)+T)%T, a=run/v; if(u<dwell) return 17; if(u<dwell+a) return 17+(u-dwell)*v; if(u<2*dwell+a) return 17+run; return 17+run-(u-2*dwell-a)*v; };
      const moving=t=>{ const u=((t%T)+T)%T, a=run/v; return (u>=dwell && u<dwell+a) || u>=2*dwell+a; };
      const puffMat=[], puffs=[]; for(let k=0;k<10;k++){ const m=new THREE.MeshLambertMaterial({color:0xf7f5f0, transparent:true, opacity:.5, depthWrite:false}); puffMat.push(m); const p=new THREE.Mesh(new THREE.SphereGeometry(.6,10,7), m); scene.add(p); puffs.push(p); }
      lmTick.push(()=>{ const s=frontAt(clockT); consist.forEach((g,k)=>seat(g,P,Math.max(.01,s-offs[k]),.05));
        puffs.forEach((p,k)=>{ const a=((clockT*1.1+k/10)%1+1)%1, t0=clockT-a*1.8, q=at(P,Math.max(.01,frontAt(t0)-offs[0]+1.5));
          p.position.set(q[0]+a*1.6, 3.1+a*5.5, q[1]-a*.8); const sc=.7+a*2.4; p.scale.set(sc,sc,sc); puffMat[k].opacity=(moving(t0)?.55:.18)*(1-a); p.visible=onTray(q[0],q[1],4); }); }); },
  };
  LMS.forEach(l=>{ if(kit[l.kind]) kit[l.kind](l); });
})();
function updateLandmarks(){ for(const f of lmTick) f(); }

/* ---------- post: the tilt-shift lens ---------- */
const bufSize=new THREE.Vector2(); renderer.getDrawingBufferSize(bufSize);
const RTClass=(renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
const rtA=new RTClass(bufSize.x, bufSize.y); if(rtA.samples!==undefined) rtA.samples=4;
rtA.texture.encoding=THREE.sRGBEncoding;   /* the scene lands in the buffer already in display colour: no banding in the shadows */
const rtB=new THREE.WebGLRenderTarget(bufSize.x, bufSize.y, {depthBuffer:false});
const lens=new THREE.ShaderMaterial({
  uniforms:{ tDiffuse:{value:null}, texel:{value:new THREE.Vector2(1/bufSize.x,1/bufSize.y)}, dir:{value:new THREE.Vector2(1,0)}, focusY:{value:.47}, band:{value:.07}, fade:{value:.3}, maxBlur:{value:1.8*DPR}, grade:{value:0} },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 texel, dir; uniform float focusY, band, fade, maxBlur, grade; varying vec2 vUv;
  void main(){ float d=abs(vUv.y-focusY); float amt=smoothstep(band, band+fade, d)*maxBlur; vec2 o=dir*texel*amt;
    vec3 c=texture2D(tDiffuse,vUv).rgb*0.1964826;
    c+=(texture2D(tDiffuse,vUv+o*1.4117647).rgb+texture2D(tDiffuse,vUv-o*1.4117647).rgb)*0.2969070;
    c+=(texture2D(tDiffuse,vUv+o*3.2941176).rgb+texture2D(tDiffuse,vUv-o*3.2941176).rgb)*0.0944704;
    c+=(texture2D(tDiffuse,vUv+o*5.1764706).rgb+texture2D(tDiffuse,vUv-o*5.1764706).rgb)*0.0103814;
    if(grade>.5){ float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,1.06); c=(c-.5)*1.05+.5; c*=vec3(1.012,1.0,.985); vec2 v=vUv-.5; c*=1.0-dot(v,v)*.45; }
    gl_FragColor=vec4(clamp(c,0.,1.),1.); }`,
  depthTest:false, depthWrite:false });
const quadScene=new THREE.Scene(), quadCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), lens));

/* ---------- camera: fly, explore, go to the board ---------- */
const controls=new THREE.MapControls(camera, canvas);
controls.enableDamping=true; controls.dampingFactor=.08; controls.screenSpacePanning=false;
controls.minDistance=70; controls.maxDistance=3800; controls.minPolarAngle=.2; controls.maxPolarAngle=1.32;
controls.zoomSpeed=.9; controls.rotateSpeed=.6;
const reduce=window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode=reduce ? 'explore' : 'fly', flyT=0, lastInput=performance.now();
const tween={on:false, t:0, dur:2.4, fromP:new THREE.Vector3(), fromT:new THREE.Vector3(), toP:new THREE.Vector3(), toT:new THREE.Vector3(), then:'explore'};
const ease=t=>t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
function flyPose(t){
  const F=PLAN.fly, a=F.centre+F.amp*Math.sin(t*Math.PI*2/F.period+(F.phase||0)), c=interpAxis(F.path, F.axis, a)+F.offset;
  const xc = F.axis==='z' ? c : a, zc = F.axis==='z' ? a : c;
  const phi=F.heading+.48*Math.sin(t*Math.PI*2/97), th=(F.elev||.6)+.07*Math.sin(t*Math.PI*2/71);
  const k=camera.aspect<.8 ? 1.6 : 1, dist=((F.dist||660)+(F.swing||120)*Math.sin(t*Math.PI*2/83))*k;
  return { tgt:new THREE.Vector3(xc,0,zc), pos:new THREE.Vector3(xc+dist*Math.sin(phi)*Math.cos(th), dist*Math.sin(th), zc+dist*Math.cos(phi)*Math.cos(th)) };
}
/* with reduced motion the camera jumps instead of gliding */
function goTo(pos, tgt, then, dur){
  if(reduce){ tween.on=false; camera.position.copy(pos); controls.target.copy(tgt); camera.lookAt(tgt); mode=then||'explore'; return; }
  tween.on=true; tween.t=0; tween.dur=dur||2.4; tween.fromP.copy(camera.position); tween.fromT.copy(controls.target); tween.toP.copy(pos); tween.toT.copy(tgt); tween.then=then||'explore'; mode='travel'; }
function startFly(){ flyT=flyT||0; const p=flyPose(flyT); goTo(p.pos, p.tgt, 'fly', 2.6); setButtons('fly'); }
function boardPose(){ const nx=Math.sin(BOARD.face), nz=Math.cos(BOARD.face), d=camera.aspect<.8 ? 260 : 185; return { pos:new THREE.Vector3(BOARD.x+nx*d, 70, BOARD.z+nz*d), tgt:new THREE.Vector3(BOARD.x, 18, BOARD.z) }; }
function boardView(){ const p=boardPose(); goTo(p.pos, p.tgt, 'explore', 2.6); setButtons('board'); }
const p0=flyPose(0); camera.position.copy(p0.pos); controls.target.copy(p0.tgt); camera.lookAt(p0.tgt);

/* ---------- the board is a door (public mode): a tap on its face asks for an appraisal ---------- */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function onBoard(cx, cy){
  const r=canvas.getBoundingClientRect(); ndc.set((cx-r.left)/r.width*2-1, -((cy-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc, camera); const h=ray.intersectObject(boardFace, false)[0];
  return !!(h && h.face && h.face.materialIndex===4);
}
function ask(href){ beacon('ask'); location.assign(href); }
if(SLOT.mode==='public'){
  let down=null;
  canvas.addEventListener('pointerdown', e=>{ down={x:e.clientX, y:e.clientY, t:performance.now(), id:e.pointerId}; });
  canvas.addEventListener('pointercancel', ()=>{ down=null; });
  canvas.addEventListener('pointerup', e=>{ const d=down; down=null; if(!d || d.id!==e.pointerId) return;
    if(isTap(e.clientX-d.x, e.clientY-d.y, performance.now()-d.t) && onBoard(e.clientX, e.clientY)) ask(SLOT.links.ask); });
  canvas.addEventListener('pointermove', e=>{ if(e.pointerType!=='mouse' || e.buttons) return; canvas.style.cursor = onBoard(e.clientX, e.clientY) ? 'pointer' : ''; });
}

/* ---------- find my street (format-2 data only) ---------- */
const pin=new THREE.Group(); pin.visible=false;
(function(){ const head=new THREE.Mesh(new THREE.SphereGeometry(4.2,16,12), lam(0xd8443a)); head.position.y=27; head.castShadow=true; pin.add(head);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,26,8), lam(0x1d2a2e)); post.position.y=13; post.castShadow=true; pin.add(post);
  const ring=new THREE.Mesh(new THREE.RingGeometry(6,9,32), new THREE.MeshBasicMaterial({color:C(0xf2c14e), transparent:true, opacity:.9, depthWrite:false, toneMapped:false})); ring.rotation.x=-Math.PI/2; ring.position.y=1.2; pin.add(ring);
  scene.add(pin); })();
function showStreet(s){
  pin.position.set(s.x, 0, s.z); pin.visible=true; renderer.shadowMap.needsUpdate=true;
  const h=PLAN.fly.heading, th=.62, d=camera.aspect<.8 ? 620 : 430;
  goTo(new THREE.Vector3(s.x+d*Math.sin(h)*Math.cos(th), d*Math.sin(th), s.z+d*Math.cos(h)*Math.cos(th)), new THREE.Vector3(s.x,0,s.z), 'explore', 2.4);
  setButtons('explore'); lastInput=performance.now();
  $('#streetNote').hidden=false;
  if(SLOT.mode==='public') setLink($('#bAsk'), withStreet(SLOT.links.ask, s.name));
}
const streets=PLAN.streets||[];
if(streets.length){
  const sf=$('#streetForm'), si=$('#street'), dl=$('#streetList');
  streets.forEach(s=>{ const o=document.createElement('option'); o.value=s.name; dl.appendChild(o); });
  sf.hidden=false;
  const tryPick=()=>{ const s=findStreet(streets, si.value); if(s){ if(si.value!==s.name) si.value=s.name; showStreet(s); } return s; };
  si.addEventListener('input', tryPick);
  sf.addEventListener('submit', e=>{ e.preventDefault(); let s=tryPick();
    if(!s){ const q=si.value.trim().toLowerCase(); s=q ? streets.find(x=>x.name.toLowerCase().startsWith(q)) : null; if(s){ si.value=s.name; showStreet(s); } }
    if(s) si.blur(); });
}

/* test hook: only active when a test harness sets window.__BAIT_TEST before load */
if (TEST) window.__bait = {
  frames: 0, box: [X0, X1, Z0, Z1], board: { x: BOARD.x, z: BOARD.z, face: BOARD.face },
  setCamera(p, t){ mode='test'; tween.on=false; camera.position.set(p[0],p[1],p[2]); controls.target.set(t[0],t[1],t[2]); camera.lookAt(controls.target); },
  flyPose(t){ const p=flyPose(t); return { pos: p.pos.toArray(), tgt: p.tgt.toArray() }; },
  boardPose(){ const p=boardPose(); return { pos: p.pos.toArray(), tgt: p.tgt.toArray() }; },
  boardOnScreen(){ const v=new THREE.Vector3(BOARD.x, 22.5, BOARD.z).project(camera); return [(v.x+1)/2*innerWidth, (1-v.y)/2*innerHeight, v.z]; },
  boardFace(){ const c=Math.cos(BOARD.face), s=Math.sin(BOARD.face); return [[-25,32.25],[25,32.25],[25,12.75],[-25,12.75]].map(([lx,ly])=>{ const lz=0.6; const v=new THREE.Vector3(BOARD.x+lx*c+lz*s, ly, BOARD.z-lx*s+lz*c).project(camera); return [(v.x+1)/2*innerWidth, (1-v.y)/2*innerHeight]; }); },
  state(){ const r=v=>v.toArray().map(n=>Math.round(n*10)/10); return { mode, pos:r(camera.position), tgt:r(controls.target), reduce:!!reduce, phone:PHONE, dpr:DPR, slotMode:SLOT.mode, agent:!!SLOT.agent, pin:pin.visible ? [pin.position.x, pin.position.z] : null }; },
  movers(){ return lmMovers.map(f=>f()); },
  /* the ground (y = 0) under a screen pixel, for placing things from a screenshot */
  ground(px, py){ const v=new THREE.Vector3(px/innerWidth*2-1, -(py/innerHeight)*2+1, .5).unproject(camera).sub(camera.position).normalize(); const t=-camera.position.y/v.y; return [Math.round(camera.position.x+v.x*t), Math.round(camera.position.z+v.z*t)]; },
  loseContext(){ const x=renderer.getContext().getExtension('WEBGL_lose_context'); if(x) x.loseContext(); return !!x; },
  info(){ const r=renderer.info.render; let tris=0, meshes=0; const top=[]; scene.traverse(o=>{ if(!o.isMesh||!o.visible) return; meshes++; const g=o.geometry, n=(g.index ? g.index.count/3 : g.attributes.position.count/3)*(o.isInstancedMesh ? o.count : 1); tris+=n; top.push([o.material.type+(o.isInstancedMesh?'*':''), Math.round(n)]); }); top.sort((a,b)=>b[1]-a[1]); return { tris:Math.round(tris), top:top.slice(0,8), meshes, calls:r.calls, triangles:r.triangles, trees:trees.length, buildings:DATA.foot.length, suburb:suburbCount, geometries:renderer.info.memory.geometries }; },
};

const hint=$('#hint'); let hintTimer=0;
function showHint(){ hint.classList.remove('fade'); clearTimeout(hintTimer); hintTimer=setTimeout(()=>hint.classList.add('fade'), 4200); }
function tuck(){ if(innerWidth<760 && form.hidden && !panel.classList.contains('min')) { panel.classList.add('min'); bMin.textContent='Show'; bMin.setAttribute('aria-expanded','false'); } }
if(!window.__BAIT_TEST) setTimeout(tuck, 16000);
controls.addEventListener('start', ()=>{ tuck(); lastInput=performance.now(); if(mode!=='explore'){ mode='explore'; tween.on=false; setButtons('explore'); showHint(); } });
controls.addEventListener('change', ()=>{ if(mode==='explore') lastInput=performance.now(); });

/* ---------- UI ---------- */
const bFly=$('#bFly'), bExplore=$('#bExplore'), bBoard=$('#bBoard');
function setButtons(m){ bFly.classList.toggle('on', m==='fly'); bExplore.classList.toggle('on', m==='explore'); bBoard.classList.toggle('on', m==='board'); }
setButtons(mode);
bFly.onclick=()=>{ lastInput=performance.now(); startFly(); };
bExplore.onclick=()=>{ tween.on=false; mode='explore'; setButtons('explore'); showHint(); lastInput=performance.now(); };
bBoard.onclick=()=>{ lastInput=performance.now(); boardView(); };
const panel=$('#panel'), story=$('#story'), form=$('#nameForm'), actions=$('#actions'), bMin=$('#bMin');
bMin.onclick=()=>{ const min=panel.classList.toggle('min'); bMin.textContent=min ? 'Show' : 'Hide'; bMin.setAttribute('aria-expanded', String(!min)); };
$('#goldLine').textContent=panelLine(SLOT);
if(BUILD.page==='site') setLink($('#pricePill'), SLOT.links.price);
const nm=$('#nm'), ag=$('#ag');
/* pitch mode: what is typed lives only on this screen. Nothing is stored, so the next agent starts on an empty board. */
const typedBoard=()=>boardLines({ mode:'pitch', suburb:SLOT.suburb, postcode:PLAN.postcode, typed:{ name:nm.value, agency:ag.value }, host:HOST });
function openForm(open){ form.hidden=!open; actions.hidden=open; story.hidden=open; panel.classList.remove('min'); bMin.hidden=open; if(open){ nm.focus({preventScroll:true}); boardView(); } }
if(SLOT.mode==='public'){
  form.remove(); $('#bName').remove();
  const a=$('#bAsk'); setLink(a, SLOT.links.ask); a.hidden=false; a.addEventListener('click', ()=>beacon('ask'));
  const adv=$('#bAdvertise'); if(SLOT.agent) adv.remove(); else { setLink(adv, SLOT.links.advertise); adv.hidden=false; }
} else {
  $('#bAsk').remove(); $('#bAdvertise').remove();
  $('#bName').onclick=()=>openForm(true);
  $('#bCancel').onclick=()=>openForm(false);
  $('#bClear').onclick=()=>{ nm.value=''; ag.value=''; drawBoard(typedBoard()); openForm(false); };
  form.addEventListener('submit', e=>{ e.preventDefault(); drawBoard(typedBoard()); openForm(false); lastInput=performance.now(); boardView(); });
  nm.addEventListener('input', ()=>drawBoard(typedBoard())); ag.addEventListener('input', ()=>drawBoard(typedBoard()));
}
canvas.addEventListener('webglcontextlost', e=>{ e.preventDefault(); fallback('lost'); });

/* ---------- loop ---------- */
const header=document.querySelector('.top .brand');
function layoutLens(){ const w=innerWidth, h=innerHeight; const top=header.getBoundingClientRect().bottom; const pr=panel.getBoundingClientRect(); const bottom = (pr.width>w*0.6) ? pr.top : h; const vc=Math.max(h*0.3, Math.min(h*0.6, (top+bottom)/2)); const d=Math.round(h/2-vc);
  if(Math.abs(d)>2) camera.setViewOffset(w,h,0,d,w,h); else camera.clearViewOffset(); lens.uniforms.focusY.value=1-vc/h; }
function resize(){ const w=innerWidth, h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); layoutLens(); renderer.getDrawingBufferSize(bufSize); rtA.setSize(bufSize.x,bufSize.y); rtB.setSize(bufSize.x,bufSize.y); lens.uniforms.texel.value.set(1/bufSize.x,1/bufSize.y); lens.uniforms.band.value = w/h<.8 ? .085 : .09; lens.uniforms.fade.value = w/h<.8 ? .26 : .32; }
if(window.ResizeObserver) new ResizeObserver(()=>layoutLens()).observe(panel);
addEventListener('resize', resize); resize();
let last=performance.now(), clockT=0, firstFrame=true;
function frame(now){
  if(!running) return;
  /* phones: 30 fps is plenty for a model this calm, and it halves the battery cost */
  if(!firstFrame && !frameDue(now, last, PHONE, TEST)){ requestAnimationFrame(frame); return; }
  const dt=TEST ? 0 : Math.min(.05,(now-last)/1000); last=now; clockT = TEST ? (TEST.t||0) : clockT+dt; if(TEST) window.__bait.frames++;
  if(mode==='fly'){ flyT+=dt; const p=flyPose(flyT); camera.position.copy(p.pos); controls.target.copy(p.tgt); camera.lookAt(p.tgt); }
  else if(mode==='travel' && tween.on){ tween.t=Math.min(1, tween.t+dt/tween.dur); const e=ease(tween.t); camera.position.lerpVectors(tween.fromP, tween.toP, e); controls.target.lerpVectors(tween.fromT, tween.toT, e); camera.lookAt(controls.target); if(tween.t>=1){ tween.on=false; mode=tween.then; } }
  else if(mode==='test'){ camera.lookAt(controls.target); }
  else { controls.update(); const t=controls.target; const cx=Math.max(X0,Math.min(X1,t.x)), cz=Math.max(Z0,Math.min(Z1,t.z)); if(cx!==t.x||cz!==t.z){ const dx=cx-t.x, dz=cz-t.z; t.x=cx; t.z=cz; camera.position.x+=dx; camera.position.z+=dz; } t.y=0;
    if(autoFly({ reduce, formOpen:!form.hidden, idleMs:now-lastInput })) startFly(); }
  wn1.offset.set(clockT*.012, clockT*.007); wn2.offset.set(-clockT*.01, clockT*.012);
  foamMat.opacity=.55+.25*Math.sin(clockT*1.3); foamMat2.opacity=.18+.2*Math.sin(clockT*1.3-1.4);
  edgeMat.opacity=.75+.2*Math.sin(clockT*2.0);
  updateCars(dt); updateWalkers(); updateLandmarks(); if(regatta) regatta.update();
  if(rowPath){ rowS+=4.5*dt*rowDir; if(rowS>rowPath.L){ rowS=rowPath.L; rowDir=-1; } if(rowS<0){ rowS=0; rowDir=1; }
  const rq=at(rowPath,rowS); eight.position.set(rq[0],0.2,rq[1]); eight.rotation.y=-Math.atan2(rq[3]*rowDir, rq[2]*rowDir); }
  yachts.forEach(y=>{ const u=y.userData; y.position.set(u.x+Math.sin(clockT*.05+u.ph)*u.r, Math.sin(clockT*1.1+u.ph)*.35, u.z+Math.cos(clockT*.05+u.ph)*u.r*.67); y.rotation.y=-(clockT*.05+u.ph)+Math.PI; y.rotation.z=Math.sin(clockT*.9+u.ph)*.05; });
  renderer.setRenderTarget(rtA); renderer.render(scene,camera);
  lens.uniforms.tDiffuse.value=rtA.texture; lens.uniforms.dir.value.set(1,0); lens.uniforms.grade.value=0; renderer.setRenderTarget(rtB); renderer.render(quadScene,quadCam);
  lens.uniforms.tDiffuse.value=rtB.texture; lens.uniforms.dir.value.set(0,1); lens.uniforms.grade.value=1; renderer.setRenderTarget(null); renderer.render(quadScene,quadCam);
  /* labels go on after the lens, so they stay sharp wherever they sit in the blur */
  renderer.autoClear=false; renderer.render(labelScene,camera); renderer.autoClear=true;
  if(firstFrame){ firstFrame=false; beacon('moving'); if(loading){ loading.classList.add('gone'); setTimeout(()=>loading.remove(), 800); } }
  requestAnimationFrame(frame);
}
function begin(){ makePlaque(); makeLabels(); drawBoard(SLOT.mode==='public' ? boardLines({ mode:'public', suburb:SLOT.suburb, postcode:PLAN.postcode, agent:SLOT.agent, host:HOST }) : typedBoard()); renderer.shadowMap.needsUpdate=true; requestAnimationFrame(t=>{ last=t; frame(t); }); }
const fontsReady = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('800 60px Figtree'), document.fonts.load('600 40px Figtree'), document.fonts.load('400 58px "Young Serif"')]) : Promise.resolve();
Promise.race([fontsReady, new Promise(r=>setTimeout(r,1800))]).then(()=>{ /* redraw text textures once the faces are in */ begin(); }).catch(begin);
}

return { start, fallback, build: BUILD, slot: SLOT, rules: PAGE_RULES };
})();
