import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKarwanReference,
  createMoneyMovement,
  startMoneyMovementAttempt,
  planMoneyMovementLeg,
  transitionMoneyMovementLeg,
  transitionMoneyMovement,
} from './model.js';

const NOW = 1_760_000_000_000;

function planned() {
  const movement = createMoneyMovement(createKarwanReference(), {
      operationKey: 'bridge:record:0xabc:brg-1',
      kind: 'bridge',
      amountMicros: '150000000',
      initiatedBy: '0xabc',
      participants: [{ address: '0xabc', role: 'owner' }],
      summary: 'Sent 150 USDC on Arc',
      nextActor: 'karwan',
    },
    NOW,
  );
  return planMoneyMovementLeg(
    startMoneyMovementAttempt(movement, NOW),
    { key: 'burn', label: 'Arc source burn', rail: 'cctp' },
    NOW,
  );
}

test('recording a hash on a planned leg advances the version by more than one', () => {
  // This is the shape routes/bridge.ts produces: prepareCashoutLeg creates the
  // leg as `planned`, then recordCashoutLeg is called with the burn hash in the
  // same request. The ladder walks planned -> submitted -> confirmed -> verified
  // and the movement to `verifying`, and EVERY hop bumps version by one.
  const before = planned();
  const leg = before.legs[0]!;
  let next = transitionMoneyMovementLeg(before, leg.id, 'submitted', { txHash: '0x1' }, NOW);
  next = transitionMoneyMovementLeg(next, leg.id, 'confirmed', { txHash: '0x1' }, NOW);
  next = transitionMoneyMovementLeg(next, leg.id, 'verified', { txHash: '0x1' }, NOW);
  next = transitionMoneyMovement(next, 'verifying', { nextActor: 'karwan' }, NOW);

  // Four hops, four bumps. db/moneyMovements.validateMutation permits exactly
  // one, so the whole update throws "money movement version must advance by
  // exactly one" and the leg keeps its hash forever unrecorded.
  assert.equal(next.version - before.version, 4);
  assert.ok(next.version > before.version + 1, 'a single logical update advances several versions');
});

test('the guard accepts a multi-hop advance and refuses a rewind', async () => {
  // The rule on its own, with no store and no environment: it is arithmetic
  // about two versions, and that is all it should need to be tested.
  const { validateMutation } = await import('../db/moneyMovements.js');
  const before = planned();
  const leg = before.legs[0]!;
  let next = transitionMoneyMovementLeg(before, leg.id, 'submitted', { txHash: '0x1' }, NOW);
  next = transitionMoneyMovementLeg(next, leg.id, 'confirmed', { txHash: '0x1' }, NOW);
  next = transitionMoneyMovementLeg(next, leg.id, 'verified', { txHash: '0x1' }, NOW);

  // Three hops in one update: previously rejected, which is the bug.
  assert.equal(validateMutation(before, next), next);
  // Standing still is fine; the caller treats it as "nothing to write".
  assert.equal(validateMutation(before, before), before);
  // Rewinding is not, and that is what the guard is actually for.
  assert.throws(
    () => validateMutation(before, { ...before, version: before.version - 1 }),
    /cannot move backwards/,
  );
  // The immutable fields are still immutable.
  assert.throws(
    () => validateMutation(before, { ...next, kind: 'cash_out' }),
    /kind is immutable/,
  );
});
