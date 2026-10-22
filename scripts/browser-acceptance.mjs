import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.KURO_BASE_URL || 'http://127.0.0.1:4173/';
const failures = [];
const runtimeErrors = [];
const browser = await chromium.launch({ headless: true });

async function runCheck(name, callback) {
  try {
    await callback();
    console.log('PASS ' + name);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    failures.push({ name, message });
    console.error('FAIL ' + name + '\n' + message);
    try {
      await page?.screenshot({ path: '/tmp/kuro-browser-acceptance-failure.png', fullPage: true });
    } catch { /* A failed navigation may not have a screenshotable page. */ }
  }
}

let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  page = await context.newPage();
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await runCheck('loads the creative home and primary action', async () => {
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(response && response.ok(), 'The app URL did not return a successful response.');
    await page.locator('.home-dashboard').waitFor({ state: 'visible', timeout: 45000 });
    assert.match(await page.locator('.home-hero h1').innerText(), /Your next world/i);
    assert.equal(await page.getByRole('button', { name: /Talk to Kuro/i }).first().isVisible(), true);
  });

  await runCheck('home stays within representative phone, tablet, and desktop widths', async () => {
    for (const width of [320, 360, 390, 430, 600, 601, 768, 900, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(60);
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(sizes.html <= width + 1 && sizes.body <= width + 1,
        'Home horizontally overflows at ' + width + 'px: ' + JSON.stringify(sizes));
      if (width <= 600) {
        assert.equal(await page.getByRole('navigation', { name: 'Primary navigation' }).isVisible(), true,
          'Mobile navigation should be visible at ' + width + 'px.');
      }
    }
  });

  await runCheck('opens chat and preserves a message when local-model preparation is declined', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Talk to Kuro/i }).first().click();
    const composer = page.getByRole('textbox', { name: 'Message to Kuro' });
    await composer.waitFor({ state: 'visible', timeout: 15000 });
    await composer.fill('Please help me design a fantasy character.');
    let confirmationSeen = false;
    page.once('dialog', async dialog => {
      confirmationSeen = dialog.type() === 'confirm';
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText(/No download started/i).waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(confirmationSeen, true, 'A first-run model download should require explicit consent.');
    assert.equal(await composer.inputValue(), 'Please help me design a fantasy character.',
      'Declining setup must preserve the draft.');
  });

  await runCheck('settings dialog opens and can be closed without an exception', async () => {
    await page.getByRole('button', { name: 'Settings and model downloads' }).click();
    const dialog = page.getByRole('dialog', { name: 'Kuro settings' });
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Close settings' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
  });

  await runCheck('drawing workspace opens and pointer input changes the canvas', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const toolsToggle = page.getByRole('button', { name: /Creative tools/i });
    await toolsToggle.click();
    await page.getByRole('button', { name: 'Drawing canvas', exact: true }).click();
    const canvas = page.locator('canvas[aria-label^="Drawing canvas. Use pointer"]');
    await canvas.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => {
      const element = document.querySelector('canvas[aria-label^="Drawing canvas. Use pointer"]');
      return element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0;
    }, null, { timeout: 10000 });
    const before = await canvas.evaluate(element => (element).toDataURL());
    const bounds = await canvas.boundingBox();
    assert(bounds && bounds.width > 60 && bounds.height > 60, 'Drawing canvas has no usable visible area.');
    await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.28);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.45, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(previous => {
      const element = document.querySelector('canvas[aria-label^="Drawing canvas. Use pointer"]');
      return element instanceof HTMLCanvasElement && element.toDataURL() !== previous;
    }, before, { timeout: 10000 });
    await page.locator('.save-indicator.saved').waitFor({ state: 'visible', timeout: 15000 });
  });

  await runCheck('drawing workspace stays within phone and tablet widths', async () => {
    for (const width of [320, 360, 390, 430, 600, 601, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(80);
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(sizes.html <= width + 1 && sizes.body <= width + 1,
        'Drawing workspace horizontally overflows at ' + width + 'px: ' + JSON.stringify(sizes));
    }
  });

  await runCheck('no uncaught JavaScript runtime errors occurred', async () => {
    assert.deepEqual(runtimeErrors, [], 'Uncaught browser errors: ' + runtimeErrors.join(' | '));
  });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('\n' + failures.length + ' browser acceptance check(s) failed.');
  process.exitCode = 1;
} else {
  console.log('\nAll browser acceptance checks passed.');
}
