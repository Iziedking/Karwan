import assert from 'node:assert/strict';
import test from 'node:test';
import type { SqlExecutor } from '../db/migrations.js';
import {
  InMemoryEvidenceRuntimeAuditStore,
  PostgresEvidenceRuntimeAuditStore,
  type EvidencePurchaseRecord,
  type EvidenceSnapshotRecord,
} from './runtime.js';

function purchase(overrides: Partial<EvidencePurchaseRecord> = {}): EvidencePurchaseRecord {
  return {
    id: 'purchase-1',
    evidenceNeedId: 'need-1',
    idempotencyKey: 'purchase-key-1',
    providerId: 'provider-1',
    state: 'settled',
    priceUsdc: '1',
    txHash: '0xsettled',
    version: 3,
    createdAt: 100,
    updatedAt: 120,
    data: {},
    ...overrides,
  };
}

function snapshot(overrides: Partial<EvidenceSnapshotRecord> = {}): EvidenceSnapshotRecord {
  return {
    id: 'snapshot-1',
    evidenceNeedId: 'need-1',
    purchaseId: 'purchase-1',
    source: 'x402',
    capturedAt: 120,
    reliability: 90,
    state: 'fresh',
    responseHash: 'hash-1',
    provenance: ['receipt'],
    createdAt: 120,
    ...overrides,
  };
}

test('in-memory evidence audit counts only settled payments lacking verified fresh evidence', async () => {
  const store = new InMemoryEvidenceRuntimeAuditStore({
    needs: [],
    purchases: [
      purchase(),
      purchase({ id: 'purchase-2', idempotencyKey: 'purchase-key-2', txHash: undefined }),
      purchase({ id: 'purchase-3', idempotencyKey: 'purchase-key-3', state: 'unknown' }),
    ],
    blockers: [],
    snapshots: [
      snapshot(),
      snapshot({ id: 'snapshot-2', purchaseId: 'purchase-2', state: 'unknown' }),
    ],
  });

  assert.deepEqual(await store.summary(), {
    needs: 0,
    purchases: 3,
    blockers: 0,
    unknownPurchases: 1,
    openBlockers: 0,
    settlementConflicts: 1,
  });
});

test('postgres evidence audit maps the settlement conflict counter conservatively', async () => {
  const queries: string[] = [];
  const executor: SqlExecutor = {
    async query(sql) {
      queries.push(sql);
      return {
        rows: [{
          needs: '4',
          purchases: '3',
          blockers: '2',
          unknown_purchases: '1',
          open_blockers: '1',
          settlement_conflicts: '2',
        }],
      };
    },
  };

  const summary = await new PostgresEvidenceRuntimeAuditStore(executor).summary();
  assert.equal(summary.settlementConflicts, 2);
  assert.equal(queries.length, 1);
  assert.match(queries[0]!, /evidence_snapshots_v2/);
  assert.match(queries[0]!, /p\.tx_hash IS NULL/);
});
