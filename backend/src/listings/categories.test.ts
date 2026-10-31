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

test('the frontend lists the same categories, in the same order', () => {
  const source = readFileSync(new URL('../../../frontend/features/market/marketModel.ts', import.meta.url), 'utf8');
  const list = /export const CATEGORY_IDS = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
  assert.deepEqual([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]), [...CATEGORY_IDS]);
});
