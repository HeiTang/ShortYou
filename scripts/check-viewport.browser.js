// Run against npm run dev:frontend with external fonts blocked to cover fallback layout.
(async (page) => {
  for (const [width, height] of [[240, 480], [280, 480], [320, 480], [360, 640], [390, 844], [768, 600], [844, 390], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4321/');
    await page.evaluate(() => {
      document.querySelector('.hero-subtitle').textContent = 'Too Height ? Shorten it !';
    });
    const check = async (state) => {
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        title: getComputedStyle(document.querySelector('h1')).fontSize
      }));
      if (size.width > width || size.height > height) {
        throw new Error(`${width}x${height} ${state}: ${JSON.stringify(size)}`);
      }
    };
    await check('initial');
    await page.locator('#url').fill('https://example.com');
    await page.locator('#btn').click();
    await page.locator('#resultCard:not(.hidden)').waitFor();
    await page.locator('#aliasToggle').click();
    await page.waitForFunction(() => document.querySelector('#aliasPanel').getBoundingClientRect().height >= 44);
    await check('result and alias');
  }
  return 'Passed: initial and result/alias layouts at all eight viewport sizes';
});
