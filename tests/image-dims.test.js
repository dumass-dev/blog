import { test } from 'node:test';
import assert from 'node:assert';
import { readImageDims } from '../server/imageDims.js';

// Minimal headers for each format — the reader only needs the first bytes.
test('PNG', () => {
  const b = Buffer.alloc(32); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(1080, 16); b.writeUInt32BE(2340, 20);
  assert.deepStrictEqual(readImageDims(b), { width: 1080, height: 2340 });
});

test('GIF', () => {
  const b = Buffer.alloc(32); b.write('GIF89a'); b.writeUInt16LE(300, 6); b.writeUInt16LE(200, 8);
  assert.deepStrictEqual(readImageDims(b), { width: 300, height: 200 });
});

function jpeg({ w, h, orientation }) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const tiff = Buffer.alloc(26); tiff.write('MM'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(orientation, 18);
    const payload = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
    const seg = Buffer.alloc(4); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(payload.length + 2, 2);
    parts.push(seg, payload);
  }
  const sof = Buffer.alloc(19); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.alloc(16));
  return Buffer.concat(parts);
}

test('JPEG', () => {
  assert.deepStrictEqual(readImageDims(jpeg({ w: 1080, h: 2340 })), { width: 1080, height: 2340 });
});

test('JPEG stored sideways (EXIF orientation 6) reports the displayed shape', () => {
  assert.deepStrictEqual(readImageDims(jpeg({ w: 2340, h: 1080, orientation: 6 })), { width: 1080, height: 2340 });
});

test('unknown data returns null instead of throwing', () => {
  assert.strictEqual(readImageDims(Buffer.alloc(64)), null);
  assert.strictEqual(readImageDims(null), null);
  assert.strictEqual(readImageDims(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), null);
});
