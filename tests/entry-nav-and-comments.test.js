process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { cacheEntry, getCachedEntry } from '../src/supabase.js';
import { resolveEntryDetailState } from '../src/utils/entry.js';

describe('Fix 1: Entry Detail Content Loading & Navigation Logic', () => {
  test('resolveEntryDetailState sets loading=true and data=null when cached entry lacks body content', () => {
    const feedEntryWithoutContent = {
      id: 'uuid-101',
      slug: 'post-without-content',
      title: 'Post Without Content',
      excerpt: 'Summary excerpt'
      // content is undefined (feed cache item)
    };

    cacheEntry(feedEntryWithoutContent);
    const cached = getCachedEntry('post-without-content');

    const state = resolveEntryDetailState('post-without-content', cached);

    assert.strictEqual(
      state.loading,
      true,
      'When cached entry lacks content, state.loading MUST be true so content fetch runs'
    );
    assert.strictEqual(
      state.data,
      null,
      'When cached entry lacks content, state.data MUST be null so blank body is not shown'
    );
  });

  test('resolveEntryDetailState populates data and sets loading=false ONLY when cached entry has full body content', () => {
    const fullEntry = {
      id: 'uuid-102',
      slug: 'full-post',
      title: 'Full Post',
      content: 'This is the complete body content of the entry.'
    };

    cacheEntry(fullEntry);
    const cached = getCachedEntry('full-post');

    const state = resolveEntryDetailState('full-post', cached);

    assert.strictEqual(state.loading, false);
    assert.notStrictEqual(state.data, null);
    assert.strictEqual(state.data.entry.content, 'This is the complete body content of the entry.');
  });
});
