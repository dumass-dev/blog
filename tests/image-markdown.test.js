import test from 'node:test';
import assert from 'node:assert';
import {
  parseEmbeddedImages,
  updateImageInContent,
  moveImageInContent,
  removeImageFromContent
} from '../src/utils/imageMarkdown.js';

test('parseEmbeddedImages correctly extracts all images, sizes, and alignments', () => {
  const content = `
# Header
Paragraph one.

![forest.jpg|50%|left](https://example.com/forest.jpg)

Middle paragraph text.

![city.gif|320px|right](https://example.com/city.gif)

End paragraph.
`;

  const images = parseEmbeddedImages(content);
  assert.strictEqual(images.length, 2);

  assert.strictEqual(images[0].cleanAlt, 'forest.jpg');
  assert.strictEqual(images[0].size, '50%');
  assert.strictEqual(images[0].align, 'left');
  assert.strictEqual(images[0].url, 'https://example.com/forest.jpg');

  assert.strictEqual(images[1].cleanAlt, 'city.gif');
  assert.strictEqual(images[1].size, '320px');
  assert.strictEqual(images[1].align, 'right');
  assert.strictEqual(images[1].url, 'https://example.com/city.gif');
});

test('updateImageInContent updates size and alignment in place', () => {
  const content = `
Intro text.

![photo.jpg|100%](https://example.com/photo.jpg)

Outro text.
`;

  const updated = updateImageInContent(content, 0, '40%', 'left');
  assert.ok(updated.includes('![photo.jpg|40%|left](https://example.com/photo.jpg)'));
  assert.ok(!updated.includes('![photo.jpg|100%]'));
});

test('moveImageInContent moves image up and down across paragraph blocks', () => {
  const content = `Paragraph 1

![photo.jpg](https://example.com/photo.jpg)

Paragraph 2`;

  // Move up should swap with Paragraph 1
  const movedUp = moveImageInContent(content, 0, 'up');
  const imagesAfterUp = parseEmbeddedImages(movedUp);
  assert.strictEqual(imagesAfterUp.length, 1);
  assert.ok(movedUp.startsWith('![photo.jpg](https://example.com/photo.jpg)\n\nParagraph 1'));

  // Move down from movedUp should swap back after Paragraph 1
  const movedDown = moveImageInContent(movedUp, 0, 'down');
  assert.ok(movedDown.startsWith('Paragraph 1\n\n![photo.jpg](https://example.com/photo.jpg)'));
});

test('removeImageFromContent cleanly removes target image', () => {
  const content = `Paragraph 1

![photo.jpg](https://example.com/photo.jpg)

Paragraph 2`;

  const removed = removeImageFromContent(content, 0);
  assert.strictEqual(removed, 'Paragraph 1\n\nParagraph 2');
});
