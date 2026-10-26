import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_REVIEW_DAYS, reviewHasStarted } from './reviewClock.js';

test('on the escrow family the buyer is reviewing once the work is delivered', () => {
  assert.equal(reviewHasStarted({ escrowVersion: 'suite', delivered: true }), true);
  assert.equal(reviewHasStarted({ escrowVersion: 'suite', delivered: false }), false);
});

test('on the earlier escrows review starts with the recorded review window', () => {
  assert.equal(reviewHasStarted({ escrowVersion: 'v3', delivered: true }), false);
  assert.equal(reviewHasStarted({ escrowVersion: 'v3', delivered: true, reviewWindowStartedAt: 1 }), true);
  assert.equal(reviewHasStarted({ delivered: true, reviewWindowStartedAt: 1 }), true);
});

test('a deal offers at most 30 days to check, the most the escrow takes', async () => {
  const { createSchema } = await import('./createSchema.js');
  const base = { buyer: `0x${'b1'.repeat(20)}`, seller: `0x${'51'.repeat(20)}`, dealAmountUsdc: '10', terms: 'A logo in SVG' };
  const at = (days: number) => createSchema.safeParse({ ...base, reviewWindowDays: days });
  assert.equal(MAX_REVIEW_DAYS, 30);
  assert.equal(at(31).success, false);
  assert.equal(at(30).error?.issues.some((i) => i.path.includes('reviewWindowDays')) ?? false, false);
});
