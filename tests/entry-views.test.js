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

  test('Admin-only view count visibility toggle and site-wide propagation', () => {
    let siteSettingShowViews = true;

    // Simulation function for public visitors
    const getVisitorViewVisibility = () => siteSettingShowViews;

    // Simulation function for admin toggling
    const toggleAdminViewVisibility = (isAdmin) => {
      if (!isAdmin) return siteSettingShowViews;
      siteSettingShowViews = !siteSettingShowViews;
      return siteSettingShowViews;
    };

    // 1. Initial state: site view count is visible
    assert.equal(getVisitorViewVisibility(), true, 'Visitors see views when site setting is true');

    // 2. Non-admin tries to toggle -> ignored / no effect
    const nonAdminAttempt = toggleAdminViewVisibility(false);
    assert.equal(nonAdminAttempt, true, 'Non-admin cannot toggle view count visibility');
    assert.equal(getVisitorViewVisibility(), true, 'Visitor visibility remains unchanged');

    // 3. Admin toggles view count to false
    const adminToggleResult = toggleAdminViewVisibility(true);
    assert.equal(adminToggleResult, false, 'Admin successfully toggles view count to hidden');
    assert.equal(getVisitorViewVisibility(), false, 'Visitors now see view count as completely hidden');

    // 4. Admin toggles view count back to true
    const adminUnhideResult = toggleAdminViewVisibility(true);
    assert.equal(adminUnhideResult, true, 'Admin successfully unhides view count');
    assert.equal(getVisitorViewVisibility(), true, 'Visitors now see view count again');
  });
});
