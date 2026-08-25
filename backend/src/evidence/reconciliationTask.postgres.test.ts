import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { DurableTaskRunner, PostgresDurableTaskStore } from '../agents/durableTaskRunner.js';
import { createReviewedOperationTaskHandlers } from '../agents/reviewedOperationHandlers.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { runNumberedMigrations } from '../db/migrations.js';
import {
  createEvidenceReconciliationOperationObserver,
  type EvidenceReconciliationOperationTaskData,
} from './reconciliationTask.js';
import { PostgresEvidenceRuntimeRepository } from './runtime.js';
import { PostgresResearchCreditStore } from './researchCredit.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const owner = '0x1111111111111111111111111111111111111111';
const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test(
  'Postgres evidence reconciliation settles an uncertain purchase without resubmitting a provider call',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_evidence_reconcile_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_evidence_reconcile_[a-f0-9]{32}$/);
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
      const repository = new PostgresEvidenceRuntimeRepository(client, transaction);
      const researchCredits = new PostgresResearchCreditStore(client, transaction);
      await rooms.createDealRoom({
        id: 'room-evidence-reconcile-postgres',
        jobId: 'job-evidence-reconcile-postgres',
        data: {},
        now: 100,
      });
      const need = await repository.createNeed({
        id: 'need-evidence-reconcile-postgres',
        dealRoomId: 'room-evidence-reconcile-postgres',
        needKey: 'evidence-reconcile-postgres',
        kind: 'completed-transactions',
        riskClass: 'qualification',
        data: { subject: owner },
        now: 100,
      });
      const purchase = await repository.createPurchase({
        id: 'purchase-evidence-reconcile-postgres',
        evidenceNeedId: need.record.id,
        idempotencyKey: 'evidence:reconcile:postgres',
        providerId: 'provider-reconcile-postgres',
        priceUsdc: '0.25',
        data: {},
        now: 101,
      });
      const unknown = await repository.updatePurchase(
        purchase.record.id,
        purchase.record.version,
        'unknown',
        { providerTransactionId: 'provider-tx-reconcile-postgres', now: 102 },
      );
      const reservationKey = 'research-credit:evidence:reconcile:postgres';
      await researchCredits.ensureAccount({ owner, initialCreditUsdc: '1', now: 100 });
      await researchCredits.reserve({
        id: 'reservation-evidence-reconcile-postgres',
        reservationKey,
        owner,
        amountUsdc: '0.25',
        now: 103,
      });
      const persisted = await repository.updatePurchase(
        unknown.id,
        unknown.version,
        unknown.state,
        { data: { researchCreditOwner: owner, researchCreditReservationKey: reservationKey }, now: 104 },
      );

      const input: EvidenceReconciliationOperationTaskData = {
        dealRoomId: 'room-evidence-reconcile-postgres',
        purchaseId: persisted.id,
        expectedPurchaseVersion: persisted.version,
        observationKey: 'provider-tx-reconcile-postgres:settled:1',
        observedAtUnix: 120,
        source: 'provider-webhook',
        verificationReference: 'webhook:provider-tx-reconcile-postgres:1',
        state: 'settled',
        providerTransactionId: 'provider-tx-reconcile-postgres',
        txHash,
        snapshot: {
          snapshotId: 'snapshot-evidence-reconcile-postgres',
          source: 'x402',
          capturedAtUnix: 119,
          reliability: 91,
          status: 'fresh',
          responseHash: 'hash-evidence-reconcile-postgres',
          provenance: ['provider-tx-reconcile-postgres', txHash],
        },
      };
      const observe = createEvidenceReconciliationOperationObserver(taskStore, rooms);
      assert.deepEqual(await observe(input), { created: true });
      assert.deepEqual(await observe(input), { created: false });

      const runner = new DurableTaskRunner(
        taskStore,
        createReviewedOperationTaskHandlers({
          evidenceReconciliationRepository: repository,
          evidenceReconciliationResearchCredits: researchCredits,
        }),
        { workerId: 'evidence-reconcile-postgres-worker', clock: () => 200 },
      );
      assert.deepEqual(await runner.runOnce(200), {
        succeeded: 1,
        waiting: 0,
        retried: 0,
        deadLettered: 0,
        leaseLost: 0,
      });

      const settled = await repository.getPurchase(persisted.id);
      assert.equal(settled?.state, 'settled');
      assert.equal(settled?.txHash, txHash);
      assert.equal((await repository.getNeed(need.record.id))?.state, 'fulfilled');
      assert.equal((await repository.listSnapshots(need.record.id)).length, 1);
      assert.equal((await researchCredits.getReservation(reservationKey))?.state, 'settled');
      const account = await researchCredits.getAccount(owner);
      assert.equal(account?.balanceMicros, '750000');
      assert.equal(account?.reservedMicros, '0');
      const checkpoints = await taskStore.listCheckpoints(
        `task:evidence:reconcile:${input.purchaseId}:${input.observationKey}`,
      );
      assert.equal(checkpoints.at(-1)?.data.providerCallMade, false);
      assert.equal(checkpoints.at(-1)?.data.financialMutation, false);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_evidence_reconcile_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
