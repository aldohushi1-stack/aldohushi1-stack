#!/usr/bin/env node
// Turn a saved aldo.today suburb miniature page into the ad cut:
//   node ads/miniature-ad/build.mjs <saved-miniature.html> <out.html>
// Save the page first, e.g. curl -sSL -o tennyson.html https://aldo.today/adelaide/tennyson/miniature
//
// What it changes, and nothing else:
//  - head lines the artifact host supplies itself (doctype, charset, viewport, og tags) are dropped
//  - self-hosted fonts and three.js r128 point at Google Fonts and the public CDNs
//  - site-relative links point at https://aldo.today, and the view beacon is switched off
//  - the engine gets one camera mode ('ad') and a small hook, window.__baitAd
//  - ad-layer.html is appended
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , input, output] = process.argv;
if (!input || !output) { console.error('usage: build.mjs <saved-miniature.html> <out.html>'); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://aldo.today';
let html = readFileSync(input, 'utf8');

function patch(name, from, to) {
  const n = typeof from === 'string' ? html.split(from).length - 1 : (html.match(from) || []).length;
  if (n === 0) throw new Error(`patch "${name}" found nothing: the page has changed, update build.mjs`);
  html = typeof from === 'string' ? html.split(from).join(to) : html.replace(from, to);
}

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

html = html.trimEnd() + '\n' + readFileSync(join(here, 'ad-layer.html'), 'utf8');
writeFileSync(output, html);
console.log(`wrote ${output} (${(html.length / 1024).toFixed(0)} KB)`);
