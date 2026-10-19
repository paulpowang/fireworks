import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
let pw;
try { pw = require('playwright-core'); } catch { pw = require('/home/box/.local/lib/node_modules/playwright-core'); }
const url = process.argv[2] || 'http://127.0.0.1:4173/?debug';
const out = process.argv[3] || '/workspace/fireworks-app/preview.png';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  extraHTTPHeaders: { 'bypass-tunnel-reminder': '1' } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const taps = [[195, 200], [110, 280], [290, 250], [200, 330], [80, 170], [320, 160]];
for (const [x, y] of taps) { await page.touchscreen.tap(x, y); await page.waitForTimeout(260); }
// a drag volley
await page.mouse.move(60, 380); await page.mouse.down();
for (let i = 0; i <= 10; i++) { await page.mouse.move(60 + i * 27, 380 - Math.sin(i / 10 * Math.PI) * 120); await page.waitForTimeout(30); }
await page.mouse.up();
await page.waitForTimeout(1500);
const stats = await page.locator('.stats').textContent().catch(() => '');
await page.screenshot({ path: out });
console.log('stats:', stats, 'errors:', JSON.stringify(errs));
await browser.close();
