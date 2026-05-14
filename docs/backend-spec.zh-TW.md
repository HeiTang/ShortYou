# ShortYou 後端完整規格文件（GAS + Google Sheets）

## 1. 目標與範圍

本文件描述 ShortYou 後端（Google Apps Script, 以下簡稱 GAS）的完整運作方式，包含：

- 系統架構與模組責任
- 佈署流程（手動與 CI）
- Script Properties 設定
- Google Sheets 資料表結構
- API 規格（Request / Response / 錯誤碼）
- 主要業務流程（查詢、建立、邀請碼兌換、權限控管）
- 管理端函式與日常維運
- 安全性與限制

本文件對應原始碼目錄：gas/src/

---

## 2. 系統架構

### 2.1 分層設計

後端採分層設計，避免將 HTTP、業務規則、資料存取耦合在同一層：

1. Transport / Controller 層
- 檔案：gas/src/controller.ts
- 功能：解析 doGet/doPost 請求、路由 action、整合服務層結果並回傳 JSON。

2. Service 層
- 檔案：gas/src/services.ts
- 功能：承載核心業務規則（網址驗證、別名產生、邀請碼兌換、Captcha 驗證、能力權杖授權）。

3. Repository 層
- 檔案：gas/src/repository.ts
- 功能：唯一可直接操作 Google Sheets 的層，集中資料表欄位、查找與寫入邏輯。

4. Config / Utility / Type 層
- 檔案：gas/src/config.ts, gas/src/utils.ts, gas/src/types.ts
- 功能：集中設定載入、純工具函式、共用型別。

5. Entrypoint 組裝層
- 檔案：gas/src/entrypoints.ts
- 功能：初始化依賴、建立 singleton、輸出 doGet/doPost 以及管理函式。

### 2.2 建置輸出

