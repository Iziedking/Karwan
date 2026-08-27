import assert from 'node:assert/strict';
import test from 'node:test';
import { transferProofMatchesMovement } from './moneyMovements.js';
import type { MoneyMovement } from '../money/model.js';

const movement: MoneyMovement = {
  reference: 'KWN-TEST-TEST-TEST',
  operationKey: 'test:agent-credit',
  kind: 'deposit',
  state: 'completed',
  version: 4,
  attempt: 0,
  currency: 'USDC',
  amountMicros: '200000000',
  initiatedBy: '0x1111111111111111111111111111111111111111',
  participants: [
    { address: '0x1111111111111111111111111111111111111111', role: 'owner' },
    { address: '0x2222222222222222222222222222222222222222', role: 'source' },
    { address: '0x3333333333333333333333333333333333333333', role: 'recipient' },
  ],
  summary: 'Observed 200 USDC arrive in your buyer agent wallet',
  nextActor: 'karwan',
  legs: [
    {
      id: 'leg-1',
      key: 'arc_transfer_observed',
      attempt: 0,
      label: 'Arc USDC transfer observed',
      rail: 'circle_wallets',
      state: 'verified',
      idempotencyKey: 'test:agent-credit:0',
      sourceAddress: '0x2222222222222222222222222222222222222222',
      destinationAddress: '0x3333333333333333333333333333333333333333',
      amountMicros: '200000000',
      txHash: '0xabcdef',
      createdAt: 1,
    },
  ],
  createdAt: 1,
  updatedAt: 2,
  completedAt: 2,
};

test('transfer proof requires exact tx, parties, amount, and current attempt', () => {
  assert.equal(
    transferProofMatchesMovement(movement, {
      txHash: '0xABCDEF',
      sourceAddress: '0x2222222222222222222222222222222222222222',
      destinationAddress: '0x3333333333333333333333333333333333333333',
      amountMicros: 200_000_000n,
    }),
    true,
  );
  assert.equal(
    transferProofMatchesMovement(movement, {
      txHash: '0xABCDEF',
      sourceAddress: '0x2222222222222222222222222222222222222222',
      destinationAddress: '0x3333333333333333333333333333333333333333',
      amountMicros: 199_000_000n,
    }),
    false,
  );
});
