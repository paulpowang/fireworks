# Synthesize test tracks with known beat times (original, procedurally generated).
import numpy as np, wave, sys, json
def track(path, bpm, first, dur, sr=44100, seed=1):
    rng = np.random.default_rng(seed)
    n = int(dur*sr); y = np.zeros(n)
    per = 60/bpm
    beats = [first + k*per for k in range(int((dur-first)/per)+1) if first + k*per < dur-0.3]
    def env_at(t):  # song structure: intro quiet, build, loud, drop/peak
        return 0.25 if t < dur*0.2 else 0.5 if t < dur*0.6 else 0.8 if t < dur*0.8 else 1.0
    def add(t, sig):
        i = int(t*sr); j = min(n, i+len(sig)); y[i:j] += sig[:j-i]
    tt = np.arange(int(0.35*sr))/sr
    for k,b in enumerate(beats):
        e = env_at(b)
        kick = np.sin(2*np.pi*(50+90*np.exp(-tt*30))*tt) * np.exp(-tt*9) * e
        add(b, kick)
        if k % 2 == 1 and b > dur*0.2:  # snare on 2 & 4
            sn = rng.standard_normal(len(tt)) * np.exp(-tt*18) * 0.45 * e
            add(b, sn)
        hat = rng.standard_normal(int(0.04*sr)); hat = np.diff(hat, prepend=0) * np.exp(-np.arange(len(hat))/sr*90) * 0.12 * e
        add(b + per/2, hat)  # off-beat hats
        if b > dur*0.6:  # bass note on each beat
            bt = np.arange(int(per*0.9*sr))/sr
            add(b, 0.25*e*np.sin(2*np.pi*55*(1+ (k%4==2)*0.5)*bt)*np.exp(-bt*3))
    # soft pad so there is continuous energy
    t = np.arange(n)/sr
    y += 0.03*np.sin(2*np.pi*220*t)*np.array([env_at(x) for x in t[::sr//10]]).repeat(sr//10)[:n] if True else 0
    y /= np.max(np.abs(y)) * 1.1
    pcm = (y*32767).astype(np.int16)
    st = np.stack([pcm, pcm], axis=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(st.tobytes())
    json.dump({'bpm': bpm, 'beats': beats, 'dur': dur}, open(path.replace('.wav', '.json'), 'w'))
track('beat120.wav', 120, 1.0, 40, seed=1)
track('beat128.wav', 128, 0.73, 30, seed=2)
print('ok')
