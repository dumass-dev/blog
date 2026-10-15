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

  test('View count visibility toggle logic and localStorage persistence simulation', () => {
    const mockStorage = new Map();
    const fakeLocalStorage = {
      getItem: (key) => mockStorage.get(key) ?? null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key)
    };

    // Initial state: no preference set -> defaults to site default (true)
    let siteDefaultShowViews = true;
    let userPref = fakeLocalStorage.getItem('show_view_count');
    let effectiveShow = userPref !== null ? userPref === 'true' : siteDefaultShowViews;
    assert.equal(effectiveShow, true, 'Default view count visibility should be true');

    // User toggles to hide view count
    let nextVal = !effectiveShow;
    fakeLocalStorage.setItem('show_view_count', String(nextVal));
    assert.equal(fakeLocalStorage.getItem('show_view_count'), 'false');
    effectiveShow = fakeLocalStorage.getItem('show_view_count') === 'true';
    assert.equal(effectiveShow, false, 'View count should be hidden after toggle');

    // User toggles to unhide view count
    nextVal = !effectiveShow;
    fakeLocalStorage.setItem('show_view_count', String(nextVal));
    assert.equal(fakeLocalStorage.getItem('show_view_count'), 'true');
    effectiveShow = fakeLocalStorage.getItem('show_view_count') === 'true';
    assert.equal(effectiveShow, true, 'View count should be visible after unhide');

    // If site default is configured as false by admin
    fakeLocalStorage.removeItem('show_view_count');
    siteDefaultShowViews = false;
    userPref = fakeLocalStorage.getItem('show_view_count');
    effectiveShow = userPref !== null ? userPref === 'true' : siteDefaultShowViews;
    assert.equal(effectiveShow, false, 'Without preference, follows admin site default false');
  });
});
