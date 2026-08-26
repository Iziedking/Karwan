import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoneyMovement } from '../money/model.js';
import {
  mergeMovementLedger,
  movementToPersonalLedgerItem,
  type PersonalLedgerItem,
} from './activityMovementLedger.js';

const buyer = `0x${'1'.repeat(40)}`;
const seller = `0x${'2'.repeat(40)}`;

function movement(state: 'created' | 'completed' | 'needs_attention' = 'created') {
  const base = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'escrow_funding:job-1',
      kind: 'escrow_funding',
      amountMicros: '1250000',
      initiatedBy: buyer,
      participants: [
        { address: buyer, role: 'buyer' },
        { address: seller, role: 'seller' },
      ],
      summary: 'Escrow funding is being verified',
      nextActor: 'karwan',
      jobId: 'job-1',
    },
    1_000,
  );
  return {
    ...base,
    state,
    version: base.version + 1,
    updatedAt: state === 'created' ? 1_100 : 2_000,
    ...(state === 'completed' ? { completedAt: 2_000 } : {}),
    legs:
      state === 'completed'
        ? [
            {
              id: '1:fund',
              key: 'fund',
              attempt: 0,
              label: 'Fund escrow',
              rail: 'arc_contract' as const,
              state: 'verified' as const,
              idempotencyKey: 'fund-key',
              txHash: '0xreceipt',
              verifiedAt: 1_900,
              createdAt: 1_100,
            },
          ]
        : base.legs,
  };
}

function legacy(overrides: Partial<PersonalLedgerItem> = {}): PersonalLedgerItem {
  return {
    id: 'legacy-1',
    ts: 1_500,
    kind: 'release',
    summary: 'Legacy movement',
    params: null,
    amountUsdc: '2',
    txHash: null,
    refId: null,
    chain: 'arc',
    jobId: null,
    status: 'done',
    movementState: null,
    ...overrides,
  };
}

test('movement projection exposes reference, amount, chain, and verified receipt', () => {
  const item = movementToPersonalLedgerItem(movement('completed'));
  assert.equal(item.refId, 'KWN-2345-ABCD-EFGH');
  assert.equal(item.amountUsdc, '1.25');
  assert.equal(item.txHash, '0xreceipt');
  assert.equal(item.chain, 'arc');
  assert.equal(item.status, 'done');
  assert.equal(item.movementState, 'completed');
});

test('merge removes only the legacy projection for the same reference', () => {
  const durable = movement('completed');
  const rows = mergeMovementLedger(
    [
      legacy({ id: 'projection', refId: durable.reference, ts: 2_100 }),
      legacy({ id: 'unrelated', refId: null, ts: 2_200 }),
    ],
    [durable],
    100,
  );
  assert.deepEqual(rows.map((row) => row.id), ['unrelated', durable.reference]);
});

test('pending and attention movements remain visible with honest status', () => {
  assert.equal(movementToPersonalLedgerItem(movement('created')).status, 'pending');
  assert.equal(movementToPersonalLedgerItem(movement('needs_attention')).status, 'failed');
});

test('normalizes durable financing kinds for the viewer perspective', () => {
  const durable = createMoneyMovement(
    'KWN-2345-ABCD-EFGH',
    {
      operationKey: 'financing:advance:1',
      kind: 'financing_advance',
      amountMicros: '175000000',
      initiatedBy: seller,
      participants: [
        { address: seller, role: 'source' },
        { address: buyer, role: 'recipient' },
      ],
      summary: 'advance',
      nextActor: 'karwan',
      jobId: 'job-1',
    },
    1_000,
  );
  durable.legs = [{
    id: '1:advance',
    key: 'advance',
    attempt: durable.attempt,
    label: 'advance',
    rail: 'arc_contract',
    state: 'verified',
    idempotencyKey: 'advance-key',
    sourceAddress: seller,
    destinationAddress: buyer,
    createdAt: 1_000,
  }];
  assert.equal(movementToPersonalLedgerItem(durable, seller).kind, 'financing_funded');
  assert.equal(movementToPersonalLedgerItem(durable, buyer).kind, 'financing_received');
  const repayment = { ...durable, kind: 'financing_repayment' as const };
  assert.equal(movementToPersonalLedgerItem(repayment, buyer).kind, 'financing_repaid');
  assert.equal(movementToPersonalLedgerItem(repayment, seller).kind, 'financing_repayment_sent');
});

test('merge respects the route limit after sorting newest first', () => {
  const rows = mergeMovementLedger(
    [legacy({ id: 'old', ts: 10 }), legacy({ id: 'new', ts: 30 })],
    [movement('completed')],
    2,
  );
  assert.deepEqual(rows.map((row) => row.id), ['KWN-2345-ABCD-EFGH', 'new']);
});
