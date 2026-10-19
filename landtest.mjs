import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const tag = process.argv[3] || 'local';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const out = [];
// 1) physical landscape
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base + '?debug', { waitUntil: 'networkidle' });
  for (const [x, y] of [[420, 120], [200, 150], [650, 110]]) { await page.touchscreen.tap(x, y); await page.waitForTimeout(250); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `land-${tag}-physical.png` });
  out.push(['physical', await page.evaluate(() => ({ cls: document.querySelector('.app').className, W: __fw.W, H: __fw.H, waterY: Math.round(__fw.waterY) })), errs]);
  await ctx.close();
}
// 2) portrait + 橫屏 button -> fullscreen/lock or CSS rotate fallback; tap mapping check
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base + '?debug', { waitUntil: 'networkidle' });
  await page.locator('.pill', { hasText: '橫屏' }).tap(); await page.waitForTimeout(800);
  let info = await page.evaluate(() => ({ cls: document.querySelector('.app').className, W: __fw.W, H: __fw.H, rotated: __fw.rotated, fs: !!document.fullscreenElement }));
  if (!info.rotated) {
    // force the iOS fallback path to test touch mapping
    await page.evaluate(() => { document.exitFullscreen?.().catch(() => {}); });
  }
  // tap at screen point: rotated local = (sy, sw - sx). Tap screen (300, 420) -> local (420, 90)
  await page.evaluate(() => { __fw.n = 0; __fw.rockets.length = 0; __fw.timed.length = 0; });
  await page.touchscreen.tap(300, 420);
  const target = await page.evaluate(() => __fw.rockets.map((r) => [Math.round(r.tx), Math.round(r.ty)]));
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `land-${tag}-rotated.png` });
  out.push(['button', info, 'rocket target for screen tap (300,420):', target, errs]);
  await ctx.close();
}
console.log(JSON.stringify(out));
await browser.close();
