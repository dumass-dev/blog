process.env.NODE_ENV = 'test';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

// Setup mock window with EventTarget & localStorage
class MockEventTarget {
  constructor() {
    this.listeners = {};
  }
  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }
  removeEventListener(type, listener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
  }
  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    list.forEach(l => l(event));
    return true;
  }
}

class MockCustomEvent {
  constructor(type, params = {}) {
    this.type = type;
    this.detail = params.detail || null;
  }
}

const mockLocalStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

let realtimeModule;

describe('Realtime Client Engine Unit Tests', () => {
  before(async () => {
    global.window = new MockEventTarget();
    global.window.localStorage = mockLocalStorage;
    global.localStorage = mockLocalStorage;
    global.CustomEvent = MockCustomEvent;
    global.window.CustomEvent = MockCustomEvent;

    realtimeModule = await import('../src/utils/realtime.js');
  });

  after(() => {
    delete global.window;
    delete global.CustomEvent;
  });

  test('subscribeToRealtimeStatus receives initial status', () => {
    let receivedStatus = null;
    const unsub = realtimeModule.subscribeToRealtimeStatus((status) => {
      receivedStatus = status;
    });
    assert.strictEqual(typeof receivedStatus, 'boolean');
    unsub();
  });

  test('dispatchRealtimeMutation dispatches feed-data-invalidated and entry-updated events', async () => {
    let feedEventReceived = false;
    let entryEventReceived = false;
    let eventDetail = null;

    const feedHandler = (e) => {
      feedEventReceived = true;
      eventDetail = e.detail;
    };
    const entryHandler = () => {
      entryEventReceived = true;
    };

    global.window.addEventListener('feed-data-invalidated', feedHandler);
    global.window.addEventListener('entry-updated', entryHandler);

    realtimeModule.dispatchRealtimeMutation({
      type: 'entry',
      op: 'INSERT',
      id: 'test-unit-id-1',
      title: 'Unit Test Entry'
    }, { isLocal: true });

    await new Promise(r => setTimeout(r, 20));

    assert.ok(feedEventReceived, 'feed-data-invalidated custom event fired');
    assert.ok(entryEventReceived, 'entry-updated custom event fired');
    assert.strictEqual(eventDetail.title, 'Unit Test Entry');

    global.window.removeEventListener('feed-data-invalidated', feedHandler);
    global.window.removeEventListener('entry-updated', entryHandler);
  });

  test('dispatchRealtimeMutation dispatches about-data-updated event on about updates', async () => {
    let aboutEventReceived = false;

    const aboutHandler = () => {
      aboutEventReceived = true;
    };

    global.window.addEventListener('about-data-updated', aboutHandler);

    realtimeModule.dispatchRealtimeMutation({
      type: 'about',
      op: 'UPDATE',
      data: { author_name: 'Test Author' }
    }, { isLocal: true });

    await new Promise(r => setTimeout(r, 20));

    assert.ok(aboutEventReceived, 'about-data-updated event fired');
    global.window.removeEventListener('about-data-updated', aboutHandler);
  });

  test('dispatchRealtimeMutation dispatches site-settings-updated and about-data-updated events', async () => {
    let siteSettingsReceived = false;
    let aboutReceived = false;
    let payloadReceived = null;

    const siteSettingsHandler = (e) => {
      siteSettingsReceived = true;
      payloadReceived = e.detail;
    };
    const aboutHandler = () => {
      aboutReceived = true;
    };

    global.window.addEventListener('site-settings-updated', siteSettingsHandler);
    global.window.addEventListener('about-data-updated', aboutHandler);

    realtimeModule.dispatchRealtimeMutation({
      type: 'site_settings_updated',
      data: { default_typewriter_enabled: true, default_theme: 'dark' }
    }, { isLocal: true });

    await new Promise(r => setTimeout(r, 20));

    assert.ok(siteSettingsReceived, 'site-settings-updated event fired');
    assert.ok(aboutReceived, 'about-data-updated event fired');
    assert.strictEqual(payloadReceived.data.default_typewriter_enabled, true);

    global.window.removeEventListener('site-settings-updated', siteSettingsHandler);
    global.window.removeEventListener('about-data-updated', aboutHandler);
  });

  test('dispatchRealtimeMutation dispatches comments-updated and reactions-updated events', async () => {
    let commentsReceived = false;
    let reactionsReceived = false;

    const commentHandler = () => { commentsReceived = true; };
    const reactionHandler = () => { reactionsReceived = true; };

    global.window.addEventListener('comments-updated', commentHandler);
    global.window.addEventListener('reactions-updated', reactionHandler);

    realtimeModule.dispatchRealtimeMutation({ type: 'comment', op: 'INSERT', postId: 'post-1' }, { isLocal: true });
    realtimeModule.dispatchRealtimeMutation({ type: 'reaction', op: 'INSERT', postId: 'post-1' }, { isLocal: true });

    await new Promise(r => setTimeout(r, 20));

    assert.ok(commentsReceived, 'comments-updated event fired');
    assert.ok(reactionsReceived, 'reactions-updated event fired');

    global.window.removeEventListener('comments-updated', commentHandler);
    global.window.removeEventListener('reactions-updated', reactionHandler);
  });

  test('publishRealtimeUpdate enriches payload and dispatches locally and to channels without errors', () => {
    let eventReceived = false;
    const handler = () => { eventReceived = true; };
    global.window.addEventListener('feed-data-invalidated', handler);

    realtimeModule.publishRealtimeUpdate({
      type: 'entry',
      op: 'UPDATE',
      id: 'test-enrich-id'
    });

    assert.ok(eventReceived, 'publishRealtimeUpdate dispatched feed-data-invalidated');
    global.window.removeEventListener('feed-data-invalidated', handler);
  });
});
