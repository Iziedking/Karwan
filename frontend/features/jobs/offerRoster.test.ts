import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { BuyerBid } from '@/core/api';
import { fitLevel, offersPage, priceRange, rankOffers } from './offerRoster';

const bid = (seller: string, priceUsdc: string, topicalMatch: number | null, score: number | null = null): BuyerBid => ({
  seller, priceUsdc, topicalMatch, score, deadlineUnix: 0, suggestedCounterPrice: null, suggestedCounterDeadlineDays: null,
  sellerTier: null, sellerUserAddress: null, sellerDisplayName: null,
});

test('fit reads as a word, never a number out of 100', () => {
  assert.equal(fitLevel(92), 'strong');
  assert.equal(fitLevel(75), 'strong');
  assert.equal(fitLevel(74), 'good');
  assert.equal(fitLevel(50), 'good');
  assert.equal(fitLevel(12), 'partial');
  assert.equal(fitLevel(null), null);
});

test('offers rank like the agent: fit band first, then score, then the lower price', () => {
  const ranked = rankOffers([bid('a', '300', 60, 90), bid('b', '280', 80, 40), bid('c', '240', 55, 90), bid('d', '200', null, 99)]);
  assert.deepEqual(ranked.map((b) => b.seller), ['b', 'c', 'a', 'd']);
});

test('the list pages four at a time and the folded row shows the price range', () => {
  const many = ['1', '2', '3', '4', '5', '6'].map((n) => bid(n, n === '1' ? '240' : '300', 60));
  assert.equal(offersPage(many, 1).length, 4);
  assert.equal(offersPage(many, 2).length, 6);
  assert.deepEqual(priceRange(many), { min: 240, max: 300 });
  assert.equal(priceRange([]), null);
});

test('the request page lets its buyer cancel or edit, and shows offers as one roster', () => {
  const page = readFileSync(new URL('./components/LiveJobPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /<EditBriefSection[\s\S]*?isBuyer=\{viewerIsBuyer\}[\s\S]*?\/>/);
  assert.match(page, /<CancelBriefSection[\s\S]*?isBuyer=\{viewerIsBuyer\}[\s\S]*?\/>/);
  assert.match(page, /<OffersRoster/);
});
