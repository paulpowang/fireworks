# 手機上的坑（Mobile gotchas）

## 直式天空一條橫線（已修）
- 症狀：手機直式時，天空中段有一條明顯的亮度斷層。
- 原因：地平線的爆炸光是以 waterline 為圓心、半徑 0.7W 的 radial gradient，但填色的矩形只到 `waterY − 0.6·r`。直式時 W 小、天空高，gradient 在矩形上緣還很亮 → 被切出一條直線（390×844 時在 y≈321）。橫式時 gradient 在切點前已淡出，所以看不到。
- 修法：改成先 `scale(1, 0.5)` 的壓扁橢圓，gradient 在填色範圍內就降到 0；天空 / 水面漸層改成依 **實際 canvas 尺寸** 預算並加 dither。
- 驗證法：凍結引擎、只放兩盞光、量相鄰列平均亮度的最大跳動：修前 25–38，修後 ≈2（等於 dither 雜訊）。

## 視窗尺寸
- 用容器的 `clientWidth/clientHeight`（不受 CSS transform 影響），並監聽 `resize`、`orientationchange`（延遲 250/600 ms 再量一次）、`visualViewport.resize`、`ResizeObserver` → 處理 iOS 工具列伸縮（dvh 變化）。
- 防止捲動 / 縮放：`touch-action: none`、`position: fixed` body、viewport `user-scalable=no`、擋 `gesturestart` 與 `dblclick`。
- Safe area：`viewport-fit=cover` + `env(safe-area-inset-*)`。CSS 旋轉模式時 safe-area 不會跟著轉，改用固定 padding。

## 橫屏模式
- Android Chrome：`requestFullscreen()` 後 `screen.orientation.lock('landscape')`。
- iOS Safari：不支援 lock（iPhone 也不支援一般元素全螢幕）→ 把整個 app 容器 `translateX(螢幕寬) rotate(90deg)`，寬高互換。觸控座標要自己換：`local x = clientY`、`local y = 螢幕寬 − clientX`。
- 手機實際轉橫時自動取消 CSS 旋轉，避免轉兩次。

## iOS 音訊 / 震動 / 錄影
- AudioContext 必須在使用者手勢內建立 / resume（第一次點擊時 unlock，另外播一個 1-sample 的靜音 buffer）。
- iPhone 的實體靜音開關會讓 Web Audio 沒聲音。
- iOS Safari 沒有 `navigator.vibrate`；Chrome 在使用者第一次點擊前呼叫 vibrate 會在 console 報錯 → 先檢查 `navigator.userActivation.hasBeenActive`。
- 錄影：`canvas.captureStream(30)` + 音訊 `MediaStreamDestination` 的 track → `MediaRecorder`；iOS / 新版 Chrome 給 mp4，其餘 webm。`navigator.share({files})` 需要 Web Share Level 2，否則改下載。分享要在使用者手勢內呼叫（所以錄完先跳出「分享 / 下載」面板）。
- 音樂檔：`accept="audio/*"`，iOS 會開「檔案」App。

## 換場景 / 倒影成本
- 倒影 pass 會 `drawImage(主 canvas)`，在手機上等於每幀一次 GPU readback；這是最貴的一步。所以預設場景改成沒有倒影的「河岸草地」，湖面倒影變成選項。
- 換場景不能只是「藏起來」：非湖面場景完全不建倒影 buffer、不跑 strip 迴圈。
- 地面線位置跟著場景變（直式 河岸草地 80%、純夜空 93%）。直式時底部選單會蓋住地面線附近，火箭從選單後面升起是正常的。
- CSS 旋轉的橫屏模式下，`resize()` 讀的是容器未旋轉的 clientWidth/Height，所以場景 layout 一樣正確（已在 headless 驗證）。
- 小鎮車站在橫式時前景只剩約 140 px 高，又有底部 UI 擋住，所以橫式的地面線拉高到 64%、前景物件用 `fgH/170` 放大（直式用 `fgH/236`）。重要的東西（站名牌、商店窗、屋台）都放在前景上半部，避開底部選單。
- 場景預設改變時要注意 localStorage：之前載入時就自動存了 `fw.scene`，所以改用只在使用者點選時寫入的 `fw.sceneChoice`。

