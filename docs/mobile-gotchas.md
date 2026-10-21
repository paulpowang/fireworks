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
