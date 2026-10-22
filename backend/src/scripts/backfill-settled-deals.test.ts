import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';

delete process.env.DATABASE_URL;
const { needsCheck, settledDate } = await import('./backfill-settled-deals.js');

///   npx tsx --test src/scripts/backfill-settled-deals.test.ts

const deal = (over: Partial<DirectDeal>) => ({ jobId: '0xj', acceptedAt: 1, delivered: true, updatedAt: 9, ...over }) as DirectDeal;

test('only funded, delivered deals the record still shows open are checked', () => {
  assert.equal(needsCheck(deal({})), true);
  assert.equal(needsCheck(deal({ settledAt: 5 })), false);
  assert.equal(needsCheck(deal({ cancelledAt: 5 })), false);
  assert.equal(needsCheck(deal({ acceptedAt: undefined })), false);
  assert.equal(needsCheck(deal({ delivered: false })), false);
  assert.equal(needsCheck(deal({ legacyEscrow: true } as Partial<DirectDeal>)), false);
});

test('the settled date is the last payout, else delivery, else the last update', () => {
  assert.equal(settledDate(deal({ lastReleaseAt: 7, deliveredAt: 3 })), 7);
  assert.equal(settledDate(deal({ deliveredAt: 3 })), 3);
  assert.equal(settledDate(deal({})), 9);
});
