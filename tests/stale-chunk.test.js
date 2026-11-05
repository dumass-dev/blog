import { test } from 'node:test';
import assert from 'node:assert';
import { isStaleChunkError, reloadForNewVersion } from '../src/utils/staleChunk.js';

test('recognises stale-deploy chunk errors from every browser', () => {
  assert.ok(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Editor-abc.js')));
  assert.ok(isStaleChunkError('Importing a module script failed.'));
  assert.ok(isStaleChunkError(new Error('error loading dynamically imported module')));
  assert.ok(!isStaleChunkError(new Error('Cannot read properties of undefined')));
  assert.ok(!isStaleChunkError(null));
});

test('reloads at most once per window (no reload loop)', () => {
  const store = {};
  let reloads = 0;
  global.window = {
    sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    location: { reload: () => { reloads++; } }
  };
  try {
    assert.strictEqual(reloadForNewVersion(), true);
    assert.strictEqual(reloadForNewVersion(), false);
    assert.strictEqual(reloads, 1);
  } finally {
    delete global.window;
  }
});
