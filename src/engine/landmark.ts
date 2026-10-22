// 地標大樓場景: 台北 101 / 西雅圖 Space Needle — original procedural vector silhouettes.
// Same three layers as the other lit scenes (mid silhouette, fg, white "lightable" mask)
// plus:
//   flash    : white outline / window-band canvas (CSS px) added with a tint when the show flashes the building
//   emitters : launch points ON the building (corners, ledges, saucer rim, spire) with an outward direction
import type { TownLayers } from './town';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type EmitterRole = 'side' | 'ledge' | 'top';
export interface LandmarkEmitter {
  x: number; y: number;
  /** outward launch direction (canvas radians, -PI/2 = straight up) */
  ang: number;
  /** 0 = lowest level ... tiers-1 = highest (used by the bottom-to-top choreography) */
  tier: number;
  role: EmitterRole;
  /** -1 left face, 0 centre, 1 right face */
  side: -1 | 0 | 1;
}
export interface LandmarkLayers extends TownLayers {
  kind: 'tw101' | 'needle';
  emitters: LandmarkEmitter[];
  tiers: number;
  topX: number; topY: number; // spire tip
  cx: number; halfW: number;  // building centre / half width (widest part) for tap mapping
  flash: HTMLCanvasElement; flashX0: number; flashY0: number;
}

/** building geometry (shared by mid + engine): spire tip height above ground as a fraction of H */
export function landmarkLayout(kind: 'tw101' | 'needle', W: number, H: number) {
  const wide = W > H;
  const groundY = H * (wide ? 0.86 : 0.84);
  const landTop = H * (wide ? 0.78 : 0.77);
  const topY = H * (wide ? 0.11 : 0.27);
  const cx = kind === 'tw101' ? W * 0.5 : W * (wide ? 0.4 : 0.42);
  return { groundY, landTop, topY, cx };
}

