// Run with the Playwright browser_run_code_unsafe tool (filename), against npm run dev:frontend.
(async (page) => {
  page.setDefaultTimeout(10000);
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  let response = { success: false, error: 'create_failed' };
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') return route.fulfill({ json: response });
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
  };
  const results = [];
  try {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('http://127.0.0.1:4321/');
      await page.locator('#url').fill('https://example.com');
      check(await text('modeHint') === 'Playground only', 'Mode label must be concise');
      check(await page.locator('#modeDescription').isHidden(), 'Mode description must be collapsed');
      await page.locator('#modeSummary').click();
      check(await page.locator('#modeDescription').isVisible(), 'Mode description must open on tap');
      await page.locator('#modeSummary').press('Enter');
      check(await page.locator('#modeDescription').isHidden(), 'Mode description must close with keyboard');
      await page.locator('#btn').click();
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
      await page.evaluate(() => window.testVerification['expired-callback']());
      check((await text('verificationFeedback')).includes('已過期'), 'Expired verification must be inline');
      await page.locator('#url').fill('https://example.com');
      await submit('invalid_url');
      await page.waitForFunction(() => document.querySelector('#url').getAttribute('aria-invalid') === 'true');
      await page.locator('#url').fill('https://example.org');
      check(await text('urlFeedback') === '', 'Editing must clear field error');
      await page.locator('#aliasToggle').click();
      await page.locator('#alias').fill('taken');
      await submit('alias_exists');
      await page.waitForFunction(() => document.querySelector('#aliasFeedback').textContent.length > 0);
      const field = await page.locator('#aliasPanel').boundingBox();
      const error = await page.locator('#aliasFeedback').boundingBox();
      check(error.y >= field.y + field.height, 'Alias error must not be clipped by panel');
      await submit('create_failed');
      await page.waitForFunction(() => document.querySelector('#formFeedback').textContent.length > 0);
      await page.waitForTimeout(4200);
      check((await text('formFeedback')).includes('建立短網址失敗'), 'Create failure must persist');
      await submit('captcha_failed');
      await page.waitForFunction(() => document.querySelector('#verificationFeedback').textContent.length > 0);
      await submit();
      await page.waitForFunction(() => document.querySelector('#resultLink').textContent.endsWith('#test-link'));
      check(await text('formFeedback') === '' && await text('verificationFeedback') === '', 'Success must clear errors');
      check(await text('toast') === '' && await text('modeHint') === 'Authorized mode', 'Real result must not show duplicate success or preview note');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must not overflow');
      results.push(`${width}px: preview, copy, persistent errors, field routing, recovery and layout passed`);
    }
    return results;
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
