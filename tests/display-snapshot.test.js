process.env.NODE_ENV = 'test';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

// Going back to a list / reopening an entry must not flash the skeleton just
// because a realtime event cleared the caches — but realtime must still win:
// caches are still cleared (so the next fetch is fresh) and deleted or
// unpublished entries never linger in the last-seen display copy.

class MockEventTarget {
  constructor() { this.listeners = {}; }
  addEventListener(type, l) { (this.listeners[type] ||= []).push(l); }
  removeEventListener(type, l) { this.listeners[type] = (this.listeners[type] || []).filter(x => x !== l); }
  dispatchEvent(e) { (this.listeners[e.type] || []).forEach(l => l(e)); return true; }
}
class MockCustomEvent {
  constructor(type, params = {}) { this.type = type; this.detail = params.detail || null; }
}
const mockLocalStorage = {
  store: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

let sb;
let rt;

const fullA = { id: 'id-a', slug: 'post-a', type: 'writing', title: 'A', content: 'Body of A', updated_at: '2026-11-01T00:00:00Z' };
const fullB = { id: 'id-b', slug: 'post-b', type: 'journal', title: 'B', content: 'Body of B', updated_at: '2026-11-02T00:00:00Z' };
const listA = { ...fullA, content: undefined };
const listB = { ...fullB, content: undefined };

function seed() {
  sb.invalidateFeedCache(); // start clean
  sb.dropFromSnapshots('post-a', 'id-a');
  sb.dropFromSnapshots('post-b', 'id-b');
  sb.cacheEntry(fullA);
  sb.cacheEntry(fullB);
  mockLocalStorage.setItem('feed_cache_home', JSON.stringify({ v: 1, savedAt: Date.now(), items: [listA, listB] }));
  assert.ok(sb.getCachedFeed('home'), 'seeded home feed');
}

describe('Last-seen display snapshots across realtime invalidations', () => {
  before(async () => {
    global.window = new MockEventTarget();
    global.window.localStorage = mockLocalStorage;
    global.localStorage = mockLocalStorage;
    global.CustomEvent = MockCustomEvent;
    global.window.CustomEvent = MockCustomEvent;
    sb = await import('../src/supabase.js');
    rt = await import('../src/utils/realtime.js');
  });

  after(() => {
    delete global.window;
    delete global.CustomEvent;
    delete global.localStorage;
  });

  test('invalidation still clears the real caches, but keeps a last-seen copy', () => {
    seed();
    sb.invalidateFeedCache();
    assert.strictEqual(sb.getCachedEntry('post-a'), null, 'real entry cache cleared');
    assert.strictEqual(sb.getCachedFeed('home'), null, 'real feed cache cleared');
    assert.strictEqual(mockLocalStorage.getItem('feed_cache_home'), null, 'saved feed cleared');
    assert.strictEqual(sb.getEntrySnapshot('post-a').content, 'Body of A', 'entry snapshot keeps the body');
    assert.strictEqual(sb.getEntrySnapshot('id-b').content, 'Body of B', 'snapshot by id too');
    assert.deepStrictEqual(sb.getFeedSnapshot('home').map(e => e.slug), ['post-a', 'post-b']);
    assert.ok(sb.getFeedSnapshot('journal'), 'section pages fall back to the home snapshot');
  });

  test('a fresh fetch result always wins over the snapshot', () => {
    seed();
    sb.invalidateFeedCache();
    sb.cacheEntry({ ...fullA, content: 'Edited body' });
    assert.strictEqual(sb.getCachedEntry('post-a').content, 'Edited body');
  });

  test('a body-less copy never overwrites a snapshot that has the body', () => {
    seed();
    sb.invalidateFeedCache();
    sb.cacheEntry(listA); // feed refetch: no content
    sb.invalidateFeedCache(); // another event snapshots the body-less copy
    assert.strictEqual(sb.getEntrySnapshot('post-a').content, 'Body of A');
  });

  test('entry_deleted drops the entry from every snapshot', () => {
    seed();
    rt.dispatchRealtimeMutation({ event: 'entry_deleted', id: 'id-a', slug: 'post-a', broadcastId: 'del-1' });
    assert.strictEqual(sb.getEntrySnapshot('post-a'), null);
    assert.strictEqual(sb.getEntrySnapshot('id-a'), null);
    assert.deepStrictEqual(sb.getFeedSnapshot('home').map(e => e.slug), ['post-b']);
    assert.strictEqual(sb.getCachedEntry('post-b'), null, 'deletion still invalidates everything');
  });

  test('unpublishing (status draft) drops the entry from snapshots', () => {
    seed();
    rt.dispatchRealtimeMutation({ event: 'entry_updated', id: 'id-b', slug: 'post-b', status: 'draft', updated_at: '2026-11-03T00:00:00Z', broadcastId: 'unpub-1' });
    assert.strictEqual(sb.getEntrySnapshot('post-b'), null);
    assert.deepStrictEqual(sb.getFeedSnapshot('home').map(e => e.slug), ['post-a']);
  });

  test('row DELETE from the database stream drops the entry too', () => {
    seed();
    rt.dispatchRealtimeMutation({ type: 'entry', op: 'DELETE', id: 'id-a', slug: 'post-a', broadcastId: 'rowdel-1' });
    assert.strictEqual(sb.getEntrySnapshot('post-a'), null);
  });

  test('a content edit still invalidates and keeps the entry for the instant repaint', () => {
    seed();
    let invalidated = false;
    const h = () => { invalidated = true; };
    global.window.addEventListener('feed-data-invalidated', h);
    rt.dispatchRealtimeMutation({ event: 'entry_updated', id: 'id-a', slug: 'post-a', status: 'published', updated_at: '2026-11-04T00:00:00Z', broadcastId: 'edit-1' });
    global.window.removeEventListener('feed-data-invalidated', h);
    assert.ok(invalidated, 'pages are told to refetch');
    assert.strictEqual(sb.getCachedEntry('post-a'), null, 'real cache cleared so the refetch is fresh');
    assert.strictEqual(sb.getEntrySnapshot('post-a').content, 'Body of A', 'old copy only bridges until the refetch');
    assert.strictEqual(sb.getEntryVersion('post-a'), '2026-11-04T00:00:00Z', 'new version learned for the refetch');
  });

  test('view-count events neither invalidate nor touch snapshots', () => {
    seed();
    rt.dispatchRealtimeMutation({ event: 'entry_view_updated', id: 'id-a', slug: 'post-a', views: 42, broadcastId: 'views-1' });
    assert.strictEqual(sb.getCachedEntry('post-a').content, 'Body of A', 'cache untouched');
    assert.strictEqual(sb.getCachedEntry('post-a').views, 42, 'views patched in place');
  });
});
