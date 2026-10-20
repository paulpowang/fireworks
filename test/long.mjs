import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto((process.argv[2] || 'http://127.0.0.1:4173/fireworks/') + '?debug', { waitUntil: 'networkidle' });
await page.locator('.pill', { hasText: '配樂' }).tap();
const t0 = Date.now();
await page.locator('.musicbar input[type=file]').setInputFiles('test/long11min.wav');
const seen = new Set(); let shot = false;
while (Date.now() - t0 < 90000) {
  const txt = await page.locator('.musicbar').innerText().catch(() => '');
  const m = txt.match(/分析節拍中 (\d+)%|解碼中/); if (m) seen.add(m[0]);
  if (!shot && m && m[1] && +m[1] > 20) { await page.screenshot({ path: 'test/music-analyzing.png' }); shot = true; }
  if (await page.evaluate(() => !!window.__music)) break;
  await page.waitForTimeout(150);
}
const r = await page.evaluate(() => ({ bpm: window.__music.analysis.bpm, analyzed: window.__music.analysis.analyzed, dur: window.__music.analysis.duration, beats: window.__music.analysis.beats.length, events: window.__music.events.length, lastEvent: window.__music.events.at(-1).t }));
console.log(JSON.stringify({ ms: Date.now() - t0, progressSeen: [...seen].slice(0, 12), info: await page.locator('.musicbar .mhint').last().textContent(), ...r, errs }));
await browser.close();
