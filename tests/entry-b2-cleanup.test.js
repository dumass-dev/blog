process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD_HASH = '$2a$10$abcdefghijklmnopqrstuuu'; // dummy hash for tests
process.env.JWT_SECRET = 'test-jwt-secret-key-12345';

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { 
  cleanupOrphanedB2FilesForEntry, 
  getTestDeletedB2Keys, 
  clearTestDeletedB2Keys,
  extractAllB2StorageKeys 
} from '../server/b2.js';

describe('Safe Entry B2 Cleanup & Orphan Verification Suite', () => {

  beforeEach(() => {
    clearTestDeletedB2Keys();
  });

  test('extractAllB2StorageKeys correctly extracts all unique B2 storage keys from text/markdown', () => {
    const text = `
      Cover: https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/photo1.jpg
      Inline: ![Image 2](images/2026/09/photo2.png)
      Video: <video src="https://bucket.s3.region.backblazeb2.com/videos/2026/09/clip.mp4"></video>
      Duplicate: images/2026/09/photo1.jpg
    `;
    const keys = extractAllB2StorageKeys(text);
    assert.deepStrictEqual(keys, [
      'images/2026/09/photo1.jpg',
      'images/2026/09/photo2.png',
      'videos/2026/09/clip.mp4'
    ]);
  });

  test('SCENARIO 1: Shared B2 file (two entries sharing cover_image) — deleting one entry MUST NOT delete B2 file', async () => {
    const sharedKey = 'images/2026/09/shared-photo.jpg';
    const entry1 = { id: 'entry-uuid-1', title: 'Entry One', cover_image: sharedKey, content: 'Some text' };
    const _entry2 = { id: 'entry-uuid-2', title: 'Entry Two', cover_image: sharedKey, content: 'Other text' };

    // Mock Supabase client that returns entry2 when queried for remaining entries
    const mockSupabase = {
      from: (table) => {
        if (table === 'entries') {
          return {
            select: () => ({
              neq: (_col, _id) => ({
                or: (_query) => ({
                  limit: async () => ({ data: [{ id: 'entry-uuid-2' }] }) // entry2 still exists!
                })
              })
            })
          };
        }
        if (table === 'media') {
          return {
            select: () => ({
              or: () => ({
                limit: async () => ({ data: [] })
              })
            })
          };
        }
      }
    };

    await cleanupOrphanedB2FilesForEntry(mockSupabase, entry1);

    const deletedB2Keys = getTestDeletedB2Keys();
    assert.strictEqual(
      deletedB2Keys.includes(sharedKey), 
      false, 
      `Shared B2 file '${sharedKey}' MUST NOT be deleted when another entry still references it`
    );
  });

  test('SCENARIO 2: Unique B2 file (single entry reference) — deleting entry MUST delete orphaned B2 file', async () => {
    const uniqueKey = 'images/2026/09/unique-photo.jpg';
    const uniqueEntry = { id: 'entry-uuid-3', title: 'Unique Entry', cover_image: uniqueKey, content: 'No other post has this image' };

    // Mock Supabase client returning 0 matching rows in entries or media
    const mockSupabase = {
      from: (_table) => {
        return {
          select: () => ({
            neq: () => ({
              or: () => ({
                limit: async () => ({ data: [] }) // No other entry references it
              })
            }),
            or: () => ({
              limit: async () => ({ data: [] }) // No media table row
            })
          })
        };
      }
    };

    await cleanupOrphanedB2FilesForEntry(mockSupabase, uniqueEntry);

    const deletedB2Keys = getTestDeletedB2Keys();
    assert.strictEqual(
      deletedB2Keys.includes(uniqueKey), 
      true, 
      `Unique B2 file '${uniqueKey}' MUST be deleted from B2 when entry is deleted`
    );
  });

  test('SCENARIO 3: Media library item reference — deleting entry MUST NOT delete B2 file if row exists in media table', async () => {
    const mediaKey = 'images/2026/09/library-item.jpg';
    const entryWithMedia = { id: 'entry-uuid-4', title: 'Media Post', cover_image: mediaKey };

    // Mock Supabase client: 0 other entries, but 1 row in media table
    const mockSupabase = {
      from: (table) => {
        if (table === 'entries') {
          return {
            select: () => ({
              neq: () => ({
                or: () => ({
                  limit: async () => ({ data: [] }) // No other entries
                })
              })
            })
          };
        }
        if (table === 'media') {
          return {
            select: () => ({
              or: () => ({
                limit: async () => ({ data: [{ id: 'media-row-1', url: mediaKey }] }) // Media library row exists!
              })
            })
          };
        }
      }
    };

    await cleanupOrphanedB2FilesForEntry(mockSupabase, entryWithMedia);

    const deletedB2Keys = getTestDeletedB2Keys();
    assert.strictEqual(
      deletedB2Keys.includes(mediaKey), 
      false, 
      `B2 file '${mediaKey}' referenced in Media Library MUST NOT be deleted when an entry is deleted`
    );
  });
});
