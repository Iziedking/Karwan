import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryMandateSnapshotStore,
  MandateVersionConflictError,
  mandateConstraintsHash,
  parseNegotiationMandates,
} from './mandates.js';

const mandates = {
  buyerMaxPriceUsdc: '150',
  sellerMinPriceUsdc: '100.00',
  earliestDeadlineUnix: 1_000,
  latestDeadlineUnix: 2_000,
  buyerMandateVersion: 3,
  sellerMandateVersion: 4,
};

test('mandate compiler is strict, bounded, and normalizes valid input', () => {
  assert.deepEqual(parseNegotiationMandates({ ...mandates }), mandates);
  assert.throws(() => parseNegotiationMandates({ ...mandates, unexpected: true }), /Unrecognized key/);
  assert.throws(() => parseNegotiationMandates({ ...mandates, sellerMinPriceUsdc: '151' }), /seller floor exceeds buyer cap/);
  assert.throws(() => parseNegotiationMandates({ ...mandates, earliestDeadlineUnix: 2_001 }), /latest deadline precedes earliest deadline/);
});

test('mandate hashes are stable across property order and remain role-specific', () => {
  const reordered = {
    sellerMandateVersion: 4,
    buyerMandateVersion: 3,
    latestDeadlineUnix: 2_000,
    earliestDeadlineUnix: 1_000,
    sellerMinPriceUsdc: '100.00',
    buyerMaxPriceUsdc: '150',
  };
  assert.equal(mandateConstraintsHash('BUYER', mandates), mandateConstraintsHash('BUYER', reordered));
  assert.notEqual(mandateConstraintsHash('BUYER', mandates), mandateConstraintsHash('SELLER', mandates));
});

test('immutable mandate snapshots replay identical versions and reject conflicting reuse', async () => {
  const store = new InMemoryMandateSnapshotStore();
  const first = await store.put({ dealRoomId: 'room-1', role: 'BUYER', version: 3, mandates, createdAt: 100 });
  const replay = await store.put({ dealRoomId: 'room-1', role: 'BUYER', version: 3, mandates, createdAt: 999 });
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.deepEqual(replay.record, first.record);
  await assert.rejects(
    store.put({ dealRoomId: 'room-1', role: 'BUYER', version: 3, mandates: { ...mandates, buyerMaxPriceUsdc: '149' }, createdAt: 101 }),
    MandateVersionConflictError,
  );
  const seller = await store.put({ dealRoomId: 'room-1', role: 'SELLER', version: 4, mandates, createdAt: 100 });
  assert.notEqual(seller.record.id, first.record.id);
  assert.deepEqual(await store.get('room-1', 'BUYER', 3), first.record);
});

test('mandate versions must match their declared role', async () => {
  const store = new InMemoryMandateSnapshotStore();
  await assert.rejects(
    store.put({ dealRoomId: 'room-1', role: 'SELLER', version: 3, mandates, createdAt: 100 }),
    /MANDATE_VERSION_MISMATCH_SELLER/,
  );
});
