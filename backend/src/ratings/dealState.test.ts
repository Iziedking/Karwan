import assert from 'node:assert/strict';
import test from 'node:test';
import { rateableFrom } from './dealState.js';

/// Which deals can be rated, and the dispute outcome each carries, the same
/// on every escrow path.
///
///   npx tsx --test src/ratings/dealState.test.ts

const base = { jobId: 'd1', buyer: '0xb', seller: '0xs' };

test('a settled deal with no dispute is rateable and carries no dispute', () => {
  assert.deepEqual(rateableFrom({ ...base, settledAt: 10 }), { ...base, settledAt: 10, dispute: null });
});

test('a deal still running, or withdrawn before funding, cannot be rated', () => {
  assert.equal(rateableFrom({ ...base }).settledAt, null);
  assert.equal(rateableFrom({ ...base, cancelledAt: 5, cancelKind: 'pre-accept' }).settledAt, null);
  assert.equal(rateableFrom({ ...base, cancelledAt: 5, cancelKind: 'mutual' }).settledAt, null);
});

test('every refund after a dispute is rateable, whichever escrow path ended it', () => {
  const v2 = rateableFrom({ ...base, settledAt: 20, cancelKind: 'resolved', resolvedSellerBps: 0, disputeLoser: 'seller' });
  const v3 = rateableFrom({ ...base, cancelledAt: 21, cancelKind: 'resolved', resolvedSellerBps: 0 });
  const proposal = rateableFrom({ ...base, cancelledAt: 22, cancelKind: 'refund-from-dispute', disputeLoser: 'seller' });
  assert.deepEqual([v2.settledAt, v2.dispute], [20, 'seller']);
  assert.deepEqual([v3.settledAt, v3.dispute], [21, 'seller']);
  assert.deepEqual([proposal.settledAt, proposal.dispute], [22, 'seller']);
});

test('a ruling that splits the money reads as a split, whoever was named loser', () => {
  assert.equal(rateableFrom({ ...base, settledAt: 30, cancelKind: 'resolved', resolvedSellerBps: 5000, disputeLoser: 'buyer' }).dispute, 'split');
  assert.equal(rateableFrom({ ...base, settledAt: 31, cancelKind: 'release-from-dispute', disputeLoser: 'buyer' }).dispute, 'buyer');
});
