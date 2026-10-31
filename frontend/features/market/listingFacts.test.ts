import assert from 'node:assert/strict';
import test from 'node:test';
import { marketShopCopy } from '../../shared/i18n/messages/marketShop';
import { CATEGORY_IDS } from './marketModel';
import { CATEGORY_ICON, deliveryLine, samplePhoto, sellerLine } from './listingFacts';

/// What a listing card says under its title (view 44, Figma Listing card).
///
///   npx tsx --test features/market/listingFacts.test.ts

const t = marketShopCopy.en;

test('the delivery line follows the kind of offer', () => {
  assert.equal(deliveryLine('remote', 3, t), 'Delivers in 3 days');
  assert.equal(deliveryLine(undefined, 1, t), 'Delivers in 1 day');
  assert.equal(deliveryLine('goods', 2, t), 'Ships in 2 days');
  assert.equal(deliveryLine('goods', 1, t), 'Ships in 1 day');
  assert.equal(deliveryLine('in_person', 4, t), 'Ready in 4 days');
  assert.equal(deliveryLine('remote', undefined, t), null);
});

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
