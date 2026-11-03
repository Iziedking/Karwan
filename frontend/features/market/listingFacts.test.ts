import assert from 'node:assert/strict';
import test from 'node:test';
import { marketShopCopy } from '../../shared/i18n/messages/marketShop';
import { CATEGORY_IDS } from './marketModel';
import { CATEGORY_ICON, cardPicture, samplePhoto, sellerLine } from './listingFacts';

/// What a listing card says under its title (view 44, Figma Listing card).
///
///   npx tsx --test features/market/listingFacts.test.ts

const t = marketShopCopy.en;

test('a seller is a name, then a tag, never an address', () => {
  const rating = { kind: 'new', count: 0 } as const;
  assert.equal(sellerLine({ name: 'Ada Obi', tag: 'ada', verified: true, rating, country: 'NG' }, t), 'Ada Obi');
  assert.equal(sellerLine({ name: null, tag: 'ada', verified: false, rating, country: null }, t), '@ada');
  assert.equal(sellerLine(null, t), 'A Karwan seller');
});

test('every category has an icon and a sample photo, and so does an offer with none', () => {
  for (const id of CATEGORY_IDS) {
    assert.ok(CATEGORY_ICON[id], id);
    assert.match(samplePhoto(id), /^\/market-samples\/[a-z]+\.jpg$/);
  }
  assert.equal(samplePhoto(null), '/market-samples/default.jpg');
  // Each category shows its own photo, Food included.
  assert.equal(new Set(CATEGORY_IDS.map(samplePhoto)).size, CATEGORY_IDS.length);
});

/// Owner notes, 3 Nov 2026: a sample shows only when the seller added no photo.
test("a card shows the seller's own photo, and the sample only when there is none", () => {
  const none = { own: null, sample: false };
  assert.equal(cardPicture('/p/1.jpg', none), 'own');
  assert.equal(cardPicture(undefined, none), 'sample');
  assert.equal(cardPicture('/p/1.jpg', { own: '/p/1.jpg', sample: false }), 'sample');
  // A new photo after an old one failed is tried, never left on the sample.
  assert.equal(cardPicture('/p/2.jpg', { own: '/p/1.jpg', sample: false }), 'own');
  assert.equal(cardPicture(null, { own: null, sample: true }), 'tile');
});
