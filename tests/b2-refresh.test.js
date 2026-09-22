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

  test('Extracts and refreshes cover_image for real q04ti PNG content fixture', async () => {
    const realContentString = '\n![q04ti-quote-1789756590261.png](https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/9dbb2097-af2a-4a06-ac18-94b460cc9aa4.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=005b65a50b8da040000000002%2F20260922%2Fus-east-005%2Fs3%2Faws4_request&X-Amz-Date=20260922T065506Z&X-Amz-Expires=86400&X-Amz-Signature=0b227f62b52dcf9b32774aa1a127f121e351e89f4bc1a1fc7b98586e72111109&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)\n';
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
    assert.strictEqual(extractedKey, 'images/2026/09/9dbb2097-af2a-4a06-ac18-94b460cc9aa4.png');

    const refreshed = await refreshB2Url(freshCover);
    assert.ok(refreshed && refreshed !== freshCover, 'cover_image must be a non-empty refreshed URL');
    assert.strictEqual(refreshed.includes('images/2026/09/9dbb2097-af2a-4a06-ac18-94b460cc9aa4.png'), true);
  });

  test('Extracts and refreshes cover_image for real content fixture with leading newline (green-forest-abstract-br.jpg)', async () => {
    const realContentString = '\n![green-forest-abstract-br.jpg](https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/8533497d-07d0-4daa-9e4e-5c44f6b91daf.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=005b65a50b8da040000000002%2F20260922%2Fus-east-005%2Fs3%2Faws4_request&X-Amz-Date=20260922T095342Z&X-Amz-Expires=86400&X-Amz-Signature=161b19bb3705e0c215efda4bc76a557904517daff18034e52b02cedc92b2604d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)\n';
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
    assert.strictEqual(extractedKey, 'images/2026/09/8533497d-07d0-4daa-9e4e-5c44f6b91daf.jpg');

    const refreshed = await refreshB2Url(freshCover);
    assert.ok(refreshed && refreshed !== freshCover, 'cover_image must be a non-empty refreshed URL');
    assert.strictEqual(refreshed.includes('images/2026/09/8533497d-07d0-4daa-9e4e-5c44f6b91daf.jpg'), true);
  });

  test('Teardown test server', () => {
    if (server) server.close();
  });
});
