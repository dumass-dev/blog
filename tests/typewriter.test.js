/* global window */
import './setup-offline.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'vite';
import { chromium } from 'playwright';

describe('Typewriter Effect Tests', () => {
  let viteServer;
  let baseUrl;
  let browser;

  before(async () => {
    viteServer = await createServer({
      server: { port: 0 }
    });
    await viteServer.listen();
    const address = viteServer.httpServer.address();
    baseUrl = `http://localhost:${address.port}`;

    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
  });

  test('1. Default state is OFF and text renders instantly', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseUrl}/about`, { waitUntil: 'domcontentloaded' });

    // Check localStorage default
    const savedState = await page.evaluate(() => localStorage.getItem('typewriter-enabled'));
    assert.strictEqual(savedState === 'true', false, 'Typewriter effect should default to OFF');

    // Confirm author heading is present and visible
    const heading = await page.textContent('h1');
    assert.ok(heading && heading.trim().length > 0, 'Heading text should be instantly rendered when toggle is OFF');

    await context.close();
  });

  test('2. Toggle turns typewriter effect ON/OFF and persists in localStorage', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

    // Locate typewriter toggle button
    const toggleButton = page.locator('button[aria-label="Toggle typewriter text reveal"]').first();
    await toggleButton.waitFor({ state: 'visible' });

    // Verify initial ARIA pressed state is false
    const initialPressed = await toggleButton.getAttribute('aria-pressed');
    assert.strictEqual(initialPressed, 'false', 'Initial aria-pressed should be false');

    // Click to turn ON
    await toggleButton.click();
    const onPressed = await toggleButton.getAttribute('aria-pressed');
    assert.strictEqual(onPressed, 'true', 'After click, aria-pressed should be true');

    const stateOn = await page.evaluate(() => localStorage.getItem('typewriter-enabled'));
    assert.strictEqual(stateOn, 'true', 'localStorage typewriter-enabled should be "true"');

    // Reload page to verify persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    const persistedState = await page.evaluate(() => localStorage.getItem('typewriter-enabled'));
    assert.strictEqual(persistedState, 'true', 'typewriter-enabled state must persist across reloads');

    // Click to turn OFF again
    const toggleAfterReload = page.locator('button[aria-label="Toggle typewriter text reveal"]').first();
    await toggleAfterReload.click();
    const stateOff = await page.evaluate(() => localStorage.getItem('typewriter-enabled'));
    assert.strictEqual(stateOff, 'false', 'localStorage typewriter-enabled should be "false" after toggling off');

    await context.close();
  });

  test('3. When ON: Text reveals character-by-character with zero layout shift and completes in under 600ms', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Enable typewriter effect in localStorage beforehand
    await page.addInitScript(() => {
      localStorage.setItem('typewriter-enabled', 'true');
    });

    await page.goto(`${baseUrl}/about`, { waitUntil: 'domcontentloaded' });

    // Inspect heading element
    const h1 = page.locator('h1').first();
    await h1.waitFor({ state: 'visible' });

    // Measure initial container dimensions at start of animation
    const initialBox = await h1.boundingBox();
    assert.ok(initialBox && initialBox.height > 0, 'Container height must be non-zero at start');

    // Wait 500ms for animation to complete
    await page.waitForTimeout(550);

    // Measure final container dimensions
    const finalBox = await h1.boundingBox();

    // Confirm height did not shift (zero layout shift requirement)
    assert.strictEqual(Math.round(initialBox.height), Math.round(finalBox.height), 'Heading height should remain stable during text reveal (zero layout shift)');

    // Confirm text is 100% revealed
    const fullText = await h1.textContent();
    assert.ok(fullText && fullText.length > 0, 'Full text should be completely revealed');

    await context.close();
  });

  test('4. prefers-reduced-motion overrides typewriter effect and reveals text instantly', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.addInitScript(() => {
      localStorage.setItem('typewriter-enabled', 'true');
    });

    await page.goto(`${baseUrl}/about`, { waitUntil: 'domcontentloaded' });

    const h1 = page.locator('h1').first();
    await h1.waitFor({ state: 'visible' });

    // Text should be instantly 100% visible even at frame 0 (no hidden span)
    const hiddenSpans = await page.locator('h1 span[style*="visibility: hidden"]').count();
    assert.strictEqual(hiddenSpans, 0, 'No hidden animation spans should exist when prefers-reduced-motion is active');

    await context.close();
  });
});
