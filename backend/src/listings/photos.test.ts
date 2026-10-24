import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_OFFER_PHOTOS, decodePhotoDataUrl, isOfferPhotoCaption, photoStore, photoUrls, sniffPhoto } from './photos.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

test('a photo is known by its bytes, not by the type it claims', () => {
  assert.equal(sniffPhoto(JPEG), 'image/jpeg');
  assert.equal(sniffPhoto(PNG), 'image/png');
  assert.equal(sniffPhoto(WEBP), 'image/webp');
  assert.equal(sniffPhoto(new TextEncoder().encode('<svg onload=alert(1)>')), null);
  const lying = decodePhotoDataUrl(dataUrl('image/png', JPEG));
  assert.ok('bytes' in lying && lying.contentType === 'image/jpeg');
  assert.ok('error' in decodePhotoDataUrl(dataUrl('image/png', new TextEncoder().encode('not an image'))));
  assert.ok('error' in decodePhotoDataUrl('data:image/svg+xml;base64,PHN2Zz4='));
  assert.ok('error' in decodePhotoDataUrl('https://example.com/a.jpg'));
});

test('a photo over the size limit is refused with a plain reason', () => {
  const big = new Uint8Array(1_600_000);
  big.set(JPEG);
  const out = decodePhotoDataUrl(dataUrl('image/jpeg', big));
  assert.ok('error' in out);
  assert.match(out.error, /too large/i);
});

test('an offer keeps at most four photos, saved, read back and cleared', () => {
  const store = photoStore(mkdtempSync(join(tmpdir(), 'karwan-photos-')));
  const saved = store.save('lst_a', [JPEG, PNG, WEBP, JPEG].map((bytes) => ({ bytes, contentType: sniffPhoto(bytes)! })), 1000);
  assert.equal(saved.length, 4);
  assert.deepEqual(saved.map((p) => p.contentType), ['image/jpeg', 'image/png', 'image/webp', 'image/jpeg']);
  assert.deepEqual([...store.read('lst_a', 1)!.bytes], [...PNG]);
  assert.equal(store.read('lst_a', 4), null);
  assert.throws(() => store.save('lst_b', Array.from({ length: MAX_OFFER_PHOTOS + 1 }, () => ({ bytes: JPEG, contentType: 'image/jpeg' as const })), 1));
  // Saving again replaces the set; clearing removes it.
  store.save('lst_a', [{ bytes: PNG, contentType: 'image/png' }], 2000);
  assert.equal(store.read('lst_a', 1), null);
  store.clear('lst_a');
  assert.equal(store.read('lst_a', 0), null);
  // An id that tries to leave the folder never touches the disk.
  assert.equal(store.read('../../etc', 0), null);
});

test('photos sent in chat are held for the next offer for an hour, four at most', () => {
  const store = photoStore(mkdtempSync(join(tmpdir(), 'karwan-held-')));
  const me = '0x00000000000000000000000000000000000000aa';
  for (let i = 1; i <= MAX_OFFER_PHOTOS; i++) assert.deepEqual(store.hold(me, { bytes: JPEG, contentType: 'image/jpeg' }, 1000 + i), { held: i });
  assert.ok('error' in store.hold(me, { bytes: JPEG, contentType: 'image/jpeg' }, 2000));
  assert.equal(store.heldCount(me, 2000), 4);
  // Another account sees none of them.
  assert.equal(store.heldCount('0x00000000000000000000000000000000000000bb', 2000), 0);
  // After an hour they are gone.
  assert.equal(store.heldCount(me, 1000 + 61 * 60_000), 0);
  store.hold(me, { bytes: PNG, contentType: 'image/png' }, 5_000_000);
  const taken = store.takeHeld(me, 5_000_001);
  assert.equal(taken.length, 1);
  assert.equal(taken[0]!.contentType, 'image/png');
  assert.equal(store.heldCount(me, 5_000_002), 0);
});

test('links to the photos change when the photos do, so an old one is never served from cache', () => {
  assert.deepEqual(photoUrls({ id: 'lst_a', photos: [{ contentType: 'image/jpeg', size: 10, at: 7 }, { contentType: 'image/png', size: 9, at: 7 }] }), [
    '/api/listings/lst_a/photos/0?v=7',
    '/api/listings/lst_a/photos/1?v=7',
  ]);
  assert.deepEqual(photoUrls({ id: 'lst_b' }), []);
});

test('a chat photo goes to the offer only when its caption says so', () => {
  for (const caption of ['for my offer', 'photo for the listing', 'Add this to my offer', 'selling this wig', 'put it on my listing']) {
    assert.equal(isOfferPhotoCaption(caption), true, caption);
  }
  for (const caption of [undefined, '', 'invoice for march', 'here is the receipt', 'what is this?']) {
    assert.equal(isOfferPhotoCaption(caption), false, String(caption));
  }
});
