# 配樂同步（Music sync）

檔案：`src/engine/music.ts`、`src/MusicPanel.tsx`。全部在瀏覽器內完成，不上傳。

## 分析流程
1. `decodeAudioData` → 混成單聲道並以 box filter 降取樣到約 22.05 kHz（分段處理，每段 `await` 一次讓 UI 更新進度）。
2. STFT：N = 1024、hop = 256（≈ 11.6 ms），Hann window，`log1p(100·|X|)`。
3. 每幀：spectral flux（正差值總和）、RMS、低頻（<180 Hz）與高頻（>3.5 kHz）能量，以及 **分頻 flux**（low / mid / high）。
4. Onset：flux > 局部平均 × 1.35 + 0.04 × p99，且為 ±3 幀局部最大、間隔 ≥ 100 ms。
5. 節拍用的 onset envelope：**分頻 flux 各自標準化後加權（low 0.55、mid 0.3、high 0.15）**。
   - 教訓：直接用全頻 log-flux 時，hi-hat 佔的 bin 多，會讓節拍鎖在反拍、tempo 變一半（120 → 60 BPM）。
6. Tempo：onset envelope 自相關，60–200 BPM，log-gaussian prior（中心 120、σ 0.8 octave），再做 **octave check**（慢於 100 BPM 而半週期 AC > 0.5 倍 → 取兩倍速），拋物線內插。
7. 節拍追蹤：Ellis 2007 dynamic programming（α = 100），從最後一個週期內分數最高者回溯；去掉音樂開始前的拍。
8. 能量：RMS 0.6 s 平滑後以 p5–p98 標準化成 0..1；找最大聲的 10 s 區段。
9. 超過 10 分鐘的檔案：只精準分析前 10 分鐘，之後用估計的 tempo 延伸節拍格線。檔案上限 80 MB。

## Offset 校正
- 幀時間 = 視窗中心 + **1 hop**（`t0 = (N/2 + H)/sr`）。用合成測試曲校正：原本有固定約 −12 ms 偏差，加上 1 hop 後平均偏差 ≈ 0。
- 播放時間 `player.time = ctx.currentTime − startedAt − outputLatency`（扣掉輸出延遲，讓「聽到的」對齊）。

## Launch lead time
- 每個事件存的是「爆開時間」。排程器在 `t − flight` 時發射；`flight = engine.flightFor(type, y)`（一般 0.8 + 高度 × 0.8 s；set piece 0；速射連發 0.4 s；終章用 `finaleClimax`）。
- 火箭的進度直接跟 **音樂時鐘** 走（不是幀 dt），所以掉幀不會漂；剩餘時間 ≤ 半幀就在這一幀爆（最近幀，而不是下一幀）。
- 晚到（seek 之後）超過 max(0.25 s, 0.7 × flight) 的事件直接跳過。

## 事件生成規則（摘要）
- 安靜：每兩拍一發小牡丹 / 柳，強拍偶爾冠菊。
- 漸強：每拍一發，強拍椰子或菊。
- 中段：依主題權重挑（含雙芯、椰子、冠菊），強拍加千輪/多段/雙芯，高頻多時加閃爍。
- 高潮：強拍三發千輪；最大聲區段偶爾速射連發 + 冠菊。
- Drop（1.5 s 內能量升 > 0.35）：四發千輪橫排（瀑布已移除）。中段強拍與高峰也會出現三段連環；它的第一段爆開就是 burst 時間點，所以對齊節拍的是第一段。剛進入大聲段：地面火花。
- Set piece 之間至少間隔 7 s。
- 結尾：最後 4 s 的拍上齊射；若選長岡/鳳凰，終章事件的高潮對到結尾前的某一拍，並清掉該區段約 75% 的一般煙火。
- 密度上限：任 0.5 s 內最多 9 發。

## 測試方法與結果
- `test/gen_track.py` 產生已知節拍的合成曲（kick、2/4 拍 snare、反拍 hi-hat、bass，安靜 → 漸強 → 大聲 → 高潮）：120 BPM（第一拍 1.0 s）、128 BPM（0.73 s）。
- `test/analyze-node.mjs`：在 Node 跑同一份分析程式（fake AudioBuffer）。
- `test/music-sync.mjs`：headless Chrome 選檔 → 播放 → 用 `fw.onBurst` 記錄每次爆開的音樂時間，與事件時間、真實節拍比較。
- 結果（2026-10-19，正式站）：tempo 120.10 / 128.35；節拍偵測誤差 median 2.9 ms、p90 ≈ 5.5 ms；爆開 vs 真實節拍 平均 ≈ 0、median 5–7 ms、p90 10–12 ms，41/41 與 54/55 在 50 ms 內。11 分鐘檔約 6.5 s 分析完。
