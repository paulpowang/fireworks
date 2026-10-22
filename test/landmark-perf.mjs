// Landmark perf: render() CPU time at pinned q=1, same workload (經典終章) in 河岸草地 vs landmark scenes,
// plus the 大樓秀 in landmark scenes. Seeded Math.random so workloads match.
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const pw = require('playwright-core');
const base = process.argv[2] || 'http://127.0.0.1:4173/fireworks/';
const browser = await pw.chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
const seed = `(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();`;
const out = []; const errors = [];
const runs = [['field', 'classic'], ['tw101', 'classic'], ['needle', 'classic'], ['tw101', 'tower'], ['needle', 'tower']];
for (let r = 0; r < +(process.env.ROUNDS || 2); r++)
  for (const [vw, vh, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']])
    for (const [id, fin] of runs) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await ctx.addInitScript(seed);
      await ctx.addInitScript(`try{localStorage.setItem('fw.sceneChoice','${id}')}catch(e){}`);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + '?debug&q=1', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const res = await page.evaluate(async ([fin, ms]) => {
        const f = window.__fw; const orig = f.render.bind(f); const rs = []; const ns = []; let on = false;
        f.render = () => { const t = performance.now(); orig(); if (on) { rs.push(performance.now() - t); ns.push(f.n); } };
        const st = (a) => { const s = [...a].sort((x, y) => x - y); return { mean: +(s.reduce((x, y) => x + y, 0) / (s.length || 1)).toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2) }; };
        on = true; await new Promise((ok) => setTimeout(ok, 3000)); on = false;
        const idle = st(rs); rs.length = 0; ns.length = 0;
        f.finale(fin, true); on = true; await new Promise((ok) => setTimeout(ok, ms)); on = false;
        return { idle, show: st(rs), meanN: Math.round(ns.reduce((x, y) => x + y, 0) / (ns.length || 1)), peakN: Math.max(...ns), frames: rs.length };
      }, [fin, 16000]);
      out.push({ r, tag, scene: id, finale: fin, ...res });
      console.log(JSON.stringify(out[out.length - 1]));
      await ctx.close();
    }
console.log('errors', JSON.stringify(errors));
await browser.close();
