// Headless check of the new shell types and finales: screenshots, page errors, particle counts.
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const only = process.argv[3] || '';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const types = [['冠菊', 'kamuro', 2200], ['椰子', 'palm', 2100], ['雙芯', 'pistil', 1900], ['瀑布', 'niagara', 2300], ['地面火花', 'ground', 2000], ['速射連發', 'starmine', 2300]];
const finales = [['長岡巨型', 'nagaoka', [2300, 5100]], ['鳳凰亂舞', 'phoenix', [1100, 7100]]];
const out = [];
for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
  if (only && only !== tag) continue;
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base + '?debug&q=' + (process.env.Q ?? '1'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const clear = () => page.evaluate(() => { const f = window.__fw; f.n = 0; f.rockets.length = 0; f.timed.length = 0; f.emitters.length = 0; f.puffs.length = 0; f.tint.i = 0; });
  const sample = async (ms) => { let peak = 0; const t = Date.now(); while (Date.now() - t < ms) { peak = Math.max(peak, await page.evaluate(() => window.__fw.n)); await page.waitForTimeout(100); } return peak; };
  for (const [label, id, wait] of types) {
    await clear();
    await page.locator('.chip', { hasText: label }).first().tap();
    await page.touchscreen.tap(vw * 0.35, vh * 0.25);
    if (!['niagara', 'ground', 'starmine'].includes(id)) await page.touchscreen.tap(vw * 0.68, vh * 0.2);
    const peak = await sample(wait);
    await page.screenshot({ path: `test/shots/${tag}-${id}.png` });
    out.push({ tag, id, peakParticles: peak, cap: await page.evaluate(() => window.__fw.quality.cap) });
  }
  for (const [label, id, shots] of finales) {
    await clear();
    await page.locator('.pill', { hasText: '終章' }).tap();
    await page.locator('.finmenu .chip', { hasText: label }).tap();
    const t0 = Date.now(); let peak = 0;
    for (let i = 0; i < shots.length; i++) {
      while (Date.now() - t0 < shots[i]) { peak = Math.max(peak, await page.evaluate(() => window.__fw.n)); await page.waitForTimeout(100); }
      await page.screenshot({ path: `test/shots/${tag}-finale-${id}-${i + 1}.png` });
    }
    out.push({ tag, id: 'finale-' + id, peakParticles: peak, q: await page.evaluate(() => window.__fw.qLevel) });
    await page.waitForTimeout(2500);
  }
  out.push({ tag, errors: errs });
  await ctx.close();
}
console.log(JSON.stringify(out));
await browser.close();
