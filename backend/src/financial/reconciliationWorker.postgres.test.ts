import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import { runNumberedMigrations } from '../db/migrations.js';
import { createFinancialReconciliationWorker } from './reconciliationWorker.js';
import { PostgresFinancialRuntimeRepository } from './runtime.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres reconciliation resolves an uncertain provider state without resubmitting',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 3 });
    const schema = `karwan_financial_reconcile_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_financial_reconcile_[a-f0-9]{32}$/);
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
      const command = {
        commandId: 'reconcile-postgres-command',
        idempotencyKey: 'financial:reconcile:postgres',
        operation: 'ESCROW_FUNDING' as const,
        amountUsdc: '5',
        amountMicros: '5000000',
        sourceAddress: '0x1111111111111111111111111111111111111111',
        destinationAddress: '0x2222222222222222222222222222222222222222',
        expectedDealRoomVersion: 1,
        mandateVersion: 1,
        decision: 'AUTHORIZED' as const,
        reason: 'POLICY_ACCEPTED',
        data: { mode: 'postgres-reconciliation-test' },
        now: 100,
      };
      const created = await repository.recordDecision(command);
      const unknown = await repository.recordProviderUpdate(
        created.record.idempotencyKey,
        created.record.version,
        { lifecycle: 'UNKNOWN', providerId: 'fake-reconcile-provider-1' },
        110,
      );
      assert.equal(unknown.providerLifecycle, 'UNKNOWN');

      let polls = 0;
      let createOrExecuteCalls = 0;
      const adapter: Pick<CircleWalletAdapter, 'getTransaction'> = {
        async getTransaction(providerId) {
          polls += 1;
          assert.equal(providerId, 'fake-reconcile-provider-1');
          return {
            providerId,
            status: 'COMPLETE' as const,
            txHash: '0xfake-reconcile-settled',
            raw: { source: 'in-memory-test-adapter' },
          };
        },
      };
      const worker = createFinancialReconciliationWorker(repository, adapter, {
        now: () => 120,
        onError: (error) => { throw error; },
      });

      const first = await worker.runOnce();
      assert.deepEqual(first, { scanned: 1, polled: 1, updated: 1, skipped: 0, errors: [] });
      assert.equal(polls, 1);
      assert.equal(createOrExecuteCalls, 0);
      const settled = await repository.get(command.idempotencyKey);
      assert.equal(settled?.providerLifecycle, 'SETTLED');
      assert.equal(settled?.providerId, 'fake-reconcile-provider-1');
      assert.equal(settled?.txHash, '0xfake-reconcile-settled');

      const replay = await worker.runOnce();
      assert.deepEqual(replay, { scanned: 1, polled: 0, updated: 0, skipped: 1, errors: [] });
      assert.equal(polls, 1);
      assert.equal(createOrExecuteCalls, 0);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_financial_reconcile_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
