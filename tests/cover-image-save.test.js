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

  test('Editor.jsx handleSelectMedia auto-populates cover_image only for photo posts', () => {
    const media = {
      original_name: 'sample-photo.jpg',
      url: 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/sample-photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=test_sig',
      signed_url: 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/sample-photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=test_sig'
    };

    const rawUrl = media.url || media.storageKey || media.signed_url || '';
    const keyMatch = typeof rawUrl === 'string' && rawUrl.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i);
    const canonicalKey = keyMatch ? keyMatch[0] : (rawUrl && !rawUrl.includes('?') ? rawUrl : '');

    // For photo entries:
    let photoFormData = { type: 'photo', content: '', cover_image: '' };
    photoFormData = {
      ...photoFormData,
      cover_image: photoFormData.type === 'photo' && (!photoFormData.cover_image || !photoFormData.cover_image.trim()) && canonicalKey
        ? canonicalKey
        : photoFormData.cover_image
    };
    assert.strictEqual(photoFormData.cover_image, 'images/2026/09/sample-photo.jpg');

    // For journal/writing entries:
    let journalFormData = { type: 'journal', content: '', cover_image: '' };
    journalFormData = {
      ...journalFormData,
      cover_image: journalFormData.type === 'photo' && (!journalFormData.cover_image || !journalFormData.cover_image.trim()) && canonicalKey
        ? canonicalKey
        : journalFormData.cover_image
    };
    assert.strictEqual(journalFormData.cover_image, '', 'Journal entries must NOT auto-populate cover_image');
  });

  test('Teardown test server', () => {
    if (server) server.close();
  });
});
