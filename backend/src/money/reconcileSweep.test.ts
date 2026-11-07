import assert from 'node:assert/strict';
import test from 'node:test';
import type { MoneyMovement, MoneyMovementLeg, MoneyMovementLegState } from './model.js';
import type { LegProof, ReconcilePlan } from './reconcile.js';
import { runReconcileSweep, type SweepIo } from './reconcileSweep.js';

const NOW = 1_770_000_000_000;
const HOUR = 3_600_000;
const HASH = `0x${'aa'.repeat(32)}`;

function leg(state: MoneyMovementLegState, txHash?: string): MoneyMovementLeg {
  return {
    id: `leg-release-${txHash ?? 'none'}`,
    key: 'release',
    attempt: 1,
    label: 'Arc payout',
    rail: 'arc',
    state,
    idempotencyKey: 'idem-release',
    amountMicros: '40000000',
    createdAt: NOW - 3 * HOUR,
    ...(txHash ? { txHash } : {}),
  };
}

function movement(reference: string, legs: MoneyMovementLeg[], extra: Partial<MoneyMovement> = {}): MoneyMovement {
  return {
    reference,
    operationKey: `op-${reference}`,
    kind: 'milestone_payout',
    state: 'submitted',
    version: 3,
    attempt: 1,
    currency: 'USDC',
    amountMicros: '40000000',
    initiatedBy: `0x${'11'.repeat(20)}`,
    participants: [],
    summary: 'Milestone 1 paid',
    nextActor: 'karwan',
    legs,
    createdAt: NOW - 3 * HOUR,
    updatedAt: NOW - 2 * HOUR,
    ...extra,
  };
}

function io(movements: MoneyMovement[], proofs: Record<string, LegProof>, opts: { throwOn?: string; behind?: string[] } = {}) {
  const applied: Array<{ reference: string; plan: ReconcilePlan }> = [];
  const finished: string[] = [];
  const sweep: SweepIo = {
    open: async () => movements,
    proof: async (l) => proofs[l.txHash ?? ''] ?? { kind: 'no-hash' },
    apply: async (reference, plan) => {
      if (reference === opts.throwOn) throw new Error('invalid transition');
      applied.push({ reference, plan });
      return 'completed';
    },
    bridgesBehind: async () => opts.behind ?? [],
    finishBridge: async (id) => {
      finished.push(id);
    },
  };
  return { sweep, applied, finished };
}

test('a stuck movement whose every leg landed is walked forward to completed', async () => {
  const h = io([movement('KWN-A', [leg('submitted', HASH)])], { [HASH]: { kind: 'landed', chain: 'arc' } });
  const out = await runReconcileSweep(h.sweep, { now: NOW, olderThanMs: HOUR });
  assert.deepEqual(out.fixed, ['KWN-A']);
  assert.deepEqual(out.left, []);
  assert.equal(h.applied[0]?.plan.action, 'repair');
});

test('a reverted, unknown or missing transaction is left and counted, never applied', async () => {
  const reverted = `0x${'bb'.repeat(32)}`;
  const unknown = `0x${'cc'.repeat(32)}`;
  const h = io(
    [
      movement('KWN-R', [leg('submitted', reverted)]),
      movement('KWN-U', [leg('submitted', unknown)]),
      movement('KWN-N', [leg('planned')], { state: 'needs_attention' }),
    ],
    { [reverted]: { kind: 'reverted', chain: 'arc' }, [unknown]: { kind: 'unknown' } },
  );
  const out = await runReconcileSweep(h.sweep, { now: NOW, olderThanMs: HOUR });
  assert.deepEqual(out.fixed, []);
  assert.deepEqual(
    out.left.map((l) => [l.reference, l.reason]),
    [['KWN-R', 'reverted'], ['KWN-U', 'unconfirmable'], ['KWN-N', 'missing-transaction']],
  );
  assert.equal(h.applied.length, 0);
});

test('a movement changed within the hour is not touched', async () => {
  const h = io([movement('KWN-Y', [leg('submitted', HASH)], { updatedAt: NOW - 10 * 60_000 })], { [HASH]: { kind: 'landed', chain: 'arc' } });
  const out = await runReconcileSweep(h.sweep, { now: NOW, olderThanMs: HOUR });
  assert.equal(out.young, 1);
  assert.equal(out.looked, 0);
  assert.equal(h.applied.length, 0);
});

test('a hashless leg is never adopted from a sibling on its own', async () => {
  const both = movement('KWN-S', [
    { ...leg('confirmed', HASH), key: 'burn', id: 'leg-burn' },
    { ...leg('planned'), key: 'mint', id: 'leg-mint' },
  ]);
  const h = io([both], { [HASH]: { kind: 'landed', chain: 'arc' } });
  const out = await runReconcileSweep(h.sweep, { now: NOW, olderThanMs: HOUR });
  assert.equal(h.applied.length, 0);
  assert.equal(out.left[0]?.reason, 'missing-transaction');
});

test('one movement that throws is reported and the rest are still looked at', async () => {
  const other = `0x${'dd'.repeat(32)}`;
  const h = io(
    [movement('KWN-T', [leg('submitted', HASH)]), movement('KWN-B', [leg('submitted', other)])],
    { [HASH]: { kind: 'landed', chain: 'arc' }, [other]: { kind: 'landed', chain: 'arc' } },
    { throwOn: 'KWN-T' },
  );
  const out = await runReconcileSweep(h.sweep, { now: NOW, olderThanMs: HOUR });
  assert.deepEqual(out.fixed, ['KWN-B']);
  assert.deepEqual(out.left.map((l) => [l.reference, l.reason]), [['KWN-T', 'error']]);
});

test('a bridge row behind its completed movement is set to finished', async () => {
  const h = io([], {}, { behind: ['br-1'] });
  const out = await runReconcileSweep(h.sweep, { now: NOW, olderThanMs: HOUR });
  assert.deepEqual(h.finished, ['br-1']);
  assert.equal(out.bridgesFinished, 1);
  assert.equal(out.at, NOW);
});
