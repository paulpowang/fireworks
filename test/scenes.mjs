// Scene check: screenshots per scene (portrait/landscape/rotated), localStorage persistence,
// and perf comparison (render() CPU time + rAF frame interval) at pinned q=1 with a seeded auto show.
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const mode = process.argv[3] || 'all';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const SC = (process.env.SCENES || 'town,field,lake,sky').split(',').map((id) => [id, { town: '小鎮車站', field: '河岸草地', lake: '湖面倒影', sky: '純夜空' }[id]]);
const seed = `(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();`;
const out = { shots: [], perf: [], persist: null, errors: [] };

async function newPage(vw, vh, sceneId) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(seed);
  if (sceneId) await ctx.addInitScript(`try{localStorage.setItem('fw.sceneChoice','${sceneId}')}catch(e){}`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && out.errors.push(m.text()));
  return { ctx, page };
}

if (mode === 'all' || mode === 'shots') {
  for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
    const { ctx, page } = await newPage(vw, vh);
    await page.goto(base + '?debug&q=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const def = await page.evaluate(() => window.__fw.scene);
    for (const [id, label] of SC) {
      await page.locator('.pill', { hasText: '換場景' }).tap();
      await page.locator('.scenemenu .chip', { hasText: label }).tap();
      await page.evaluate(() => { const f = window.__fw; f.n = 0; f.rockets.length = 0; f.timed.length = 0; f.emitters.length = 0; });
      for (const t of ['地面火花', '千輪']) {
        await page.locator('.chip', { hasText: t }).first().tap();
        await page.touchscreen.tap(vw * 0.5, vh * 0.3);
        if (t === '千輪') await page.touchscreen.tap(vw * 0.3, vh * 0.2);
      }
      await page.waitForTimeout(2100);
      const info = await page.evaluate(() => ({ scene: window.__fw.scene, ground: Math.round(window.__fw.waterY), H: window.__fw.H, refl: [window.__fw.refl.width, window.__fw.refl.height] }));
      await page.screenshot({ path: `test/shots/scene-${id}-${tag}.png` });
      out.shots.push({ tag, defaultScene: def, ...info });
    }
    await ctx.close();
  }
  // rotated (CSS 90deg fallback): emulate iOS by removing orientation.lock
  {
    const { ctx, page } = await newPage(390, 844);
    await ctx.addInitScript(() => { try { Object.defineProperty(screen.orientation, 'lock', { value: undefined }); } catch {} });
    await page.goto(base + '?debug&q=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.locator('.pill', { hasText: '橫屏' }).tap();
    await page.waitForTimeout(800);
    await page.locator('.pill', { hasText: '換場景' }).tap();
    await page.locator('.scenemenu .chip', { hasText: '小鎮車站' }).tap();
    await page.locator('.chip', { hasText: '地面火花' }).first().tap();
    await page.touchscreen.tap(195, 420);
    await page.waitForTimeout(1500);
    const rot = await page.evaluate(() => ({ cls: document.querySelector('.app').className, W: window.__fw.W, H: window.__fw.H, scene: window.__fw.scene }));
    await page.screenshot({ path: `test/shots/scene-town-rotated.png` });
    out.shots.push({ tag: 'rotated', ...rot });
    await ctx.close();
  }
  // persistence: choose lake, reload, expect lake
  {
    const { ctx, page } = await newPage(390, 844);
    await page.goto(base + '?debug&q=1', { waitUntil: 'networkidle' });
    await page.locator('.pill', { hasText: '換場景' }).tap();
    await page.locator('.scenemenu .chip', { hasText: '湖面倒影' }).tap();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    out.persist = await page.evaluate(() => ({ stored: localStorage.getItem('fw.sceneChoice'), scene: window.__fw.scene }));
    await ctx.close();
  }
}

if (mode === 'all' || mode === 'perf') {
  const rounds = +(process.env.ROUNDS || 2);
  for (let r = 0; r < rounds; r++)
    for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']])
      for (const [id] of SC) {
        const { ctx, page } = await newPage(vw, vh, id);
        await page.goto(base + '?debug&q=1', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
          const f = window.__fw; const orig = f.render.bind(f);
          window.__perf = { r: [], fr: [], last: 0, on: false };
          f.render = () => { const t = performance.now(); orig(); if (window.__perf.on) window.__perf.r.push(performance.now() - t); };
          const tick = (now) => { const p = window.__perf; if (p.on && p.last) p.fr.push(now - p.last); p.last = now; requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        const measure = async (ms) => {
          await page.evaluate(() => { const p = window.__perf; p.r = []; p.fr = []; p.last = 0; p.on = true; });
          await page.waitForTimeout(ms);
          return page.evaluate(() => {
            const p = window.__perf; p.on = false;
            const st = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.reduce((x, y) => x + y, 0) / (s.length || 1); return { mean: +m.toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), n: s.length }; };
            return { render: st(p.r), frame: st(p.fr), peak: window.__fw.n };
          });
        };
        const idle = await measure(4000);
        await page.locator('.pill', { hasText: '自動秀' }).tap();
        await page.waitForTimeout(1500);
        const show = await measure(10000);
        out.perf.push({ round: r, tag, scene: id, idle, show, q: await page.evaluate(() => window.__fw.qLevel) });
        await ctx.close();
      }
}
console.log(JSON.stringify(out));
await browser.close();
