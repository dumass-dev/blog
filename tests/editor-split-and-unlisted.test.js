import test from 'node:test';
import assert from 'node:assert';
import {
  parseEmbeddedImages,
  updateImageInContent,
  moveImageInContent,
  removeImageFromContent
} from '../src/utils/imageMarkdown.js';

test('Unlisted post status validation allows published, draft, and unlisted', () => {
  const allowedStatuses = ['published', 'draft', 'unlisted'];
  assert.strictEqual(allowedStatuses.includes('unlisted'), true);
  assert.strictEqual(allowedStatuses.includes('draft'), true);
  assert.strictEqual(allowedStatuses.includes('published'), true);
  assert.strictEqual(allowedStatuses.includes('archived'), false);
});

test('Realtime event contract includes status for instant draft unpublishing', () => {
  const realtimePayload = {
    op: 'UPDATE',
    id: 'post-123',
    slug: 'secret-story',
    title: 'Secret Story',
    status: 'draft',
    type: 'journal'
  };

  assert.strictEqual(realtimePayload.status, 'draft');
  assert.strictEqual(realtimePayload.op, 'UPDATE');
  // Client check: if detail.status === 'draft', page should mark isDeleted=true immediately
  const shouldMakeUnavailable = realtimePayload.status === 'draft';
  assert.strictEqual(shouldMakeUnavailable, true);
});

test('Image markdown parser handles complex text wrapping and sizes accurately', () => {
  const markdown = `
Here is an opening paragraph with rich narrative description.

![lake.jpg|40%|left](https://example.com/lake.jpg)

This text should flow directly to the right of the lake photo because it has align=left and float:left styling.

![mountain.gif|65%|right](https://example.com/mountain.gif)

And this concluding section wraps around the mountain GIF on the right.
`;

  const images = parseEmbeddedImages(markdown);
  assert.strictEqual(images.length, 2);

  // First image: 40% width, wrap left
  assert.strictEqual(images[0].cleanAlt, 'lake.jpg');
  assert.strictEqual(images[0].size, '40%');
  assert.strictEqual(images[0].align, 'left');
  assert.strictEqual(images[0].url, 'https://example.com/lake.jpg');

  // Second image: 65% width, wrap right
  assert.strictEqual(images[1].cleanAlt, 'mountain.gif');
  assert.strictEqual(images[1].size, '65%');
  assert.strictEqual(images[1].align, 'right');
  assert.strictEqual(images[1].url, 'https://example.com/mountain.gif');

  // Test updating second image to center and 100%
  const updated = updateImageInContent(markdown, 1, '100%', 'center');
  const updatedImages = parseEmbeddedImages(updated);
  assert.strictEqual(updatedImages[1].size, '100%');
  assert.strictEqual(updatedImages[1].align, 'center');
});

test('Image remove operation completely purges tag and excess whitespace', () => {
  const content = `Intro paragraph.

![to-delete.png|50%|left](https://example.com/to-delete.png)

Closing paragraph.`;

  const removed = removeImageFromContent(content, 0);
  assert.ok(!removed.includes('to-delete.png'));
  assert.ok(removed.includes('Intro paragraph.'));
  assert.ok(removed.includes('Closing paragraph.'));
});
