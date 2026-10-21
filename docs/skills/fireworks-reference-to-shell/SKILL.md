---
name: fireworks-reference-to-shell
description: Turn a real fireworks reference video into a new shell type (or finale) in this canvas engine, then verify it headlessly. Use when asked to "make a firework like this video", add a new shell/finale, or match a festival's look.
---

# Reference video → firework shell

## 1. Study the reference (don't copy it)
- Extract 5–7 frames: ignition, full bloom, decay, wide composition. Keep them outside the repo (`reference*/` is gitignored); never commit others' footage.
- Make one contact sheet (PIL: resize each to 300 px high, paste side by side) and look at all frames together.
- Write down, per effect:
  - **shape**: sphere / ring / arms / curtain / fountain / cluster of small bursts
  - **size** relative to the sky (fraction of width/height) and **altitude** (high / mid / low / ground)
  - **density** (dozens vs hundreds of stars), **star size**, **brightness**
  - **tails**: none / short / long; thin / thick; straight / drooping; glittering?
  - **colors** and color *sequence* over time
  - **timing**: duration, simultaneity, waves and their spacing
  - **ambient**: smoke (lit?), sky tint, reflection
- Name it with the Japanese / Chinese term if one exists (千輪, 冠菊, 椰子, 雙芯, スターマイン…) and record the festival in `docs/reference-study.md` (description only).

## 2. Map traits → engine parameters (`src/engine/fireworks.ts`)
| trait | knob |
|---|---|
| burst radius R | initial speed = `R × drag` (exp drag ⇒ distance ≈ v0/drag) |
| hangs in the air / droops | lower `drag` + lower `grav` (hang) or higher `grav` (droop), longer `life` |
| tails | `trail` (embers/s), `trailLife`, `trailSize`, `trailGrav`; thick tails = bigger `trailSize`, glitter = ember `flicker` |
| glitter / strobe | `flicker` (random dimming) or `Kind.Glitter` (sin strobe) |
| arms (palm) | few large particles with heavy trails, extra `grav` |
| layered (pistil) | several `sphere()` calls with radius fractions and contrasting colors |
| curtains / fountains | an `Emitter` (`curtain` / `fountain`) with `rate`, `dur`, spark velocity ranges |
| clusters / starmines | many `quickRocket()` or cheap `miniBurst()` calls scheduled via `this.timed` |
| ground pieces | add the type to `SET_PIECES` and handle it in `setPiece()` |
| sky tint / lit smoke | `this.tint`, `addLight()`, `addSmoke()` |

Budget rules:
- Multiply star counts by `this.q`. Trails/embers must use `spawn(true)` (low priority, refused above 85% of the cap).
- Dense finales: prefer many small bursts of 8–12 stars with no flicker/trail and a shared sprite over a few huge bursts.
- Additive blending + bloom saturates to white when big shells overlap: lower `alpha` (0.6–0.8) and `size` instead of reducing count.

## 3. Integrate
- `themes.ts`: add to `ShellType`, `SHELLS` (Traditional Chinese label), theme `weights` (random + auto show).
- `music.ts`: use it in `generateShow()` where it fits the energy level; set pieces need cooldowns; check `flightFor()` lead time.
- Finales: add to `FinaleKind` / `FINALES`, implement `finaleX()`, and set `finaleClimax()` so music sync can align it.

## 4. Verify headless
- `npm run build && npx vite preview --port 4173` (stop it afterwards).
- Playwright-core + `/opt/google/chrome/chrome`, mobile context (390×844 and 844×390, DPR 3, `isMobile`, `hasTouch`), URL `/fireworks/?debug&q=1` (pins phone quality; `window.__fw` exposes the engine).
- Clear state (`__fw.n = 0`, empty rockets/timed/emitters), tap the type chip, tap the sky, sample `__fw.n` for the peak particle count, screenshot at the visually important moments. `test/new-types.mjs` does all of this.
- Check: no `pageerror` / console errors, peak particles below the cap, the effect is recognisable in a contact sheet next to the reference, music sync still passes (`test/music-sync.mjs`).
- Then commit, push to `main`, `gh run watch`, and re-run the check against the live URL.
