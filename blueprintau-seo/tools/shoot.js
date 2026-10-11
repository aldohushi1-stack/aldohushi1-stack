// Serve built pages from OUT; everything else comes from the live site.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'), path = require('path');
const [OUT, SHOTS] = process.argv.slice(2);
const pages = ['', 'about/', 'foreman/', 'takeoff/', 'ledger/', 'roster/', 'glassbox/', 'dating/'];
(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 1366, height: 900, n: 'desk' }, { width: 390, height: 844, n: 'mob' }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    await ctx.route('https://blueprintau.com/**', async route => {
      const u = new URL(route.request().url());
      let p = u.pathname.replace(/^\//, '');
      if (p === '' || p.endsWith('/')) p += 'index.html';
      const f = path.join(OUT, p);
      if (fs.existsSync(f)) return route.fulfill({ path: f, contentType: p.endsWith('.xml') ? 'application/xml' : 'text/html; charset=utf-8' });
      return route.continue();
    });
    for (const p of pages) {
      const pg = await ctx.newPage();
      pg.on('pageerror', e => errors.push(`${p}: ${e.message}`));
      await pg.goto('https://blueprintau.com/' + p, { waitUntil: 'load', timeout: 60000 });
      await pg.waitForTimeout(2500);
      const name = (p.replace(/\//g, '') || 'home') + '-' + vp.n;
      const info = await pg.evaluate(() => ({
        h1: [...document.querySelectorAll('h1')].filter(h => h.offsetParent).map(h => h.innerText.replace(/\s+/g, ' ').slice(0, 90)),
        robots: document.querySelector('meta[name=robots]')?.content || '-',
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        about: (() => { const s = document.querySelector('.seo-about'); if (!s) return null; const r = s.getBoundingClientRect(); return { visible: !!s.offsetParent, top: Math.round(r.top + scrollY), w: Math.round(r.width) }; })(),
        docH: document.documentElement.scrollHeight,
      }));
      console.log(name, JSON.stringify(info));
      await pg.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: p === 'about/' || p === '' });
      const sec = await pg.$('.seo-about');
      if (sec) { await sec.scrollIntoViewIfNeeded(); await sec.screenshot({ path: `${SHOTS}/${name}-section.png` }); }
      await pg.close();
    }
    console.log('JS errors', vp.n, errors);
    await ctx.close();
  }
  await b.close();
})();
