import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  DurableTaskRunner,
  PostgresDurableTaskStore,
} from '../agents/durableTaskRunner.js';
import { createReviewedOperationTaskHandlers } from '../agents/reviewedOperationHandlers.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresNegotiationAttemptStore } from '../negotiation/attempts.js';
import {
  createNegotiationOperationObserver,
} from '../negotiation/operationTask.js';
import { PostgresNegotiationRuntime } from '../negotiation/postgresRuntime.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = 'reviewed-operation-postgres-test-token';

const {
  configureReviewedNegotiationIngress,
  reviewedOperationIngressRoutes,
} = await import('./reviewedOperationIngress.js');

const headers = {
  'x-admin-token': 'reviewed-operation-postgres-test-token',
  'content-type': 'application/json',
};

test(
  'Postgres reviewed ingress survives duplicate delivery and runs one deterministic operation',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_reviewed_ingress_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_reviewed_ingress_[a-f0-9]{32}$/);
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
      const attempts = new PostgresNegotiationAttemptStore(client);
      const runtime = new PostgresNegotiationRuntime(transaction);
      const observer = createNegotiationOperationObserver(taskStore, rooms);
      disposeIngress = configureReviewedNegotiationIngress(observer);

      const body = {
        dealRoomId: 'room-reviewed-ingress-postgres',
        source: 'manual-review' as const,
        commandId: 'reviewed-ingress-postgres-command',
        idempotencyKey: 'reviewed-ingress-postgres-idempotency',
        expectedDealRoomVersion: 1,
        rawOffer: {
          dealRoomId: 'room-reviewed-ingress-postgres',
          offerId: 'reviewed-ingress-postgres-offer',
          offerVersion: 1,
          senderRole: 'buyer' as const,
          recipientRole: 'seller' as const,
          kind: 'OPENING' as const,
          action: 'REVISE_PRICE' as const,
          priceUsdc: '125',
          deadlineUnix: 2_000,
          buyerMandateVersion: 3,
          sellerMandateVersion: 4,
          terms: { scope: 'postgres-ingress', delivery: '48 hours', paymentTerms: 'after acceptance' },
        },
        mandates: {
          buyerMaxPriceUsdc: '150',
          sellerMinPriceUsdc: '100',
          buyerMandateVersion: 3,
          sellerMandateVersion: 4,
        },
        attempt: {
          id: 'reviewed-ingress-postgres-attempt',
          attemptNumber: 1,
          trigger: 'INITIAL_MATCH' as const,
          triggerReference: 'reviewed-ingress-postgres-trigger',
          strategy: { style: 'balanced' },
        },
        observedAtUnix: 100,
      };

      const first = await reviewedOperationIngressRoutes.request('/negotiation', {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      assert.equal(first.status, 202);
      const duplicate = await reviewedOperationIngressRoutes.request('/negotiation', {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      assert.equal(duplicate.status, 200);

      const handlers = createReviewedOperationTaskHandlers({
        negotiationAttempts: attempts,
        negotiationExecutor: {
          async publishOffer(input) {
            return runtime.publishOffer(input);
          },
        },
      });
      const runner = new DurableTaskRunner(taskStore, handlers, {
        workerId: 'reviewed-ingress-postgres-worker',
        clock: () => 200,
      });
      assert.deepEqual(await runner.runOnce(200), {
        succeeded: 1, waiting: 0, retried: 0, deadLettered: 0, leaseLost: 0,
      });

      const taskId = 'task:negotiation:operation:reviewed-ingress-postgres-idempotency';
      const task = await client.query<{ state: string; attempt: number | string }>(
        'SELECT state, attempt FROM agent_tasks WHERE id = $1',
        [taskId],
      );
      assert.equal(task.rows.length, 1);
      assert.equal(task.rows[0]?.state, 'succeeded');
      assert.equal(Number(task.rows[0]?.attempt), 1);
      const attempt = await attempts.get(body.attempt.id);
      assert.equal(attempt?.state, 'waiting');
      const offers = await client.query<{ id: string; offer_version: number | string }>(
        'SELECT id, offer_version FROM offers',
      );
      assert.equal(offers.rows.length, 1);
      assert.equal(offers.rows[0]?.id, body.rawOffer.offerId);
      assert.equal(Number(offers.rows[0]?.offer_version), 1);
      const checkpoints = await client.query<{ checkpoint_key: string; data: Record<string, unknown> }>(
        'SELECT checkpoint_key, data FROM agent_task_checkpoints WHERE task_id = $1',
        [taskId],
      );
      assert.equal(checkpoints.rows.length, 1);
      assert.equal(checkpoints.rows[0]?.checkpoint_key, 'negotiation-operation-result');
      assert.equal(checkpoints.rows[0]?.data.providerCallMade, false);
      assert.equal(checkpoints.rows[0]?.data.financialMutation, false);
    } finally {
      disposeIngress?.();
      await client.query('RESET search_path');
      if (!/^karwan_reviewed_ingress_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
