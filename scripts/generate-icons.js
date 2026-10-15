import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceImagePath = 'C:/Users/q04ti/.gemini/antigravity-ide/brain/ff97c34d-96b9-4073-bdbc-77c916980f92/.user_uploaded/media_1792080341841.jpg';

// Read image as base64 data URI
const imgBuffer = fs.readFileSync(sourceImagePath);
const base64Data = imgBuffer.toString('base64');
const dataUri = `data:image/jpeg;base64,${base64Data}`;

async function generate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function renderSquareIcon(size, outputPath) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: ${size}px;
            height: ${size}px;
            overflow: hidden;
            background: #121212;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .icon-container {
            width: 100%;
            height: 100%;
            overflow: hidden;
            position: relative;
          }
          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="icon-container">
          <img src="${dataUri}" />
        </div>
      </body>
      </html>
    `, { waitUntil: 'load' });

    await page.screenshot({ path: outputPath, omitBackground: false });
  }

  // 1. icon-512.png
  await renderSquareIcon(512, path.join(projectRoot, 'public', 'icon-512.png'));

  // 2. icon-192.png
  await renderSquareIcon(192, path.join(projectRoot, 'public', 'icon-192.png'));

  // 3. icon-maskable.png (full bleed so Android can mask it to circle/squircle)
  await renderSquareIcon(512, path.join(projectRoot, 'public', 'icon-maskable.png'));

  // 4. apple-touch-icon.png (180x180)
  await renderSquareIcon(180, path.join(projectRoot, 'public', 'apple-touch-icon.png'));

  // 5. favicon.png (48x48)
  await renderSquareIcon(48, path.join(projectRoot, 'public', 'favicon.png'));

  await browser.close();

  // Also create public/icon.svg with embedded image
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="${dataUri}" width="512" height="512" preserveAspectRatio="xMidYMid slice" />
</svg>`;
  fs.writeFileSync(path.join(projectRoot, 'public', 'icon.svg'), svgContent, 'utf8');

  // Copy raw image to public for direct access as well
  fs.copyFileSync(sourceImagePath, path.join(projectRoot, 'public', 'logo.jpg'));

  console.log('Site logo and PWA icons generated successfully from user artwork!');
}

generate().catch(console.error);
