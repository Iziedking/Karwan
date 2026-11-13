import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CATEGORY_IDS, categoryOf, inferCategory } from './categories.js';

test('words place an offer in its category', () => {
  assert.equal(inferCategory('Logo and brand kit for a small business'), 'design');
  assert.equal(inferCategory('iPhone 13, 128 GB, clean, with charger'), 'phones');
  assert.equal(inferCategory('Ankara wax print, 6 yards'), 'fashion');
  assert.equal(inferCategory('Landing page with a contact form'), 'tech');
  assert.equal(inferCategory('Bag of parboiled rice, 25 kg'), 'farm');
  assert.equal(inferCategory('Maths lessons for a JSS3 student, 4 weeks'), 'lessons');
  assert.equal(inferCategory('Fridge, 2 doors, used 1 year'), 'home');
  assert.equal(inferCategory('Product photos for your shop, 20 shots'), 'design');
  assert.equal(inferCategory('Project Manager'), null);
});

test('a word counts only whole, so "app" is not found in "happy"', () => {
  assert.equal(inferCategory('A happy birthday cake'), 'food');
  assert.equal(inferCategory('happy'), null);
});

test("the seller's pick wins over the words", () => {
  assert.equal(categoryOf({ category: 'repairs', title: 'iPhone screen', description: 'Replace a cracked screen' }), 'repairs');
  assert.equal(categoryOf({ title: 'iPhone 12', description: 'Used, works well' }), 'phones');
});

/// Owner, 13 Nov 2026: "find what doesn't rhyme". A word in the description
/// put a leather notebook in Phones, an audit's "fix list" in Repairs and a
/// serving tray's "food-safe" finish in Food.
test('the title places an offer before its description does', () => {
  assert.equal(categoryOf({ title: 'Carved wooden serving tray', description: 'Carved from mahogany with a food-safe finish.' }), 'home');
  assert.equal(categoryOf({ title: 'Carpentry and wood construction', description: 'Professional carpentry and wood construction services.' }), 'home');
  assert.equal(categoryOf({ title: 'Wedding cake', description: 'Three tiers, delivered to your venue in Lagos' }), 'food');
  assert.equal(categoryOf({ title: 'Used, works well', description: 'iPhone 12, 128 GB' }), 'phones', 'a title with no category word leaves it to the description');
});

test('loose words no longer misplace an offer', () => {
  assert.equal(categoryOf({ title: 'Leather notebook', description: 'A hand-stitched leather notebook with refillable pages.' }), null);
  assert.equal(categoryOf({ title: 'Social media audit', description: 'A review of your profiles and last 30 posts with a prioritised fix list.' }), null);
  assert.equal(categoryOf({ title: 'Proofreading and editing', description: 'A line edit and proofread of up to 3,000 words.' }), null);
  assert.equal(inferCategory('Video editing for your YouTube channel'), 'design');
  assert.equal(inferCategory('AC repair and servicing'), 'repairs');
});

test('the frontend lists the same categories, in the same order', () => {
  const source = readFileSync(new URL('../../../frontend/features/market/marketModel.ts', import.meta.url), 'utf8');
  const list = /export const CATEGORY_IDS = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
  assert.deepEqual([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]), [...CATEGORY_IDS]);
});

test('laptops and computers are in Phones and laptops, never Tech (Telegram, 7 Nov)', () => {
  assert.equal(inferCategory('HP Envy Core i5 Laptop, 32 GB RAM'), 'phones');
  assert.equal(inferCategory('MacBook Air M2, like new'), 'phones');
  assert.equal(inferCategory('I build websites for small shops'), 'tech');
});

test('electronics and parts sit in Phones and electronics, never Tech (7 Nov)', () => {
  assert.equal(inferCategory('Electronics Parts Supplier. Quality electronics parts, wide range of components'), 'phones');
});
