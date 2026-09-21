import http from 'http';
import app from '../api/index.js';

process.env.ADMIN_USER_ID = process.env.ADMIN_USER_ID || '00000000-0000-0000-0000-000000000000';

const PORT = 3899;

async function runApiVerification() {
  console.log('Starting API route verification server on port', PORT);

  const server = http.createServer((req, res) => {
    app(req, res);
  });

  await new Promise(resolve => server.listen(PORT, resolve));

  const endpoints = [
    { name: 'Health Check', path: '/api/health', method: 'GET', expectedStatus: 200 },
    { name: 'List Posts', path: '/api/posts', method: 'GET', expectedStatus: 200 },
    { name: 'On This Day Posts', path: '/api/posts/on-this-day', method: 'GET', expectedStatus: 200 },
    { name: 'About Metadata', path: '/api/about', method: 'GET', expectedStatus: 200 },
    { name: 'B2 URL Refresh (Valid Storage Key)', path: `/api/b2/refresh?url=${encodeURIComponent('images/2026/09/12345678-1234-1234-1234-1234567890ab.jpg')}`, method: 'GET', expectedStatus: 200 },
    { name: 'B2 URL Refresh (Disallowed Domain)', path: '/api/b2/refresh?url=http://example.com', method: 'GET', expectedStatus: 400 },
    { name: 'Admin Stats (Anon)', path: '/api/stats', method: 'GET', expectedStatus: 401 },
    { name: 'Verify Passcode (Missing passcode)', path: '/api/posts/sample-slug/verify-passcode', method: 'POST', body: {}, expectedStatus: 400 },
    { name: 'B2 Upload Presign (Anon)', path: '/api/b2-upload', method: 'POST', body: { filename: 'test.jpg', mimeType: 'image/jpeg' }, expectedStatus: 401 },
    { name: 'Media Confirm (Anon)', path: '/api/media/confirm', method: 'POST', body: { storageKey: 'images/2026/09/test.jpg', originalName: 'test.jpg', mimeType: 'image/jpeg' }, expectedStatus: 401 },
    { name: 'Media Library (Anon)', path: '/api/media', method: 'GET', expectedStatus: 401 }
  ];

  console.log('\n=============================================================');
  console.log('CLIENT-CALLED VERCEL /API/* ROUTE VERIFICATION REPORT');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const options = {
        hostname: '127.0.0.1',
        port: PORT,
        path: ep.path,
        method: ep.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const status = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        if (ep.body) {
          req.write(JSON.stringify(ep.body));
        }
        req.end();
      });

      const isExpected = (status === ep.expectedStatus);
      const icon = isExpected ? '✅ PASS' : '❌ FAIL';
      if (isExpected) passed++; else failed++;

      console.log(`${icon} [${ep.method}] ${ep.path.padEnd(45)} Status: ${status} (Expected: ${ep.expectedStatus})`);
    } catch (err) {
      failed++;
      console.log(`❌ FAIL [${ep.method}] ${ep.path.padEnd(45)} Error: ${err.message}`);
    }
  }

  server.close();

  console.log('\n-------------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  console.log('-------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runApiVerification();
