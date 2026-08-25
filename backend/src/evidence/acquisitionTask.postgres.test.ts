import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { DurableTaskRunner, PostgresDurableTaskStore } from '../agents/durableTaskRunner.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import {
  createEvidenceAcquisitionOperationHandlers,
  createEvidenceAcquisitionOperationObserver,
} from './acquisitionTask.js';
import { PostgresEvidenceRuntimeRepository } from './runtime.js';
import { evidenceNeedKey } from './planner.js';
import { PostgresResearchCreditStore } from './researchCredit.js';
import { createX402EvidenceAcquisitionAdapter } from './x402Adapter.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres reviewed evidence acquisition persists one purchase, receipt, snapshot, and settled research credit',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_evidence_operation_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_evidence_operation_[a-f0-9]{32}$/);
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
      const repository = new PostgresEvidenceRuntimeRepository(client, transaction);
      const researchCredits = new PostgresResearchCreditStore(client, transaction);
      const rooms = new PostgresAgentRuntimeRepository(client);
      await rooms.createDealRoom({ id: 'room-evidence-operation-postgres', jobId: 'job-evidence-operation-postgres', data: {}, now: 100 });
      const payTo = '0x2222222222222222222222222222222222222222';
      const researchCreditOwner = '0x3333333333333333333333333333333333333333';
      await researchCredits.ensureAccount({ owner: researchCreditOwner, initialCreditUsdc: '1', now: 100 });
      const data = {
        dealRoomId: 'room-evidence-operation-postgres', source: 'manual-review' as const,
        idempotencyKey: 'evidence-operation:postgres:1',
        researchCreditOwner,
        planner: {
          need: {
            needId: 'need-postgres', claim: 'completed-transactions' as const, subject: '0x1111111111111111111111111111111111111111',
            decision: 'qualification' as const, requiredFreshnessSeconds: 3_600, minimumReliability: 70,
            maximumPriceUsdc: '2', mandateVersion: 1, policyVersion: 'policy-1', expiresAtUnix: 1_000,
          },
          nowUnix: 100, cachedSnapshots: [],
          providers: [{
            providerId: 'provider-postgres', source: 'x402' as const, endpoint: 'https://evidence.example.test/v1',
            network: 'arc-testnet', asset: 'USDC', payTo, priceUsdc: '0.25', expectedReliability: 90,
            responseLimitBytes: 100_000, providerVersion: '2026-08-24', claims: ['completed-transactions' as const],
            provenanceRequirements: ['receipt'], enabled: true,
            circuit: { state: 'closed' as const, consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
          }],
          expectedDecisionValueUsdc: '5', perDealSpentUsdc: '0', perDealBudgetUsdc: '1',
          allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'], allowedPayTo: [payTo], requiredProvenance: ['receipt'],
        },
      };
      let calls = 0;
      const adapter = createX402EvidenceAcquisitionAdapter({
        transport: async (url, request) => {
          calls += 1;
          assert.equal(url, 'https://evidence.example.test/v1');
          assert.equal(request.body.idempotencyKey, `evidence:${evidenceNeedKey(data.planner.need)}:provider-postgres`);
          return {
            data: {
              snapshot: {
                snapshotId: 'snapshot-evidence-postgres',
                needId: 'need-postgres',
                capturedAtUnix: 100,
                reliability: 90,
                status: 'fresh' as const,
                provenance: ['receipt:provider-evidence-postgres'],
              },
              providerTransactionId: 'provider-evidence-postgres',
            },
            paidUsd: 0.25,
            payer: '0xpayer',
            txHash: '0xpostgres-receipt',
          };
        },
      });
      const observe = createEvidenceAcquisitionOperationObserver(taskStore, rooms);
      assert.deepEqual(await observe(data), { created: true });
      assert.deepEqual(await observe(data), { created: false });
      const runner = new DurableTaskRunner(
        taskStore,
        createEvidenceAcquisitionOperationHandlers({
          repository,
          researchCredits,
          clock: () => 200,
          adapter,
        }),
        { workerId: 'evidence-operation-postgres-worker', clock: () => 200 },
      );
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      assert.equal(calls, 1);
      const purchaseKey = `evidence:${evidenceNeedKey(data.planner.need)}:provider-postgres`;
      const purchase = await repository.getPurchaseByIdempotencyKey(purchaseKey);
      assert.equal(purchase?.state, 'settled');
      assert.equal(purchase?.txHash, '0xpostgres-receipt');
      assert.equal((await repository.listSnapshots(purchase!.evidenceNeedId)).length, 1);
      const creditAccount = await researchCredits.getAccount(researchCreditOwner);
      assert.equal(creditAccount?.balanceMicros, '750000');
      assert.equal(creditAccount?.reservedMicros, '0');
      const creditReservation = await researchCredits.getReservation(`research-credit:${purchaseKey}`);
      assert.equal(creditReservation?.state, 'settled');
      assert.equal(creditReservation?.amountMicros, '250000');
      const checkpoints = await taskStore.listCheckpoints('task:evidence:operation:evidence-operation:postgres:1');
      assert.equal(checkpoints.length, 1);
      assert.equal((checkpoints[0]?.data as { mode?: string }).mode, 'reviewed-evidence-operation-seam');
      assert.equal((checkpoints[0]?.data as { researchCreditReservationState?: string }).researchCreditReservationState, 'settled');
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_evidence_operation_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
