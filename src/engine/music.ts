// In-browser music analysis (spectral-flux onsets, tempo, DP beat tracking, energy bands)
// and show generation for the 配樂同步 mode. Nothing is uploaded.
import type { FinaleKind, ShellType, Theme } from './themes';

export interface Analysis {
  duration: number; // full track length (s)
  analyzed: number; // seconds actually analyzed (capped for very long files)
  hop: number; // seconds per frame
  t0: number; // time offset of frame 0 (frame centre)
  env: Float32Array; // smoothed loudness 0..1
  low: Float32Array; // low band 0..1
  high: Float32Array; // high band 0..1
  onsets: { t: number; s: number }[];
  beats: number[];
  bpm: number;
  peak: [number, number]; // loudest ~10 s window
  fallback: boolean;
}

export interface ShowEvent {
  t: number; // when the burst should happen (track time, s)
  type: ShellType | 'finale';
  finale?: FinaleKind; // for type 'finale': which finale (its climax lands on t)
  x: number; // 0..1 of width
  y: number; // 0..1 of sky height (0 = top)
  scale: number;
  launched?: boolean;
}

const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------- FFT (radix-2, in place) ----------
function makeFFT(n: number) {
  const levels = Math.log2(n) | 0;
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  return (re: Float32Array, im: Float32Array) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cos[k] + im[b] * sin[k];
          const ti = -re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}

function movingAvg(a: Float32Array, w: number) {
  const n = a.length, out = new Float32Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1);
    out[i] = (pre[hi] - pre[lo]) / (hi - lo);
  }
  return out;
}
function percentile(a: Float32Array, p: number) {
  const s = Array.from(a).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
}
function normalize(a: Float32Array, lo = 0.05, hi = 0.98) {
  const pl = percentile(a, lo), ph = percentile(a, hi);
  const d = ph - pl || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.max(0, Math.min(1, (a[i] - pl) / d));
  return out;
}

