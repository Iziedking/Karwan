import assert from 'node:assert/strict';
import test from 'node:test';
import type { EvidenceReceiptView } from '../chain/evidenceReceipt.js';
import type { DealForRequest } from './creDeliveryRequest.js';
import type { SqlExecutor } from '../db/migrations.js';
import { readCreQueueProgressFromSql, type CreQueueProgress } from './creDeliveryRequestQueue.js';
import { readCreVerificationProgress } from './creVerificationProgress.js';

const now = 1_800_000_000_000;
const deal = {
  jobId: `0x${'a'.repeat(64)}`, delivered: true, evidenceRequired: true,
  agreementVersion: 2, deliveryRevision: 3,
  creDeliveryRequest: {
    dealId: `0x${'a'.repeat(64)}`, termsVersion: 2, evidenceRevision: 3,
    expiresAt: now / 1000 + 60, pullNumber: 1, submittedSha: 'b'.repeat(40), publishedAt: now,
  },
} as DealForRequest;
const receipt = (state: EvidenceReceiptView['state']): EvidenceReceiptView => ({ state, agreementVersion: 2 });
const queue = (state: CreQueueProgress['state'], leaseExpiresAt = now + 10_000): CreQueueProgress => ({ state, expiresAt: now / 1000 + 60, leaseExpiresAt });
const progress = (record: CreQueueProgress | null, view = receipt('not-recorded'), candidate = deal) =>
  readCreVerificationProgress(candidate, view, async () => record, now);

test('distinguishes unpublished delivery, queued request, claimed work and receipt confirmation', async () => {
  assert.deepEqual(await progress(null, undefined, { ...deal, evidenceRequired: false }), undefined);
  assert.deepEqual(await progress(null, undefined, { ...deal, delivered: false }), { state: 'awaitingDelivery' });
  assert.deepEqual(await progress(null), { state: 'awaitingRequest' });
  assert.deepEqual(await progress(queue('pending')), { state: 'queued' });
  assert.deepEqual(await progress(queue('leased')), { state: 'checking' });
  assert.deepEqual(await progress(queue('leased', now)), { state: 'queued' });
  assert.deepEqual(await progress(queue('completed')), { state: 'confirming' });
});

test('only the current chain receipt supplies pass or mismatch', async () => {
  for (const state of ['pass', 'mismatch', 'unavailable'] as const) {
    assert.deepEqual(await progress(queue('pending'), receipt(state)), { state });
  }
  for (const state of ['expired', 'stale-terms', 'stale-delivery', 'read-unavailable', 'not-configured'] as const) {
    assert.deepEqual(await progress(queue('completed'), receipt(state)), { state: 'unavailable' });
  }
});

test('stale terms, delivery and closed or expired work cannot look active', async () => {
  for (const candidate of [
    { ...deal, agreementVersion: 3 }, { ...deal, deliveryRevision: 4 },
    { ...deal, cancelledAt: now }, { ...deal, settledAt: now },
    { ...deal, creDeliveryRequest: { ...deal.creDeliveryRequest!, expiresAt: now / 1000 } },
  ]) {
    assert.deepEqual(await progress(queue('leased'), undefined, candidate), { state: 'unavailable' });
  }
  for (const record of [queue('expired'), queue('cancelled'), { ...queue('pending'), expiresAt: now / 1000 }]) {
    assert.deepEqual(await progress(record), { state: 'unavailable' });
  }
});

test('queue errors leave the deal readable and cannot replace a verified receipt', async () => {
  const fail = async () => { throw new Error('database unavailable'); };
  assert.deepEqual(await readCreVerificationProgress(deal, receipt('not-recorded'), fail, now), { state: 'unavailable' });
  assert.deepEqual(await readCreVerificationProgress(deal, receipt('pass'), fail, now), { state: 'pass' });
});

test('status lookup uses one read-only query and never returns lease credentials', async () => {
  const queries: string[] = [];
  const sql = { query: async (text: string, params: unknown[]) => {
    queries.push(text);
    assert.deepEqual(params, ['exact-request-key']);
    return { rows: [{ state: 'leased', expires_at: '1800000060', lease_expires_at: '1800000010000', lease_token: 'private' }] };
  } } as unknown as SqlExecutor;
  assert.deepEqual(await readCreQueueProgressFromSql(sql, 'exact-request-key'), queue('leased'));
  assert.equal(queries.length, 1);
  assert.match(queries[0]!, /^SELECT state, expires_at, lease_expires_at /);
  assert.doesNotMatch(queries[0]!, /UPDATE|INSERT|DELETE|FOR UPDATE|lease_token/i);
});
