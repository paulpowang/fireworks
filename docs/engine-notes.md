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
7. 倒影（**只有「湖面倒影」場景**）：把水平線以上區域翻轉複製到半解析度 canvas，再一條一條（3–5 px）以 sin 位移 + 水平拉伸畫回水面 → 波紋橫紋。其他場景這步整個跳過，只畫一張快取好的地面 canvas。
8. 鏡像模式：FX/bloom 左半邊畫兩次（一次水平翻轉），點擊右半邊會映射到左半邊。

## 場景（換場景）
| 場景 | id | 陸地頂 / 地面線（直式・橫式，佔畫面高） | 倒影 |
|---|---|---|---|
| 河岸草地（預設） | `field` | 0.70 / 0.80 ・ 0.68 / 0.80 | ✗ |
| 湖面倒影 | `lake` | 0.505 / 0.575 ・ 0.60 / 0.68 | ✓ |
| 純夜空 | `sky` | 0.87 / 0.93 ・ 0.85 / 0.92 | ✗ |

- `waterY` 其實就是「地面線」：火箭起點、地面火花／扇形噴泉、FX 層高度都以它為準，所以換場景只要改 `landTop`/`waterY` 再重建快取，煙火自動坐在正確位置。
- 非湖面場景：倒影 buffer 縮成 1×1（不佔記憶體），每幀不做 snapshot、不跑 strip 迴圈、不畫岸邊霧；地面是一張靜態快取 canvas（`buildWater()` 依場景換顏色）。剪影用 `buildFieldLand()`：遠山 + 對岸小天際線燈 + 前景河岸草叢；純夜空只有兩道很低的山稜。
- 選擇存在 `localStorage['fw.scene']`，預設 `field`。`setScene()` 會強制 resize 重建。
- **實測（headless Chrome、SwiftShader、`?q=1`、同一個 seed 的自動秀 10 s，2 輪平均）**：

  | | `render()` 主執行緒時間 平均（p95） | 閒置 render() | rAF 幀間隔 平均 |
  |---|---|---|---|
  | 直式 湖面倒影 | 21.5 ms（32.0） | 11.4 ms | 24.6 ms |
  | 直式 河岸草地 | 3.1 ms（5.4） | 1.4 ms | 22.7 ms |
  | 直式 純夜空 | 2.5 ms（5.9） | 1.4 ms | 22.6 ms |
  | 橫式 湖面倒影 | 23.5 ms（34.9） | 12.5 ms | 26.1 ms |
  | 橫式 河岸草地 | 2.5 ms（4.7） | 1.2 ms | 25.6 ms |
  | 橫式 純夜空 | 3.0 ms（5.1） | 1.4 ms | 23.3 ms |

  倒影要把**主 canvas 自己**畫進另一張 canvas（readback），會強迫 GPU flush，所以主執行緒時間差約 7–9 倍。headless 的 rAF 幀間隔幾乎一樣（被 headless 合成器卡住），手機上實際 fps 差多少要實機量。測試腳本：`test/scenes.mjs <url> perf`。

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
