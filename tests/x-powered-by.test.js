import './setup-offline.js';
// -------------------------------------------------------------------
// FIX 2: X-Powered-By header removed
// -------------------------------------------------------------------
import http from 'http';
import app from '../api/index.js';

process.env.NODE_ENV = 'test';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  [PASS] ${name}`); passed++; }
  else           { console.error(`  [FAIL] ${name}`); failed++; }
}

async function run() {
  console.log('=== FIX 2: X-Powered-By REMOVAL TEST ===\n');

  const server = http.createServer((req, res) => app(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // Check /api/health — lightweight route, always responds without DB
    const r = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/health', method: 'GET' }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });

    const xpb = r.headers['x-powered-by'];
    assert(xpb === undefined, `X-Powered-By header is absent (got: ${JSON.stringify(xpb)})`);
    assert(!r.headers['x-powered-by'], 'No "x-powered-by" key in response headers object');

    // Confirm other expected headers still present
    assert(r.headers['x-frame-options'] !== undefined || r.headers['content-type'] !== undefined,
      'Other Express headers (content-type etc.) still present — app is functional');

    const json = JSON.parse(r.body);
    assert(json.status === 'ok', 'GET /api/health still returns {status:"ok"}');

  } finally {
    server.close();
    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
    console.log(`==================================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
