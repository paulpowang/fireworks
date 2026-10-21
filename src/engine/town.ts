// 小鎮車站 scene: procedurally drawn small rural station, corner shop, yatai stalls (foreground)
// and rooftops / bridge / poles / crowd / smoke band (midground).
// Three pre-rendered layers:
//   mid  : midground silhouettes, height = groundY (drawn like the other scenes' land layer)
//   fg   : foreground silhouettes with their own baked warm lights, from fgY0 to the bottom
//   mask : white "lightable" layer at CSS-pixel resolution (rims on roof tops / wires / rails,
//          faint wall fill, smoke band). Tinted per frame by the bursts' aggregated colour.
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

export interface TownLayers {
  fgY0: number;
  maskY0: number;
  lamps: { x: number; y: number }[];
  tower: { x: number; y: number };
}

export function buildTown(
  W: number, H: number, landTop: number, groundY: number, dpr: number, U: number,
  mid: HTMLCanvasElement, fg: HTMLCanvasElement, mask: HTMLCanvasElement,
): TownLayers {
  const wide = W > H;
  const fgH = H - groundY;
  const S = wide ? fgH / 170 : fgH / 236; // ~1 in portrait, ~0.8 in landscape (bigger: the strip is short)
  const mb = groundY - landTop; // midground band height
  const k = Math.min(U, (mb / 118) * 1.15); // midground detail scale
  const maskY0 = Math.max(0, Math.floor(landTop - 34 * k));
  const fgY0 = Math.max(0, Math.floor(groundY - 140 * S));

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
  m.fillStyle = '#fff';
  m.strokeStyle = '#fff';
  m.lineCap = 'round';
  m.lineJoin = 'round';

  const rim = (pts: number[], a: number, w: number) => {
    m.globalAlpha = a; m.lineWidth = w;
    m.beginPath(); m.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) m.lineTo(pts[i], pts[i + 1]);
    m.stroke();
  };
  const wall = (x: number, y: number, w: number, h: number, a = 0.16) => { m.globalAlpha = a; m.fillRect(x, y, w, h); };

  // ---------------- midground ----------------
  // low smoke band on the horizon (dim base + strongly lightable in the mask)
  const smokeY = landTop + mb * 0.12;
  for (let x = -20; x < W + 20; x += rand(16, 30) * k) {
    const r = rand(10, 24) * k, y = smokeY + rand(-6, 6) * k;
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, 'rgba(70,64,80,0.22)'); sg.addColorStop(1, 'rgba(70,64,80,0)');
    g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2);
    const mg = m.createRadialGradient(x, y, 0, x, y, r * 1.2);
    mg.addColorStop(0, 'rgba(255,255,255,0.55)'); mg.addColorStop(1, 'rgba(255,255,255,0)');
    m.globalAlpha = 1; m.fillStyle = mg; m.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  }
  m.fillStyle = '#fff';
  // far tree line
  const seed = Math.random() * 100;
  const treeY = (x: number) => landTop + mb * 0.34 + Math.sin(x * 0.006 + seed) * 6 * k + Math.sin(x * 0.04 + seed) * 2.5 * k;
  g.fillStyle = '#06070c';
  g.beginPath(); g.moveTo(0, groundY);
  const tl: number[] = [];
  for (let x = 0; x <= W + 6; x += 6) { const y = treeY(x) - (Math.random() < 0.4 ? rand(0, 4) * k : 0); g.lineTo(x, y); tl.push(x, y); }
  g.lineTo(W, groundY); g.closePath(); g.fill();
  rim(tl, 0.3, 1.2);
  // radio tower on the hills
  const tower = { x: W * (wide ? 0.86 : 0.82), y: treeY(W * 0.84) - 40 * k };
  g.strokeStyle = '#06070c'; g.lineWidth = 1.4 * k;
  g.beginPath(); g.moveTo(tower.x - 6 * k, treeY(tower.x) + 2); g.lineTo(tower.x, tower.y); g.lineTo(tower.x + 6 * k, treeY(tower.x) + 2); g.stroke();
  rim([tower.x - 6 * k, treeY(tower.x), tower.x, tower.y, tower.x + 6 * k, treeY(tower.x)], 0.4, 1);
  // steel truss bridge
  const bx0 = W * 0.04, bx1 = W * (wide ? 0.34 : 0.5), by = landTop + mb * 0.6, bh = 10 * k;
  g.strokeStyle = '#05060a'; g.lineWidth = 1.6 * k;
  g.beginPath();
  g.moveTo(bx0, by); g.lineTo(bx1, by);
  const segs = Math.max(4, Math.round((bx1 - bx0) / (14 * k)));
  const top: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const x = bx0 + ((bx1 - bx0) * i) / segs;
    const arch = Math.sin((Math.PI * i) / segs) * bh + 3 * k;
    top.push(x, by - arch);
    g.moveTo(x, by); g.lineTo(x, by - arch);
    if (i < segs) { const x2 = bx0 + ((bx1 - bx0) * (i + 1)) / segs; g.lineTo(x2, by - Math.sin((Math.PI * (i + 1)) / segs) * bh - 3 * k); }
  }
  g.moveTo(top[0], top[1]); for (let i = 2; i < top.length; i += 2) g.lineTo(top[i], top[i + 1]);
  g.stroke();
  g.fillStyle = '#05060a'; g.fillRect(bx0, by, bx1 - bx0, 2.5 * k);
  rim(top, 0.75, 1.1);
  rim([bx0, by, bx1, by], 0.4, 1);
  for (let x = bx0 + 10 * k; x < bx1; x += rand(8, 26) * k) { g.fillStyle = 'rgba(255,200,130,0.55)'; g.fillRect(x, by + 0.5 * k, 1.2 * k, 1.2 * k); }
  // houses / rooftops
  let x = -rand(0, 20) * k;
  while (x < W) {
    const hw = rand(16, 34) * k, wh = rand(10, 22) * k, rh = rand(5, 11) * k;
    const base = groundY - rand(0, 3) * k;
    if (Math.random() < 0.22) {
      // tree clump
      const r = rand(7, 13) * k, cy = base - wh * 0.9;
      g.fillStyle = '#030406'; g.beginPath(); g.arc(x + r, cy, r, 0, Math.PI * 2); g.arc(x + r * 1.7, cy + r * 0.3, r * 0.8, 0, Math.PI * 2); g.fill();
      g.fillRect(x + r - 1 * k, cy, 2 * k, base - cy);
      m.globalAlpha = 0.35; m.lineWidth = 1.2; m.beginPath(); m.arc(x + r, cy, r, Math.PI * 1.1, Math.PI * 1.9); m.stroke();
      x += r * 2.4; continue;
    }
    const wy = base - wh;
    g.fillStyle = pick(['#040509', '#05060b', '#030407']);
    g.fillRect(x, wy, hw, base - wy);
    // gabled / hipped roof with eaves
    const ov = 2.5 * k;
    const hip = Math.random() < 0.5;
    const roof = hip ? [x - ov, wy + 1, x + hw * 0.25, wy - rh, x + hw * 0.75, wy - rh, x + hw + ov, wy + 1] : [x - ov, wy + 1, x + hw / 2, wy - rh, x + hw + ov, wy + 1];
    g.fillStyle = '#04050a';
    g.beginPath(); g.moveTo(roof[0], roof[1]); for (let i = 2; i < roof.length; i += 2) g.lineTo(roof[i], roof[i + 1]); g.closePath(); g.fill();
    rim(roof, 0.9, 1.3);
    wall(x, wy, hw, base - wy, 0.12);
    const nWin = Math.random() < 0.55 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    for (let i = 0; i < nWin; i++) {
      g.fillStyle = pick(['rgba(255,205,130,0.75)', 'rgba(255,230,180,0.6)', 'rgba(200,225,255,0.5)']);
      g.fillRect(x + hw * (0.2 + i * 0.4), wy + wh * 0.3, 4 * k, 3.5 * k);
    }
    x += hw + rand(1, 8) * k;
  }
  // utility poles + sagging wires
  const poles: [number, number][] = [];
  for (let px = rand(10, 40) * k; px < W + 60 * k; px += rand(60, 80) * k) poles.push([px, groundY - 44 * k]);
  g.strokeStyle = '#040408'; g.lineWidth = 1.6 * k;
  for (const [px, py] of poles) {
    g.beginPath(); g.moveTo(px, groundY); g.lineTo(px, py); g.moveTo(px - 6 * k, py + 4 * k); g.lineTo(px + 6 * k, py + 4 * k); g.stroke();
    rim([px, py, px, py + 20 * k], 0.35, 1);
  }
  g.lineWidth = 0.8 * k;
  for (let w = 0; w < 2; w++)
    for (let i = 0; i < poles.length - 1; i++) {
      const [ax, ay] = poles[i], [cx, cy] = poles[i + 1];
      const yy = 4 * k + w * 0 , dx = w ? 5 * k : -5 * k;
      g.beginPath(); g.moveTo(ax + dx, ay + yy); g.quadraticCurveTo((ax + cx) / 2, ay + yy + 9 * k, cx + dx, cy + yy); g.stroke();
      m.globalAlpha = 0.6; m.lineWidth = 0.9; m.beginPath(); m.moveTo(ax + dx, ay + yy); m.quadraticCurveTo((ax + cx) / 2, ay + yy + 9 * k, cx + dx, cy + yy); m.stroke();
    }
  // crowd along the ground line with phone specks
  g.fillStyle = '#020203';
  g.fillRect(0, groundY - 3 * k, W, 3 * k);
  for (let cx = 0; cx < W; cx += rand(2.6, 4.2) * k) {
    const r = rand(1.5, 2.3) * k, cy = groundY - rand(4, 7) * k;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillRect(cx - r * 1.3, cy + r * 0.6, r * 2.6, groundY - cy);
    m.globalAlpha = 0.3; m.beginPath(); m.arc(cx, cy - r * 0.4, r * 0.8, 0, Math.PI * 2); m.fill();
    if (Math.random() < 0.06) { g.fillStyle = 'rgba(220,235,255,0.85)'; g.fillRect(cx, cy - r * 2.8, 1.2 * k, 1.6 * k); g.fillStyle = '#020203'; }
  }

  // ---------------- foreground ----------------
  fg.width = Math.round(W * dpr);
  fg.height = Math.max(1, Math.round((H - fgY0) * dpr));
  const f = fg.getContext('2d')!;
  f.setTransform(dpr, 0, 0, dpr, 0, -fgY0 * dpr);
  f.clearRect(0, fgY0, W, H);
  const glow = (x: number, y: number, r: number, c: string, a: number) => {
    f.globalCompositeOperation = 'lighter';
    const gg = f.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, c + a + ')'); gg.addColorStop(1, c + '0)');
    f.fillStyle = gg; f.fillRect(x - r, y - r, r * 2, r * 2);
    f.globalCompositeOperation = 'source-over';
  };
  const yT = groundY + fgH * (wide ? 0.16 : 0.2); // track
  const yP = groundY + fgH * (wide ? 0.32 : 0.4); // platform top
  const platEnd = W * (wide ? 0.6 : 0.63);
  // street / ground strip in front of the midground
  f.fillStyle = '#040406'; f.fillRect(0, groundY, W, H - groundY);
  // catenary poles + wires behind the tracks
  f.strokeStyle = '#050508'; f.lineWidth = 2.2 * S;
  const catTop = yT - 118 * S;
  const cps: number[] = [];
  for (let cx = W * 0.08; cx < W + 1; cx += Math.max(110 * S, W / (wide ? 6 : 3))) cps.push(cx);
  for (const cx of cps) {
    f.beginPath(); f.moveTo(cx, yT - 2 * S); f.lineTo(cx, catTop); f.moveTo(cx, catTop + 8 * S); f.lineTo(cx + 22 * S, catTop + 8 * S); f.stroke();
    rim([cx, catTop, cx, catTop + 40 * S], 0.45, 1.2);
  }
  f.lineWidth = 0.9 * S;
  for (const wy of [catTop + 8 * S, catTop + 20 * S]) {
    f.beginPath(); f.moveTo(0, wy); f.lineTo(W, wy); f.stroke();
    rim([0, wy, W, wy], 0.55, 1);
  }
  // ballast + rails
  f.fillStyle = '#070709'; f.fillRect(0, yT - 4 * S, W, 16 * S);
  f.strokeStyle = '#1b1b22'; f.lineWidth = 1.4 * S;
  for (const ry of [yT, yT + 7 * S]) { f.beginPath(); f.moveTo(0, ry); f.lineTo(W, ry); f.stroke(); rim([0, ry, W, ry], 0.5, 1); }
  // yatai stalls on the far side of the tracks
  const stallW = 46 * S, stallH = 30 * S, sBase = yT - 5 * S;
  const sx0 = wide ? W * 0.36 : W * 0.4, sx1 = wide ? W * 0.68 : W * 0.98;
  for (let sx = sx0, i = 0; sx + stallW < sx1; sx += stallW + 4 * S, i++) {
    const col = ['#d0242c', '#e6bf1e', '#d0242c', '#f0e6c8'][i % 4];
    f.fillStyle = '#060608'; f.fillRect(sx + 3 * S, sBase - stallH * 0.55, stallW - 6 * S, stallH * 0.55);
    // lit counter
    const cg = f.createLinearGradient(0, sBase - stallH * 0.5, 0, sBase);
    cg.addColorStop(0, 'rgba(255,236,190,0.85)'); cg.addColorStop(1, 'rgba(255,170,80,0.35)');
    f.fillStyle = cg; f.fillRect(sx + 5 * S, sBase - stallH * 0.48, stallW - 10 * S, stallH * 0.3);
    // canopy (lit from below by bulbs)
    f.fillStyle = col; f.globalAlpha = 0.85;
    f.beginPath(); f.moveTo(sx, sBase - stallH * 0.52); f.lineTo(sx + 4 * S, sBase - stallH); f.lineTo(sx + stallW - 4 * S, sBase - stallH); f.lineTo(sx + stallW, sBase - stallH * 0.52); f.closePath(); f.fill();
    f.globalAlpha = 1;
    f.fillStyle = 'rgba(255,255,255,0.25)'; f.fillRect(sx + 4 * S, sBase - stallH, stallW - 8 * S, 2 * S);
    glow(sx + stallW / 2, sBase - stallH * 0.45, 26 * S, 'rgba(255,190,110,', 0.22);
    rim([sx + 4 * S, sBase - stallH, sx + stallW - 4 * S, sBase - stallH], 0.5, 1);
  }
  // platform
  f.fillStyle = '#09090c'; f.fillRect(0, yP, platEnd, H - yP);
  f.fillStyle = '#121216'; f.fillRect(0, yP, platEnd, 2 * S);
  f.fillStyle = 'rgba(210,180,60,0.4)'; f.fillRect(0, yP + 5 * S, platEnd - 4 * S, 2.2 * S);
  rim([0, yP, platEnd, yP], 0.55, 1.2);
  // station building + shelter
  const bx = W * 0.03, bw = (wide ? 170 : 150) * S;
  const yR = yP - 64 * S;
  const office = bw * 0.5;
  f.fillStyle = '#060609'; f.fillRect(bx, yR + 6 * S, office, yP - yR - 6 * S);
  wall(bx, yR + 6 * S, office, yP - yR - 6 * S, 0.1);
  // office window (warm) with mullions + door
  f.fillStyle = 'rgba(255,214,150,0.85)'; f.fillRect(bx + 8 * S, yR + 18 * S, office * 0.5, 18 * S);
  f.fillStyle = '#060609'; f.fillRect(bx + 8 * S + office * 0.25 - 0.8 * S, yR + 18 * S, 1.6 * S, 18 * S);
  glow(bx + 8 * S + office * 0.25, yR + 27 * S, 34 * S, 'rgba(255,190,120,', 0.18);
  f.fillStyle = 'rgba(255,200,140,0.35)'; f.fillRect(bx + office * 0.7, yR + 20 * S, office * 0.22, yP - yR - 20 * S);
  // shelter posts
  f.fillStyle = '#060609';
  for (const px of [bx + office + bw * 0.22, bx + bw - 3 * S]) f.fillRect(px, yR + 6 * S, 2.6 * S, yP - yR - 6 * S);
  // bench
  f.fillRect(bx + office + 10 * S, yP - 11 * S, bw * 0.3, 3 * S);
  f.fillRect(bx + office + 12 * S, yP - 11 * S, 1.6 * S, 11 * S); f.fillRect(bx + office + bw * 0.3 + 6 * S, yP - 11 * S, 1.6 * S, 11 * S);
  // fluorescent tube under the roof
  f.fillStyle = 'rgba(235,248,255,0.95)'; f.fillRect(bx + office + bw * 0.08, yR + 9 * S, bw * 0.3, 1.8 * S);
  glow(bx + office + bw * 0.23, yR + 12 * S, 40 * S, 'rgba(200,230,255,', 0.2);
  // roof (gabled, wide eaves)
  const roof = [bx - 8 * S, yR + 7 * S, bx + bw * 0.5, yR - 12 * S, bx + bw + 8 * S, yR + 7 * S];
  f.fillStyle = '#050507';
  f.beginPath(); f.moveTo(roof[0], roof[1]); f.lineTo(roof[2], roof[3]); f.lineTo(roof[4], roof[5]); f.lineTo(roof[4], roof[5] + 3 * S); f.lineTo(roof[0], roof[1] + 3 * S); f.closePath(); f.fill();
  rim(roof, 1, 1.6);
  // station-name sign
  const sgx = bx + bw + 30 * S, sgw = 74 * S, sgh = 26 * S, sgy = yP - 46 * S;
  f.fillStyle = '#060609'; f.fillRect(sgx + 6 * S, sgy, 2 * S, yP - sgy); f.fillRect(sgx + sgw - 8 * S, sgy, 2 * S, yP - sgy);
  f.fillStyle = 'rgba(232,234,228,0.9)'; f.fillRect(sgx, sgy, sgw, sgh);
  f.fillStyle = 'rgba(30,110,60,0.9)'; f.fillRect(sgx, sgy + sgh - 6 * S, sgw, 2.5 * S);
  f.fillStyle = '#111';
  f.textAlign = 'center'; f.textBaseline = 'middle';
  f.font = `bold ${Math.max(6, 10 * S)}px "Noto Sans TC","PingFang TC","Hiragino Sans",sans-serif`;
  f.fillText('花火町', sgx + sgw / 2, sgy + sgh * 0.38);
  f.font = `${Math.max(4, 4.6 * S)}px sans-serif`;
  f.fillText('はなびまち', sgx + sgw / 2, sgy + sgh * 0.13 + 1);
  f.fillText('← 川辺', sgx + sgw * 0.2, sgy + sgh - 2.2 * S);
  f.fillText('山口 →', sgx + sgw * 0.8, sgy + sgh - 2.2 * S);
  rim([sgx, sgy, sgx + sgw, sgy], 0.6, 1);
  // lamp posts along the platform
  const lamps: { x: number; y: number }[] = [];
  lamps.push({ x: bx + bw + 18 * S, y: yP - 62 * S });
  for (let lx = sgx + sgw + 40 * S; lx < platEnd - 6 * S; lx += 90 * S) lamps.push({ x: lx, y: yP - 62 * S });
  for (const l of lamps) {
    f.fillStyle = '#060609'; f.fillRect(l.x - 1.2 * S, l.y, 2.4 * S, yP - l.y); f.fillRect(l.x - 7 * S, l.y - 1 * S, 8 * S, 2 * S);
    f.fillStyle = 'rgba(255,200,120,0.95)'; f.fillRect(l.x - 8 * S, l.y + 1 * S, 5 * S, 2 * S);
    glow(l.x - 5.5 * S, l.y + 4 * S, 30 * S, 'rgba(255,180,100,', 0.3);
    rim([l.x, l.y, l.x, l.y + 30 * S], 0.4, 1);
  }
  // person silhouettes on the platform, looking up
  // free spots: inside the shelter, and past the sign (keep the sign readable)
  const spots: number[] = [bx + office + bw * 0.12, bx + office + bw * 0.34];
  for (let px = sgx + sgw + 18 * S; px < platEnd - 8 * S; px += rand(24, 40) * S) if (lamps.every((l) => Math.abs(l.x - px) > 8 * S)) spots.push(px);
  for (let i = 0; i < spots.length; i++) {
    const px = spots[i];
    const ph = rand(26, 34) * S;
    f.fillStyle = '#020203';
    f.beginPath();
    f.moveTo(px - 4.5 * S, yP); f.lineTo(px - 5 * S, yP - ph * 0.72); f.quadraticCurveTo(px, yP - ph * 0.82, px + 5 * S, yP - ph * 0.72); f.lineTo(px + 4.5 * S, yP); f.closePath(); f.fill();
    const hx = px - 1.2 * S, hy = yP - ph * 0.9;
    f.beginPath(); f.ellipse(hx, hy, 3.4 * S, 3.8 * S, -0.5, 0, Math.PI * 2); f.fill();
    m.globalAlpha = 0.4; m.beginPath(); m.ellipse(hx, hy - 1 * S, 2.6 * S, 2.6 * S, 0, Math.PI, Math.PI * 2); m.fill();
    if (i % 2 === 1) {
      f.fillStyle = '#020203'; f.fillRect(px + 3 * S, hy - 8 * S, 1.6 * S, 10 * S);
      f.fillStyle = 'rgba(215,232,255,0.95)'; f.fillRect(px + 2.4 * S, hy - 11 * S, 2.6 * S, 4 * S);
      glow(px + 3.7 * S, hy - 9 * S, 8 * S, 'rgba(190,220,255,', 0.35);
    }
  }
  // corner shop (雜貨店) with noren + vending machines
  const shx = W * (wide ? 0.72 : 0.67), shw = Math.min(W - shx - 3, (wide ? 190 : 140) * S);
  const shB = yP + 16 * S, shT = shB - 74 * S;
  f.fillStyle = '#060609'; f.fillRect(shx, shT, shw, shB - shT);
  wall(shx, shT, shw, shB - shT, 0.1);
  f.fillStyle = '#040406'; f.fillRect(shx - 3 * S, shT - 3 * S, shw + 6 * S, 4 * S);
  rim([shx - 3 * S, shT - 3 * S, shx + shw + 3 * S, shT - 3 * S], 0.9, 1.4);
  // sign band
  f.fillStyle = 'rgba(240,240,232,0.75)'; f.fillRect(shx + 4 * S, shT + 5 * S, shw - 8 * S, 9 * S);
  f.fillStyle = 'rgba(220,60,40,0.85)'; f.fillRect(shx + 4 * S, shT + 5 * S, (shw - 8 * S) * 0.18, 9 * S);
  f.fillStyle = '#222'; f.font = `bold ${Math.max(5, 6.5 * S)}px "Noto Sans TC","PingFang TC",sans-serif`;
  f.fillText('花火商店', shx + 4 * S + (shw - 8 * S) * 0.58, shT + 9.8 * S);
  // big warm window with shelves
  const wx = shx + 6 * S, ww = shw * 0.55, wy = shT + 20 * S, wh = shB - wy - 6 * S;
  const wg = f.createLinearGradient(0, wy, 0, wy + wh);
  wg.addColorStop(0, 'rgba(255,240,205,0.92)'); wg.addColorStop(1, 'rgba(255,200,120,0.8)');
  f.fillStyle = wg; f.fillRect(wx, wy, ww, wh);
  f.fillStyle = 'rgba(80,50,30,0.55)';
  for (let sy = wy + wh * 0.3; sy < wy + wh; sy += wh * 0.28) f.fillRect(wx + 2 * S, sy, ww - 4 * S, 1.2 * S);
  for (let i = 0; i < 18; i++) { f.fillStyle = pick(['rgba(200,60,60,0.6)', 'rgba(60,120,200,0.55)', 'rgba(60,160,90,0.55)', 'rgba(230,170,40,0.6)']); f.fillRect(wx + rand(3, ww - 6) * 1, wy + wh * pick([0.18, 0.46, 0.74]), 2.2 * S, 3 * S); }
  f.fillStyle = '#060609'; f.fillRect(wx + ww / 2 - 0.8 * S, wy, 1.6 * S, wh);
  glow(wx + ww / 2, wy + wh * 0.6, 60 * S, 'rgba(255,200,130,', 0.22);
  // door with noren
  const dx = shx + shw * 0.66, dw = shw * 0.26;
  f.fillStyle = 'rgba(255,215,160,0.6)'; f.fillRect(dx, wy, dw, shB - wy);
  for (let i = 0; i < 3; i++) {
    f.fillStyle = 'rgba(34,48,110,0.95)'; f.fillRect(dx + (dw / 3) * i + 0.6 * S, wy, dw / 3 - 1.2 * S, 14 * S);
  }
  // vending machines beside the shop
  for (let i = 0; i < 2; i++) {
    const vx = shx - (14 + i * 15) * S - 2 * S, vy = shB - 36 * S;
    f.fillStyle = '#0a0a10'; f.fillRect(vx, vy, 13 * S, 36 * S);
    f.fillStyle = i ? 'rgba(210,235,255,0.9)' : 'rgba(255,245,235,0.9)'; f.fillRect(vx + 1.5 * S, vy + 2 * S, 10 * S, 18 * S);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { f.fillStyle = pick(['#e33', '#38f', '#3b6', '#fa2', '#eee']); f.fillRect(vx + 2.3 * S + c * 2.4 * S, vy + 4 * S + r * 5 * S, 1.6 * S, 3 * S); }
    glow(vx + 6.5 * S, vy + 12 * S, 22 * S, 'rgba(200,225,255,', 0.25);
    rim([vx, vy, vx + 13 * S, vy], 0.5, 1);
  }
  m.globalAlpha = 1;
  return { fgY0, maskY0, lamps, tower };
}
