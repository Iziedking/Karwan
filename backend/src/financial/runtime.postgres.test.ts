import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresFinancialRuntimeRepository } from './runtime.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres financial command runtime preserves decision idempotency and provider reconciliation',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 3 });
    const schema = `karwan_financial_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_financial_[a-f0-9]{32}$/);
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
      const repository = new PostgresFinancialRuntimeRepository(client, transaction);
      const input = {
        commandId: 'command-1', idempotencyKey: 'financial:command-1', operation: 'STAKE' as const,
        amountUsdc: '5', amountMicros: '5000000',
        sourceAddress: '0x1111111111111111111111111111111111111111',
        destinationAddress: '0x2222222222222222222222222222222222222222',
        expectedDealRoomVersion: 1, mandateVersion: 1,
        decision: 'AUTHORIZED' as const, reason: 'POLICY_ACCEPTED', data: { test: true }, now: 100,
      };
      const created = await repository.recordDecision(input);
      const duplicate = await repository.recordDecision(input);
      assert.equal(created.created, true);
      assert.equal(duplicate.created, false);
      await assert.rejects(() => repository.recordDecision({ ...input, commandId: 'ignored' }), /duplicate financial runtime boundary/);
      const unknown = await repository.recordProviderUpdate(input.idempotencyKey, created.record.version, { lifecycle: 'UNKNOWN', providerId: 'circle-1' }, 200);
      const duplicateUnknown = await repository.recordProviderUpdate(input.idempotencyKey, unknown.version, { lifecycle: 'UNKNOWN', providerId: 'circle-1' }, 250);
      assert.equal(duplicateUnknown.version, unknown.version);
      const settled = await repository.recordProviderUpdate(input.idempotencyKey, unknown.version, { lifecycle: 'SETTLED', providerId: 'circle-1', txHash: '0xsettled' }, 300);
      assert.equal(settled.providerLifecycle, 'SETTLED');
      assert.equal((await repository.get(input.idempotencyKey))?.txHash, '0xsettled');
      await assert.rejects(() => repository.recordProviderUpdate(input.idempotencyKey, settled.version, { lifecycle: 'SUBMITTED', providerId: 'circle-1' }), /invalid provider lifecycle/);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_financial_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
