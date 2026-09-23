process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import serverApp from '../server/index.js';

import { shouldRenderTitleInFeed, shouldRenderDetailTitle, getUpdateItemTitleLink } from '../src/utils/entryRenderHelpers.js';

const PORT = 3898;

describe('BUG 1: Update-type Entry Title & Permalink Link Rendering Tests', () => {
  const updateEntry = {
    id: 'update-1',
    slug: 'weekly-system-update',
    type: 'update',
    title: 'Weekly System Update #42',
    content: 'Shipped new features and performance optimizations today.',
    excerpt: 'Shipped new features and performance optimizations today.'
  };

  test('shouldRenderTitleInFeed returns true for update-type entries with title on Chronological Feed (Home.jsx)', () => {
    const rendersTitle = shouldRenderTitleInFeed(updateEntry);
    assert.strictEqual(
      rendersTitle,
      true,
      'Chronological Feed (Home.jsx) must render title heading for update-type entries'
    );
  });

  test('shouldRenderDetailTitle returns true for update-type entries with title on Detail Page (EntryDetail.jsx)', () => {
    const rendersTitle = shouldRenderDetailTitle(updateEntry);
    assert.strictEqual(
      rendersTitle,
      true,
      'Entry Detail page (EntryDetail.jsx) must render h1 title heading for update-type entries'
    );
  });

  test('getUpdateItemTitleLink returns valid entry link URL for update-type entries', () => {
    const link = getUpdateItemTitleLink(updateEntry);
    assert.strictEqual(
      link,
      '/entry/weekly-system-update',
      'Update entry title link must route to /entry/[slug]'
    );
  });
});

describe('BUG 2: Media Library API Routes & Upload Endpoint Tests', () => {
  let server;

  test('Setup mock server', async () => {
    process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';
    global.__mockSupabaseClient = () => ({
      auth: {
        getUser: async (token) => {
          if (token === 'admin-test-token') {
            return { data: { user: { id: '00000000-0000-0000-0000-000000000000' } }, error: null };
          }
          return { data: null, error: new Error('Invalid token') };
        }
      },
      from: (tableName) => {
        if (tableName === 'media') {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'media-1',
                    filename: 'photo1.jpg',
                    original_name: 'photo1.jpg',
                    mime_type: 'image/jpeg',
                    size: 10240,
                    url: 'https://example.com/photo1.jpg',
                    created_at: '2026-09-23T10:00:00.000Z'
                  }
                ],
                error: null
              })
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'media-2',
                    filename: 'test_upload.jpg',
                    original_name: 'test_upload.jpg',
                    mime_type: 'image/jpeg',
                    size: 5120,
                    url: 'https://example.com/test_upload.jpg'
                  },
                  error: null
                })
              })
            })
          };
        }
        return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
      }
    });

    server = http.createServer((req, res) => serverApp(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('server/index.js GET /api/media with token returns HTTP 200 and media list', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/media',
      method: 'GET',
      headers: { Authorization: 'Bearer admin-test-token' }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '[]') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200, 'GET /api/media must return HTTP 200');
    assert.ok(Array.isArray(res.data), 'Media response must be an array');
    assert.strictEqual(res.data.length, 1, 'Media list array must contain items');
  });

  test('Teardown mock server', () => {
    if (server) server.close();
  });
});
