import { buildTown, type TownLayers } from './town';
import { buildRiverbank } from './riverbank';
import { Sfx } from './audio';
import { SET_PIECES, THEMES, type FinaleKind, type SceneId, type ShellType, type Theme, type ThemeId } from './themes';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[(Math.random() * arr.length) | 0];

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** add +-amp random noise to break up 8-bit gradient banding */
function dither(g: CanvasRenderingContext2D, w: number, h: number, amp: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 2 * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
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
  Cascade1 = 5, // 三段連環 tier-1 split comet -> tier-2 stars
  Cascade2 = 6, // 三段連環 tier-2 star -> tier-3 crackle bloom
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
  type: ShellType; pal: string[]; acc: number; wob: number; scale: number;
  burstAt?: number; // music clock time of the burst (timed launches)
}
interface Emitter {
  kind: 'fountain';
  x: number; y: number; w: number; t: number; dur: number; rate: number; acc: number;
  colors: string[]; power: number;
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
  private water = makeCanvas();
  // 小鎮車站 layers (1x1 unless the town scene is active)
  private fg = makeCanvas();
  private litMask = makeCanvas();
  private litTmp = makeCanvas();
  private town: TownLayers | null = null;
  /** per-frame aggregated burst light per screen column: r,g,b,weight */
  private litCols = new Float32Array(8 * 4);
  private litTotal = 0;

  W = 1; H = 1; U = 1; dpr = 1;
  landTop = 0; waterY = 0;
  private parts: P[] = [];
  private n = 0;
  private rockets: Rocket[] = [];
  private fans: Fan[] = [];
  private emitters: Emitter[] = [];
  private tint = { color: '#7a3cff', i: 0 };
  private puffs: Puff[] = [];
  private lights: Light[] = [];
  private stars: Star[] = [];
  private timed: Timed[] = [];
  private time = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  theme: Theme = THEMES[0];
  /** 'field' (default, no water) | 'lake' (water + reflection) | 'sky' (sky only) */
  scene: SceneId = 'town';
  shell: ShellType | 'random' = 'senrin';
  mirror = false;
  auto = false;
  private autoNext = 0;
  private textPts: [number, number][] = [];
  private lastVib = 0;

  // perf
  qLevel = 0;
  private qPinned = false;
  private quality: Quality;
  private emaDt = 1 / 60;
  private slowFor = 0;
  private lastQChange = 0;
  onQuality?: (q: number) => void;