/** Analyze a decoded track. onProgress gets 0..1. maxSec caps analysis time for very long files. */
export async function analyzeTrack(buf: AudioBuffer, onProgress: (p: number) => void, maxSec = 600): Promise<Analysis> {
  const srcSr = buf.sampleRate;
  const factor = Math.max(1, Math.round(srcSr / 22050));
  const sr = srcSr / factor;
  const analyzed = Math.min(buf.duration, maxSec);
  const n = Math.floor((analyzed * srcSr) / factor);
  // mono + decimate (box filter) -- chunked so the UI stays responsive
  const mono = new Float32Array(n);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const nc = chans.length;
  const CH = 1 << 18;
  for (let start = 0; start < n; start += CH) {
    const end = Math.min(n, start + CH);
    for (let i = start; i < end; i++) {
      let s = 0;
      const b = i * factor;
      for (let c = 0; c < nc; c++) { const d = chans[c]; for (let k = 0; k < factor; k++) s += d[b + k] || 0; }
      mono[i] = s / (nc * factor);
    }
    onProgress(0.15 * (end / n));
    await yieldUI();
  }

  const N = 1024, H = 256;
  const frames = Math.max(0, Math.floor((n - N) / H) + 1);
  const hop = H / sr;
  const fft = makeFFT(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
  const fLow = new Float32Array(frames), fMid = new Float32Array(frames), fHigh = new Float32Array(frames);
  const flux = new Float32Array(frames), rms = new Float32Array(frames), low = new Float32Array(frames), high = new Float32Array(frames);
  const binHz = sr / N;
  const lowMax = Math.max(2, Math.round(180 / binHz)), highMin = Math.round(3500 / binHz);
  const midMax = Math.round(2000 / binHz);
  for (let f = 0; f < frames; f++) {
    const o = f * H;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = mono[o + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let fl = 0, lo = 0, hi = 0, dl = 0, dm = 0, dh = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.log1p(100 * Math.hypot(re[k], im[k]));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) { fl += d; if (k <= lowMax) dl += d; else if (k <= midMax) dm += d; else dh += d; }
      if (k <= lowMax) lo += m; else if (k >= highMin) hi += m;
    }
    flux[f] = fl; low[f] = lo; high[f] = hi; fLow[f] = dl; fMid[f] = dm; fHigh[f] = dh;
    const t = prev; prev = cur; cur = t;
    if (f % 1500 === 0) { onProgress(0.15 + 0.6 * (f / frames)); await yieldUI(); }
  }
  if (frames < 50) throw new Error('track too short');
  // time of frame 0: window centre + one hop (flux compares frame f with f-1; calibrated on
  // synthetic tracks with known beat times, removes a consistent ~-12 ms bias)
  const t0 = (N / 2 + H) / sr;

  // onsets: adaptive threshold (local mean * k + floor), local maxima, min gap
  const fp99 = percentile(flux, 0.99) || 1;
  const fmean = movingAvg(flux, Math.round(0.5 / hop));
  const onsets: { t: number; s: number }[] = [];
  const gap = Math.round(0.1 / hop);
  let lastOn = -1e9;
  for (let f = 3; f < frames - 3; f++) {
    const v = flux[f];
    const th = fmean[f] * 1.35 + 0.04 * fp99;
    if (v <= th) continue;
    if (v < flux[f - 1] || v < flux[f + 1] || v < flux[f - 2] || v < flux[f + 2] || v < flux[f - 3] || v < flux[f + 3]) continue;
    if (f - lastOn < gap) continue;
    lastOn = f;
    onsets.push({ t: t0 + f * hop, s: Math.min(1, (v - th) / fp99 + 0.2) });
  }
  onProgress(0.8);
  await yieldUI();

  // onset envelope for tempo / beat tracking: per-band flux, each normalised, weighted toward
  // low/mid bands (kick/snare carry the beat; hats have many bins and would otherwise dominate)
  const oenv = new Float32Array(frames);
  const bands: [Float32Array, number][] = [[fLow, 0.55], [fMid, 0.3], [fHigh, 0.15]];
  for (const [bf, w] of bands) {
    const m = movingAvg(bf, Math.round(0.5 / hop));
    const tmp = new Float32Array(frames);
    let sq = 0;
    for (let f = 0; f < frames; f++) { tmp[f] = Math.max(0, bf[f] - m[f]); sq += tmp[f] * tmp[f]; }
    const sdb = Math.sqrt(sq / frames) || 1;
    for (let f = 0; f < frames; f++) oenv[f] += (w * tmp[f]) / sdb;
  }
  let sd = 0;
  for (let f = 0; f < frames; f++) sd += oenv[f] * oenv[f];
  sd = Math.sqrt(sd / frames) || 1;
  for (let f = 0; f < frames; f++) oenv[f] /= sd;

  // tempo: autocorrelation over 60-200 BPM, log-gaussian prior around 120
  const minLag = Math.floor(60 / 200 / hop), maxLag = Math.ceil(60 / 60 / hop);
  const acLen = Math.min(frames, Math.round(180 / hop));
  const ac = new Float32Array(maxLag + 2);
  for (let L = minLag - 1; L <= maxLag + 1; L++) {
    let s = 0;
    for (let f = L; f < acLen; f++) s += oenv[f] * oenv[f - L];
    ac[L] = s / (acLen - L);
  }
  let bestL = minLag, bestV = -1;
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = 60 / (L * hop);
    const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);
    const v = ac[L] * w;
    if (v > bestV) { bestV = v; bestL = L; }
  }
  // octave check: prefer the faster pulse when it is nearly as periodic (kick on every beat,
  // snare on 2 & 4 tends to make the half-tempo lag win), and vice-versa for very fast picks
  for (let guard = 0; guard < 2; guard++) {
    const half = Math.round(bestL / 2);
    const bpmNow = 60 / (bestL * hop);
    if (half >= minLag && bpmNow < 100 && ac[half] > 0.5 * ac[bestL]) { bestL = half; continue; }
    const dbl = bestL * 2;
    if (dbl <= maxLag && bpmNow > 180 && ac[dbl] > 0.8 * ac[bestL]) { bestL = dbl; continue; }
    break;
  }
  // local max around the chosen lag, then parabolic refinement
  for (let L = Math.max(minLag, bestL - 2); L <= Math.min(maxLag, bestL + 2); L++) if (ac[L] > ac[bestL]) bestL = L;
  const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1];
  const den = a - 2 * b + c;
  const P = bestL + (den ? (0.5 * (a - c)) / den : 0);
  const bpm = 60 / (P * hop);
  onProgress(0.85);
  await yieldUI();

  // beat tracking: dynamic programming (Ellis 2007)
  const score = new Float32Array(frames), back = new Int32Array(frames).fill(-1);
  const alpha = 100;
  const lo = Math.round(P / 2), hiL = Math.round(2 * P);
  for (let f = 0; f < frames; f++) {
    let best = 0, bi = -1;
    for (let pf = f - hiL; pf <= f - lo; pf++) {
      if (pf < 0) continue;
      const r = Math.log((f - pf) / P);
      const v = score[pf] - alpha * r * r;
      if (bi < 0 || v > best) { best = v; bi = pf; }
    }
    score[f] = oenv[f] + (bi >= 0 ? Math.max(0, best) : 0);
    back[f] = bi >= 0 && best > 0 ? bi : -1;
    if (f % 4000 === 0) { onProgress(0.85 + 0.1 * (f / frames)); await yieldUI(); }
  }
  // end: best score within the last period
  let endF = frames - 1, endV = -1;
  for (let f = Math.max(0, frames - Math.round(P)); f < frames; f++) if (score[f] > endV) { endV = score[f]; endF = f; }
  const beatsF: number[] = [];
  for (let f = endF; f >= 0; f = back[f]) { beatsF.push(f); if (back[f] < 0) break; }
  beatsF.reverse();
  let beats = beatsF.map((f) => t0 + f * hop);
  // extend the grid before the first tracked beat, but never before the music actually starts
  while (beats.length && beats[0] - P * hop > 0.3) beats.unshift(beats[0] - P * hop);
  const firstSound = onsets.length ? onsets[0].t - 0.08 : 0;
  beats = beats.filter((t) => t >= firstSound);

  // energy & bands
  const env = normalize(movingAvg(rms, Math.round(0.6 / hop)));
  const lowN = normalize(movingAvg(low, Math.round(0.25 / hop)));
  const highN = normalize(movingAvg(high, Math.round(0.25 / hop)));
  // loudest ~10 s window
  const wF = Math.round(10 / hop);
  const envAvg = movingAvg(env, Math.round(wF / 2));
  let pk = 0;
  for (let f = 0; f < frames; f++) if (envAvg[f] > envAvg[pk]) pk = f;
  const pc = t0 + pk * hop;
  // tracks longer than the analysis cap: continue the beat grid with the estimated tempo
  if (buf.duration > analyzed && beats.length) {
    const per = P * hop;
    for (let t = beats[beats.length - 1] + per; t < buf.duration - 0.2; t += per) beats.push(t);
  }
  onProgress(1);
  return {
    duration: buf.duration, analyzed, hop, t0, env, low: lowN, high: highN, onsets, beats, bpm,
    peak: [Math.max(0, pc - 5), Math.min(analyzed, pc + 5)], fallback: false,
  };
}

