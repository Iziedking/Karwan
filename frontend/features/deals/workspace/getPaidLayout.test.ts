import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// Each financing offer on the deal page leads with what the seller gets now,
/// with the repayment under it, and a compact Review button beside it.
///
///   npx tsx --test features/deals/workspace/getPaidLayout.test.ts

const src = readFileSync('features/deals/workspace/GetPaidNow.tsx', 'utf8');

test('the Review button keeps its own width instead of taking the row', () => {
  const review = src.split(/\r?\n/).find((line) => line.includes('setReviewing(offer)') && line.includes('<button')) ?? '';
  assert.ok(review, 'review button found');
  assert.doesNotMatch(review, /quietButton/);
  assert.match(review, /shrink-0/);
});

test('the advance is the loudest line and the repayment sits under it', () => {
  assert.match(src, /g\.offerNow/);
  assert.match(src, /g\.offerRepay/);
  assert.doesNotMatch(src, /g\.offerLine/);
});
