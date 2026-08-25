import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { DurableTaskRunner, PostgresDurableTaskStore } from '../agents/durableTaskRunner.js';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import { PostgresFinancialRuntimeRepository } from './runtime.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import {
  createFinancialCommandOperationHandlers,
  createFinancialCommandOperationObserver,
} from './operationTask.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres operation task persists one command and one provider submission',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_financial_operation_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_financial_operation_[a-f0-9]{32}$/);
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
      const taskStore = new PostgresDurableTaskStore(client, transaction);
      const repository = new PostgresFinancialRuntimeRepository(client, transaction);
      const rooms = new PostgresAgentRuntimeRepository(client);
      await rooms.createDealRoom({ id: 'room-operation-postgres', jobId: 'job-operation-postgres', data: {}, now: 100 });
      let calls = 0;
      const adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
        async createTransfer(input) {
          calls += 1;
          assert.equal(input.idempotencyKey, 'operation:postgres:1');
          return { providerId: 'circle-operation-postgres-1', status: 'INITIATED' as const };
        },
        async executeContract() { throw new Error('unexpected contract call'); },
      };
      const data = {
        dealRoomId: 'room-operation-postgres',
        source: 'manual-review' as const,
        command: {
          commandId: 'operation-postgres-command', idempotencyKey: 'operation:postgres:1', operation: 'ESCROW_FUNDING' as const,
          amountUsdc: '5', sourceAddress: '0x1111111111111111111111111111111111111111',
          destinationAddress: '0x2222222222222222222222222222222222222222', expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
        },
        policy: { autonomousMaxUsdc: '10', allowedDestinations: ['0x2222222222222222222222222222222222222222'], requireApprovalFor: [] as const },
        current: { dealRoomVersion: 1, mandateVersion: 1 },
        descriptor: { kind: 'transfer' as const, walletId: 'wallet-postgres', tokenId: 'usdc-token', feeLevel: 'LOW' as const },
      };
      const observe = createFinancialCommandOperationObserver(taskStore, rooms);
      assert.deepEqual(await observe(data), { created: true });
      assert.deepEqual(await observe(data), { created: false });
      const runner = new DurableTaskRunner(
        taskStore,
        createFinancialCommandOperationHandlers({ repository, adapter, clock: () => 200 }),
        { workerId: 'financial-operation-postgres-worker', clock: () => 200 },
      );
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      assert.equal(calls, 1);
      assert.equal((await repository.get('operation:postgres:1'))?.providerId, 'circle-operation-postgres-1');
      const checkpoints = await taskStore.listCheckpoints('task:financial:operation:operation:postgres:1');
      assert.equal(checkpoints.length, 1);
      assert.equal((checkpoints[0]?.data as { mode?: string }).mode, 'reviewed-operation-seam');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_financial_operation_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
