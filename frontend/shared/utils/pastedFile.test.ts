import assert from 'node:assert/strict';
import test from 'node:test';
import { pastedFile } from './pastedFile.js';

const IMAGES = ['image/png', 'image/jpeg', 'image/webp'];
const clip = (types: string[], files: string[]) => ({ types, files: files.map((type) => ({ type })) });

test('a pasted screenshot becomes the attachment', () => {
  assert.equal(pastedFile(clip(['Files'], ['image/png']), IMAGES), 0);
});

test('the first accepted file is taken, others are skipped', () => {
  assert.equal(pastedFile(clip(['Files'], ['application/zip', 'image/jpeg']), IMAGES), 1);
  assert.equal(pastedFile(clip(['Files'], ['application/zip']), IMAGES), null);
});

test('a paste that carries text pastes as text', () => {
  assert.equal(pastedFile(clip(['text/plain', 'text/html', 'Files'], ['image/png']), IMAGES), null);
});

test('a drop takes the file even beside text', () => {
  assert.equal(pastedFile(clip(['text/plain', 'Files'], ['image/png']), IMAGES, { preferText: false }), 0);
  assert.equal(pastedFile(null, IMAGES), null);
});
