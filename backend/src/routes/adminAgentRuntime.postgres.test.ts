import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  DurableTaskRunner,
  PostgresDurableTaskStore,
} from '../agents/durableTaskRunner.js';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresResearchCreditStore } from '../evidence/researchCredit.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = 'admin-runtime-postgres-test-token';

const { createAdminAgentRuntimeRoutes } = await import('./adminAgentRuntime.js');

test(
  'Postgres reviewed operation audit returns sanitized durable checkpoints',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_admin_audit_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_admin_audit_[a-f0-9]{32}$/);
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

      const store = new PostgresDurableTaskStore(client, transaction);
      await store.enqueue({
        id: 'task:postgres:reviewed-audit',
        kind: 'evidence.acquisition.operation',
        idempotencyKey: 'postgres:reviewed-audit',
        availableAt: 100,
        data: {},
        now: 100,
      });
      const runner = new DurableTaskRunner(
        store,
        {
          'evidence.acquisition.operation': async (context) => {
            await context.checkpoint({
              checkpointKey: 'evidence-operation-result',
              phase: 'authorization.recorded',
              externalId: 'provider-secret',
              data: {
                mode: 'reviewed-evidence-operation-seam',
                decision: 'wait',
                purchaseState: 'unknown',
                providerCallMade: true,
                financialMutation: true,
                endpoint: 'https://secret.invalid',
              },
            });
            return { state: 'succeeded' as const };
          },
        },
        { workerId: 'admin-runtime-postgres-worker', clock: () => 200 },
      );
      assert.equal((await runner.runOnce(200)).succeeded, 1);

      const routes = createAdminAgentRuntimeRoutes(
        () => null, () => null, () => null, () => null, () => null, () => null, undefined, () => store,
      );
      const response = await routes.request('/operation-audit?kind=evidence.acquisition.operation', {
        headers: { 'x-admin-token': 'admin-runtime-postgres-test-token' },
      });
      assert.equal(response.status, 200);
      const body = await response.json() as {
        tasks: Array<{ kind: string; checkpoint?: { data: Record<string, unknown> } }>;
        providerWritesAuthorized: boolean;
        financialMutationsAuthorized: boolean;
      };
      assert.equal(body.providerWritesAuthorized, false);
      assert.equal(body.financialMutationsAuthorized, false);
      assert.equal(body.tasks.length, 1);
      assert.equal(body.tasks[0]?.kind, 'evidence.acquisition.operation');
      assert.equal(body.tasks[0]?.checkpoint?.data.purchaseState, 'unknown');
      assert.equal('endpoint' in (body.tasks[0]?.checkpoint?.data ?? {}), false);

      const researchCredits = new PostgresResearchCreditStore(client, transaction);
      const owner = '0x2222222222222222222222222222222222222222';
      await researchCredits.ensureAccount({ owner, initialCreditUsdc: '0.5', now: 120 });
      const bootstrapRoutes = createAdminAgentRuntimeRoutes(
        undefined, undefined, undefined, undefined, undefined, undefined, () => researchCredits, undefined,
        () => ({ list: async () => [{ owner, active: true, creditUsdc: 1.5, updatedAt: 100 }] }),
      );
      const bootstrapResponse = await bootstrapRoutes.request('/research-credit/bootstrap-audit', {
        headers: { 'x-admin-token': 'admin-runtime-postgres-test-token' },
      });
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapBody = await bootstrapResponse.json() as {
        plans: Array<{ action: string; reason: string; ledgerBalanceMicros?: string }>;
        migrationWritesAuthorized: boolean;
      };
      assert.equal(bootstrapBody.migrationWritesAuthorized, false);
      assert.equal(bootstrapBody.plans[0]?.action, 'review-required');
      assert.equal(bootstrapBody.plans[0]?.reason, 'LEGACY_LEDGER_MISMATCH');
      assert.equal(bootstrapBody.plans[0]?.ledgerBalanceMicros, '500000');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_admin_audit_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
