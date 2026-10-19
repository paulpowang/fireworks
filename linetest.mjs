// Renders scenes at several DPR/viewports, saves crops and reports the strongest horizontal edge in the sky.
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const url = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const tag = process.argv[3] || 'x';
const cfgs = [[390, 844, 2], [393, 852, 3], [430, 932, 3], [390, 844, 1.6], [844, 390, 3], [932, 430, 3]];
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
for (const [w, h, d] of cfgs) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  for (const [x, y] of [[195, 250], [100, 300], [300, 280]]) { await page.touchscreen.tap(x, y); await page.waitForTimeout(150); }
  // toolbar resize simulation
  await page.setViewportSize({ width: w, height: h - 60 }); await page.waitForTimeout(200);
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1300);
  // hide UI for analysis
  await page.addStyleTag({ content: '.top,.bottom,.hint,.toast{display:none!important}' });
  const res = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const H = c.height, W = c.width;
    const img = g.getImageData(0, 0, W, H).data;
    const rows = [];
    for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; s += img[i] + img[i + 1] + img[i + 2]; } rows.push(s / (W / 2)); }
    // edge = jump vs smooth neighbourhood
    let best = 0, by = 0;
    const lim = Math.floor(H * (W > H ? 0.58 : 0.5)); // sky area only (above land)
    for (let y = 3; y < lim - 3; y++) {
      const e = Math.abs(rows[y] - rows[y - 1]) - (Math.abs(rows[y - 1] - rows[y - 2]) + Math.abs(rows[y + 1] - rows[y])) / 2;
      if (e > best) { best = e; by = y; }
    }
    return { best: +best.toFixed(2), y: by, cssY: +(by / devicePixelRatio).toFixed(1), H };
  });
  const clipY = Math.max(0, res.cssY - 40);
  await page.screenshot({ path: `line-${tag}-${w}x${h}@${d}.png`, clip: { x: 0, y: clipY, width: w, height: 80 } });
  console.log(`${w}x${h}@${d}`, JSON.stringify(res), errs.length ? errs : '');
  await ctx.close();
}
await browser.close();
