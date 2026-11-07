import assert from 'node:assert/strict';
import test from 'node:test';
import { pictureNote, pictureTooLarge } from './updatePicture';

test('a picture over 4 MB is stopped before it is sent', () => {
  assert.equal(pictureTooLarge(4_000_000), null);
  assert.match(pictureTooLarge(4_000_001) ?? '', /under 4 MB/);
});

test('a 16:9 picture fits the tile, any other shape is trimmed', () => {
  assert.deepEqual(pictureNote(1600, 900), { fits: true, text: 'Uploaded, 1600x900. Fits the tile.' });
  assert.equal(pictureNote(1920, 1080).fits, true);
  const square = pictureNote(1000, 1000);
  assert.equal(square.fits, false);
  assert.equal(square.text, 'Uploaded, 1000x1000. Not 16:9, so the tile trims it. Check the preview, or ask for 1600x900.');
});
