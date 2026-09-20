import './setup-offline.js';

console.log('=== RUNNING SECURITY & COMMENT AUTHENTICATION UNIT TESTS (STRICT OFFLINE MODE) ===\n');

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

async function runTests() {
  const { supabase, getSupabaseClient } = await import('../server/supabase.js');
  const testApp = (await import('../server/index.js')).default;

  console.log('--- TEST GROUP A: Offline Guard Self-Test & Verification ---');

  // a.1: Exported supabase client URL is dummy
  const clientUrl = supabase.supabaseUrl;
  assert(clientUrl === 'http://127.0.0.1:9999', `Exported Supabase URL is dummy URL (got: ${clientUrl})`);

  // a.2: fetch('https://example.com') is blocked by network guard
  let fetchBlocked = false;
  try {
    await fetch('https://example.com');
  } catch (e) {
    fetchBlocked = true;
  }
  assert(fetchBlocked && global.__outboundAttemptsBlocked > 0, 'Outbound fetch to https://example.com was blocked by network guard');

  // a.3: Real Supabase query call in production mode is blocked/refused without mock
  process.env.NODE_ENV = 'production';
  let supaQueryBlocked = false;
  try {
    const realClient = getSupabaseClient({});
    const res = await realClient.from('entries').select('*');
    if (res.error || !res.data) supaQueryBlocked = true;
  } catch (e) {
    supaQueryBlocked = true;
  }
  assert(supaQueryBlocked, 'Real un-mocked Supabase query call in production mode is blocked/refused');
  process.env.NODE_ENV = 'test';

  // a.4: Real B2 call in production mode is blocked by network guard
  process.env.NODE_ENV = 'production';
  let b2Blocked = false;
  try {
    const { uploadToB2 } = await import('../server/b2.js');
    await uploadToB2(Buffer.from('test'), 'test.jpg', 'image/jpeg');
  } catch (e) {
    b2Blocked = true;
  }
  assert(b2Blocked, 'Real un-mocked Backblaze B2 upload call in production mode was blocked by network guard');
  process.env.NODE_ENV = 'test';

  // Reset counter for application test suite
  global.__outboundAttemptsBlocked = 0;


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
        if (tok === 'valid-admin-token' || tok === 'ADMIN-TOKEN-UPPER') {
          return { data: { user: { id: 'admin-uuid-12345678', email: 'owner@journal.internal' } }, error: null };
        }
        if (tok === 'uppercase-user-id-token') {
          return { data: { user: { id: 'ADMIN-UUID-12345678', email: 'owner@journal.internal' } }, error: null };
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
            eq: (field, val) => ({
              select: async () => {
                const existingIndex = mockComments.findIndex(c => c[field] === val);
                if (existingIndex >= 0) {
                  const deletedRow = mockComments.splice(existingIndex, 1)[0];
                  return { data: [{ id: deletedRow.id }], error: null };
                }
                return { data: [], error: null };
              }
            })
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
        const pubEntry = { id: '99999999-9999-9999-9999-999999999999', title: 'Public Entry', slug: 'public-entry', content: 'Real secret body content', views: 5, status: 'published', passcode: '1234' };
        const draftEntry = { id: '88888888-8888-8888-8888-888888888888', title: 'Draft Entry', slug: 'draft-entry', content: 'Draft content', views: 0, status: 'draft' };

        return {
          select: () => {
            let statusFilter = null;
            const chain = {
              eq: (field, val) => {
                if (field === 'status') statusFilter = val;
                return chain;
              },
              neq: () => chain,
              order: () => chain,
              limit: () => chain,
              single: async () => ({ data: pubEntry, error: null }),
              maybeSingle: async () => ({ data: pubEntry, error: null }),
              then: (resolve) => {
                if (statusFilter === 'published') return resolve({ data: [pubEntry], error: null });
                if (statusFilter === 'draft') return resolve({ data: [draftEntry], error: null });
                return resolve({ data: [pubEntry, draftEntry], error: null });
              }
            };
            return chain;
          },
          update: () => ({ eq: () => Promise.resolve({ data: pubEntry, error: null }) })
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

  const server = testApp.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    process.env.ADMIN_USER_ID = 'admin-uuid-12345678';

    console.log('\n--- TEST GROUP B: DELETE /api/comments/:id Detailed Security Cases ---');

    // b.1: No header -> 401
    let res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, { method: 'DELETE' });
    assert(res.status === 401, 'DELETE /api/comments/:id with missing header returns 401');

    // b.2: Malformed header -> 401
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Basic invalidformat' }
    });
    assert(res.status === 401, 'DELETE /api/comments/:id with malformed header returns 401');

    // b.3: Invalid token -> 401
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer invalid-token-xyz' }
    });
    assert(res.status === 401, 'DELETE /api/comments/:id with invalid token returns 401');

    // b.4: Valid non-admin token -> 403
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-non-admin-token' }
    });
    assert(res.status === 403, 'DELETE /api/comments/:id with non-admin token returns 403');

    // b.5: Admin + nonexistent ID (returns 0 rows on delete) -> 404
    res = await fetch(`${baseUrl}/api/comments/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 404, 'DELETE /api/comments/:id with 0 returned rows (RLS refusal or nonexistent ID) returns 404');

    // b.6: Admin + existing ID -> 200 and row deleted
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    const body6 = await res.json();
    const commentStillExists = mockComments.some(c => c.id === '11111111-1111-1111-1111-111111111111');
    assert(res.status === 200 && body6.success === true && !commentStillExists, 'DELETE /api/comments/:id with admin token & valid ID returns 200 and deletes row');

    // b.7: Bad UUID -> 400
    res = await fetch(`${baseUrl}/api/comments/not-a-valid-uuid`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 400, 'DELETE /api/comments/:id with bad UUID format returns 400');

    // b.8: ADMIN_USER_ID unset / empty -> 403
    delete process.env.ADMIN_USER_ID;
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 403, 'DELETE /api/comments/:id with ADMIN_USER_ID unset returns 403 (Fail Closed)');
    process.env.ADMIN_USER_ID = 'admin-uuid-12345678';

    // b.9: Auth timeout -> 503
    res = await fetch(`${baseUrl}/api/comments/11111111-1111-1111-1111-111111111111`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer timeout-token' }
    });
    assert(res.status === 503, 'DELETE /api/comments/:id on auth timeout returns 503 (Fail Closed)');


    console.log('\n--- TEST GROUP C: Admin ID Comparison Edge Cases (Task D) ---');

    // c.1: Trailing newlines/spaces in process.env.ADMIN_USER_ID
    process.env.ADMIN_USER_ID = '  admin-uuid-12345678 \n ';
    res = await fetch(`${baseUrl}/api/comments/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 404, 'ADMIN_USER_ID with whitespace/newlines matches trimmed token user (returns 404 for nonexistent ID)');

    // c.2: Uppercase user.id
    res = await fetch(`${baseUrl}/api/comments/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer uppercase-user-id-token' }
    });
    assert(res.status === 404, 'Uppercase user.id matches case-insensitively (returns 404 for nonexistent ID)');

    // c.3: All-whitespace ADMIN_USER_ID -> 403
    process.env.ADMIN_USER_ID = '   \t \n ';
    res = await fetch(`${baseUrl}/api/comments/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    assert(res.status === 403, 'All-whitespace ADMIN_USER_ID returns 403 (Fail Closed)');
    process.env.ADMIN_USER_ID = 'admin-uuid-12345678';


    console.log('\n--- TEST GROUP D: Draft Leak Prevention (Task E) ---');

    // d.1: Anonymous request for status=all -> restricted to published entries only
    res = await fetch(`${baseUrl}/api/posts?status=all`);
    const anonPosts = await res.json();
    const hasDraftsAnon = Array.isArray(anonPosts) && anonPosts.some(p => p.status === 'draft');
    assert(res.status === 200 && !hasDraftsAnon, 'GET /api/posts?status=all without token restricts results to published entries only (zero drafts)');

    // d.2: Admin request for status=all -> receives drafts
    res = await fetch(`${baseUrl}/api/posts?status=all`, {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    const adminPosts = await res.json();
    const hasDraftsAdmin = Array.isArray(adminPosts) && adminPosts.some(p => p.status === 'draft');
    assert(res.status === 200 && hasDraftsAdmin, 'GET /api/posts?status=all with valid admin token returns draft entries');

    // d.3: Anonymous request for passcode protected post -> redacted content & passcode undefined
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999`);
    const anonPost = await res.json();
    assert(res.status === 200 && anonPost.content.includes('🔒') && anonPost.passcode === undefined, 'GET /api/posts/:id without admin token redacts passcode-protected entry');

    // d.4: Admin request for passcode protected post -> returns unredacted real content & passcode
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999`, {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    });
    const adminSinglePost = await res.json();
    assert(res.status === 200 && !adminSinglePost.content.includes('🔒') && adminSinglePost.passcode === '1234', 'GET /api/posts/:id with valid admin token returns unredacted entry content and passcode');


    console.log('\n--- TEST GROUP E: Admin-Only Routes Require Auth (No Token -> 401) ---');
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


    console.log('\n--- TEST GROUP F: Public Read & Write Routes Function Without Token ---');

    // f.1: GET /api/health
    res = await fetch(`${baseUrl}/api/health`);
    assert(res.status === 200, 'GET /api/health returns 200 without token');

    // f.2: GET /api/posts
    res = await fetch(`${baseUrl}/api/posts`);
    assert(res.status === 200, 'GET /api/posts returns 200 without token');

    // f.3: GET /api/about
    res = await fetch(`${baseUrl}/api/about`);
    assert(res.status === 200, 'GET /api/about returns 200 without token');

    // f.4: GET /api/posts/:identifier
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999`);
    assert(res.status === 200, 'GET /api/posts/:identifier returns 200 without token');

    // f.5: POST /api/posts/:id/comments
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: 'Public Reader', content: 'Nice post!' })
    });
    assert(res.status === 201 || res.status === 200, 'POST /api/posts/:id/comments returns 201/200 without token');

    // f.6: POST /api/posts/:id/reactions
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: 'thoughtful' })
    });
    assert(res.status === 200 || res.status === 201, 'POST /api/posts/:id/reactions returns 200 without token');

    // f.7: POST /api/posts/:id/verify-passcode (Restored from Round 1)
    res = await fetch(`${baseUrl}/api/posts/99999999-9999-9999-9999-999999999999/verify-passcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrong' })
    });
    assert(res.status === 401 || res.status === 200, 'POST /api/posts/:id/verify-passcode returns response without auth header');

    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('outbound attempts blocked:', global.__outboundAttemptsBlocked);
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
