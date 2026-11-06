import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offersThatFit, type FitOffer } from './offersThatFit.js';

const NOW = 1_800_000_000_000;
const BUYER = '0x' + 'b'.repeat(40);

function offer(id: string, title: string, price: number, extra: Partial<FitOffer> = {}): FitOffer {
  return {
    id,
    title,
    description: '',
    askingPriceUsdc: price,
    sellerUser: '0x' + id.padStart(40, '0').slice(-40),
    expiresAt: NOW + 86_400_000,
    ...extra,
  };
}

test('offers whose title the request covers and whose price fits are counted, best first', () => {
  const fit = offersThatFit(
    { brief: 'I need a logo for my bakery, two concepts then the final files', budgetUsdc: 100, buyer: BUYER, now: NOW },
    [
      offer('1', 'Logo design', 120),
      offer('2', 'Bakery logo', 80),
      offer('3', 'Logo', 40),
      offer('4', 'Wedding photography', 50),
    ],
  );
  assert.equal(fit.count, 2);
  assert.deepEqual(fit.offers.map((o) => o.id), ['2', '3']);
});

test('the buyer\'s own offers, private, example, closed and prohibited offers never fit', () => {
  const fit = offersThatFit(
    { brief: 'Logo for a bakery', budgetUsdc: 100, buyer: BUYER, now: NOW },
    [
      offer('1', 'Bakery logo', 50, { sellerUser: BUYER.toUpperCase().replace('0X', '0x') }),
      offer('2', 'Bakery logo', 50, { visibility: 'agents' }),
      offer('3', 'Bakery logo', 50, { seedKey: 'example-1' }),
      offer('4', 'Bakery logo', 50, { cancelledAt: NOW - 1 }),
      offer('5', 'Bakery logo', 50, { expiresAt: NOW - 1 }),
    ],
  );
  assert.equal(fit.count, 0);
  assert.deepEqual(fit.offers, []);
});

test('at most three are named, and words with nothing meaningful find nothing', () => {
  const many = Array.from({ length: 5 }, (_, i) => offer(String(i + 1), 'Bakery logo', 10 + i));
  const fit = offersThatFit({ brief: 'bakery logo', budgetUsdc: 100, buyer: BUYER, now: NOW }, many);
  assert.equal(fit.count, 5);
  assert.equal(fit.offers.length, 3);
  assert.deepEqual(fit.offers.map((o) => o.askingPriceUsdc), [10, 11, 12]);
  assert.equal(offersThatFit({ brief: 'the and for', budgetUsdc: 100, buyer: BUYER, now: NOW }, many).count, 0);
});
