import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { DurableTaskRunner, PostgresDurableTaskStore } from '../agents/durableTaskRunner.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresNegotiationAttemptStore } from './attempts.js';
import {
  createNegotiationOperationHandlers,
  createNegotiationOperationObserver,
} from './operationTask.js';
import { PostgresNegotiationRuntime } from './postgresRuntime.js';
import { PostgresMandateSnapshotStore } from './mandates.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres reviewed negotiation operation persists one attempt and one versioned offer',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_negotiation_operation_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_negotiation_operation_[a-f0-9]{32}$/);
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
      const rooms = new PostgresAgentRuntimeRepository(client);
      await rooms.createDealRoom({
        id: 'room-negotiation-operation-postgres', jobId: 'job-negotiation-operation-postgres',
        data: { buyerMandateVersion: 3, sellerMandateVersion: 4 }, now: 90,
      });
      const attempts = new PostgresNegotiationAttemptStore(client);
      const mandateStore = new PostgresMandateSnapshotStore(client);
      const runtime = new PostgresNegotiationRuntime(transaction);
      const data = {
        dealRoomId: 'room-negotiation-operation-postgres', source: 'manual-review' as const,
        commandId: 'negotiation-postgres-command', idempotencyKey: 'negotiation-operation:postgres:1', expectedDealRoomVersion: 1,
        rawOffer: {
          dealRoomId: 'room-negotiation-operation-postgres', offerId: 'offer-negotiation-postgres-1', offerVersion: 1,
          senderRole: 'buyer' as const, recipientRole: 'seller' as const, kind: 'OPENING' as const,
          action: 'REVISE_PRICE' as const, priceUsdc: '125', deadlineUnix: 2_000,
          buyerMandateVersion: 3, sellerMandateVersion: 4,
          terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
        },
        mandates: { buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4 },
        attempt: { id: 'attempt-negotiation-postgres-1', attemptNumber: 1, trigger: 'INITIAL_MATCH' as const, triggerReference: 'match-postgres-1', strategy: { style: 'balanced' } },
        observedAtUnix: 100,
      };
      const observe = createNegotiationOperationObserver(taskStore, rooms, mandateStore);
      assert.deepEqual(await observe(data), { created: true });
      assert.deepEqual(await observe(data), { created: false });
      const mandateRows = await client.query<{ role: string; mandate_version: number | string }>(
        'SELECT role, mandate_version FROM negotiation_mandates_v2 ORDER BY role',
      );
      assert.deepEqual(mandateRows.rows.map((row) => [row.role, Number(row.mandate_version)]), [['BUYER', 3], ['SELLER', 4]]);
      const runner = new DurableTaskRunner(
        taskStore,
        createNegotiationOperationHandlers({
          attempts,
          clock: () => 200,
          executor: {
            async publishOffer(input) {
              return runtime.publishOffer(input);
            },
          },
        }),
        { workerId: 'negotiation-operation-postgres-worker', clock: () => 200 },
      );
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      assert.equal((await attempts.get(data.attempt.id))?.state, 'waiting');
      const offers = await client.query<{ id: string; offer_version: number | string; state: string }>('SELECT id, offer_version, state FROM offers');
      assert.equal(offers.rows.length, 1);
      assert.equal(offers.rows[0]?.id, 'offer-negotiation-postgres-1');
      assert.equal(Number(offers.rows[0]?.offer_version), 1);
      assert.equal(offers.rows[0]?.state, 'proposed');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_negotiation_operation_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
