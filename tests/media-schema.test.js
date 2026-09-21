process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3897;

describe('Media Schema Column Alignment Tests', () => {
  let server;
  let insertedPayloads = [];

  test('Setup mock server & Supabase client mock', async () => {
    process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';
    process.env.NODE_ENV = 'test';

    global.__mockSupabaseClient = (_req) => {
      return {
        auth: {
          getUser: async (token) => {
            if (token === 'valid_admin_token') {
              return { data: { user: { id: '00000000-0000-0000-0000-000000000000' } }, error: null };
            }
            return { data: null, error: new Error('Invalid token') };
          }
        },
        from: (tableName) => {
          return {
            insert: (rows) => {
              if (tableName === 'media') {
                const payload = Array.isArray(rows) ? rows[0] : rows;
                insertedPayloads.push(payload);
              }
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: 'test-uuid-1234', ...(Array.isArray(rows) ? rows[0] : rows) },
                    error: null
                  })
                })
              };
            }
          };
        }
      };
    };

    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('POST /api/media/confirm payload matches exact public.media schema columns', async () => {
    insertedPayloads = [];
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/media/confirm',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_admin_token'
      }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({
        storageKey: 'images/2026/09/test-file.jpg',
        originalName: 'test-file.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        publicUrl: 'https://s3.us-east-005.backblazeb2.com/q04ti-blog/images/2026/09/test-file.jpg'
      }));
      req.end();
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(insertedPayloads.length, 1);

    const payload = insertedPayloads[0];
    const actualKeys = Object.keys(payload).sort();
    const expectedKeys = ['filename', 'mime_type', 'original_name', 'size', 'url'].sort();

    assert.deepStrictEqual(actualKeys, expectedKeys, `Payload keys ${JSON.stringify(actualKeys)} do not match expected schema ${JSON.stringify(expectedKeys)}`);
    assert.strictEqual(payload.storage_key, undefined, 'payload must NOT contain storage_key');
    assert.strictEqual(payload.size_bytes, undefined, 'payload must NOT contain size_bytes');
    assert.strictEqual(payload.url, 'images/2026/09/test-file.jpg', 'url column must store B2 storage key');
  });

  test('Teardown test server', () => {
    delete global.__mockSupabaseClient;
    if (server) server.close();
  });
});
