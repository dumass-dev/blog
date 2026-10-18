import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';

function processEmbedsForTest(rawText) {
  let processed = rawText ? String(rawText).replace(/\\n/g, '\n') : '';

  // Handle [grid] shortcode
  processed = processed.replace(/\[grid\]([\s\S]*?)\[\/grid\]/gi, (_match, innerText) => {
    return `\n<div class="media-grid">\n\n${innerText}\n\n</div>\n`;
  });

  // Handle [wrap:left (width)] / [wrap:right (width)] / [wrap:center (width)] shortcode
  const wrapRegex = /\[wrap:(left|right|center)(?:\s+([\d]+(?:%|px|rem)))?\]([\s\S]*?)\[\/wrap\]/gi;
  processed = processed.replace(wrapRegex, (_match, align, rawWidth, innerText) => {
    const normAlign = align.toLowerCase();
    let customStyle = '';
    if (rawWidth) {
      customStyle = `max-width: ${rawWidth}; width: 100%;`;
    }
    const styleAttr = customStyle ? ` style="${customStyle}"` : '';
    return `\n<div class="editorial-wrap editorial-wrap-${normAlign}"${styleAttr}>\n\n${innerText.trim()}\n\n</div>\n`;
  });

  // Handle [clear] or [break] shortcodes
  processed = processed.replace(/\[(?:clear|break)\]/gi, '\n<div class="editorial-clear"></div>\n');

  return processed;
}

test('RichViewer: [wrap:left 40%] converts to editorial-wrap-left container with custom max-width', () => {
  const markdown = `[wrap:left 40%]\n![Mountain Sunset](https://example.com/sunset.jpg)\n[/wrap]\n\nThis is paragraph text that wraps around the left float.`;
  const processed = processEmbedsForTest(markdown);

  assert.ok(processed.includes('editorial-wrap editorial-wrap-left'));
  assert.ok(processed.includes('max-width: 40%'));

  const parsed = marked.parse(processed);
  assert.ok(parsed.includes('class="editorial-wrap editorial-wrap-left"'));
  assert.ok(parsed.includes('style="max-width: 40%; width: 100%;"'));
  assert.ok(parsed.includes('<img src="https://example.com/sunset.jpg" alt="Mountain Sunset">'));
  assert.ok(parsed.includes('<p>This is paragraph text that wraps around the left float.</p>'));
});

test('RichViewer: [wrap:right] without width applies default styling without crashing', () => {
  const markdown = `[wrap:right]\n![Right Image](https://example.com/right.jpg)\n[/wrap]\n\nParagraph text on the left.`;
  const processed = processEmbedsForTest(markdown);

  assert.ok(processed.includes('editorial-wrap editorial-wrap-right'));
  assert.ok(!processed.includes('style='));

  const parsed = marked.parse(processed);
  assert.ok(parsed.includes('class="editorial-wrap editorial-wrap-right"'));
});

test('RichViewer: [clear] shortcode renders an editorial-clear break', () => {
  const markdown = `Some text\n\n[clear]\n\nSubsequent text`;
  const processed = processEmbedsForTest(markdown);

  assert.ok(processed.includes('<div class="editorial-clear"></div>'));
});

test('Realtime draft event resolution: unwrap nested payload and match post', () => {
  const currentPost = { id: 'uuid-123', slug: 'my-first-post' };

  // Simulated Supabase broadcast / SSE payload
  const events = [
    { type: 'entry_updated', id: 'uuid-123', slug: 'my-first-post', status: 'draft' },
    { type: 'entry', data: { id: 'uuid-123', slug: 'my-first-post', status: 'draft' } },
    { event: 'sync', payload: { id: 'uuid-123', slug: 'my-first-post', status: 'draft' } },
    { type: 'entry', op: 'UPDATE', id: 'uuid-123', slug: 'my-first-post', status: 'draft' }
  ];

  for (const detail of events) {
    const p = (detail.payload && typeof detail.payload === 'object') ? detail.payload : (detail.data || detail);
    const targetId = p.id || detail.id || detail.data?.id;
    const targetSlug = p.slug || detail.slug || detail.data?.slug;
    const targetStatus = p.status || detail.status || detail.data?.status || p.data?.status;

    const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : String(s || ''));
    const isCurrentPost = Boolean(
      (targetId && (norm(targetId) === norm(currentPost.id) || norm(targetId) === norm(currentPost.slug))) ||
      (targetSlug && (norm(targetSlug) === norm(currentPost.slug) || norm(targetSlug) === norm(currentPost.slug)))
    );

    assert.equal(isCurrentPost, true, 'Should match current post identifier');
    assert.equal(targetStatus, 'draft', 'Should recognize status as draft');
  }
});
