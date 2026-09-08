import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bearerTokenMatches,
  bindCreEvidenceReceipt,
  buildCreDeliveryRequest,
  classifyCreDeliveryRequestForQueue,
  creDeliveryReportId,
  deliveryRequestInputSchema,
  evidenceReceiptBindingInputSchema,
  publicCreDeliveryRequest,
  selectCurrentCreDeliveryRequest,
} from './creDeliveryRequest.js';

const now = 1_800_000_000;
const dealId = `0x${'a'.repeat(64)}` as `0x${string}`;
const baseDeal = {
  jobId: dealId,
  delivered: true,
  evidenceRequired: true,
  agreementVersion: 3,
  deliveryRevision: 2,
} as const;
const input = deliveryRequestInputSchema.parse({
  termsVersion: 3,
  evidenceRevision: 2,
  expiresAt: now + 3_600,
  pullNumber: 42,
  submittedSha: 'A'.repeat(40),
});

test('publishes only the current agreement and delivery revision', () => {
  const result = buildCreDeliveryRequest(baseDeal, input, now);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.submittedSha, 'a'.repeat(40));
  assert.deepEqual(publicCreDeliveryRequest(result.request), {
    dealId,
    termsVersion: 3,
    evidenceRevision: 2,
    expiresAt: now + 3_600,
    pullNumber: 42,
    submittedSha: 'a'.repeat(40),
  });
});

test('rejects stale agreement, stale delivery, missing evidence policy and invalid expiry', () => {
  assert.equal(buildCreDeliveryRequest({ ...baseDeal, agreementVersion: 2 }, input, now).code, 'STALE_AGREEMENT');
  assert.equal(buildCreDeliveryRequest({ ...baseDeal, deliveryRevision: 1 }, input, now).code, 'STALE_DELIVERY');
  assert.equal(buildCreDeliveryRequest({ ...baseDeal, evidenceRequired: false }, input, now).code, 'EVIDENCE_NOT_REQUIRED');
  assert.equal(buildCreDeliveryRequest(baseDeal, { ...input, expiresAt: now }, now).code, 'REQUEST_EXPIRED');
  assert.equal(buildCreDeliveryRequest(baseDeal, { ...input, expiresAt: now + 7 * 86_400 + 1 }, now).code, 'REQUEST_EXPIRY_TOO_FAR');
});

test('reuses an identical request but rejects a conflicting request for the same revision', () => {
  const first = buildCreDeliveryRequest(baseDeal, input, now);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const existing = { ...baseDeal, creDeliveryRequest: first.request };
  const retry = buildCreDeliveryRequest(existing, input, now);
  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.idempotent, true);
  const conflict = buildCreDeliveryRequest(existing, { ...input, pullNumber: 43 }, now);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, 'REQUEST_CONFLICT');
});

test('current selection ignores stale requests and refuses an ambiguous queue', () => {
  const first = buildCreDeliveryRequest(baseDeal, input, now);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const secondId = `0x${'b'.repeat(64)}` as `0x${string}`;
  const second = { ...baseDeal, jobId: secondId, creDeliveryRequest: { ...first.request, dealId: secondId, publishedAt: first.request.publishedAt + 1 } };
  assert.equal(selectCurrentCreDeliveryRequest([{ ...baseDeal, creDeliveryRequest: first.request }, second], undefined, now).kind, 'ambiguous');
  assert.equal(selectCurrentCreDeliveryRequest([{ ...baseDeal, deliveryRevision: 3, creDeliveryRequest: first.request }], undefined, now).kind, 'none');
  const selected = selectCurrentCreDeliveryRequest([{ ...baseDeal, creDeliveryRequest: first.request }, second], secondId, now);
  assert.equal(selected.kind, 'ok');
  if (selected.kind === 'ok') assert.equal(selected.request.dealId, secondId);
});

