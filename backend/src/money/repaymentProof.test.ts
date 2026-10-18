import assert from 'node:assert/strict';
import test from 'node:test';
import { repaymentProof } from './repaymentProof.js';

/// The escrow repays a financier first, out of each release. On a deal paid in
/// several milestones the repayment arrives in parts; together they are the
/// proof.
///
///   npx tsx --test src/money/repaymentProof.test.ts

test('one payment of the exact amount is the proof', () => {
  assert.deepEqual(repaymentProof([{ txHash: '0xa', value: 200n }], 200n), { txHash: '0xa', parts: 1 });
});

test('a repayment paid across milestone releases is proved by the release that completed it', () => {
  // The rehearsal of 18 Oct 2026: 500 USDC owed, paid 496.25 then 3.75.
  assert.deepEqual(repaymentProof([{ txHash: '0x1', value: 496_250_000n }, { txHash: '0x2', value: 3_750_000n }], 500_000_000n), { txHash: '0x2', parts: 2 });
});

test('payments that fall short prove nothing', () => {
  assert.equal(repaymentProof([{ txHash: '0x1', value: 300n }], 500n), null);
  assert.equal(repaymentProof([], 500n), null);
});
