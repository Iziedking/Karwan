import assert from 'node:assert/strict';
import test from 'node:test';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { MAX_OFFER_PHOTOS, photoSrc, room } from './photos';

test('an offer takes four photos; extra picks are dropped, never an error', () => {
  assert.equal(MAX_OFFER_PHOTOS, 4);
  assert.equal(room(0, 6), 4);
  assert.equal(room(3, 2), 1);
  assert.equal(room(4, 1), 0);
});

test('photo links from the API point at the backend; a picked photo stays as it is', () => {
  assert.match(photoSrc('/api/listings/lst_a/photos/0?v=1'), /^https?:\/\/[^/]+\/api\/listings\/lst_a\/photos\/0\?v=1$/);
  assert.equal(photoSrc('data:image/jpeg;base64,AA=='), 'data:image/jpeg;base64,AA==');
});

test('the photo wording is plain in every language: no em dashes, nothing left blank', () => {
  for (const [locale, copy] of Object.entries(offerPhotosCopy)) {
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim().length > 0, `${locale}.${key}`);
      assert.doesNotMatch(value, /—/, `${locale}.${key}`);
    }
    assert.match(copy.removeTemplate, /\{n\}/);
    assert.match(copy.altTemplate, /\{n\}/);
  }
});
