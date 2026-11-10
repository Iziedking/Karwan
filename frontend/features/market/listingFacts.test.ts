import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { marketShopCopy } from '../../shared/i18n/messages/marketShop';
import { CATEGORY_IDS } from './marketModel';
import { CATEGORY_ICON, SAMPLE_COUNT, cardPicture, samplePhoto, sellerLine } from './listingFacts';

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
    assert.match(samplePhoto(id, 'lst_1'), new RegExp(`^/market-samples/${id}-[1-4]\\.jpg$`));
  }
  assert.match(samplePhoto(null, 'lst_1', 'goods'), /^\/market-samples\/goods-[1-3]\.jpg$/);
  assert.match(samplePhoto(null, 'lst_1', 'remote'), /^\/market-samples\/services-[1-4]\.jpg$/);
  assert.match(samplePhoto(null), /^\/market-samples\/services-[1-4]\.jpg$/);
});

test('a listing keeps its sample photo, and a category spreads across its photos', () => {
  assert.equal(samplePhoto('fashion', 'lst_abc'), samplePhoto('fashion', 'lst_abc'));
  const seen = new Set(Array.from({ length: 40 }, (_, i) => samplePhoto('fashion', `lst_${i}`)));
  assert.equal(seen.size, SAMPLE_COUNT.fashion);
});

test('every sample photo the picker can return is a file', () => {
  for (const [group, count] of Object.entries(SAMPLE_COUNT)) {
    for (let n = 1; n <= count; n++) {
      const file = `public/market-samples/${group}-${n}.jpg`;
      assert.ok(existsSync(file), file);
    }
  }
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
