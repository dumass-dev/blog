import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3888;

describe('B2 Refresh Endpoint Hostname Security Tests', () => {
  let server;

  test('Start test server', async () => {
    process.env.BACKBLAZE_ENDPOINT = 's3.us-east-005.backblazeb2.com';
    process.env.BACKBLAZE_BUCKET = 'q04ti-blog';
    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  async function requestRefresh(urlParam) {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/b2/refresh?url=${encodeURIComponent(urlParam)}`,
      method: 'GET'
    };
    return new Promise((resolve, reject) => {
      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  test('Valid B2 Endpoint Host should succeed or return valid status', async () => {
    const validUrl = 'https://s3.us-east-005.backblazeb2.com/images/2026/09/12345678-1234-1234-1234-1234567890ab.jpg';
    const res = await requestRefresh(validUrl);
    assert.strictEqual(res.status, 200);
  });

  test('Valid B2 Bucket Subdomain Host should succeed', async () => {
    const validUrl = 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/12345678-1234-1234-1234-1234567890ab.jpg';
    const res = await requestRefresh(validUrl);
    assert.strictEqual(res.status, 200);
  });

  test('Evil lookalike prefix host (evilbackblazeb2.com) must be rejected with 400', async () => {
    const evilUrl = 'http://evilbackblazeb2.com/images/2026/09/12345678-1234-1234-1234-1234567890ab.jpg';
    const res = await requestRefresh(evilUrl);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Invalid or unpermitted media host domain.');
  });

  test('Evil lookalike suffix host (s3.us-east-005.backblazeb2.com.attacker.com) must be rejected with 400', async () => {
    const evilUrl = 'https://s3.us-east-005.backblazeb2.com.attacker.com/images/2026/09/12345678-1234-1234-1234-1234567890ab.jpg';
    const res = await requestRefresh(evilUrl);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Invalid or unpermitted media host domain.');
  });

  test('Evil lookalike domain (backblazeb2.com.evil.org) must be rejected with 400', async () => {
    const evilUrl = 'https://backblazeb2.com.evil.org/images/2026/09/12345678-1234-1234-1234-1234567890ab.jpg';
    const res = await requestRefresh(evilUrl);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Invalid or unpermitted media host domain.');
  });

  test('Extracts and refreshes cover_image for non-hex image markdown link in content using exact real content fixture', async () => {
    const realContentString = '![q04ti-quote-1789756590261.png](https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/q04ti-quote-1789756590261.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=00551061902888f0000000002%2F20260921%2Fus-east-005%2Fs3%2Faws4_request&X-Amz-Date=20260921T183630Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=d2c6c19f564703a4b64e0380f77918ca100c6d36e2f1ad915a774b76a0841961)';
    const post = { cover_image: '', content: realContentString };

    const { refreshB2Url, extractB2StorageKey } = await import('../server/b2.js');

    let freshCover = post.cover_image;
    if (!freshCover || !freshCover.trim()) {
      const imgMatch = post.content && (
        post.content.match(/!\[.*?\]\((.*?)\)/) ||
        post.content.match(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\\s?#]+\.[a-z0-9]+[^\s)"]*/i)
      );
      if (imgMatch) freshCover = imgMatch[1] || imgMatch[0];
    }
    const extractedKey = extractB2StorageKey(freshCover);
    assert.strictEqual(extractedKey, 'images/2026/09/q04ti-quote-1789756590261.png');

    const refreshed = await refreshB2Url(freshCover);
    assert.ok(refreshed && refreshed !== freshCover, 'cover_image must be a non-empty refreshed URL');
    assert.strictEqual(refreshed.includes('images/2026/09/q04ti-quote-1789756590261.png'), true);
  });

  test('Teardown test server', () => {
    if (server) server.close();
  });
});
