import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://127.0.0.1:4173/?debug', { waitUntil: 'networkidle' });
const chip = (t) => page.locator('.chip', { hasText: t }).first().tap();
// text shell on crimson
await page.locator('.theme').nth(2).tap();
await chip('文字'); await page.waitForTimeout(200);
await page.touchscreen.tap(195, 220); await page.waitForTimeout(2300);
await page.screenshot({ path: 'shot-text.png' });
// mirror + cyan fan
await page.locator('.theme').nth(1).tap(); await page.locator('.icon').nth(1).tap();
await chip('光扇'); await page.touchscreen.tap(120, 300);
await chip('千輪'); await page.touchscreen.tap(90, 200); await page.touchscreen.tap(150, 150);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shot-mirror-fan.png' });
// amethyst finale
await page.locator('.icon').nth(1).tap(); await page.locator('.theme').nth(3).tap();
await page.locator('.pill', { hasText: '終章' }).tap(); await page.waitForTimeout(4500);
await page.screenshot({ path: 'shot-finale.png' });
const mime = await page.evaluate(() => ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].filter((t) => MediaRecorder.isTypeSupported(t)));
console.log('stats', await page.locator('.stats').textContent(), 'mime', mime, 'errors', JSON.stringify(errs));
await browser.close();
