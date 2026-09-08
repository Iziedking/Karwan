import assert from 'node:assert/strict';
import test from 'node:test';
import { creDeliveryReportId, deliveryRequestInputSchema, evidenceReceiptBindingInputSchema, buildCreDeliveryRequest } from './creDeliveryRequest.js';
import { InMemoryCreDeliveryRequestQueue } from './creDeliveryRequestQueue.js';

const nowSeconds = 1_800_000_000;
const nowMs = nowSeconds * 1_000;
const dealId = `0x${'a'.repeat(64)}` as `0x${string}`;
const deal = {
  jobId: dealId,
  delivered: true,
  evidenceRequired: true,
  agreementVersion: 4,
  deliveryRevision: 7,
} as const;
const requestResult = buildCreDeliveryRequest(
  deal,
  deliveryRequestInputSchema.parse({
    termsVersion: 4,
    evidenceRevision: 7,
    expiresAt: nowSeconds + 3_600,
    pullNumber: 11,
    submittedSha: 'A'.repeat(40),
  }),
  nowSeconds,
);
assert.equal(requestResult.ok, true);
if (!requestResult.ok) throw new Error('fixture request did not build');
const request = requestResult.request;
const receipt = evidenceReceiptBindingInputSchema.parse({
  termsVersion: 4,
  evidenceRevision: 7,
  expiresAt: request.expiresAt,
  decisionCode: 1,
  evidenceCommitment: `0x${'b'.repeat(64)}`,
  verdictCommitment: `0x${'c'.repeat(64)}`,
  reportId: `0x${'d'.repeat(64)}`,
});

function receiptForLease(leaseToken: string, overrides: Partial<typeof receipt> = {}) {
  const next = { ...receipt, ...overrides };
  return {
    ...next,
    reportId: creDeliveryReportId({
      dealId: request.dealId,
      termsVersion: request.termsVersion,
      evidenceRevision: request.evidenceRevision,
      evidenceCommitment: next.evidenceCommitment,
      verdictCommitment: next.verdictCommitment,
      decisionCode: next.decisionCode,
      leaseToken,
    }),
  };
}

test('adopts one legacy JSON request per delivery revision and is idempotent', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const first = queue.adoptLegacy(request, nowMs);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.idempotent, false);
  const retry = queue.adoptLegacy(request, nowMs + 1);
  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.idempotent, true);
  const conflict = queue.adoptLegacy({ ...request, pullNumber: request.pullNumber + 1 }, nowMs + 2);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, 'REQUEST_CONFLICT');
});

test('an adopted request still uses the normal claim and receipt lifecycle', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const adopted = queue.adoptLegacy(request, nowMs);
  assert.equal(adopted.ok, true);
  if (!adopted.ok) return;
  const claimed = queue.claim([adopted.value.requestKey], nowMs + 1, 100);
  assert.ok(claimed);
  const completed = queue.complete(request, receiptForLease(claimed.record.leaseToken), nowMs + 2);
  assert.equal(completed.ok, true);
  if (completed.ok) assert.equal(completed.value.state, 'completed');
});

test('a corrected delivery cannot adopt the prior revision or bypass its cancellation fence', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const prior = queue.adoptLegacy(request, nowMs);
  assert.equal(prior.ok, true);
  assert.equal(queue.cancel(dealId, nowMs + 1), 1);
  const corrected = { ...request, evidenceRevision: request.evidenceRevision + 1 };
  const next = queue.adoptLegacy(corrected, nowMs + 2);
  assert.equal(next.ok, true);
  if (next.ok) assert.notEqual(next.value.requestKey, prior.ok ? prior.value.requestKey : '');
  const oldClaim = queue.claim([prior.ok ? prior.value.requestKey : ''], nowMs + 3);
  assert.equal(oldClaim, null);
});

test('claims only once, then recovers an expired lease without duplicating the request', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const published = queue.publish(request, nowMs);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const first = queue.claim([published.value.requestKey], nowMs + 1, 100);
  assert.ok(first);
  const concurrent = queue.claim([published.value.requestKey], nowMs + 2, 100);
  assert.equal(concurrent, null);
  const recovered = queue.claim([published.value.requestKey], nowMs + 102, 100);
  assert.ok(recovered);
  assert.equal(recovered?.record.requestKey, published.value.requestKey);
});

test('completes a lease once and rejects a conflicting replay', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const published = queue.publish(request, nowMs);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const unclaimed = queue.complete(request, receipt, nowMs + 1);
  assert.equal(unclaimed.ok, false);
  if (!unclaimed.ok) assert.equal(unclaimed.code, 'REQUEST_NOT_CLAIMED');
  const claimed = queue.claim([published.value.requestKey], nowMs + 1);
  assert.ok(claimed);
  const leasedReceipt = receiptForLease(claimed.record.leaseToken);
  const first = queue.complete(request, leasedReceipt, nowMs + 2);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.idempotent, false);
  const retry = queue.complete(request, leasedReceipt, nowMs + 3);
  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.idempotent, true);
  const reordered = Object.fromEntries(Object.entries(leasedReceipt).reverse()) as typeof leasedReceipt;
  assert.equal(queue.complete(request, { ...reordered, boundAt: nowMs + 4 }, nowMs + 4).ok, true);
  const conflict = queue.complete(request, { ...receipt, decisionCode: 2 }, nowMs + 4);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, 'RECEIPT_CONFLICT');
});

test('rejects a receipt from a worker whose lease expired', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const published = queue.publish(request, nowMs);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  assert.ok(queue.claim([published.value.requestKey], nowMs + 1, 10));
  const expired = queue.complete(request, receipt, nowMs + 12);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, 'REQUEST_EXPIRED');
});

test('rejects a stale worker after its replacement lease is claimed', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const published = queue.publish(request, nowMs);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const first = queue.claim([published.value.requestKey], nowMs + 1, 10);
  assert.ok(first);
  const replacement = queue.claim([published.value.requestKey], nowMs + 12, 100);
  assert.ok(replacement);
  const stale = queue.complete(request, receiptForLease(first.record.leaseToken), nowMs + 13);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, 'REQUEST_LEASE_MISMATCH');
  const current = queue.complete(request, receiptForLease(replacement.record.leaseToken), nowMs + 14);
  assert.equal(current.ok, true);
});

test('redelivery cancellation fences the prior request', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const published = queue.publish(request, nowMs);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  assert.equal(queue.cancel(dealId, nowMs + 1), 1);
  const completion = queue.complete(request, receipt, nowMs + 2);
  assert.equal(completion.ok, false);
  if (!completion.ok) assert.equal(completion.code, 'REQUEST_CANCELLED');
});

test('stale claim cleanup cancels only the claimed request', () => {
  const queue = new InMemoryCreDeliveryRequestQueue();
  const prior = queue.publish(request, nowMs);
  const corrected = queue.publish({ ...request, evidenceRevision: request.evidenceRevision + 1 }, nowMs + 1);
  assert.equal(prior.ok, true);
  assert.equal(corrected.ok, true);
  if (!prior.ok || !corrected.ok) return;

  const claimed = queue.claim([prior.value.requestKey], nowMs + 2, 100);
  assert.ok(claimed);
  if (!claimed) return;
  assert.equal(queue.cancelRequest(prior.value.requestKey, 'wrong-lease', nowMs + 3), 0);
  assert.equal(queue.cancelRequest(prior.value.requestKey, claimed.record.leaseToken, nowMs + 4), 1);
  const replacement = queue.claim([corrected.value.requestKey], nowMs + 5, 100);
  assert.ok(replacement);
  assert.equal(replacement?.record.requestKey, corrected.value.requestKey);
});
