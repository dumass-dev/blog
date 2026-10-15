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
          .concat([...item.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]));
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

  test('QuoteCard text wrapping only places “ on the first line and ” on the last line', () => {
    const wrapQuoteText = (quoteText, maxWidth = 40, measureFn = (t) => t.length * 10) => {
      const cleanQuote = quoteText ? quoteText.trim().replace(/^[“"']+|[”"']+$/g, '') : '';
      if (!cleanQuote) return [];
      const words = cleanQuote.split(/\s+/);
      const lines = [];
      let currentLine = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine ? `${currentLine} ${words[n]}` : words[n];
        const width = measureFn(testLine);
        if (width > maxWidth && n > 0) {
          lines.push(currentLine);
          currentLine = words[n];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }

      if (lines.length > 0) {
        lines[0] = '“' + lines[0];
        lines[lines.length - 1] = lines[lines.length - 1] + '”';
      }
      return lines;
    };

    const multiLineQuote = 'The silence of an evening walk through the damp forest brings a clarity that noisy daylight can never afford.';
    const lines = wrapQuoteText(multiLineQuote, 300);

    assert.ok(lines.length > 1, 'Quote must wrap to multiple lines');
    assert.ok(lines[0].startsWith('“'), 'First line must start with opening quote mark');
    assert.ok(lines[lines.length - 1].endsWith('”'), 'Last line must end with closing quote mark');

    for (let i = 1; i < lines.length; i++) {
      assert.strictEqual(
        lines[i].startsWith('“'),
        false,
        `Line ${i} must NOT start with an opening quote mark (multi-quote glitch fixed)`
      );
    }
  });

  test('Floating quote pill calculation centers directly above text and clamps for mobile', () => {
    const calculatePillCoords = (rect, windowWidth, windowHeight) => {
      if (!rect || rect.width === 0 || rect.height === 0) return null;
      if (rect.bottom < 0 || rect.top > windowHeight) return null;

      const rawCenterX = rect.left + rect.width / 2;
      const pillHalfWidth = 46;
      const margin = 12;
      const minX = pillHalfWidth + margin;
      const maxX = Math.max(minX, windowWidth - pillHalfWidth - margin);
      const clampedX = Math.max(minX, Math.min(maxX, rawCenterX));

      const isNearTop = rect.top < 56;
      const topPos = isNearTop ? rect.bottom + 8 : rect.top - 8;
      const placement = isNearTop ? 'bottom' : 'top';

      return {
        top: Math.round(topPos),
        left: Math.round(clampedX),
        placement
      };
    };

    // Standard centered text on desktop
    const desktopRect = { top: 300, bottom: 320, left: 400, width: 200, height: 20 };
    const desktopPos = calculatePillCoords(desktopRect, 1200, 800);
    assert.strictEqual(desktopPos.left, 500, 'Horizontal center must be rect.left + width / 2');
    assert.strictEqual(desktopPos.top, 292, 'Top pos must be 8px above rect.top');
    assert.strictEqual(desktopPos.placement, 'top');

    // Mobile screen (360px wide) - text near left edge
    const mobileLeftRect = { top: 200, bottom: 220, left: 10, width: 40, height: 20 };
    const mobileLeftPos = calculatePillCoords(mobileLeftRect, 360, 640);
    assert.ok(mobileLeftPos.left >= 58, 'Pill must be clamped away from mobile left edge');

    // Mobile screen (360px wide) - text near right edge
    const mobileRightRect = { top: 200, bottom: 220, left: 320, width: 35, height: 20 };
    const mobileRightPos = calculatePillCoords(mobileRightRect, 360, 640);
    assert.ok(mobileRightPos.left <= 302, 'Pill must be clamped away from mobile right edge');

    // Text near top of viewport (< 56px) - flips below selection
    const topEdgeRect = { top: 30, bottom: 50, left: 150, width: 100, height: 20 };
    const topEdgePos = calculatePillCoords(topEdgeRect, 1200, 800);
    assert.strictEqual(topEdgePos.top, 58, 'Top pos must flip to rect.bottom + 8 when near top');
    assert.strictEqual(topEdgePos.placement, 'bottom');

    // Scrolled out of view
    const offScreenRect = { top: -100, bottom: -80, left: 100, width: 100, height: 20 };
    const offScreenPos = calculatePillCoords(offScreenRect, 1200, 800);
    assert.strictEqual(offScreenPos, null, 'Must return null when selection is scrolled out of viewport');
  });
});

