import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { DurableTaskRunner, PostgresDurableTaskStore } from '../agents/durableTaskRunner.js';
import { createReviewedOperationTaskHandlers } from '../agents/reviewedOperationHandlers.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import {
  createEvidenceAcquisitionOperationObserver,
  type EvidenceAcquisitionAdapter,
} from '../evidence/acquisitionTask.js';
import { evidenceNeedKey } from '../evidence/planner.js';
import { PostgresEvidenceRuntimeRepository } from '../evidence/runtime.js';
import type { DataBudget } from '../x402/dataGate.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = 'reviewed-evidence-operation-postgres-test-token';

const {
  configureReviewedEvidenceIngress,
  reviewedOperationIngressRoutes,
} = await import('./reviewedOperationIngress.js');

const headers = {
  'x-admin-token': 'reviewed-evidence-operation-postgres-test-token',
  'content-type': 'application/json',
};

test(
  'Postgres reviewed evidence ingress enqueues one durable acquisition and settles one injected receipt',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_reviewed_evidence_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_reviewed_evidence_[a-f0-9]{32}$/);
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
      const repository = new PostgresEvidenceRuntimeRepository(client, transaction);
      await rooms.createDealRoom({
        id: 'room-reviewed-evidence-postgres',
        jobId: 'job-reviewed-evidence-postgres',
        data: {},
        now: 100,
      });
      const budgetOwner = '0x3333333333333333333333333333333333333333';
      const spent: Array<{ owner: string; usd: number }> = [];
      const budget: DataBudget = {
        fits: async () => true,
        spent: async (owner, usd) => {
          spent.push({ owner, usd });
        },
        reached: () => undefined,
      };
      const payTo = '0x2222222222222222222222222222222222222222';
      const body = {
        dealRoomId: 'room-reviewed-evidence-postgres',
        source: 'manual-review' as const,
        idempotencyKey: 'reviewed-evidence:postgres:1',
        budgetOwner,
        planner: {
          need: {
            needId: 'need-reviewed-evidence-postgres',
            claim: 'completed-transactions' as const,
            subject: '0x1111111111111111111111111111111111111111',
            decision: 'qualification' as const,
            requiredFreshnessSeconds: 3_600,
            minimumReliability: 70,
            maximumPriceUsdc: '1',
            mandateVersion: 1,
            policyVersion: 'policy-reviewed-evidence-1',
            expiresAtUnix: 1_000,
          },
          nowUnix: 100,
          cachedSnapshots: [],
          providers: [{
            providerId: 'provider-reviewed-evidence',
            source: 'x402' as const,
            endpoint: 'https://evidence.example.test/v1',
            network: 'arc-testnet',
            asset: 'USDC',
            payTo,
            priceUsdc: '0.25',
            expectedReliability: 90,
            responseLimitBytes: 100_000,
            providerVersion: '2026-08-24',
            claims: ['completed-transactions' as const],
            provenanceRequirements: ['receipt'],
            enabled: true,
            circuit: { state: 'closed' as const, consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
          }],
          expectedDecisionValueUsdc: '5',
          perDealSpentUsdc: '0',
          perDealBudgetUsdc: '1',
          allowedNetworks: ['arc-testnet'],
          allowedAssets: ['USDC'],
          allowedPayTo: [payTo],
          requiredProvenance: ['receipt'],
        },
      };

      let adapterCalls = 0;
      const adapter: EvidenceAcquisitionAdapter = {
        async acquire(input) {
          adapterCalls += 1;
          assert.equal(input.idempotencyKey, `evidence:${evidenceNeedKey(body.planner.need)}:provider-reviewed-evidence`);
          return {
            state: 'settled' as const,
            providerTransactionId: 'fake-reviewed-evidence-provider-tx',
            txHash: '0xfake-reviewed-evidence-receipt',
            snapshot: {
              snapshotId: 'snapshot-reviewed-evidence-postgres',
              needId: body.planner.need.needId,
              source: 'x402' as const,
              capturedAtUnix: 100,
              reliability: 90,
              status: 'fresh' as const,
              provenance: ['receipt:fake-reviewed-evidence'],
              responseHash: 'hash-reviewed-evidence-postgres',
            },
          };
        },
      };

      disposeIngress = configureReviewedEvidenceIngress(
        createEvidenceAcquisitionOperationObserver(taskStore, rooms),
      );
      const first = await reviewedOperationIngressRoutes.request('/evidence', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(first.status, 202);
      assert.deepEqual(await first.json(), {
        mode: 'reviewed-evidence-operation-seam',
        taskKind: 'evidence.acquisition.operation',
        legacyRoutesEnqueue: false,
        providerWritesAuthorized: false,
        evidenceProviderCallsAuthorized: false,
        created: true,
      });

      const duplicate = await reviewedOperationIngressRoutes.request('/evidence', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(duplicate.status, 200);
      assert.equal((await duplicate.json()).created, false);

      const runner = new DurableTaskRunner(
        taskStore,
        createReviewedOperationTaskHandlers({
          evidenceRepository: repository,
          evidenceAdapter: adapter,
          evidenceBudget: budget,
        }),
        { workerId: 'reviewed-evidence-postgres-worker', clock: () => 200 },
      );
      assert.deepEqual(await runner.runOnce(200), {
        succeeded: 1,
        waiting: 0,
        retried: 0,
        deadLettered: 0,
        leaseLost: 0,
      });
      assert.equal(adapterCalls, 1);

      const purchaseKey = `evidence:${evidenceNeedKey(body.planner.need)}:provider-reviewed-evidence`;
      const purchase = await repository.getPurchaseByIdempotencyKey(purchaseKey);
      assert.equal(purchase?.state, 'settled');
      assert.equal(purchase?.txHash, '0xfake-reviewed-evidence-receipt');
      assert.equal((await repository.listSnapshots(purchase!.evidenceNeedId)).length, 1);
      assert.deepEqual(spent, [{ owner: budgetOwner, usd: 0.25 }]);
      assert.equal(purchase?.data.budgetRecorded, true);
    } finally {
      disposeIngress?.();
      await client.query('RESET search_path');
      if (!/^karwan_reviewed_evidence_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
