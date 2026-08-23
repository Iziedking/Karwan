import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeLegs,
  completionPath,
  isDeadIntent,
  isSameTransactionMovement,
  planReconcile,
  type LegProof,
} from './reconcile.js';
import { canTransitionMovement } from './model.js';
import type {
  MoneyMovement,
  MoneyMovementLeg,
  MoneyMovementLegState,
  MoneyMovementState,
} from './model.js';

const NOW = 1_760_000_000_000;
const HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001';
const OTHER = '0xbbbb000000000000000000000000000000000000000000000000000000000002';

function leg(
  key: string,
  state: MoneyMovementLegState,
  extra: Partial<MoneyMovementLeg> = {},
): MoneyMovementLeg {
  return {
    id: `leg-${key}-${extra.attempt ?? 1}`,
    key,
    attempt: 1,
    label: key === 'burn' ? 'Arc transfer' : 'Arc destination mint',
    rail: 'cctp',
    state,
    idempotencyKey: `idem-${key}`,
    amountMicros: '5000000',
    createdAt: NOW,
    ...extra,
  };
}

function movement(legs: MoneyMovementLeg[], extra: Partial<MoneyMovement> = {}): MoneyMovement {
  return {
    reference: 'KWN-AAAA-BBBB-CCCC',
    operationKey: 'op-1',
    kind: 'cash_out',
    state: 'verifying',
    version: 4,
    attempt: 1,
    currency: 'USDC',
    amountMicros: '5000000',
    initiatedBy: '0x7711886865c33606ebd977da02a6a25373c75a35',
    participants: [],
    summary: 'Sent 5 USDC on Arc',
    nextActor: 'karwan',
    legs,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

const proofs = (entries: Array<[string, LegProof]>) => new Map(entries);
const landed: LegProof = { kind: 'landed', chain: 'arc' };

test('only the current attempt is considered', () => {
  const m = movement(
    [leg('burn', 'verified', { attempt: 1, id: 'old' }), leg('burn', 'submitted', { attempt: 2, id: 'new' })],
    { attempt: 2 },
  );
  assert.deepEqual(
    activeLegs(m).map((l) => l.id),
    ['new'],
  );
});

test('a leg holding a landed transaction is walked forward', () => {
  const m = movement([leg('burn', 'submitted', { txHash: HASH, explorerUrl: 'https://x/1' })]);
  const plan = planReconcile(m, proofs([['leg-burn-1', landed]]));
  assert.equal(plan.action, 'repair');
  assert.deepEqual(plan.action === 'repair' ? plan.legs : null, [
    { key: 'burn', txHash: HASH, explorerUrl: 'https://x/1' },
  ]);
});

test('a verified leg needs no proof of its own', () => {
  // The chain read is skipped for a leg the record already trusts, so a movement
  // whose only unverified leg has landed still repairs.
  const m = movement([
    leg('burn', 'verified', { txHash: HASH, id: 'a' }),
    leg('mint', 'confirmed', { txHash: OTHER, id: 'b', label: 'Destination-chain mint' }),
  ]);
  const plan = planReconcile(m, proofs([['b', landed]]));
  assert.equal(plan.action, 'repair');
  assert.deepEqual(plan.action === 'repair' ? plan.legs.map((l) => l.key) : null, ['mint']);
});

test('every leg verified and no completion means complete, not repair', () => {
  const m = movement([leg('burn', 'verified', { txHash: HASH })]);
  assert.deepEqual(planReconcile(m, proofs([])), { action: 'complete' });
});

test('a reverted transaction is never completed', () => {
  const m = movement([leg('burn', 'submitted', { txHash: HASH })]);
  const plan = planReconcile(m, proofs([['leg-burn-1', { kind: 'reverted', chain: 'arc' }]]));
  assert.deepEqual(plan, { action: 'skip', reason: 'reverted' });
});

test('a reverted leg outranks a repairable one', () => {
  // The dangerous case: a two-leg movement where one leg landed and the other
  // reverted must never read as repairable.
  const m = movement([
    leg('burn', 'submitted', { txHash: HASH, id: 'a' }),
    leg('mint', 'submitted', { txHash: OTHER, id: 'b' }),
  ]);
  const plan = planReconcile(
    m,
    proofs([
      ['a', landed],
      ['b', { kind: 'reverted', chain: 'arc' }],
    ]),
  );
  assert.deepEqual(plan, { action: 'skip', reason: 'reverted' });
});

test('a hash no chain could confirm is left alone', () => {
  const m = movement([leg('burn', 'submitted', { txHash: HASH })]);
  const plan = planReconcile(m, proofs([['leg-burn-1', { kind: 'unknown' }]]));
  assert.deepEqual(plan, { action: 'skip', reason: 'unconfirmable' });
});

test('a missing proof is treated as unconfirmable, not as success', () => {
  // A leg the caller never looked up must not fall through into a repair.
  const m = movement([leg('burn', 'submitted', { txHash: HASH })]);
  assert.deepEqual(planReconcile(m, proofs([])), { action: 'skip', reason: 'unconfirmable' });
});

test('a failed leg whose transaction succeeded needs a decision, not a repair', () => {
  // `failed` is terminal for a leg, so walking it forward is impossible and
  // pretending otherwise would report a repair that did nothing.
  const m = movement([leg('burn', 'failed', { txHash: HASH })], { state: 'needs_attention' });
  const plan = planReconcile(m, proofs([['leg-burn-1', landed]]));
  assert.deepEqual(plan, { action: 'skip', reason: 'failed-leg-landed' });
});

test('a leg with no transaction is left alone by default', () => {
  const m = movement([
    leg('burn', 'submitted', { txHash: HASH, id: 'a' }),
    leg('mint', 'planned', { id: 'b' }),
  ]);
  const plan = planReconcile(m, proofs([['a', landed], ['b', { kind: 'no-hash' }]]));
  assert.deepEqual(plan, { action: 'skip', reason: 'missing-transaction' });
});

test('a same-chain send can adopt its sibling transaction, but only when asked', () => {
  const m = movement([
    leg('burn', 'submitted', { txHash: HASH, id: 'a', explorerUrl: 'https://x/1' }),
    leg('mint', 'planned', { id: 'b' }),
  ]);
  const p = proofs([['a', landed], ['b', { kind: 'no-hash' }]]);
  const plan = planReconcile(m, p, { adoptSameTx: true });
  assert.equal(plan.action, 'adopt');
  if (plan.action !== 'adopt') return;
  assert.equal(plan.from, HASH);
  // Both legs end up on the one transaction, because on Arc to Arc that is what
  // happened: one send is the burn and the mint.
  assert.deepEqual(plan.legs, [
    { key: 'burn', txHash: HASH, explorerUrl: 'https://x/1' },
    { key: 'mint', txHash: HASH, explorerUrl: 'https://x/1' },
  ]);
});

test('adoption is refused when the legs are not one transaction', () => {
  const cases: Array<[string, MoneyMovement]> = [
    [
      'a different kind of movement',
      movement([leg('burn', 'submitted', { txHash: HASH, id: 'a' }), leg('mint', 'planned', { id: 'b' })], {
        kind: 'bridge',
      }),
    ],
    [
      'three legs',
      movement([
        leg('burn', 'submitted', { txHash: HASH, id: 'a' }),
        leg('mint', 'planned', { id: 'b' }),
        leg('fee', 'planned', { id: 'c' }),
      ]),
    ],
    [
      'keys that are not the burn and mint pair',
      movement([
        leg('gateway_burn', 'submitted', { txHash: HASH, id: 'a' }),
        leg('gateway_mint', 'planned', { id: 'b' }),
      ]),
    ],
    [
      'two different amounts',
      movement([
        leg('burn', 'submitted', { txHash: HASH, id: 'a', amountMicros: '5000000' }),
        leg('mint', 'planned', { id: 'b', amountMicros: '4000000' }),
      ]),
    ],
    [
      'nothing saying it stayed on Arc',
      movement(
        [
          leg('burn', 'submitted', { txHash: HASH, id: 'a', label: 'Arc source burn' }),
          leg('mint', 'planned', { id: 'b', label: 'Destination-chain mint' }),
        ],
        { summary: 'Sent 5 USDC to Base' },
      ),
    ],
  ];
  for (const [why, m] of cases) {
    // Proofs derived from the fixture, the way the script derives them: a leg
    // with a hash gets a receipt, a leg without gets nothing to check. Handing
    // in a fixed pair would leave a third leg unproven and skip for that reason
    // instead of the one under test.
    const derived = proofs(
      m.legs.map((l): [string, LegProof] => [l.id, l.txHash ? landed : { kind: 'no-hash' }]),
    );
    const plan = planReconcile(m, derived, { adoptSameTx: true });
    assert.deepEqual(plan, { action: 'skip', reason: 'missing-transaction' }, why);
    assert.equal(isSameTransactionMovement(m), false, why);
  }
});

test('the same-chain shape routes/bridge.ts writes is recognised', () => {
  const m = movement([
    leg('burn', 'submitted', { txHash: HASH, id: 'a', label: 'Arc transfer' }),
    leg('mint', 'planned', { id: 'b' }),
  ]);
  assert.equal(isSameTransactionMovement(m), true);
});

test('a completed or cancelled movement is never touched', () => {
  for (const state of ['completed', 'cancelled'] as const) {
    const m = movement([leg('burn', 'submitted', { txHash: HASH })], { state });
    assert.deepEqual(planReconcile(m, proofs([['leg-burn-1', landed]])), {
      action: 'skip',
      reason: 'terminal',
    });
  }
});

test('a movement with no legs on the current attempt is left alone', () => {
  const m = movement([leg('burn', 'verified', { attempt: 1 })], { attempt: 2 });
  assert.deepEqual(planReconcile(m, proofs([])), { action: 'skip', reason: 'nothing-to-do' });
});

// ------------------------------------------------------- the completion path

test('every hop on a completion path is one the state machine allows', () => {
  // The bug this pins: completeMoneyMovement transitions straight to completed,
  // which MOVEMENT_TRANSITIONS only accepts from verifying. A movement parked in
  // needs_attention threw "invalid movement transition needs_attention ->
  // completed" instead of being repaired. Checking each hop against
  // canTransitionMovement means the path cannot drift from the table.
  const starts: MoneyMovementState[] = [
    'created',
    'preparing',
    'submitted',
    'verifying',
    'needs_attention',
  ];
  for (const start of starts) {
    const path = completionPath(start);
    assert.ok(path.length > 0, `${start} has no route to completed`);
    assert.equal(path[path.length - 1], 'completed', `${start} does not end completed`);
    let from = start;
    for (const to of path) {
      assert.ok(canTransitionMovement(from, to), `${start}: ${from} -> ${to} is not allowed`);
      from = to;
    }
  }
});

test('a terminal movement has no completion path', () => {
  assert.deepEqual(completionPath('completed'), []);
  assert.deepEqual(completionPath('cancelled'), []);
});

test('needs_attention goes back through preparing, not straight to the end', () => {
  // The literal failure seen in production, on an agent funding whose Arc
  // transfer was verified and landed.
  assert.deepEqual(completionPath('needs_attention'), ['preparing', 'verifying', 'completed']);
  assert.equal(canTransitionMovement('needs_attention', 'completed'), false);
});

// --------------------------------------------------------- dead intents

/// The five rows this was written for: a Circle bridge that created its movement
/// and legs, then never wrote its projection, so the pipeline that signs never
/// ran.
const DEAD = {
  kind: 'bridge' as const,
  state: 'preparing' as const,
  operationKey: 'bridge:circle-bridge:0x7711886865c33606ebd977da02a6a25373c75a35:brg-1',
  summary: 'Added 10 USDC from Base Sepolia to Arc',
};

test('a backend-signed bridge with no projection and untouched legs is dead', () => {
  const m = movement(
    [leg('burn', 'planned', { id: 'a' }), leg('mint', 'planned', { id: 'b' })],
    DEAD,
  );
  assert.equal(isDeadIntent({ movement: m, hasBridgeProjection: false }), true);
});

test('a user-signed route is NEVER dead, however empty its record looks', () => {
  // The 150 USDC row. Its route is called only after the browser has signed, so
  // a missing projection says nothing about the money, and it did leave. Reading
  // this one as dead would write off a real transfer.
  const m = movement([leg('burn', 'planned', { id: 'a' }), leg('mint', 'planned', { id: 'b' })], {
    ...DEAD,
    operationKey: 'bridge:record:0x7711886865c33606ebd977da02a6a25373c75a35:brg-9',
    summary: 'Sent 150 USDC from Arc to arc',
  });
  assert.equal(isDeadIntent({ movement: m, hasBridgeProjection: false }), false);
  for (const key of ['cashout:web3-bridge-out:0xabc:b1', 'cashout:bridge-out:0xabc:b1']) {
    assert.equal(
      isDeadIntent({ movement: movement([leg('burn', 'planned')], { ...DEAD, operationKey: key }), hasBridgeProjection: false }),
      false,
      key,
    );
  }
});

test('a projection means the pipeline got that far, so nothing is written off', () => {
  const m = movement([leg('burn', 'planned', { id: 'a' })], DEAD);
  assert.equal(isDeadIntent({ movement: m, hasBridgeProjection: true }), false);
});

test('any sign of a transaction disqualifies it', () => {
  const withHash = movement(
    [leg('burn', 'planned', { id: 'a', txHash: HASH }), leg('mint', 'planned', { id: 'b' })],
    DEAD,
  );
  assert.equal(isDeadIntent({ movement: withHash, hasBridgeProjection: false }), false);
  const submitted = movement(
    [leg('burn', 'submitted', { id: 'a' }), leg('mint', 'planned', { id: 'b' })],
    DEAD,
  );
  assert.equal(isDeadIntent({ movement: submitted, hasBridgeProjection: false }), false);
});

test('a finished movement is left alone', () => {
  for (const state of ['completed', 'cancelled'] as const) {
    const m = movement([leg('burn', 'planned')], { ...DEAD, state });
    assert.equal(isDeadIntent({ movement: m, hasBridgeProjection: false }), false, state);
  }
});

test('no legs on the current attempt is not evidence of anything', () => {
  const m = movement([leg('burn', 'planned', { attempt: 1 })], { ...DEAD, attempt: 2 });
  assert.equal(isDeadIntent({ movement: m, hasBridgeProjection: false }), false);
});
