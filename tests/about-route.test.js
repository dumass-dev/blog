process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3894;

describe('About Page API Route Tests (/api/about)', () => {
  let server;

  test('Setup test server', async () => {
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
        if (tableName === 'about') {
          return {
            select: () => ({
              limit: async () => ({
                data: [{
                  id: 'about-uuid-1',
                  author_name: 'q04ti',
                  tagline: 'thoughts, things I make, places I go',
                  bio: 'Full biography content for about page.',
                  projects: [{ title: 'Project Alpha', description: 'Test project', link: 'https://example.com' }],
                  links: [{ label: 'GitHub', url: 'https://github.com' }]
                }],
                error: null
              })
            })
          };
        }
        return { select: () => ({ limit: async () => ({ data: [], error: null }) }) };
      }
    });

    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  test('GET /api/about returns status 200 with non-empty bio content, projects, and links', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200, 'GET /api/about must return 200');
    assert.strictEqual(typeof res.data.bio, 'string', 'bio must be a string');
    assert.notStrictEqual(res.data.bio.trim(), '', 'bio must not be empty');
    assert.strictEqual(Array.isArray(res.data.projects), true, 'projects must be an array');
    assert.strictEqual(res.data.projects.length > 0, true, 'projects array must not be empty');
  });

  test('POST /api/about without auth token returns 401', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ author_name: 'Hacker' }));
      req.end();
    });

    assert.strictEqual(res.status, 401, 'POST /api/about without token must return 401');
  });

  test('GET /api/about respects empty projects array without resetting to defaults', async () => {
    global.__mockSupabaseClient = () => ({
      auth: { getUser: async () => ({ data: null, error: null }) },
      from: (tableName) => {
        if (tableName === 'about') {
          return {
            select: () => ({
              limit: async () => ({
                data: [{
                  id: 'about-uuid-2',
                  author_name: 'q04ti',
                  tagline: 'custom tagline',
                  bio: 'Custom bio.',
                  projects: [],
                  links: []
                }],
                error: null
              })
            })
          };
        }
        return { select: () => ({ limit: async () => ({ data: [], error: null }) }) };
      }
    });

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(Array.isArray(res.data.projects), true);
    assert.strictEqual(res.data.projects.length, 0, 'projects array must remain empty when saved as empty');
    assert.strictEqual(Array.isArray(res.data.links), true);
    assert.strictEqual(res.data.links.length, 0, 'links array must remain empty when saved as empty');
  });

  test('GET /api/about returns valid default_theme', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.data.default_theme === 'dark' || res.data.default_theme === 'light', 'default_theme must be light or dark');
  });

  test('GET /api/about retrieves default_theme from realtime_sync fallback when not present in about row', async () => {
    global.__mockSupabaseClient = () => ({
      auth: { getUser: async () => ({ data: null, error: null }) },
      from: (tableName) => {
        if (tableName === 'about') {
          return {
            select: () => ({
              limit: async () => ({
                data: [{
                  id: 'about-uuid-fallback',
                  author_name: 'q04ti',
                  tagline: 'fallback tagline',
                  bio: 'Fallback bio.'
                }],
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
                  data: {
                    payload: { default_theme: 'light', default_typewriter_enabled: true }
                  },
                  error: null
                })
              })
            })
          };
        }
        return { select: () => ({ limit: async () => ({ data: [], error: null }) }) };
      }
    });

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.default_theme, 'light', 'must read default_theme from realtime_sync site_settings fallback');
    assert.strictEqual(res.data.default_typewriter_enabled, true, 'must read default_typewriter_enabled from realtime_sync site_settings fallback');
  });

  test('PUT /api/about with admin token saves default_theme and returns it', async () => {
    let savedSync = null;
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
        if (tableName === 'about') {
          return {
            select: () => ({
              limit: async () => ({
                data: [{ id: 'about-uuid-1' }],
                error: null
              })
            }),
            update: (payload) => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'about-uuid-1', ...payload },
                    error: null
                  })
                })
              })
            })
          };
        }
        if (tableName === 'realtime_sync') {
          return {
            upsert: async (row) => {
              if (row && row.id === 'site_settings') {
                savedSync = row;
              }
              return { data: row, error: null };
            }
          };
        }
        return { select: () => ({ limit: async () => ({ data: [], error: null }) }) };
      }
    });

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-test-token'
      }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({
        author_name: 'q04ti',
        default_theme: 'light',
        default_typewriter_enabled: true
      }));
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.default_theme, 'light');
    assert.strictEqual(res.data.default_typewriter_enabled, true);
    assert.strictEqual(res.data.show_view_count, true);
    assert.ok(savedSync, 'must have persisted to realtime_sync');
    assert.strictEqual(savedSync.payload.default_theme, 'light');
    assert.strictEqual(savedSync.payload.show_view_count, true);
  });

  test('PUT /api/about with admin token saves show_view_count false and returns it', async () => {
    let savedSync = null;
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
        if (tableName === 'about') {
          return {
            select: () => ({
              limit: async () => ({
                data: [{ id: 'about-uuid-1' }],
                error: null
              })
            }),
            update: (payload) => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'about-uuid-1', ...payload },
                    error: null
                  })
                })
              })
            })
          };
        }
        if (tableName === 'realtime_sync') {
          return {
            upsert: async (row) => {
              if (row && row.id === 'site_settings') {
                savedSync = row;
              }
              return { data: row, error: null };
            }
          };
        }
        return { select: () => ({ limit: async () => ({ data: [], error: null }) }) };
      }
    });

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/about',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-test-token'
      }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(body || '{}') }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({
        author_name: 'q04ti',
        show_view_count: false
      }));
      req.end();
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.show_view_count, false);
    assert.ok(savedSync, 'must have persisted to realtime_sync');
    assert.strictEqual(savedSync.payload.show_view_count, false);
  });

  test('Teardown test server', () => {
    if (server) server.close();
  });
});
