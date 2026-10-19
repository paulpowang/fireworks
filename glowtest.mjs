// Freeze the engine, inject burst lights (no particles) and measure the sky for hard horizontal edges.
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const url = process.argv[2] || 'http://127.0.0.1:4173/fireworks/?debug';
const cfgs = [[390, 844, 2], [393, 852, 3], [430, 932, 3], [390, 844, 1.6], [844, 390, 3], [932, 430, 3]];
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
for (const [w, h, d] of cfgs) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  // toolbar collapse/expand
  await page.setViewportSize({ width: w, height: h - 70 }); await page.waitForTimeout(150);
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300);
  await page.addStyleTag({ content: '.top,.bottom,.hint,.toast,.stats{display:none!important}' });
  const res = await page.evaluate(() => {
    const fw = window.__fw; fw.stop();
    fw.n = 0; fw.rockets.length = 0; fw.puffs.length = 0; fw.timed.length = 0;
    fw.lights = [{ x: fw.W * 0.5, y: fw.H * 0.3, color: '#ff4fa3', i: 1 }, { x: fw.W * 0.2, y: fw.H * 0.25, color: '#e040fb', i: 1 }];
    fw.stars = [];
    fw.render();
    const c = fw.canvas, g = c.getContext('2d'), W = c.width, H = c.height;
    const img = g.getImageData(0, 0, W, H).data;
    const lim = Math.floor((fw.landTop - 30 * fw.U) * fw.dpr);
    const rows = [];
    for (let y = 0; y < lim; y++) { let s = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s += img[i] + img[i + 1] + img[i + 2]; } rows.push(s / W); }
    let best = 0, by = 0;
    for (let y = 1; y < lim; y++) { const e = Math.abs(rows[y] - rows[y - 1]); if (e > best) { best = e; by = y; } }
    return { maxRowJump: +best.toFixed(3), atCssY: +(by / fw.dpr).toFixed(1), canvas: [W, H], css: [fw.W, fw.H], dpr: fw.dpr, skyH: fw.sky.height };
  });
  await page.screenshot({ path: `glow-${process.argv[3] || 'after'}-${w}x${h}@${d}.png` });
  console.log(`${w}x${h}@${d}`, JSON.stringify(res), errs.join(' '));
  await ctx.close();
}
await browser.close();