/** Simple fallback when analysis fails: steady 120 BPM grid, medium energy */
export function fallbackAnalysis(duration: number): Analysis {
  const beats: number[] = [];
  for (let t = 0.5; t < duration - 0.2; t += 0.5) beats.push(t);
  const e = new Float32Array([0.5]);
  return {
    duration, analyzed: 0, hop: 1, t0: 0, env: e, low: e, high: e, onsets: [], beats, bpm: 120,
    peak: [Math.max(0, duration - 12), Math.max(0, duration - 2)], fallback: true,
  };
}

// small seeded RNG so a given track always produces the same show
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function generateShow(an: Analysis, theme: Theme, finale: FinaleKind | 'random' = 'classic'): ShowEvent[] {
  const r = rng(Math.round(an.duration * 1000) + an.beats.length);
  const at = (arr: Float32Array, t: number) => {
    if (arr.length === 1) return arr[0];
    const f = Math.round((t - an.t0) / an.hop);
    return f < 0 || f >= arr.length ? 0.5 : arr[f];
  };
  const pickW = (types: ShellType[]) => {
    const w = types.map((t) => (theme.weights[t] ?? 0.5) + 0.3);
    let tot = 0; for (const v of w) tot += v;
    let x = r() * tot;
    for (let i = 0; i < types.length; i++) { x -= w[i]; if (x <= 0) return types[i]; }
    return types[0];
  };
  const ev: ShowEvent[] = [];
  let lane = r();
  const nextX = () => { lane = (lane + 0.38 + r() * 0.24) % 1; return 0.12 + lane * 0.76; };
  const add = (t: number, type: ShellType, scale: number, x = nextX(), y?: number) => {
    if (t < 0.15 || t > an.duration) return;
    const yy = y ?? (0.15 + (1 - Math.min(1, scale)) * 0.25 + r() * 0.2);
    ev.push({ t, type, x: Math.max(0.06, Math.min(0.94, x)), y: Math.max(0.08, Math.min(0.62, yy)), scale });
  };
  const inPeak = (t: number) => t >= an.peak[0] && t <= an.peak[1];
  // set pieces (waterfall / ground / starmine) last several seconds: keep them apart
  let lastSet = -1e9;
  const setPiece = (t: number, type: ShellType, x = 0.5, y = 0.45) => {
    if (t - lastSet < 7) return false;
    lastSet = t;
    add(t, type, 1, x, y);
    return true;
  };
  let wasLoud = false;

  an.beats.forEach((bt, i) => {
    const e = at(an.env, bt), lo = at(an.low, bt), hi = at(an.high, bt);
    const down = i % 4 === 0;
    const eBefore = at(an.env, bt - 1.5);
    const drop = e - eBefore > 0.35 && e > 0.6;
    const big = 0.8 + lo * 0.35;
    const loud = e >= 0.72;
    const enteringLoud = loud && !wasLoud;
    wasLoud = loud;
    if (drop) {
      // drop: waterfall curtain (if free) + senrin cluster across the sky
      if (r() < 0.5 && setPiece(bt, 'niagara', 0.5, 0.45)) add(bt, 'senrin', 1.05, 0.5, 0.15);
      else for (let k = 0; k < 4; k++) add(bt, 'senrin', 1.05, 0.15 + k * 0.233 + (r() - 0.5) * 0.06, 0.18 + r() * 0.15);
      return;
    }
    if (enteringLoud && r() < 0.6) setPiece(bt, 'ground');
    if (e < 0.2) {
      if (i % 2 === 0) add(bt, down && r() < 0.35 ? 'kamuro' : r() < 0.5 ? 'peony' : 'willow', 0.7 + lo * 0.2);
    } else if (e < 0.45) {
      add(bt, down ? (r() < 0.35 ? 'palm' : 'chrysanthemum') : r() < 0.6 ? 'peony' : 'ring', 0.8 + lo * 0.2);
    } else if (e < 0.72) {
      add(bt, pickW(['peony', 'chrysanthemum', 'senrin', 'ring', 'heart', 'willow', 'pistil', 'palm', 'kamuro']), big);
      if (down) add(bt, pickW(['senrin', 'multibreak', 'pistil']), big);
      if (hi > 0.7 && r() < 0.4) add(bt, 'crackle', 0.9);
    } else {
      // peaks: senrin clusters / starmine, multi-break, glitter
      if (down && inPeak(bt) && r() < 0.4 && setPiece(bt, 'starmine', 0.5, 0.5)) {
        add(bt, 'kamuro', 1.05, 0.5, 0.15);
      } else if (down || inPeak(bt)) {
        const cx = 0.25 + r() * 0.5;
        add(bt, 'senrin', 1.05, cx - 0.22); add(bt, 'senrin', 1.1, cx); add(bt, 'senrin', 1.05, cx + 0.22);
      } else {
        add(bt, r() < 0.5 ? 'senrin' : 'multibreak', big);
      }
      if (hi > 0.6 && r() < 0.5) add(bt, 'crackle', 1);
    }
  });

  // strong off-beat onsets -> small accents
  if (an.onsets.length) {
    const per = 60 / an.bpm;
    let bi = 0;
    for (const o of an.onsets) {
      while (bi < an.beats.length - 1 && an.beats[bi + 1] <= o.t) bi++;
      const near = Math.min(Math.abs(o.t - (an.beats[bi] ?? -9)), Math.abs((an.beats[bi + 1] ?? 1e9) - o.t));
      if (near > Math.min(0.09, per * 0.2) && o.s > 0.55 && at(an.env, o.t) > 0.3 && r() < 0.6)
        add(o.t, r() < 0.5 ? 'peony' : 'ring', 0.6, undefined, 0.3 + r() * 0.2);
    }
  }

  // finale: last beats of the track (if it ends loud) or end of the loudest section
  const endLoud = at(an.env, an.duration - 3) > 0.45 || an.fallback;
  const fEnd = endLoud ? an.duration - 0.3 : an.peak[1];
  const fb = an.beats.filter((b) => b > fEnd - 4 && b <= fEnd);
  fb.forEach((b, j) => {
    const last = j === fb.length - 1;
    const n = last ? 7 : 2;
    for (let k = 0; k < n; k++) add(b, last ? (k % 2 ? 'crackle' : 'senrin') : 'multibreak', 1.05, (k + 0.5) / n + (r() - 0.5) * 0.05, last ? 0.15 + r() * 0.12 : undefined);
  });

  // special finale: its climax lands on a beat near the end of the finale section
  const fk: FinaleKind = finale === 'random' ? (['classic', 'nagaoka', 'phoenix'] as FinaleKind[])[Math.floor(r() * 3)] : finale;
  if (fk !== 'classic') {
    const target = fk === 'phoenix' ? fEnd - 6.2 : fEnd - 4.5; // phoenix: 3 waves 3 s apart; nagaoka: rows at +0/+2.6/+5.2 s
    const climaxMin = fk === 'phoenix' ? 0.5 : 2.0;
    const cand = an.beats.filter((b) => b >= climaxMin);
    if (cand.length) {
      const bt = cand.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), cand[0]);
      // clear regular shells while the finale runs so it stays readable and within budget
      const endT = bt + (fk === 'phoenix' ? 6.5 : 6);
      for (let k = ev.length - 1; k >= 0; k--) if (ev[k].t > bt - 0.3 && ev[k].t < endT && r() < 0.75) ev.splice(k, 1);
      ev.push({ t: bt, type: 'finale', finale: fk, x: 0.5, y: 0.4, scale: 1 });
    }
  }

  // density cap: at most 9 bursts in any 0.5 s window
  ev.sort((a, b) => a.t - b.t);
  const out: ShowEvent[] = [];
  for (const e of ev) {
    let cnt = 0;
    for (let k = out.length - 1; k >= 0 && e.t - out[k].t < 0.5; k--) cnt++;
    if (cnt < 9) out.push(e);
  }
  return out;
}

