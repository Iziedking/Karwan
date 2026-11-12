import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MoneyMovement, MoneyMovementLeg } from '../money/model.js';
import { deskMoveRow, deskMoves } from './deskMoves.js';

/// Money moves on the desk (view 79): every movement in plain words, stuck
/// ones first.
///
///   npx tsx --test src/ops/deskMoves.test.ts

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 12, 14, 0);

function leg(over: Partial<MoneyMovementLeg> = {}): MoneyMovementLeg {
  return { id: 'l1', key: 'k', attempt: 1, label: 'Move', rail: 'circle_wallets', state: 'planned', idempotencyKey: 'i', createdAt: NOW - 2 * HOUR, walletId: 'wallet-secret', ...over };
}

function move(over: Partial<MoneyMovement> = {}): MoneyMovement {
  return {
    reference: 'KWN-AAAA2222BBBB',
    operationKey: 'op',
    kind: 'cash_out',
    state: 'submitted',
    version: 1,
    attempt: 1,
    currency: 'USDC',
    amountMicros: '52100000',
    initiatedBy: '0xchidi',
    participants: [{ address: '0xchidi', role: 'owner' }],
    summary: 'private words',
    nextActor: 'karwan',
    legs: [leg()],
    createdAt: NOW - 2 * HOUR,
    updatedAt: NOW - 2 * HOUR,
    ...over,
  };
}

const handles = (a: string) => (a === '0xchidi' ? 'chidi' : null);

test('a withdrawal that left Arc and has not arrived past its time is stuck: Left, not arrived', () => {
  const row = deskMoveRow(move({ expectedArrivalAt: NOW - HOUR, legs: [leg({ state: 'confirmed', txHash: '0xtx1' })] }), NOW, handles);
  assert.equal(row.status, 'stuck');
  assert.equal(row.statusLabel, 'Left, not arrived');
  assert.equal(row.what, 'Withdraw');
  assert.equal(row.who, '@chidi');
  assert.equal(row.amountUsdc, '52.1');
  assert.equal(row.route, 'Arc → outside');
  assert.deepEqual(row.txHashes, ['0xtx1']);
});

test('with no expected time, an open move is stuck an hour after it began', () => {
  assert.equal(deskMoveRow(move({ createdAt: NOW - 59 * 60_000 }), NOW, handles).status, 'moving');
  const late = deskMoveRow(move({ kind: 'deposit', createdAt: NOW - 61 * 60_000 }), NOW, handles);
  assert.equal(late.status, 'stuck');
  assert.equal(late.statusLabel, 'Late');
});

test('a move that needs a person after two tries reads Failed twice and is stuck', () => {
  const row = deskMoveRow(move({ state: 'needs_attention', attempt: 2, createdAt: NOW - 5 * 60_000 }), NOW, handles);
  assert.equal(row.status, 'stuck');
  assert.equal(row.statusLabel, 'Failed twice');
  assert.equal(deskMoveRow(move({ state: 'needs_attention', attempt: 1 }), NOW, handles).statusLabel, 'Needs a person');
});

test('moving, failed and done read in plain words', () => {
  const verifying = deskMoveRow(move({ kind: 'deposit', state: 'verifying', createdAt: NOW - 10 * 60_000, legs: [leg({ rail: 'cctp' })] }), NOW, handles);
  assert.equal(verifying.status, 'moving');
  assert.equal(verifying.statusLabel, 'Waiting on network');
  assert.equal(verifying.route, 'Another network → Arc');
  const cancelled = deskMoveRow(move({ state: 'cancelled', cancelledAt: NOW - HOUR }), NOW, handles);
  assert.equal(cancelled.status, 'failed');
  assert.equal(cancelled.statusLabel, 'Did not go through');
  const done = deskMoveRow(move({ state: 'completed', completedAt: NOW - HOUR }), NOW, handles);
  assert.equal(done.status, 'done');
  assert.equal(done.statusLabel, 'Done');
  assert.equal(done.since, NOW - HOUR);
});

test('a row names no wallet ids, provider ids or summaries, and an unknown person by a short address', () => {
  const row = deskMoveRow(move({ initiatedBy: '0x1234567890abcdef1234', legs: [leg({ providerId: 'prov-secret' })] }), NOW, handles);
  const text = JSON.stringify(row);
  for (const secret of ['wallet-secret', 'prov-secret', 'private words', 'operationKey', 'participants']) assert.ok(!text.includes(secret), secret);
  assert.equal(row.who, '0x1234…1234');
});

test('the list puts stuck first (oldest first), then moving, failed, and only today\'s done', () => {
  const list = deskMoves(
    [
      move({ reference: 'DONE-OLD', state: 'completed', completedAt: NOW - 30 * HOUR }),
      move({ reference: 'DONE-TODAY', state: 'completed', completedAt: NOW - HOUR }),
      move({ reference: 'MOVING', createdAt: NOW - 5 * 60_000 }),
      move({ reference: 'FAILED', state: 'cancelled', cancelledAt: NOW - HOUR }),
      move({ reference: 'STUCK-NEW', createdAt: NOW - 2 * HOUR }),
      move({ reference: 'STUCK-OLD', createdAt: NOW - 9 * HOUR }),
    ],
    NOW,
    handles,
  );
  assert.deepEqual(list.rows.map((r) => r.reference), ['STUCK-OLD', 'STUCK-NEW', 'MOVING', 'FAILED', 'DONE-TODAY']);
  assert.deepEqual(list.counts, { stuck: 2, moving: 1, failed: 1, done: 1 });
});
