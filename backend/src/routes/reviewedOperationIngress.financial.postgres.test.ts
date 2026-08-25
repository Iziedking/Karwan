import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { DurableTaskRunner, PostgresDurableTaskStore } from '../agents/durableTaskRunner.js';
import { createReviewedOperationTaskHandlers } from '../agents/reviewedOperationHandlers.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import { PostgresFinancialRuntimeRepository } from '../financial/runtime.js';
import { createFinancialCommandOperationObserver } from '../financial/operationTask.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = 'reviewed-financial-operation-postgres-test-token';

const {
  configureReviewedFinancialOperationIngress,
  reviewedOperationIngressRoutes,
} = await import('./reviewedOperationIngress.js');

const headers = {
  'x-admin-token': 'reviewed-financial-operation-postgres-test-token',
  'content-type': 'application/json',
};

test(
  'Postgres reviewed financial ingress enqueues one durable operation and runs one injected adapter call',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_reviewed_financial_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_reviewed_financial_[a-f0-9]{32}$/);
    const client = await pool.connect();
    let disposeIngress: (() => void) | undefined;
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
      const rooms = new PostgresAgentRuntimeRepository(client);
      const repository = new PostgresFinancialRuntimeRepository(client, transaction);
      await rooms.createDealRoom({
        id: 'room-reviewed-financial-postgres',
        jobId: 'job-reviewed-financial-postgres',
        data: {},
        now: 100,
      });

      let adapterCalls = 0;
      const adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
        async createTransfer(input) {
          adapterCalls += 1;
          assert.equal(input.idempotencyKey, 'reviewed-financial:postgres:1');
          return { providerId: 'fake-reviewed-financial-provider-1', status: 'INITIATED' as const };
        },
        async executeContract() {
          throw new Error('unexpected contract call');
        },
      };

      const body = {
        dealRoomId: 'room-reviewed-financial-postgres',
        source: 'manual-review' as const,
        command: {
          commandId: 'reviewed-financial-postgres-command',
          idempotencyKey: 'reviewed-financial:postgres:1',
          operation: 'ESCROW_FUNDING' as const,
          amountUsdc: '5',
          sourceAddress: '0x1111111111111111111111111111111111111111',
          destinationAddress: '0x2222222222222222222222222222222222222222',
          expectedDealRoomVersion: 1,
          mandateVersion: 1,
          nowUnix: 100,
        },
        policy: {
          autonomousMaxUsdc: '10',
          allowedDestinations: ['0x2222222222222222222222222222222222222222'],
          requireApprovalFor: [] as const,
        },
        current: { dealRoomVersion: 1, mandateVersion: 1 },
        descriptor: {
          kind: 'transfer' as const,
          walletId: 'wallet-reviewed-financial-postgres',
          tokenId: 'usdc-token',
          feeLevel: 'LOW' as const,
        },
      };

      const observer = createFinancialCommandOperationObserver(taskStore, rooms);
      disposeIngress = configureReviewedFinancialOperationIngress(observer);

      const first = await reviewedOperationIngressRoutes.request('/financial-operation', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(first.status, 202);
      assert.deepEqual(await first.json(), {
        mode: 'reviewed-operation-seam',
        taskKind: 'financial.command.operation',
        legacyRoutesEnqueue: false,
        providerWritesAuthorized: false,
        financialMutationsAuthorized: false,
        created: true,
      });

      const duplicate = await reviewedOperationIngressRoutes.request('/financial-operation', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(duplicate.status, 200);
      assert.deepEqual((await duplicate.json()).created, false);

      const runner = new DurableTaskRunner(
        taskStore,
        createReviewedOperationTaskHandlers({ financialRepository: repository, financialAdapter: adapter }),
        { workerId: 'reviewed-financial-postgres-worker', clock: () => 200 },
      );
      assert.deepEqual(await runner.runOnce(200), {
        succeeded: 1,
        waiting: 0,
        retried: 0,
        deadLettered: 0,
        leaseLost: 0,
      });
      assert.equal(adapterCalls, 1);

      const record = await repository.get('reviewed-financial:postgres:1');
      assert.equal(record?.providerId, 'fake-reviewed-financial-provider-1');
      assert.equal(record?.providerLifecycle, 'SUBMITTED');
      const checkpoints = await taskStore.listCheckpoints(
        'task:financial:operation:reviewed-financial:postgres:1',
      );
      assert.equal(checkpoints.length, 1);
      assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, true);
      assert.equal((checkpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, true);
    } finally {
      disposeIngress?.();
      await client.query('RESET search_path');
      if (!/^karwan_reviewed_financial_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
