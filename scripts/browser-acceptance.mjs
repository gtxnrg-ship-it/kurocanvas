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

  await runCheck('chat exposes a usable creative-format picker on narrow screens', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const picker = page.getByRole('combobox', { name: 'Preferred production format' });
    await picker.waitFor({ state: 'visible', timeout: 10000 });
    const options = await picker.locator('option').allTextContents();
    assert.ok(options.some(option => /Webtoon/i.test(option)), 'Webtoon should be offered as a first-class format.');
    assert.ok(options.some(option => /one-shot/i.test(option)), 'Short one-shots should be a first-class format.');
    assert.ok(options.some(option => /Custom creative format/i.test(option)), 'Custom formats should remain open-ended.');
    await picker.selectOption('webtoon');
    assert.equal(await picker.inputValue(), 'webtoon', 'The creator should be able to explicitly select Webtoon.');
    await picker.selectOption('auto');
    const sizes = await page.evaluate(() => ({
      viewport: window.innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(sizes.html <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1,
      'The format picker must not create horizontal overflow on mobile: ' + JSON.stringify(sizes));
  });

  await runCheck('story output waits for approved world and character foundations', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const composer = page.getByRole('textbox', { name: 'Message to Kuro' });
    await composer.fill('Write the opening scene where Mira meets Ren.');
    let unexpectedDownloadPrompt = false;
    page.once('dialog', async dialog => {
      unexpectedDownloadPrompt = dialog.type() === 'confirm';
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText(/holding story production/i).waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(unexpectedDownloadPrompt, false, 'Foundation checks must happen before the local model download prompt.');
    assert.equal(await page.locator('.live-studio').isVisible().catch(() => false), false,
      'A scene must not enter drawing mode while approved foundations are missing.');
    assert.equal(await composer.inputValue(), '', 'A blocked story request is recorded as a conversation turn, not left as a stale composer draft.');
  });

  await runCheck('creative-influence research queues without preparing the local model', async () => {
    const composer = page.getByRole('textbox', { name: 'Message to Kuro' });
    await composer.fill('Borrow relationship dynamics from Horimiya and leadership from Tokyo Revengers for an original story.');
    let unexpectedDownloadPrompt = false;
    page.once('dialog', async dialog => {
      unexpectedDownloadPrompt = dialog.type() === 'confirm';
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText(/queued separate source-backed research tasks/i).waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(unexpectedDownloadPrompt, false, 'Explicit research tools should be available without downloading Qwen.');
    assert.equal(await page.locator('.live-studio').isVisible().catch(() => false), false,
      'A research request should remain in chat rather than jumping into drawing.');
  });

  await runCheck('chat scope controls stay within representative mobile widths', async () => {
    for (const width of [320, 360, 390, 430, 600, 601, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(60);
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(sizes.html <= width + 1 && sizes.body <= width + 1,
        'Chat horizontally overflows at ' + width + 'px: ' + JSON.stringify(sizes));
      const scope = page.getByRole('combobox', { name: 'Universe project for canon context' });
      assert.equal(await scope.isVisible(), true, 'World Bible scope control should remain visible.');
    }
  });

  await runCheck('settings dialog opens and can be closed without an exception', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Settings and model downloads' }).click();
    const dialog = page.getByRole('dialog', { name: 'Kuro settings' });
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Close settings' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
  });

  await runCheck('external model setup requires consent, keeps keys session-only, and supports revocation', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const endpoint = 'https://model-test.example.invalid/v1';
    const sessionKey = 'acceptance-session-key-not-for-persistence';
    const listedModel = 'kuro-vision-fixture';
    let modelListRequests = 0;

    await page.route('https://model-test.example.invalid/v1/**', async route => {
      const request = route.request();
      const originHeaders = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'authorization,content-type',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: originHeaders });
        return;
      }
      if (request.method() === 'GET' && request.url().endsWith('/models')) {
        modelListRequests++;
        await route.fulfill({
          status: 200,
          headers: { ...originHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ data: [{ id: listedModel, owned_by: 'browser-acceptance' }] }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        headers: { ...originHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Unexpected fixture request.' } }),
      });
    });

    const openSettings = async () => {
      await page.getByRole('button', { name: 'Settings and model downloads' }).click();
      const dialog = page.getByRole('dialog', { name: 'Kuro settings' });
      await dialog.waitFor({ state: 'visible', timeout: 10000 });
      return dialog;
    };
    let dialog = await openSettings();
    const external = dialog.locator('.provider-external-settings');
    await external.waitFor({ state: 'visible', timeout: 5000 });
    const consent = external.locator('.provider-consent input[type="checkbox"]');
    assert.equal(await consent.isChecked(), false, 'Remote context sharing must be off by default.');
    const initial = await page.evaluate(() => ({
      provider: localStorage.getItem('kuro-model-provider') || '',
      key: sessionStorage.getItem('kuro-model-api-key'),
    }));
    assert.equal(initial.key, null, 'No model API key should exist in session storage by default.');
    assert.ok(!initial.provider.includes('apiKey'), 'The provider preference must not persist API-key fields.');

    await external.locator('input[type="url"]').fill(endpoint);
    await external.locator('input[type="password"]').fill(sessionKey);
    await consent.check();
    await external.getByRole('button', { name: 'Test endpoint & load models' }).click();
    await external.getByText(/Endpoint responded and listed 1 model ID/).waitFor({ state: 'visible', timeout: 10000 });
    await external.getByLabel('Model ID').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await external.getByLabel('Model ID').inputValue(), listedModel,
      'The exact ID returned by /models should become the selected model.');

    await external.getByRole('button', { name: 'Use selected external model' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForFunction(key => {
      const raw = localStorage.getItem('kuro-model-provider') || '{}';
      return raw.includes('"allowRemoteData":true')
        && !raw.includes(key)
        && !raw.includes('apiKey')
        && sessionStorage.getItem('kuro-model-api-key') === key;
    }, sessionKey, { timeout: 10000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kuro-model-provider') || '{}'));
    assert.equal(saved.baseUrl, endpoint);
    assert.equal(saved.modelUri, listedModel);
    assert.equal(saved.allowRemoteData, true);
    assert.equal(saved.supportsVision, false, 'Image sharing must remain off unless the creator enables it.');
    assert.ok(modelListRequests >= 2, 'The model ID should be revalidated before the provider is connected.');
    assert.ok(!JSON.stringify(saved).includes(sessionKey), 'API key material must never be stored in the project-provider preference.');

    dialog = await openSettings();
    const revocation = dialog.locator('.provider-consent input[type="checkbox"]');
    assert.equal(await revocation.isChecked(), true, 'An already-enabled external provider should show its consent state.');
    await revocation.uncheck();
    await page.waitForFunction(() => {
      const savedConfig = JSON.parse(localStorage.getItem('kuro-model-provider') || '{}');
      return savedConfig.baseUrl === 'local://kuro-tiny'
        && sessionStorage.getItem('kuro-model-api-key') === null;
    }, null, { timeout: 10000 });
    await page.getByRole('button', { name: 'Close settings' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
  });

  await runCheck('whole-series planning controls remain usable on phones and block unapproved production', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Creative Vault', exact: true }).click();
    await page.getByRole('navigation', { name: 'Vault sections' }).getByRole('button', { name: 'Visual style', exact: true }).click();
    await page.getByRole('heading', { name: 'Series plan, opening to finale' }).waitFor({ state: 'visible', timeout: 15000 });
    const outline = page.getByRole('textbox', { name: /Complete chapter \/ episode outline/i });
    await outline.waitFor({ state: 'visible', timeout: 10000 });
    const approve = page.getByRole('button', { name: /Review and approve full series/i });
    assert.equal(await approve.isDisabled(), true, 'An empty/incomplete outline must not be approvable.');
    for (const width of [320, 360, 390, 430, 600, 601, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(60);
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(sizes.html <= width + 1 && sizes.body <= width + 1,
        'Series planning UI horizontally overflows at ' + width + 'px: ' + JSON.stringify(sizes));
      assert.equal(await page.getByRole('heading', { name: 'Series plan, opening to finale' }).isVisible(), true,
        'The series plan heading should remain visible at ' + width + 'px.');
    }
    await page.getByRole('button', { name: 'Talk to Kuro', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message to Kuro' }).waitFor({ state: 'visible', timeout: 10000 });
  });

  await runCheck('Live Creation studio stays usable from phones through desktop', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const toolsToggle = page.getByRole('button', { name: /Creative tools/i });
    const liveNav = page.getByRole('button', { name: 'Live Creation', exact: true });
    if (!(await liveNav.isVisible())) await toolsToggle.click();
    await liveNav.click();
    await page.locator('.live-studio').waitFor({ state: 'visible', timeout: 20000 });
    await page.getByRole('button', { name: 'Back to chat' }).waitFor({ state: 'visible' });
    await page.locator('.live-composer textarea').waitFor({ state: 'visible' });
    const batchLimit = page.getByRole('combobox', { name: 'Live creation batch limit' });
    await batchLimit.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await batchLimit.inputValue(), '12', 'New live creation sessions should default to a useful but bounded long-form run.');
    await batchLimit.selectOption('20');
    assert.equal(await batchLimit.inputValue(), '20', 'Creators can extend the verified-run limit up to the documented safety maximum.');
    await batchLimit.selectOption('12');

    for (const width of [320, 360, 390, 430, 600, 601, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(80);
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(sizes.html <= width + 1 && sizes.body <= width + 1,
        'Live Creation horizontally overflows at ' + width + 'px: ' + JSON.stringify(sizes));
      if (width <= 600) {
        assert.equal(await page.locator('.live-canvas-pane .draw-toolbar').isVisible(), true,
          'Phone Live Creation must keep the native drawing controls visible.');
        assert.equal(await page.locator('.live-canvas-pane canvas[aria-label^="Drawing canvas. Use pointer"]').evaluate(element => getComputedStyle(element).pointerEvents), 'auto',
          'Phone Live Creation must keep canvas input enabled.');
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Back to chat' }).click();
    await page.locator('.chatlayout').waitFor({ state: 'visible', timeout: 10000 });
  });

  await runCheck('drawing workspace edits, autosaves, and restores after page reload', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const toolsToggle = page.getByRole('button', { name: /Creative tools/i });
    const drawingNav = page.getByRole('button', { name: 'Drawing canvas', exact: true });
    if (!(await drawingNav.isVisible())) await toolsToggle.click();
    await drawingNav.click();
    const canvas = page.locator('canvas[aria-label^="Drawing canvas. Use pointer"]');
    await canvas.waitFor({ state: 'visible', timeout: 20000 });
    await canvas.scrollIntoViewIfNeeded();
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
    const savedCanvasData = await canvas.evaluate(element => element.toDataURL());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('.home-dashboard').waitFor({ state: 'visible', timeout: 30000 });
    const reopenTools = page.getByRole('button', { name: /Creative tools/i });
    const reopenDrawing = page.getByRole('button', { name: 'Drawing canvas', exact: true });
    if (!(await reopenDrawing.isVisible())) await reopenTools.click();
    await reopenDrawing.click();
    const restoredCanvas = page.locator('canvas[aria-label^="Drawing canvas. Use pointer"]');
    await restoredCanvas.waitFor({ state: 'visible', timeout: 20000 });
    await restoredCanvas.scrollIntoViewIfNeeded();
    await page.waitForFunction(expected => {
      const element = document.querySelector('canvas[aria-label^="Drawing canvas. Use pointer"]');
      return element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0 && element.toDataURL() === expected;
    }, savedCanvasData, { timeout: 20000 });
  });

  await runCheck('cancelled pointer gestures discard unfinished strokes', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const toolsToggle = page.getByRole('button', { name: /Creative tools/i });
    const drawingNav = page.getByRole('button', { name: 'Drawing canvas', exact: true });
    if (!(await drawingNav.isVisible())) await toolsToggle.click();
    if (!(await page.locator('canvas[aria-label^="Drawing canvas. Use pointer"]').isVisible().catch(() => false))) {
      await drawingNav.click();
    }
    const canvas = page.locator('canvas[aria-label^="Drawing canvas. Use pointer"]');
    await canvas.waitFor({ state: 'visible', timeout: 20000 });
    await canvas.scrollIntoViewIfNeeded();
    const before = await canvas.evaluate(element => element.toDataURL());
    const bounds = await canvas.boundingBox();
    assert(bounds && bounds.width > 60 && bounds.height > 60, 'Drawing canvas has no usable visible area.');

    await page.mouse.move(bounds.x + bounds.width * 0.30, bounds.y + bounds.height * 0.32);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.57, { steps: 4 });
    await page.evaluate(() => {
      const element = document.querySelector('canvas[aria-label^="Drawing canvas. Use pointer"]');
      if (!(element instanceof HTMLCanvasElement)) throw new Error('Drawing canvas disappeared during the active gesture.');
      element.dispatchEvent(new PointerEvent('pointercancel', {
        bubbles: true, cancelable: true, pointerId: 1,
      }));
    });
    await page.mouse.up();

    await page.getByText(/Stroke cancelled · unfinished marks were discarded/).waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(previous => {
      const element = document.querySelector('canvas[aria-label^="Drawing canvas. Use pointer"]');
      return element instanceof HTMLCanvasElement && element.toDataURL() === previous;
    }, before, { timeout: 10000 });
  });

  await runCheck('phone viewport retains accessible drawing controls and editable canvas input', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.drawing-alt .draw-toolbar').isVisible(), true,
      'The phone layout must retain drawing tools.');
    assert.equal(await page.locator('.drawing-project-controls').isVisible(), true,
      'The phone layout must retain project and drawing controls.');
    const canvas = page.locator('canvas[aria-label^="Drawing canvas. Use pointer"]');
    await canvas.scrollIntoViewIfNeeded();
    assert.equal(await canvas.evaluate(element => getComputedStyle(element).pointerEvents), 'auto',
      'Touch-capable phones must not have drawing input disabled.');
    const before = await canvas.evaluate(element => element.toDataURL());
    const bounds = await canvas.boundingBox();
    assert(bounds && bounds.width > 60 && bounds.height > 60, 'The phone canvas has no usable visible area.');
    await page.mouse.move(bounds.x + bounds.width * 0.22, bounds.y + bounds.height * 0.30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.48, { steps: 5 });
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


  await runCheck('Reader loads saved drawing previews as pages approach the viewport', async () => {
    // Sidebar navigation is intentionally hidden in the compact phone layout.
    // Use the desktop nav to enter Reader, then check the actual preview at phone width.
    await page.setViewportSize({ width: 1280, height: 900 });
    const toolsToggle = page.getByRole('button', { name: /Creative tools/i });
    const readerNav = page.getByRole('button', { name: 'Reader', exact: true });
    if (!(await readerNav.isVisible())) await toolsToggle.click();
    await readerNav.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.reader-workspace').waitFor({ state: 'visible', timeout: 15000 });
    const cards = page.locator('.reader-page');
    await cards.first().waitFor({ state: 'visible', timeout: 10000 });
    await cards.first().scrollIntoViewIfNeeded();
    await page.locator('.reader-page-art img[src^="blob:"]').first().waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('.reader-page-count').isVisible(), true,
      'Reader should present saved drawings as a continuous, scrollable list.');
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