- 開發編輯：gas/src/*.ts
- 編譯暫存：.gas-build/
- 最終佈署檔：gas/Code.js（由 scripts/build-gas.mjs 合併產出）

注意：gas/Code.js 為產物，不應手動修改。

---

## 3. 佈署流程

## 3.0 是否需要自己建立 Google Sheet？

答案是：需要一份 Google Sheet 檔案，但不需要手動建立資料分頁。

你需要做的：

1. 準備一份 Google Sheet（可空白）。
2. 確保這個 GAS 專案是綁定在該 Sheet 上（container-bound）。

你不需要做的：

1. 不需要手動建立 short_links、clients、invites、audit_logs 四張分頁。
2. 不需要手動建立欄位標題。

系統會在啟動時呼叫 ensureSchema，自動建立缺少的資料表與 header。

注意：目前程式使用 SpreadsheetApp.getActiveSpreadsheet()，若專案不是綁定在試算表上，將無法取得 active spreadsheet。

## 3.1 先決條件

1. 已安裝 Node.js 與 npm
2. 已安裝 clasp
3. 擁有 Google Apps Script 專案 Script ID
4. GAS 專案綁定 Google Sheets（作為資料庫）

## 3.2 手動佈署（本機）

1. 安裝依賴
- npm install

2. 建置後端
- npm run build:gas

3. 登入 clasp
- npm i -g @google/clasp
- clasp login

4. 建立 clasp 設定
- 複製 gas/.clasp.json.example 為 gas/.clasp.json
- 將 scriptId 改成你的 GAS Script ID

5. 推送與發版
- 進入 gas 目錄
- clasp push --force
- clasp deploy --description "shortyou-backend"

6. 設定 Web App
- 在 GAS UI 將專案部署為 Web App
- 建議：Execute as Me、Who has access 依需求設定
- 取得 Web App URL（供前端 config 使用）

7. 首次初始化資料表
- 佈署後先呼叫任一 API（例如 verify_captcha 或 query）
- 系統會自動建立 short_links / clients / invites / audit_logs 分頁（若不存在）

## 3.3 CI 自動佈署（GitHub Actions）

工作流程檔案：.github/workflows/gas-cicd.yml

觸發條件：
- PR（僅 validate）
- push 到 main（validate + deploy）
- workflow_dispatch（手動觸發）

必要 Secrets：
- CLASPRC_JSON
- GAS_SCRIPT_ID
- GAS_DEPLOYMENT_ID（選填，若要更新既有 deployment）

CI 主要步驟：
1. npm ci
2. npm run build
3. 安裝 clasp
4. 寫入 ~/.clasprc.json 與 gas/.clasp.json
5. clasp push --force
6. clasp version + clasp deploy

## 3.4 佈署後檢查

1. 呼叫 GET 測試：?query=不存在別名，預期回傳 success=false
2. 呼叫 POST verify_captcha / exchange_invite / create 進行 smoke test
3. 檢查 Sheets 是否自動建立四張表並有正確欄位
4. 檢查 audit_logs 是否有紀錄

---

## 4. Script Properties 規格

| Key | 必填 | 預設值 | 說明 |
|---|---|---|---|
| RECAPTCHA_SECRET | 否 | 空字串 | reCAPTCHA server secret；空值時可視為不驗證（視服務邏輯） |
| ENFORCE_CAPTCHA | 否 | true | 是否強制 create 需要 token |
| ENFORCE_ACCESS_CONTROL | 否 | true | 是否強制 capability token 授權 |
| SHORT_LINKS_SHEET_NAME | 否 | short_links | 短網址資料表名稱 |
| CLIENTS_SHEET_NAME | 否 | clients | 客戶端資料表名稱 |
| INVITES_SHEET_NAME | 否 | invites | 邀請碼資料表名稱 |
| AUDIT_LOGS_SHEET_NAME | 否 | audit_logs | 稽核日誌資料表名稱 |
| PUBLIC_SITE_URL | 否 | https://t.purr.tw | 前端站點 URL（組裝 invite link） |
| INVITE_PAGE_PATH | 否 | /invite | invite 頁路徑 |
| MAX_URL_LENGTH | 否 | 2048 | URL 長度上限 |
| RANDOM_ALIAS_INITIAL_LENGTH | 否 | 6 | 隨機別名起始長度 |
| RANDOM_ALIAS_MAX_LENGTH | 否 | 12 | 隨機別名最大長度 |
| RANDOM_ALIAS_TRY_PER_LENGTH | 否 | 12 | 每個長度的嘗試次數 |
| DEFAULT_DAILY_QUOTA | 否 | 0 | 每日配額，0 代表不限量 |
| CAPABILITY_TOKEN_LENGTH | 否 | 64 | 能力權杖長度 |
| RESERVED_ALIASES | 否 | 空字串 | 保留別名清單（逗號分隔） |

---

## 5. Google Sheets 資料模型

## 5.1 short_links

| 欄位 | 說明 |
|---|---|
| alias | 短別名（唯一） |
| url | 目標 URL |
| clicks | 點擊次數 |
| created_by_client | 建立者 client_code |
| status | active / disabled |
| created_at | 建立時間（ISO） |
| updated_at | 更新時間（ISO） |
| last_access_at | 最後存取時間（ISO） |

## 5.2 clients

| 欄位 | 說明 |
|---|---|
| client_code | 客戶端代碼（c_ 開頭） |
| owner_name | 擁有者名稱 |
| status | active / disabled |
| capability_token_hash | capability token 的 SHA-256 |
| token_hint | 權杖提示（前 6 碼） |
| issued_at | 權杖簽發時間 |
| expires_at | 權杖到期時間（可空） |
| daily_quota | 每日配額 |
| daily_used | 當日已用量 |
| quota_reset_at | 配額重置時間（UTC 隔日） |
| last_used_at | 最後使用時間 |
| note | 備註 |

## 5.3 invites

| 欄位 | 說明 |
|---|---|
| invite_code_hash | 邀請碼 SHA-256 |
| status | active / disabled / expired |
| max_uses | 最大可用次數（0 可視為無限） |
| used_count | 已使用次數 |
| expires_at | 到期時間（ISO，可空） |
| issued_by | 發行者 |
| issued_to_hint | 領取對象提示 |
| created_at | 建立時間 |
| last_used_at | 最後使用時間 |
| note | 備註 |

## 5.4 audit_logs

| 欄位 | 說明 |
|---|---|
| time | 紀錄時間 |
| event | 事件名稱（create / exchange_invite） |
| client_code | 客戶端代碼 |
| ip | 來源 IP |
| result | success / fail |
| reason | 成功或失敗原因碼 |

---

## 6. API 規格

回應格式（共通）：
- success: boolean
- result: string
- error: string（失敗時）
- 其他欄位依 action 增補

Content-Type：
- 支援 form-urlencoded
- 支援 application/json（controller 會 merge parameter 與 JSON body）

## 6.0 端點與網址格式

### 6.0.1 前端網址格式

1. 首頁（Playground + 查詢入口）
- 格式：https://{你的網域}/
- 範例：https://t.purr.tw/

2. 公開短連結（前端 hash 轉址）
- 格式：https://{你的網域}/#{alias}
- 範例：https://t.purr.tw/#shortyou

3. 邀請頁
- 格式：https://{你的網域}/invite
- 範例：https://t.purr.tw/invite

4. 能力權杖建立模式
- 格式：https://{你的網域}/invite#t={capabilityToken}
- 範例：https://t.purr.tw/invite#t=8f4c2b...（實際 token 較長）

### 6.0.2 後端 Web App 端點格式

1. 基底端點
- 格式：https://script.google.com/macros/s/{deployment_or_script_id}/exec
- 範例：https://script.google.com/macros/s/AKfyc.../exec

2. GET 查詢
- 格式：{WEBAPP_URL}?query={alias}
- 範例：https://script.google.com/macros/s/AKfyc.../exec?query=shortyou

3. POST action
- 格式：以 form 或 JSON 帶 action 與對應參數
- 範例：action=exchange_invite、action=verify_captcha、action=create

## 6.1 GET /exec?query={alias}

用途：查詢短連結並回傳目標 URL（由前端決定是否跳轉）

成功範例：
- {"success": true, "result": "https://example.com"}

失敗範例：
- {"success": false, "result": "", "error": "not_found"}

## 6.2 POST action=verify_captcha

參數：
- token: string（必填）
- ip: string（選填）

成功範例：
- {"success": true, "result": ""}

失敗範例：
- {"success": false, "result": "", "error": "captcha_failed", "error-codes": ["..."]}

## 6.3 POST action=exchange_invite

參數：
- inviteCode: string（必填）
- ownerName: string（選填）
- ip: string（選填）

成功回傳（重點）：
- result / link: 前端 invite 頁 URL，帶 #t={capabilityToken}
- capabilityToken: 明文權杖（僅此時回傳）
- clientCode: 新建立的 client code

## 6.4 POST action=create

參數：
- url: string（必填）
- alias: string（選填，自訂別名）
- token: string（reCAPTCHA token，視設定可必填）
- ip: string（選填）
- capabilityToken: string（或 legacy 欄位 id）

成功範例：
- {"success": true, "result": "abc123"}

失敗範例：
- {"success": false, "result": "", "error": "alias_exists"}

---

## 7. 錯誤碼與業務規則

常見錯誤碼：

- missing_url
- invalid_url
- invalid_alias
- reserved_alias
- alias_exists
- alias_generation_failed
- missing_token
- captcha_required
- captcha_failed
- capability_token_required
- unauthorized_client
- client_disabled
- token_expired
- client_quota_exceeded
- missing_invite_code
- invalid_invite
- invite_disabled
- invite_expired
- invite_limit_reached
- invalid_json

業務規則要點：

1. URL 必須為 http/https，且不得超過 MAX_URL_LENGTH。
2. 別名需符合 aliasPattern（小寫、數字、底線、連字號）。
3. 若自訂別名衝突則拒絕；隨機別名會在長度區間內逐步嘗試。
4. capability token 僅儲存 SHA-256，不存明文。
5. 每位 client 可套用日配額；到 quota_reset_at 自動重置 daily_used。
6. 邀請碼會檢查狀態、到期、可用次數。

---

## 8. 主要流程（端到端）

## 8.1 公開查詢流程（Resolve）

1. 前端呼叫 GET ?query=alias
2. 後端查 short_links.alias
3. 命中且 active：回傳目標 URL，並累加 clicks
4. 未命中或非 active：回傳 not_found

## 8.2 邀請碼兌換流程（Exchange Invite）

1. 使用者送 inviteCode
2. 後端對 inviteCode 做 SHA-256
3. 在 invites 查詢 hash，檢查 active / expires / maxUses
4. 建立 client（含 capability token hash、quota 初始值）
5. used_count +1，更新 last_used_at
6. 回傳 invite link（含 capability token）

## 8.3 建立短網址流程（Create）

1. 驗證 url 是否存在與格式合法
2. 依設定執行 captcha 驗證（可強制）
3. 依設定執行 access control（capability token）
4. 若 alias 有值：走自訂別名流程；否則走隨機別名流程
5. 寫入 short_links 並回傳 alias
6. 寫入 audit_logs（success/fail）

## 8.4 使用者實際操作流程（含範例）

### 8.4.1 管理者初始化（第一次上線）

1. 建立一份 Google Sheet，並確認 GAS 專案綁定在該 Sheet。
2. 完成佈署並取得 WEBAPP_URL。
3. 在 Script Properties 設定必要參數（至少建議設定 ENFORCE_CAPTCHA、ENFORCE_ACCESS_CONTROL、PUBLIC_SITE_URL）。
4. 透過 GAS 編輯器執行 createInvite 建立邀請碼。

範例（GAS 編輯器）：

```javascript
createInvite('INVITE-ALICE-2026', 1, '2026-12-31T23:59:59.000Z', 'admin', 'alice', 'one-time invite');
```

### 8.4.2 一般使用者兌換邀請碼

1. 開啟邀請頁：https://t.purr.tw/invite
2. 輸入 Invite Code 並按 Apply。
3. 後端成功時回傳可建立短網址的專用連結：
	 - https://t.purr.tw/invite#t={capabilityToken}
4. 使用者開啟該連結後，進入 Authorized Create Mode。

API 範例（curl）：

```bash
curl -X POST "$WEBAPP_URL" \
	-d "action=exchange_invite" \
	-d "inviteCode=INVITE-ALICE-2026" \
	-d "ownerName=alice" \
	-d "ip=1.2.3.4"
```

### 8.4.3 一般使用者建立短網址

1. 進入 capability link（/invite#t=...）。
2. 輸入目標 URL，可選自訂 alias。
3. 完成 reCAPTCHA（若有啟用）。
4. 前端送出 create。
5. 成功後前端顯示：
	 - https://t.purr.tw/#{alias}

API 範例（curl）：

```bash
curl -X POST "$WEBAPP_URL" \
	-d "action=create" \
	-d "url=https://github.com/HeiTang/ShortYou" \
	-d "alias=shortyou" \
	-d "token=RECAPTCHA_TOKEN" \
	-d "ip=1.2.3.4" \
	-d "capabilityToken=CAPABILITY_TOKEN"
```

### 8.4.4 公開訪客使用短網址

1. 訪客開啟：https://t.purr.tw/#shortyou
2. 前端讀取 hash（shortyou），向後端查詢 query=shortyou。
3. 若 alias 存在且 active，前端導向原始 URL。
4. 後端同步將 clicks +1，並更新 last_access_at。

查詢範例（curl）：

```bash
curl "$WEBAPP_URL?query=shortyou"
```

---

## 9. 管理函式（GAS 編輯器可呼叫）

- createInvite(inviteCode, maxUses, expiresAtIso, issuedBy, issuedToHint, note)
- disableInvite(inviteCode)
- disableClient(clientCode)
- rotateClientToken(clientCode)
- upsertClient(clientCode, ownerName, capabilityToken, expiresAtIso, dailyQuota, note)

legacy 相容函式：
- create
- query
- add
- asJSON

---

## 10. 稽核與可觀測性

所有關鍵事件會寫入 audit_logs：

- exchange_invite
- create

記錄內容包含：
- 事件時間
- client_code
- ip
- success/fail
- reason（ok 或 error code）

---

## 11. 安全性設計

1. Capability token 使用 SHA-256 儲存，避免明文落地。
2. compare 使用 timing-safe equality，降低字串比較側通道風險。
3. create 流程可同時開啟 captcha + access control。
4. alias/url 驗證阻擋公式注入字元與非法 URL。
5. Script Lock 用於關鍵寫入（避免併發競態）。

---

## 12. 維運建議

1. 正式環境務必開啟 ENFORCE_CAPTCHA 與 ENFORCE_ACCESS_CONTROL。
2. 定期輪替 capability token（rotateClientToken）。
3. 監看 audit_logs 的 fail rate 與可疑 IP。
4. 為 Script Properties 建立變更紀錄（誰、何時、改了什麼）。
5. 發版前固定執行：
- npm run typecheck:gas
- npm run build:gas
- npm run check:gas

---

## 13. 版本與相依

- Node.js：建議 20+
- TypeScript：5.x
- GAS runtime：V8
- OAuth Scopes：定義於 gas/appsscript.json

---

## 14. 參考檔案

- gas/src/config.ts
- gas/src/types.ts
- gas/src/utils.ts
- gas/src/repository.ts
- gas/src/services.ts
- gas/src/controller.ts
- gas/src/entrypoints.ts
- scripts/build-gas.mjs
- .github/workflows/gas-cicd.yml
