import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { agreedPrice } from './agreedPrice';

///   npx tsx --test features/deals/workspace/agreedPrice.test.ts

const deal = (over: Partial<DirectDeal>) => ({ dealAmountUsdc: '35', milestonePcts: [33, 33, 34], onChain: null, ...over }) as DirectDeal;

test('an offer that raised the price shows the agreed amount and what each stage pays', () => {
  assert.deepEqual(agreedPrice(deal({ postedPriceUsdc: '25' })), { agreed: '35', posted: '25', stages: ['11.55', '11.55', '11.9'] });
});

test('the escrow split wins over the stored one', () => {
  const onChain = { state: 2, milestonePcts: [50, 50], milestonesReleased: 0 } as unknown as DirectDeal['onChain'];
  assert.deepEqual(agreedPrice(deal({ postedPriceUsdc: '25', onChain }))!.stages, ['17.5', '17.5']);
});

test('one payment lists no stages, and an unchanged price shows nothing', () => {
  assert.deepEqual(agreedPrice(deal({ postedPriceUsdc: '25', milestonePcts: [100] }))!.stages, []);
  assert.equal(agreedPrice(deal({ postedPriceUsdc: null })), null);
  assert.equal(agreedPrice(deal({})), null);
});