/** Plays an AudioBuffer through the shared audio graph with pause/seek. */
export class MusicPlayer {
  private src: AudioBufferSourceNode | null = null;
  private startedAt = 0; // ctx time when offset 0 would have played
  private offset = 0;
  playing = false;
  onEnded?: () => void;
  constructor(private ctx: AudioContext, private out: AudioNode, public buffer: AudioBuffer) {}

  /** track time as heard (compensates output latency) */
  get time() {
    if (!this.playing) return this.offset;
    const lat = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency || this.ctx.baseLatency || 0;
    return Math.max(0, Math.min(this.buffer.duration, this.ctx.currentTime - this.startedAt - lat));
  }
  get duration() { return this.buffer.duration; }

  play() {
    if (this.playing) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.offset >= this.buffer.duration - 0.05) this.offset = 0;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.connect(this.out);
    s.onended = () => {
      if (this.src !== s) return;
      this.playing = false; this.src = null; this.offset = this.buffer.duration;
      this.onEnded?.();
    };
    s.start(0, this.offset);
    this.startedAt = this.ctx.currentTime - this.offset;
    this.src = s;
    this.playing = true;
  }
  pause() {
    if (!this.playing) return;
    this.offset = this.ctx.currentTime - this.startedAt;
    this.kill();
  }
  stop() { this.kill(); this.offset = 0; }
  seek(t: number) {
    const was = this.playing;
    this.kill();
    this.offset = Math.max(0, Math.min(this.buffer.duration, t));
    if (was) this.play();
  }
  private kill() {
    const s = this.src;
    this.src = null;
    this.playing = false;
    if (s) { try { s.onended = null; s.stop(); } catch { /* ignore */ } s.disconnect(); }
  }
}
