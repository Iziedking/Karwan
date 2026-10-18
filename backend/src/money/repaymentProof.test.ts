import assert from 'node:assert/strict';
import test from 'node:test';
import { closesWholeRecord, repaymentProof } from './repaymentProof.js';

/// The escrow repays a financier first, out of each release. On a deal paid in
/// several milestones the repayment arrives in parts; together they are the
/// proof.
///
///   npx tsx --test src/money/repaymentProof.test.ts

test('one payment of the exact amount is the proof', () => {
  assert.deepEqual(repaymentProof([{ txHash: '0xa', value: 200n }], 200n), { txHash: '0xa', parts: 1, payments: [{ txHash: '0xa', value: 200n }] });
});

test('a repayment paid across milestone releases is proved by the release that completed it', () => {
  // The rehearsal of 18 Oct 2026: 500 USDC owed, paid 496.25 then 3.75.
  assert.deepEqual(repaymentProof([{ txHash: '0x1', value: 496_250_000n }, { txHash: '0x2', value: 3_750_000n }], 500_000_000n)?.txHash, '0x2');
});

test('each part of a split repayment is recorded at its own amount, since one release never carries the whole sum', () => {
  // A receipt is verified for an exact transfer, so the 3.75 release cannot
  // stand for the 500 owed. Each release is its own verified payment.
  assert.deepEqual(repaymentProof([{ txHash: '0x1', value: 496_250_000n }, { txHash: '0x2', value: 3_750_000n }], 500_000_000n), {
    txHash: '0x2',
    parts: 2,
    payments: [{ txHash: '0x1', value: 496_250_000n }, { txHash: '0x2', value: 3_750_000n }],
  });
});

test('payments that fall short prove nothing', () => {
  assert.equal(repaymentProof([{ txHash: '0x1', value: 300n }], 500n), null);
  assert.equal(repaymentProof([], 500n), null);
});

test('a whole-amount record left open by an earlier attempt closes once the parts are recorded', () => {
  // Before the parts were recorded, each attempt opened one 500 USDC record
  // and stopped at the receipt check, leaving it in flight in the history.
  assert.equal(closesWholeRecord('created', 2), true);
  assert.equal(closesWholeRecord('needs_attention', 2), true);
  assert.equal(closesWholeRecord('completed', 2), false);
  assert.equal(closesWholeRecord('cancelled', 2), false);
  assert.equal(closesWholeRecord('created', 1), false);
});
