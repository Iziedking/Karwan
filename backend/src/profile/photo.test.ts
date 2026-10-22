import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePhoto, photoPath } from './photo.js';

///   npx tsx --test src/profile/photo.test.ts

test('a stored photo decodes to its bytes and type', () => {
  const out = decodePhoto('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(out?.contentType, 'image/png');
  assert.deepEqual([...out!.bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('anything that is not a jpeg, png or webp data URL is refused', () => {
  for (const bad of [undefined, '', 'https://x.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'data:image/png;base64,<script>']) {
    assert.equal(decodePhoto(bad), null, String(bad));
  }
});

test('the link changes when the profile changes', () => {
  assert.equal(photoPath('0xABC', 5), '/api/profile/photo/0xabc?v=5');
  assert.notEqual(photoPath('0xabc', 5), photoPath('0xabc', 6));
});
