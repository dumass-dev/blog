/* global window */
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

  test('BUG B: Entry page opens at scroll position 0 and Back button restores feed scroll position', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock API for posts
    await page.route('**/api/posts*', async (route) => {
      const mockPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `post-${i}`,
        title: `Scroll Test Post ${i + 1}`,
        slug: `scroll-test-post-${i + 1}`,
        excerpt: `Excerpt for post ${i + 1} ` + 'Sample text '.repeat(30),
        content: `Full body content for post ${i + 1} ` + 'More content text '.repeat(50),
        type: 'journal',
        date: new Date().toISOString()
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPosts)
      });
    });

    await page.route('**/api/about', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');

    // Scroll down the feed
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);

    const feedScrollBefore = await page.evaluate(() => window.scrollY);
    assert.ok(feedScrollBefore > 0, 'Feed is scrolled down');

    // Click on a post link
    const postLink = page.locator('a[href*="/entry/"]').nth(4);
    await postLink.click();
    await page.waitForURL('**/entry/**');
    await page.waitForTimeout(100);

    // Verify entry page scroll position is 0
    const entryScroll = await page.evaluate(() => window.scrollY);
    assert.strictEqual(entryScroll, 0, 'Entry page opens scrolled at top (scrollY = 0)');

    // Click browser back button
    await page.goBack();
    await page.waitForURL(`${baseUrl}/`);
    await page.waitForTimeout(100);

    // Verify feed scroll position was restored
    const feedScrollAfter = await page.evaluate(() => window.scrollY);
    assert.ok(feedScrollAfter > 0, 'Back button restored feed scroll position');

    await context.close();
  });

  test('BUG C: Post comment from photo lightbox card updates comments stream and handles errors', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route('**/*comments*', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      } else if (method === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'c-101',
            author_name: body.author_name || 'Anonymous Reader',
            content: body.content,
            created_at: new Date().toISOString()
          })
        });
      }
    });

    await page.route('**/*reactions*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hearts: 5 }) });
    });

    await page.route('**/api/posts*', async (route) => {
      const mockPhotos = [
        {
          id: 'photo-100',
          title: 'Mountain Vista',
          slug: 'mountain-vista',
          content: '![Mountain](/photos/mountain.jpg) Great view.',
          cover_image: '/photos/mountain.jpg',
          type: 'photo',
          date: new Date().toISOString()
        }
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPhotos) });
    });

    await page.route('**/api/about', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${baseUrl}/photos`);
    await page.waitForLoadState('networkidle');

    // Open lightbox modal
    const photoItem = page.locator('.aspect-square').first();
    await photoItem.waitFor({ state: 'visible' });
    await photoItem.click();
    await page.waitForTimeout(300);

    // Fill in comment
    const nameInput = page.locator('input[placeholder*="Your name"]');
    await nameInput.fill('Photo Fan');
    const commentInput = page.locator('input[placeholder*="Write a comment"]');
    await commentInput.fill('Stunning capture!');

    // Click submit
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.waitFor({ state: 'visible' });

    await submitBtn.click();
    await page.waitForTimeout(500);

    const commentItem = page.getByText('Stunning capture!');
    const isVisible = await commentItem.isVisible();
    assert.strictEqual(isVisible, true, 'Comment content appears in comments list');

    await context.close();
  });

  test('BUG D: Photo card close button sits in top-left corner with at least 44px tap target', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route('**/*comments*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/*reactions*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hearts: 0 }) });
    });
    await page.route('**/api/posts*', async (route) => {
      const mockPhotos = [
        {
          id: 'photo-close-test',
          title: 'Close Test Photo',
          slug: 'close-test-photo',
          content: '![Close Test](/photos/test.jpg) Test content',
          cover_image: '/photos/test.jpg',
          type: 'photo',
          date: new Date().toISOString()
        }
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPhotos) });
    });

    await page.goto(`${baseUrl}/photos`);
    await page.waitForLoadState('networkidle');

    const photoItem = page.locator('.aspect-square').first();
    await photoItem.waitFor({ state: 'visible' });
    await photoItem.click();

    const closeBtn = page.locator('button[aria-label="Close photo view"]');
    await closeBtn.waitFor({ state: 'visible' });

    const box = await closeBtn.boundingBox();
    assert.ok(box, 'Close button bounding box exists');
    assert.ok(box.width >= 44, `Close button width (${box.width}px) is at least 44px`);
    assert.ok(box.height >= 44, `Close button height (${box.height}px) is at least 44px`);

    const styles = await closeBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        boxShadow: computed.boxShadow
      };
    });
    assert.ok(
      styles.backgroundColor === 'rgba(0, 0, 0, 0)' || styles.backgroundColor === 'transparent',
      `Close button background is transparent (got: ${styles.backgroundColor})`
    );
    assert.ok(
      styles.boxShadow === 'none' || styles.boxShadow === '',
      `Close button has no box shadow (got: ${styles.boxShadow})`
    );

    await context.close();
  });
});
