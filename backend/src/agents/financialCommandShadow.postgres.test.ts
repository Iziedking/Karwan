import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { DurableTaskRunner, PostgresDurableTaskStore } from './durableTaskRunner.js';
import {
  createFinancialCommandShadowHandlers,
  createFinancialCommandShadowObserver,
} from './financialCommandShadow.js';
import { PostgresFinancialRuntimeRepository } from '../financial/runtime.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres financial shadow task survives duplicate delivery and records unknown provider state',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_financial_shadow_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_financial_shadow_[a-f0-9]{32}$/);
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
      const observe = createFinancialCommandShadowObserver(taskStore, rooms);
      const data = {
        dealRoomId: 'room-financial-shadow',
        source: 'manual-fixture' as const,
        command: {
          commandId: 'financial-shadow-command-1', idempotencyKey: 'financial:shadow:1', operation: 'STAKE' as const,
          amountUsdc: '5', sourceAddress: '0x1111111111111111111111111111111111111111',
          destinationAddress: '0x2222222222222222222222222222222222222222',
          expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
        },
        policy: { autonomousMaxUsdc: '10', allowedDestinations: ['0x2222222222222222222222222222222222222222'], requireApprovalFor: [] as const },
        current: { dealRoomVersion: 1, mandateVersion: 1 },
        providerObservation: { lifecycle: 'UNKNOWN' as const, providerId: 'circle-shadow-1' },
      };
      await observe({ data });
      await observe({ data });
      const runner = new DurableTaskRunner(
        taskStore,
        createFinancialCommandShadowHandlers(repository, { clock: () => 200 }),
        { workerId: 'financial-shadow-postgres-worker', clock: () => 200 },
      );
      const result = await runner.runOnce(200);
      assert.equal(result.succeeded, 1);
      const record = await repository.get('financial:shadow:1');
      assert.equal(record?.providerLifecycle, 'UNKNOWN');
      assert.equal(record?.providerId, 'circle-shadow-1');
      assert.equal((await rooms.getDealRoom('room-financial-shadow'))?.state, 'open');
      const task = (await taskStore.listDeadLetters(10)).find((candidate) => candidate.id.includes('financial:shadow:1'));
      assert.equal(task, undefined);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_financial_shadow_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
