import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const svgPath = path.join(projectRoot, 'public', 'icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

async function renderIcon(page, size, outputPath) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        svg {
          width: 100%;
          height: 100%;
          display: block;
        }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `, { waitUntil: 'networkidle' });

  // Brief pause to allow font rendering to settle
  await page.waitForTimeout(200);
  await page.screenshot({ path: outputPath, omitBackground: false });
}

async function generate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 192x192
  await renderIcon(page, 192, path.join(projectRoot, 'public', 'icon-192.png'));

  // 512x512
  await renderIcon(page, 512, path.join(projectRoot, 'public', 'icon-512.png'));

  // 512x512 maskable
  await renderIcon(page, 512, path.join(projectRoot, 'public', 'icon-maskable.png'));

  // apple-touch-icon 180x180
  await renderIcon(page, 180, path.join(projectRoot, 'public', 'apple-touch-icon.png'));

  await browser.close();
  console.log('PWA icons successfully generated in public/ directory!');
}

generate().catch(console.error);
