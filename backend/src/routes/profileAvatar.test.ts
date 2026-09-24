import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidProfileImage } from './profileImage.js';
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;

test('profile photo accepts only bounded canonical JPEG data', () => {
  assert.equal(isValidProfileImage(jpeg), true);
  assert.equal(isValidProfileImage(jpeg.replace('jpeg', 'svg+xml')), false);
  assert.equal(isValidProfileImage('data:image/jpeg;base64,AAAA'), false);
  assert.equal(isValidProfileImage(`data:image/jpeg;base64,${'A'.repeat(110_000)}`), false);
});
