// 河岸草地 scene: distant hills, varied tree line, levee, arched footbridge, a small torii with paper
// lanterns, spectators, a dark river strip and the near grassy bank. Same three-layer approach as
// town.ts (mid silhouette / fg silhouette / white "lightable" mask tinted per frame by the bursts).
// Kept low and sparse so the sky stays dominant.
import type { TownLayers } from './town';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function buildRiverbank(
  W: number, H: number, landTop: number, groundY: number, dpr: number, U: number,
  mid: HTMLCanvasElement, fg: HTMLCanvasElement, mask: HTMLCanvasElement,
): TownLayers {
  const wide = W > H;
  const mb = groundY - landTop; // ~84 px portrait, ~47 px landscape
  const k = Math.min(U, (mb / 84) * 1.0);
  const fgH = H - groundY;
  const S = wide ? fgH / 110 : fgH / 170;
  const maskY0 = Math.max(0, Math.floor(landTop - 30 * k));
  const fgY0 = Math.max(0, Math.floor(groundY - 40 * S));

  mid.width = Math.round(W * dpr);
  mid.height = Math.round(groundY * dpr);
  const g = mid.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, groundY);
  mask.width = Math.ceil(W);
  mask.height = Math.ceil(H - maskY0);
  const m = mask.getContext('2d')!;
  m.setTransform(1, 0, 0, 1, 0, -maskY0);
  m.clearRect(0, maskY0, W, H);
  m.fillStyle = '#fff'; m.strokeStyle = '#fff'; m.lineCap = 'round'; m.lineJoin = 'round';
  const rim = (pts: number[], a: number, w: number) => {
    m.globalAlpha = a; m.lineWidth = w;
    m.beginPath(); m.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) m.lineTo(pts[i], pts[i + 1]);
    m.stroke();
  };
  const seed = Math.random() * 100;

  // low smoke bank resting on the hills (dim base + lightable)
  const smokeY = landTop - 4 * k;
  for (let x = -20; x < W + 20; x += rand(18, 34) * k) {
    const r = rand(9, 20) * k, y = smokeY + rand(-5, 5) * k;
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, 'rgba(70,66,82,0.16)'); sg.addColorStop(1, 'rgba(70,66,82,0)');
    g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2);
    const mg = m.createRadialGradient(x, y, 0, x, y, r * 1.2);
    mg.addColorStop(0, 'rgba(255,255,255,0.5)'); mg.addColorStop(1, 'rgba(255,255,255,0)');
    m.globalAlpha = 1; m.fillStyle = mg; m.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  }
  m.fillStyle = '#fff';
  // distant hills (two ridges)
  const ridge = (base: number, a1: number, a2: number, f1: number, color: string, rimA: number) => {
    const pts: number[] = [];
    g.fillStyle = color; g.beginPath(); g.moveTo(0, groundY);
    for (let x = 0; x <= W + 8; x += 8) {
      const y = base + Math.sin(x * f1 + seed) * a1 * k + Math.sin(x * f1 * 3.3 + seed * 2) * a2 * k;
      g.lineTo(x, y); pts.push(x, y);
    }
    g.lineTo(W, groundY); g.closePath(); g.fill();
    rim(pts, rimA, 1.1);
  };
  ridge(landTop + 2 * k, 10, 4, 0.004, '#0a0c15', 0.22);
  ridge(landTop + 16 * k, 6, 3, 0.007, '#07080f', 0.3);

  // tree line: conifers, round clumps, a few tall cedars
  const treeBase = groundY - 12 * k;
  g.fillStyle = '#040508';
  for (let x = -6; x < W + 6;) {
    const kind = Math.random();
    if (kind < 0.4) {
      const h = rand(12, 22) * k, w = h * rand(0.35, 0.5);
      g.beginPath(); g.moveTo(x, treeBase); g.lineTo(x + w / 2, treeBase - h); g.lineTo(x + w, treeBase); g.closePath(); g.fill();
      rim([x + w * 0.15, treeBase - h * 0.7, x + w / 2, treeBase - h, x + w * 0.85, treeBase - h * 0.7], 0.55, 1);
      x += w * rand(0.6, 1.1);
    } else if (kind < 0.85) {
      const r = rand(5, 10) * k, cy = treeBase - r * 0.8;
      g.beginPath(); g.arc(x + r, cy, r, 0, Math.PI * 2); g.arc(x + r * 1.8, cy + r * 0.25, r * 0.75, 0, Math.PI * 2); g.fill();
      m.globalAlpha = 0.45; m.lineWidth = 1; m.beginPath(); m.arc(x + r, cy, r, Math.PI * 1.15, Math.PI * 1.85); m.stroke();
      x += r * rand(1.8, 2.6);
    } else if (kind < 0.93) {
      const h = rand(26, 34) * k, w = h * 0.22;
      g.beginPath(); g.moveTo(x, treeBase); g.lineTo(x + w / 2, treeBase - h); g.lineTo(x + w, treeBase); g.closePath(); g.fill();
      rim([x + w * 0.2, treeBase - h * 0.75, x + w / 2, treeBase - h, x + w * 0.8, treeBase - h * 0.75], 0.65, 1);
      x += w * 1.2;
    } else x += rand(8, 26) * k; // gaps
  }
  // levee embankment with a path along the top (the ground line)
  const levTop = groundY - 9 * k;
  g.fillStyle = '#05060a';
  g.beginPath(); g.moveTo(0, groundY); g.lineTo(0, levTop + 2 * k);
  const lev: number[] = [0, levTop + 2 * k];
  for (let x = 0; x <= W + 10; x += 10) { const y = levTop + Math.sin(x * 0.01 + seed) * 1.5 * k; g.lineTo(x, y); lev.push(x, y); }
  g.lineTo(W, groundY); g.closePath(); g.fill();
  rim(lev, 0.5, 1.2);
  m.globalAlpha = 0.1; m.fillRect(0, levTop, W, groundY - levTop);

  // small torii + string of paper lanterns on the bank
  const tx = W * (wide ? 0.14 : 0.16), tw = 22 * k, th = 24 * k, tb = levTop + 1 * k;
  g.fillStyle = '#1a0706';
  g.fillRect(tx, tb - th, 2.4 * k, th); g.fillRect(tx + tw, tb - th, 2.4 * k, th);
  g.fillRect(tx - 2 * k, tb - th * 0.72, tw + 6.4 * k, 1.8 * k); // nuki
  g.beginPath(); // kasagi with upturned ends
  g.moveTo(tx - 6 * k, tb - th - 3.2 * k); g.quadraticCurveTo(tx + tw / 2 + 1.2 * k, tb - th + 0.5 * k, tx + tw + 8.4 * k, tb - th - 3.2 * k);
  g.lineTo(tx + tw + 7 * k, tb - th + 0.4 * k); g.quadraticCurveTo(tx + tw / 2 + 1.2 * k, tb - th + 3 * k, tx - 4.6 * k, tb - th + 0.4 * k); g.closePath(); g.fill();
  m.globalAlpha = 0.95; m.lineWidth = 1.3; m.beginPath(); m.moveTo(tx - 6 * k, tb - th - 3.2 * k); m.quadraticCurveTo(tx + tw / 2 + 1.2 * k, tb - th + 0.5 * k, tx + tw + 8.4 * k, tb - th - 3.2 * k); m.stroke();
  rim([tx, tb - th, tx, tb], 0.35, 1); rim([tx + tw + 2.4 * k, tb - th, tx + tw + 2.4 * k, tb], 0.35, 1);
  // lantern string from the torii along the levee
  const lx0 = tx + tw + 10 * k, lx1 = lx0 + (wide ? 80 : 64) * k, ly = tb - th * 0.8;
  g.strokeStyle = '#08080a'; g.lineWidth = 0.7 * k;
  g.beginPath(); g.moveTo(lx0, ly); g.quadraticCurveTo((lx0 + lx1) / 2, ly + 6 * k, lx1, ly); g.stroke();
  g.fillRect(lx1, ly, 1.4 * k, tb - ly);
  const lamps: { x: number; y: number }[] = [];
  for (let i = 1; i <= 4; i++) {
    const u = i / 5, x = lx0 + (lx1 - lx0) * u, y = ly + 6 * k * 2 * u * (1 - u) * 2 + 2.6 * k;
    const lg = g.createRadialGradient(x, y, 0, x, y, 9 * k);
    lg.addColorStop(0, 'rgba(255,170,90,0.35)'); lg.addColorStop(1, 'rgba(255,170,90,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = lg; g.fillRect(x - 9 * k, y - 9 * k, 18 * k, 18 * k);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = i % 2 ? 'rgba(255,120,70,0.95)' : 'rgba(255,205,130,0.95)';
    g.beginPath(); g.ellipse(x, y, 1.9 * k, 2.6 * k, 0, 0, Math.PI * 2); g.fill();
    lamps.push({ x, y });
  }
  // low arched footbridge (taiko-bashi) over a side channel
  const bx0 = W * (wide ? 0.6 : 0.56), bx1 = W * (wide ? 0.74 : 0.84), bArc = 9 * k, bBase = levTop + 1 * k;
  const deck: number[] = [], rail: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16, x = bx0 + (bx1 - bx0) * u, y = bBase - Math.sin(Math.PI * u) * bArc;
    deck.push(x, y); rail.push(x, y - 3.5 * k);
  }
  g.strokeStyle = '#120607'; g.lineWidth = 2.2 * k;
  g.beginPath(); g.moveTo(deck[0], deck[1]); for (let i = 2; i < deck.length; i += 2) g.lineTo(deck[i], deck[i + 1]); g.stroke();
  g.lineWidth = 0.9 * k;
  g.beginPath(); g.moveTo(rail[0], rail[1]); for (let i = 2; i < rail.length; i += 2) g.lineTo(rail[i], rail[i + 1]); g.stroke();
  for (let i = 0; i <= 16; i += 2) { g.beginPath(); g.moveTo(deck[i * 2], deck[i * 2 + 1]); g.lineTo(rail[i * 2], rail[i * 2 + 1]); g.stroke(); }
  rim(rail, 0.85, 1.1); rim(deck, 0.4, 1);
  // spectators on the levee (sparse, a few with phones up)
  const nPeople = wide ? 9 : 6;
  g.fillStyle = '#020203';
  for (let i = 0; i < nPeople; i++) {
    let px = ((i + 0.5) / nPeople + rand(-0.04, 0.04)) * W;
    if (Math.abs(px - (tx + tw / 2)) < 20 * k) px += 26 * k;
    const sit = Math.random() < 0.4, h = (sit ? rand(6, 7.5) : rand(10, 12.5)) * k, base = levTop + 1.5 * k;
    g.beginPath(); g.moveTo(px - 2.2 * k, base); g.lineTo(px - 2.4 * k, base - h * 0.75); g.quadraticCurveTo(px, base - h * 0.85, px + 2.4 * k, base - h * 0.75); g.lineTo(px + (sit ? 4 : 2.2) * k, base); g.closePath(); g.fill();
    g.beginPath(); g.arc(px - 0.4 * k, base - h * 0.92, 1.7 * k, 0, Math.PI * 2); g.fill();
    m.globalAlpha = 0.4; m.beginPath(); m.arc(px - 0.4 * k, base - h * 0.95, 1.3 * k, Math.PI, Math.PI * 2); m.fill();
    if (Math.random() < 0.35) {
      g.fillStyle = 'rgba(215,232,255,0.9)'; g.fillRect(px + 1.2 * k, base - h * 1.2, 1.3 * k, 1.8 * k); g.fillStyle = '#020203';
    }
  }

  // ---------------- foreground: river strip + near grassy bank ----------------
  fg.width = Math.round(W * dpr);
  fg.height = Math.max(1, Math.round((H - fgY0) * dpr));
  const f = fg.getContext('2d')!;
  f.setTransform(dpr, 0, 0, dpr, 0, -fgY0 * dpr);
  f.clearRect(0, fgY0, W, H);
  const rv0 = groundY, rv1 = groundY + fgH * (wide ? 0.32 : 0.26);
  const rg = f.createLinearGradient(0, rv0, 0, rv1);
  rg.addColorStop(0, '#07080e'); rg.addColorStop(1, '#040409');
  f.fillStyle = rg; f.fillRect(0, rv0, W, rv1 - rv0);
  // still-water glints: static horizontal streaks that only show when tinted by bursts (no reflection pass)
  for (let i = 0; i < W / 6; i++) {
    const y = rand(rv0 + 1, rv1 - 2), x = rand(0, W), w = rand(6, 26) * S;
    m.globalAlpha = 0.22 * (1 - (y - rv0) / (rv1 - rv0)) + 0.06; m.fillRect(x, y, w, 0.8);
  }
  // lantern glints on the water below the lantern string
  for (const l of lamps) {
    f.fillStyle = 'rgba(255,170,90,0.28)';
    for (let j = 0; j < 4; j++) f.fillRect(l.x - rand(1, 3) * S, rv0 + 2 + j * 3 * S, rand(2, 6) * S, 0.9);
  }
  // near bank with grass tufts
  f.fillStyle = '#030304';
  f.beginPath(); f.moveTo(0, H);
  const bank: number[] = [];
  for (let x = 0; x <= W + 4; x += 4) {
    const y = rv1 + Math.sin(x * 0.006 + seed) * 4 * S - (Math.random() < 0.3 ? rand(1, 6) * S : 0);
    f.lineTo(x, y); bank.push(x, y);
  }
  f.lineTo(W, H); f.closePath(); f.fill();
  rim(bank, 0.35, 1);
  // a couple of tall reeds / susuki on the near bank
  f.strokeStyle = '#030304'; f.lineWidth = 1 * S;
  for (let i = 0; i < (wide ? 10 : 6); i++) {
    const x = rand(0, W), h = rand(14, 30) * S, y = rv1 + 2 * S, lean = rand(-6, 6) * S;
    f.beginPath(); f.moveTo(x, y); f.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); f.stroke();
    m.globalAlpha = 0.3; m.lineWidth = 0.8; m.beginPath(); m.moveTo(x + lean * 0.5, y - h * 0.7); m.lineTo(x + lean, y - h); m.stroke();
  }
  m.globalAlpha = 1;
  return { fgY0, maskY0, lamps, tower: null };
}
