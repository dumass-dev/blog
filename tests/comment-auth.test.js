import { supabase } from '../server/supabase.js';

console.log('=== RUNNING SECURITY & COMMENT AUTHENTICATION UNIT TESTS ===\n');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

// In-memory mock database state for comments
let mockComments = [
  { id: '11111111-1111-1111-1111-111111111111', post_id: '99999999-9999-9999-9999-999999999999', author_name: 'Test Reader', content: 'Great post!' }
];

// Configure global mock Supabase client for stubbed offline testing
global.__mockSupabaseClient = (req) => {
  const authHeader = req?.headers?.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  const mockClient = { ...supabase };
  mockClient.auth = {
    getUser: async (t) => {
      const tok = t || token;
      if (tok === 'timeout-token') {
        return { data: null, error: { message: 'Auth timeout', isTimeout: true } };
      }
      if (tok === 'valid-admin-token') {
        return { data: { user: { id: 'admin-uuid-12345678', email: 'owner@journal.internal' } }, error: null };
      }
      if (tok === 'valid-non-admin-token') {
        return { data: { user: { id: 'other-user-99999999', email: 'user@example.com' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'Invalid or expired token' } };
    }
  };

  mockClient.rpc = async () => ({ data: 1, error: null });

  mockClient.from = (tableName) => {
    if (tableName === 'comments') {
      return {
        select: (cols) => ({
          eq: (field, val) => ({
            maybeSingle: async () => {
              const found = mockComments.find(c => c[field] === val);
              return { data: found || null, error: null };
            },
            order: () => Promise.resolve({ data: mockComments, error: null })
          }),
          order: () => Promise.resolve({ data: mockComments, error: null })
        }),
        delete: () => ({
          eq: (field, val) => {
            const initialCount = mockComments.length;
            mockComments = mockComments.filter(c => c[field] !== val);
            const deleted = mockComments.length < initialCount;
            return Promise.resolve({ data: null, error: null, count: deleted ? 1 : 0 });
          }
        }),
        insert: (rows) => ({
          select: () => ({
            single: async () => {
              const newRow = { id: '22222222-2222-2222-2222-222222222222', ...rows[0] };
              mockComments.push(newRow);
              return { data: newRow, error: null };
            }
          })
        })
      };
    }

    if (tableName === 'reactions') {
      return {
        insert: (rows) => ({
          select: () => ({
            single: async () => ({ data: { id: '33333333-3333-3333-3333-333333333333', ...rows[0] }, error: null })
          }),
          then: (resolve) => resolve({ data: rows, error: null })
        }),
        select: () => ({
          eq: () => Promise.resolve({ data: [{ reaction_type: 'thoughtful' }], error: null })
        })
      };
    }

    if (tableName === 'entries') {
      const entryObj = { id: '99999999-9999-9999-9999-999999999999', title: 'Test Entry', slug: 'test-slug', views: 5, status: 'published' };
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            neq: () => chain,
            order: () => chain,
            limit: () => chain,
            single: async () => ({ data: entryObj, error: null }),
            maybeSingle: async () => ({ data: entryObj, error: null }),
            then: (resolve) => resolve({ data: [entryObj], error: null })
          };
          return chain;
        },
        update: () => ({ eq: () => Promise.resolve({ data: entryObj, error: null }) })
      };
    }

    const defaultChain = {
      select: () => defaultChain,
      eq: () => defaultChain,
      neq: () => defaultChain,
      order: () => defaultChain,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null })
    };
    return defaultChain;
  };

  return mockClient;
};

