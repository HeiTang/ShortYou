// Run with the Playwright browser_run_code_unsafe tool (filename), against npm run dev:frontend.
(async (page) => {
  page.setDefaultTimeout(10000);
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  let requestDelay = 0;
  let createRequests = 0;
  let response = { success: false, error: 'create_failed' };
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      createRequests += 1;
      if (requestDelay) await page.waitForTimeout(requestDelay);
      return route.fulfill({ json: response });
    }
    if (request.url().includes('challenges.cloudflare.com/turnstile/')) {
      return route.fulfill({ contentType: 'application/javascript', body: `
        window.turnstile = {
          render: (element, callbacks) => { window.testVerification = callbacks; return 'test'; },
          reset: () => {}
        };
        window.onTurnstileApiLoad();
      ` });
    }
    if (!request.url().startsWith('http://127.0.0.1:4321/')) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { if (window.testCopyFailure) throw new Error('denied'); }
    } });
  });
  const text = (id) => page.locator(`#${id}`).textContent();
  const verify = () => page.evaluate(() => window.testVerification.callback('test-token'));
  const submit = async (error) => {
    response = error ? { success: false, error } : { success: true, result: 'test-link' };
    await verify();
    await page.locator('#btn').click();
    await page.waitForFunction(() => document.querySelector('#btn').getAttribute('aria-busy') === 'false');
  };
  const results = [];
  try {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('http://127.0.0.1:4321/');
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      check(await page.locator('#url').inputValue() === 'https://', 'URL must start with HTTPS');
      check(await page.locator('#btn').isVisible() && await page.locator('#btn').isDisabled(), 'Protocol alone must keep submit disabled');
      for (const invalid of ['', 'http://', 'https://', 'httpjunk', 'ftp://example.com']) {
        await page.locator('#url').fill(invalid);
        check(await page.locator('#btn').isDisabled(), `${invalid}: invalid URL must not submit`);
      }
      for (const valid of ['http://example.com', 'https://example.com/path?q=1']) {
        await page.locator('#url').fill(valid);
        check(await page.locator('#btn').isEnabled(), `${valid}: HTTP(S) URL must be accepted`);
      }
      const button = await page.locator('#btn').boundingBox();
      check(button.width === 44 && button.height === 44, 'Submit target must be 44px square');
      await page.locator('#url').fill('https://example.com');
      check(await text('modeHint') === 'Playground only', 'Mode label must be concise');
      check(await page.locator('#modeDescription').isHidden(), 'Mode description must be collapsed');
      await page.locator('#modeSummary').click();
      check(await page.locator('#modeDescription').isVisible(), 'Mode description must open on tap');
      await page.locator('#modeSummary').press('Enter');
      check(await page.locator('#modeDescription').isHidden(), 'Mode description must close with keyboard');
      await page.locator('#btn').focus();
      check(await page.locator('.submit-hint').evaluate((element) => getComputedStyle(element).opacity === '1'), 'Keyboard focus must reveal hint');
      await page.locator('#url').press('Enter');
      await page.locator('#resultCard:not(.hidden)').waitFor();
      check(await page.locator('#modeSummary').isHidden(), 'Playground hint must hide when result appears');
      const cardHeight = (await page.locator('#resultCard').boundingBox()).height;
      check(cardHeight <= 70, 'Idle result card must remain compact');
      check(await text('toast') === '', 'Preview should not show a duplicate toast');
      await page.locator('#copyBtn').click();
      await page.waitForFunction(() => document.querySelector('#copyBtn').classList.contains('is-copied'));
      check(await text('resultFeedback') === '已複製', 'Copy success must be announced');
      check((await page.locator('#resultCard').boundingBox()).height === cardHeight, 'Copy success must not enlarge card');
      await page.waitForFunction(() => !document.querySelector('#copyBtn').classList.contains('is-copied'));
      check(await text('resultFeedback') === '', 'Copy status must reset');
      await page.evaluate(() => { window.testCopyFailure = true; });
      await page.locator('#copyBtn').click();
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('複製失敗'));
      check((await page.locator('#resultCard').boundingBox()).height === cardHeight, 'Copy failure must not enlarge card');
      check(await text('resultFeedback') === '', 'Copy error must not appear in document flow');
      check(await page.locator('#toast').evaluate((element) => getComputedStyle(element).position === 'fixed'), 'Error must float');
      await page.waitForFunction(() => document.querySelector('#toast').textContent === '');
      check(!await page.locator('#toast').evaluate((element) => element.classList.contains('show')), 'Error toast must dismiss');

      await page.evaluate(() => {
        document.querySelector('#qrCanvas').getContext = () => { throw new Error('canvas unavailable'); };
      });
      await page.locator('#qrBtn').click();
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('QR Code 生成失敗'));
      check((await page.locator('#resultCard').boundingBox()).height === cardHeight, 'QR failure must not enlarge card');

      await page.goto('about:blank');
      await page.goto('http://127.0.0.1:4321/#t=feedback-test');
      await page.waitForFunction(() => Boolean(window.testVerification));
      const toast = await page.locator('#toast').boundingBox();
      check(toast.x >= 16 && toast.x + toast.width <= width - 16, 'Toast must fit viewport');
      check(Math.abs(toast.x + toast.width / 2 - width / 2) < 1, 'Toast must be centered');
      const footer = await page.locator('footer').boundingBox();
      check(toast.y + toast.height + 16 <= footer.y, 'Toast must clear footer text by at least 16px');
      await page.locator('#url').fill('https://example.com');
      await verify();
      response = { success: true, result: 'loading-test' };
      requestDelay = 700;
      const requestsBefore = createRequests;
      await page.locator('#url').press('Enter');
      await page.waitForFunction(() => document.querySelector('#btn').getAttribute('aria-busy') === 'true');
      check(await page.locator('.submit-spinner').isVisible(), 'Pending submit must show spinner');
      const busyButton = await page.locator('#btn').boundingBox();
      check(busyButton.width === 44 && busyButton.height === 44, 'Loading must preserve button size');
      await page.locator('#url').fill('https://example.org');
      check(await page.locator('#btn').isDisabled(), 'Editing must not re-enable pending submit');
      await page.evaluate(() => document.querySelector('#shortenForm').requestSubmit());
      await page.waitForFunction(() => document.querySelector('#btn').getAttribute('aria-busy') === 'false');
      check(createRequests === requestsBefore + 1, 'Pending form must reject duplicate submissions');
      check(await page.locator('.submit-arrow').isVisible(), 'Completion must restore arrow');
      requestDelay = 0;
      await page.evaluate(() => window.testVerification['expired-callback']());
      check((await text('toast')).includes('已過期'), 'Expired verification must float');
      await page.evaluate(() => window.testVerification['error-callback']());
      check((await text('toast')).includes('驗證失敗'), 'Verification callback error must float');
      await page.locator('#url').fill('https://example.com');
      await submit('invalid_url');
      await page.waitForFunction(() => document.querySelector('#url').getAttribute('aria-invalid') === 'true');
      await page.locator('#url').fill('https://example.org');
      check(await page.locator('#url').getAttribute('aria-invalid') === null, 'Editing must clear field error');
      await page.locator('#aliasToggle').click();
      await page.locator('#alias').fill('taken');
      await submit('alias_exists');
      await page.waitForFunction(() => document.querySelector('#alias').getAttribute('aria-invalid') === 'true');
      check((await text('toast')).includes('自訂短網址已被使用'), 'Alias error must float');
      const codes = [
        'capability_token_required', 'unauthorized_client', 'client_disabled', 'token_expired',
        'client_quota_exceeded', 'create_failed', 'missing_url', 'invalid_json', 'alias_generation_failed',
        'invalid_url', 'alias_exists', 'invalid_alias', 'reserved_alias', 'captcha_required', 'captcha_failed',
        'timeout-or-duplicate', 'missing-input-response', 'invalid-input-response', 'missing-input-secret',
        'invalid-input-secret', 'bad-request', 'internal-error', 'turnstile_fetch_failed'
      ];
      for (const code of codes) {
        await submit(code);
        await page.waitForFunction(() => document.querySelector('#toast').classList.contains('is-error'));
        check((await text('toast')).length > 0, `${code}: error message required`);
        check(await page.locator('#toast').evaluate((element) => getComputedStyle(element).position === 'fixed'), `${code}: error must float`);
        check(await page.locator('#urlFeedback, #aliasFeedback, #verificationFeedback, #formFeedback').count() === 0, 'Errors must not occupy form space');
        if (code === 'unauthorized_client') check(await text('toast') === '授權資訊無效，請重新取得建立連結。', 'Authorization error must be specific');
      }
      response = { success: false, error: 'captcha_failed', 'error-codes': ['invalid-input-secret'] };
      await verify();
      await page.locator('#btn').click();
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('設定錯誤'));
      await page.waitForFunction(() => document.querySelector('#toast').textContent === '');
      await submit();
      await page.waitForFunction(() => document.querySelector('#resultLink').textContent.endsWith('#test-link'));
      check(await text('toast') === '' && await text('modeHint') === 'Authorized mode', 'Success must clear old error');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must not overflow');
      results.push(`${width}px: preview, copy, all 23 error codes, recovery and layout passed`);
    }
    await page.route('**/src/scripts/config.ts*', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: "export function getFrontendConfig() { throw new Error('missing config'); }"
    }));
    await page.goto('about:blank');
    await page.goto('http://127.0.0.1:4321/');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('初始化失敗'));
    await page.unroute('**/src/scripts/config.ts*');

    await page.route('**/src/scripts/config.ts*', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: "export function getFrontendConfig() { return {api: '/test-api', turnstileSiteKey: ''}; }"
    }));
    await page.goto('about:blank');
    await page.goto('http://127.0.0.1:4321/#t=feedback-test');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('驗證服務尚未設定'));
    check(!(await text('toast')).includes('Authorized mode enabled'), 'Mode notice must not overwrite setup error');
    await page.unroute('**/src/scripts/config.ts*');

    await page.route('**/turnstile/v0/api.js*', (route) => route.abort());
    await page.goto('about:blank');
    await page.goto('http://127.0.0.1:4321/#t=feedback-test');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('驗證服務載入失敗'));
    await page.unroute('**/turnstile/v0/api.js*');

    for (const networkFailure of [false, true]) {
      await page.route('**/*query=*', (route) => networkFailure ? route.abort() : route.fulfill({ json: { success: false } }));
      await page.goto('about:blank');
      await page.goto('http://127.0.0.1:4321/#missing-test');
      const expected = networkFailure ? '短網址查詢失敗' : '找不到這個短網址';
      await page.waitForFunction((message) => document.querySelector('#toast').textContent.includes(message), expected);
      check(await page.evaluate(() => Number(getComputedStyle(document.querySelector('#toast')).zIndex) > Number(getComputedStyle(document.querySelector('#redirectOverlay')).zIndex)), 'Redirect error must be above overlay');
      await page.waitForURL('http://127.0.0.1:4321/');
      await page.unroute('**/*query=*');
    }
    results.push('Initialization, missing site key, script load failure and both redirect errors passed');
    return results;
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
