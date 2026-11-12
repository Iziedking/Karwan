import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { marketShopCopy } from '../../shared/i18n/messages/marketShop';
import { CATEGORY_IDS } from './marketModel';
import { CATEGORY_ICON, SAMPLE_COUNT, SEED_PHOTOS, cardPicture, samplePhoto, sellerLine } from './listingFacts';

/// View 74: each kind of example offer has a photograph that fits it.
test('an example offer shows the photograph fitted to its kind of work', () => {
  assert.equal(samplePhoto('design', 'lst_1', 'remote', 'brand-design'), '/market-samples/seed-brand-design.jpg');
  assert.equal(samplePhoto(null, 'lst_1', 'goods', 'home-crafts'), '/market-samples/seed-home-crafts.jpg');
  assert.equal(samplePhoto(null, 'lst_1', 'goods', 'unknown-kind'), samplePhoto(null, 'lst_1', 'goods'));
  assert.equal(samplePhoto('design', 'lst_1', 'remote', null), samplePhoto('design', 'lst_1', 'remote'));
});

test('an offer with no photo shows the sample for the work its title names, before its category\'s stock', () => {
  const seed = (kind: string) => `/market-samples/seed-${kind}.jpg`;
  assert.equal(samplePhoto(null, 'lst_1', 'remote', null, 'Professional English to Bengali translation'), seed('translation'));
  assert.equal(samplePhoto(null, 'lst_1', 'remote', null, 'Spanish to German translator'), seed('translation'));
  assert.equal(samplePhoto('tech', 'lst_1', 'goods', null, 'Electronics Parts Supplier'), seed('phones-electronics'));
  assert.equal(samplePhoto('lessons', 'lst_1', 'remote', null, 'A Germany tutor'), seed('tutoring'));
  assert.equal(samplePhoto(null, 'lst_1', 'remote', null, 'Content writer and social media analyst'), seed('copywriting'));
  assert.equal(samplePhoto(null, 'lst_1', 'remote', null, 'I build backend APIs'), seed('web-development'));
  assert.equal(samplePhoto('fashion', 'lst_1', 'in_person', null, 'Tailoring services'), seed('fashion-tailoring'));
  assert.equal(samplePhoto('design', 'lst_1', 'remote', 'brand-design', 'Spanish translation'), seed('brand-design'), 'an example keeps its own kind');
  assert.equal(samplePhoto(null, 'lst_1', 'remote', null, 'I have 100 USDC for sale'), samplePhoto(null, 'lst_1', 'remote'), 'no kind named: the category stock as before');
  assert.equal(samplePhoto('repairs', 'lst_1', 'remote', null, 'Fix my generator'), samplePhoto('repairs', 'lst_1', 'remote'));
});

test('every fitted photograph is a file with a credit, one per kind the seed has', () => {
  const credits = readFileSync('public/market-samples/CREDITS.md', 'utf8');
  const catalog = readFileSync('../backend/src/marketplace/marketSeed/catalog.ts', 'utf8');
  const seeded = [...catalog.matchAll(/^ {4}id: '([a-z0-9-]+)', lane: /gm)].map((m) => m[1]);
  assert.equal(seeded.length, 25);
  assert.deepEqual([...SEED_PHOTOS].sort(), [...seeded].sort());
  for (const id of SEED_PHOTOS) {
    assert.ok(existsSync(`public/market-samples/seed-${id}.jpg`), id);
    assert.ok(credits.includes('`seed-' + id + '.jpg`'), id);
  }
});

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

test('a seller with no name reads as the kind of seller their category makes them', () => {
  assert.equal(sellerLine(null, t, 'design'), 'A designer');
  assert.equal(sellerLine(null, t, 'farm'), 'A farmer');
  assert.equal(sellerLine(null, t, null), 'A Karwan seller');
  assert.equal(sellerLine({ name: null, tag: 'ada', verified: false, rating: { kind: 'new', count: 0 }, country: null }, t, 'design'), '@ada');
  for (const copy of Object.values(marketShopCopy)) {
    for (const id of CATEGORY_IDS) assert.ok(copy.sellerKinds[id], id);
  }
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
