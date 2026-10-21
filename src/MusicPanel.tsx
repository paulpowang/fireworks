import { useEffect, useRef, useState } from 'react';
import type { Fireworks } from './engine/fireworks';
import type { Sfx } from './engine/audio';
import type { FinaleKind, Theme } from './engine/themes';
import { Fireworks as FW } from './engine/fireworks';
import { analyzeTrack, fallbackAnalysis, generateShow, MusicPlayer, type Analysis, type ShowEvent } from './engine/music';

const MAX_BYTES = 80 * 1024 * 1024;
const fmt = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Phase = 'idle' | 'decoding' | 'analyzing' | 'ready' | 'error';

interface Props {
  fw: Fireworks | null;
  sfx: Sfx;
  theme: Theme;
  finale: FinaleKind | 'random';
  onClose: () => void;
  onPlayingChange: (p: boolean) => void;
  toast: (m: string) => void;
}

export default function MusicPanel({ fw, sfx, theme, finale, onClose, onPlayingChange, toast }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState('');
  const [info, setInfo] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const playerRef = useRef<MusicPlayer | null>(null);
  const anRef = useRef<Analysis | null>(null);
  const evRef = useRef<ShowEvent[]>([]);
  const idxRef = useRef(0);
  const jobRef = useRef(0);
  const seekingRef = useRef(false);

  const markFrom = (t: number) => {
    for (const e of evRef.current) e.launched = e.t < t + 0.05;
    idxRef.current = 0;
  };

  // scheduler: runs every animation frame inside the engine loop
  useEffect(() => {
    if (!fw) return;
    const debug = new URLSearchParams(location.search).has('debug');
    const w = window as unknown as { __bursts?: { t: number; type: string }[]; __music?: unknown };
    if (debug) {
      w.__bursts = [];
      fw.onBurst = (type) => {
        const p = playerRef.current;
        if (p && p.playing) w.__bursts!.push({ t: p.time, type });
      };
    }
    fw.musicClock = () => { const p = playerRef.current; return p && p.playing ? p.time : null; };
    fw.onFrame = () => {
      const p = playerRef.current;
      if (!p || !p.playing) return;
      const now = p.time;
      const evs = evRef.current;
      let i = idxRef.current;
      while (i < evs.length && evs[i].launched) i++;
      idxRef.current = i;
      const skyFrac = fw.landTop / fw.H;
      for (let k = i; k < evs.length && evs[k].t <= now + 2; k++) {
        const e = evs[k];
        if (e.launched) continue;
        const yn = e.y * skyFrac;
        const flight = e.type === 'finale' ? FW.finaleClimax(e.finale!) : fw.flightFor(e.type, yn);
        const late = now - (e.t - flight);
        if (late < 0) continue;
        e.launched = true;
        if (late > Math.max(0.25, flight * 0.7)) continue; // too late (e.g. right after a seek): skip
        if (e.type === 'finale') fw.finale(e.finale!);
        else fw.launchTimed(e.x, yn, e.type, flight, late, e.scale);
      }
    };
    return () => {
      fw.onFrame = undefined;
      fw.musicClock = null;
      if (debug) fw.onBurst = undefined;
    };
  }, [fw]);

  // progress UI
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (p && !seekingRef.current) setTime(p.time);
    }, 200);
    return () => clearInterval(id);
  }, []);

  // theme change -> regenerate (keep position)
  useEffect(() => {
    const an = anRef.current;
    if (!an) return;
    evRef.current = generateShow(an, theme, finale);
    markFrom(playerRef.current?.time ?? 0);
  }, [theme, finale]);

  // cleanup on close
  useEffect(() => () => {
    jobRef.current++;
    playerRef.current?.stop();
    onPlayingChange(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { toast('檔案太大（上限 80MB）'); return; }
    sfx.unlock();
    const ctx = sfx.ctx;
    if (!ctx) { toast('此瀏覽器不支援 Web Audio'); return; }
    const job = ++jobRef.current;
    playerRef.current?.stop();
    setPlaying(false); onPlayingChange(false);
    setName(file.name.replace(/\.[^.]+$/, ''));
    setPhase('decoding'); setProgress(0); setInfo('');
    let buf: AudioBuffer;
    try {
      const data = await file.arrayBuffer();
      buf = await ctx.decodeAudioData(data);
    } catch {
      if (job === jobRef.current) { setPhase('error'); setInfo('無法解碼此音訊檔，請換 mp3 / m4a / wav'); }
      return;
    }
    if (job !== jobRef.current) return;
    setPhase('analyzing');
    let an: Analysis;
    try {
      an = await analyzeTrack(buf, (p) => job === jobRef.current && setProgress(p), 600);
      if (an.beats.length < 4) throw new Error('no beats');
    } catch {
      an = fallbackAnalysis(buf.duration);
    }
    if (job !== jobRef.current) return;
    anRef.current = an;
    evRef.current = generateShow(an, theme, finale);
    markFrom(0);
    const p = new MusicPlayer(ctx, sfx.musicIn, buf);
    p.onEnded = () => { setPlaying(false); onPlayingChange(false); setTime(p.duration); };
    playerRef.current = p;
    setDur(buf.duration); setTime(0);
    const capped = an.analyzed < buf.duration && !an.fallback ? ` · 前 ${Math.round(an.analyzed / 60)} 分鐘精準分析` : '';
    setInfo(an.fallback ? `簡易模式（分析失敗）· ${evRef.current.length} 發` : `約 ${Math.round(an.bpm)} BPM · ${an.beats.length} 拍 · ${evRef.current.length} 發${capped}`);
    setPhase('ready');
    (window as unknown as { __music?: unknown }).__music = { analysis: an, events: evRef.current, player: p };
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    sfx.unlock();
    if (p.playing) { p.pause(); setPlaying(false); onPlayingChange(false); }
    else { markFrom(p.time >= p.duration - 0.05 ? 0 : p.time); p.play(); setPlaying(true); onPlayingChange(true); }
  };
  const stop = () => {
    const p = playerRef.current;
    if (!p) return;
    p.stop(); markFrom(0); setPlaying(false); onPlayingChange(false); setTime(0);
  };
  const seek = (t: number) => {
    const p = playerRef.current;
    if (!p) return;
    markFrom(t);
    p.seek(t);
    setTime(t);
  };

  const picker = (label: string, cls = 'pill gold') => (
    <label className={cls} onClick={() => sfx.unlock()}>
      <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {label}
    </label>
  );

  return (
    <div className="musicbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mrow">
        <span className="mtitle">♪ {name || '配樂同步'}</span>
        <button className="mclose" aria-label="關閉配樂" onClick={onClose}>✕</button>
      </div>
      {phase === 'idle' && (
        <div className="mrow">
          <span className="mhint">選一首手機裡的歌，煙火會跟著節拍綻放（只在本機分析，不上傳）</span>
          {picker('選擇音樂')}
        </div>
      )}
      {(phase === 'decoding' || phase === 'analyzing') && (
        <div className="mrow">
          <span className="mhint">{phase === 'decoding' ? '解碼中…' : `分析節拍中 ${Math.round(progress * 100)}%`}</span>
          <div className="mprog"><div style={{ width: `${(phase === 'decoding' ? 0.03 : progress) * 100}%` }} /></div>
        </div>
      )}
      {phase === 'error' && (
        <div className="mrow"><span className="mhint">{info}</span>{picker('換一首')}</div>
      )}
      {phase === 'ready' && (
        <>
          <div className="mrow">
            <button className="mbtn" aria-label={playing ? '暫停' : '播放'} onClick={toggle}>{playing ? '❚❚' : '▶'}</button>
            <button className="mbtn" aria-label="停止" onClick={stop}>■</button>
            <span className="mtime">{fmt(time)}</span>
            <input
              className="mseek" type="range" min={0} max={dur || 1} step={0.1} value={Math.min(time, dur)}
              onPointerDown={() => (seekingRef.current = true)}
              onChange={(e) => setTime(+e.target.value)}
              onPointerUp={(e) => { seekingRef.current = false; seek(+(e.target as HTMLInputElement).value); }}
              onKeyUp={(e) => seek(+(e.target as HTMLInputElement).value)}
            />
            <span className="mtime">{fmt(dur)}</span>
            {picker('換曲', 'pill small')}
          </div>
          <div className="mrow"><span className="mhint">{info}</span></div>
        </>
      )}
    </div>
  );
}
