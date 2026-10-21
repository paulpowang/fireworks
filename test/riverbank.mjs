// 河岸草地 screenshots (calm + bright burst) portrait/landscape -> test/shots/riverbank-*.png
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const out = [];
for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('fw.sceneChoice', 'field'); } catch {} });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base + '?q=1&debug', { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000); // let the intro demo fade so "calm" is calm
  await page.screenshot({ path: `test/shots/riverbank-${tag}-calm.png` });
  for (const [theme, n] of [[0, 'pink'], [1, 'teal']]) {
    await page.locator('.theme').nth(theme).tap();
    await page.locator('.chip', { hasText: '牡丹' }).first().tap();
    await page.touchscreen.tap(vw * 0.3, vh * 0.35);
    await page.touchscreen.tap(vw * 0.72, vh * 0.3);
    await page.locator('.chip', { hasText: '菊花' }).first().tap();
    await page.touchscreen.tap(vw * 0.5, vh * 0.45);
    await page.waitForTimeout(1350);
    out.push({ tag, n, litTotal: +(await page.evaluate(() => window.__fw.litTotal)).toFixed(2) });
    await page.screenshot({ path: `test/shots/riverbank-${tag}-burst-${n}.png` });
    await page.waitForTimeout(3000);
  }
  out.push({ tag, scene: await page.evaluate(() => window.__fw.scene), errs });
  await ctx.close();
}
console.log(JSON.stringify(out)); await browser.close();
