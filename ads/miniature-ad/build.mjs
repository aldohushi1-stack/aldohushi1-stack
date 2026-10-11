#!/usr/bin/env node
// Turn a saved aldo.today suburb miniature page into the ad cut:
//   node ads/miniature-ad/build.mjs <saved-miniature.html> <out.html>          (artifact cut)
//   node ads/miniature-ad/build.mjs --site <saved-miniature.html> <out.html>   (to host on aldo.today at /adelaide/<suburb>/ad)
// Save the page first, e.g. curl -sSL -o tennyson.html https://aldo.today/adelaide/tennyson/miniature
//
// What it changes, and nothing else (--site keeps the page's own head, fonts, three.js and links,
// and only points the preview tags at the /ad address):
//  - head lines the artifact host supplies itself (doctype, charset, viewport, og tags) are dropped
//  - self-hosted fonts and three.js r128 point at Google Fonts and the public CDNs
//  - site-relative links point at https://aldo.today, and the view beacon is switched off
//  - the engine gets one camera mode ('ad') and a small hook, window.__baitAd
//  - ad-layer.html is appended
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), site = args[0] === '--site';
const [input, output] = site ? args.slice(1) : args;
if (!input || !output) { console.error('usage: build.mjs [--site] <saved-miniature.html> <out.html>'); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://aldo.today';
let html = readFileSync(input, 'utf8');

function patch(name, from, to) {
  const n = typeof from === 'string' ? html.split(from).length - 1 : (html.match(from) || []).length;
  if (n === 0) throw new Error(`patch "${name}" found nothing: the page has changed, update build.mjs`);
  html = typeof from === 'string' ? html.split(from).join(to) : html.replace(from, to);
}

if (site) {
  patch('preview url', /(<meta property="og:url" content="https:\/\/aldo\.today\/adelaide\/[a-z0-9-]+)\/miniature"/, '$1/ad"');
  patch('preview text', /(<meta (?:property="og:description"|name="description") content=")([^"]*?), SA (\d{4}),[^"]*"/g,
    (_, a, name, pc) => `${a}A 30-second flyover of ${name}, SA ${pc}, built from real map data. One board in the suburb, one name on it."`);
} else {
  patch('head', /^<!doctype html>\s*<html[^>]*>\s*(?:<meta[^>]*>\s*)+(<title>[^<]*<\/title>)\s*<meta name="viewport"[^>]*>\s*/i, '$1\n');
  patch('fonts', /<style>@font-face[^<]*<\/style>/,
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&family=Young+Serif&display=swap">');
  patch('three', '"/assets/vendor/three-r128.min.js","/assets/vendor/three-r128-mapcontrols.js"',
    '"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js","https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"');
  patch('static links', /href="\/(?!\/)/g, `href="${SITE}/`);
  patch('runtime links', 'function setLink(a, href){', `function setLink(a, href){ if (/^\\/(?!\\/)/.test(href)) href = '${SITE}' + href;`);
  patch('board tap', "function ask(href){ beacon('ask'); location.assign(href); }",
    `function ask(href){ const a=document.createElement('a'); a.href=/^\\/(?!\\/)/.test(href) ? '${SITE}'+href : href; a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); }`);
}
patch('beacon off', 'if (TEST || !SLOT.beacon) return;', 'return; /* no view beacon from the ad cut */');
patch('ad camera mode', "else if(mode==='test'){ camera.lookAt(controls.target); }",
  "else if(mode==='test'){ camera.lookAt(controls.target); }\n" +
  "  else if(mode==='ad'){ const p=window.__adPose ? window.__adPose(dt) : null; if(p){ camera.position.copy(p.pos); controls.target.copy(p.tgt); } camera.lookAt(controls.target); }");
patch('ad hook', "\nconst hint=$('#hint');",
  "\n/* ad cut hook (ads/miniature-ad/build.mjs) */\n" +
  "window.__baitAd = { plan: PLAN, board: BOARD, box: [X0, X1, Z0, Z1], camera, target: controls.target,\n" +
  "  V: (x, y, z) => new THREE.Vector3(x, y, z), flyPose: t => flyPose(t), boardPose: () => boardPose(), mode: () => mode,\n" +
  "  begin(){ tween.on=false; mode='ad'; }, end(){ if(mode==='ad') startFly(); },\n" +
  "  project(x, y, z){ const v=new THREE.Vector3(x, y, z).project(camera); return [(v.x+1)/2*innerWidth, (1-v.y)/2*innerHeight, v.z]; } };\n" +
  "dispatchEvent(new Event('bait-ready'));\n" +
  "const hint=$('#hint');");

// a gentler tilt-shift for the ad: less blur, a wider sharp band, a softer edge to it
const LENS = { blur: .55, band: .04, fade: 1.25 };
patch('lens blur', /maxBlur:\{value:([\d.]+)\*DPR\}/, (_, v) => `maxBlur:{value:${(+v * LENS.blur).toFixed(2)}*DPR}`);
patch('lens band', /lens\.uniforms\.band\.value = w\/h<\.8 \? ([\d.]+) : ([\d.]+); lens\.uniforms\.fade\.value = w\/h<\.8 \? ([\d.]+) : ([\d.]+);/,
  (_, bp, bl, fp, fl) => `lens.uniforms.band.value = w/h<.8 ? ${(+bp + LENS.band).toFixed(3)} : ${(+bl + LENS.band).toFixed(3)}; ` +
    `lens.uniforms.fade.value = w/h<.8 ? ${(+fp * LENS.fade).toFixed(3)} : ${(+fl * LENS.fade).toFixed(3)};`);

html = html.trimEnd() + '\n' + readFileSync(join(here, 'ad-layer.html'), 'utf8');
// on aldo.today itself the end card's button stays in the same tab
if (site) patch('site cta', 'href="https://aldo.today/advertise" target="_blank" rel="noopener"', 'href="/advertise"');
writeFileSync(output, html);
console.log(`wrote ${output} (${(html.length / 1024).toFixed(0)} KB)`);
