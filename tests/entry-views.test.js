import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { updateCachedEntryViews, cacheEntry, getCachedEntry } from '../src/supabase.js';

describe('Entry Views Count & Realtime Sync Tests', () => {
  test('updateCachedEntryViews updates entry view count in in-memory cache', () => {
    const entry = {
      id: '12345678-1234-1234-1234-123456789abc',
      slug: 'test-journal-entry',
      title: 'My Journal',
      content: 'This is my journal content.',
      views: 5
    };

    cacheEntry(entry);
    assert.equal(getCachedEntry('test-journal-entry').views, 5);
    assert.equal(getCachedEntry('12345678-1234-1234-1234-123456789abc').views, 5);

    // Update views in cache
    updateCachedEntryViews(entry.id, entry.slug, 6);

    assert.equal(getCachedEntry('test-journal-entry').views, 6);
    assert.equal(getCachedEntry('12345678-1234-1234-1234-123456789abc').views, 6);
  });

  test('updateCachedEntryViews safely ignores invalid view numbers', () => {
    const entry = {
      id: '87654321-4321-4321-4321-987654321cba',
      slug: 'test-safe-entry',
      title: 'Safe Entry',
      views: 10
    };
    cacheEntry(entry);

    updateCachedEntryViews(entry.id, entry.slug, undefined);
    assert.equal(getCachedEntry('test-safe-entry').views, 10);

    updateCachedEntryViews(entry.id, entry.slug, null);
    assert.equal(getCachedEntry('test-safe-entry').views, 10);
  });
});
