// Synthesized fireworks sound effects (Web Audio, no samples).
export class Sfx {
  ctx: AudioContext | null = null;
  private bus!: GainNode; // everything goes into bus
  private out!: GainNode; // bus -> speakers (muted by mute toggle)
  dest: MediaStreamAudioDestinationNode | null = null; // bus -> recorder (not muted)
  private noise!: AudioBuffer;
  private crackleBuf!: AudioBuffer;
  private voices = 0;
  private lastPop = 0;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(comp);
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    comp.connect(this.out);
    this.out.connect(ctx.destination);
    try {
      this.dest = ctx.createMediaStreamDestination();
      comp.connect(this.dest);
    } catch {
      this.dest = null;
    }
    // white noise
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // crackle: sparse decaying clicks
    const clen = Math.floor(ctx.sampleRate * 1.6);
    this.crackleBuf = ctx.createBuffer(1, clen, ctx.sampleRate);
    const c = this.crackleBuf.getChannelData(0);
    let i = 0;
    while (i < clen) {
      i += Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.03) * (1 + (i / clen) * 2));
      const amp = (0.4 + Math.random() * 0.6) * (1 - i / clen);
      const n = Math.floor(ctx.sampleRate * (0.001 + Math.random() * 0.003));
      for (let k = 0; k < n && i + k < clen; k++) c[i + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (n * 0.3));
    }
    // iOS: play a silent buffer inside the gesture to fully unlock
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start(0);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  private ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private panner(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.bus);
      return p;
    }
    return this.bus;
  }

  private voice(dur: number) {
    this.voices++;
    setTimeout(() => this.voices--, dur * 1000 + 50);
  }

  /** rising launch: whoosh, sometimes a whistle */
  launch(pan: number, dur: number) {
    if (!this.ready() || this.voices > 14) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = this.panner(pan);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    if (Math.random() < 0.45) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = 1400 + Math.random() * 500;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.035, t + 0.08);
      og.gain.setValueAtTime(0.035, t + dur * 0.8);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    this.voice(dur);
  }

  /** burst boom: filtered noise + low thump. size 0..1 */
  boom(size: number, pan: number) {
    if (!this.ready() || this.voices > 16) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = this.panner(pan);
    const dur = 0.8 + size * 1.6;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 + size * 1800, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 + size * 0.6, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(85 + Math.random() * 20, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.4 + size * 0.5, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.65);
    this.voice(dur);
  }

  /** small pop used for senrin / multi-break secondary bursts (throttled) */
  pop(pan: number) {
    if (!this.ready() || this.voices > 22) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now - this.lastPop < 0.035) return;
    this.lastPop = now;
    const out = this.panner(pan);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(2500 + Math.random() * 1500, now);
    bp.frequency.exponentialRampToValueAtTime(300, now + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35 + Math.random() * 0.25, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    src.connect(bp).connect(g).connect(out);
    src.start(now, Math.random());
    src.stop(now + 0.32);
    this.voice(0.3);
  }

  crackle(pan: number, delay = 0) {
    if (!this.ready() || this.voices > 16) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const out = this.panner(pan);
    const src = ctx.createBufferSource();
    src.buffer = this.crackleBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0.7;
    src.connect(hp).connect(g).connect(out);
    src.start(t);
    this.voice(delay + 1.8);
  }
}
