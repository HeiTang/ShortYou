
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
  <img src="https://raw.githubusercontent.com/HeiTang/ShortYou/main/demo/page.png">
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

1. Visit the website - [ShortYou](https://t.purr.tw)

2. Enter the link you wish to shorten. The link must begin with `http` or `https` .

    ```
    Example: https://github.com/HeiTang/ShortYou
    ```

3. You can customize link by yourself or blanking.

    ```
    Example: ShortYou
    ```

4. Click "Short URL". Later, You will see the result.

    ```
    Example: https://t.purr.tw/#ShortYou
    ```

## Google Apps Script Backend (clasp)

Backend source code is now under `gas/`.

- TypeScript source: `gas/src/Code.ts`
- Generated deployment file: `gas/Code.js`

1. Install clasp and login.

    ```bash
    npm install
    npm run build
    npm i -g @google/clasp
    clasp login
    ```

2. Create `gas/.clasp.json` from the example, then fill your `scriptId`.

    ```bash
    cp gas/.clasp.json.example gas/.clasp.json
    ```

3. Push source to GAS.

    ```bash
    cd gas
    clasp push
    ```

4. Set Script Properties in Apps Script:

    - `RECAPTCHA_SECRET`: your reCAPTCHA secret key
    - `ENFORCE_CAPTCHA`: `true` or `false` (recommended: `true`)
    - `ENFORCE_ACCESS_CONTROL`: `true` or `false` (recommended: `true`)
    - `CLIENTS_SHEET_NAME`: allowlist sheet name (default: `clients`)
    - `SHORT_SHEET_NAME`: short url sheet name (default: `short`)
    - `RANDOM_ALIAS_INITIAL_LENGTH`: default random alias length start (default: `6`)
    - `RANDOM_ALIAS_MAX_LENGTH`: max random alias length (default: `12`)
    - `RANDOM_ALIAS_TRY_PER_LENGTH`: retries per alias length (default: `12`)
    - `RESERVED_ALIASES`: comma-separated reserved aliases (optional)

5. Create allowlist client credentials in Apps Script editor:

    ```javascript
    // Save/update client (apiKey will be hashed with SHA-256)
    upsertClient('alice', 'YOUR_API_KEY', 'active', 'Alice account');

    // Disable client
    disableClient('alice');

    // Rotate key
    rotateClientKey('alice', 'NEW_API_KEY');
    ```

6. Deploy web app:

    ```bash
    clasp deploy --description "shortyou-backend"
    ```

## CI/CD (GitHub Actions)

Workflow file: `.github/workflows/gas-cicd.yml`

- PR / push: validate GAS source
- main branch push: auto push + deploy GAS

Required GitHub Secrets:

- `CLASPRC_JSON`: content of local `~/.clasprc.json`
- `GAS_SCRIPT_ID`: Apps Script project ID
- `GAS_DEPLOYMENT_ID` (optional): existing deployment ID (if set, workflow updates that deployment)

## Security Baseline

- Backend now defaults `ENFORCE_CAPTCHA=true` when property is missing.
- Backend now defaults `ENFORCE_ACCESS_CONTROL=true` when property is missing.
- Frontend sends `token + ip` together with URL create request.
- URL create API now requires `clientId + apiKey` (per-user credentials) when access control is enabled.
- URL validation blocks non-http(s), overlong URLs, and Sheets formula injection prefixes.
- Custom alias is normalized to lowercase and returns `alias_exists` when collision occurs.
- Keep `RECAPTCHA_SECRET` only in Script Properties (never commit into repo).

### Create API payload example

```bash
curl -X POST "$GAS_WEBAPP_URL" \
  -d "url=https://github.com/HeiTang/ShortYou" \
  -d "alias=shortyou" \
  -d "token=RECAPTCHA_TOKEN" \
  -d "ip=1.2.3.4" \
  -d "clientId=alice" \
  -d "apiKey=YOUR_API_KEY"
```

## Todo

- [x] reCAPTCHA 

- [ ] QR Code

- [x] Record IP

- [ ] Refactor Random Generator

## See Also

- [littlechintw / Short-Text-Tool](https://github.com/littlechintw/Short-Text-Tool) - This is a web application that can let the Text change to a short URL and easy to share! 
