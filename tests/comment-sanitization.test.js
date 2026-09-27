import './setup-offline.js';
// -------------------------------------------------------------------
// FIX 1: Comment HTML sanitization
// Verifies HTML tags are stripped from author_name and content before
// insert. Uses a regex that preserves math ops (<= 5, <3, etc.).
// -------------------------------------------------------------------
import http from 'http';
import app from '../api/index.js';

process.env.NODE_ENV = 'test';
process.env.ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';

let passed = 0;
let failed = 0;
let lastInserted = null;

function assert(condition, name) {
  if (condition) { console.log(`  [PASS] ${name}`); passed++; }
  else           { console.error(`  [FAIL] ${name}`); failed++; }
}

function makeRequest(server, body) {
  const port = server.address().port;
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port,
      path: `/api/posts/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/comments`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, body: {} }); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildMock() {
  const entry = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slug: 'test', status: 'published', type: 'journal', has_passcode: false, passcode: null, content: 'Hi', views: 0 };
  return (_req) => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
    from: (tableName) => {
      if (tableName === 'public_published_entries' || tableName === 'entries') {
        const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, single: async () => ({ data: entry, error: null }), maybeSingle: async () => ({ data: entry, error: null }), then: (r) => r({ data: [entry], error: null }) };
        return chain;
      }
      if (tableName === 'comments') {
        return {
          insert: (rows) => ({ select: () => ({ single: async () => { lastInserted = rows[0]; return { data: { id: 'c-1', ...rows[0], created_at: new Date().toISOString() }, error: null }; } }) })
        };
      }
      const noop = { select: () => noop, eq: () => noop, order: () => noop, limit: () => noop, upsert: () => Promise.resolve({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) };
      return noop;
    },
    rpc: async () => ({ data: 1, error: null }),
    channel: () => ({ send: () => Promise.resolve(), subscribe: () => {} })
  });
}

// Regex that matches the real stripHtmlTags implementation
const HTML_TAG_RE = /<(?:[a-zA-Z/!][^>]*)>/g;
function hasHtmlTags(s) { return HTML_TAG_RE.test((HTML_TAG_RE.lastIndex = 0, s)); }

async function run() {
  console.log('=== FIX 1: COMMENT HTML SANITIZATION TESTS ===\n');
  global.__mockSupabaseClient = buildMock();
  const server = http.createServer((req, res) => app(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // --- A: XSS payloads: tags stripped, surrounding text preserved ---
    console.log('--- A: HTML/script tags stripped before insert ---');

    lastInserted = null;
    let r = await makeRequest(server, { author_name: '<script>alert(1)</script>', content: '<img src=x onerror=alert(1)> hello' });
    assert(r.status === 201, 'XSS payload: HTTP 201 (accepted after stripping)');
    assert(lastInserted !== null, 'XSS payload: mock DB received insert');
    assert(!hasHtmlTags(lastInserted.author_name), 'XSS: author_name stored has no HTML tags');
    assert(!hasHtmlTags(lastInserted.content),     'XSS: content stored has no HTML tags');
    // <script>alert(1)</script> -> tags stripped, inner text "alert(1)" remains -> still not empty -> stored
    // But author falls back since alert(1) trim -> 'alert(1)' which is non-empty
    assert(lastInserted.author_name === 'alert(1)', 'XSS: author_name text node preserved without tags');
    assert(lastInserted.content === 'hello',         'XSS: <img ...> stripped, " hello" trimmed to "hello"');

    lastInserted = null;
    r = await makeRequest(server, { author_name: 'Alice', content: 'Nice post <script>doEvil()</script> bye' });
    assert(r.status === 201, 'Script in content: HTTP 201');
    assert(lastInserted.content === 'Nice post doEvil() bye', 'Script in content: tags removed, text nodes preserved');

    // --- B: Normal text with angle-like chars is NOT stripped ---
    console.log('\n--- B: Math operators and <3 are preserved ---');

    lastInserted = null;
    r = await makeRequest(server, { author_name: 'Alex <3', content: 'Really love this post <3' });
    assert(r.status === 201, '"<3": HTTP 201');
    assert(lastInserted.author_name === 'Alex <3', '"<3" in author_name: preserved (no closing > so not a tag)');
    assert(lastInserted.content === 'Really love this post <3', '"<3" in content: preserved');

    lastInserted = null;
    r = await makeRequest(server, { author_name: 'Euler', content: 'x <= 5 and y >= 10 and a != b' });
    assert(r.status === 201, 'Math operators: HTTP 201');
    assert(lastInserted.content === 'x <= 5 and y >= 10 and a != b', 'Math operators: content preserved verbatim');

    // --- C: Content stripped to empty -> 400 ---
    console.log('\n--- C: All-tag content after stripping -> 400 ---');

    r = await makeRequest(server, { author_name: 'Bob', content: '<script></script>' });
    assert(r.status === 400, 'All-tag content: HTTP 400 not 201');

    // --- D: Length limits operate on post-strip value ---
    console.log('\n--- D: Length limits apply after stripping ---');

    const longName = 'A'.repeat(101);
    r = await makeRequest(server, { author_name: longName, content: 'Valid content' });
    assert(r.status === 400, '101-char plain author_name: HTTP 400');

    // HTML-only name that strips to empty -> fallback to Anonymous Reader -> accepted
    lastInserted = null;
    const htmlOnlyName = '<b>'.repeat(34);  // strips to ''
    r = await makeRequest(server, { author_name: htmlOnlyName, content: 'Valid content' });
    assert(r.status === 201, 'All-HTML name strips to empty, falls back to Anonymous Reader: HTTP 201');
    assert(lastInserted.author_name === 'Anonymous Reader', 'All-HTML name stored as "Anonymous Reader"');

    // --- E: Regression — ordinary comment still works ---
    console.log('\n--- E: Ordinary clean comment works as before ---');

    lastInserted = null;
    r = await makeRequest(server, { author_name: 'Jane Doe', content: 'Great read, thanks for sharing!' });
    assert(r.status === 201, 'Normal comment: HTTP 201');
    assert(lastInserted.author_name === 'Jane Doe',                'Normal comment: author_name unchanged');
    assert(lastInserted.content === 'Great read, thanks for sharing!', 'Normal comment: content unchanged');

    lastInserted = null;
    r = await makeRequest(server, { content: 'No name provided' });
    assert(r.status === 201, 'No author_name: HTTP 201');
    assert(lastInserted.author_name === 'Anonymous Reader', 'No author_name: falls back to "Anonymous Reader"');

  } finally {
    delete global.__mockSupabaseClient;
    server.close();
    console.log(`\n==================================================`);
    console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
    console.log(`==================================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch(err => { console.error('Test error:', err); process.exit(1); });
