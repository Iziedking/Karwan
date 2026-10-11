import assert from 'node:assert/strict';
import type { DeletionStore } from './store.js';

const DAY = 86_400_000;
const T0 = 1_800_000_000_000;

/// The behaviour both stores must have. Run against memory and Postgres.
export async function checkDeletionStore(store: DeletionStore): Promise<void> {
  const alice = `0x${'a'.repeat(40)}`;
  const bob = `0x${'b'.repeat(40)}`;
  const base = { channel: 'telegram', requestedVia: 'chat' as const, requestedAt: T0, dueAt: T0 + 7 * DAY };

  const first = await store.schedule({ ...base, id: 'd1', address: alice.toUpperCase().replace('0X', '0x') });
  assert.equal(first?.state, 'scheduled');
  assert.equal(first?.address, alice, 'addresses are kept lowercased');
  assert.deepEqual(first?.record, { removed: [], kept: [], walletIds: [] });

  assert.equal(await store.schedule({ ...base, id: 'd2', address: alice }), null, 'one open deletion per account');
  assert.equal((await store.open(alice))?.id, 'd1');
  assert.equal(await store.open(bob), null);

  assert.deepEqual((await store.due(T0 + 7 * DAY - 1)).map((r) => r.id), [], 'nothing runs before the wait ends');
  assert.deepEqual((await store.due(T0 + 7 * DAY)).map((r) => r.id), ['d1']);

  assert.equal(await store.move('d1', 'erasing', { state: 'done' }), false, 'a move from the wrong state does nothing');
  assert.equal(await store.move('d1', 'scheduled', { state: 'cancelled', closedAt: T0 + DAY }), true);
  assert.equal(await store.move('d1', 'scheduled', { state: 'erasing' }), false, 'a cancelled deletion cannot start');
  assert.equal(await store.open(alice), null);
  assert.equal((await store.get('d1'))?.closedAt, T0 + DAY);

  const again = await store.schedule({ ...base, id: 'd3', address: alice, requestedAt: T0 + DAY });
  assert.equal(again?.state, 'scheduled', 'a new request after a cancel is allowed');
  assert.equal(await store.move('d3', 'scheduled', { state: 'erasing', record: { removed: [], kept: [], walletIds: ['w-1'] } }), true);
  assert.deepEqual((await store.due(T0)).map((r) => r.id), ['d3'], 'an unfinished erase is picked up again whatever the time');
  assert.deepEqual((await store.get('d3'))?.record.walletIds, ['w-1']);

  await store.setRecord('d3', { removed: ['profile'], kept: ['deals'], walletIds: ['w-1'], toldAt: T0 + 8 * DAY });
  assert.equal((await store.get('d3'))?.record.toldAt, T0 + 8 * DAY);

  assert.equal(await store.move('d3', 'erasing', { state: 'done', closedAt: T0 + 8 * DAY, nullifiersUntil: T0 + 373 * DAY }), true);
  assert.deepEqual((await store.nullifiersDue(T0 + 373 * DAY - 1)).map((r) => r.id), []);
  assert.deepEqual((await store.nullifiersDue(T0 + 373 * DAY)).map((r) => r.id), ['d3']);
  await store.markNullifiersReleased('d3', T0 + 373 * DAY);
  assert.deepEqual((await store.nullifiersDue(T0 + 400 * DAY)).map((r) => r.id), [], 'released once');

  await store.schedule({ ...base, id: 'd4', address: bob, requestedVia: 'admin', requestedAt: T0 + 2 * DAY });
  assert.deepEqual((await store.list(10)).map((r) => r.id), ['d4', 'd3', 'd1'], 'newest first');
  assert.equal((await store.get('d4'))?.requestedVia, 'admin');
}
