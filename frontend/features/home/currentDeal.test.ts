import assert from 'node:assert/strict';
import test from 'node:test';
import { pickCurrentDeal } from './currentDeal';

const deal = (jobId: string, updatedAt: number, extra: Record<string, unknown> = {}) =>
  ({ jobId, buyer: '0xa', seller: '0xb', dealAmountUsdc: '1', firstReleasePct: 50, createdAt: updatedAt, updatedAt, ...extra }) as never;

test('the current trade is the open deal with the latest activity, not the first in the list', () => {
  const oldDispute = deal('old', 1_000, { disputed: true });
  const fresh = deal('fresh', 9_000);
  assert.equal(pickCurrentDeal([oldDispute, fresh])?.jobId, 'fresh');
});

test('settled and cancelled deals are never current', () => {
  assert.equal(pickCurrentDeal([deal('done', 9_000, { settledAt: 9_000 }), deal('gone', 9_500, { cancelledAt: 9_500 })]), null);
});
