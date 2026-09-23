process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';
import { generateSitemapXml, getRobotsTxt } from '../server/sitemap.js';

const PORT = 3899;

describe('Dynamic XML Sitemap & Robots.txt Route Tests (/sitemap.xml, /robots.txt)', () => {
  let server;

  test('Setup test server', async () => {
    process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';
    global.__mockSupabaseClient = () => ({
      from: (tableName) => {
        if (tableName === 'entries') {
          // Direct SELECT on 'entries' is REVOKED for anonymous requests -> returns permission denied error
          return {
            select: () => ({
              order: async () => ({
                data: null,
                error: { message: 'permission denied for table entries', code: '42501' }
              })
            })
          };
        }
        if (tableName === 'public_published_entries') {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'post-1',
                    slug: 'valid-public-essay',
                    has_passcode: false,
                    show_in_feed: true,
                    updated_at: '2026-09-20T10:00:00.000Z'
                  },
                  {
                    id: 'post-3',
                    slug: 'locked-private-diary',
                    has_passcode: true,
                    show_in_feed: true,
                    updated_at: '2026-09-22T10:00:00.000Z'
                  },
                  {
                    id: 'post-4',
                    slug: 'hidden-feed-post',
                    has_passcode: false,
                    show_in_feed: false,
                    updated_at: '2026-09-23T10:00:00.000Z'
                  }
                ],
                error: null
              })
            })
          };
        }
        return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
      }
    });


    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('generateSitemapXml helper logic filters correctly', () => {
    const mockEntries = [
      { id: '1', slug: 'pub-entry', status: 'published', has_passcode: false, show_in_feed: true },
      { id: '2', slug: 'draft-entry', status: 'draft', has_passcode: false, show_in_feed: true },
      { id: '3', slug: 'locked-entry', status: 'published', has_passcode: true, show_in_feed: true },
      { id: '4', slug: 'hidden-entry', status: 'published', has_passcode: false, show_in_feed: false }
    ];

    const xml = generateSitemapXml(mockEntries, 'https://blog.q04ti.dev');

    assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/</loc>'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/journal</loc>'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/writing</loc>'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/photos</loc>'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/updates</loc>'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/archive</loc>'));
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/about</loc>'));

    // Check entry filters
    assert.ok(xml.includes('<loc>https://blog.q04ti.dev/entry/pub-entry</loc>'), 'Published entry should be in sitemap');
    assert.strictEqual(xml.includes('draft-entry'), false, 'Draft entry must NOT appear in sitemap');
    assert.strictEqual(xml.includes('locked-entry'), false, 'Passcode-locked entry must NOT appear in sitemap');
    assert.strictEqual(xml.includes('hidden-entry'), false, 'Hidden entry must NOT appear in sitemap');
  });

  test('getRobotsTxt helper returns valid robots.txt content', () => {
    const txt = getRobotsTxt('https://blog.q04ti.dev');
    assert.ok(txt.includes('User-agent: *'));
    assert.ok(txt.includes('Allow: /'));
    assert.ok(txt.includes('Sitemap: https://blog.q04ti.dev/sitemap.xml'));
  });

  test('GET /sitemap.xml returns status 200 with XML content type and filtered entries', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/sitemap.xml',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200, 'GET /sitemap.xml must return 200');
    assert.ok(res.headers['content-type'].includes('xml'), 'Content-Type must be XML');
    assert.ok(res.body.includes('<urlset'), 'Must contain <urlset tag');
    assert.ok(res.body.includes('<loc>https://blog.q04ti.dev/entry/valid-public-essay</loc>'), 'Valid public entry must be in sitemap');
    assert.strictEqual(res.body.includes('secret-draft-essay'), false, 'Draft entry must NOT be in sitemap');
    assert.strictEqual(res.body.includes('locked-private-diary'), false, 'Passcode locked entry must NOT be in sitemap');
    assert.strictEqual(res.body.includes('hidden-feed-post'), false, 'Hidden entry must NOT be in sitemap');
  });

  test('GET /robots.txt returns status 200 with text/plain content type pointing to sitemap', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/robots.txt',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200, 'GET /robots.txt must return 200');
    assert.ok(res.headers['content-type'].includes('text/plain'), 'Content-Type must be text/plain');
    assert.ok(res.body.includes('User-agent: *'), 'Must include User-agent');
    assert.ok(res.body.includes('Sitemap: https://blog.q04ti.dev/sitemap.xml'), 'Must point to sitemap');
  });

  test('Teardown test server', () => {
    if (server) server.close();
  });
});
