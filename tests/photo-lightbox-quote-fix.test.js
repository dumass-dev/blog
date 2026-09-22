process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { shouldShowCommentsAndReactions } from '../src/utils/entry.js';

describe('Photo Lightbox & Quote Card Cover Fix Tests', () => {
  test('shouldShowCommentsAndReactions returns false for photo posts', () => {
    const photoPostCategory = { id: 'p1', type: 'journal', category: 'Photos' };
    const photoPostType = { id: 'p2', type: 'photo', category: '' };

    assert.strictEqual(
      shouldShowCommentsAndReactions(photoPostCategory),
      false,
      'Photo posts by category must hide comments and reactions'
    );
    assert.strictEqual(
      shouldShowCommentsAndReactions(photoPostType),
      false,
      'Photo posts by type must hide comments and reactions'
    );
  });

  test('getPhotoSrc helper ignores q04ti-quote graphics and returns the actual uploaded photo', () => {
    // Replica of getPhotoSrc helper used in Photos.jsx & Home.jsx
    const getPhotoSrc = (item) => {
      if (!item) return null;
      let src = item.cover_image && item.cover_image.trim();
      if (src && /q04ti-quote|quote-/i.test(src)) {
        src = null;
      }
      if (!src && item.content) {
        const matches = [...item.content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
          .concat([...item.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]));
        src = matches.find(url => !/q04ti-quote|quote-/i.test(url)) || matches[0] || null;
      }
      return src;
    };

    const photoEntryWithQuoteCardCover = {
      title: 'Photo — 9/22/2026',
      cover_image: 'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/q04ti-quote-1789756590261.png',
      content: '![q04ti-quote](https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/q04ti-quote-1789756590261.png)\n![real-photo](https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/my-real-photo.jpg)'
    };

    const photoSrc = getPhotoSrc(photoEntryWithQuoteCardCover);
    assert.strictEqual(
      photoSrc,
      'https://q04ti-blog.s3.us-east-005.backblazeb2.com/images/2026/09/my-real-photo.jpg',
      'getPhotoSrc must ignore quote-card images and extract the real photo'
    );
  });
});
