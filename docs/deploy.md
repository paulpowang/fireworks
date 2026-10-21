# 部署（Deploy）

- 正式站：https://paulpowang.github.io/fireworks/ （repo `paulpowang/fireworks`）。
- `vite.config.ts` 設 `base: '/fireworks/'`；`index.html` 用 `%BASE_URL%`；`manifest.webmanifest` 用相對路徑（`start_url: "./"`、`scope: "./"`、icons `./icon-*.png`）。
- GitHub Pages 用 Actions（`.github/workflows/pages.yml`：checkout → setup-node 20 → `npm ci` → `npm run build` → upload-pages-artifact → deploy-pages）。Pages 的 build_type 設為 `workflow`（`gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`）。push 到 `main` 約 30 秒上線。
- 驗證：`gh run watch <id> --exit-status`，再 curl `index.html` 與裡面所有 `/fireworks/...` 資源都是 200，並確認新 bundle 已上線（grep bundle 內的新字串，避免 CDN 快取誤判）。
- 盒子上 `git push` 失敗（credential helper 指到不存在的 `/usr/bin/gh`）→ `gh auth setup-git` 修好。
- 臨時通道在這台盒子上都不通：cloudflared quick tunnel 需要 7844 port（QUIC/TCP 都被擋）、localtunnel 需要隨機 TCP port、tunnelmole 用 8083、ssh 類（localhost.run / serveo / pinggy）沒有 ssh client 且 raw TCP 不通。只有一般 HTTP(S) 能出去 → 用 GitHub Pages。
- 本機預覽：`npm run build && npx vite preview --port 4173`，網址 `http://127.0.0.1:4173/fireworks/`。用完記得關掉。
