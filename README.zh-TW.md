<div align="center">
  <h1><img src="./src/assets/shortyou-logo.svg" width="36" height="36" align="top" alt=""> ShortYou</h1>
  <a href="https://github.com/HeiTang/ShortYou/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/HeiTang/ShortYou?color=orange" alt="License">
  </a>
  <a href="https://github.com/HeiTang/ShortYou/releases">
    <img src="https://img.shields.io/github/v/release/HeiTang/ShortYou?color=brightgreen" alt="Release">
  </a>
  <a href="https://github.com/HeiTang/ShortYou">
    <img src="https://img.shields.io/github/stars/HeiTang/ShortYou?color=ff69b4" alt="GitHub stars">
  </a>
  <br><br>
  <img src="https://readme-typing-svg.herokuapp.com?font=Changa&color=00F71A&size=30&center=true&vCenter=true&height=60&lines=Too+Long%3F+Shorten+it!;Too+Height%3F++Shorten+it!;Too+Fat%3F++Shorten+it!;30cm%3F++Shorten+it!">
  <img src="./docs/screenshots/home.png" alt="ShortYou homepage preview">
  <p>- - -</p>
  <p><i>「 ShortYou 是一個輕量的短網址服務。 」</i></p>
  <p>ShortYou 可以把冗長網址縮短成更容易分享的連結。</p>
</div>

<p align="center">
  <a href="./README.md">English</a> | 繁體中文
</p>

## 專案概覽

ShortYou 是一個輕量、可自行部署的短網址服務，採用前後端分離架構，將「公開查詢」與「受控建立」拆開處理。

- 一般訪客可以直接開啟既有短連結。

- 受邀使用者可透過 capability token 進入建立模式。

- 前端可部署在靜態主機，後端維持在 Google Apps Script。

- 維護者可以獨立調整前端體驗與後端規則。

## 使用模式

| 模式 | URL 格式 | 說明 | 後端互動 |
| --- | --- | --- | --- |
| 公開首頁 | `/` | 顯示 playground 與產品入口 | 不建立短網址 |
| 公開查詢 | `/#alias` | 依 alias 查詢原始網址並導向 | `GET` 查詢 |
| 受控建立 | `/#t=<token>` | 進入授權建立模式，可送出真實建立請求 | `POST` 建立 |

> ShortYou 使用 hash 路由而不是 `/alias` 路徑路由，這樣前端就能直接部署在 GitHub Pages 這類靜態主機上。

## 功能特色

- ⭐️ 輕量且可自行部署

- ⚙️ 支援自訂 alias，也支援隨機 alias

- 🔒 建立流程可由 capability token 控制

- 🛡️ 可搭配 Cloudflare Turnstile 驗證建立請求

- 🖥️ 前端、後端、資料儲存可分開維護

## 快速使用