export function buildLandmark(
  kind: 'tw101' | 'needle',
  W: number, H: number, landTop: number, groundY: number, dpr: number, U: number,
  mid: HTMLCanvasElement, fg: HTMLCanvasElement, mask: HTMLCanvasElement, flash: HTMLCanvasElement,
): LandmarkLayers {
  const wide = W > H;
  const { topY, cx } = landmarkLayout(kind, W, H);
  const B = groundY - topY; // building height incl. spire
  const maskY0 = Math.max(0, Math.floor(topY - 4));
  const fgY0 = Math.max(0, Math.floor(groundY - (kind === 'needle' ? B * 0.2 : 6)));

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

  // flash canvas covers the building bbox only
  const fx0 = Math.floor(cx - B * 0.2), fy0 = Math.floor(topY - 4);
  flash.width = Math.ceil(B * 0.4); flash.height = Math.ceil(groundY - fy0 + 2);
  const fl = flash.getContext('2d')!;
  fl.setTransform(1, 0, 0, 1, -fx0, -fy0);
  fl.clearRect(fx0, fy0, flash.width, flash.height);
  fl.fillStyle = '#fff'; fl.strokeStyle = '#fff'; fl.lineCap = 'round'; fl.lineJoin = 'round';

  const poly = (c: CanvasRenderingContext2D, pts: number[]) => {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  };
  const line = (c: CanvasRenderingContext2D, pts: number[], a: number, w: number) => {
    c.globalAlpha = a; c.lineWidth = w;
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.stroke();
  };

  // ---------------- distant hills / mountain ----------------
  const hillC = '#07080d';
  if (kind === 'tw101') {
    // 象山 / 四獸山 ridge behind the city, both sides
    g.fillStyle = hillC;
    g.beginPath(); g.moveTo(0, groundY);
    const pk = [[0, 0.16], [0.12, 0.2], [0.26, 0.13], [0.4, 0.08], [0.6, 0.1], [0.72, 0.19], [0.86, 0.26], [1, 0.18]];
    for (const [u, h] of pk) g.lineTo(u * W, groundY - h * B * (wide ? 0.9 : 0.7));
    g.lineTo(W, groundY); g.closePath(); g.fill();
    line(m, pk.flatMap(([u, h]) => [u * W, groundY - h * B * (wide ? 0.9 : 0.7)]), 0.22, 1.5);
  } else {
    // Mount Rainier hint: broad soft cone far away with a slightly lighter snow cap
    const mx = W * (wide ? 0.8 : 0.78), mh = B * (wide ? 0.34 : 0.26), mw = B * (wide ? 0.95 : 0.7);
    const top = groundY - mh;
    g.fillStyle = '#0b0d16';
    g.beginPath(); g.moveTo(mx - mw, groundY);
    g.quadraticCurveTo(mx - mw * 0.3, top + mh * 0.25, mx - mw * 0.06, top);
    g.lineTo(mx + mw * 0.08, top + 1);
    g.quadraticCurveTo(mx + mw * 0.35, top + mh * 0.3, mx + mw, groundY);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(70,78,100,0.22)';
    g.beginPath(); g.moveTo(mx - mw * 0.2, top + mh * 0.28);
    g.lineTo(mx - mw * 0.06, top); g.lineTo(mx + mw * 0.08, top + 1); g.lineTo(mx + mw * 0.24, top + mh * 0.3);
    g.lineTo(mx + mw * 0.1, top + mh * 0.22); g.lineTo(mx, top + mh * 0.3); g.lineTo(mx - mw * 0.1, top + mh * 0.22);
    g.closePath(); g.fill();
    line(m, [mx - mw * 0.3, top + mh * 0.4, mx - mw * 0.06, top, mx + mw * 0.08, top + 1, mx + mw * 0.35, top + mh * 0.4], 0.35, 2);
  }

  // ---------------- city blocks ----------------
  const winDots = (x: number, y: number, w: number, h: number, dens: number, warm: boolean) => {
    const st = Math.max(3, B * 0.012);
    for (let yy = y + st; yy < y + h - 2; yy += st)
      for (let xx = x + st * 0.6; xx < x + w - 2; xx += st * 0.8) {
        if (Math.random() > dens) continue;
        g.globalAlpha = rand(0.18, 0.55);
        g.fillStyle = warm ? (Math.random() < 0.7 ? '#ffd9a0' : '#cfe2ff') : (Math.random() < 0.5 ? '#bfe0ff' : '#ffe6b8');
        g.fillRect(xx, yy, Math.max(1, st * 0.35), Math.max(1, st * 0.3));
      }
    g.globalAlpha = 1;
  };
  const block = (x: number, w: number, h: number, c: string, dens: number, cap?: 'step' | 'spire' | 'slant') => {
    const y = groundY - h;
    g.fillStyle = c; g.fillRect(x, y, w, h + 1);
    if (cap === 'step') { g.fillRect(x + w * 0.2, y - h * 0.06, w * 0.6, h * 0.06 + 1); }
    if (cap === 'spire') { g.fillRect(x + w * 0.47, y - h * 0.16, Math.max(1, w * 0.06), h * 0.16); }
    if (cap === 'slant') { g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + w, y - h * 0.1); g.lineTo(x + w, y + 1); g.fill(); }
    winDots(x, y, w, h, dens, true);
    line(m, [x, y, x + w, y], 0.6, 1.4);
    m.globalAlpha = 0.1; m.fillRect(x, y, w, h);
  };

  // far row
  const bw = B * 0.035;
  for (let x = -bw; x < W + bw;) {
    const w = rand(0.8, 1.6) * bw;
    block(x, w, rand(0.05, 0.13) * B, '#090a10', 0.18);
    x += w + rand(0, 0.3) * bw;
  }
  if (kind === 'needle') {
    // downtown Seattle: cluster of towers on the right of the needle
    const dx0 = cx + B * (wide ? 0.32 : 0.2), dx1 = Math.min(W + 10, dx0 + B * (wide ? 1.15 : 0.8));
    const n = wide ? 13 : 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = dx0 + u * (dx1 - dx0) + rand(-4, 4);
      const peak = Math.exp(-(((u - 0.45) / 0.28) ** 2));
      const h = B * (0.16 + 0.44 * peak * rand(0.75, 1.05));
      const w = B * rand(0.045, 0.075);
      block(x - w / 2, w, h, i % 2 ? '#0a0b12' : '#0c0d15', 0.35, i % 3 === 0 ? 'step' : i % 3 === 1 ? 'slant' : 'spire');
    }
    // left side: lower Queen Anne houses
    for (let x = -bw; x < cx - B * 0.16;) {
      const w = rand(0.9, 1.4) * bw;
      block(x, w, rand(0.06, 0.12) * B, '#0b0c12', 0.3, Math.random() < 0.3 ? 'slant' : undefined);
      x += w + rand(0.1, 0.4) * bw;
    }
  } else {
    // 信義區: mid-rise towers on both sides, lower toward the centre
    for (let x = -bw; x < W + bw;) {
      const w = rand(1.0, 1.9) * bw;
      const d = Math.abs(x + w / 2 - cx) / Math.max(1, W * 0.5);
      if (Math.abs(x + w / 2 - cx) > B * 0.14) block(x, w, B * rand(0.08, 0.2) * (0.6 + d * 0.8), '#0b0c13', 0.32, Math.random() < 0.35 ? 'step' : Math.random() < 0.3 ? 'spire' : undefined);
      x += w + rand(0.2, 0.6) * bw;
    }
  }

  const bodyC = '#05060b';
  const emitters: LandmarkEmitter[] = [];
  const up = -Math.PI / 2;
  let tiers = 0;
  let halfW = 0;
  const lamps: { x: number; y: number }[] = [];

  if (kind === 'tw101') {
    let y = groundY;
    const fill = (pts: number[]) => { g.fillStyle = bodyC; poly(g, pts); g.fill(); };
    // podium (mall)
    const podW = B * 0.34, podH = B * 0.045;
    fill([cx - podW / 2, y, cx - podW / 2, y - podH, cx + podW / 2, y - podH, cx + podW / 2, y]);
    g.fillStyle = 'rgba(255,214,150,0.35)'; g.fillRect(cx - podW / 2 + 2, y - podH * 0.45, podW - 4, Math.max(1, podH * 0.12));
    line(m, [cx - podW / 2, y - podH, cx + podW / 2, y - podH], 0.7, 1.5);
    halfW = podW / 2;
    y -= podH;
    // base section: slightly tapering trapezoid
    const baseH = B * 0.235, b0 = B * 0.13, b1 = B * 0.104;
    fill([cx - b0 / 2, y, cx - b1 / 2, y - baseH, cx + b1 / 2, y - baseH, cx + b0 / 2, y]);
    // ruyi coin ornament
    g.strokeStyle = 'rgba(160,190,200,0.35)'; g.lineWidth = Math.max(1, B * 0.003);
    g.beginPath(); g.arc(cx, y - baseH * 0.86, B * 0.011, 0, Math.PI * 2); g.stroke();
    line(m, [cx - b0 / 2, y, cx - b1 / 2, y - baseH], 0.55, 1.4);
    line(m, [cx + b0 / 2, y, cx + b1 / 2, y - baseH], 0.55, 1.4);
    m.globalAlpha = 0.14; poly(m, [cx - b0 / 2, y, cx - b1 / 2, y - baseH, cx + b1 / 2, y - baseH, cx + b0 / 2, y]); m.fill();
    line(fl, [cx - b0 / 2, y, cx - b1 / 2, y - baseH, cx + b1 / 2, y - baseH, cx + b0 / 2, y], 0.9, 1.5);
    // vertical window strips
    for (let k = -2; k <= 2; k++) {
      g.fillStyle = 'rgba(190,230,215,0.12)';
      g.fillRect(cx + k * b1 * 0.18 - 0.5, y - baseH + 3, 1, baseH - 6);
    }
    emitters.push({ x: cx - b1 / 2, y: y - baseH, ang: up - 1.05, tier: 0, role: 'side', side: -1 });
    emitters.push({ x: cx + b1 / 2, y: y - baseH, ang: up + 1.05, tier: 0, role: 'side', side: 1 });
    emitters.push({ x: cx, y: y - baseH, ang: up, tier: 0, role: 'ledge', side: 0 });
    y -= baseH;
    // 8 pagoda segments, each flaring outward toward its top
    const segH = B * 0.064, s0 = B * 0.096, s1 = B * 0.124;
    for (let i = 0; i < 8; i++) {
      const yt = y - segH;
      fill([cx - s0 / 2, y, cx - s1 / 2, yt, cx + s1 / 2, yt, cx + s0 / 2, y]);
      // ledge band
      g.fillStyle = '#0a0c12'; g.fillRect(cx - s1 / 2 - B * 0.003, yt - 1, s1 + B * 0.006, Math.max(1.5, B * 0.004));
      // subtle lit edges (101 is outlined at night) + windows
      g.strokeStyle = 'rgba(150,215,190,0.22)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - s0 / 2, y); g.lineTo(cx - s1 / 2, yt); g.lineTo(cx + s1 / 2, yt); g.lineTo(cx + s0 / 2, y); g.stroke();
      for (let k = -2; k <= 2; k++) {
        g.fillStyle = 'rgba(200,235,220,0.13)';
        g.fillRect(cx + k * s0 * 0.18 - 0.5, yt + 3, 1, segH - 5);
      }
      for (let r = 0; r < 3; r++) {
        const wy = yt + segH * (0.25 + r * 0.25);
        for (let k = 0; k < 6; k++) {
          if (Math.random() < 0.55) continue;
          g.fillStyle = Math.random() < 0.5 ? 'rgba(255,220,160,0.4)' : 'rgba(200,240,220,0.3)';
          g.fillRect(cx - s0 * 0.4 + k * s0 * 0.16, wy, Math.max(1, B * 0.006), 1);
        }
      }
      line(m, [cx - s1 / 2 - B * 0.003, yt, cx + s1 / 2 + B * 0.003, yt], 1, 1.8);
      line(m, [cx - s0 / 2, y, cx - s1 / 2, yt], 0.6, 1.4);
      line(m, [cx + s0 / 2, y, cx + s1 / 2, yt], 0.6, 1.4);
      m.globalAlpha = 0.13; poly(m, [cx - s0 / 2, y, cx - s1 / 2, yt, cx + s1 / 2, yt, cx + s0 / 2, y]); m.fill();
      line(fl, [cx - s0 / 2, y, cx - s1 / 2, yt, cx + s1 / 2, yt, cx + s0 / 2, y], 1, 1.6);
      fl.globalAlpha = 0.25; poly(fl, [cx - s0 / 2, y, cx - s1 / 2, yt, cx + s1 / 2, yt, cx + s0 / 2, y]); fl.fill();
      emitters.push({ x: cx - s1 / 2 - B * 0.003, y: yt, ang: up - 1.0, tier: i + 1, role: 'side', side: -1 });
      emitters.push({ x: cx + s1 / 2 + B * 0.003, y: yt, ang: up + 1.0, tier: i + 1, role: 'side', side: 1 });
      emitters.push({ x: cx, y: yt, ang: up, tier: i + 1, role: 'ledge', side: 0 });
      y = yt;
    }
    // top caps
    const caps = [[0.066, 0.034], [0.046, 0.028], [0.028, 0.02]];
    for (const [w, h] of caps) {
      const ww = B * w, hh = B * h;
      fill([cx - ww / 2, y, cx - ww / 2, y - hh, cx + ww / 2, y - hh, cx + ww / 2, y]);
      line(m, [cx - ww / 2, y - hh, cx + ww / 2, y - hh], 0.9, 1.5);
      line(fl, [cx - ww / 2, y, cx - ww / 2, y - hh, cx + ww / 2, y - hh, cx + ww / 2, y], 1, 1.4);
      y -= hh;
    }
    emitters.push({ x: cx - B * 0.033, y: y + B * 0.048, ang: up - 0.7, tier: 9, role: 'side', side: -1 });
    emitters.push({ x: cx + B * 0.033, y: y + B * 0.048, ang: up + 0.7, tier: 9, role: 'side', side: 1 });
    // spire
    g.fillStyle = bodyC;
    poly(g, [cx - B * 0.006, y, cx - 0.6, topY, cx + 0.6, topY, cx + B * 0.006, y]); g.fill();
    line(m, [cx, y, cx, topY], 0.7, 1.2);
    line(fl, [cx, y, cx, topY], 1, 1.2);
    emitters.push({ x: cx, y: topY, ang: up, tier: 10, role: 'top', side: 0 });
    tiers = 11;
  } else {
    const yAt = (f: number) => groundY - f * B;
    // legs: two outer hourglass legs + a straight centre leg / core
    const legW = Math.max(2, B * 0.012);
    g.strokeStyle = bodyC; g.lineCap = 'round';
    const leg = (s: number, c: CanvasRenderingContext2D, lw: number) => {
      c.lineWidth = lw;
      c.beginPath(); c.moveTo(cx + s * B * 0.115, groundY);
      c.quadraticCurveTo(cx + s * B * 0.03, yAt(0.22), cx + s * B * 0.022, yAt(0.36));
      c.quadraticCurveTo(cx + s * B * 0.02, yAt(0.55), cx + s * B * 0.055, yAt(0.705));
      c.stroke();
    };
    leg(-1, g, legW); leg(1, g, legW);
    g.lineWidth = legW * 0.8;
    g.beginPath(); g.moveTo(cx + B * 0.012, groundY); g.lineTo(cx + B * 0.006, yAt(0.7)); g.stroke();
    g.fillStyle = bodyC; g.fillRect(cx - B * 0.008, yAt(0.7), B * 0.012, B * 0.7);
    // cross bracing
    g.lineWidth = Math.max(1, legW * 0.4);
    for (const f of [0.12, 0.24, 0.48, 0.6]) {
      g.beginPath(); g.moveTo(cx - B * 0.06 * (f < 0.36 ? (0.36 - f) * 2.6 + 0.37 : (f - 0.36) * 2.4 + 0.37), yAt(f));
      g.lineTo(cx + B * 0.06 * (f < 0.36 ? (0.36 - f) * 2.6 + 0.37 : (f - 0.36) * 2.4 + 0.37), yAt(f)); g.stroke();
    }
    // waist ring
    g.fillRect(cx - B * 0.034, yAt(0.36) - B * 0.004, B * 0.068, B * 0.008);
    // elevator lights
    g.fillStyle = 'rgba(255,210,140,0.5)'; g.fillRect(cx - 1, yAt(0.66), 2, Math.max(2, B * 0.012));
    m.strokeStyle = '#fff';
    m.globalAlpha = 0.5; leg(-1, m, 1.3); leg(1, m, 1.3);
    fl.globalAlpha = 0.85; leg(-1, fl, 1.4); leg(1, fl, 1.4);
    line(fl, [cx - B * 0.034, yAt(0.36), cx + B * 0.034, yAt(0.36)], 1, 1.4);
    // saucer: flared halo underside, glazed restaurant ring, upper cap, roof dome
    const y70 = yAt(0.7), y745 = yAt(0.745), y77 = yAt(0.77), y80 = yAt(0.8), y84 = yAt(0.84);
    g.fillStyle = bodyC;
    poly(g, [cx - B * 0.045, y70, cx - B * 0.155, y745, cx + B * 0.155, y745, cx + B * 0.045, y70]); g.fill();
    g.fillRect(cx - B * 0.13, y745 - 0.5, B * 0.26, y77 - y745 + 1);
    poly(g, [cx - B * 0.145, y77, cx - B * 0.06, y80, cx + B * 0.06, y80, cx + B * 0.145, y77]); g.fill();
    poly(g, [cx - B * 0.05, y80, cx - B * 0.016, y84, cx + B * 0.016, y84, cx + B * 0.05, y80]); g.fill();
    // restaurant window band (warm) + halo rim lights
    for (let x = cx - B * 0.125; x < cx + B * 0.125; x += Math.max(2.5, B * 0.009)) {
      g.fillStyle = Math.random() < 0.8 ? 'rgba(255,214,150,0.55)' : 'rgba(255,240,220,0.3)';
      g.fillRect(x, y745 + (y77 - y745) * 0.3, Math.max(1, B * 0.005), Math.max(1, (y77 - y745) * 0.45));
    }
    g.fillStyle = 'rgba(255,240,220,0.35)';
    g.fillRect(cx - B * 0.155, y745 - 0.5, B * 0.31, 1);
    line(m, [cx - B * 0.155, y745, cx + B * 0.155, y745], 1, 1.8);
    line(m, [cx - B * 0.145, y77, cx - B * 0.06, y80, cx + B * 0.06, y80, cx + B * 0.145, y77], 0.9, 1.5);
    line(m, [cx - B * 0.05, y80, cx - B * 0.016, y84, cx + B * 0.016, y84, cx + B * 0.05, y80], 0.7, 1.3);
    line(m, [cx - B * 0.045, y70, cx - B * 0.155, y745], 0.5, 1.3);
    line(m, [cx + B * 0.045, y70, cx + B * 0.155, y745], 0.5, 1.3);
    m.globalAlpha = 0.14; m.fillRect(cx - B * 0.13, y745, B * 0.26, y77 - y745);
    line(fl, [cx - B * 0.045, y70, cx - B * 0.155, y745, cx + B * 0.155, y745, cx + B * 0.045, y70], 1, 1.6);
    fl.globalAlpha = 0.6; fl.fillRect(cx - B * 0.13, y745 + (y77 - y745) * 0.3, B * 0.26, (y77 - y745) * 0.45);
    line(fl, [cx - B * 0.145, y77, cx - B * 0.06, y80, cx + B * 0.06, y80, cx + B * 0.145, y77], 1, 1.4);
    // spire
    g.fillStyle = bodyC;
    poly(g, [cx - B * 0.006, y84, cx - 0.6, topY, cx + 0.6, topY, cx + B * 0.006, y84]); g.fill();
    line(m, [cx, y84, cx, topY], 0.7, 1.2);
    line(fl, [cx, y84, cx, topY], 1, 1.2);
    halfW = B * 0.155;
    // emitters: legs (3 levels), waist, saucer rim + deck, roof, spire tip
    const legX = (s: number, f: number) => {
      // approximate the leg curve x at height fraction f
      if (f <= 0.36) { const u = f / 0.36; return cx + s * B * ((1 - u) * (1 - u) * 0.115 + 2 * (1 - u) * u * 0.03 + u * u * 0.022); }
      const u = (f - 0.36) / 0.345; return cx + s * B * ((1 - u) * (1 - u) * 0.022 + 2 * (1 - u) * u * 0.02 + u * u * 0.055);
    };
    [0.1, 0.24, 0.5, 0.62].forEach((f, i) => {
      emitters.push({ x: legX(-1, f), y: yAt(f), ang: up - 1.15, tier: i, role: 'side', side: -1 });
      emitters.push({ x: legX(1, f), y: yAt(f), ang: up + 1.15, tier: i, role: 'side', side: 1 });
    });
    emitters.push({ x: cx, y: yAt(0.36) - 2, ang: up, tier: 2, role: 'ledge', side: 0 });
    emitters.push({ x: cx - B * 0.155, y: y745, ang: up - 1.25, tier: 4, role: 'side', side: -1 });
    emitters.push({ x: cx + B * 0.155, y: y745, ang: up + 1.25, tier: 4, role: 'side', side: 1 });
    for (const u of [-0.11, -0.055, 0, 0.055, 0.11]) emitters.push({ x: cx + u * B, y: y77 - 1, ang: up + u * 3, tier: 5, role: 'ledge', side: u < 0 ? -1 : u > 0 ? 1 : 0 });
    emitters.push({ x: cx, y: y84, ang: up, tier: 6, role: 'ledge', side: 0 });
    emitters.push({ x: cx, y: topY, ang: up, tier: 7, role: 'top', side: 0 });
    tiers = 8;
  }

  // ---------------- foreground ----------------
  fg.width = Math.round(W * dpr);
  fg.height = Math.max(1, Math.round((H - fgY0) * dpr));
  const f = fg.getContext('2d')!;
  f.setTransform(dpr, 0, 0, dpr, 0, -fgY0 * dpr);
  f.clearRect(0, fgY0, W, H);
  if (kind === 'tw101') {
    // street level: avenue lights and car light streaks
    f.fillStyle = '#040407'; f.fillRect(0, groundY, W, H - groundY);
    for (let x = 0; x < W; x += rand(5, 11)) {
      f.globalAlpha = rand(0.25, 0.7);
      f.fillStyle = Math.random() < 0.6 ? '#ffcf8a' : Math.random() < 0.5 ? '#ff5a4a' : '#e8f0ff';
      f.fillRect(x, groundY + rand(1, 6) * (H - groundY) / 40, rand(1, 4), 1);
    }
    f.globalAlpha = 1;
    line(m, [0, groundY + 1, W, groundY + 1], 0.35, 1.5);
  } else {
    // Elliott Bay: dark water with city glints + the waterfront Great Wheel
    const wg = f.createLinearGradient(0, groundY, 0, H);
    wg.addColorStop(0, '#05070c'); wg.addColorStop(1, '#010103');
    f.fillStyle = wg; f.fillRect(0, groundY, W, H - groundY);
    for (let i = 0; i < 70; i++) {
      const x = rand(0, W), y = groundY + rand(2, H - groundY);
      f.globalAlpha = rand(0.1, 0.35) * (1 - (y - groundY) / (H - groundY + 1));
      f.fillStyle = Math.random() < 0.7 ? '#ffd9a0' : '#bcd7ff';
      f.fillRect(x, y, rand(3, 12), 1);
      m.globalAlpha = 0.35; m.fillRect(x, y, rand(4, 14), 1);
    }
    f.globalAlpha = 1;
    // pier strip
    f.fillStyle = '#06070b'; f.fillRect(0, groundY - 2, W, 3);
    const wx = wide ? W * 0.9 : W * 0.86, wr = B * (wide ? 0.08 : 0.075), wy = groundY - wr - 3;
    f.strokeStyle = '#05060a'; f.lineWidth = 1.6;
    f.beginPath(); f.arc(wx, wy, wr, 0, Math.PI * 2); f.stroke();
    f.lineWidth = 0.7;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      f.beginPath(); f.moveTo(wx, wy); f.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); f.stroke();
    }
    f.lineWidth = 1.6;
    f.beginPath(); f.moveTo(wx - wr * 0.5, groundY); f.lineTo(wx, wy); f.lineTo(wx + wr * 0.5, groundY); f.stroke();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      f.fillStyle = k % 2 ? 'rgba(160,200,255,0.55)' : 'rgba(255,255,255,0.45)';
      f.fillRect(wx + Math.cos(a) * wr - 0.6, wy + Math.sin(a) * wr - 0.6, 1.3, 1.3);
    }
    m.strokeStyle = '#fff'; m.globalAlpha = 0.45; m.lineWidth = 1.2;
    m.beginPath(); m.arc(wx, wy, wr, 0, Math.PI * 2); m.stroke();
    lamps.push({ x: wx, y: wy });
  }
  m.globalAlpha = 1; fl.globalAlpha = 1;
  void U; void landTop;

  return {
    fgY0, maskY0, lamps, tower: { x: cx, y: topY + 1 },
    kind, emitters, tiers, topX: cx, topY, cx, halfW,
    flash, flashX0: fx0, flashY0: fy0,
  };
}
