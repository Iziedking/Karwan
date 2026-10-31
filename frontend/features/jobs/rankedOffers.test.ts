import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShortlistEntry } from '@/core/api';
import { rankedOffers } from './rankedOffers';

/// The offers on a request in rank order, with the one the agent picks (view 44, P4).
///
///   npx tsx --test features/jobs/rankedOffers.test.ts

const entry = (over: Partial<ShortlistEntry>): ShortlistEntry => ({
  rank: 1, seller: '0xa1', sellerUser: '0xu1', name: 'Ada', tag: 'ada', level: 'person_verified', verified: true, score: null, tier: 'Proven',
  counts: null, offer: 'Logo in 3 versions', deliveryDays: 3, priceUsdc: 120, askedUsdc: null, recordChecked: true, recommended: false,
  reasons: [], state: 'ready', isNew: false, ...over,
} as ShortlistEntry);

test('offers come in rank order and the first recommended one inside the request is the best fit', () => {
  const out = rankedOffers([
    entry({ rank: 2, seller: '0xb', recommended: true, reasons: ['verified', 'within_budget', 'on_time_record', 'best_fit'] }),
    entry({ rank: 1, seller: '0xa' }),
  ]);
  assert.deepEqual(out.map((o) => o.seller), ['0xa', '0xb']);
  assert.deepEqual(out.map((o) => o.bestFit), [false, true]);
  assert.deepEqual(out[1]!.reasonLine, ['best_fit', 'verified', 'within_budget']);
});

test('an offer over the budget, or no longer available, is never the best fit', () => {
  const out = rankedOffers([
    entry({ rank: 1, seller: '0xa', recommended: true, outsideRequest: true }),
    entry({ rank: 2, seller: '0xb', recommended: true, state: 'unavailable' }),
    entry({ rank: 3, seller: '0xc', recommended: true }),
  ]);
  assert.deepEqual(out.map((o) => o.bestFit), [false, false, true]);
  assert.equal(rankedOffers([entry({ recommended: true, outsideRequest: true })])[0]!.bestFit, false);
  assert.deepEqual(rankedOffers([]), []);
});