1. 開啟 [https://s.purr.tw/](https://s.purr.tw/) 進入首頁。

2. 已建立的短連結格式如 `https://s.purr.tw/#your-alias`。

3. 如果你收到專屬建立連結，開啟後即可進入授權建立模式。

4. 公開 playground 僅供展示，不會真的建立短網址。

## 技術棧

| 層級 | 技術 | 用途 |
| --- | --- | --- |
| 前端 | Astro 5、TypeScript、Tailwind CSS | 單頁介面、hash 路由、建立與查詢流程 |
| 後端 | Google Apps Script、TypeScript | 查詢 alias、建立短網址、授權與驗證 |
| 儲存 | Google Sheets | 短網址資料、授權資料、稽核紀錄 |
| 驗證 | Cloudflare Turnstile、capability token | 建立流程的人機驗證與存取控制 |
| 工具鏈 | npm scripts、clasp wrapper、自訂 env loader | 建置前端、推送與部署 GAS、同步執行期設定 |

## 專案結構

```text
.
├── src/
│   ├── pages/index.astro        # 前端單頁入口
│   ├── scripts/                 # 查詢、建立、hash 路由與 UI 邏輯
│   ├── components/              # 共用頁面元件
│   └── styles/global.css        # 全域樣式
├── gas/
│   ├── src/
│   │   ├── entrypoints.ts       # GAS 全域入口與 runtime config bootstrap
│   │   ├── controller.ts        # HTTP 請求分派
│   │   ├── services.ts          # 查詢、建立、驗證業務邏輯
│   │   ├── repository.ts        # Google Sheets 存取層
│   │   └── config.ts            # 後端設定載入
│   ├── Code.js                  # 建置產物，部署用，不手動修改
│   └── SyncConfig.js            # 部署時注入的 runtime config bootstrap
├── scripts/                     # 前端建置與 GAS push / deploy 包裝腳本
├── public/                      # 靜態資源
└── docs/demo/                   # README 示意圖
```

如果你要改功能，通常只需要編輯 `src/` 與 `gas/src/`。`gas/Code.js` 是建置產物，不應直接手改。

## 本機開發

### 需求

- Node.js 與 npm

- Google 帳號，以及可部署 Apps Script 的環境

- 一份作為儲存層的 Google Sheets

- 如果要啟用 CAPTCHA，需準備 Cloudflare Turnstile site key 與 secret

### 環境檔案

| 檔案 | 用途 |
| --- | --- |
| `.env.dev` | 本機前端開發與 local 環境設定 |
| `.env.prod` | 正式前端建置與 production 環境設定 |
| `.env.dev.example` | local 設定範本 |
| `.env.prod.example` | production 設定範本 |

README 不放實際敏感值。建議以範本檔共享欄位結構，把真實值留在私有環境或 Secrets 管理中。

### 常用指令

| 指令 | 說明 |
| --- | --- |
| `npm install` | 安裝依賴 |
| `npm run dev:frontend` | 啟動前端開發伺服器 |
| `npm run build:frontend` | 建置前端靜態檔案 |
| `npm run preview:frontend` | 預覽前端正式建置結果 |
| `npm run build:gas` | 將 `gas/src/` 建置成 `gas/Code.js` |
| `npm run typecheck:gas` | 檢查 GAS TypeScript 型別 |
| `npm run build:all` | 一次建置前端與後端 |

## 部署方式

ShortYou 預設採前後端分離部署，這樣可以讓前端維持靜態托管，後端則利用 GAS 直接串 Google Sheets。

### 1. 準備環境設定

- 以前端來說，需要 `PUBLIC_API_URL`、`PUBLIC_TURNSTILE_SITE_KEY`，以及 `PUBLIC_SITE_URL` 或 `GAS_PUBLIC_SITE_URL` 其中之一。

  ｜ 參數 | 說明 | 預設值 |
  | --- | --- | --- |
  | `PUBLIC_API_URL` | GAS Web App 的公開 URL | 無 |
  | `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile 的 site key | 無 |
  | `PUBLIC_SITE_URL` | 前端站點公開 URL，供 Astro site metadata 與部署產物生成使用 | 無 |
  | `GAS_PUBLIC_SITE_URL` | 在共用 CI／部署環境中可作為相容替代值的前端站點 URL | 無 |

- 以後端來說，至少需要 `GAS_SCRIPT_ID`、`GAS_PUBLIC_SITE_URL`、`GAS_ENFORCE_CAPTCHA`、`GAS_ENFORCE_ACCESS_CONTROL`。

  若啟用 CAPTCHA，還需要 `GAS_TURNSTILE_SECRET`。
  
  | 參數 | 說明 | 預設值 |
  | --- | --- | --- |
  | `GAS_SCRIPT_ID` | GAS 專案的 Script ID | 無 |
  | `GAS_PUBLIC_SITE_URL` | GAS Web App 的公開 URL | 無 |
  | `GAS_ENFORCE_CAPTCHA` | 是否強制驗證 CAPTCHA | false |
  | `GAS_ENFORCE_ACCESS_CONTROL` | 是否強制授權控制 | false |
  | `GAS_TURNSTILE_SECRET` | Cloudflare Turnstile 的 secret key | 無 |

### 2. 部署前端

- 使用 `npm run build:frontend` 產生 `dist/`。

- 將 `dist/` 部署到 GitHub Pages 或其他靜態主機。

- 前端會依 `PUBLIC_API_URL` 連到對應的 GAS Web App。
- `dist/CNAME` 與 `dist/robots.txt` 等部署產物會優先使用 `PUBLIC_SITE_URL`，若未提供則回退到 `GAS_PUBLIC_SITE_URL`。

### 3. 推送或發版後端

| 指令 | 用途 |
| --- | --- |
| `npm run gas:push:local` | 推送 local 後端程式與設定 |
| `npm run gas:push:production` | 推送 production 後端程式與設定 |
| `npm run gas:deploy:local` | 發布 local GAS Web App 版本 |
| `npm run gas:deploy:production` | 發布 production GAS Web App 版本 |

這些腳本會處理建置、`clasp push`，以及部署時的 runtime config bootstrap。部署完成後，後端會在首次請求時同步 Script Properties。

### 4. 驗證部署結果

- 開啟首頁確認 playground 可以正常載入。

- 以 `/#alias` 測試既有短連結查詢與導向。

- 以 `/#t=<token>` 測試授權建立模式與 Turnstile 驗證。


## 貢獻

歡迎提出 issue 與 pull request。

如果你打算調整功能，建議先確認變更是屬於前端體驗、後端規則，還是部署流程，這個專案的分層已經把三者分開。

## 授權

本專案採用 [MIT License](LICENSE)。
