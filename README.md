# 煙火 Fireworks

Mobile-first fireworks toy (Vite + React + TypeScript, 2D canvas with additive blending).
Inspired by Senrin (千輪) shells over water. Live: https://paulpowang.github.io/fireworks/

- Tap to launch, swipe for a volley. Shells: 千輪, 牡丹, 菊花, 柳, 愛心, 圓環, 多段, 三段連環, 閃爍, 光扇, 冠菊, 椰子, 雙芯, 地面火花, 速射連發, 文字.
- Finales: 經典終章, 長岡巨型, 鳳凰亂舞 (or random). Music-synced shows (配樂同步) from a local audio file.
- Scenes (換場景): 小鎮車站 (default: station, shop, yatai, rooftops lit by bursts), 河岸草地 (riverbank midground lit by bursts), 湖面倒影 (water reflection), 純夜空.
- Color themes, bloom, lit smoke, mirror mode, auto show / finale.
- Synthesized Web Audio, haptics, canvas recording + share, screenshot. Add `?debug` for fps.

```bash
npm install
npm run dev     # local dev
npm run build   # production build into dist/
```

## Docs

- [煙火種類 Shell types](docs/firework-types.md)
- [引擎筆記 Engine notes](docs/engine-notes.md)
- [配樂同步 Music sync](docs/music-sync.md)
- [手機上的坑 Mobile gotchas](docs/mobile-gotchas.md)
- [部署 Deploy](docs/deploy.md)
- [參考影片研究 Reference study](docs/reference-study.md)
- [Skill: reference video → shell](docs/skills/fireworks-reference-to-shell/SKILL.md)

Tests: `test/` (synthesized beat tracks, music-sync timing, new shell types/finales screenshots). Add `?debug` for fps/particles, `?q=0..3` to pin quality.
