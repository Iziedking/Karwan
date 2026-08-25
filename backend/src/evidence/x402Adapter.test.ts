import assert from 'node:assert/strict';
import test from 'node:test';
import { createX402EvidenceAcquisitionAdapter, x402EvidenceResponseHash } from './x402Adapter.js';
import type { EvidenceProviderRegistration } from './providerRegistry.js';
import type { EvidenceNeed } from './planner.js';

const provider: EvidenceProviderRegistration = {
  providerId: 'provider-x402',
  source: 'x402',
  endpoint: 'https://provider.example.test/evidence',
  network: 'base-sepolia',
  asset: 'USDC',
  payTo: '0x2222222222222222222222222222222222222222',
  priceUsdc: '0.25',
  expectedReliability: 80,
  responseLimitBytes: 100_000,
  providerVersion: '2026-08-24',
  claims: ['completed-transactions'],
  provenanceRequirements: ['receipt'],
  enabled: true,
  circuit: { state: 'closed', consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
};

const need: EvidenceNeed = {
  needId: 'need-1',
  claim: 'completed-transactions',
  subject: '0x1111111111111111111111111111111111111111',
  decision: 'qualification',
  requiredFreshnessSeconds: 3_600,
  minimumReliability: 70,
  maximumPriceUsdc: '2',
  mandateVersion: 1,
  policyVersion: 'policy-1',
  expiresAtUnix: 10_000,
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    snapshot: {
      snapshotId: 'snapshot-1',
      needId: need.needId,
      capturedAtUnix: 100,
      reliability: 95,
      status: 'fresh' as const,
      provenance: ['receipt:provider-1'],
    },
    providerTransactionId: 'provider-tx-1',
    ...overrides,
  };
}

test('x402 evidence adapter validates the request, caps reliability, and settles only with tx proof', async () => {
  let request: { url: string; body: Readonly<Record<string, unknown>> } | undefined;
  const adapter = createX402EvidenceAcquisitionAdapter({
    transport: async (url, options) => {
      request = { url, body: options.body };
      return { data: body(), paidUsd: 0.25, payer: '0xpayer', txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
    },
  });
  const result = await adapter.acquire({ provider, need, idempotencyKey: 'evidence:need-1:provider-x402', nowUnix: 200 });
  assert.equal(result.state, 'settled');
  assert.equal(result.txHash, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.snapshot?.reliability, 80);
  assert.equal(result.snapshot?.responseHash, x402EvidenceResponseHash(body()));
  assert.equal(request?.url, provider.endpoint);
  assert.equal(request?.body.idempotencyKey, 'evidence:need-1:provider-x402');
  assert.equal(request?.body.needId, need.needId);
});

test('missing x402 settlement proof is UNKNOWN and preserves the evidence snapshot', async () => {
  const adapter = createX402EvidenceAcquisitionAdapter({
    transport: async () => ({ data: body(), paidUsd: 0.25, payer: '0xpayer' }),
  });
  const result = await adapter.acquire({ provider, need, idempotencyKey: 'evidence:unknown', nowUnix: 200 });
  assert.equal(result.state, 'unknown');
  assert.equal(result.txHash, undefined);
  assert.equal(result.snapshot?.status, 'fresh');
});

test('x402 evidence adapter rejects mismatched price, need, endpoint, and malformed responses', async () => {
  const withResult = (data: unknown, paidUsd = 0.25, endpoint = provider.endpoint) => createX402EvidenceAcquisitionAdapter({
    transport: async () => ({ data, paidUsd, payer: '0xpayer' }),
  }).acquire({ provider: { ...provider, endpoint }, need, idempotencyKey: 'evidence:reject', nowUnix: 200 });
  await assert.rejects(withResult(body(), 0.24), /EVIDENCE_PAYMENT_AMOUNT_MISMATCH/);
  await assert.rejects(withResult(body({ snapshot: { ...body().snapshot, needId: 'other-need' } })), /EVIDENCE_SNAPSHOT_NEED_MISMATCH/);
  await assert.rejects(withResult(body({ snapshot: { ...body().snapshot, provenance: ['source:provider-1'] } })), /EVIDENCE_PROVENANCE_INCOMPLETE/);
  await assert.rejects(withResult({ ...body(), unexpected: true }), /Unrecognized key/);
  await assert.rejects(withResult(body(), 0.25, 'http://provider.example.test/evidence'), /EVIDENCE_PROVIDER_ENDPOINT_INVALID/);
  await assert.rejects(withResult(body(), 0.25, 'https://127.0.0.1/evidence'), /EVIDENCE_PROVIDER_ENDPOINT_INVALID/);
});
