import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { heldInDeals } from './heldInDeals';

/// What Karwan holds in the person's own deals as the buyer (view 44, P7).
///
///   npx tsx --test features/money/heldInDeals.test.ts

const ME = '0x1111111111111111111111111111111111111111';
const deal = (over: Partial<DirectDeal>) => ({
  jobId: `0x${'ab'.repeat(32)}`, buyer: ME, seller: '0x2222222222222222222222222222222222222222', dealAmountUsdc: '120', firstReleasePct: 100,
  terms: 't', delivered: false, createdAt: 0, updatedAt: 0, onChain: null, acceptedAt: 1, ...over,
}) as DirectDeal;

test('nothing is said while the deals load', () => {
  assert.equal(heldInDeals(undefined, ME), null);
  assert.equal(heldInDeals([], ME), '0');
});

test("only money in the person's own deals as the buyer counts, exactly", () => {
  assert.equal(heldInDeals([deal({})], ME), '120');
  assert.equal(heldInDeals([deal({ dealAmountUsdc: '120', firstReleasePct: 50, milestonePcts: [50, 50], onChain: { state: 2, milestonePcts: [50, 50], milestonesReleased: 1 } as DirectDeal['onChain'] })], ME), '60');
  assert.equal(heldInDeals([deal({ buyer: '0x3333333333333333333333333333333333333333', seller: ME })], ME), '0');
  assert.equal(heldInDeals([deal({ cancelledAt: 1 })], ME), '0');
  assert.equal(heldInDeals([deal({ settledAt: 1 })], ME), '0');
  assert.equal(heldInDeals([deal({ acceptedAt: undefined })], ME), '0');
  assert.equal(heldInDeals([deal({ dealAmountUsdc: '0.1' }), deal({ dealAmountUsdc: '0.2' })], ME.toUpperCase().replace('0X', '0x')), '0.3');
});
