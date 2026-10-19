/* global console, process, document */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('C:/Users/q04ti/.gemini/antigravity-ide/brain/ff97c34d-96b9-4073-bdbc-77c916980f92/screenshots');
const localOutDir = path.resolve('./tests/screenshots');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(localOutDir, { recursive: true });

const viewports = [
  { width: 320, height: 640, name: '320' },
  { width: 375, height: 667, name: '375' },
  { width: 392, height: 844, name: '392' },
  { width: 430, height: 932, name: '430' }
];

const themes = ['light', 'dark'];

async function capture() {
  const adminId = 'admin-uuid-12345678';
  const viteServer = await createServer({
    define: {
      'import.meta.env.VITE_ADMIN_USER_ID': JSON.stringify(adminId)
    },
    server: { port: 0 }
  });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const baseUrl = `http://localhost:${address.port}`;

  const browser = await chromium.launch({ headless: true });
  console.log(`Vite server running at ${baseUrl}`);
  console.log('Capturing responsive mobile screenshots at 320, 375, 392, 430 in light and dark themes...');

  for (const vp of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme
      });
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

      // Mock API endpoints
      await page.route('**/api/posts*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });
      await page.route('**/api/about', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({})
        });
      });

      // Login first
      await page.goto(`${baseUrl}/admin/login`);
      await page.fill('input[type="email"], input[placeholder*="email" i]', 'admin@example.com');
      await page.fill('input[type="password"]', 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/admin', { timeout: 10000 });

      // Navigate client-side to /admin/new
      const newBtn = page.locator('a[href*="/admin/new"]').first();
      await newBtn.waitFor({ state: 'visible', timeout: 5000 });
      await newBtn.click();

      await page.waitForSelector('input[placeholder*="Title"]', { timeout: 15000 });

      // Pre-fill a realistic post to demonstrate the visual editor
      await page.fill('input[placeholder*="Title"]', 'Morning Reflections');
      await page.waitForTimeout(500);

      // Apply theme class to documentElement
      await page.evaluate((t) => {
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, theme);

      await page.waitForTimeout(1000);

      const filename = `editor-${vp.name}-${theme}.png`;
      const targetPath = path.join(outDir, filename);
      const localPath = path.join(localOutDir, filename);

      await page.screenshot({ path: targetPath, fullPage: false });
      await page.screenshot({ path: localPath, fullPage: false });

      console.log(`Saved screenshot: ${filename} (${vp.width}x${vp.height}, ${theme})`);
      await context.close();
    }
  }

  await browser.close();
  await viteServer.close();
  console.log('Screenshot capture complete!');
}

capture().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
