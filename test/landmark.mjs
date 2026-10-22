// 地標場景 (台北 101 / Space Needle): calm + 大樓秀 mid-show + crown shots, portrait / landscape
// -> test/shots/landmark-<scene>-<orient>-<moment>.png ; also checks tap-from-building and errors
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const only = process.env.SCENES ? process.env.SCENES.split(',') : ['tw101', 'needle'];
const orients = process.env.ORIENTS ? process.env.ORIENTS.split(',') : ['portrait', 'landscape'];
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const out = [];
for (const scene of only) for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']].filter((o) => orients.includes(o[2]))) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((s) => { try { localStorage.setItem('fw.sceneChoice', s); } catch {} }, scene);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base + '?q=1&debug', { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `test/shots/landmark-${scene}-${tag}-calm.png` });
  // tap beside the facade (spray from the building) and above it (shell from the spire)
  const em = await page.evaluate(() => { const l = window.__fw.lm; return { cx: l.cx, topY: l.topY, n: l.emitters.length, tiers: l.tiers }; });
  await page.touchscreen.tap(em.cx + 60, vh * 0.6);
  await page.touchscreen.tap(em.cx - 40, em.topY - 80);
  await page.waitForTimeout(250);
  const tapState = await page.evaluate(() => ({ n: window.__fw.n, rockets: window.__fw.rockets.length, em: window.__fw.emitters.length }));
  await page.waitForTimeout(3500);
  // 大樓秀 from the 終章 menu
  await page.locator('.pill.gold').tap();
  const labels = await page.locator('.finmenu .chip').allTextContents();
  await page.locator('.finmenu .chip', { hasText: '大樓秀' }).tap();
  let peak = 0;
  const t0 = Date.now();
  const shots = tag === 'portrait' ? [[5.5, 'show-sweep'], [12.3, 'show-sides'], [33.9, 'show-crown'], [37.5, 'show-cascade']] : [[5.5, 'show-sweep'], [26.8, 'show-ablaze'], [34.0, 'show-crown']];
  for (const [sec, name] of shots) {
    while ((Date.now() - t0) / 1000 < sec) { peak = Math.max(peak, await page.evaluate(() => window.__fw.n)); await page.waitForTimeout(120); }
    await page.screenshot({ path: `test/shots/landmark-${scene}-${tag}-${name}.png` });
  }
  const cap = await page.evaluate(() => window.__fw.quality.cap);
  out.push({ scene, tag, emitters: em.n, tiers: em.tiers, tapState, menu: labels.join('/'), peak, cap, errs });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1)); await browser.close();
