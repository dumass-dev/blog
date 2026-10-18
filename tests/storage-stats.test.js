process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3899;

describe('Admin Storage Stats API Tests', () => {
  let server;

  test('Setup mock test server with Supabase mocks', async () => {
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
          if (tableName === 'media') {
            return {
              select: () => Promise.resolve({
                data: [
                  { size: 5242880, url: 'images/2026/10/img1.jpg' }, // 5 MB
                  { size: 10485760, url: 'images/2026/10/img2.jpg' } // 10 MB
                ],
                error: null
              })
            };
          }
          if (tableName === 'entries') {
            return {
              select: () => Promise.resolve({
                data: [
                  { title: 'My First Journal', content: 'This is my personal journal entry with thoughts.', excerpt: 'First entry', type: 'journal' },
                  { title: 'A Short Essay', content: 'Exploring minimalist web engineering and craft.', excerpt: 'Essay', type: 'writing' }
                ],
                error: null
              })
            };
          }
          if (tableName === 'comments') {
            return {
              select: () => Promise.resolve({
                data: [
                  { content: 'Loved reading this!', author_name: 'Alex' },
                  { content: 'Great design.', author_name: 'Sam' }
                ],
                error: null
              })
            };
          }
          return {
            select: () => Promise.resolve({ data: [], error: null })
          };
        }
      };
    };

    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('GET /api/storage/stats rejects unauthenticated requests with 401', async () => {
    const res = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${PORT}/api/storage/stats`, (r) => {
        let raw = '';
        r.on('data', chunk => { raw += chunk; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(raw) }));
      });
    });

    assert.strictEqual(res.statusCode, 401);
  });

  test('GET /api/storage/stats returns 200 with B2 (30 GB) and Supabase DB (500 MB) breakdown for admin', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/storage/stats',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer valid_admin_token'
      }
    };

    const res = await new Promise((resolve) => {
      const req = http.request(options, (r) => {
        let raw = '';
        r.on('data', chunk => { raw += chunk; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(raw) }));
      });
      req.end();
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.b2, 'Response has b2 storage data');
    assert.ok(res.body.supabase, 'Response has supabase storage data');

    // B2 checks (30 GB total)
    assert.strictEqual(res.body.b2.totalAllocatedBytes, 30 * 1024 * 1024 * 1024);
    assert.strictEqual(res.body.b2.usedBytes, 15728640); // 5 MB + 10 MB = 15 MB
    assert.strictEqual(res.body.b2.fileCount, 2);
    assert.strictEqual(res.body.b2.vaults.length, 3);
    assert.strictEqual(res.body.b2.vaults[0].bucket, 'q04ti-media-1');

    // Supabase DB checks (500 MB total)
    assert.strictEqual(res.body.supabase.totalAllocatedBytes, 500 * 1024 * 1024);
    assert.ok(res.body.supabase.usedBytes > 0, 'Supabase usedBytes calculated');
    assert.strictEqual(res.body.supabase.breakdown.entriesCount, 2);
    assert.strictEqual(res.body.supabase.breakdown.commentsCount, 2);
    assert.strictEqual(res.body.supabase.breakdown.mediaRowsCount, 2);
  });

  test('Teardown test server', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