test('classifies JSON-mirrored requests before queue adoption', () => {
  const published = buildCreDeliveryRequest(baseDeal, input, now);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  assert.equal(classifyCreDeliveryRequestForQueue(baseDeal, now).kind, 'absent');
  assert.equal(classifyCreDeliveryRequestForQueue({ ...baseDeal, creDeliveryRequest: published.request }, now).kind, 'current');
  assert.equal(classifyCreDeliveryRequestForQueue({ ...baseDeal, deliveryRevision: 3, creDeliveryRequest: published.request }, now).kind, 'stale');
  assert.equal(classifyCreDeliveryRequestForQueue({ ...baseDeal, creDeliveryRequest: published.request }, now + 3_601).kind, 'expired');
});

test('binds a receipt only to the current published request and is idempotent', () => {
  const published = buildCreDeliveryRequest(baseDeal, input, now);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const receipt = evidenceReceiptBindingInputSchema.parse({
    termsVersion: 3,
    evidenceRevision: 2,
    expiresAt: now + 3_600,
    decisionCode: 1,
    evidenceCommitment: `0x${'c'.repeat(64)}`,
    verdictCommitment: `0x${'d'.repeat(64)}`,
    reportId: `0x${'e'.repeat(64)}`,
  });
  const first = bindCreEvidenceReceipt({ ...baseDeal, creDeliveryRequest: published.request }, receipt, now);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const retry = bindCreEvidenceReceipt({ ...baseDeal, creDeliveryRequest: published.request, creEvidenceReceipt: first.binding }, receipt, now);
  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.idempotent, true);
  assert.equal(bindCreEvidenceReceipt({ ...baseDeal, creDeliveryRequest: published.request }, { ...receipt, expiresAt: now + 3_601 }, now).code, 'EXPIRY_MISMATCH');
  assert.equal(bindCreEvidenceReceipt({ ...baseDeal, deliveryRevision: 3, creDeliveryRequest: published.request }, receipt, now).code, 'STALE_DELIVERY');
});

test('bearer authentication is fail-closed and constant-time for equal-length secrets', () => {
  assert.equal(bearerTokenMatches(undefined, 'secret'), false);
  assert.equal(bearerTokenMatches('Bearer wrong', 'secret'), false);
  assert.equal(bearerTokenMatches('Basic secret', 'secret'), false);
  assert.equal(bearerTokenMatches('Bearer secret', 'secret'), true);
});

test('lease-bound report IDs change when a replacement worker receives a new lease', () => {
  const base = {
    dealId,
    termsVersion: 3,
    evidenceRevision: 2,
    evidenceCommitment: `0x${'c'.repeat(64)}` as `0x${string}`,
    verdictCommitment: `0x${'d'.repeat(64)}` as `0x${string}`,
    decisionCode: 1,
  };
  assert.notEqual(
    creDeliveryReportId({ ...base, leaseToken: '11111111-1111-4111-8111-111111111111' }),
    creDeliveryReportId({ ...base, leaseToken: '22222222-2222-4222-8222-222222222222' }),
  );
  assert.equal(creDeliveryReportId(base), creDeliveryReportId({ ...base }));
});


test('terminal deals cannot publish, select, adopt or bind evidence work', () => {
  const published = buildCreDeliveryRequest(baseDeal, input, now);
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const receipt = { ...input, decisionCode: 1, evidenceCommitment: '0x' + 'c'.repeat(64), verdictCommitment: '0x' + 'd'.repeat(64), reportId: '0x' + 'e'.repeat(64) };
  for (const terminal of [{ cancelledAt: now }, { settledAt: now }]) {
    const deal = { ...baseDeal, ...terminal, creDeliveryRequest: published.request };
    assert.equal(buildCreDeliveryRequest(deal, input, now).ok, false);
    assert.equal(classifyCreDeliveryRequestForQueue(deal, now).kind, 'stale');
    assert.equal(selectCurrentCreDeliveryRequest([deal], undefined, now).kind, 'none');
    assert.equal(bindCreEvidenceReceipt(deal, receipt, now).ok, false);
  }
});
