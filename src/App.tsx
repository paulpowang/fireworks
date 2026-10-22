import { useEffect, useRef, useState } from 'react';
import { Fireworks } from './engine/fireworks';
import { Sfx } from './engine/audio';
import MusicPanel from './MusicPanel';
import { FINALES, LANDMARK_SCENES, SCENES, SHELLS, THEMES, type FinaleKind, type SceneId, type ShellType, type ThemeId } from './engine/themes';

type Result = { blob: Blob; url: string; name: string; kind: 'video' | 'image' };

const Icon = {
  sound: (
    <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" /></svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" /></svg>
  ),
  mirror: (
    <svg viewBox="0 0 24 24"><path d="M12 3v18" fill="none" strokeDasharray="2 2" /><path d="M10 6L3 18h7zM14 6l7 12h-7z" fill="none" /></svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" fill="none" /><circle cx="12" cy="13" r="3.5" fill="none" /></svg>
  ),
  rec: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" /><circle cx="12" cy="12" r="4.5" className="fill" /></svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5" className="fill" /></svg>
  ),
};

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const t of list) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fwRef = useRef<Fireworks | null>(null);
  const sfxRef = useRef(new Sfx());
  const recRef = useRef<MediaRecorder | null>(null);
  const recTimer = useRef<number>(0);

  const [shell, setShell] = useState<ShellType | 'random'>('senrin');
  const [theme, setTheme] = useState<ThemeId>('sakura');
  // SFX default muted; remember the user's choice
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem('fw.sfxMuted') !== '0'; } catch { return true; } });
  const [musicOpen, setMusicOpen] = useState(false);
  const [finaleKind, setFinaleKind] = useState<FinaleKind | 'random'>(() => {
    try { return (localStorage.getItem('fw.finale') as FinaleKind | 'random') || 'classic'; } catch { return 'classic'; }
  });
  const [finaleMenu, setFinaleMenu] = useState(false);
  // scene: default 'field' (no water reflection = lighter rendering); remembered
  const [scene, setScene] = useState<SceneId>(() => {
    // 'fw.sceneChoice' is only written when the user picks a scene (the old 'fw.scene' key was
    // auto-saved on load, so it is ignored and new visitors get the new default 小鎮車站)
    try { const v = localStorage.getItem('fw.sceneChoice') as SceneId | null; return v && SCENES.some((x) => x.id === v) ? v : 'town'; } catch { return 'town'; }
  });
  const [sceneMenu, setSceneMenu] = useState(false);
  const [fwReady, setFwReady] = useState<Fireworks | null>(null);
  const [mirror, setMirror] = useState(false);
  const [auto, setAuto] = useState(false);
  const [text, setText] = useState('煙火');
  const [hint, setHint] = useState(true);
  const [recSec, setRecSec] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [toast, setToast] = useState('');
  const [debug] = useState(() => new URLSearchParams(location.search).has('debug'));
  const [stats, setStats] = useState('');
  // landscape: 'off' | 'locked' (fullscreen + orientation lock) | 'rotated' (CSS rotate fallback)
  const [landMode, setLandMode] = useState<'off' | 'locked' | 'rotated'>('off');
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, []);
  const physLand = vp.w > vp.h;
  // never double-rotate: if the phone is physically landscape, drop the CSS rotation
  const rotated = landMode === 'rotated' && !physLand;
  const isLand = physLand || rotated;
  useEffect(() => { if (fwRef.current) fwRef.current.rotated = rotated; }, [rotated]);
  useEffect(() => {
    if (landMode === 'rotated' && physLand) setLandMode('off');
  }, [physLand, landMode]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement && landMode === 'locked') setLandMode('off'); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [landMode]);

  const toggleLandscape = async () => {
    if (landMode !== 'off') {
      if (landMode === 'locked') {
        try { (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.(); } catch { /* ignore */ }
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      }
      setLandMode('off');
      return;
    }
    const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    const root = document.documentElement;
    if (so?.lock && root.requestFullscreen) {
      let enteredFs = false;
      try {
        await root.requestFullscreen({ navigationUI: 'hide' });
        enteredFs = true;
        await so.lock('landscape');
        setLandMode('locked');
        return;
      } catch {
        if (enteredFs && document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      }
    }
    if (physLand) {
      flash('已是橫向畫面');
      return;
    }
    setLandMode('rotated'); // iOS Safari etc.: rotate the app container 90deg
  };

  useEffect(() => {
    const fw = new Fireworks(canvasRef.current!, sfxRef.current, scene);
    fwRef.current = fw;
    setFwReady(fw);
    fw.onInteract = () => {
      sfxRef.current.unlock();
      setHint(false);
    };
    fw.start();
    // a gentle welcome burst so the screen isn't empty
    const t = setTimeout(() => {
      fw.launch(fw.W * 0.5, fw.H * 0.25, 'senrin');
      setTimeout(() => fw.launch(fw.W * 0.3, fw.H * 0.33, 'senrin'), 500);
      setTimeout(() => fw.launch(fw.W * 0.72, fw.H * 0.3, 'peony'), 900);
    }, 400);
    const onVis = () => (document.hidden ? fw.stop() : fw.start());
    document.addEventListener('visibilitychange', onVis);
    // block iOS pinch / double-tap zoom
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('dblclick', prevent);
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __fw: Fireworks }).__fw = fw;
    let si = 0;
    if (new URLSearchParams(location.search).has('debug')) si = window.setInterval(() => setStats(`${fw.fps} fps · ${fw.particleCount} 粒子`), 500);
    return () => {
      clearTimeout(t);
      clearInterval(si);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('dblclick', prevent);
      fw.destroy();
    };
  }, []);

  useEffect(() => { if (fwRef.current) fwRef.current.shell = shell; }, [shell]);
  useEffect(() => { fwRef.current?.setTheme(theme); }, [theme]);
  useEffect(() => {
    fwRef.current?.setScene(scene);
  }, [scene]);
  useEffect(() => { if (fwRef.current) fwRef.current.mirror = mirror; }, [mirror]);
  useEffect(() => { fwRef.current?.setAuto(auto); }, [auto]);
  useEffect(() => {
    sfxRef.current.setMuted(muted);
    try { localStorage.setItem('fw.sfxMuted', muted ? '1' : '0'); } catch { /* private mode */ }
  }, [muted]);
  useEffect(() => { fwRef.current?.setText(text); }, [text]);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2200);
  };

  // UI taps also count as a user gesture for audio
  const ui = (fn: () => void) => () => {
    sfxRef.current.unlock();
    setHint(false);
    fn();
  };

  const startRec = () => {
    const canvas = canvasRef.current!;
    const mime = pickMime();
    if (mime === null || !canvas.captureStream) {
      flash('此瀏覽器不支援錄影，可改用截圖');
      return;
    }
    const stream = canvas.captureStream(30);
    const ad = sfxRef.current.dest;
    if (ad) ad.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    } catch {
      flash('無法開始錄影');
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(recTimer.current);
      setRecSec(null);
      stream.getVideoTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      if (!blob.size) return flash('錄影失敗');
      setResult({ blob, url: URL.createObjectURL(blob), name: `fireworks-${Date.now()}.${ext}`, kind: 'video' });
    };
    rec.start(250);
    recRef.current = rec;
    const t0 = Date.now();
    setRecSec(0);
    recTimer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setRecSec(s);
      if (s >= 30) stopRec();
    }, 250);
  };
  const stopRec = () => {
    const r = recRef.current;
    if (r && r.state !== 'inactive') r.stop();
    recRef.current = null;
  };

  const screenshot = () => {
    canvasRef.current!.toBlob((b) => {
      if (!b) return flash('截圖失敗');
      setResult({ blob: b, url: URL.createObjectURL(b), name: `fireworks-${Date.now()}.png`, kind: 'image' });
    }, 'image/png');
  };

  const share = async () => {
    if (!result) return;
    const file = new File([result.blob], result.name, { type: result.blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: '煙火' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    download();
  };
  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const closeResult = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
  };

  return (
    <div
      className={'app' + (isLand ? ' land' : '') + (rotated ? ' rot' : '')}
      style={rotated ? { width: vp.h + 'px', height: vp.w + 'px', transform: `translateX(${vp.w}px) rotate(90deg)` } : undefined}
    >
      <canvas ref={canvasRef} className="stage" />

      <div className="top">
        <div className="group">
          <button className={'pill' + (auto ? ' on' : '')} onClick={ui(() => setAuto((a) => !a))}>
            {auto ? '停止' : '自動秀'}
          </button>
          <button className={'pill gold' + (finaleMenu ? ' on' : '')} onClick={ui(() => setFinaleMenu((m) => !m))}>
            終章 ▾
          </button>
          <button className={'pill' + (landMode !== 'off' ? ' on' : '')} onClick={ui(() => void toggleLandscape())}>
            {landMode !== 'off' ? '直屏' : '橫屏'}
          </button>
        </div>
        <div className="group">
          <button className="icon" aria-label={muted ? '開啟聲音' : '靜音'} onClick={ui(() => { setMuted((m) => { flash(m ? '音效已開啟' : '音效已關閉'); return !m; }); })}>
            {muted ? Icon.mute : Icon.sound}
          </button>
          <button className={'icon' + (mirror ? ' on' : '')} aria-label="鏡像" onClick={ui(() => setMirror((m) => !m))}>
            {Icon.mirror}
          </button>
          <button className="icon" aria-label="截圖" onClick={ui(screenshot)}>
            {Icon.camera}
          </button>
          <button className={'icon rec' + (recSec !== null ? ' on' : '')} aria-label="錄影" onClick={ui(() => (recSec !== null ? stopRec() : startRec()))}>
            {recSec !== null ? Icon.stop : Icon.rec}
          </button>
        </div>
      </div>
      {finaleMenu && (
        <div className="finmenu" onPointerDown={(e) => e.stopPropagation()}>
          {FINALES.filter((f) => f.id !== 'tower' || LANDMARK_SCENES.includes(scene)).map((f) => (
            <button
              key={f.id}
              className={'chip' + (finaleKind === f.id ? ' on' : '')}
              onClick={ui(() => {
                setFinaleKind(f.id);
                try { localStorage.setItem('fw.finale', f.id); } catch { /* ignore */ }
                setFinaleMenu(false);
                const used = fwRef.current?.finale(f.id);
                if (used) flash(FINALES.find((x) => x.id === used)?.label ?? '終章');
              })}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {sceneMenu && (
        <div className="scenemenu" onPointerDown={(e) => e.stopPropagation()}>
          {SCENES.map((sc) => (
            <button
              key={sc.id}
              className={'chip' + (scene === sc.id ? ' on' : '')}
              onClick={ui(() => { setScene(sc.id); try { localStorage.setItem('fw.sceneChoice', sc.id); } catch { /* ignore */ } setSceneMenu(false); flash(sc.label); })}
            >
              {sc.label}
            </button>
          ))}
        </div>
      )}
      {recSec !== null && <div className="recbadge">● 錄影中 {recSec}s</div>}
      {debug && <div className="stats">{stats}</div>}

      <div className={'hint' + (hint ? '' : ' hide')}>點一下或滑動，放煙火</div>
      {toast && <div className="toast">{toast}</div>}

      <div className="bottom">
        {shell === 'text' && (
          <input
            className="textin"
            value={text}
            maxLength={8}
            onChange={(e) => setText(e.target.value)}
            placeholder="輸入文字"
            enterKeyHint="done"
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        )}
        {musicOpen && (
          <MusicPanel
            fw={fwReady}
            sfx={sfxRef.current}
            theme={THEMES.find((t) => t.id === theme) || THEMES[0]}
            finale={finaleKind === 'tower' && !LANDMARK_SCENES.includes(scene) ? 'classic' : finaleKind}
            onClose={() => setMusicOpen(false)}
            onPlayingChange={(p) => { if (p) setAuto(false); }}
            toast={flash}
          />
        )}
        <div className="themes">
          <button className={'pill small' + (musicOpen ? ' on' : '')} onClick={ui(() => setMusicOpen((o) => !o))}>♪ 配樂</button>
          <button className={'pill small' + (sceneMenu ? ' on' : '')} onClick={ui(() => setSceneMenu((o) => !o))}>換場景</button>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={'theme' + (theme === t.id ? ' on' : '')}
              onClick={ui(() => { setTheme(t.id); flash(t.name); })}
              aria-label={t.name}
              style={{ background: t.swatch }}
            />
          ))}
        </div>
        <div className="shells">
          {SHELLS.map((s) => (
            <button key={s.id} className={'chip' + (shell === s.id ? ' on' : '')} onClick={ui(() => setShell(s.id))}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="sheet" onClick={closeResult}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            {result.kind === 'video' ? (
              <video src={result.url} controls playsInline autoPlay loop muted />
            ) : (
              <img src={result.url} alt="截圖" />
            )}
            <div className="row">
              <button className="pill gold" onClick={share}>分享</button>
              <button className="pill" onClick={download}>下載</button>
              <button className="pill" onClick={closeResult}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
