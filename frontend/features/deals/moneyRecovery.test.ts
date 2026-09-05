import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUnresolvedPayoutRecovery } from './moneyRecovery';
import type { MoneyMovementView } from '@/core/api';

function movement(
  state: MoneyMovementView['state'],
  kind: MoneyMovementView['kind'] = 'milestone_payout',
): MoneyMovementView {
  return {
    reference: `movement-${state}-${kind}`,
    kind,
    state,
    currency: 'USDC',
    amountUsdc: '10.000000',
    summary: 'test movement',
    nextActor: 'karwan',
    createdAt: 1,
    updatedAt: 1,
    legs: [],
  };
}

test('detects a payout whose chain or receipt result needs reconciliation', () => {
  assert.equal(hasUnresolvedPayoutRecovery([movement('needs_attention')]), true);
});

test('does not treat completed or funding records as payout recovery', () => {
  assert.equal(hasUnresolvedPayoutRecovery([movement('completed')]), false);
  assert.equal(
    hasUnresolvedPayoutRecovery([movement('needs_attention', 'escrow_funding')]),
    false,
  );
});
