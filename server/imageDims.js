// Read an image's pixel size from the first bytes of the file (PNG, JPEG,
// GIF, WebP, BMP). Used so entry images can reserve their real shape before
// the full file arrives. Returns { width, height } or null.
export function readImageDims(buf) {
  if (!buf || buf.length < 24) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);

  // PNG: IHDR right after the 8-byte signature
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return ok(b.readUInt32BE(16), b.readUInt32BE(20));
  }

  // GIF
  if (b.toString('ascii', 0, 3) === 'GIF') {
    return ok(b.readUInt16LE(6), b.readUInt16LE(8));
  }

  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) {
    return ok(b.readInt32LE(18), Math.abs(b.readInt32LE(22)));
  }

  // WebP
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' && b.length >= 30) {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return ok(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return ok(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff));
    }
    if (chunk === 'VP8 ') return ok(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
    return null;
  }

  // JPEG: walk segments to the first SOFn; honour EXIF orientation 5-8
  // (phone photos stored sideways), which browsers apply when displaying.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    let orientation = 1;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (marker === 0xe1 && b.toString('ascii', i + 4, i + 8) === 'Exif') {
        const o = exifOrientation(b, i + 10, Math.min(b.length, i + 2 + len));
        if (o) orientation = o;
      }
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        const h = b.readUInt16BE(i + 5);
        const w = b.readUInt16BE(i + 7);
        return orientation >= 5 && orientation <= 8 ? ok(h, w) : ok(w, h);
      }
      i += 2 + len;
    }
  }
  return null;
}

function exifOrientation(b, tiff, end) {
  try {
    if (tiff + 8 > end) return 0;
    const le = b.toString('ascii', tiff, tiff + 2) === 'II';
    const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
    const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    const ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > end) return 0;
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > end) break;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
  } catch { /* malformed EXIF: ignore */ }
  return 0;
}

function ok(width, height) {
  return width > 0 && height > 0 && width < 100000 && height < 100000 ? { width, height } : null;
}
