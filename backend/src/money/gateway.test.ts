import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoneyMovement, planMoneyMovementLeg, startMoneyMovementAttempt } from './model.js';
import { gatewayLegTx } from './gateway.js';

const owner = `0x${'1'.repeat(40)}`;
const source = `0x${'2'.repeat(40)}`;

test('Gateway deposit movements carry the deposit kind and source party', () => {
  const movement = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'gateway:deposit:owner:request-1',
      kind: 'deposit',
      amountMicros: '1250000',
      initiatedBy: owner,
      participants: [
        { address: owner, role: 'owner' },
        { address: source, role: 'source' },
      ],
      summary: 'Added 1.25 USDC to the unified balance',
    },
    1_000,
  );

  assert.equal(movement.kind, 'deposit');
  assert.deepEqual(movement.participants.map((party) => party.role), ['owner', 'source']);
  assert.equal(movement.amountMicros, '1250000');
});

test('Gateway receipt selection uses the current attempt and keeps stale proofs out', () => {
  let movement = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'gateway:deposit:owner:request-2',
      kind: 'deposit',
      amountMicros: '1000000',
      initiatedBy: owner,
      participants: [{ address: owner, role: 'owner' }],
      summary: 'Added 1 USDC to the unified balance',
    },
    1_000,
  );
  movement = startMoneyMovementAttempt(movement, 1_100);
  movement = planMoneyMovementLeg(movement, {
    key: 'gateway_deposit',
    label: 'Gateway deposit',
    rail: 'circle_wallets',
    amountMicros: '1000000',
  }, 1_200);
  movement = {
    ...movement,
    legs: movement.legs.map((leg) => ({ ...leg, txHash: '0xcurrent' })),
  };

  assert.equal(gatewayLegTx(movement, 'gateway_deposit'), '0xcurrent');
  assert.equal(gatewayLegTx({ ...movement, attempt: 2 }, 'gateway_deposit'), undefined);
});

