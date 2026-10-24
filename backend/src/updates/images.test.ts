import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkUpdateImage, decodeUpdateImage, imageSize, updateImageStore } from './images.js';

/// Just enough of each format for the type and the size to be read.
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00,
  ]);
}
function webpX(width: number, height: number): Uint8Array {
  const b = new Uint8Array(34);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return b;
}
function webpLossy(width: number, height: number): Uint8Array {
  const b = new Uint8Array(34);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBPVP8 '].map((c) => c.charCodeAt(0)), 8);
  b.set([0x9d, 0x01, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8], 23);
  return b;
}
function webpLossless(width: number, height: number): Uint8Array {
  const b = new Uint8Array(34);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBPVP8L'].map((c) => c.charCodeAt(0)), 8);
  const w = width - 1;
  const h = height - 1;
  b.set([0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x3) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f], 20);
  return b;
}

test('the size is read from every format a designer exports', () => {
  assert.deepEqual(imageSize(png(1600, 900), 'image/png'), { width: 1600, height: 900 });
  assert.deepEqual(imageSize(jpeg(3200, 1800), 'image/jpeg'), { width: 3200, height: 1800 });
  assert.deepEqual(imageSize(webpX(1600, 900), 'image/webp'), { width: 1600, height: 900 });
  assert.deepEqual(imageSize(webpLossy(1600, 900), 'image/webp'), { width: 1600, height: 900 });
  assert.deepEqual(imageSize(webpLossless(1600, 900), 'image/webp'), { width: 1600, height: 900 });
});

test('a picture too small, too large or not a picture is refused with the reason', () => {
  assert.match((checkUpdateImage(png(800, 450)) as { error: string }).error, /800x450.*960x540/);
  assert.match((checkUpdateImage(new Uint8Array(4_000_001)) as { error: string }).error, /under 4 MB/);
  assert.match((checkUpdateImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')) as { error: string }).error, /JPEG, PNG or WebP/);
  assert.match((decodeUpdateImage('data:image/svg+xml;base64,PHN2Zy8+') as { error: string }).error, /JPEG, PNG or WebP/);
});

test('a good picture is kept once, under a name made from its content', () => {
  const root = mkdtempSync(join(tmpdir(), 'update-images-'));
  try {
    const store = updateImageStore(root);
    const image = decodeUpdateImage(`data:image/png;base64,${Buffer.from(png(1600, 900)).toString('base64')}`);
    assert.ok(!('error' in image));
    const path = store.save(image);
    assert.match(path, /^\/api\/updates\/images\/[a-f0-9]{24}\.png$/);
    assert.equal(store.save(image), path);
    const read = store.read(path.split('/').pop()!);
    assert.equal(read?.contentType, 'image/png');
    assert.deepEqual(read?.bytes, png(1600, 900));
    assert.equal(store.read('../secrets.png'), null);
    assert.equal(store.read('0123456789abcdef01234567.gif'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
