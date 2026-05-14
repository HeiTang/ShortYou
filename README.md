
<div align="center">
  <h1>✨ ShortYou</h1>
  <a href="https://github.com/HeiTang/ShortYou/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/HeiTang/ShortYou?color=orange">
  </a>
  <a href="https://github.com/HeiTang/ShortYou/releases">
    <img src="https://img.shields.io/github/v/release/HeiTang/ShortYou?color=brightgreen">
  </a>
  <a href="https://github.com/HeiTang/ShortYou">
    <img src="https://img.shields.io/github/stars/HeiTang/ShortYou?color=ff69b4">
  </a>
  <a href="https://t.purr.tw">
    <img src="https://f1qe4wyq4m9j.runkit.sh">
  </a>
  <br><br>
  <img src="https://readme-typing-svg.herokuapp.com?font=Changa&color=00F71A&size=30&center=true&vCenter=true&height=60&lines=Too+Long%3F+Shorten+it!;Too+Height%3F++Shorten+it!;Too+Fat%3F++Shorten+it!;30cm%3F++Shorten+it!">
  <img src="./docs/demo/page.png">
  <p>- - -</p>
  <p><i>“ ShortYou is a URL Shortener. ”</i></p>
  <p>ShortYou can shorten the lengthy URL and easy to share link with other people.</p>
</div>

## Features

- 💰 Zero Cost

- ✨ Beautiful Website

- 🔧 Customize Link

- ☁ Run on Github Page and Google Apps Script

## Usage

1. Open homepage: [ShortYou](https://t.purr.tw/)
2. Public redirect: `https://t.purr.tw/#<alias>`
3. Homepage playground (unauthorized): generate fake links for demo only
4. Authorized create mode: `https://t.purr.tw/#t=<capabilityToken>`

## Frontend (Astro + Tailwind + GitHub Pages)

- Source: `src/pages/index.astro`
- Build: `npm run build:frontend`
- Output: `dist/`
- Deploy workflow: `.github/workflows/pages.yml`

### Frontend behavior

- Homepage (`/`):
  - `#t=<token>` → authorized create mode on the same page
  - `#alias` → query backend and redirect
  - no hash → fake short-link playground (frontend returns a fixed mock result only, no create API request)
- Single homepage only, no secondary frontend route.
- No jQuery dependency.

## Google Apps Script Backend (clasp + TypeScript)

- TypeScript source: `gas/src/*.ts` (entrypoint: `gas/src/entrypoints.ts`)
- Generated runtime file: `gas/Code.js`
- `gas/Code.js` is generated during build/deploy and is not tracked in Git.
- Build command: `npm run build:gas`
- Code review target: **`gas/src/*.ts`** (`gas/Code.js` is generated artifact, do not edit manually)
- Full backend spec (Traditional Chinese): `docs/backend-spec.zh-TW.md`

### Deploy

1. Install dependencies and build:

    ```bash
    npm install
    npm run build:gas
    ```

2. Login clasp:

    ```bash
    npm i -g @google/clasp
    clasp login
    ```

3. Create `gas/.clasp.json` and set `scriptId`:

    ```bash
    cp gas/.clasp.json.example gas/.clasp.json
    ```

4. Push and deploy:

    ```bash
    cd gas
    clasp push
    clasp deploy --description "shortyou-backend"
    ```

### Script Properties

- `RECAPTCHA_SECRET`
- `ENFORCE_CAPTCHA` (`true` / `false`)
- `ENFORCE_ACCESS_CONTROL` (`true` / `false`)
- `PUBLIC_SITE_URL` (default: `https://t.purr.tw`)
- `SHORT_LINKS_SHEET_NAME` (default: `short_links`)
- `CLIENTS_SHEET_NAME` (default: `clients`)
- `AUDIT_LOGS_SHEET_NAME` (default: `audit_logs`)
- `DEFAULT_DAILY_QUOTA` (default: `0`, means unlimited)
- `RESERVED_ALIASES` (comma-separated)

### Google Sheets schema

1. `short_links`
   - `alias`, `url`, `clicks`, `created_by_client`, `status`, `created_at`, `updated_at`, `last_access_at`
2. `clients`
   - `client_code`, `owner_name`, `status`, `capability_token_hash`, `token_hint`, `issued_at`, `expires_at`, `daily_quota`, `daily_used`, `quota_reset_at`, `last_used_at`, `note`
3. `audit_logs`
   - `time`, `event`, `client_code`, `ip`, `result`, `reason`

### API actions

- `POST action=verify_captcha`
- `POST action=create` (default if `url` exists)
- `GET ?query=<alias>` for redirect lookup

### Capability workflow

1. Admin generates capability link:

    ```javascript
  issueCapabilityLink('alice', '2026-12-31T23:59:59.000Z', 10, 'issued manually');
    ```

2. Backend returns dedicated create link:

    ```text
  https://t.purr.tw/#t=<capabilityToken>
    ```

3. User creates short URL with capability token:

    ```bash
    curl -X POST "$GAS_WEBAPP_URL" \
      -d "action=create" \
      -d "url=https://github.com/HeiTang/ShortYou" \
      -d "alias=shortyou" \
      -d "token=RECAPTCHA_TOKEN" \
      -d "ip=1.2.3.4" \
      -d "capabilityToken=CAPABILITY_TOKEN"
    ```

### Admin helper functions (GAS editor)

```javascript
issueCapabilityLink('alice', '2026-12-31T23:59:59.000Z', 10, 'issued manually');
disableClient('c_xxxxxxx');
rotateClientToken('c_xxxxxxx');
```

## CI/CD (GitHub Actions)

- Backend GAS pipeline: `.github/workflows/gas-cicd.yml`
- Frontend Pages pipeline: `.github/workflows/pages.yml`

Required secrets for GAS deploy:

- `CLASPRC_JSON`
- `GAS_SCRIPT_ID`
- `GAS_DEPLOYMENT_ID` (optional)

## Security baseline

- Only homepage is intended for indexing.
- Capability token is only used for create API authorization.
- Token is stored hashed in Sheets (`sha256`) and cannot be recovered.
- Access control is "anti-abuse oriented", not strict identity authentication.

## Todo

- [x] reCAPTCHA 

- [ ] QR Code

- [x] Record IP

- [ ] Refactor Random Generator

## See Also

- [littlechintw / Short-Text-Tool](https://github.com/littlechintw/Short-Text-Tool) - This is a web application that can let the Text change to a short URL and easy to share! 
