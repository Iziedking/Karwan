import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import {
  PostgresResearchCreditStore,
  ResearchCreditInsufficientError,
} from './researchCredit.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres research credit reservations serialize concurrent claims and settle exact spend',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 5 });
    const schema = `karwan_credit_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_credit_[a-f0-9]{32}$/);
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      const transaction = async <T>(operation: (executor: typeof client) => Promise<T>): Promise<T> => {
        const tx = await pool.connect();
        await tx.query('BEGIN');
        try {
          await tx.query(`SET LOCAL search_path TO "${schema}"`);
          const result = await operation(tx);
          await tx.query('COMMIT');
          return result;
        } catch (error) {
          await tx.query('ROLLBACK');
          throw error;
        } finally {
          tx.release();
        }
      };
      const store = new PostgresResearchCreditStore(client, transaction);
      const owner = '0x1111111111111111111111111111111111111111';
      await store.ensureAccount({ owner, initialCreditUsdc: '0.500000', now: 100 });
      const results = await Promise.allSettled([
        store.reserve({ id: 'credit-a', reservationKey: 'research:a', owner, amountUsdc: '0.400000', now: 110 }),
        store.reserve({ id: 'credit-b', reservationKey: 'research:b', owner, amountUsdc: '0.400000', now: 110 }),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected' && result.reason instanceof ResearchCreditInsufficientError).length, 1);
      const accountAfterReserve = await store.getAccount(owner);
      assert.equal(accountAfterReserve?.reservedMicros, '400000');
      assert.equal((await store.listAccounts({ owner })).length, 1);
      assert.equal((await store.listReservations({ owner, state: 'reserved' })).length, 1);
      const settled = await store.settle({ reservationKey: 'research:a', expectedVersion: 1, spentUsdc: '0.300000', now: 120 });
      assert.equal(settled.reservation.state, 'settled');
      assert.equal(settled.account.balanceMicros, '200000');
      assert.equal(settled.account.reservedMicros, '0');
      const replay = await store.reserve({ id: 'credit-a', reservationKey: 'research:a', owner, amountUsdc: '0.400000', now: 130 });
      assert.equal(replay.created, false);
      assert.equal(replay.reservation.state, 'settled');
      assert.equal((await store.listReservations({ owner, state: 'settled' })).length, 1);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_credit_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
