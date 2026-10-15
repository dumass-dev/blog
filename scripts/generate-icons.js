import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const svgPath = path.join(projectRoot, 'public', 'icon.svg');
const fileUrl = 'file:///' + svgPath.replace(/\\/g, '/');

async function generate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 192x192
  await page.setViewportSize({ width: 192, height: 192 });
  await page.goto(fileUrl);
  await page.screenshot({ path: path.join(projectRoot, 'public', 'icon-192.png') });

  // 512x512
  await page.setViewportSize({ width: 512, height: 512 });
  await page.goto(fileUrl);
  await page.screenshot({ path: path.join(projectRoot, 'public', 'icon-512.png') });

  // 512x512 maskable (same or with safe area)
  await page.screenshot({ path: path.join(projectRoot, 'public', 'icon-maskable.png') });

  // apple-touch-icon 180x180
  await page.setViewportSize({ width: 180, height: 180 });
  await page.goto(fileUrl);
  await page.screenshot({ path: path.join(projectRoot, 'public', 'apple-touch-icon.png') });

  await browser.close();
  console.log('PWA icons successfully generated in public/ directory!');
}

generate().catch(console.error);
