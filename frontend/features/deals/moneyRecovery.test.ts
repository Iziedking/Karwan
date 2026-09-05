import assert from 'node:assert/strict';
import test from 'node:test';
import { findUnresolvedPayoutRecovery } from './moneyRecovery';
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
  assert.equal(findUnresolvedPayoutRecovery([movement('needs_attention')])?.reference, 'movement-needs_attention-milestone_payout');
});

test('does not treat completed or funding records as payout recovery', () => {
  assert.equal(findUnresolvedPayoutRecovery([movement('completed')]), undefined);
  assert.equal(
    findUnresolvedPayoutRecovery([movement('needs_attention', 'escrow_funding')]),
    undefined,
  );
});
