import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresAgentRuntimeRepository } from '../db/agentRuntime.js';
import { PostgresEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { evidenceNeedKey } from '../evidence/planner.js';
import { DurableTaskRunner, PostgresDurableTaskStore } from './durableTaskRunner.js';
import {
  createEvidenceAcquisitionShadowHandlers,
  createEvidenceAcquisitionShadowObserver,
} from './evidenceAcquisitionShadow.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres evidence acquisition shadow survives duplicate delivery and records proof-bound settlement',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_evidence_acq_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_evidence_acq_[a-f0-9]{32}$/);
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
      const tasks = new PostgresDurableTaskStore(client, transaction);
      const repository = new PostgresEvidenceRuntimeRepository(client, transaction);
      const rooms = new PostgresAgentRuntimeRepository(client);
      const need = {
        needId: 'need-acq', claim: 'completed-transactions' as const, subject: 'seller-acq', decision: 'ranking' as const,
        requiredFreshnessSeconds: 3600, minimumReliability: 80, maximumPriceUsdc: '0.02', mandateVersion: 1,
        policyVersion: 'policy-1', expiresAtUnix: 10_000,
      };
      const input = {
        dealRoomId: 'room-acq', source: 'manual-fixture' as const, idempotencyKey: 'evidence:acq:1',
        planner: {
          need, nowUnix: 100, cachedSnapshots: [],
          providers: [{
            providerId: 'provider-acq', source: 'x402' as const, endpoint: 'https://provider.example/evidence',
            network: 'base-sepolia', asset: 'USDC', payTo: '0x2222222222222222222222222222222222222222', priceUsdc: '0.01',
            expectedReliability: 90, responseLimitBytes: 10_000, providerVersion: '2026-08-24', claims: ['completed-transactions' as const],
            provenanceRequirements: ['provider-receipt'], enabled: true,
            circuit: { state: 'closed' as const, consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
          }],
          expectedDecisionValueUsdc: '1', perDealSpentUsdc: '0', perDealBudgetUsdc: '1',
          allowedNetworks: ['base-sepolia'], allowedAssets: ['USDC'], allowedPayTo: ['0x2222222222222222222222222222222222222222'],
          requiredProvenance: ['provider-receipt'],
        },
        providerObservation: {
          state: 'settled' as const, providerTransactionId: 'provider-tx-acq', txHash: '0xacq',
          snapshot: {
            snapshotId: 'snapshot-acq', needId: 'need-acq', source: 'x402' as const, capturedAtUnix: 100, reliability: 90,
            status: 'fresh' as const, provenance: ['provider-receipt'], responseHash: 'sha256:acq',
          },
        },
      };
      const observe = createEvidenceAcquisitionShadowObserver(tasks, rooms);
      await observe({ data: input });
      await observe({ data: input });
      assert.equal((await rooms.getDealRoom('room-acq'))?.state, 'open');
      const runner = new DurableTaskRunner(tasks, createEvidenceAcquisitionShadowHandlers(repository, { clock: () => 200 }), { workerId: 'acq-worker', clock: () => 200 });
      assert.equal((await runner.runOnce(200)).succeeded, 1);
      const key = `evidence:${evidenceNeedKey(need)}:provider-acq`;
      const purchase = await repository.getPurchaseByIdempotencyKey(key);
      assert.equal(purchase?.state, 'settled');
      assert.equal(purchase?.txHash, '0xacq');
      const persistedNeed = await repository.getNeed(`need:${evidenceNeedKey(need)}`);
      assert.equal(persistedNeed?.state, 'fulfilled');
      assert.equal((await repository.listSnapshots(persistedNeed!.id)).length, 1);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_evidence_acq_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