  // pointer
  private drag: { x: number; y: number; dist: number; count: number; id: number } | null = null;
  onInteract?: () => void;
  /** called every frame after update (music scheduler hooks in here) */
  onFrame?: (dt: number) => void;
  /** music track time while a music show is playing, else null; timed rockets follow this clock */
  musicClock: (() => number | null) | null = null;
  /** called on every main burst (debug / tests) */
  onBurst?: (type: ShellType, x: number, y: number) => void;

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, scene?: SceneId) {
    if (scene) this.scene = scene;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.sfx = sfx;
    this.fxc = this.fx.getContext('2d')!;
    this.b1c = this.b1.getContext('2d')!;
    this.b2c = this.b2.getContext('2d')!;
    this.reflc = this.refl.getContext('2d')!;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.qLevel = coarse ? 1 : 0;
    const qp = new URLSearchParams(location.search).get('q');
    if (qp != null && /^[0-3]$/.test(qp)) { this.qLevel = +qp; this.qPinned = true; }
    this.quality = this.qualityFor(this.qLevel);
    for (let i = 0; i < 7000; i++) this.parts.push(new P());
    this.setText('煙火');
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.lateResize);
    window.visualViewport?.addEventListener('resize', this.resize);
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement); }
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.lateResize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.ro?.disconnect();
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

  private ro?: ResizeObserver;
  private lateResize = () => { this.resize(); setTimeout(this.resize, 250); setTimeout(this.resize, 600); };

  // ---------- setup ----------
  resize = () => {
    // layout size of the container (untransformed, so it is correct when the app is CSS-rotated)
    const el = this.canvas.parentElement;
    const W = Math.max(1, Math.round(el && el.clientWidth ? el.clientWidth : window.innerWidth));
    const H = Math.max(1, Math.round(el && el.clientHeight ? el.clientHeight : window.innerHeight));
    if (W === this.W && H === this.H && this.quality.dpr === this.dpr && this.canvas.width > 1) return;
    const dpr = this.quality.dpr;
    this.W = W; this.H = H; this.dpr = dpr;
    const wide = W > H;
    this.U = (wide ? Math.min(W * 0.5, H * 0.8) : Math.min(W, H * 0.62)) / 400;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    // landTop = top of the land silhouette; waterY = ground / waterline (rockets, fountains start here)
    if (this.scene === 'lake') { this.landTop = H * (wide ? 0.6 : 0.505); this.waterY = H * (wide ? 0.68 : 0.575); }
    else if (this.scene === 'town') { this.landTop = H * (wide ? 0.5 : 0.58); this.waterY = H * (wide ? 0.64 : 0.72); }
    else if (this.scene === 'field') { this.landTop = H * (wide ? 0.68 : 0.7); this.waterY = H * (wide ? 0.8 : 0.8); }
    else { this.landTop = H * (wide ? 0.85 : 0.87); this.waterY = H * (wide ? 0.92 : 0.93); }
    this.fx.width = Math.round(W * dpr);
    this.fx.height = Math.round(this.waterY * dpr);
    this.b1.width = Math.ceil(this.fx.width / 4 / dpr * 1);
    this.b1.height = Math.ceil(this.fx.height / 4 / dpr * 1);
    this.b2.width = Math.ceil(this.b1.width / 2);
    this.b2.height = Math.ceil(this.b1.height / 2);
    const rs = 0.5;
    const lake = this.scene === 'lake';
    // no reflection buffer at all unless the lake scene is active
    this.refl.width = lake ? Math.ceil(W * rs) : 1;
    this.refl.height = lake ? Math.ceil((H - this.waterY) * rs) : 1;
    this.buildSky();
    this.buildWater();
    if (this.scene === 'town' || this.scene === 'field') {
      // lit scenes: pre-rendered silhouettes + lightable mask, tinted per frame by the bursts
      this.town = (this.scene === 'town' ? buildTown : buildRiverbank)(W, H, this.landTop, this.waterY, dpr, this.U, this.land, this.fg, this.litMask);
      this.litTmp.width = this.litMask.width; this.litTmp.height = this.litMask.height;
    } else {
      this.town = null;
      for (const c of [this.fg, this.litMask, this.litTmp]) { c.width = 1; c.height = 1; }
      if (this.scene === 'lake') this.buildLand(); else this.buildFieldLand();
    }
    this.stars = [];
    const ns = Math.round((W * this.landTop) / 2600);
    // stars fill the whole sky above the land, whatever the orientation
    for (let i = 0; i < ns; i++)
      this.stars.push({ x: Math.random() * W, y: Math.random() * this.landTop * 0.95, r: rand(0.4, 1.3), a: rand(0.15, 0.7), ph: rand(0, TAU), sp: rand(0.6, 2.6) });
  };

  /** sky covers the FULL canvas (any orientation); gradient ends at the waterline. Dithered to avoid banding. */
  private buildSky() {
    const cw = this.canvas.width, ch = this.canvas.height;
    const wy = Math.round(this.waterY * this.dpr);
    this.sky.width = cw;
    this.sky.height = ch;
    const g = this.sky.getContext('2d', { willReadFrequently: true })!;
    const grad = g.createLinearGradient(0, 0, 0, wy);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.55, '#020208');
    grad.addColorStop(1, this.theme.horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, ch);
    dither(g, cw, ch, 2.2);
  }

  /** below the ground line: water base (lake) or a static ground/field fill (other scenes) */
  private buildWater() {
    const cw = this.canvas.width, ch = this.canvas.height;
    const wy = Math.floor(this.waterY * this.dpr);
    this.water.width = cw;
    this.water.height = Math.max(1, ch - wy);
    const g = this.water.getContext('2d', { willReadFrequently: true })!;
    const grad = g.createLinearGradient(0, 0, 0, this.water.height);
    if (this.scene === 'lake') { grad.addColorStop(0, '#05060c'); grad.addColorStop(1, '#000000'); }
    else if (this.scene === 'field') { grad.addColorStop(0, '#07090a'); grad.addColorStop(1, '#010101'); }
    else if (this.scene === 'town') { grad.addColorStop(0, '#050507'); grad.addColorStop(1, '#020203'); }
    else { grad.addColorStop(0, '#030305'); grad.addColorStop(1, '#000000'); }
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, this.water.height);
    dither(g, cw, this.water.height, 2.2);
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

  /** non-water scenes: hills + distant skyline + riverbank field (field) or a low horizon only (sky) */
  private buildFieldLand() {
    const { W, landTop, waterY, dpr, U } = this;
    this.land.width = Math.round(W * dpr);
    this.land.height = Math.round(waterY * dpr);
    const g = this.land.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, waterY);
    const seed = Math.random() * 100;
    const ridge = (base: number, a1: number, a2: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, waterY);
      for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, base + Math.sin(x * 0.005 + seed) * a1 * U + Math.sin(x * 0.019 + seed * 3) * a2 * U);
      g.lineTo(W, waterY);
      g.closePath();
      g.fill();
    };
    if (this.scene === 'sky') {
      ridge(landTop + 18 * U, 6, 3, '#05060b');
      ridge(waterY - 8 * U, 3, 2, '#020203');
      return;
    }
    // far hills
    ridge(landTop + 6 * U, 12, 5, '#080a12');
    // distant skyline with lights on the far bank
    const skyBase = landTop + 34 * U;
    g.fillStyle = '#05060b';
    g.beginPath();
    g.moveTo(0, waterY);
    let x = 0;
    const lights: [number, number][] = [];
    while (x < W) {
      const bw = rand(5, 18) * U;
      const bh = Math.random() < 0.12 ? rand(16, 30) * U : rand(3, 11) * U;
      g.lineTo(x, skyBase - bh); g.lineTo(x + bw, skyBase - bh);
      if (Math.random() < 0.7) lights.push([x + rand(1, bw - 1), skyBase - rand(1, bh)]);
      x += bw;
    }
    g.lineTo(W, waterY); g.closePath(); g.fill();
    for (const [lx, ly] of lights) {
      g.fillStyle = pick(['rgba(255,210,140,', 'rgba(255,240,210,', 'rgba(140,200,255,']) + rand(0.2, 0.7) + ')';
      g.fillRect(lx, ly, rand(0.7, 1.5) * U, rand(0.7, 1.2) * U);
    }
    // riverbank / field in front: gentle rise with grass tufts on the edge
    g.fillStyle = '#020303';
    g.beginPath();
    g.moveTo(0, waterY);
    for (let gx = 0; gx <= W + 4; gx += 4) {
      const base = waterY - 14 * U + Math.sin(gx * 0.004 + seed * 2) * 6 * U;
      g.lineTo(gx, base - (Math.random() < 0.35 ? rand(1, 5) * U : 0));
    }
    g.lineTo(W, waterY); g.closePath(); g.fill();
  }

  /** 小鎮車站: sum burst lights into 8 screen columns (cheap: lights ≤ ~12) + whole-sky colour wash */
  private aggregateLight() {
    const { W, waterY, ctx } = this;
    const c = this.litCols;
    c.fill(0);
    let tot = 0, tr = 0, tg = 0, tb = 0;
    for (const l of this.lights) {
      const [r, g, b] = hexRgb(l.color);
      // lower bursts are closer to the town -> stronger; falls off horizontally
      const hf = 0.45 + 0.55 * Math.min(1, Math.max(0, l.y / waterY));
      for (let k = 0; k < 8; k++) {
        const dx = ((k + 0.5) / 8) * W - l.x;
        const w = l.i * hf * Math.exp(-((dx / W) ** 2) * 6);
        c[k * 4] += r * w; c[k * 4 + 1] += g * w; c[k * 4 + 2] += b * w; c[k * 4 + 3] += w;
      }
      const w = l.i * hf; tot += w; tr += r * w; tg += g * w; tb += b * w;
    }
    this.litTotal = tot;
    if (tot < 0.02) return;
    // sky wash: the whole sky takes on the burst colour, strongest near the horizon
    const a = Math.min(1, tot * 0.5);
    const r = (tr / tot) | 0, g = (tg / tot) | 0, b = (tb / tot) | 0;
    const sg = ctx.createLinearGradient(0, 0, 0, waterY);
    sg.addColorStop(0, `rgba(${r},${g},${b},${0.03 * a})`);
    sg.addColorStop(1, `rgba(${r},${g},${b},${0.11 * a})`);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, waterY);
  }

  /** tint the white "lightable" mask with the per-column burst colour and add it on top (3 blits) */
  private renderTownLight() {
    const t = this.town!;
    const { ctx, dpr, W, time, U } = this;
    if (this.litTotal >= 0.02) {
      const tc = this.litTmp.getContext('2d')!;
      tc.globalCompositeOperation = 'copy';
      tc.drawImage(this.litMask, 0, 0);
      tc.globalCompositeOperation = 'source-in';
      const gr = tc.createLinearGradient(0, 0, this.litTmp.width, 0);
      const c = this.litCols;
      for (let k = 0; k < 8; k++) {
        const w = c[k * 4 + 3];
        const br = w > 0.001 ? Math.min(1, w * 1.5) / w : 0;
        gr.addColorStop((k + 0.5) / 8, `rgb(${Math.min(255, c[k * 4] * br) | 0},${Math.min(255, c[k * 4 + 1] * br) | 0},${Math.min(255, c[k * 4 + 2] * br) | 0})`);
      }
      tc.fillStyle = gr;
      tc.fillRect(0, 0, this.litTmp.width, this.litTmp.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.litTmp, 0, t.maskY0 * dpr, this.litTmp.width * dpr, this.litTmp.height * dpr);
      ctx.globalCompositeOperation = 'source-over';
    }
    // tiny animated touches: blinking tower light, a moth circling the first lamp
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (t.tower && Math.sin(time * 2.6) > 0.55) {
      ctx.fillStyle = 'rgba(255,50,40,0.95)';
      ctx.fillRect(t.tower.x - 1 * U, t.tower.y - 1 * U, 2 * U, 2 * U);
    }
    const l = this.scene === 'town' ? t.lamps[0] : undefined;
    if (l) {
      const s = (this.H - this.waterY) / (this.W > this.H ? 170 : 236);
      const mx = l.x - 5 * s + Math.cos(time * 6.3) * 7 * s + Math.sin(time * 2.9) * 3 * s;
      const my = l.y + 8 * s + Math.sin(time * 4.7) * 5 * s;
      ctx.fillStyle = 'rgba(255,240,210,0.8)';
      ctx.fillRect(mx, my, 1.3 * s + 0.5, 1.1 * s + 0.5);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    void W;
  }

  /** switch scene: rebuilds layout and caches */
  setScene(id: SceneId) {
    if (id === this.scene) return;
    this.scene = id;
    this.W = 0; // force a full resize/rebuild
    this.resize();
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
      this.onFrame?.(dt);
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
    if (!this.qPinned && this.slowFor > 1.5 && this.qLevel < 3 && this.time - this.lastQChange > 3) {
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
  /** true when the app container is rotated 90deg clockwise via CSS (iOS landscape fallback) */
  rotated = false;
  private toLocal(e: PointerEvent): [number, number] {
    if (!this.rotated) return [e.clientX, e.clientY];
    // container: translateX(screenW) rotate(90deg), origin top-left => local x = screen y, local y = screenW - screen x
    return [e.clientY, window.innerWidth - e.clientX];
  }
  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.onInteract?.();
    const [x, y] = this.toLocal(e);
    this.drag = { x, y, dist: 0, count: 0, id: e.pointerId };
    this.launch(x, y);
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const [lx, ly] = this.toLocal(e);
    const dx = lx - d.x, dy = ly - d.y;
    d.dist += Math.hypot(dx, dy);
    d.x = lx; d.y = ly;
    const spacing = 42 * this.U;
    if (d.dist > spacing && d.count < 14) {
      d.dist = 0;
      d.count++;
      this.launch(lx, ly, undefined, 0.85);
    }
  };
  private onUp = (e: PointerEvent) => {
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
  };

  // ---------- spawning ----------
  /** low = cosmetic (trails/embers): refused once 85% of the budget is used so shell stars still fit */
  private spawn(low = false): P | null {
    if (this.n >= (low ? this.quality.cap * 0.85 : this.quality.cap)) return null;
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
    if (SET_PIECES.includes(t)) { this.setPiece(t, x, y); return; }
    const minY = 60 * U;
    const maxY = this.landTop - 70 * U;
    const ty = Math.max(minY, Math.min(maxY, y));
    const tx = Math.max(20, Math.min(W - 20, x + rand(-6, 6)));
    const sx = Math.max(10, Math.min(W - 10, tx + rand(-0.06, 0.06) * W));
    const sy = this.waterY - 3 * U;
    const T = 0.75 + ((sy - ty) / this.H) * 0.9 + rand(-0.05, 0.1);
    const pal = pick(this.theme.palettes);
    this.rockets.push({ sx, sy, tx, ty, x: sx, y: sy, t: 0, T, type: t, pal, acc: 0, wob: rand(0, TAU), scale: sizeMul });
    this.sfx.launch((tx / W) * 2 - 1, T);
  }

  /** lead time between scheduling and the visual hit for any type (set pieces fire in place) */
  flightFor(type: ShellType, yn: number) {
    if (type === 'starmine') return 0.4;
    if (SET_PIECES.includes(type)) return 0;
    return this.flightTime(yn);
  }

  /** rocket with explicit flight time (starmine / finales) */
  private quickRocket(x: number, ty: number, type: ShellType, T: number, pal: string[], scale = 1) {
    const sy = this.waterY - 3 * this.U;
    this.rockets.push({ sx: x + rand(-4, 4) * this.U, sy, tx: x, ty, x, y: sy, t: 0, T, type, pal, acc: 0, wob: rand(0, TAU), scale });
  }

  /** ground / in-place set pieces */
  private setPiece(t: ShellType, x: number, y: number) {
    const { W, U, landTop, waterY } = this;
    const wide = W > this.H;
    const pan = (x / W) * 2 - 1;
    if (t === 'fan') {
      this.fans.push({ x, y: waterY - 4 * U, t: 0, next: 0, wave: 0, waves: 3, pal: pick(this.theme.palettes) });
      this.sfx.launch(pan, 0.5);
    } else if (t === 'ground') {
      // 地面火花: row of fountains / mines along the shore + thin white rising comets
      const n = wide ? 9 : 6;
      const cols = [['#ff7ab8', '#ffd1ea'], ['#ff9a3c', '#ffd27a'], ['#ffffff', '#fff1c2']];
      for (let k = 0; k < n; k++) {
        const fx = ((k + 0.5) / n) * W + rand(-6, 6) * U;
        this.timed.push({ t: this.time + k * 0.06, fn: () => this.emitters.push({
          kind: 'fountain', x: fx, y: waterY - 2 * U, w: 0, t: 0, dur: rand(3.2, 4.2), rate: 70, acc: 0, colors: cols[k % 3], power: rand(0.8, 1.15) }) });
      }
      for (let k = 0; k < 6; k++) this.timed.push({ t: this.time + 0.3 + k * 0.45, fn: () => this.comet(rand(0.1, 0.9) * W) });
      this.addLight(W / 2, waterY - 30 * U, '#ffb070', 0.8);
      this.sfx.crackle(pan, 0.2);
    } else if (t === 'starmine') {
      // 速射連發: rapid low row of small multicolour bursts + a few big shells above
      const n = wide ? 18 : 12;
      const multi = ['#ff4fa3', '#ffd36b', '#14ffc8', '#2fa8ff', '#b84dff', '#ff3b30', '#7dff4f', '#ffffff'];
      const lowY = landTop * 0.62;
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const sx = (0.08 + (k % 2 ? 1 - u : u) * 0.84) * W;
        const c1 = pick(multi), c2 = pick(multi);
        this.timed.push({ t: this.time + k * 0.17, fn: () => this.quickRocket(sx, lowY + rand(-25, 20) * U, 'peony', k === 0 ? 0.4 : rand(0.32, 0.45), [c1, c2, '#ffffff'], 0.38) });
      }
      const big: ShellType[] = ['peony', 'chrysanthemum', 'pistil', 'senrin'];
      for (let k = 0; k < 3; k++)
        this.timed.push({ t: this.time + 0.3 + k * 0.7, fn: () => this.launch(rand(0.2, 0.8) * W, rand(0.25, 0.45) * landTop, pick(big)) });
    }
  }

  /** thin white rising comet (ground pieces / finales) */
  private comet(x: number) {
    const p = this.spawn(); if (!p) return;
    const U = this.U;
    p.x = x; p.y = this.waterY - 3 * U; p.vx = rand(-15, 15) * U; p.vy = -rand(380, 470) * U;
    p.drag = 1.0; p.grav = 1.0; p.life = rand(1.0, 1.3); p.size = 1.3 * U;
    p.color = '#ffffff'; p.sprite = dotSprite('#ffffff');
    p.trail = 35; p.trailLife = 0.35; p.trailSize = 0.6; p.trailGrav = 0.2;
  }

  /** rise time used by launchTimed for a target at fraction yn (0..1 of screen height) */
  flightTime(yn: number) {
    const ty = Math.max(60 * this.U, Math.min(this.landTop - 70 * this.U, yn * this.H));
    return 0.8 + ((this.waterY - ty) / this.H) * 0.8;
  }

  /**
   * Music shows: launch so the burst happens exactly `flight` seconds after the scheduled launch time.
   * `late` = how long ago the launch should have happened (frame jitter), so the rocket starts part-way.
   * x, y in 0..1 of width / height.
   */
  launchTimed(xn: number, yn: number, type: ShellType, flight: number, late: number, scale = 1) {
    const { W, U } = this;
    let x = xn * W;
    if (this.mirror && x > W / 2) x = W - x;
    if (SET_PIECES.includes(type)) { this.setPiece(type, x, yn * this.H); return; }
    const ty = Math.max(60 * U, Math.min(this.landTop - 70 * U, yn * this.H));
    const tx = Math.max(20, Math.min(W - 20, x));
    const sx = Math.max(10, Math.min(W - 10, tx + rand(-0.05, 0.05) * W));
    const sy = this.waterY - 3 * U;
    const pal = pick(this.theme.palettes);
    const now = this.musicClock?.();
    const burstAt = now != null ? now + flight - Math.max(0, late) : undefined;
    this.rockets.push({ sx, sy, tx, ty, x: sx, y: sy, t: Math.max(0, late), T: flight, type, pal, acc: 0, wob: rand(0, TAU), scale, burstAt });
    if (flight - late > 0.25) this.sfx.launch((tx / W) * 2 - 1, flight - late);
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
      if (this.puffs.length > 80) this.puffs.shift();
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
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return; // browsers block vibrate before the first tap
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

  private burst(type: ShellType, x: number, y: number, pal: string[], scale = 1) {
    const { W } = this;
    const U = this.U * scale;
    const q = this.q * Math.max(0.3, Math.min(1.3, scale));
    this.onBurst?.(type, x, y);
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
      case 'cascade': {
        // 三段連環 tier 1: 6-10 split comets flung outward (slightly downward); each later splits again
        const b = this.cascadeBudget();
        const n1 = Math.max(4, Math.round(rand(6, 10) * Math.max(0.6, b)));
        const sp = rand(110, 140) * U;
        const a0 = rand(0, TAU);
        for (let i = 0; i < n1; i++) {
          const p = this.spawn(); if (!p) break;
          const a = a0 + (i / n1) * TAU + rand(-0.15, 0.15), s = sp * rand(0.85, 1.1);
          p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * 0.85 + 12 * U;
          p.drag = 1.6; p.grav = 0.8; p.life = rand(0.5, 0.72); p.size = 2.5 * U; p.flicker = 0.1;
          p.color = pal[0]; p.sprite = dotSprite(p.color); p.kind = Kind.Cascade1; p.pal = pal;
          p.trail = 20; p.trailLife = 0.35; p.trailSize = 0.7; p.trailGrav = 0.3;
        }
        this.sphere(x, y, Math.round(18 * q), 22 * U, { colors: [pal[2] ?? '#fff'], life: [0.35, 0.55], size: 1.6, drag: 3.5 });
        boom = 0.75;
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
      case 'kamuro': {
        // 冠菊: big gold sphere, thick long glittering tails that hang and droop
        const R = rand(95, 120) * U;
        this.sphere(x, y, Math.round(95 * q), R, {
          colors: ['#ffd27a', '#ffbf4d', '#ffe6a8'], drag: 1.7, life: [3.6, 4.6], size: 2.6, grav: 0.85, flicker: 0.45,
          trail: 11, trailLife: 1.6,
        });
        this.sphere(x, y, Math.round(25 * q), R * 0.2, { colors: ['#fff6d8'], life: [0.5, 0.8], size: 2 });
        boom = 1;
        break;
      }
      case 'palm': {
        // 椰子: 6-10 thick gold comet arms that spread then curve down
        const arms = 6 + ((Math.random() * 5) | 0);
        const drag = 1.3;
        const R = rand(95, 115) * U;
        const rot = rand(0, TAU);
        for (let k = 0; k < arms; k++) {
          const a = rot + (k / arms) * TAU + rand(-0.12, 0.12);
          const p = this.spawn(); if (!p) break;
          const sp = R * drag * rand(0.9, 1.05);
          p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 25 * U; p.drag = drag;
          p.life = rand(2.4, 3.0); p.size = 3.1 * U; p.color = '#ffcf70'; p.sprite = dotSprite(p.color);
          p.grav = 1.5; p.flicker = 0.2; p.trail = 38; p.trailLife = 0.9; p.trailSize = 0.72; p.trailGrav = 0.5;
        }
        this.sphere(x, y, Math.round(18 * q), R * 0.15, { colors: ['#fff1c2'], life: [0.4, 0.7], size: 2 });
        boom = 1;
        break;
      }
      case 'pistil': {
        // 雙芯: outer sphere one colour, inner ring + core in contrasting colours
        const combos = [
          ['#2fff7a', '#3fa8ff', '#ff5fd2'], ['#ffd36b', '#ff2d55', '#ffffff'], ['#ff4fa3', '#14ffc8', '#ffd36b'],
          ['#b84dff', '#ffe08a', '#00e5ff'], [pal[0], '#ffffff', pal[1] ?? '#ffd36b'],
        ];
        const [a, b, c] = pick(combos);
        const R = rand(80, 100) * U;
        this.sphere(x, y, Math.round(110 * q), R, { colors: [a], life: [1.6, 2.2], size: 2.2, flicker: 0.3 });
        this.sphere(x, y, Math.round(50 * q), R * 0.55, { colors: [b], life: [1.4, 1.9], size: 2.0, flicker: 0.2 });
        this.sphere(x, y, Math.round(22 * q), R * 0.24, { colors: [c], life: [1.1, 1.5], size: 1.8 });
        break;
      }
      case 'giant': {
        // 長岡巨型: enormous gold/white chrysanthemum (scale sets the radius)
        const R = 100 * U;
        this.sphere(x, y, Math.round(170 * this.q), R, {
          colors: ['#ffc04d', '#ffd27a', '#ffb347', '#fff2c8'], drag: 2.0, life: [2.6, 3.4], size: 1.7, grav: 0.55, flicker: 0.5,
          trail: 5, trailLife: 0.7, alpha: 0.6,
        });
        this.sphere(x, y, Math.round(26 * this.q), R * 0.4, { colors: ['#fff2c8'], life: [1.4, 2.0], size: 1.6, flicker: 0.3, alpha: 0.7 });
        this.addLight(x, y, '#ffb347', 0.9);
        this.addSmoke(x, y, 6, 70);
        boom = 1;
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
    if (scale > 0.5) this.sfx.boom(boom * Math.min(1, scale), pan); else this.sfx.pop(pan);
    this.vibrate(type === 'willow' || type === 'peony' ? 30 : 18);
    this.addLight(x, y, pal[0], type === 'senrin' ? 0.8 : 1);
    this.addSmoke(x, y, type === 'senrin' ? 4 : 3, 40);
  }

  /** 0.25..1: scales 三段連環 tier counts down when the particle budget is tight */
  private cascadeBudget() {
    const cap = this.quality.cap;
    return Math.max(0.25, Math.min(1, (cap * 0.85 - this.n) / (cap * 0.45))) * Math.max(0.85, Math.min(1, this.q));
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
    } else if (p.kind === Kind.Cascade1) {
      // tier 2: 4-6 smaller stars, colour shifts to the 2nd palette colour, keep spreading out/down
      const b = this.cascadeBudget();
      const n2 = Math.max(2, Math.round(rand(4, 6) * b));
      const c2 = pal[1] ?? pal[0];
      const a0 = rand(0, TAU);
      for (let i = 0; i < n2; i++) {
        const c = this.spawn(); if (!c) break;
        const a = a0 + (i / n2) * TAU + rand(-0.3, 0.3), s = rand(48, 66) * U;
        c.x = p.x; c.y = p.y; c.vx = p.vx * 0.35 + Math.cos(a) * s; c.vy = p.vy * 0.35 + Math.sin(a) * s + 8 * U;
        c.drag = 2; c.grav = 0.8; c.life = rand(0.38, 0.6); c.size = 1.9 * U; c.flicker = 0.15;
        c.color = c2; c.sprite = dotSprite(c2); c.kind = Kind.Cascade2; c.pal = pal;
        c.trail = 8; c.trailLife = 0.22; c.trailSize = 0.55; c.trailGrav = 0.3;
      }
      this.sfx.snap(pan, 0);
      if (Math.random() < 0.35) this.addLight(p.x, p.y, c2, 0.3);
    } else if (p.kind === Kind.Cascade2) {
      // tier 3: tiny crisp crackle bloom (short-lived white/3rd-colour specks)
      const b = this.cascadeBudget();
      const n3 = Math.max(3, Math.round(rand(10, 14) * b));
      const c3 = pal[2] ?? '#ffffff';
      for (let i = 0; i < n3; i++) {
        const c = this.spawn(); if (!c) break;
        const a = rand(0, TAU), s = rand(26, 44) * U;
        c.x = p.x; c.y = p.y; c.vx = p.vx * 0.2 + Math.cos(a) * s; c.vy = p.vy * 0.2 + Math.sin(a) * s;
        c.drag = 3.2; c.grav = 0.5; c.life = rand(0.35, 0.65); c.size = 1.35 * U; c.flicker = 0.75; c.alpha = 0.95;
        c.color = i % 3 === 0 ? '#ffffff' : c3; c.sprite = dotSprite(c.color);
      }
      this.sfx.snap(pan, 1);
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

  /** run a finale; returns the one actually used (random resolves here) */
  finale(kind: FinaleKind | 'random' = 'classic'): FinaleKind {
    const k: FinaleKind = kind === 'random' ? pick<FinaleKind>(['classic', 'nagaoka', 'phoenix']) : kind;
    if (k === 'nagaoka') this.finaleNagaoka();
    else if (k === 'phoenix') this.finalePhoenix();
    else this.finaleClassic();
    return k;
  }
  /** seconds from finale start to its main climax (music sync aligns this to a beat) */
  static finaleClimax(k: FinaleKind) {
    return k === 'nagaoka' ? 2.0 : k === 'phoenix' ? 0.5 : 7.3;
  }

  private finaleClassic() {
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

  /** 長岡巨型: rows of enormous gold/white chrysanthemums, lit smoke, double-pistil bouquets, starmine base */
  private finaleNagaoka() {
    const { W, H, U, landTop } = this;
    const t0 = this.time;
    const wide = W > H;
    const n = wide ? 4 : 3;
    const R = Math.min((W / n) * 0.62, landTop * 0.36); // radius in px -> scale
    const scale = R / (100 * U);
    // starmine base throughout
    this.setPiece('starmine', W / 2, landTop);
    this.timed.push({ t: t0 + 2.6, fn: () => this.setPiece('starmine', W / 2, landTop) });
    this.timed.push({ t: t0 + 5.2, fn: () => this.setPiece('ground', W / 2, landTop) });
    // multicolour double-pistil bouquets in the middle band
    for (let k = 0; k < 6; k++)
      this.timed.push({ t: t0 + 0.2 + k * 0.25, fn: () => this.launch(((k + 0.5) / 6) * W, landTop * rand(0.45, 0.6), 'pistil') });
    // giant row(s): rockets with fixed 1.2 s flight -> climax at t0 + 2.0
    const rows: [number, number][] = [[0.8, 0.42], [3.4, 0.5], [6.0, 0.4]];
    rows.forEach(([at, yf], ri) => {
      for (let k = 0; k < n; k++) {
        const x = ((k + 0.5) / n) * W + (ri % 2 ? (W / n) * 0.25 : 0) * (k % 2 ? 1 : -1);
        const y = Math.max(R * 0.7, landTop * yf + (k % 2 ? -1 : 1) * 12 * U);
        this.timed.push({ t: t0 + at, fn: () => { this.quickRocket(x, y, 'giant', 1.2, ['#ffd27a'], scale); this.sfx.launch((x / W) * 2 - 1, 1.2); } });
      }
    });
    // 三段連環 pair between the giant rows: the chain pops ripple under the gold
    for (let k = 0; k < 2; k++)
      this.timed.push({ t: t0 + 4.6 + k * 0.35, fn: () => this.launch((k ? 0.7 : 0.3) * W, landTop * 0.42, 'cascade') });
    this.timed.push({ t: t0 + 7.0, fn: () => { for (let k = 0; k < 5; k++) this.launch(((k + 0.5) / 5) * W, landTop * 0.3, 'crackle'); } });
  }

  /** 鳳凰亂舞: tall narrow oval mass of hundreds of tiny peonies, 3 waves, palette shifts, purple sky */
  private finalePhoenix() {
    const { W, H, U, landTop } = this;
    const t0 = this.time;
    const top = H * 0.05, bottom = landTop - 6 * U;
    const cy = (top + bottom) / 2, b = (bottom - top) / 2;
    const a = Math.min(W * (W > H ? 0.12 : 0.24), b * 0.42); // narrow
    const waves = [
      ['#ff9a1f', '#ffc04d', '#ffe08a', '#fff1c2'],
      ['#ff5fa8', '#ffb3d6', '#ffffff', '#ffd1ea'],
      ['#3f6bff', '#ff2d55', '#b84dff', '#8a5cff', '#ff5fd2'],
    ];
    waves.forEach((cols, wi) => {
      const ws = t0 + wi * 3;
      const bursts = Math.round(115 * Math.max(0.5, this.q));
      for (let k = 0; k < bursts; k++) {
        // uniform inside the ellipse, slightly denser toward the centre
        const ang = rand(0, TAU), rr = Math.pow(Math.random(), 0.6);
        const x = W / 2 + Math.cos(ang) * a * rr, y = cy + Math.sin(ang) * b * rr;
        const c = pick(cols);
        this.timed.push({ t: ws + Math.random() * 0.7, fn: () => this.miniBurst(x, y, c) });
      }
      for (let k = 0; k < 8; k++) this.timed.push({ t: ws - 0.5 + k * 0.06, fn: () => this.comet(W / 2 + rand(-a, a) * 0.6) });
      this.timed.push({ t: ws + 0.25, fn: () => {
        this.addLight(W / 2, cy, cols[0], 1.4);
        this.addSmoke(W / 2, cy + b * 0.3, 5, 40);
        this.sfx.boom(0.9, 0);
        this.sfx.crackle(0, 0.2);
        this.vibrate(40);
        if (wi >= 1) this.tint.i = Math.max(this.tint.i, wi === 2 ? 1 : 0.6);
      } });
    });
  }

  /** cheap small peony (no flicker, no trail) for dense finales */
  private miniBurst(x: number, y: number, color: string) {
    const U = this.U;
    const n = 8, R = rand(13, 22) * U, drag = 3.2;
    const sprite = dotSprite(color);
    for (let i = 0; i < n; i++) {
      const p = this.spawn(); if (!p) return;
      const [vx, vy] = this.sph(R * drag);
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.drag = drag;
      p.life = rand(1.0, 1.4); p.size = 1.6 * U; p.color = color; p.sprite = sprite; p.grav = 0.35; p.alpha = 0.85;
    }
    this.sfx.pop((x / this.W) * 2 - 1);
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
      const mc = r.burstAt != null ? this.musicClock?.() : null;
      if (mc != null) {
        r.t = Math.max(0, r.T - (r.burstAt! - mc)); // locked to the music clock
        if (r.burstAt! - mc <= dt * 0.5) r.t = r.T; // nearest frame, not the first frame after
      } else r.t += dt;
      const u = Math.min(1, r.t / r.T);
      const e = 1 - (1 - u) * (1 - u);
      r.x = r.sx + (r.tx - r.sx) * e + Math.sin(r.t * 18 + r.wob) * 0.6 * U;
      r.y = r.sy + (r.ty - r.sy) * e;
      const thick = r.type === 'palm' || r.type === 'giant';
      r.acc += dt * (thick ? 130 : r.type === 'starmine' ? 25 : 70);
      while (r.acc >= 1) {
        r.acc--;
        const p = this.spawn(true); if (!p) break;
        p.x = r.x + rand(-0.6, 0.6) * U; p.y = r.y + rand(0, 2) * U; p.vx = rand(-6, 6) * U; p.vy = rand(5, 25) * U;
        p.drag = 3; p.life = rand(0.25, 0.55) * (1 - u * 0.5); p.size = rand(0.7, 1.2) * U;
        p.color = '#ffc477'; p.sprite = dotSprite(p.color); p.kind = Kind.Ember; p.grav = 0.4; p.alpha = 0.7;
        if (thick) { p.size = rand(1.4, 2.4) * U; p.life *= 1.6; p.alpha = 0.85; p.color = '#ffd27a'; p.sprite = dotSprite(p.color); }
      }
      if (u >= 1) {
        this.rockets.splice(i, 1);
        this.burst(r.type, r.x, r.y, r.pal, r.scale);
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

    // emitters (ground fountains)
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      if (e.t >= e.dur) { this.emitters.splice(i, 1); continue; }
      const ramp = Math.min(1, e.t / 0.35) * Math.min(1, (e.dur - e.t) / 0.6);
      e.acc += e.rate * dt * ramp * Math.max(0.4, this.q);
      {
        while (e.acc >= 1) {
          e.acc--;
          const p = this.spawn(); if (!p) break;
          const ang = -Math.PI / 2 + rand(-0.17, 0.17), sp = rand(190, 300) * U * e.power;
          p.x = e.x + rand(-2, 2) * U; p.y = e.y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
          p.drag = 1.4; p.grav = 1.1; p.life = rand(0.7, 1.3); p.size = rand(1.0, 1.4) * U; p.flicker = 0.7;
          p.color = pick(e.colors); p.sprite = dotSprite(p.color);
        }
        if (Math.random() < dt * 1.2) this.addLight(e.x, e.y - 40 * U, e.colors[0], 0.3);
      }
    }
    // sky tint (phoenix finale)
    if (this.tint.i > 0.005) this.tint.i *= Math.exp(-dt * 0.5);

    // particles
    for (let i = 0; i < this.n; i++) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.kind === Kind.SenrinSub || p.kind === Kind.SubBreak || p.kind === Kind.Glitter || p.kind === Kind.Cascade1 || p.kind === Kind.Cascade2) this.subBurst(p);
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
          const e = this.spawn(true); if (!e) break;
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
    if (this.tint.i > 0.01) {
      const tg = ctx.createLinearGradient(0, 0, 0, waterY);
      tg.addColorStop(0, 'rgba(90,30,160,0)');
      tg.addColorStop(0.5, `rgba(110,40,200,${0.16 * this.tint.i})`);
      tg.addColorStop(1, `rgba(150,50,220,${0.26 * this.tint.i})`);
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, W, waterY);
    }
    for (const l of this.lights) {
      const [r, g, b] = hexRgb(l.color);
      const rad = 230 * U;
      const gr = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, rad);
      gr.addColorStop(0, `rgba(${r},${g},${b},${0.13 * l.i})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(l.x - rad, l.y - rad, rad * 2, rad * 2);
      // horizon glow: flattened ellipse, gradient reaches 0 inside the filled rect (no hard edge)
      const hr = Math.max(W, this.H) * 0.6;
      ctx.save();
      ctx.translate(l.x, waterY);
      ctx.scale(1, 0.5);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, hr);
      hg.addColorStop(0, `rgba(${r},${g},${b},${0.2 * l.i})`);
      hg.addColorStop(0.5, `rgba(${r},${g},${b},${0.06 * l.i})`);
      hg.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(-hr, -hr, hr * 2, hr);
      ctx.restore();
    }
    if (this.town) this.aggregateLight();
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

    if (this.scene !== 'lake') {
      // no water: just the cached ground fill, no snapshot / strip passes
      ctx.drawImage(this.water, 0, this.canvas.height - this.water.height);
      if (this.town) {
        ctx.drawImage(this.fg, 0, Math.round(this.town.fgY0 * dpr));
        this.renderTownLight();
      }
      return;
    }
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.water, 0, this.canvas.height - this.water.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
