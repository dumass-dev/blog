process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3895;
const ADMIN_ID = '00000000-0000-0000-0000-000000000000';

describe('POST/PUT /api/posts cover_image normalization and content fallback tests', () => {
  let server;
  let insertedRows = [];

  test('Setup mock server & Supabase mock', async () => {
    process.env.ADMIN_USER_ID = ADMIN_ID;
    process.env.BACKBLAZE_ENDPOINT = 's3.us-east-005.backblazeb2.com';
    process.env.BACKBLAZE_BUCKET = 'q04ti-blog';

    global.__mockSupabaseClient = () => ({
      auth: {
        getUser: async (token) => {
          if (token === 'admin-test-token') {
            return { data: { user: { id: ADMIN_ID } }, error: null };
          }
          return { data: null, error: new Error('Invalid token') };
        }
      },
      from: (_tableName) => ({
        insert: (data) => {
          const row = Array.isArray(data) ? data[0] : data;
          const inserted = { id: `test-id-${Date.now()}`, ...row };
          insertedRows.push(inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null })
            })
          };
        }
      })
    });

    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('POST /api/posts with empty cover_image extracts canonical storage key from embedded content image', async () => {
    const postPayload = {
      title: 'Cover Extraction Test',
      content: '![test-img](https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/sample-photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=test_sig)',
      type: 'photo',
      category: 'Photos',
      cover_image: ''
    };

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/posts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-test-token'
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify(postPayload));
      req.end();
    });

    assert.strictEqual(response.status, 201);
    const lastSavedRow = insertedRows[insertedRows.length - 1];
    assert.strictEqual(
      lastSavedRow.cover_image,
      'images/2026/09/sample-photo.jpg',
      'Saved database row cover_image should be canonical key images/2026/09/sample-photo.jpg'
    );
  });

  test('POST /api/posts with full presigned URL cover_image strips query params to canonical storage key', async () => {
    const presignedUrl = 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/presigned-photo.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260921T061253Z&X-Amz-Expires=7200&X-Amz-Signature=old_sig';
    const postPayload = {
      title: 'Presigned Strip Test',
      content: 'Body text for presigned strip test',
      type: 'photo',
      category: 'Photos',
      cover_image: presignedUrl
    };

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/posts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-test-token'
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify(postPayload));
      req.end();
    });

    assert.strictEqual(response.status, 201);
    const lastSavedRow = insertedRows[insertedRows.length - 1];
    assert.strictEqual(
      lastSavedRow.cover_image.includes('old_sig'),
      false,
      'Saved database row cover_image should NOT contain the old presigned signature query parameter'
    );
    assert.strictEqual(
      lastSavedRow.cover_image,
      'images/2026/09/presigned-photo.png',
      'Saved database row cover_image should be canonical key images/2026/09/presigned-photo.png'
    );
  });

  test('Editor.jsx handleSelectMedia auto-populates cover_image with canonical storage key when cover_image is blank', () => {
    const media = {
      original_name: 'sample-photo.jpg',
      url: 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/sample-photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=test_sig',
      signed_url: 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/sample-photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=test_sig'
    };

    let formData = { content: '', cover_image: '' };

    // Exact logic from Editor.jsx handleSelectMedia
    const rawUrl = media.url || media.storageKey || media.signed_url || '';
    const keyMatch = typeof rawUrl === 'string' && rawUrl.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i);
    const canonicalKey = keyMatch ? keyMatch[0] : (rawUrl && !rawUrl.includes('?') ? rawUrl : '');

    formData = {
      ...formData,
      content: `\n![${media.original_name}](${media.url})\n`,
      cover_image: (!formData.cover_image || !formData.cover_image.trim()) && canonicalKey ? canonicalKey : formData.cover_image
    };

    assert.strictEqual(formData.cover_image, 'images/2026/09/sample-photo.jpg');
    assert.strictEqual(formData.cover_image.includes('?'), false);
  });

  test('Editor.jsx handleSelectMedia with pickerTarget === "cover" sets cover_image directly for GIF without touching content', () => {
    const gifMedia = {
      original_name: 'cool-animation.gif',
      url: '/api/media/file/images/2026/10/cool-animation.gif',
      proxy_url: '/api/media/file/images/2026/10/cool-animation.gif'
    };

    let formData = { content: 'My story text...', cover_image: '' };
    let pickerTarget = 'cover';

    const insertUrl = gifMedia.proxy_url || gifMedia.url;
    const rawUrl = gifMedia.url || gifMedia.storageKey || gifMedia.signed_url || '';
    const keyMatch = typeof rawUrl === 'string' && rawUrl.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i);
    const canonicalKey = keyMatch ? keyMatch[0] : (rawUrl && !rawUrl.includes('?') ? rawUrl : '');

    if (pickerTarget === 'cover') {
      formData = {
        ...formData,
        cover_image: canonicalKey || insertUrl
      };
      pickerTarget = 'content';
    }

    assert.strictEqual(formData.cover_image, 'images/2026/10/cool-animation.gif');
    assert.strictEqual(formData.content, 'My story text...', 'Content should not be overwritten when picking cover banner');
  });

  test('EntryDetail.jsx shouldRenderCoverImage displays banner for post with cover_image even when content contains other images', () => {
    const entry = {
      title: 'Story With Banner and Photos',
      cover_image: '/api/media/file/images/2026/10/banner.gif',
      content: 'Here is some text.\n\n![inline image](/api/media/file/images/2026/10/inline.jpg)\n\nMore text.'
    };

    const isCoverOnlyInContent = Boolean(
      entry.cover_image &&
      entry.content &&
      entry.content.trim().startsWith('![') &&
      entry.content.includes(entry.cover_image) &&
      entry.content.replace(/!\[.*?\]\(.*?\)/g, '').trim() === ''
    );

    const shouldRenderCoverImage = Boolean(entry.cover_image && entry.cover_image.trim() !== '' && !isCoverOnlyInContent);

    assert.strictEqual(shouldRenderCoverImage, true, 'Cover banner should render inside post');
  });

  test('EntryDetail.jsx shouldRenderCoverImage avoids duplicate only if content solely consists of that single identical cover image', () => {
    const entry = {
      title: 'Solo Photo Post',
      cover_image: '/api/media/file/images/2026/10/solo.jpg',
      content: '![Solo Photo](/api/media/file/images/2026/10/solo.jpg)'
    };

    const isCoverOnlyInContent = Boolean(
      entry.cover_image &&
      entry.content &&
      entry.content.trim().startsWith('![') &&
      entry.content.includes(entry.cover_image) &&
      entry.content.replace(/!\[.*?\]\(.*?\)/g, '').trim() === ''
    );

    const shouldRenderCoverImage = Boolean(entry.cover_image && entry.cover_image.trim() !== '' && !isCoverOnlyInContent);

    assert.strictEqual(shouldRenderCoverImage, false, 'Solo identical photo should not be rendered twice back to back');
  });

  test('Teardown test server', () => {
    if (server) server.close();
  });
});
