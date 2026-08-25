import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryMatchingAuditReviewStore } from './review.js';

const base = {
  reviewId: 'review-1',
  observationKey: 'matching-observation-1',
  decision: 'retain_legacy' as const,
  reviewer: 'operator-1',
  note: 'Winner divergence is explained by the legacy relationship signal.',
  createdAt: 100,
};

test('matching review is immutable and exact duplicate delivery is idempotent', async () => {
  const store = new InMemoryMatchingAuditReviewStore();
  const first = await store.record(base);
  assert.deepEqual(await store.record({ ...base, createdAt: 999 }), first);
  await assert.rejects(
    () => store.record({ ...base, decision: 'accept_shadow', createdAt: 101 }),
    /matching review id conflict/,
  );
  assert.deepEqual(await store.list(), [first]);
});

test('matching review ids cannot be reused for another observation', async () => {
  const store = new InMemoryMatchingAuditReviewStore();
  await store.record(base);
  await assert.rejects(
    () => store.record({ ...base, observationKey: 'matching-observation-2', createdAt: 101 }),
    /matching review id conflict/,
  );
});

test('matching review note and identity validation fail closed', async () => {
  const store = new InMemoryMatchingAuditReviewStore();
  await assert.rejects(
    () => store.record({ ...base, reviewer: ' ', createdAt: 100 }),
    /matching reviewer is required/,
  );
  await assert.rejects(
    () => store.record({ ...base, note: 'x'.repeat(501), createdAt: 100 }),
    /matching review note is too long/,
  );
});
