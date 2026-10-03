import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentBreakdown } from './SettlementRecord';

test('a 50 USDC deal reads as 50 plus the fee in, and 50 less the fee out', () => {
  assert.deepEqual(paymentBreakdown({ kind: 'escrow_funding', amountUsdc: '50.375' }, '50', [100]), { base: '50', fee: '0.375' });
  assert.deepEqual(paymentBreakdown({ kind: 'milestone_payout', amountUsdc: '49.625', milestoneIndex: 0 }, '50', [100]), { base: '50', fee: '0.375' });
});

test('a split payout is measured against its own share', () => {
  assert.deepEqual(paymentBreakdown({ kind: 'milestone_payout', amountUsdc: '29.775', milestoneIndex: 1 }, '50', [40, 60]), { base: '30', fee: '0.225' });
});

test('no breakdown when there is no fee or the deal is unknown', () => {
  assert.equal(paymentBreakdown({ kind: 'escrow_funding', amountUsdc: '50' }, '50', [100]), null);
  assert.equal(paymentBreakdown({ kind: 'escrow_funding', amountUsdc: '50.375' }, undefined, [100]), null);
});
