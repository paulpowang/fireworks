# 引擎筆記（Engine notes）

純 2D canvas，沒有 WebGL。檔案：`src/engine/fireworks.ts`。

## 粒子系統
- 預先配置 7000 個 `P` 物件的 pool；`n` = 活著的數量，死亡用 swap-remove（O(1)，不配置記憶體）。
- 物理：`v *= exp(-drag·dt)`、`vy += G·grav·dt`（G = 60 U/s²）；`hold` 讓文字/愛心先成形再下落。
- 種類（`Kind`）：Normal、Ember（拖尾）、SubBreak（多段）、SenrinSub（千輪子彈）、Glitter（頻閃）。死亡時 SubBreak/SenrinSub/Glitter 觸發 `subBurst()`。
- **低優先 spawn**：ember（拖尾、火箭尾）用 `spawn(true)`，粒子數 ≥ 85% cap 就拒絕 → 大型終章時主星體不會被拖尾吃光預算。
- Emitter（瀑布 curtain、噴泉 fountain）：每秒 `rate × ramp × q` 顆，開頭 0.35 s 淡入、結尾 0.6 s 淡出。
- Set pieces（`fan`/`niagara`/`ground`/`starmine`）不走 rocket，`launch()` 直接呼叫 `setPiece()`。

## 繪製管線（每幀）
1. 天空：預先算好、**整張 canvas 高度** 的漸層 + dither（±2.2 雜訊去色階），之後星星閃爍。
2. 爆炸光：每盞 light 一個 radial gradient（天空）+ 一個 **壓扁的橢圓** gradient（地平線）。鳳凰終章時加紫色 tint。
3. 煙：灰色 puff（source-over）+ 依最近光源顏色的 lit puff（lighter）。上限 80 團。
4. FX 層（只到水平線高度）：`destination-out` 填 0.28 alpha → motion blur；粒子用 `lighter` 畫預先算好的 radial sprite（每種顏色快取一張 32px）。
5. Bloom：FX 縮到 1/4 → 再縮到 1/8，放大疊回（雙線性放大 = 便宜的模糊），alpha 0.4 / 0.6。
6. 陸地剪影（快取 canvas）。
7. 倒影：把水平線以上區域翻轉複製到半解析度 canvas，再一條一條（3–5 px）以 sin 位移 + 水平拉伸畫回水面 → 波紋橫紋。
8. 鏡像模式：FX/bloom 左半邊畫兩次（一次水平翻轉），點擊右半邊會映射到左半邊。

## 效能預算 / 自動品質
| 等級 | DPR 上限 | 粒子 cap | 倒影 strip | bloom |
|---|---|---|---|---|
| 0（桌機） | 2 | 6500 | 3 px | ✓ |
| 1（觸控裝置預設） | 1.6 | 4200 | 3 px | ✓ |
| 2 | 1.25 | 2800 | 4 px | ✓ |
| 3 | 1 | 1800 | 5 px | ✗ |

- 幀時間 EMA > 1/48 s 累積 1.5 s → 降一級（每 3 s 最多一次）。
- `q` 倍率 = `0.35·min(1,cap/5000) + 0.65·min(1,cap/6500)`，所有煙火粒子數乘上它。
- `?q=0..3` 可固定等級（測試／截圖用，關閉自動降級）。`?debug` 顯示 fps / 粒子數並把引擎掛在 `window.__fw`。
- 大型終章實測（headless、q=1、cap 4200）：長岡巨型峰值約 3100–3500 顆，鳳凰亂舞約 750 顆。

## 音效
- Web Audio 合成：launch（bandpass noise + 偶爾哨音）、boom（lowpass noise + 低頻 sine）、pop、crackle（預先產生的 click buffer）。
- 圖：SFX voices → `sfxGain`（靜音開關）→ bus；音樂 → `musicIn` → bus；bus → compressor → 喇叭 + `MediaStreamDestination`（錄影）。
- SFX 預設靜音（`localStorage['fw.sfxMuted']`），靜音時連節點都不建立。
