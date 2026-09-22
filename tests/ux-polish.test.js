import './setup-offline.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'vite';
import { chromium } from 'playwright';

describe('UX Polish Round 1 - UI Bug Tests', () => {
  let viteServer;
  let baseUrl;
  let browser;
  const adminId = 'admin-uuid-12345678';

  before(async () => {
    viteServer = await createServer({
      define: {
        'import.meta.env.VITE_ADMIN_USER_ID': JSON.stringify(adminId)
      },
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

  test('BUG A: Publish flow disables button, shows "Publishing...", and navigates to /admin on success', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock Supabase Auth
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-admin-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh-token',
          user: { id: adminId, email: 'admin@example.com' }
        })
      });
    });

    // Mock API requests - successful save with 200ms delay
    await page.route('**/api/posts', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        await new Promise(r => setTimeout(r, 200));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'post-abc-123', title: 'Test Post', slug: 'test-post' })
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await page.route('**/api/about', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // Login first
    await page.goto(`${baseUrl}/admin/login`);
    await page.fill('input[type="email"], input[placeholder*="email" i], input[placeholder*="username" i]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');

    // Go to editor
    await page.goto(`${baseUrl}/admin/new`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[placeholder*="Title"]', 'New Polish Entry');
    await page.fill('textarea', 'Body content of entry');

    const publishBtn = page.locator('button').filter({ hasText: /Publish/ });
    assert.strictEqual(await publishBtn.innerText(), 'Publish');

    // Click publish
    const clickPromise = publishBtn.click();

    // Check loading state immediately
    await page.waitForTimeout(50);
    const savingBtn = page.locator('button').filter({ hasText: /Publishing.../ });
    const isVisible = await savingBtn.isVisible();
    assert.strictEqual(isVisible, true, 'Button should show Publishing... state during save');
    const isDisabled = await savingBtn.isDisabled();
    assert.strictEqual(isDisabled, true, 'Publish button should be disabled during save');

    await clickPromise;

    // Wait for navigation to /admin
    await page.waitForURL(`${baseUrl}/admin`);
    assert.strictEqual(page.url(), `${baseUrl}/admin`, 'Navigated to dashboard /admin on success');

    await context.close();
  });

  test('BUG A: Publish flow stays on editor and shows error message on API failure', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock Supabase Auth
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-admin-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh-token',
          user: { id: adminId, email: 'admin@example.com' }
        })
      });
    });

    // Mock API request failure (500 error)
    await page.route('**/api/posts', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server database write error' })
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    await page.route('**/api/about', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // Login first
    await page.goto(`${baseUrl}/admin/login`);
    await page.fill('input[type="email"], input[placeholder*="email" i], input[placeholder*="username" i]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');

    // Go to editor
    await page.goto(`${baseUrl}/admin/new`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[placeholder*="Title"]', 'Failing Entry');
    await page.fill('textarea', 'Body content of failing entry');

    const publishBtn = page.locator('button').filter({ hasText: /Publish/ });
    await publishBtn.click();

    await page.waitForTimeout(500);

    // Should stay on /admin/new and display error message
    assert.strictEqual(page.url().includes('/admin/new'), true, 'Remained on editor page on save failure');

    await context.close();
  });
});
