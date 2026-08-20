import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KARWAN_REFERENCE_ALPHABET,
  canTransitionMovement,
  createMoneyMovement,
  formatKarwanReference,
  formatUsdcMicros,
  isKarwanReference,
  movementIdempotencyKey,
  parseUsdcMicros,
  planMoneyMovementLeg,
  startMoneyMovementAttempt,
  shouldReuseMoneyMovementAttempt,
  transitionMoneyMovement,
  transitionMoneyMovementAndLeg,
  transitionMoneyMovementLeg,
} from './model.js';

const REFERENCE = 'KWN-2345-6789-ABCD';

function movement() {
  return createMoneyMovement(
    REFERENCE,
    {
      operationKey: 'escrow_funding:0xjob',
      kind: 'escrow_funding',
      amountMicros: 101_500_000n,
      initiatedBy: '0x1111111111111111111111111111111111111111',
      participants: [
        { address: '0x1111111111111111111111111111111111111111', role: 'buyer' },
        { address: '0x2222222222222222222222222222222222222222', role: 'seller' },
      ],
      summary: 'Protect funds for the deal',
    },
    100,
  );
}

test('formats a non-ambiguous, grouped Karwan reference', () => {
  const ref = formatKarwanReference(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
  assert.equal(ref, 'KWN-2345-6789-ABCD');
  assert.equal(isKarwanReference(ref), true);
  assert.equal(/[01ILO]/.test(ref.slice(4)), false);
  assert.equal(KARWAN_REFERENCE_ALPHABET.length, 31);
});

test('uses exact micro-USDC math and rejects excess precision', () => {
  assert.equal(parseUsdcMicros('101.5'), 101_500_000n);
  assert.equal(parseUsdcMicros('0.000001'), 1n);
  assert.equal(formatUsdcMicros(101_500_000n), '101.5');
  assert.equal(formatUsdcMicros(1n), '0.000001');
  assert.throws(() => parseUsdcMicros('1.0000001'), /at most 6 places/);
  assert.throws(() => parseUsdcMicros('-1'), /non-negative/);
});

test('guards movement transitions and never regresses a completed movement', () => {
  let current = movement();
  current = startMoneyMovementAttempt(current, 200);
  current = transitionMoneyMovement(current, 'submitted', {}, 300);
  current = transitionMoneyMovement(current, 'verifying', {}, 400);
  current = transitionMoneyMovement(current, 'completed', {}, 500);
  assert.equal(current.completedAt, 500);
  assert.equal(current.nextActor, 'none');
  assert.equal(canTransitionMovement('completed', 'preparing'), false);
  assert.throws(
    () => transitionMoneyMovement(current, 'needs_attention'),
    /invalid movement transition completed/,
  );
});

test('keeps one idempotency key for a leg retry and rotates it for a new attempt', () => {
  let current = startMoneyMovementAttempt(movement(), 200);
  current = planMoneyMovementLeg(
    current,
    { key: 'fund', label: 'Protect funds', rail: 'arc_contract' },
    210,
  );
  const first = current.legs[0]!;
  const duplicate = planMoneyMovementLeg(
    current,
    { key: 'fund', label: 'Protect funds', rail: 'arc_contract' },
    220,
  );
  assert.equal(duplicate.legs.length, 1);
  assert.equal(duplicate.legs[0]!.idempotencyKey, first.idempotencyKey);

  current = transitionMoneyMovement(current, 'needs_attention', { failureCode: 'TIMEOUT' }, 300);
  current = startMoneyMovementAttempt(current, 400);
  current = planMoneyMovementLeg(
    current,
    { key: 'fund', label: 'Protect funds', rail: 'arc_contract' },
    410,
  );
  assert.equal(current.legs.length, 2);
  assert.notEqual(current.legs[1]!.idempotencyKey, first.idempotencyKey);
  assert.equal(
    current.legs[1]!.idempotencyKey,
    movementIdempotencyKey(REFERENCE, 2, 'fund'),
  );
});

test('guards leg state and makes verified proof immutable', () => {
  let current = startMoneyMovementAttempt(movement(), 200);
  current = planMoneyMovementLeg(
    current,
    { key: 'approve', label: 'Authorize exact amount', rail: 'circle_wallets' },
    210,
  );
  const id = current.legs[0]!.id;
  current = transitionMoneyMovementLeg(current, id, 'submitted', { providerId: 'circle-1' }, 220);
  current = transitionMoneyMovementLeg(current, id, 'confirmed', { txHash: '0xabc' }, 230);
  current = transitionMoneyMovementLeg(current, id, 'verified', {}, 240);
  assert.equal(current.legs[0]!.verifiedAt, 240);
  assert.throws(
    () => transitionMoneyMovementLeg(current, id, 'failed', { failureCode: 'LATE' }),
    /invalid movement leg transition verified/,
  );
});

test('advances provider proof and movement state in one version', () => {
  let current = startMoneyMovementAttempt(movement(), 200);
  current = planMoneyMovementLeg(
    current,
    { key: 'fund', label: 'Protect funds', rail: 'circle_wallets' },
    210,
  );
  const version = current.version;
  current = transitionMoneyMovementAndLeg(
    current,
    'submitted',
    current.legs[0]!.id,
    'submitted',
    { providerId: 'circle-1' },
    {},
    220,
  );
  assert.equal(current.version, version + 1);
  assert.equal(current.state, 'submitted');
  assert.equal(current.legs[0]!.providerId, 'circle-1');
});

test('reuses unknown attempts but rotates after a terminal leg failure', () => {
  let current = startMoneyMovementAttempt(movement(), 200);
  current = planMoneyMovementLeg(
    current,
    { key: 'fund', label: 'Protect funds', rail: 'circle_wallets' },
    210,
  );
  assert.equal(shouldReuseMoneyMovementAttempt(current), true);

  const id = current.legs[0]!.id;
  current = transitionMoneyMovementLeg(current, id, 'submitted', { providerId: 'circle-1' }, 220);
  assert.equal(shouldReuseMoneyMovementAttempt(current), true);

  current = transitionMoneyMovementLeg(current, id, 'failed', { failureCode: 'FAILED' }, 230);
  assert.equal(shouldReuseMoneyMovementAttempt(current), false);
});

test('cash-out movement keeps burn and mint proof separate', () => {
  let current = createMoneyMovement(
    'KWN-2345-6789-ABCD',
    {
      operationKey: 'cashout:bridge-out:test',
      kind: 'cash_out',
      amountMicros: 3_000_000n,
      initiatedBy: '0x1111111111111111111111111111111111111111',
      participants: [
        { address: '0x1111111111111111111111111111111111111111', role: 'owner' },
        { address: '0x2222222222222222222222222222222222222222', role: 'recipient' },
      ],
      summary: 'Cashed out 3 USDC to another chain',
    },
    100,
  );
  current = startMoneyMovementAttempt(current, 110);
  current = planMoneyMovementLeg(current, { key: 'burn', label: 'Source burn', rail: 'cctp' }, 120);
  current = planMoneyMovementLeg(current, { key: 'mint', label: 'Destination mint', rail: 'cctp' }, 121);
  const burnId = current.legs.find((leg) => leg.key === 'burn')!.id;
  const mintId = current.legs.find((leg) => leg.key === 'mint')!.id;
  current = transitionMoneyMovementLeg(current, burnId, 'submitted', {}, 130);
  current = transitionMoneyMovementLeg(current, burnId, 'confirmed', { txHash: '0xburn' }, 131);
  current = transitionMoneyMovementLeg(current, burnId, 'verified', {}, 132);
  current = transitionMoneyMovement(current, 'submitted', {}, 133);
  current = transitionMoneyMovement(current, 'verifying', {}, 134);
  current = transitionMoneyMovementLeg(current, mintId, 'submitted', {}, 140);
  current = transitionMoneyMovementLeg(current, mintId, 'confirmed', { txHash: '0xmint' }, 141);
  current = transitionMoneyMovementLeg(current, mintId, 'verified', {}, 142);
  assert.equal(current.legs.find((leg) => leg.key === 'burn')!.txHash, '0xburn');
  assert.equal(current.legs.find((leg) => leg.key === 'mint')!.txHash, '0xmint');
  assert.equal(current.state, 'verifying');
});
