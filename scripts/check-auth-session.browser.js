// Run with the Playwright browser_run_code_unsafe tool (filename), against npm run dev:frontend.
(async (page) => {
  const context = await page.context().browser().newContext();
  const tab = await context.newPage();
  const base = 'http://127.0.0.1:4321/';
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const tokens = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      tokens.push(new URLSearchParams(request.postData()).get('capabilityToken'));
      return route.fulfill({ json: { success: true, result: 'test-link' } });
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
    if (!request.url().startsWith(base)) return route.abort();
    return route.continue();
  });
  const authorized = async () => {
    await tab.waitForFunction(() => Boolean(window.testVerification));
    check((await tab.locator('#modeHint').textContent()).startsWith('Authorized mode'), 'Authorization must persist');
    check(new URL(tab.url()).hash === '', 'Token must be removed from URL');
  };
  try {
    await tab.goto(`${base}?#t=session-test`);
    await authorized();
    for (let index = 0; index < 2; index++) {
      await tab.reload();
      await authorized();
      await tab.locator('#url').fill('https://example.com');
      await tab.evaluate(() => window.testVerification.callback('captcha-test'));
      await tab.locator('#btn').click();
      await tab.locator('#resultCard:not(.hidden)').waitFor();
      check(await tab.locator('#btn').isDisabled(), 'Each create must require fresh verification');
    }
    check(tokens.length === 2 && tokens.every((token) => token === 'session-test'), 'Reloaded creates must send saved token');
    await tab.goto('about:blank');
    await tab.goto(`${base}#t=replacement-test`);
    await authorized();
    await tab.reload();
    check(await tab.evaluate(() => sessionStorage.getItem('shortyou:capabilityToken:/')) === 'replacement-test', 'New token must replace saved token');
    const freshTab = await context.newPage();
    await freshTab.goto(base);
    check((await freshTab.locator('#modeHint').textContent()).startsWith('Playground only'), 'Independent tab must start in playground');
    await tab.goto('about:blank');
    await tab.goto(`${base}#demo-preview`);
    check(await tab.locator('html').evaluate((element) => element.classList.contains('is-redirecting')), 'Saved authorization must not intercept aliases');
    await freshTab.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    await freshTab.reload();
    check((await freshTab.locator('#modeHint').textContent()).startsWith('Playground only'), 'Blocked storage must not break playground');
    await freshTab.goto('about:blank');
    await freshTab.goto(`${base}#t=blocked-storage-test`);
    await freshTab.waitForFunction(() => Boolean(window.testVerification));
    check((await freshTab.locator('#modeHint').textContent()).startsWith('Authorized mode'), 'Blocked storage must still allow explicit authorization');
    return 'Passed: reload, repeated creates, fresh captcha, token replacement, independent tab, alias redirect, blocked storage';
  } finally {
    await context.close();
  }
});
