import './setup-offline.js';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';
import serverApp from '../server/index.js';

describe('Security & Bug Audit Verification Tests', () => {
  const PORT = 3911;
  let server;

  test('Setup mock test server with Supabase mock', async () => {
    process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';
    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('GET /api/posts/on-this-day redacts passcode-protected entries and hides disabled views', async () => {
    const today = new Date();
    const pastYearDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString();
    const currentYearDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    global.__mockSupabaseClient = () => ({
      from: (tableName) => {
        if (tableName === 'public_published_entries') {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'protected-past',
                    slug: 'protected-past',
                    title: 'Secret Diary Entry',
                    content: 'Top secret diary content that must never leak',
                    excerpt: 'Secret excerpt',
                    cover_image: 'https://images.example.com/secret.jpg',
                    has_passcode: true,
                    passcode: '1234',
                    date: pastYearDate,
                    views: 42
                  },
                  {
                    id: 'today-post',
                    slug: 'today-post',
                    title: 'Post written today',
                    content: 'Not a historical memory yet',
                    has_passcode: false,
                    date: currentYearDate,
                    views: 10
                  }
                ],
                error: null
              })
            })
          };
        }
        if (tableName === 'realtime_sync') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { payload: { show_view_count: false } },
                  error: null
                })
              })
            })
          };
        }
        return { select: () => ({ limit: async () => ({ data: [], error: null }) }) };
      }
    });

    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/posts/on-this-day',
        method: 'GET'
      }, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '[]') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.length, 1, 'Current-year entry written today must not appear in historical on-this-day memories');
    
    const entry = res.data[0];
    assert.strictEqual(entry.id, 'protected-past');
    assert.strictEqual(entry.has_passcode, true);
    assert.strictEqual(entry.passcode, undefined, 'Passcode must be stripped');
    assert.strictEqual(entry.cover_image, '', 'Cover image of protected entry must be redacted');
    assert.ok(entry.content.includes('🔒'), 'Content must be redacted with lock notice');
    assert.ok(entry.excerpt.includes('🔒'), 'Excerpt must be redacted with lock notice');
    assert.strictEqual(entry.views, undefined, 'Views property must be omitted when view counts are disabled');
  });

  test('Teardown test server', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('server/index.js comment and reaction rate limit handling returns 429', async () => {
    const srvPort = 3912;
    const testServer = http.createServer((req, res) => serverApp(req, res));
    await new Promise(resolve => testServer.listen(srvPort, resolve));

    global.__mockSupabaseClient = () => ({
      from: (tableName) => {
        if (tableName === 'comments') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: new Error('Rate limit exceeded: 5 comments per hour')
                })
              })
            })
          };
        }
        if (tableName === 'reactions') {
          return {
            insert: async () => ({
              error: new Error('Rate limit exceeded: 5 reactions per 10 minutes')
            })
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'test-uuid' }, error: null }),
              single: async () => ({ data: { id: 'test-uuid' }, error: null })
            })
          })
        };
      }
    });

    // Test comment 429
    const commentPayload = JSON.stringify({ author_name: 'Tester', content: 'Testing rate limit' });
    const commentRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: srvPort,
        path: '/api/posts/00000000-0000-0000-0000-000000000000/comments',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(commentPayload) }
      }, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(commentPayload);
      req.end();
    });

    assert.strictEqual(commentRes.status, 429, 'Comment endpoint must return 429 when rate limit exceeded');
    assert.ok(commentRes.data.error.includes('too fast'), 'Sanitized friendly error message must be returned');

    // Test reaction 429
    const reactionPayload = JSON.stringify({ reaction_type: 'loved' });
    const reactionRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: srvPort,
        path: '/api/posts/00000000-0000-0000-0000-000000000000/reactions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reactionPayload) }
      }, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(reactionPayload);
      req.end();
    });

    assert.strictEqual(reactionRes.status, 429, 'Reaction endpoint must return 429 when rate limit exceeded');
    assert.ok(reactionRes.data.error.includes('too fast'), 'Sanitized friendly error message must be returned');

    await new Promise(resolve => testServer.close(resolve));
  });
});
