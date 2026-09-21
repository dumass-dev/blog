process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3896;

describe('Passcode Protection & Unlock Route Tests', () => {
  let server;

  test('Setup mock server & Supabase mock', async () => {
    process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';

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
          if (tableName === 'public_published_entries') {
            return {
              select: () => ({
                eq: (_col, val) => {
                  if (val === 'secret-entry-slug') {
                    return Promise.resolve({
                      data: [{
                        id: '00000000-0000-0000-0000-000000000099',
                        slug: 'secret-entry-slug',
                        title: 'Secret Entry',
                        type: 'journal',
                        has_passcode: true,
                        is_protected: true,
                        content: '🔒 This entry is passcode-protected. Enter passcode to unlock reading view.',
                        excerpt: '🔒 Protected entry',
                        date: new Date().toISOString()
                      }],
                      error: null
                    });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
                order: () => Promise.resolve({ data: [], error: null })
              })
            };
          }
          if (tableName === 'entries') {
            return {
              select: () => ({
                eq: (_col, val) => {
                  if (val === 'secret-entry-slug') {
                    return Promise.resolve({
                      data: [{
                        id: '00000000-0000-0000-0000-000000000099',
                        slug: 'secret-entry-slug',
                        title: 'Secret Entry',
                        type: 'journal',
                        has_passcode: true,
                        is_protected: true,
                        passcode: '$2a$10$hashedpasscode',
                        content: 'This is the real secret text.',
                        excerpt: 'This is the real secret text.',
                        date: new Date().toISOString()
                      }],
                      error: null
                    });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
                order: () => Promise.resolve({ data: [], error: null })
              })
            };
          }
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        },
        rpc: (rpcName, params) => {
          if (rpcName === 'get_protected_entry') {
            if (params.code === 'correct-code') {
              return Promise.resolve({
                data: [{
                  unlocked: true,
                  content: 'This is the real secret text unlocked by RPC.',
                  excerpt: 'This is the real secret text...',
                  cover_image: ''
                }],
                error: null
              });
            } else {
              return Promise.resolve({
                data: [{
                  unlocked: false,
                  error_message: 'Incorrect passcode.'
                }],
                error: null
              });
            }
          }
          return Promise.resolve({ data: null, error: null });
        }
      };
    };

    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('Anonymous GET /api/posts/:slug returns has_passcode=true, redacted content, and NO passcode column', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/posts/secret-entry-slug',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.entry.has_passcode, true, 'has_passcode must be true for anonymous reader');
    assert.strictEqual(res.body.entry.passcode, undefined, 'passcode column must NOT be sent to anonymous reader');
    assert.strictEqual(res.body.entry.content.includes('🔒'), true, 'content must be redacted');
    assert.strictEqual(res.body.entry.content.includes('real secret text'), false, 'real content must not be exposed');
  });

  test('Admin GET /api/posts/:slug returns real unredacted content', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/posts/secret-entry-slug',
      method: 'GET',
      headers: { Authorization: 'Bearer valid_admin_token' }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.entry.has_passcode, true);
    assert.strictEqual(res.body.entry.content, 'This is the real secret text.');
  });

  test('POST /api/posts/:slug/verify-passcode with correct code calls get_protected_entry RPC and unlocks', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/posts/secret-entry-slug/verify-passcode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ passcode: 'correct-code' }));
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.unlocked, true);
    assert.strictEqual(res.body.content, 'This is the real secret text unlocked by RPC.');
  });

  test('POST /api/posts/:slug/verify-passcode with incorrect code returns 401', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/posts/secret-entry-slug/verify-passcode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ passcode: 'wrong-code' }));
      req.end();
    });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'Incorrect passcode.');
  });

  test('Teardown test server', () => {
    delete global.__mockSupabaseClient;
    if (server) server.close();
  });
});
