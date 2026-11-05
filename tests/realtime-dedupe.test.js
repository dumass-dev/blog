process.env.NODE_ENV = 'test';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

class MockEventTarget {
  constructor() { this.listeners = {}; }
  addEventListener(t, l) { (this.listeners[t] ||= []).push(l); }
  removeEventListener(t, l) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== l); }
  dispatchEvent(e) { (this.listeners[e.type] || []).forEach(l => l(e)); return true; }
}
class MockCustomEvent { constructor(type, p = {}) { this.type = type; this.detail = p.detail || null; } }
const store = {};
const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

let sb, rt;
describe('one save = one refetch per viewer', () => {
  before(async () => {
    global.window = new MockEventTarget();
    global.window.localStorage = ls; global.localStorage = ls;
    global.CustomEvent = MockCustomEvent; global.window.CustomEvent = MockCustomEvent;
    sb = await import('../src/supabase.js');
    rt = await import('../src/utils/realtime.js');
  });
  after(() => { delete global.window; delete global.CustomEvent; delete global.localStorage; });

  const count = (fn) => {
    let n = 0; const h = () => { n++; };
    global.window.addEventListener('entry-updated', h);
    fn();
    global.window.removeEventListener('entry-updated', h);
    return n;
  };

  test('server broadcast + editor mutation for the same save count once', () => {
    const n = count(() => {
      rt.dispatchRealtimeMutation({ event: 'entry_updated', id: 'e1', slug: 's1', op: 'UPDATE', updated_at: '2026-11-05T07:00:00Z', version: 111 });
      rt.dispatchRealtimeMutation({ type: 'entry', id: 'e1', slug: 's1', op: 'UPDATE', updated_at: '2026-11-05T07:00:00Z', broadcastId: 'b1' });
    });
    assert.strictEqual(n, 1);
  });

  test('a newer save of the same entry still goes through', () => {
    const n = count(() => {
      rt.dispatchRealtimeMutation({ event: 'entry_updated', id: 'e2', op: 'UPDATE', updated_at: '2026-11-05T07:01:00Z', version: 1 });
      rt.dispatchRealtimeMutation({ event: 'entry_updated', id: 'e2', op: 'UPDATE', updated_at: '2026-11-05T07:01:05Z', version: 2 });
    });
    assert.strictEqual(n, 2);
  });

  test('deletes are never swallowed by the version check', () => {
    const n = count(() => {
      rt.dispatchRealtimeMutation({ event: 'entry_updated', id: 'e3', updated_at: '2026-11-05T07:02:00Z', version: 5 });
      rt.dispatchRealtimeMutation({ event: 'entry_deleted', id: 'e3', op: 'DELETE', version: 6 });
    });
    assert.strictEqual(n, 2);
  });

  test('identical GETs in flight share one request; each caller gets its own copy', async () => {
    let calls = 0;
    const realFetch = global.fetch;
    global.fetch = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { ok: true, text: async () => '{"title":"A"}' }; };
    try {
      const [a, b, c] = await Promise.all([sb.safeApiFetch('/api/posts/x'), sb.safeApiFetch('/api/posts/x'), sb.safeApiFetch('/api/posts/x')]);
      assert.strictEqual(calls, 1);
      assert.deepStrictEqual(a, { title: 'A' });
      a.title = 'mutated';
      assert.strictEqual(b.title, 'A');
      assert.strictEqual(c.title, 'A');
      await sb.safeApiFetch('/api/posts/x');
      assert.strictEqual(calls, 2, 'a later call fetches fresh');
    } finally {
      global.fetch = realFetch;
    }
  });
});
