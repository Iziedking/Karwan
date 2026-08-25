import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresEvidenceRuntimeAuditStore, PostgresEvidenceRuntimeRepository } from './runtime.js';
import { reconcileEvidenceOnce } from './reconciliation.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres evidence and qualification runtime preserves idempotency, snapshots, and OCC',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 3 });
    const schema = `karwan_evidence_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_evidence_[a-f0-9]{32}$/);
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      await client.query(
        `INSERT INTO deal_rooms (id, job_id, state, version, created_at, updated_at, data)
         VALUES ('room-1', 'job-1', 'open', 1, 1000, 1000, '{}'::jsonb)`,
      );
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
      const repository = new PostgresEvidenceRuntimeRepository(client, transaction);
      const need = await repository.createNeed({
        id: 'need-1',
        dealRoomId: 'room-1',
        needKey: 'need-key-1',
        kind: 'completed-transactions',
        riskClass: 'standard',
        data: { subject: 'seller-1' },
        now: 1000,
      });
      const duplicateNeed = await repository.createNeed({
        id: 'ignored-need',
        dealRoomId: 'room-1',
        needKey: 'need-key-1',
        kind: 'completed-transactions',
        riskClass: 'standard',
        data: { subject: 'seller-1' },
        now: 1001,
      });
      assert.equal(need.created, true);
      assert.equal(duplicateNeed.created, false);

      const purchase = await repository.createPurchase({
        id: 'purchase-1',
        evidenceNeedId: 'need-1',
        idempotencyKey: 'evidence:need-1:provider-1',
        providerId: 'provider-1',
        priceUsdc: '0.02',
        data: {},
        now: 1002,
      });
      const submitted = await repository.updatePurchase('purchase-1', purchase.record.version, 'submitted', { providerTransactionId: 'provider-tx-1', now: 1003 });
      await assert.rejects(
        () => repository.updatePurchase('purchase-1', submitted.version, 'settled'),
        /SETTLED_REQUIRES_TX_HASH/,
      );
      const settled = await repository.updatePurchase('purchase-1', submitted.version, 'settled', { txHash: '0xsettled', now: 1004 });
      assert.equal(settled.state, 'settled');
      assert.equal((await repository.getPurchaseByIdempotencyKey('evidence:need-1:provider-1'))?.txHash, '0xsettled');

      const snapshot = await repository.recordSnapshot({
        id: 'snapshot-1',
        evidenceNeedId: 'need-1',
        purchaseId: 'purchase-1',
        source: 'x402',
        capturedAt: 1005,
        reliability: 90,
        state: 'fresh',
        responseHash: 'sha256:one',
        provenance: ['provider-1', 'provider-tx-1'],
        now: 1005,
      });
      const duplicateSnapshot = await repository.recordSnapshot({
        ...snapshot.record,
        id: 'ignored-snapshot',
        now: 1006,
      });
      assert.equal(duplicateSnapshot.created, false);
      assert.equal((await repository.listSnapshots('need-1')).length, 1);

      const unresolvedPurchase = await repository.createPurchase({
        id: 'purchase-2',
        evidenceNeedId: 'need-1',
        idempotencyKey: 'evidence:need-1:provider-2',
        providerId: 'provider-2',
        priceUsdc: '0.03',
        data: {},
        now: 1006,
      });
      const unresolvedSubmitted = await repository.updatePurchase(
        'purchase-2',
        unresolvedPurchase.record.version,
        'submitted',
        { providerTransactionId: 'provider-tx-2', now: 1007 },
      );
      await repository.updatePurchase('purchase-2', unresolvedSubmitted.version, 'settled', {
        txHash: '0xsettled-without-evidence',
        now: 1008,
      });
      const auditSummary = await new PostgresEvidenceRuntimeAuditStore(client).summary();
      assert.equal(auditSummary.unknownPurchases, 0);
      assert.equal(auditSummary.settlementConflicts, 1);

      const pending = await repository.createPurchase({
        id: 'purchase-3',
        evidenceNeedId: 'need-1',
        idempotencyKey: 'evidence:need-1:provider-3',
        providerId: 'provider-3',
        priceUsdc: '0.04',
        data: {},
        now: 1009,
      });
      await repository.updatePurchase('purchase-3', pending.record.version, 'unknown', { now: 1010 });
      const reconciliation = await reconcileEvidenceOnce(repository, {
        async reconcile() {
          return {
            state: 'settled',
            providerTransactionId: 'provider-tx-3',
            txHash: '0xsettled-3',
            snapshot: {
              snapshotId: 'snapshot-3',
              source: 'x402',
              capturedAtUnix: 1011,
              reliability: 90,
              status: 'fresh',
              responseHash: 'sha256:three',
              provenance: ['provider-tx-3', '0xsettled-3'],
            },
          };
        },
      }, { now: 1011 });
      assert.equal(reconciliation.updated, 1);
      assert.equal(reconciliation.settled, 1);
      assert.equal(reconciliation.snapshots, 1);
      assert.equal((await repository.getPurchase('purchase-3'))?.state, 'settled');
      assert.equal((await repository.listSnapshots('need-1')).length, 2);

      const blocker = await repository.createBlocker({
        id: 'blocker-1',
        dealRoomId: 'room-1',
        blockerKey: 'stake:room-1:seller-1:v1',
        kind: 'STAKE_SHORTFALL',
        subject: 'seller-1',
        data: { shortfallUsdc: '25' },
        now: 1007,
      });
      const resolved = await repository.resolveBlocker('blocker-1', blocker.record.version, 'resolved', { resolution: 'funded' }, 1008);
      assert.equal(resolved.state, 'resolved');
      await assert.rejects(() => repository.resolveBlocker('blocker-1', blocker.record.version, 'cancelled'), /version/);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_evidence_[a-f0-9]{32}$/.test(schema)) throw new Error(`refusing to drop unexpected schema ${schema}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
