// Headless test: load a synthesized track, check beat detection vs ground truth, play and measure burst timing.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const track = process.argv[3] || 'beat120';
const [vw, vh] = (process.argv[4] || '390x844').split('x').map(Number);
const playSec = +(process.argv[5] || 20);
const truth = JSON.parse(fs.readFileSync(`test/${track}.json`, 'utf8'));
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(base + '?debug', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500); // let the welcome bursts finish (not part of the music show)
const muteLabel = await page.locator('.top .icon').first().getAttribute('aria-label');
await page.locator('.pill', { hasText: '配樂' }).tap();
const t0 = Date.now();
await page.locator('.musicbar input[type=file]').setInputFiles(`test/${track}.wav`);
await page.waitForFunction(() => window.__music, null, { timeout: 60000 });
const analyzeMs = Date.now() - t0;
const an = await page.evaluate(() => { const m = window.__music; return { bpm: m.analysis.bpm, beats: m.analysis.beats, fallback: m.analysis.fallback, events: m.events.map((e) => ({ t: e.t, type: e.type })) }; });
const info = await page.locator('.musicbar .mhint').last().textContent();
// beat detection accuracy
const near = (arr, t) => arr.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), 1e9);
const errsBeat = truth.beats.map((b) => near(an.beats, b) - b);
const absB = errsBeat.map(Math.abs).sort((a, b) => a - b);
const stat = (a) => ({ median: +(a[Math.floor(a.length / 2)] * 1000).toFixed(1), p90: +(a[Math.floor(a.length * 0.9)] * 1000).toFixed(1), max: +(a[a.length - 1] * 1000).toFixed(1) });
// play
await page.locator('.musicbar .mbtn').first().tap();
await page.waitForTimeout(playSec * 1000);
await page.screenshot({ path: `test/music-${track}-${vw}x${vh}.png` });
const res = await page.evaluate(() => ({ bursts: window.__bursts, time: window.__music.player.time, ctxState: window.__music.player.ctx?.state }));
await page.locator('.musicbar .mbtn').first().tap(); // pause
// burst timing: vs scheduled event and vs ground-truth grid (beats + off-beat half-beats)
const evT = an.events.map((e) => e.t);
const grid = [];
const per = 60 / truth.bpm;
for (const b of truth.beats) { grid.push(b); grid.push(b + per / 2); }
const vsSched = res.bursts.map((b) => b.t - near(evT, b.t));
const vsTruth = res.bursts.map((b) => b.t - near(grid, b.t));
const absS = vsSched.map(Math.abs).sort((a, b) => a - b), absT = vsTruth.map(Math.abs).sort((a, b) => a - b);
const mean = (a) => +((a.reduce((s, x) => s + x, 0) / a.length) * 1000).toFixed(1);
console.log(JSON.stringify({
  track, viewport: `${vw}x${vh}`, sfxDefault: muteLabel, analyzeMs, info, detectedBpm: +an.bpm.toFixed(2), trueBpm: truth.bpm, fallback: an.fallback,
  beatDetectionAbsErrMs: stat(absB), beatsWithin50ms: `${absB.filter((x) => x <= 0.05).length}/${absB.length}`,
  showEvents: an.events.length, playedTo: +res.time.toFixed(2), bursts: res.bursts.length,
  burstVsScheduledMs: { meanSigned: mean(vsSched), ...stat(absS) },
  burstVsTrueBeatMs: { meanSigned: mean(vsTruth), ...stat(absT), within50ms: `${absT.filter((x) => x <= 0.05).length}/${absT.length}` },
  errors: errs,
  outliers: res.bursts.map((b, i) => ({ t: +b.t.toFixed(3), type: b.type, err: +(vsSched[i] * 1000).toFixed(0) })).filter((o) => Math.abs(o.err) > 60),
}, null, 1));
await browser.close();
