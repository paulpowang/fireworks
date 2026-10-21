// 小鎮車站 screenshots: calm, during a bright coloured burst, landscape, plus lit-pixel check.
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const out = [];
for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base + '?q=1&debug', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const sc = await page.evaluate(() => window.__fw.scene);
  await page.screenshot({ path: `test/shots/town-${tag}-calm.png` });
  for (const [theme, n] of [[3, 'purple'], [0, 'pink']]) {
    await page.locator('.theme').nth(theme).tap();
    await page.locator('.chip', { hasText: '牡丹' }).first().tap();
    await page.touchscreen.tap(vw * 0.3, vh * 0.32);
    await page.touchscreen.tap(vw * 0.7, vh * 0.28);
    await page.locator('.chip', { hasText: '菊花' }).first().tap();
    await page.touchscreen.tap(vw * 0.5, vh * 0.4);
    await page.waitForTimeout(1350);
    const lit = await page.evaluate(() => window.__fw.litTotal);
    await page.screenshot({ path: `test/shots/town-${tag}-burst-${n}.png` });
    out.push({ tag, n, litTotal: +lit.toFixed(2) });
    await page.waitForTimeout(3000);
  }
  out.push({ tag, scene: sc, errs });
  await ctx.close();
}
console.log(JSON.stringify(out)); await browser.close();
