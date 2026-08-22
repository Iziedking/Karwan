import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingEscrowMicros } from './escrowRefund.js';

test('remaining escrow is the contract balance after released milestones', () => {
  assert.equal(remainingEscrowMicros(1_000_000n, 250_000n), 750_000n);
});

test('remaining escrow rejects impossible released totals', () => {
  assert.throws(
    () => remainingEscrowMicros('1000000', '1000001'),
    /ESCROW_RELEASED_EXCEEDS_DEAL_AMOUNT/,
  );
});
