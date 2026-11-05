process.env.NODE_ENV = 'test';
import { test } from 'node:test';
import assert from 'node:assert';

const { offloadDataUriImage } = await import('../api/index.js');

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('a base64 cover is moved to storage and replaced by its key', async () => {
  const out = await offloadDataUriImage(PNG);
  assert.match(out, /^images\/.+\.png$/);
});

test('links and storage keys pass through untouched', async () => {
  for (const v of ['https://example.com/a.jpg', 'images/2026/10/abc.jpg', '/api/media/file/images/x.png', '']) {
    assert.strictEqual(await offloadDataUriImage(v), v);
  }
});

test('non-image or malformed data URIs are left as they were (never lost)', async () => {
  const html = 'data:text/html;base64,PGgxPmhpPC9oMT4=';
  assert.strictEqual(await offloadDataUriImage(html), html);
  const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
  assert.strictEqual(await offloadDataUriImage(svg), svg);
});
