// 三段連環: screenshot mid tier-3, peak particle counts at q=1 (phone default) and q=3 (tight budget)
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const out = [];
for (const [vw, vh, tag, q] of [[390, 844, 'portrait', 1], [844, 390, 'landscape', 1], [390, 844, 'portrait-q3', 3]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base + `?q=${q}&debug`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { const f = window.__fw; f.n = 0; f.rockets.length = 0; f.timed.length = 0; f.emitters.length = 0;
    window.__bursts = []; const ob = f.onBurst; f.onBurst = (t, x, y) => { window.__bursts.push([t, performance.now()]); ob?.(t, x, y); }; });
  await page.locator('.chip', { hasText: '三段連環' }).first().tap();
  await page.touchscreen.tap(vw * 0.35, vh * 0.25);
  await page.touchscreen.tap(vw * 0.68, vh * 0.3);
  // wait for the first cascade burst
  await page.waitForFunction(() => window.__bursts.some((b) => b[0] === 'cascade'), null, { timeout: 5000 });
  const t0 = Date.now(); let peak = 0, shot = false;
  while (Date.now() - t0 < 2600) {
    peak = Math.max(peak, await page.evaluate(() => window.__fw.n));
    if (!shot && Date.now() - t0 > 1150) { await page.screenshot({ path: `test/shots/cascade-${tag}.png` }); shot = true; }
    await page.waitForTimeout(60);
  }
  out.push({ tag, q, peakParticles: peak, cap: await page.evaluate(() => window.__fw.quality.cap), errs });
  await ctx.close();
}
console.log(JSON.stringify(out)); await browser.close();
