/* aldo.today — the 3D skyline (v3.29). Loaded by site.js on the first "See it in 3D" press, after three.js r128.
   Every suburb on the flat map, raised and coloured by the map's tab (v3.34: the height follows the tab too). It reads the flat
   map's own shapes, colours and data, so nothing else is fetched. The flat SVG stays the real, accessible map.

   One shader patch (RISE) raises the suburbs on the GPU: the lit model, its shadow pass, the outlines and the
   picking pass all use it, so whatever you see is what the shadows, the hover and the click agree on.

   v3.43: the CBD is a miniature. Every building in Adelaide 5000 (OpenStreetMap, tools/build_cbd.py → cbd-3d.json)
   stands on the city's roof, in card, at four times its real height; the roof is still the tab's number. */
(function () {
  'use strict';
  var A = window.AtlasMap, THREE = window.THREE;
  if (!A || !THREE || window.AtlasMap3D) return;

  var mapEl = A.el, svg = A.svg, data = A.data;
  // the whole gulf out to Yorke Peninsula (tools/build_sea.py); the flat map's own sea path is the fallback
  var me = document.currentScript && document.currentScript.src || '';
  var seaWide = window.fetch ? fetch('/assets/sea-3d.json' + (me.indexOf('?') > 0 ? me.slice(me.indexOf('?')) : ''))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { return d && typeof d.d === 'string' && /^[MLZ0-9,.\-]*$/.test(d.d) ? d.d : null; })
    .catch(function () { return null; }) : Promise.resolve(null);
  // v3.43: the CBD's buildings. Not waited for: the city goes up without them and they join it when they land.
  var cbdTown = window.fetch ? fetch('/assets/cbd-3d.json' + (me.indexOf('?') > 0 ? me.slice(me.indexOf('?')) : ''))
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; }) : Promise.resolve(null);
  var seaD = null, waiting = false;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = Math.min(screen.width, screen.height) < 760 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var HK = 32 / 1e6;          // map units of height per dollar: linear from zero, so twice the price is twice as tall
  var FLAT = 0.8;             // too few sales: a low slab in the no-data colour
  // v3.34: each tab raises the suburbs by its own number, linear from zero, scaled so a middling suburb stands
  // about as tall as a middling one on price (~35 units). The one-year change can be negative, so it stands on a
  // 24-unit "no change" line: falls sink below it, rises climb above (capped at +80% so one outlier can't tower).
  var HEIGHT = {
    p: function (d) { return d.m12 ? d.m12 * HK : null; },
    c: function (d) { return d.chg == null ? null : Math.max(1.2, 24 + Math.min(d.chg, 80)); },
    m: function (d) { return d.ppm2 ? d.ppm2 / 60 : null; },
    y: function (d) { return d.yld != null ? d.yld * 10 : null; },
    f: function (d) { return d.ppl && d.ppl[0] != null ? Math.max(1.2, d.ppl[0] * 1.4) : null; },
    a: function (d) { return d.ppl && d.ppl[1] != null ? d.ppl[1] * 0.85 : null; },
    r: function (d) { return d.ppl && d.ppl[2] != null ? Math.max(1.2, d.ppl[2] * 1.3) : null; },
    k: function (d) { return d.cr ? d.cr[2] / 90 : null; }   // v3.42: council rates a year, linear from zero ($2,700 ≈ 30 units)
  };
  var LIFT = 6;               // how far a hovered or picked suburb rises
  var FOV = 30;
  var SUN = new THREE.Vector3(-0.55, 0.72, -0.42).normalize();   // afternoon sun from the north-west
  var END = { phi: 0.88, theta: -0.36, margin: 0.9 };             // the finished view: from the south-south-west, the whole city in frame
  var CBD = 'adelaide';
  var CBD_VX = 4;             // v3.43: the CBD's buildings at four times their real height (138 m ≈ 10 units), so a two-storey shop still reads
  var CBD_RISE = 0.42;        // ...and they go up once the city's roof is nearly there
  var CBD_R = 340;            // how close "Find a suburb: Adelaide" flies, to see them

  // ---------------------------------------------------------------- colours, straight from the stylesheet
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  var col = function (name, fallback) { var c = new THREE.Color(); try { c.setStyle(css(name) || fallback); } catch (e) { c.setStyle(fallback); } return c; };

  // ---------------------------------------------------------------- shapes from the SVG paths
  function ringsOf(d) {
    var out = [], cur = null;
    d.replace(/([MLZ])([^MLZ]*)/g, function (_, c, args) {
      if (c === 'M') { cur = []; out.push(cur); }
      if (c === 'Z' || !cur) return;
      var n = args.split(/[\s,]+/).filter(Boolean).map(Number);
      for (var i = 0; i + 1 < n.length; i += 2) cur.push([n[i], n[i + 1]]);
    });
    return out.map(function (r) {           // drop repeated points (and the closing one): they make zero-width walls
      var c = [];
      r.forEach(function (p) { var q = c[c.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) c.push(p); });
      while (c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c.pop();
      return c;
    }).filter(function (r) { return r.length >= 3; });
  }
  var area = function (r) { var s = 0; for (var i = 0; i < r.length; i++) { var a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  function inside(p, r) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      if (((r[i][1] > p[1]) !== (r[j][1] > p[1])) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  }
  // rings → [{outer, holes}] (the sea has islands; suburbs don't, but daw-park is two islands)
  function polys(rings) {
    if (!rings.length) return [];
    var big = rings.reduce(function (m, r) { return Math.abs(area(r)) > Math.abs(area(m)) ? r : m; });
    var sign = area(big) > 0 ? 1 : -1;
    var outers = rings.filter(function (r) { return area(r) * sign > 0; }).map(function (r) { return { outer: r, holes: [] }; });
    rings.forEach(function (r) {
      if (area(r) * sign > 0) return;
      for (var i = 0; i < outers.length; i++) if (inside(r[0], outers[i].outer)) { outers[i].holes.push(r); return; }
    });
    return outers;
  }

  // ---------------------------------------------------------------- the shader patch everything shares
  var U = {
    uT: { value: 0 }, uLit: { value: 0 }, uHover: { value: -1 }, uFocus: { value: -1 }, uLift: { value: LIFT },
    uInk: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uHatch: { value: new THREE.Color() },
    uBase: { value: 0 }, uTownAt: { value: 0 }, uTownId: { value: -1 }
  };
  var RISE_DECL = [
    'attribute float aHeight;', 'attribute float aDelay;', 'attribute float aId;',
    'uniform float uT;', 'uniform float uHover;', 'uniform float uFocus;', 'uniform float uLift;',
    'varying float vHot;',
    'float riseOf() { float k = clamp((uT - aDelay) / 0.55, 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }',
    'float hotOf() { return max(1.0 - step(0.5, abs(aId - uHover)), 1.0 - step(0.5, abs(aId - uFocus))); }'
  ].join('\n');
  var RISE_BODY = 'vec3 transformed = vec3( position ); float rk = riseOf(); vHot = hotOf(); transformed.y *= aHeight * rk + vHot * uLift * rk;';
  function riseVertex(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + RISE_DECL)
      .replace('#include <begin_vertex>', RISE_BODY);
  }
  function link(shader, names) { names.forEach(function (n) { shader.uniforms[n] = U[n]; }); }

  // Lit materials start unlit — exactly the flat map's colours — and the light fades in as the suburbs rise.
  // (r128 passes hex colours through untouched with no tone mapping, so uLit = 0 is the CSS colour.)
  // A hovered or picked suburb also brightens a little, so "yours" stands out.
  var UNLIT = 'gl_FragColor.rgb = mix( diffuseColor.rgb, gl_FragColor.rgb, uLit );\n' +
    'gl_FragColor.rgb = mix( gl_FragColor.rgb, min( gl_FragColor.rgb * 1.16 + 0.05, 1.0 ), vHot );\n#include <tonemapping_fragment>';
  // "Too few sales" tops get the flat map's hatching: lines every 8 map units at 45 degrees, 1.6 wide.
  var HATCH = [
    'float hs = ( vXZ.x + vXZ.y ) * 0.70710678 / 8.0, hd = fract( hs ), aa = max( fwidth( hs ), 1e-4 );',
    'float hk = clamp( ( 0.2 - hd ) / ( 2.0 * aa ) + 0.5, 0.0, 1.0 ) + clamp( ( hd - 1.0 ) / ( 2.0 * aa ) + 0.5, 0.0, 1.0 );',
    'hk = mix( hk, 0.2, smoothstep( 0.25, 0.6, aa ) );',
    'diffuseColor.rgb = mix( diffuseColor.rgb, uHatch, hk * vNone );'
  ].join('\n');
  function suburbMaterial() {
    var m = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    m.extensions = { derivatives: true };
    m.onBeforeCompile = function (s) {   // suburbs
      riseVertex(s); link(s, ['uT', 'uHover', 'uFocus', 'uLift', 'uLit', 'uHatch']);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aNone;\nvarying float vNone;\nvarying vec2 vXZ;')
        .replace(RISE_BODY, RISE_BODY + '\nvNone = aNone; vXZ = position.xz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLit;\nuniform vec3 uHatch;\nvarying float vHot;\nvarying float vNone;\nvarying vec2 vXZ;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + HATCH)
        .replace('#include <tonemapping_fragment>', UNLIT);
    };
    return m;
  }
  function outlineMaterial() {
    var m = new THREE.LineBasicMaterial({ vertexColors: false });
    m.onBeforeCompile = function (s) {   // suburb outlines: the map's paper-coloured borders, turning to ink as the light comes up
      riseVertex(s); link(s, ['uT', 'uHover', 'uFocus', 'uLift', 'uLit', 'uInk', 'uHot']);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLit;\nuniform vec3 uInk;\nuniform vec3 uHot;\nvarying float vHot;')
        .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = mix( mix( diffuseColor.rgb, uInk, uLit * 0.3 ), uHot, vHot );\n#include <tonemapping_fragment>');
    };
    return m;
  }
  function depthMaterial() {
    var m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = function (s) { riseVertex(s); link(s, ['uT', 'uHover', 'uFocus', 'uLift']); };   // shadows rise with the suburbs
    return m;
  }
  function pickMaterial() {   // each suburb drawn in its own id colour, for a one-pixel read under the pointer
    return new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: RISE_DECL + '\nvarying float vId;\nvoid main() {\n' + RISE_BODY + '\nvId = aId;\ngl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );\n}',
      fragmentShader: 'varying float vId;\nvoid main() { float id = vId + 1.0; gl_FragColor = vec4( mod( id, 256.0 ) / 255.0, floor( id / 256.0 ) / 255.0, 0.0, 1.0 ); }'
    });
  }

  // v3.43: the CBD's buildings. Their feet sit on the city's roof (uBase, the RISE height of that one suburb, lift
  // and all) and their own heights grow in after it; walls darken toward the roof, like a card model under a lamp.
  var TOWN_DECL = [
    'uniform float uT;', 'uniform float uHover;', 'uniform float uFocus;', 'uniform float uLift;',
    'uniform float uBase;', 'uniform float uTownAt;', 'uniform float uTownId;',
    'varying float vHot;', 'varying float vShade;'
  ].join('\n');
  var TOWN_BODY = [
    'vec3 transformed = vec3( position );',
    'float rk = clamp( ( uT - uTownAt ) / 0.55, 0.0, 1.0 ); rk = rk * rk * ( 3.0 - 2.0 * rk );',
    'float tk = clamp( ( uT - uTownAt - ' + CBD_RISE.toFixed(3) + ' ) / 0.5, 0.0, 1.0 ); tk = tk * tk * ( 3.0 - 2.0 * tk );',
    'vHot = max( 1.0 - step( 0.5, abs( uTownId - uHover ) ), 1.0 - step( 0.5, abs( uTownId - uFocus ) ) );',
    'transformed.y = ( uBase + vHot * uLift ) * rk + position.y * tk;',
    'transformed *= step( 1e-4, tk );',   // not up yet: every vertex at one point, so nothing draws (flat, they'd be white footprints on the map)
    'vShade = normal.y > 0.5 ? 1.0 : mix( 0.7, 1.0, smoothstep( 0.0, 1.6, position.y ) );'
  ].join('\n');
  function townVertex(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TOWN_DECL)
      .replace('#include <begin_vertex>', TOWN_BODY);
  }
  var TOWN_U = ['uT', 'uHover', 'uFocus', 'uLift', 'uBase', 'uTownAt', 'uTownId'];
  function townMaterial() {
    var m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = function (s) {
      townVertex(s); link(s, TOWN_U.concat('uLit'));
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLit;\nvarying float vHot;\nvarying float vShade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vShade;')
        .replace('#include <tonemapping_fragment>', UNLIT);
    };
    return m;
  }
  function townDepthMaterial() {
    var m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = function (s) { townVertex(s); link(s, TOWN_U); };
    return m;
  }
  function townPickMaterial() {   // a building picks as the CBD
    return new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: TOWN_DECL + '\nvoid main() {\n' + TOWN_BODY + '\ngl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );\n}',
      fragmentShader: 'uniform float uTownId;\nvoid main() { float id = uTownId + 1.0; gl_FragColor = vec4( mod( id, 256.0 ) / 255.0, floor( id / 256.0 ) / 255.0, 0.0, 1.0 ); }'
    });
  }
  var townK = function () { var k = Math.min(1, Math.max(0, (U.uT.value - U.uTownAt.value - CBD_RISE) / 0.5)); return k * k * (3 - 2 * k); };

  // ---------------------------------------------------------------- state
  var built = false, open = false, broken = false;
  var renderer, scene, camera, sun, hemi, ground, groundMat, shadeMat, seaMat, seaLineMat, mesh, lines, pickScene, pickTarget, colAttr, hAttr, lhAttr;
  var slugs = [], ranges = [], lranges = [], cls = {}, heights = [], delays = [], index = {}, tops = [], noneAttr = null, boxes = [];
  var town = null, townId = -1, townTop = 0, townCount = 0;
  var canvas, resetBtn, hint, credit = null, labels = [];
  var PLACES = [
    { name: 'Gulf St Vincent', at: [-60, 760], sea: true },
    { name: 'City', slug: 'adelaide' },
    { name: 'Port Adelaide', slug: 'port-adelaide' },
    { name: 'Glenelg', slug: 'glenelg' },
    { name: 'Elizabeth', slug: 'elizabeth' },
    { name: 'Noarlunga', slug: 'noarlunga-centre' },
    { name: 'Adelaide Hills', slug: 'stirling', dz: 30 }
  ];
  var view = { tx: 500, tz: 790, R: 3000, phi: 0.001, theta: 0 };
  var R0 = 3000, Rmin = 120, Rmax = 6000, bounds = [0, 0, 1000, 1581];
  var lowQ = false;

  function build() {
    canvas = document.createElement('canvas');
    canvas.className = 'atlas__gl';
    canvas.setAttribute('aria-hidden', 'true');
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { broken = true; throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); broken = true; finishClose(); });

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6);
    camera = new THREE.PerspectiveCamera(FOV, 1, 4, 30000);
    var amb = new THREE.AmbientLight(0xfff4e6, 0.28);
    hemi = new THREE.HemisphereLight(0xffffff, 0xb9a98f, 0.5);
    sun = new THREE.DirectionalLight(0xfff1dc, 0.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.4;
    scene.add(amb, hemi, sun, sun.target);

    // suburbs: one merged mesh (tops and walls; nobody sees the bottoms) + one set of outlines
    var P = [], N = [], C = [], H = [], D = [], I = [], TOP = [], LP = [], LH = [], LD = [], LI = [];
    var paths = svg.querySelectorAll('path[data-s]');
    var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    var cbd = data.adelaide && data.adelaide.c ? data.adelaide.c : [500, 790];
    var far = 1;
    paths.forEach(function (p) { var d = data[p.getAttribute('data-s')]; if (d && d.c) far = Math.max(far, Math.hypot(d.c[0] - cbd[0], d.c[1] - cbd[1])); });
    function tri(a, b, c, n, h, dl, id) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { var t = b; b = c; c = t; }   // face the way the normal points
      [a, b, c].forEach(function (v) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(1, 1, 1); H.push(h); D.push(dl); I.push(id); TOP.push(n[1] > 0.5 ? 1 : 0); });
    }
    paths.forEach(function (p) {
      var slug = p.getAttribute('data-s'), d = data[slug];
      var id = slugs.length, start = P.length / 3, lstart = LP.length / 3;
      var h = d && d.m12 ? d.m12 * HK : FLAT;
      var dl = d && d.c ? 0.45 * Math.hypot(d.c[0] - cbd[0], d.c[1] - cbd[1]) / far : 0.45;
      var box = [Infinity, Infinity, -Infinity, -Infinity];
      ringsOf(p.getAttribute('d') || '').forEach(function (ring) {   // suburbs have no holes: every ring is a piece of land
        var r = ring.slice();
        if (area(r) < 0) r.reverse();
        r.forEach(function (q) {
          x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]);
          box[0] = Math.min(box[0], q[0]); box[1] = Math.min(box[1], q[1]); box[2] = Math.max(box[2], q[0]); box[3] = Math.max(box[3], q[1]);
        });
        var faces = THREE.ShapeUtils.triangulateShape(r.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), []);
        faces.forEach(function (f) { tri([r[f[0]][0], 1, r[f[0]][1]], [r[f[1]][0], 1, r[f[1]][1]], [r[f[2]][0], 1, r[f[2]][1]], [0, 1, 0], h, dl, id); });
        for (var k = 0; k < r.length; k++) {
          var a = r[k], b = r[(k + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
          var n = [dz / len, 0, -dx / len];          // outward, for a ring with positive area
          tri([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 1, b[1]], n, h, dl, id);
          tri([a[0], 0, a[1]], [b[0], 1, b[1]], [a[0], 1, a[1]], n, h, dl, id);
          LP.push(a[0], 1, a[1], b[0], 1, b[1]); LH.push(h, h); LD.push(dl, dl); LI.push(id, id);
        }
      });
      index[slug] = id;
      slugs.push(slug); heights.push(h); delays.push(dl); boxes.push(box);
      ranges.push([start, P.length / 3 - start]);
      lranges.push([lstart, LP.length / 3 - lstart]);
      cls[slug] = p.getAttribute('class') || '';
    });
    bounds = [x0, z0, x1, z1];

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    colAttr = new THREE.Float32BufferAttribute(C, 3);
    g.setAttribute('color', colAttr);
    hAttr = new THREE.Float32BufferAttribute(H, 1);
    g.setAttribute('aHeight', hAttr);
    g.setAttribute('aDelay', new THREE.Float32BufferAttribute(D, 1));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(I, 1));
    tops = TOP;
    noneAttr = new THREE.Float32BufferAttribute(new Float32Array(TOP.length), 1);
    g.setAttribute('aNone', noneAttr);
    mesh = new THREE.Mesh(g, suburbMaterial());
    mesh.customDepthMaterial = depthMaterial();
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;                    // the GPU moves the vertices; the CPU bounding box can't know
    scene.add(mesh);

    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3));
    lhAttr = new THREE.Float32BufferAttribute(LH, 1);
    lg.setAttribute('aHeight', lhAttr);
    lg.setAttribute('aDelay', new THREE.Float32BufferAttribute(LD, 1));
    lg.setAttribute('aId', new THREE.Float32BufferAttribute(LI, 1));
    lines = new THREE.LineSegments(lg, outlineMaterial());
    lines.frustumCulled = false;
    scene.add(lines);

    // the table the city sits on, and the gulf (from the flat map's own sea path, when it has one)
    groundMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(500, -2, 790);
    scene.add(ground);
    shadeMat = new THREE.ShadowMaterial({ color: 0x5a3a22, opacity: 0, transparent: true, depthWrite: false });
    var shade = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), shadeMat);
    shade.rotation.x = -Math.PI / 2;
    shade.position.set(500, -0.5, 790);
    shade.receiveShadow = true;
    shade.renderOrder = 1;
    scene.add(shade);
    var seaPath = svg.querySelector('[data-sea]');
    seaD = seaD || (seaPath && seaPath.getAttribute('d'));
    if (seaD) {
      var SP = [], SL = [];
      polys(ringsOf(seaD)).forEach(function (poly) {
        var outer = poly.outer.slice(); if (area(outer) < 0) outer.reverse();
        var holes = poly.holes.map(function (h) { h = h.slice(); if (area(h) > 0) h.reverse(); return h; });
        var all = outer.concat.apply(outer, holes);
        var faces = THREE.ShapeUtils.triangulateShape(outer.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), holes.map(function (h) { return h.map(function (q) { return new THREE.Vector2(q[0], q[1]); }); }));
        faces.forEach(function (f) {
          var a = all[f[0]], b = all[f[1]], c = all[f[2]];
          if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) { var t = b; b = c; c = t; }   // face up
          SP.push(a[0], -1.5, a[1], b[0], -1.5, b[1], c[0], -1.5, c[1]);
        });
        [outer].concat(holes).forEach(function (r) { for (var k = 0; k < r.length; k++) { var a = r[k], b = r[(k + 1) % r.length]; SL.push(a[0], -1.4, a[1], b[0], -1.4, b[1]); } });
      });
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
      sg.computeVertexNormals();
      seaMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      scene.add(new THREE.Mesh(sg, seaMat));
      var slg = new THREE.BufferGeometry();
      slg.setAttribute('position', new THREE.Float32BufferAttribute(SL, 3));
      seaLineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
      scene.add(new THREE.LineSegments(slg, seaLineMat));
    }

    // the sun's shadow box covers the whole city
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2 + 40;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + SUN.x * 3000, SUN.y * 3000, cz + SUN.z * 3000);
    var sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 100; sc.far = 6000;
    sc.updateProjectionMatrix();
    wholeSun = { cx: cx, cz: cz, half: half };

    pickScene = new THREE.Scene();
    pickScene.add(new THREE.Mesh(g, pickMaterial()));
    pickScene.children[0].frustumCulled = false;
    pickTarget = new THREE.WebGLRenderTarget(1, 1);

    // the controls that sit on the map while it's in 3D
    resetBtn = document.createElement('button');
    resetBtn.type = 'button'; resetBtn.className = 'atlas__reset'; resetBtn.hidden = true; resetBtn.textContent = 'Reset view';
    resetBtn.addEventListener('click', function () { focusId(-1); A.hideTip(); flyView(endView(), 700); });
    hint = document.createElement('p');
    hint.className = 'atlas__hint'; hint.setAttribute('aria-hidden', 'true');
    mapEl.appendChild(canvas); mapEl.appendChild(resetBtn); mapEl.appendChild(hint);
    PLACES.forEach(function (pl) {
      var at = pl.slug ? data[pl.slug] && data[pl.slug].c : pl.at;
      if (!at) return;
      var el = document.createElement('span');
      el.className = 'atlas__place' + (pl.sea ? ' atlas__place--sea' : '');
      el.setAttribute('aria-hidden', 'true');
      el.textContent = pl.name;
      mapEl.appendChild(el);
      labels.push({ el: el, x: at[0] + (pl.dx || 0), z: at[1] + (pl.dz || 0), id: pl.slug ? index[pl.slug] : -1, sea: pl.sea });
    });

    applyTheme();
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var onTheme = function () { applyTheme(); setMetric(A.metric(), true); invalidate(); };
      if (mq.addEventListener) mq.addEventListener('change', onTheme); else if (mq.addListener) mq.addListener(onTheme);
    }
    bindInput();
    if (window.ResizeObserver) new ResizeObserver(function () { if (open) { place(); invalidate(); } }).observe(svg);
    else window.addEventListener('resize', function () { if (open) { place(); invalidate(); } });
    built = true;
    cbdTown.then(function (doc) { try { addTown(doc); } catch (e) { town = null; } });   // no buildings is just the old flat roof
  }

  // v3.43: cbd-3d.json → one mesh. Each building is [height dm, base dm, outer ring, courtyards…]; a ring is its first
  // point from the file's origin and then steps, in hundredths of a map unit. Heights are real metres in the file.
  function addTown(doc) {
    var id = index[CBD];
    if (town || id === undefined || !doc || !doc.b || !doc.m || !doc.o) return;
    var q = doc.q || 0.01, k = CBD_VX / doc.m, P = [], N = [], top = 0, n = 0;
    var put = function (a, b, c, nm) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      if ((uy * vz - uz * vy) * nm[0] + (uz * vx - ux * vz) * nm[1] + (ux * vy - uy * vx) * nm[2] < 0) { var t = b; b = c; c = t; }
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      N.push(nm[0], nm[1], nm[2], nm[0], nm[1], nm[2], nm[0], nm[1], nm[2]);
    };
    var v2 = function (p) { return new THREE.Vector2(p[0], p[1]); };
    doc.b.forEach(function (b) {
      var hi = b[0] / 10 * k, lo = b[1] / 10 * k;
      var rings = b.slice(2).map(function (f, j) {
        var X = Math.round(doc.o[0] / q), Z = Math.round(doc.o[1] / q), r = [];
        for (var i = 0; i + 1 < f.length; i += 2) { X += f[i]; Z += f[i + 1]; r.push([X * q, Z * q]); }
        if ((area(r) > 0) !== (j === 0)) r.reverse();     // the outline positive, courtyards negative: every wall faces out of the building
        return r;
      }).filter(function (r) { return r.length >= 3; });
      if (!rings.length || hi <= lo) return;
      var all = [].concat.apply([], rings);
      THREE.ShapeUtils.triangulateShape(rings[0].map(v2), rings.slice(1).map(function (r) { return r.map(v2); })).forEach(function (f) {
        put([all[f[0]][0], hi, all[f[0]][1]], [all[f[1]][0], hi, all[f[1]][1]], [all[f[2]][0], hi, all[f[2]][1]], [0, 1, 0]);
      });
      rings.forEach(function (r) {
        for (var i = 0; i < r.length; i++) {
          var a = r[i], c = r[(i + 1) % r.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz) || 1, nm = [dz / len, 0, -dx / len];
          put([a[0], lo, a[1]], [c[0], lo, c[1]], [c[0], hi, c[1]], nm);
          put([a[0], lo, a[1]], [c[0], hi, c[1]], [a[0], hi, a[1]], nm);
        }
      });
      top = Math.max(top, hi); n++;
    });
    if (!n) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    town = new THREE.Mesh(g, townMaterial());
    town.customDepthMaterial = townDepthMaterial();
    town.castShadow = town.receiveShadow = true;
    town.frustumCulled = false;
    townId = id; townTop = top; townCount = n;
    U.uTownId.value = id; U.uTownAt.value = delays[id]; U.uBase.value = heights[id];
    scene.add(town);
    var pick = new THREE.Mesh(g, townPickMaterial());
    pick.frustumCulled = false;
    pickScene.add(pick);
    paintTown();
    credit = document.createElement('a');           // ODbL: the buildings say where they're from, while they're on screen
    credit.className = 'atlas__credit'; credit.href = 'https://www.openstreetmap.org/copyright'; credit.rel = 'noopener';
    credit.textContent = 'Buildings © OpenStreetMap'; credit.hidden = !open || rising;
    mapEl.appendChild(credit);
    renderer.compile(scene, camera);   // now, not in the middle of the rise; the shadow pass compiles on the next frame, still before it
    shadowsDirty = true;
    invalidate();
  }
  function paintTown() {          // card: the page's paper in the light, its ink (a warm off-white) in the dark
    if (!town) return;
    var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    town.material.color.copy(dark ? col('--ink', '#efe6d6') : col('--sheet', '#fbf7ee'));
  }

  function applyTheme() {
    var sheet = col('--sheet', '#fbf7ee');
    renderer.setClearColor(sheet);
    scene.fog.color.copy(sheet);
    groundMat.color.copy(sheet);
    lines.material.color.copy(sheet);
    U.uInk.value.copy(col('--ink', '#2a241e'));
    U.uHot.value.copy(col('--ink', '#2a241e'));
    U.uHatch.value.copy(col('--hatch', '#d3c9b8'));
    var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    hemi.groundColor.set(dark ? 0x4a3f35 : 0xb9a98f);
    shadeMat.color.set(dark ? 0x000000 : 0x5a3a22);
    shadeK = dark ? 0.42 : 0.2;
    light(U.uLit.value);
    if (seaMat) { seaMat.color.copy(col('--sea', '#dbe5e3')); seaLineMat.color.copy(col('--sea-edge', '#b4c8c6')); }
    paintTown();
    shadowsDirty = true;
  }

  // colour of a suburb on a tab, the same CSS variable the flat map fills it with
  function colourOf(slug, k) {
    var m = (' ' + cls[slug] + ' ').match(new RegExp(' ' + k + '([0-5x]) '));
    if (!m || m[1] === 'x') return col('--none', '#ebe3d3');
    return col('--' + (k === 'm' ? 'p' : (k === 'a' || k === 'r' ? 'f' : k)) + m[1], '#cccccc');   // v3.31: the people modes share the violet ramp
  }
  // height of a suburb on a tab; no figure (the flat map's hatched 'x' class) is the low slab
  function heightOf(slug, k) {
    var m = (' ' + cls[slug] + ' ').match(new RegExp(' ' + k + '([0-5x]) ')), d = data[slug], f = HEIGHT[k] || HEIGHT.p;
    var h = d && m && m[1] !== 'x' ? f(d) : null;
    return h == null || !isFinite(h) ? FLAT : h;
  }
  function putHeights(hs) {
    var a = hAttr.array, b = lhAttr.array;
    for (var i = 0; i < hs.length; i++) {
      var r = ranges[i], l = lranges[i], h = hs[i];
      for (var v = r[0]; v < r[0] + r[1]; v++) a[v] = h;
      for (v = l[0]; v < l[0] + l[1]; v++) b[v] = h;
      heights[i] = h;
    }
    if (townId >= 0) U.uBase.value = heights[townId];   // the CBD's buildings ride its roof from tab to tab
    hAttr.needsUpdate = lhAttr.needsUpdate = true;
    shadowsDirty = true;
  }
  var colourTween = null, heightTween = null;
  function setMetric(k, instant) {
    // v3.42: on council rates every council is one plate — no suburb outlines across it, and no one suburb lifts out of it
    lines.visible = k !== 'k';
    U.uLift.value = k === 'k' ? 0 : LIFT;
    var h0 = heights.slice(), h1 = slugs.map(function (s) { return heightOf(s, k); });
    if (heightTween) heightTween.dead = true;
    if (instant || reduce) putHeights(h1);
    else heightTween = tween(650, function (e) { putHeights(h0.map(function (h, i) { return h + (h1[i] - h) * e; })); });
    var arr = colAttr.array, from = new Float32Array(arr), to = new Float32Array(arr.length);
    var none = noneAttr.array;
    slugs.forEach(function (s, i) {
      var c = colourOf(s, k), r = ranges[i], m = (' ' + cls[s] + ' ').match(new RegExp(' ' + k + '([0-5x]) ')), x = m && m[1] === 'x' ? 1 : 0;
      for (var v = r[0]; v < r[0] + r[1]; v++) { to[v * 3] = c.r; to[v * 3 + 1] = c.g; to[v * 3 + 2] = c.b; none[v] = x * tops[v]; }
    });
    noneAttr.needsUpdate = true;
    if (colourTween) colourTween.dead = true;
    if (instant || reduce) { arr.set(to); colAttr.needsUpdate = true; invalidate(); return; }
    colourTween = tween(300, function (e) {
      for (var j = 0; j < arr.length; j++) arr[j] = from[j] + (to[j] - from[j]) * e;
      colAttr.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- camera
  function place() {     // the canvas sits exactly over the SVG
    var w = Math.max(1, svg.clientWidth), h = Math.max(1, svg.clientHeight);
    canvas.style.left = svg.offsetLeft + 'px';
    canvas.style.top = svg.offsetTop + 'px';
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // the view that shows exactly what the SVG shows (straight down, same box, same "meet" fit)
  function flatView() {
    var vb = svg.viewBox.baseVal, w = Math.max(1, svg.clientWidth), h = Math.max(1, svg.clientHeight);
    var s = Math.min(w / vb.width, h / vb.height), visW = w / s, visH = h / s;
    var al = svg.preserveAspectRatio && svg.preserveAspectRatio.baseVal ? svg.preserveAspectRatio.baseVal.align : 6;   // 6 = xMidYMid
    var ax = (al === 2 || al === 5 || al === 8) ? 0 : (al === 4 || al === 7 || al === 10) ? 1 : 0.5;
    var ay = (al >= 2 && al <= 4) ? 0 : (al >= 8) ? 1 : 0.5;
    return { tx: vb.x + ax * vb.width + (0.5 - ax) * visW, tz: vb.y + ay * vb.height + (0.5 - ay) * visH, R: (visH / 2) / Math.tan(FOV * Math.PI / 360), phi: 0.001, theta: 0 };
  }
  // v3.34.1: the finished view fits every suburb (each one's box, floor and roof) inside the canvas, whatever its
  // shape, instead of a fixed distance from the CBD that cut Noarlunga and the south off on a wide screen.
  function endView() { return fitView(END.phi, END.theta, END.margin); }
  function fitView(phi, theta, margin) {
    var saved = view, p = new THREE.Vector3();
    var v = { tx: (bounds[0] + bounds[2]) / 2, tz: (bounds[1] + bounds[3]) / 2, R: flatView().R, phi: phi, theta: theta };
    var rx = Math.cos(theta), rz = -Math.sin(theta), ux = -Math.sin(theta), uz = -Math.cos(theta);   // screen right / up, on the ground
    for (var it = 0; it < 16; it++) {
      view = v; applyView(); camera.updateMatrixWorld();   // project() reads matrixWorldInverse, which only render() refreshes
      var a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (var i = 0; i < boxes.length; i++) {
        var bx = boxes[i], h = heights[i];
        if (!isFinite(bx[0])) continue;
        for (var k = 0; k < 8; k++) {
          p.set(k & 1 ? bx[2] : bx[0], k & 4 ? h : 0, k & 2 ? bx[3] : bx[1]).project(camera);
          if (p.x < a) a = p.x; if (p.x > b) b = p.x; if (p.y < c) c = p.y; if (p.y > d) d = p.y;
        }
      }
      var hh = v.R * Math.tan(FOV * Math.PI / 360), hw = hh * camera.aspect, cx = (a + b) / 2, cy = (c + d) / 2 / Math.cos(phi);
      v = { tx: v.tx + (rx * cx * hw + ux * cy * hh), tz: v.tz + (rz * cx * hw + uz * cy * hh),
        R: Math.min(Rmax, Math.max(Rmin, v.R * Math.max((b - a) / (2 * margin), (d - c) / (2 * margin)))), phi: phi, theta: theta };
    }
    view = saved; applyView(); camera.updateMatrixWorld();
    return v;
  }
  function applyView() {
    var v = view, sp = Math.sin(v.phi);
    camera.position.set(v.tx + v.R * sp * Math.sin(v.theta), v.R * Math.cos(v.phi), v.tz + v.R * sp * Math.cos(v.theta));
    camera.up.set(-Math.sin(v.theta), 0, -Math.cos(v.theta));
    camera.lookAt(v.tx, 0, v.tz);
    camera.near = Math.max(2, v.R / 60);
    camera.far = v.R * 8 + 6000;
    camera.updateProjectionMatrix();
    var f = scene.fog;
    if (U.uLit.value < 0.01) { f.near = 1e6; f.far = 2e6; }
    else { var k = U.uLit.value; f.near = v.R * (0.75 + (1 - k) * 20); f.far = v.R * (2.1 + (1 - k) * 40); }
  }
  var lerpView = function (a, b, e) {
    var dt = b.theta - a.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));      // the short way round
    return { tx: a.tx + (b.tx - a.tx) * e, tz: a.tz + (b.tz - a.tz) * e, R: a.R * Math.pow(b.R / a.R, e), phi: a.phi + (b.phi - a.phi) * e, theta: a.theta + dt * e };
  };
  function flyView(to, ms, done) {
    var from = { tx: view.tx, tz: view.tz, R: view.R, phi: view.phi, theta: view.theta };
    return tween(reduce ? 0 : ms, function (e) { view = lerpView(from, to, e); }, done);
  }
  function clampView() {
    view.R = Math.min(Rmax, Math.max(Rmin, view.R));
    view.phi = Math.min(1.25, Math.max(0.001, view.phi));
    view.tx = Math.min(bounds[2] + 100, Math.max(bounds[0] - 100, view.tx));
    view.tz = Math.min(bounds[3] + 100, Math.max(bounds[1] - 100, view.tz));
  }

  // ---------------------------------------------------------------- render on demand
  var tweens = [], raf = 0, shadowsDirty = true, frames = [];
  function tween(ms, step, done) {
    var t = { t0: null, ms: ms, step: step, done: done, dead: false };
    if (!ms) { step(1); if (done) done(); invalidate(); return t; }
    tweens.push(t); invalidate(); return t;
  }
  var ease = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  function invalidate() { if (!raf && open) raf = requestAnimationFrame(frame); }
  var last = 0;
  function frame(ts) {
    raf = 0;
    if (last && tweens.length) { frames.push(ts - last); if (frames.length === 12 && !lowQ && frames.reduce(function (a, b) { return a + b; }) / 12 > 45) { lowQ = true; renderer.setPixelRatio(1); place(); } }
    last = tweens.length ? ts : 0;
    var live = [];
    tweens.forEach(function (t) {
      if (t.dead) return;
      if (t.t0 === null) t.t0 = ts;
      var k = Math.min(1, (ts - t.t0) / t.ms);
      t.step(ease(k));
      if (k < 1) live.push(t); else if (t.done) t.done();
    });
    tweens = live.concat(tweens.filter(function (t) { return t.t0 === null && !t.dead; }));
    render(!lowQ || !tweens.length);
    if (tweens.length) raf = requestAnimationFrame(frame);
  }
  // v3.43: zoomed in, the sun's shadow box closes in on what's in view (a little ahead of the target, where the
  // tilted view sees most ground), so the CBD's buildings get shadows their own size. It moves in steps, so a drag
  // or a zoom redraws the shadows now and then, not every frame; zoomed out it is the whole-city box, as before.
  var wholeSun = null, sunKey = '';
  function fitSun() {
    if (!wholeSun) return;
    var half = wholeSun.half, cx = wholeSun.cx, cz = wholeSun.cz;
    var near = Math.pow(1.25, Math.ceil(Math.log(Math.max(60, view.R * 1.2)) / Math.log(1.25)));
    if (near < half) {
      var ahead = 0.4 * view.R * Math.sin(view.phi), snap = near / 12;
      half = near;
      cx = Math.round((view.tx - ahead * Math.sin(view.theta)) / snap) * snap;
      cz = Math.round((view.tz - ahead * Math.cos(view.theta)) / snap) * snap;
    }
    var key = half + ',' + cx + ',' + cz;
    if (key === sunKey) return;
    sunKey = key;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + SUN.x * 3000, SUN.y * 3000, cz + SUN.z * 3000);
    var sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.updateProjectionMatrix();
    shadowsDirty = true;
  }
  function render(withShadows) {
    clampView(); applyView(); fitSun();
    if (withShadows && shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
    renderer.render(scene, camera);
    placeLabels();
  }
  var _v = new THREE.Vector3();
  function placeLabels() {
    var w = canvas.clientWidth, h = canvas.clientHeight, k = U.uLit.value;
    labels.forEach(function (l) {
      var y = l.id >= 0 ? heights[l.id] * U.uT.value + 4 + (l.id === townId ? townTop * townK() : 0) : 0;   // "City" clears the towers
      _v.set(l.x, y, l.z).project(camera);
      var x = (_v.x + 1) / 2 * w, yy = (1 - _v.y) / 2 * h;
      var show = k > 0.05 && _v.z < 1 && x > 40 && x < w - 40 && yy > 16 && yy < h - 16;
      l.el.hidden = !show;
      if (!show) return;
      l.el.style.left = (canvas.offsetLeft + x) + 'px';
      l.el.style.top = (canvas.offsetTop + yy) + 'px';
      l.el.style.opacity = String(Math.min(1, k * 1.4));
    });
  }
  var riseTo = function (v) { U.uT.value = v; shadowsDirty = true; };
  var shadeK = 0.2;
  var light = function (v) { U.uLit.value = v; if (shadeMat) shadeMat.opacity = shadeK * v; };

  // ---------------------------------------------------------------- picking: one pixel of the id pass
  var px = new Uint8Array(4);
  function pickAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var x = clientX - r.left, y = clientY - r.top;
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) return -1;
    clampView(); applyView();
    camera.setViewOffset(r.width, r.height, Math.floor(x), Math.floor(y), 1, 1);
    var clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(pickTarget);
    renderer.render(pickScene, camera);
    renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, px);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    camera.clearViewOffset();
    var id = px[0] + px[1] * 256 - 1;
    return id >= 0 && id < slugs.length ? id : -1;
  }
  function roofOnScreen(id) {     // where a suburb's roof is on screen, for the tooltip
    var d = data[slugs[id]]; if (!d || !d.c) return null;
    var v = new THREE.Vector3(d.c[0], heights[id] * U.uT.value + (U.uFocus.value === id ? LIFT : 0) + (id === townId ? townTop * townK() : 0), d.c[1]).project(camera);
    var r = canvas.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }
  function hoverId(id) { if (U.uHover.value !== id) { U.uHover.value = id; shadowsDirty = true; invalidate(); } canvas.classList.toggle('is-hot', id >= 0); }
  function focusId(id) { if (U.uFocus.value !== id) { U.uFocus.value = id; shadowsDirty = true; invalidate(); } }

  // ---------------------------------------------------------------- input: drag turns it, pinch / ctrl+wheel zooms,
  // a click opens a suburb (a tap shows it first, a second tap opens it). Vertical swipes still scroll the page.
  function groundAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var ndc = new THREE.Vector3((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
    ndc.unproject(camera);
    var dir = ndc.sub(camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return null;
    var t = -camera.position.y / dir.y;
    return t > 0 ? camera.position.clone().add(dir.multiplyScalar(t)) : null;
  }
  function zoomAt(f, clientX, clientY) {
    var p = groundAt(clientX, clientY);
    var R = Math.min(Rmax, Math.max(Rmin, view.R * f)), k = 1 - R / view.R;
    if (p) { view.tx += (p.x - view.tx) * k; view.tz += (p.z - view.tz) * k; }
    view.R = R;
    A.hideTip(); invalidate();
  }
  var hintTimer = 0, hints = 0;
  function say(msg) {
    if (hints > 3) return;
    hints++; hint.textContent = msg; hint.classList.add('is-on');
    clearTimeout(hintTimer); hintTimer = setTimeout(function () { hint.classList.remove('is-on'); }, 1600);
  }
  function busy() { return tweens.some(function (t) { return t.camera; }) || rising; }
  function bindInput() {
    var pts = {}, drag = null, pinch = null, pending = 0, lastMove = null;
    canvas.addEventListener('pointerdown', function (ev) {
      pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 1) drag = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: 0, type: ev.pointerType, view: { theta: view.theta, phi: view.phi } };
      else if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), R: view.R }; drag = null;
      }
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ }
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (pts[ev.pointerId]) pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (pinch) {
        var ids = Object.keys(pts); if (ids.length < 2) return;
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((pinch.R * pinch.d / Math.max(20, d)) / view.R, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (drag && pts[ev.pointerId]) {
        var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        if (drag.moved > 4 && !busy()) {
          canvas.classList.add('is-drag'); A.hideTip(); hoverId(-1);
          view.theta = drag.view.theta - dx * 0.006;
          if (drag.type === 'mouse') view.phi = drag.view.phi - dy * 0.004;
          invalidate();
        }
        return;
      }
      if (ev.pointerType !== 'mouse' || busy()) return;
      lastMove = ev;
      if (!pending) pending = requestAnimationFrame(function () {
        pending = 0;
        var e = lastMove, id = pickAt(e.clientX, e.clientY);
        hoverId(id);
        if (id >= 0) A.showSlug(slugs[id], e.clientX, e.clientY); else A.hideTip();
      });
    });
    var up = function (ev) {
      var wasTap = drag && drag.moved < 8 && performance.now() - drag.t < 500 && ev.type === 'pointerup';
      var type = drag && drag.type;
      delete pts[ev.pointerId];
      if (Object.keys(pts).length < 2) pinch = null;
      canvas.classList.remove('is-drag');
      drag = null;
      if (!wasTap || busy()) return;
      var id = pickAt(ev.clientX, ev.clientY);
      if (id < 0) { focusId(-1); A.hideTip(); return; }
      if (type === 'mouse' || U.uFocus.value === id) { location.href = '/adelaide/' + slugs[id]; return; }
      focusId(id);
      var at = roofOnScreen(id);
      if (at) A.showSlug(slugs[id], at[0], at[1]);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') { hoverId(-1); A.hideTip(); } });
    canvas.addEventListener('wheel', function (ev) {
      if (!(ev.ctrlKey || ev.metaKey)) { say('Hold Ctrl and scroll to zoom'); return; }   // plain wheel scrolls the page
      ev.preventDefault();
      zoomAt(Math.exp(ev.deltaY * 0.002), ev.clientX, ev.clientY);
    }, { passive: false });
  }

  // ---------------------------------------------------------------- open, close
  var rising = false, goTimer = 0, btn = document.querySelector('[data-3d]');
  function doOpen(opts) {         // opts.settled (v3.34.2): a returning visitor's automatic 3D skips the rise
    var settled = !!(opts && opts.settled);
    if (open || broken || waiting) return;
    if (!built) {                                  // first time: wait (briefly) for the wide sea, then build
      waiting = true;
      Promise.race([seaWide, new Promise(function (r) { setTimeout(function () { r(null); }, 2500); })]).then(function (d) {
        seaD = d; waiting = false;
        try { build(); } catch (e) { broken = true; finishClose(); return; }
        doOpen(opts);
      });
      return;
    }
    var from = null;
    open = true;
    place();
    view = flatView(); from = view;
    A.unzoom();                                  // the SVG goes back to the whole map under the canvas
    riseTo(0); light(0); focusId(-1); hoverId(-1);
    setMetric(A.metric(), true);
    applyView();
    renderer.compile(scene, camera);
    render(true);
    canvas.classList.add('is-on');
    mapEl.classList.add('is-3d');
    svg.setAttribute('inert', ''); svg.inert = true;
    if (btn) btn.setAttribute('aria-pressed', 'true');
    A.hideTip();
    rising = true;
    var to = endView();
    var go = function () {
      frames = [];
      goTimer = 0;
      var t = tween(reduce || settled ? 0 : 1900, function (e) {
        view = lerpView(from, to, e);
        riseTo(Math.min(1, e * 1.08));
        light(Math.min(1, e * 1.7));
      }, function () { rising = false; riseTo(1); light(1); resetBtn.hidden = false; if (credit) credit.hidden = false; invalidate(); });
      t.camera = true;
    };
    if (reduce || settled) go(); else goTimer = setTimeout(go, 220);
  }
  function doClose() {
    if (!open) return;
    A.hideTip(); hoverId(-1); focusId(-1);
    resetBtn.hidden = true;
    if (credit) credit.hidden = true;
    rising = true;
    var to = flatView(), uT0 = U.uT.value, lit0 = U.uLit.value;
    tweens.forEach(function (t) { t.dead = true; });
    var t = flyView(to, 1100, function () {
      rising = false;
      canvas.classList.remove('is-on');
      setTimeout(finishClose, reduce ? 0 : 200);
    });
    var step = t.step;
    t.step = function (e) { step(e); riseTo(uT0 * (1 - e)); light(lit0 * Math.max(0, 1 - e * 1.6)); };
    if (reduce) { riseTo(0); light(0); }
    t.camera = true;
  }
  function finishClose() {
    open = false;
    if (canvas) canvas.classList.remove('is-on');
    labels.forEach(function (l) { l.el.hidden = true; });
    mapEl.classList.remove('is-3d');
    svg.removeAttribute('inert'); svg.inert = false;
    if (resetBtn) resetBtn.hidden = true;
    if (credit) credit.hidden = true;
    if (btn) { btn.setAttribute('aria-pressed', 'false'); if (broken) btn.hidden = true; }
  }
  function focusSlug(slug) {
    var id = index[slug];
    if (id === undefined || !open || rising) return;
    A.hideTip();                                   // the last suburb's tooltip doesn't ride along to the new one
    focusId(id);
    var d = data[slug];
    if (!d || !d.c) return;
    var to = { tx: d.c[0], tz: d.c[1], R: Math.min(view.R, 900), phi: Math.max(view.phi, 0.75), theta: view.theta };
    if (id === townId) {           // v3.43: the city comes in close and steep, over its neighbours' roofs, aimed at its own
      var off = (heights[id] + townTop / 2) * Math.tan(0.6);
      to = { tx: d.c[0] - off * Math.sin(view.theta), tz: d.c[1] - off * Math.cos(view.theta), R: CBD_R, phi: 0.6, theta: view.theta };
    }
    var t = flyView(to, 900, function () {
      var at = roofOnScreen(id);
      if (at) A.showSlug(slug, at[0], at[1]);
    });
    t.camera = true;
  }

  window.AtlasMap3D = {
    ready: true,
    open: doOpen,
    close: doClose,
    isOpen: function () { return open; },
    setMetric: function (k) { if (built) setMetric(k); },
    focus: focusSlug,
    // for tests/map3d_browser.py: freeze the rise at a point, and read where things are
    _test: {
      height: function (slug) { return heights[index[slug]]; },
      seek: function (k) { clearTimeout(goTimer); tweens.forEach(function (t) { t.dead = true; }); tweens = []; rising = k < 1; view = lerpView(flatView(), endView(), k); riseTo(Math.min(1, k * 1.08)); light(Math.min(1, k * 1.7)); render(true); },
      look: function (v) { for (var k in v) view[k] = v[k]; render(true); return view; },
      roof: function (slug) { applyView(); return roofOnScreen(index[slug]); },
      pick: function (x, y) { var id = pickAt(x, y); return id < 0 ? null : slugs[id]; },
      state: function () { return { open: open, rising: rising, lowQ: lowQ, uT: U.uT.value, uLit: U.uLit.value, suburbs: slugs.length, view: view }; },
      town: function () { return town ? { buildings: townCount, top: townTop, up: townK(), base: U.uBase.value } : null; }
    }
  };
})();