async function runTests() {
  const testApp = (await import('../server/index.js')).default;
  const port = 3099;
  const server = testApp.listen(port);
  const baseUrl = `http://localhost:${port}`;

  try {
    // Standard Config: set ADMIN_USER_ID
    process.env.ADMIN_USER_ID = 'admin-uuid-12345678';

    console.log('--- TEST GROUP A: DELETE /api/comments/:id Detailed Security Cases ---');

    // a.1: No header -> 401
    let res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, { method: 'DELETE' });
    assert(res.status === 401, 'DELETE /api/comments/:id with missing header returns 401');

    // a.2: Malformed header -> 401
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Basic invalidformat' }
    });
    assert(res.status === 401, 'DELETE /api/comments/:id with malformed header returns 401');

    // a.3: Invalid token -> 401
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer invalid-token-xyz' }
    });
    assert(res.status === 401, 'DELETE /api/comments/:id with invalid token returns 401');

    // a.4: Valid non-admin token -> 403
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-non-admin-token' }
    });
    assert(res.status === 403, 'DELETE /api/comments/:id with non-admin token returns 403');

    // a.5: Admin + nonexistent ID -> 404
    res = await fetch(`${baseUrl}/api/comments/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 404, 'DELETE /api/comments/:id with nonexistent ID returns 404');

    // a.6: Admin + existing ID -> 200 and row deleted
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    const body6 = await res.json();
    const commentStillExists = mockComments.some(c => c.id === '11111111-1111-1111-1111-111111111111');
    assert(res.status === 200 && body6.success === true && !commentStillExists, 'DELETE /api/comments/:id with admin token & valid ID returns 200 and deletes row');

    // a.7: Bad UUID -> 400
    res = await fetch(`${baseUrl}/api/comments/not-a-valid-uuid`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 400, 'DELETE /api/comments/:id with bad UUID format returns 400');

    // a.8: ADMIN_USER_ID unset -> 403
    delete process.env.ADMIN_USER_ID;
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 403, 'DELETE /api/comments/:id with ADMIN_USER_ID unset returns 403 (Fail Closed)');
    process.env.ADMIN_USER_ID = 'admin-uuid-12345678';

    // a.9: Auth timeout -> 503
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer timeout-token' }
    });
    assert(res.status === 503, 'DELETE /api/comments/:id on auth timeout returns 503 (Fail Closed)');


    console.log('\n--- TEST GROUP B: Admin-Only Routes Require Auth (No Token -> 401) ---');
    const adminProtectedRoutes = [
      { method: 'GET', path: '/api/stats' },
      { method: 'POST', path: '/api/posts', body: { title: 'Test' } },
      { method: 'PUT', path: '/api/posts/00000000-0000-0000-0000-000000000000', body: { title: 'Edit' } },
      { method: 'DELETE', path: '/api/posts/00000000-0000-0000-0000-000000000000' },
      { method: 'POST', path: '/api/media/upload' },
      { method: 'GET', path: '/api/media' },
      { method: 'DELETE', path: '/api/media/00000000-0000-0000-0000-000000000000' },
      { method: 'POST', path: '/api/about', body: { author_name: 'Test' } },
      { method: 'DELETE', path: '/api/comments/00000000-0000-0000-0000-000000000000' }
    ];

    for (const route of adminProtectedRoutes) {
      const opts = { method: route.method };
      if (route.body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(route.body);
      }
      const r = await fetch(`${baseUrl}${route.path}`, opts);
      assert(r.status === 401, `${route.method} ${route.path} without token returns 401 (got HTTP ${r.status})`);
    }


    console.log('\n--- TEST GROUP C: Public Read & Write Routes Function Without Token ---');

    // c.1: GET /api/health
    res = await fetch(`${baseUrl}/api/health`);
    assert(res.status === 200, 'GET /api/health returns 200 without token');

    // c.2: GET /api/posts
    res = await fetch(`${baseUrl}/api/posts`);
    assert(res.status === 200, 'GET /api/posts returns 200 without token');

    // c.3: GET /api/about
    res = await fetch(`${baseUrl}/api/about`);
    assert(res.status === 200, 'GET /api/about returns 200 without token');

    // c.4: GET /api/posts/:identifier
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999`);
    assert(res.status === 200, 'GET /api/posts/:identifier returns 200 without token');

    // c.5: POST /api/posts/:id/comments
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: 'Public Reader', content: 'Nice post!' })
    });
    assert(res.status === 201 || res.status === 200, 'POST /api/posts/:id/comments returns 201/200 without token');

    // c.6: POST /api/posts/:id/reactions
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: 'thoughtful' })
    });
    assert(res.status === 200 || res.status === 201, 'POST /api/posts/:id/reactions returns 200 without token');

    // c.7: POST /api/posts/:id/verify-passcode
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999/verify-passcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrong' })
    });
    assert(res.status === 401 || res.status === 200, 'POST /api/posts/:id/verify-passcode returns response without auth header');

    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('Test Harness Execution Error:', err);
  } finally {
    delete global.__mockSupabaseClient;
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
