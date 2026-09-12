import assert from 'node:assert/strict';
import test from 'node:test';
import type { withPostgresTransaction } from '../db/client.js';
import type { SqlExecutor } from '../db/migrations.js';
import { createPostgresWorldIdNullifierStore } from './worldId.js';

function database() {
  let rows = new Set<string>();
  let rollbackCount = 0;
  const transaction: typeof withPostgresTransaction = async (operation) => {
    const pending = new Set(rows);
    const tx = {
      async query(sql: string, params: readonly unknown[] = []) {
        const key = `${params[0]}:${params[1]}`;
        if (pending.has(key)) return { rows: [] };
        pending.add(key);
        // PostgreSQL INSERT without RETURNING supplies no result rows.
        return { rows: /RETURNING\s+nullifier/i.test(sql) ? [{ nullifier: params[0] }] : [] };
      },
    } as SqlExecutor;
    try {
      const result = await operation(tx);
      rows = pending;
      return result;
    } catch (error) {
      rollbackCount++;
      throw error;
    }
  };
  return { store: createPostgresWorldIdNullifierStore(transaction), rows: () => [...rows], rollbacks: () => rollbackCount };
}

const input = { action: 'test-action', environment: 'staging' as const };

test('accepts a newly inserted proof and rejects its replay', async () => {
  const db = database();
  assert.equal(await db.store.claim({ ...input, nullifiers: ['0x02'] }), true);
  assert.equal(await db.store.claim({ ...input, nullifiers: ['2'] }), false);
  assert.deepEqual(db.rows(), ['2:test-action']);
});

test('a later conflicting credential rolls back the entire proof', async () => {
  const db = database();
  await db.store.claim({ ...input, nullifiers: ['2'] });
  assert.equal(await db.store.claim({ ...input, nullifiers: ['1', '2'] }), false);
  assert.deepEqual(db.rows(), ['2:test-action']);
  assert.equal(db.rollbacks(), 1);
  assert.equal(await db.store.claim({ ...input, nullifiers: ['1'] }), true);
});

test('rejects an empty proof and normalizes repeated credential values', async () => {
  const db = database();
  assert.equal(await db.store.claim({ ...input, nullifiers: [] }), false);
  assert.equal(await db.store.claim({ ...input, nullifiers: ['0x02', '2'] }), true);
  assert.deepEqual(db.rows(), ['2:test-action']);
});

test('database outages are not misreported as proof replays', async () => {
  const outage = new Error('database offline');
  const store = createPostgresWorldIdNullifierStore(async () => { throw outage; });
  await assert.rejects(store.claim({ ...input, nullifiers: ['1'] }), outage);
});
