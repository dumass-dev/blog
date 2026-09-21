/* global window */
process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { chromium } from 'playwright';
import apiApp from '../api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const PORT = 3996;

describe('Admin Delete Post & Prev/Next Mobile Alignment Tests', () => {
  let server;
  let browser;

  test('Setup mock server & Playwright browser instance', async () => {
    const distDir = path.join(projectRoot, 'dist');
    const app = express();
    app.use(apiApp);
    app.use(express.static(distDir));
    app.use((req, res) => {
      if (req.path.includes('.') && !req.path.endsWith('.html')) return res.status(404).end();
      res.sendFile(path.join(distDir, 'index.html'));
    });

    server = http.createServer(app);
    await new Promise(resolve => server.listen(PORT, resolve));
    browser = await chromium.launch({ headless: true });
  });

  const setupMockAdminContext = async (viewport = { width: 375, height: 812 }) => {
    const context = await browser.newContext({ viewport });
    const mockUser = { id: '00000000-0000-0000-0000-000000000000', email: 'admin@example.com' };
    const mockSession = { access_token: 'valid_admin_token', token_type: 'bearer', user: mockUser };

    await context.addInitScript(({ session, user }) => {
      window.localStorage.setItem('sb-aidajlxmfxhmsctmciaq-auth-token', JSON.stringify(session));
      window.localStorage.setItem('auth_token', 'valid_admin_token');
      window.localStorage.setItem('user', JSON.stringify(user));
      window.localStorage.setItem('cached_admin_dashboard_v2', JSON.stringify({
        entries: [
          { id: 'sample-1', title: 'Sample Entry 1', slug: 'sample-entry-1', date: new Date().toISOString(), status: 'published', type: 'journal' }
        ],
        stats: { total: 1, published: 1, drafts: 0, updates: 0, mediaCount: 0, totalViews: 5, topPosts: [] },
        comments: []
      }));
    }, { session: mockSession, user: mockUser });

    return context;
  };

  test('Bug 1: Admin Delete - Cancel button closes modal without removing row', async () => {
    const context = await setupMockAdminContext();
    const page = await context.newPage();

    await page.route('**', route => {
      const url = route.request().url();
      if (url.includes('/auth/v1')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'valid_admin_token',
            token_type: 'bearer',
            user: { id: '00000000-0000-0000-0000-000000000000', email: 'admin@example.com' }
          })
        });
      } else if (url.includes('/api/posts')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'sample-1', title: 'Sample Entry 1', slug: 'sample-entry-1', date: new Date().toISOString(), status: 'published', type: 'journal', views: 5 }])
        });
      } else if (url.includes('/api/stats')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: 1, published: 1, drafts: 0, updates: 0, mediaCount: 0, totalViews: 5, topPosts: [] })
        });
      } else if (url.includes('9999') || url.includes('supabase.co')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0', 'access-control-allow-origin': '*' },
          body: '[]'
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`http://127.0.0.1:${PORT}/admin`);
    await page.waitForSelector('h1:has-text("Author Studio")');

    const deleteBtn = page.locator('button[aria-label="Delete Entry"], button[title="Delete Entry"], button[title="Delete"]').first();
    await deleteBtn.click();

    const modalTitle = page.locator('.modal-card h3').first();
    await modalTitle.waitFor({ timeout: 5000 });
    assert.strictEqual(await modalTitle.innerText(), 'Confirm Deletion');

    const cancelBtn = page.locator('.modal-card button', { hasText: 'Cancel' });
    await cancelBtn.click();

    await page.waitForSelector('.modal-card', { state: 'detached' });
    const rowTitle = page.locator('h3:has-text("Sample Entry 1")');
    assert.strictEqual(await rowTitle.count(), 1);

    await context.close();
  });

  test('Bug 1: Admin Delete - 500/401 error shows error message and keeps row', async () => {
    const context = await setupMockAdminContext();
    const page = await context.newPage();

    await page.route('**', route => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/auth/v1')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'valid_admin_token',
            token_type: 'bearer',
            user: { id: '00000000-0000-0000-0000-000000000000', email: 'admin@example.com' }
          })
        });
      } else if (method === 'DELETE' && url.includes('/api/posts/sample-1')) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Database query failed' })
        });
      } else if (url.includes('/api/posts')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'sample-1', title: 'Sample Entry 1', slug: 'sample-entry-1', date: new Date().toISOString(), status: 'published', type: 'journal', views: 5 }])
        });
      } else if (url.includes('/api/stats')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: 1, published: 1, drafts: 0, updates: 0, mediaCount: 0, totalViews: 5, topPosts: [] })
        });
      } else if (url.includes('9999') || url.includes('supabase.co')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0', 'access-control-allow-origin': '*' },
          body: '[]'
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`http://127.0.0.1:${PORT}/admin`);
    await page.waitForSelector('h1:has-text("Author Studio")');

    const deleteBtn = page.locator('button[aria-label="Delete Entry"], button[title="Delete Entry"], button[title="Delete"]').first();
    await deleteBtn.click();

    const confirmBtn = page.locator('.modal-card button', { hasText: 'Delete Entry' });
    await confirmBtn.click();

    const errorBanner = page.locator('.modal-card .text-red-500');
    await errorBanner.waitFor({ timeout: 5000 });
    assert.strictEqual(await errorBanner.innerText(), 'Database query failed');

    // Close modal
    const cancelBtn = page.locator('.modal-card button', { hasText: 'Cancel' });
    await cancelBtn.click();
    await page.waitForSelector('.modal-card', { state: 'detached' });

    // Row should still be present
    const rowTitle = page.locator('h3:has-text("Sample Entry 1")');
    assert.strictEqual(await rowTitle.count(), 1);

    await context.close();
  });

  test('Bug 1: Admin Delete - Success removes row from dashboard list', async () => {
    const context = await setupMockAdminContext();
    const page = await context.newPage();

    await page.route('**', route => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/auth/v1')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'valid_admin_token',
            token_type: 'bearer',
            user: { id: '00000000-0000-0000-0000-000000000000', email: 'admin@example.com' }
          })
        });
      } else if (method === 'DELETE' && url.includes('/api/posts/sample-1')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, id: 'sample-1' })
        });
      } else if (url.includes('/api/posts')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'sample-1', title: 'Sample Entry 1', slug: 'sample-entry-1', date: new Date().toISOString(), status: 'published', type: 'journal', views: 5 }])
        });
      } else if (url.includes('/api/stats')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: 1, published: 1, drafts: 0, updates: 0, mediaCount: 0, totalViews: 5, topPosts: [] })
        });
      } else if (url.includes('9999') || url.includes('supabase.co')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0', 'access-control-allow-origin': '*' },
          body: '[]'
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`http://127.0.0.1:${PORT}/admin`);
    await page.waitForSelector('h1:has-text("Author Studio")');

    const deleteBtn = page.locator('button[aria-label="Delete Entry"], button[title="Delete Entry"], button[title="Delete"]').first();
    await deleteBtn.click();

    const confirmBtn = page.locator('.modal-card button', { hasText: 'Delete Entry' });
    await confirmBtn.click();

    await page.waitForSelector('.modal-card', { state: 'detached' });
    const rowTitle = page.locator('h3:has-text("Sample Entry 1")');
    assert.strictEqual(await rowTitle.count(), 0);

    await context.close();
  });

  test('Bug 2: Prev/Next Mobile Alignment - NEXT title left edge equals NEXT label left edge on mobile (375px)', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const mockPost = {
      id: 'p1',
      title: 'Current Post Title',
      slug: 'current-post',
      content: 'Hello world test content.',
      date: new Date().toISOString(),
      type: 'journal',
      status: 'published',
      prevPost: { title: 'Previous Post Title', slug: 'previous-post' },
      nextPost: { title: 'Next Post Title', slug: 'next-post' }
    };

    await page.route('**', route => {
      const url = route.request().url();
      if (url.includes('/api/posts/current-post')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            entry: mockPost,
            prev: { title: 'Previous Post Title', slug: 'previous-post' },
            next: { title: 'Next Post Title', slug: 'next-post' }
          })
        });
      } else if (url.includes('/api/comments')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else if (url.includes('/api/reactions')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else if (url.includes('/api/posts')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockPost]) });
      } else if (url.includes('9999') || url.includes('supabase.co')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0', 'access-control-allow-origin': '*' },
          body: '[]'
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`http://127.0.0.1:${PORT}/entry/current-post`);
    await page.waitForSelector('text=Next →');

    const coords = await page.evaluate(() => {
      const nextLabel = Array.from(document.querySelectorAll('span')).find(el => el.textContent.toLowerCase().includes('next') && el.textContent.includes('→'));
      const nextTitle = nextLabel ? nextLabel.closest('a')?.querySelector('.font-serif') : null;
      return {
        nextLabelLeft: nextLabel ? Math.round(nextLabel.getBoundingClientRect().left) : null,
        nextTitleLeft: nextTitle ? Math.round(nextTitle.getBoundingClientRect().left) : null
      };
    });

    assert.notStrictEqual(coords.nextLabelLeft, null, 'NEXT label found');
    assert.notStrictEqual(coords.nextTitleLeft, null, 'NEXT title found');
    assert.strictEqual(coords.nextLabelLeft, coords.nextTitleLeft, 'NEXT label and title left edges must be equal on mobile');

    await context.close();
  });

  test('Teardown test server & browser instance', async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });
});
