import './setup-offline.js';

// -------------------------------------------------------------------
// RATE-LIMIT 429 TESTS
// Verifies that the DB-trigger "Rate limit exceeded" exception surfaces
// as HTTP 429 (not 500), with a clean client-facing message.
// All Supabase I/O is mocked — no real network calls.
// -------------------------------------------------------------------

import http from 'http';
import app from '../api/index.js';

process.env.NODE_ENV = 'test';
process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';

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

function makeRequest(server, method, path, body) {
  const port = server.address().port;
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(raw); } catch { json = {}; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildMockClient(commentInsertCount, reactionInsertCount, COMMENT_LIMIT, REACTION_LIMIT) {
  return (_req) => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Not authed' } })
    },
    from: (tableName) => {
      if (tableName === 'public_published_entries' || tableName === 'entries') {
        const entry = {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          slug: 'test-entry', title: 'Test Entry', status: 'published',
          type: 'journal', has_passcode: false, passcode: null,
          content: 'Hello world', excerpt: 'Hello', cover_image: '', views: 0
        };
        const chain = {
          select: () => chain, eq: () => chain, order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: entry, error: null }),
          single: async () => ({ data: entry, error: null }),
          then: (resolve) => resolve({ data: [entry], error: null })
        };
        return chain;
      }
      if (tableName === 'comments') {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
          insert: (_rows) => ({
            select: () => ({
              single: async () => {
                commentInsertCount.value++;
                if (commentInsertCount.value > COMMENT_LIMIT) {
                  return { data: null, error: { message: 'Rate limit exceeded: max 5 comments per 10 minutes.' } };
                }
                return { data: { id: `c-${commentInsertCount.value}`, post_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', author_name: 'Tester', content: 'ok', created_at: new Date().toISOString() }, error: null };
              }
            })
          })
        };
      }
      if (tableName === 'reactions') {
        return {
          insert: (_rows) => ({
            then: async (resolve) => {
              reactionInsertCount.value++;
              if (reactionInsertCount.value > REACTION_LIMIT) {
                return resolve({ data: null, error: { message: 'Rate limit exceeded: Maximum 20 reactions allowed per 5 minutes.' } });
              }
              return resolve({ data: [{ reaction_type: 'loved' }], error: null });
            }
          }),
          select: () => ({ eq: () => Promise.resolve({ data: [{ reaction_type: 'loved' }], error: null }) })
        };
      }
      const noop = {
        select: () => noop, eq: () => noop, order: () => noop, limit: () => noop,
        upsert: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null })
      };
      return noop;
    },
    rpc: async () => ({ data: 1, error: null }),
    channel: () => ({ send: () => Promise.resolve(), subscribe: () => {} })
  });
}

async function run() {
  console.log('=== RATE-LIMIT 429 TESTS ===\n');

  const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const COMMENT_PATH = `/api/posts/${POST_ID}/comments`;
  const REACTION_PATH = `/api/posts/${POST_ID}/reactions`;
  const COMMENT_LIMIT = 5;
  const REACTION_LIMIT = 5;
  const commentInsertCount = { value: 0 };
  const reactionInsertCount = { value: 0 };

  global.__mockSupabaseClient = buildMockClient(commentInsertCount, reactionInsertCount, COMMENT_LIMIT, REACTION_LIMIT);

  const server = http.createServer((req, res) => app(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // ---- GROUP A: Comments ----
    console.log('--- A: Comment rate-limit (5 allowed, 6th blocked) ---');
    for (let i = 1; i <= COMMENT_LIMIT; i++) {
      const r = await makeRequest(server, 'POST', COMMENT_PATH, { author_name: 'RateTester', content: `Stress test comment ${i}` });
      assert(r.status === 201, `Comment ${i}/${COMMENT_LIMIT}: HTTP 201 (allowed)`);
    }
    const blocked = await makeRequest(server, 'POST', COMMENT_PATH, { author_name: 'RateTester', content: 'This should be blocked' });
    assert(blocked.status === 429, `Comment ${COMMENT_LIMIT + 1} (over limit): HTTP 429, not 500`);
    assert(typeof blocked.body.error === 'string' && blocked.body.error.length > 0, 'Blocked comment: non-empty error field in body');
    assert(!/rate limit exceeded/i.test(blocked.body.error), 'Blocked comment: raw Postgres text NOT leaked to client');
    assert(!/max \d+ comments/i.test(blocked.body.error), 'Blocked comment: DB threshold details NOT leaked to client');

    // ---- GROUP B: Reactions ----
    console.log('\n--- B: Reaction rate-limit (5 allowed, 6th blocked) ---');
    for (let i = 1; i <= REACTION_LIMIT; i++) {
      const r = await makeRequest(server, 'POST', REACTION_PATH, { reaction_type: 'loved' });
      assert(r.status === 200, `Reaction ${i}/${REACTION_LIMIT}: HTTP 200 (allowed)`);
    }
    const blockedReaction = await makeRequest(server, 'POST', REACTION_PATH, { reaction_type: 'cozy' });
    assert(blockedReaction.status === 429, `Reaction ${REACTION_LIMIT + 1} (over limit): HTTP 429, not 500`);
    assert(typeof blockedReaction.body.error === 'string' && blockedReaction.body.error.length > 0, 'Blocked reaction: non-empty error field in body');
    assert(!/rate limit exceeded/i.test(blockedReaction.body.error), 'Blocked reaction: raw Postgres text NOT leaked to client');

    // ---- GROUP C: Non-rate-limit errors still 500 ----
    console.log('\n--- C: Non-rate-limit DB errors still produce HTTP 500 ---');
    const savedMock = global.__mockSupabaseClient;
    global.__mockSupabaseClient = (_req) => ({
      auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
      from: (tableName) => {
        if (tableName === 'public_published_entries' || tableName === 'entries') {
          const entry = { id: POST_ID, slug: 'test-entry', status: 'published', type: 'journal', has_passcode: false, passcode: null, content: 'Hi', views: 0 };
          const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, single: async () => ({ data: entry, error: null }), maybeSingle: async () => ({ data: entry, error: null }), then: (r) => r({ data: [entry], error: null }) };
          return chain;
        }
        if (tableName === 'comments') {
          return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'connection timeout to postgres' } }) }) }) };
        }
        const noop = { select: () => noop, eq: () => noop, order: () => noop, limit: () => noop, upsert: () => Promise.resolve({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) };
        return noop;
      },
      rpc: async () => ({ data: 1, error: null }),
      channel: () => ({ send: () => Promise.resolve(), subscribe: () => {} })
    });

    const genericErr = await makeRequest(server, 'POST', COMMENT_PATH, { author_name: 'T', content: 'Generic error test' });
    assert(genericErr.status === 500, 'Non-rate-limit DB error: still returns HTTP 500');
    assert(!/you're posting too fast/i.test(genericErr.body.error || ''), 'Non-rate-limit 500: does not use the 429 message copy');
    global.__mockSupabaseClient = savedMock;

  } finally {
    delete global.__mockSupabaseClient;
    server.close();
    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
    console.log(`==================================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch((err) => {
  console.error('Test harness error:', err);
  process.exit(1);
});
