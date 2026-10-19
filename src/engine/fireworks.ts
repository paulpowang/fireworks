import { Sfx } from './audio';
import { THEMES, type ShellType, type Theme, type ThemeId } from './themes';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[(Math.random() * arr.length) | 0];

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w = 1, h = 1) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

// ---------- sprites ----------
const spriteCache = new Map<string, HTMLCanvasElement>();
function dotSprite(color: string) {
  const key = 'd' + color;
  let s = spriteCache.get(key);
  if (s) return s;
  const S = 32;
  s = makeCanvas(S, S);
  const g = s.getContext('2d')!;
  const [r, gg, b] = hexRgb(color);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, `rgba(${Math.min(255, r + 120)},${Math.min(255, gg + 120)},${Math.min(255, b + 120)},1)`);
  grad.addColorStop(0.28, `rgba(${r},${gg},${b},0.85)`);
  grad.addColorStop(0.55, `rgba(${r},${gg},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  spriteCache.set(key, s);
  return s;
}
function puffSprite(color: string) {
  const key = 'p' + color;
  let s = spriteCache.get(key);
  if (s) return s;
  const S = 64;
  s = makeCanvas(S, S);
  const g = s.getContext('2d')!;
  const [r, gg, b] = hexRgb(color);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
  grad.addColorStop(0.5, `rgba(${r},${gg},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  spriteCache.set(key, s);
  return s;
}

// ---------- particles ----------
const enum Kind {
  Normal = 0,
  Ember = 1,
  SubBreak = 2, // multi-break: explodes into small peony
  SenrinSub = 3, // senrin: explodes into mini sphere
  Glitter = 4, // strobe, may crackle at end
}

class P {
  x = 0; y = 0; vx = 0; vy = 0;
  age = 0; life = 1;
  size = 2; drag = 2; grav = 1; hold = 0;
  alpha = 1; flicker = 0; phase = 0;
  sprite!: HTMLCanvasElement;
  color = '#fff';
  kind: Kind = Kind.Normal;
  trail = 0; trailAcc = 0; trailLife = 0.5; trailSize = 1; trailGrav = 0.3;
  pal: string[] | null = null;
}

interface Rocket {
  sx: number; sy: number; tx: number; ty: number;
  x: number; y: number; t: number; T: number;
  type: ShellType; pal: string[]; acc: number; wob: number;
}
interface Fan { x: number; y: number; t: number; next: number; wave: number; waves: number; pal: string[] }
interface Puff { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number; a: number }
interface Light { x: number; y: number; color: string; i: number }
interface Star { x: number; y: number; r: number; a: number; ph: number; sp: number }
interface Timed { t: number; fn: () => void }

export interface Quality { dpr: number; cap: number; strip: number; bloom: boolean }

export class Fireworks {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sfx: Sfx;
  private fx = makeCanvas();
  private fxc: CanvasRenderingContext2D;
  private b1 = makeCanvas();
  private b1c: CanvasRenderingContext2D;
  private b2 = makeCanvas();
  private b2c: CanvasRenderingContext2D;
  private refl = makeCanvas();
  private reflc: CanvasRenderingContext2D;
  private sky = makeCanvas();
  private land = makeCanvas();

  W = 1; H = 1; U = 1; dpr = 1;
  landTop = 0; waterY = 0;
  private parts: P[] = [];
  private n = 0;
  private rockets: Rocket[] = [];
  private fans: Fan[] = [];
  private puffs: Puff[] = [];
  private lights: Light[] = [];
  private stars: Star[] = [];
  private timed: Timed[] = [];
  private time = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  theme: Theme = THEMES[0];
  shell: ShellType | 'random' = 'senrin';
  mirror = false;
  auto = false;
  private autoNext = 0;
  private textPts: [number, number][] = [];
  private lastVib = 0;

  // perf
  private qLevel = 0;
  private quality: Quality;
  private emaDt = 1 / 60;
  private slowFor = 0;
  private lastQChange = 0;
  onQuality?: (q: number) => void;

  // pointer
  private drag: { x: number; y: number; dist: number; count: number; id: number } | null = null;
  onInteract?: () => void;

  constructor(canvas: HTMLCanvasElement, sfx: Sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.sfx = sfx;
    this.fxc = this.fx.getContext('2d')!;
    this.b1c = this.b1.getContext('2d')!;
    this.b2c = this.b2.getContext('2d')!;
    this.reflc = this.refl.getContext('2d')!;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.qLevel = coarse ? 1 : 0;
    this.quality = this.qualityFor(this.qLevel);
    for (let i = 0; i < 7000; i++) this.parts.push(new P());
    this.setText('煙火');
    this.resize();
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  private qualityFor(l: number): Quality {
    const d = window.devicePixelRatio || 1;
    if (l <= 0) return { dpr: Math.min(d, 2), cap: 6500, strip: 3, bloom: true };
    if (l === 1) return { dpr: Math.min(d, 1.6), cap: 4200, strip: 3, bloom: true };
    if (l === 2) return { dpr: Math.min(d, 1.25), cap: 2800, strip: 4, bloom: true };
    return { dpr: 1, cap: 1800, strip: 5, bloom: false };
  }
  /** particle-count multiplier for current quality */
  private get q() {
    return Math.min(1, this.quality.cap / 5000) * 0.35 + 0.65 * Math.min(1, this.quality.cap / 6500);
  }

  // ---------- setup ----------
  resize = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = this.quality.dpr;
    this.W = W; this.H = H; this.dpr = dpr;
    this.U = Math.min(W, H * 0.62) / 400;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    // portrait: land strip around 52-58%; landscape a bit lower
    const portrait = H >= W;
    this.landTop = H * (portrait ? 0.505 : 0.6);
    this.waterY = H * (portrait ? 0.575 : 0.68);
    this.fx.width = Math.round(W * dpr);
    this.fx.height = Math.round(this.waterY * dpr);
    this.b1.width = Math.ceil(this.fx.width / 4 / dpr * 1);
    this.b1.height = Math.ceil(this.fx.height / 4 / dpr * 1);
    this.b2.width = Math.ceil(this.b1.width / 2);
    this.b2.height = Math.ceil(this.b1.height / 2);
    const rs = 0.5;
    this.refl.width = Math.ceil(W * rs);
    this.refl.height = Math.ceil((H - this.waterY) * rs);
    this.buildSky();
    this.buildLand();
    this.stars = [];
    const ns = Math.round((W * this.landTop) / 2600);
    for (let i = 0; i < ns; i++)
      this.stars.push({ x: Math.random() * W, y: Math.random() * this.landTop * 0.95, r: rand(0.4, 1.3), a: rand(0.15, 0.7), ph: rand(0, TAU), sp: rand(0.6, 2.6) });
  };

  private buildSky() {
    const { W, waterY, dpr } = this;
    this.sky.width = Math.round(W * dpr);
    this.sky.height = Math.round(waterY * dpr);
    const g = this.sky.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = g.createLinearGradient(0, 0, 0, waterY);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.55, '#020208');
    grad.addColorStop(1, this.theme.horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, waterY);
  }

  private buildLand() {
    const { W, landTop, waterY, dpr, U } = this;
    const h = waterY;
    this.land.width = Math.round(W * dpr);
    this.land.height = Math.round(h * dpr);
    const g = this.land.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, h);
    // far hills
    g.fillStyle = '#07080f';
    g.beginPath();
    g.moveTo(0, waterY);
    const seed = Math.random() * 100;
    for (let x = 0; x <= W + 8; x += 8) {
      const y = landTop + 10 * U + Math.sin(x * 0.006 + seed) * 9 * U + Math.sin(x * 0.017 + seed * 2) * 5 * U;
      g.lineTo(x, y);
    }
    g.lineTo(W, waterY);
    g.closePath();
    g.fill();
    // near shore: low buildings / trees
    g.fillStyle = '#030306';
    g.beginPath();
    g.moveTo(0, waterY);
    let x = 0;
    while (x < W) {
      const bw = rand(6, 22) * U;
      const bh = Math.random() < 0.15 ? rand(18, 34) * U : rand(4, 14) * U;
      g.lineTo(x, waterY - bh);
      g.lineTo(x + bw, waterY - bh);
      x += bw;
    }
    g.lineTo(W, waterY);
    g.closePath();
    g.fill();
    // a lit tower
    const tx = W * rand(0.62, 0.8);
    g.fillStyle = '#040408';
    g.fillRect(tx, waterY - 52 * U, 4 * U, 52 * U);
    g.fillStyle = 'rgba(255,60,60,0.9)';
    g.fillRect(tx + 1 * U, waterY - 54 * U, 2 * U, 2 * U);
    // shore lights / windows
    for (let i = 0; i < W / 9; i++) {
      const lx = Math.random() * W;
      const ly = waterY - rand(1, 9) * U;
      g.fillStyle = pick(['rgba(255,210,140,', 'rgba(255,240,210,', 'rgba(140,200,255,']) + rand(0.25, 0.8) + ')';
      g.fillRect(lx, ly, rand(0.8, 1.8) * U, rand(0.8, 1.4) * U);
    }
    // shoreline line
    g.fillStyle = 'rgba(255,190,120,0.18)';
    g.fillRect(0, waterY - 1, W, 1);
  }

  setTheme(id: ThemeId) {
    this.theme = THEMES.find((t) => t.id === id) || THEMES[0];
    this.buildSky();
  }

  setText(text: string) {
    const t = (text || '煙火').slice(0, 8);
    const fs = 90;
    const c = makeCanvas(fs * t.length * 1.15 + 20, fs * 1.3);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#fff';
    g.font = `900 ${fs}px "PingFang TC","Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei","Noto Serif CJK TC",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, c.width / 2, c.height / 2);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let step = 3;
    let pts: [number, number][] = [];
    for (;;) {
      pts = [];
      for (let y = 0; y < c.height; y += step)
        for (let x = 0; x < c.width; x += step) if (data[(y * c.width + x) * 4 + 3] > 140) pts.push([x, y]);
      if (pts.length <= 420 || step > 12) break;
      step++;
    }
    if (!pts.length) return;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const s = Math.max(maxX - minX, (maxY - minY) * 1.6) / 2 || 1;
    this.textPts = pts.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
  }

  // ---------- loop ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.1) dt = 0.1; // tab switch etc.
      this.perf(dt);
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private perf(dt: number) {
    this.emaDt += (dt - this.emaDt) * 0.05;
    if (this.emaDt > 1 / 48) this.slowFor += dt;
    else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    if (this.slowFor > 1.5 && this.qLevel < 3 && this.time - this.lastQChange > 3) {
      this.qLevel++;
      this.quality = this.qualityFor(this.qLevel);
      this.lastQChange = this.time;
      this.slowFor = 0;
      this.resize();
      this.onQuality?.(this.qLevel);
    }
  }

  get fps() {
    return Math.round(1 / this.emaDt);
  }
  get particleCount() {
    return this.n;
  }

  // ---------- pointer ----------
  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.onInteract?.();
    this.drag = { x: e.clientX, y: e.clientY, dist: 0, count: 0, id: e.pointerId };
    this.launch(e.clientX, e.clientY);
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.dist += Math.hypot(dx, dy);
    d.x = e.clientX; d.y = e.clientY;
    const spacing = 42 * this.U;
    if (d.dist > spacing && d.count < 14) {
      d.dist = 0;
      d.count++;
      this.launch(e.clientX, e.clientY, undefined, 0.85);
    }
  };
  private onUp = (e: PointerEvent) => {
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
  };

  // ---------- spawning ----------
  private spawn(): P | null {
    if (this.n >= this.quality.cap) return null;
    const p = this.parts[this.n++];
    p.age = 0; p.hold = 0; p.alpha = 1; p.flicker = 0; p.phase = Math.random() * TAU;
    p.kind = Kind.Normal; p.trail = 0; p.trailAcc = 0; p.pal = null; p.grav = 1;
    return p;
  }

  private randomType(): ShellType {
    const w = this.theme.weights;
    const entries = Object.entries(w) as [ShellType, number][];
    let total = 0;
    for (const [, v] of entries) total += v;
    let r = Math.random() * total;
    for (const [k, v] of entries) {
      r -= v;
      if (r <= 0) return k;
    }
    return 'peony';
  }

  /** launch a shell aimed at screen point (x,y) */
  launch(x: number, y: number, type?: ShellType, sizeMul = 1) {
    let t: ShellType = type ?? (this.shell === 'random' ? this.randomType() : this.shell);
    const { W, U } = this;
    if (this.mirror && x > W / 2) x = W - x;
    if (t === 'fan') {
      this.fans.push({ x, y: this.waterY - 4 * U, t: 0, next: 0, wave: 0, waves: 3, pal: pick(this.theme.palettes), });
      this.sfx.launch((x / W) * 2 - 1, 0.5);
      return;
    }
    const minY = 60 * U;
    const maxY = this.landTop - 70 * U;
    const ty = Math.max(minY, Math.min(maxY, y));
    const tx = Math.max(20, Math.min(W - 20, x + rand(-6, 6)));
    const sx = Math.max(10, Math.min(W - 10, tx + rand(-0.06, 0.06) * W));
    const sy = this.waterY - 3 * U;
    const T = 0.75 + ((sy - ty) / this.H) * 0.9 + rand(-0.05, 0.1);
    const pal = pick(this.theme.palettes);
    this.rockets.push({ sx, sy, tx, ty, x: sx, y: sy, t: 0, T, type: t, pal, acc: 0, wob: rand(0, TAU) });
    void sizeMul;
    this.sfx.launch((tx / W) * 2 - 1, T);
  }

  private addLight(x: number, y: number, color: string, i: number) {
    if (this.lights.length > 10) this.lights.shift();
    this.lights.push({ x, y, color, i });
    if (this.mirror) this.lights.push({ x: this.W - x, y, color, i });
  }

  private addSmoke(x: number, y: number, n: number, spread: number) {
    const { U } = this;
    n = Math.round(n * this.theme.smokeAmount);
    for (let k = 0; k < n; k++) {
      if (this.puffs.length > 70) this.puffs.shift();
      const p: Puff = {
        x: x + rand(-spread, spread) * U, y: y + rand(-spread, spread) * 0.7 * U,
        vx: rand(-4, 10) * U, vy: rand(-3, 2) * U,
        r: rand(25, 55) * U, age: 0, life: rand(7, 12), a: rand(0.5, 1),
      };
      this.puffs.push(p);
      if (this.mirror) this.puffs.push({ ...p, x: this.W - p.x, vx: -p.vx });
    }
  }

  private vibrate(ms: number) {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (!nav.vibrate) return;
    const now = performance.now();
    if (now - this.lastVib < 110) return;
    this.lastVib = now;
    try { nav.vibrate(ms); } catch { /* ignore */ }
  }

  /** sphere-ish velocity (projected 3D unit vector) */
  private sph(speed: number): [number, number] {
    const z = rand(-1, 1);
    const th = rand(0, TAU);
    const r = Math.sqrt(1 - z * z);
    const s = speed * rand(0.9, 1.05);
    return [Math.cos(th) * r * s, Math.sin(th) * r * s];
  }

  private sphere(x: number, y: number, n: number, R: number, opts: {
    drag?: number; life?: [number, number]; size?: number; colors: string[]; kind?: Kind; trail?: number; trailLife?: number;
    grav?: number; flicker?: number; vx?: number; vy?: number; pal?: string[]; alpha?: number;
  }) {
    const drag = opts.drag ?? 2.6;
    const speed = R * drag;
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const [vx, vy] = this.sph(speed);
      p.x = x; p.y = y; p.vx = vx + (opts.vx ?? 0); p.vy = vy + (opts.vy ?? 0);
      p.drag = drag;
      p.life = rand(opts.life?.[0] ?? 1.3, opts.life?.[1] ?? 2.0);
      p.size = (opts.size ?? 2) * this.U;
      p.color = opts.colors[i % opts.colors.length];
      p.sprite = dotSprite(p.color);
      p.kind = opts.kind ?? Kind.Normal;
      p.grav = opts.grav ?? 1;
      p.flicker = opts.flicker ?? 0;
      p.pal = opts.pal ?? null;
      p.alpha = opts.alpha ?? 1;
      if (opts.trail) { p.trail = opts.trail; p.trailLife = opts.trailLife ?? 0.4; p.trailSize = 0.6; p.trailGrav = 0.3; }
    }
  }

  private burst(type: ShellType, x: number, y: number, pal: string[]) {
    const { U, W } = this;
    const q = this.q;
    const pan = (x / W) * 2 - 1;
    const th = this.theme;
    let boom = 0.8;
    switch (type) {
      case 'peony': {
        const R = rand(70, 100) * U;
        this.sphere(x, y, Math.round(130 * q), R, { colors: pal.slice(0, 2), life: [1.3, 2.0], size: 2.2, flicker: 0.3 });
        if (Math.random() < 0.5) this.sphere(x, y, Math.round(40 * q), R * 0.45, { colors: [pal[2] ?? '#fff'], life: [1.0, 1.5], size: 1.8 });
        break;
      }
      case 'chrysanthemum': {
        const R = rand(75, 105) * U;
        this.sphere(x, y, Math.round(100 * q), R, { colors: pal.slice(0, 2), life: [1.4, 2.1], size: 2, trail: 22, trailLife: 0.45, flicker: 0.2 });
        break;
      }
      case 'willow': {
        const R = rand(80, 105) * U;
        this.sphere(x, y, Math.round(70 * q), R, {
          colors: ['#ffcf70', '#ffb347'], drag: 1.9, life: [3.0, 3.9], size: 2, grav: 1.3, trail: 18, trailLife: 1.1, flicker: 0.4,
        });
        boom = 1;
        break;
      }
      case 'heart': {
        const R = rand(70, 90) * U;
        const n = Math.round(90 * q);
        const drag = 2.8;
        const rot = rand(-0.25, 0.25);
        for (let i = 0; i < n; i++) {
          const t = (i / n) * TAU;
          let hx = 16 * Math.sin(t) ** 3;
          let hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          hx /= 17; hy = hy / 17 + 0.15;
          const rx = hx * Math.cos(rot) - hy * Math.sin(rot), ry = hx * Math.sin(rot) + hy * Math.cos(rot);
          const p = this.spawn(); if (!p) break;
          p.x = x; p.y = y; p.vx = rx * R * drag; p.vy = ry * R * drag; p.drag = drag;
          p.life = rand(1.6, 2.1); p.size = 2.2 * U; p.color = pal[0]; p.sprite = dotSprite(p.color);
          p.grav = 0.5; p.hold = 0.9; p.flicker = 0.2;
        }
        this.sphere(x, y, Math.round(20 * q), R * 0.25, { colors: [pal[1] ?? '#fff'], life: [0.8, 1.2], size: 1.6 });
        break;
      }
      case 'ring': {
        const R = rand(75, 100) * U;
        const n = Math.round(72 * q);
        const tilt = rand(0.2, 1.2), rot = rand(0, TAU), drag = 2.6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const cx = Math.cos(a), cy = Math.sin(a) * Math.cos(tilt);
          const rx = cx * Math.cos(rot) - cy * Math.sin(rot), ry = cx * Math.sin(rot) + cy * Math.cos(rot);
          const p = this.spawn(); if (!p) break;
          p.x = x; p.y = y; p.vx = rx * R * drag; p.vy = ry * R * drag; p.drag = drag;
          p.life = rand(1.5, 1.9); p.size = 2.2 * U; p.color = pal[i % 2 ? 0 : 1] ?? pal[0]; p.sprite = dotSprite(p.color);
          p.grav = 0.7; p.flicker = 0.25;
        }
        this.sphere(x, y, Math.round(26 * q), R * 0.3, { colors: [pal[2] ?? '#fff'], life: [0.9, 1.3], size: 1.6 });
        break;
      }
      case 'multibreak': {
        const R = rand(55, 75) * U;
        const other = pick(th.palettes);
        this.sphere(x, y, Math.round(14 * Math.max(0.7, q)), R, { colors: [pal[0]], drag: 2.2, life: [0.6, 0.9], size: 2.4, kind: Kind.SubBreak, trail: 14, trailLife: 0.3, pal: other });
        this.sphere(x, y, Math.round(30 * q), R * 0.4, { colors: [pal[1] ?? pal[0]], life: [0.8, 1.1], size: 1.8 });
        boom = 0.7;
        break;
      }
      case 'crackle': {
        const R = rand(80, 100) * U;
        const cols = Math.random() < 0.5 ? th.glitter : [...th.glitter, pal[0]];
        this.sphere(x, y, Math.round(140 * q), R, { colors: cols, life: [1.3, 2.1], size: 1.8, kind: Kind.Glitter, grav: 0.9 });
        this.sfx.crackle(pan, 1.0);
        break;
      }
      case 'text': {
        const pts = this.textPts;
        const halfW = Math.min(W * 0.42, 190 * U);
        const drag = 3.2;
        const cols = pal.slice(0, 2);
        const stride = pts.length > 420 * q ? Math.ceil(pts.length / (420 * q)) : 1;
        for (let i = 0; i < pts.length; i += stride) {
          const p = this.spawn(); if (!p) break;
          const [px, py] = pts[i];
          p.x = x; p.y = y; p.vx = px * halfW * drag * rand(0.98, 1.02); p.vy = py * halfW * drag * rand(0.98, 1.02);
          p.drag = drag; p.life = rand(2.4, 2.9); p.size = 1.9 * U;
          p.color = cols[i % cols.length]; p.sprite = dotSprite(p.color); p.grav = 0.6; p.hold = 1.2; p.flicker = 0.15;
        }
        break;
      }
      case 'senrin':
      default: {
        // Senrin (千輪): many small submunitions, each popping into a tiny sphere
        const n = Math.round(rand(22, 32) * Math.max(0.6, q));
        const R = rand(70, 95) * U;
        const drag = 2.4;
        const cols = pal;
        for (let i = 0; i < n; i++) {
          const p = this.spawn(); if (!p) break;
          const [vx, vy] = this.sph(R * drag * rand(0.35, 1));
          p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.drag = drag;
          p.life = rand(0.45, 1.25); p.size = 1.2 * U;
          p.color = '#ffd9a0'; p.sprite = dotSprite(p.color);
          p.kind = Kind.SenrinSub; p.pal = cols; p.grav = 0.6;
          p.trail = 9; p.trailLife = 0.25; p.trailSize = 0.5; p.trailGrav = 0.2;
        }
        boom = 0.75;
        break;
      }
    }
    this.sfx.boom(boom, pan);
    this.vibrate(type === 'willow' || type === 'peony' ? 30 : 18);
    this.addLight(x, y, pal[0], type === 'senrin' ? 0.8 : 1);
    this.addSmoke(x, y, type === 'senrin' ? 4 : 3, 40);
  }

  private subBurst(p: P) {
    const { U } = this;
    const pal = p.pal ?? this.theme.palettes[0];
    const pan = (p.x / this.W) * 2 - 1;
    if (p.kind === Kind.SenrinSub) {
      const c = pick(pal);
      const R = rand(15, 26) * U;
      this.sphere(p.x, p.y, Math.round(rand(20, 30) * this.q), R, {
        colors: [c, c, pal[(pal.indexOf(c) + 1) % pal.length]], drag: 3, life: [0.9, 1.5], size: 1.25, grav: 0.6, flicker: 0.5, alpha: 0.8,
        vx: p.vx * 0.3, vy: p.vy * 0.3,
      });
      this.sfx.pop(pan);
      if (Math.random() < 0.25) this.addLight(p.x, p.y, c, 0.25);
      if (Math.random() < 0.15) this.addSmoke(p.x, p.y, 1, 10);
    } else if (p.kind === Kind.SubBreak) {
      const R = rand(28, 38) * U;
      this.sphere(p.x, p.y, Math.round(32 * this.q), R, { colors: pal.slice(0, 2), life: [0.9, 1.4], size: 1.9, flicker: 0.3 });
      this.sfx.pop(pan);
      this.addLight(p.x, p.y, pal[0], 0.35);
    } else if (p.kind === Kind.Glitter && Math.random() < 0.3) {
      for (let k = 0; k < 3; k++) {
        const c = this.spawn(); if (!c) break;
        const a = rand(0, TAU), s = rand(20, 60) * U;
        c.x = p.x; c.y = p.y; c.vx = Math.cos(a) * s; c.vy = Math.sin(a) * s; c.drag = 4;
        c.life = rand(0.08, 0.18); c.size = 1.6 * U; c.color = '#ffffff'; c.sprite = dotSprite('#ffffff'); c.grav = 0;
      }
    }
  }

  // ---------- show ----------
  setAuto(on: boolean) {
    this.auto = on;
    this.autoNext = 0.2;
  }

  finale() {
    const { W, H, U } = this;
    const types = this.theme.finale;
    const t0 = this.time;
    const N = 34;
    for (let i = 0; i < N; i++) {
      const at = t0 + (i / N) * 5.5 + rand(0, 0.15);
      this.timed.push({ t: at, fn: () => this.launch(rand(0.12, 0.88) * W, rand(0.1, 0.38) * H, pick(types)) });
    }
    // closing salvo
    for (let k = 0; k < 7; k++)
      this.timed.push({ t: t0 + 6.2 + k * 0.08, fn: () => this.launch(((k + 0.5) / 7) * W, rand(0.12, 0.3) * H + 10 * U, k % 2 ? 'crackle' : 'senrin') });
  }

  // ---------- update ----------
  private update(dt: number) {
    this.time += dt;
    const { U, W, H } = this;
    const G = 60 * U;

    // timed events
    if (this.timed.length) {
      const due = this.timed.filter((e) => e.t <= this.time);
      if (due.length) {
        this.timed = this.timed.filter((e) => e.t > this.time);
        due.forEach((e) => e.fn());
      }
    }

    // auto show
    if (this.auto) {
      this.autoNext -= dt;
      if (this.autoNext <= 0) {
        const r = Math.random();
        if (r < 0.15) {
          const t = this.randomType();
          const n = 3;
          for (let k = 0; k < n; k++) this.timed.push({ t: this.time + k * 0.12, fn: () => this.launch(((k + 1) / (n + 1)) * W + rand(-20, 20), rand(0.12, 0.35) * H, t) });
          this.autoNext = rand(1.4, 2.2);
        } else {
          this.launch(rand(0.12, 0.88) * W, rand(0.1, 0.4) * H, this.randomType());
          this.autoNext = rand(0.35, 1.1);
        }
      }
    }

    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      const u = Math.min(1, r.t / r.T);
      const e = 1 - (1 - u) * (1 - u);
      r.x = r.sx + (r.tx - r.sx) * e + Math.sin(r.t * 18 + r.wob) * 0.6 * U;
      r.y = r.sy + (r.ty - r.sy) * e;
      r.acc += dt * 70;
      while (r.acc >= 1) {
        r.acc--;
        const p = this.spawn(); if (!p) break;
        p.x = r.x + rand(-0.6, 0.6) * U; p.y = r.y + rand(0, 2) * U; p.vx = rand(-6, 6) * U; p.vy = rand(5, 25) * U;
        p.drag = 3; p.life = rand(0.25, 0.55) * (1 - u * 0.5); p.size = rand(0.7, 1.2) * U;
        p.color = '#ffc477'; p.sprite = dotSprite(p.color); p.kind = Kind.Ember; p.grav = 0.4; p.alpha = 0.7;
      }
      if (u >= 1) {
        this.rockets.splice(i, 1);
        this.burst(r.type, r.x, r.y, r.pal);
      }
    }

    // fans (ground rays)
    for (let i = this.fans.length - 1; i >= 0; i--) {
      const f = this.fans[i];
      f.t += dt;
      if (f.t >= f.next && f.wave < f.waves) {
        const rays = 9;
        const spreadA = 0.95;
        for (let k = 0; k < rays; k++) {
          const a = -Math.PI / 2 + (k / (rays - 1) - 0.5) * 2 * spreadA * (0.75 + f.wave * 0.12);
          const p = this.spawn(); if (!p) break;
          const s = rand(330, 380) * U;
          p.x = f.x; p.y = f.y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
          p.drag = 1.1; p.life = rand(1.2, 1.5); p.size = 2 * U;
          p.color = f.pal[k % f.pal.length]; p.sprite = dotSprite(p.color); p.grav = 1.2;
          p.trail = 45; p.trailLife = 0.5; p.trailSize = 0.75; p.trailGrav = 0.2;
        }
        this.sfx.pop((f.x / W) * 2 - 1);
        this.addLight(f.x, f.y - 40 * U, f.pal[0], 0.6);
        this.vibrate(12);
        f.wave++;
        f.next = f.t + 0.35;
      }
      if (f.wave >= f.waves) {
        this.fans.splice(i, 1);
        this.addSmoke(f.x, f.y - 30 * U, 2, 30);
      }
    }

    // particles
    for (let i = 0; i < this.n; i++) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.kind === Kind.SenrinSub || p.kind === Kind.SubBreak || p.kind === Kind.Glitter) this.subBurst(p);
        // swap-remove
        const lastIdx = --this.n;
        if (i !== lastIdx) {
          const tmp = this.parts[i];
          this.parts[i] = this.parts[lastIdx];
          this.parts[lastIdx] = tmp;
        }
        i--;
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      const g = p.hold > 0 && p.age < p.hold ? 0.08 : p.grav;
      p.vy += G * g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.trail > 0) {
        p.trailAcc += p.trail * dt;
        while (p.trailAcc >= 1) {
          p.trailAcc--;
          const e = this.spawn(); if (!e) break;
          e.x = p.x; e.y = p.y; e.vx = p.vx * 0.05 + rand(-3, 3) * U; e.vy = p.vy * 0.05 + rand(-2, 4) * U;
          e.drag = 2.5; e.life = p.trailLife * rand(0.6, 1.1); e.size = p.size * p.trailSize;
          e.color = p.color; e.sprite = p.sprite; e.kind = Kind.Ember; e.grav = p.trailGrav; e.alpha = 0.55; e.flicker = 0.5;
        }
      }
    }

    // lights
    for (let i = this.lights.length - 1; i >= 0; i--) {
      this.lights[i].i *= Math.exp(-dt * 2.2);
      if (this.lights[i].i < 0.02) this.lights.splice(i, 1);
    }
    // smoke
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const s = this.puffs[i];
      s.age += dt;
      if (s.age > s.life) { this.puffs.splice(i, 1); continue; }
      s.x += (s.vx + 5 * U) * dt; s.y += (s.vy - 2 * U) * dt; s.r += 5 * U * dt;
    }
  }

  // ---------- render ----------
  private render() {
    const { ctx, W, H, dpr, U, waterY, time } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // sky
    ctx.drawImage(this.sky, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // stars
    ctx.fillStyle = '#dfe6ff';
    for (const s of this.stars) {
      ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(time * s.sp + s.ph));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // sky/horizon glow from bursts
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      const [r, g, b] = hexRgb(l.color);
      const rad = 230 * U;
      const gr = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, rad);
      gr.addColorStop(0, `rgba(${r},${g},${b},${0.13 * l.i})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(l.x - rad, l.y - rad, rad * 2, rad * 2);
      const hr = W * 0.7;
      const hg = ctx.createRadialGradient(l.x, waterY, 0, l.x, waterY, hr);
      hg.addColorStop(0, `rgba(${r},${g},${b},${0.2 * l.i})`);
      hg.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(l.x - hr, waterY - hr * 0.6, hr * 2, hr * 0.6);
    }
    // smoke
    this.renderSmoke();

    // fx layer: fade (motion blur) then particles
    const fc = this.fxc;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    if (this.n === 0 && this.rockets.length === 0) {
      fc.clearRect(0, 0, this.fx.width, this.fx.height);
    } else {
      fc.globalCompositeOperation = 'destination-out';
      fc.globalAlpha = 1;
      fc.fillStyle = 'rgba(0,0,0,0.28)';
      fc.fillRect(0, 0, this.fx.width, this.fx.height);
    }
    fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    fc.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const p = this.parts[i];
      const u = p.age / p.life;
      let a = p.alpha * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
      if (p.kind === Kind.Glitter) {
        a *= Math.sin(p.age * 38 + p.phase) > 0.2 ? 1 : 0.08;
      } else if (p.flicker > 0 && u > 0.45) {
        a *= 1 - p.flicker * Math.random();
      }
      if (a <= 0.01) continue;
      fc.globalAlpha = a > 1 ? 1 : a;
      const s = p.size * 2.0 * (p.kind === Kind.Ember ? 1 : 1 - u * 0.35);
      fc.drawImage(p.sprite, p.x - s, p.y - s, s * 2, s * 2);
    }
    // rocket heads
    for (const r of this.rockets) {
      fc.globalAlpha = 1;
      const s = 4 * U;
      fc.drawImage(dotSprite('#fff1c8'), r.x - s, r.y - s, s * 2, s * 2);
    }
    fc.globalAlpha = 1;

    // composite fx + bloom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    this.drawLayer(this.fx, 1);
    if (this.quality.bloom) {
      this.b1c.globalCompositeOperation = 'copy';
      this.b1c.drawImage(this.fx, 0, 0, this.b1.width, this.b1.height);
      this.b2c.globalCompositeOperation = 'copy';
      this.b2c.drawImage(this.b1, 0, 0, this.b2.width, this.b2.height);
      this.drawLayer(this.b1, 0.4);
      this.drawLayer(this.b2, 0.6);
    }
    // land silhouette
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.land, 0, 0);

    // reflection snapshot (flip area above waterline)
    const rc = this.reflc;
    const rw = this.refl.width, rh = this.refl.height;
    const reflH = H - waterY;
    const srcTop = Math.max(0, waterY - reflH);
    const srcH = waterY - srcTop;
    rc.setTransform(1, 0, 0, -1, 0, rh);
    rc.globalCompositeOperation = 'copy';
    rc.drawImage(this.canvas, 0, srcTop * dpr, W * dpr, srcH * dpr, 0, rh - (srcH / reflH) * rh, rw, (srcH / reflH) * rh);
    rc.setTransform(1, 0, 0, 1, 0, 0);

    // water
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wg = ctx.createLinearGradient(0, waterY, 0, H);
    wg.addColorStop(0, '#05060c');
    wg.addColorStop(1, '#000000');
    ctx.fillStyle = wg;
    ctx.fillRect(0, waterY, W, H - waterY);
    ctx.globalCompositeOperation = 'lighter';
    const strip = this.quality.strip;
    const rsY = rh / reflH;
    for (let d = 0; d < reflH; d += strip) {
      const depth = d / reflH;
      const amp = (1.2 + d * 0.06) * U;
      const off = Math.sin(time * 1.3 + d * 0.09) * amp + Math.sin(time * 2.3 + d * 0.27) * amp * 0.5;
      const stretch = 1 + depth * 0.08;
      const band = 0.85 + 0.15 * Math.sin(d * 0.35 - time * 2.2);
      ctx.globalAlpha = (0.6 - depth * 0.3) * band;
      const sy = d * 0.92 * rsY;
      ctx.drawImage(this.refl, 0, sy, rw, Math.max(1, strip * rsY), off - (stretch - 1) * W * 0.5, waterY + d, W * stretch, strip * 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // subtle shoreline mist
    const mg = ctx.createLinearGradient(0, waterY - 6 * U, 0, waterY + 10 * U);
    mg.addColorStop(0, 'rgba(0,0,0,0)');
    mg.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, waterY - 6 * U, W, 16 * U);
  }

  /** draw a full-sky layer onto main ctx (identity transform), mirrored if enabled */
  private drawLayer(img: HTMLCanvasElement, alpha: number) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.fx.height;
    ctx.globalAlpha = alpha;
    if (!this.mirror) {
      ctx.drawImage(img, 0, 0, w, h);
    } else {
      const half = w / 2;
      const iw = img.width / 2;
      ctx.drawImage(img, 0, 0, iw, img.height, 0, 0, half, h);
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, iw, img.height, 0, 0, half, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private renderSmoke() {
    const ctx = this.ctx;
    if (!this.puffs.length) return;
    const gray = puffSprite('#8a8c99');
    const lit = puffSprite(this.theme.smoke);
    for (const s of this.puffs) {
      const u = s.age / s.life;
      const fade = (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9) * s.a;
      // light from nearby bursts
      let glow = this.theme.smokeLit * 0.5;
      let best: Light | null = null, bestV = 0;
      for (const l of this.lights) {
        const d = Math.hypot(l.x - s.x, l.y - s.y) / (180 * this.U);
        const v = l.i / (1 + d * d);
        glow += v;
        if (v > bestV) { bestV = v; best = l; }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade * 0.07;
      ctx.drawImage(gray, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, fade * glow * 0.3);
      ctx.drawImage(best && bestV > this.theme.smokeLit * 0.3 ? puffSprite(best.color) : lit, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
