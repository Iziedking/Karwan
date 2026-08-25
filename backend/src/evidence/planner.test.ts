import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryEvidencePurchaseLedger, planEvidenceAcquisition } from './planner.js';

const need = { needId: 'need-1', claim: 'completed-transactions' as const, subject: '0x1111111111111111111111111111111111111111', decision: 'ranking' as const, requiredFreshnessSeconds: 3_600, minimumReliability: 70, maximumPriceUsdc: '0.05', mandateVersion: 2, policyVersion: 'policy-1', expiresAtUnix: 2_000 };
const base = { need, nowUnix: 1_000, cachedSnapshots: [], providers: [], expectedDecisionValueUsdc: '1', perDealSpentUsdc: '0', perDealBudgetUsdc: '0.10', allowedNetworks: ['base-sepolia'], allowedAssets: ['USDC'], allowedPayTo: ['0x2222222222222222222222222222222222222222'] };

test('planner uses authoritative and fresh cached evidence before considering providers', () => {
  const snapshot = { snapshotId: 's1', needId: 'need-1', source: 'onchain' as const, capturedAtUnix: 999, reliability: 95, status: 'fresh' as const, provenance: ['tx-1'], responseHash: 'hash-1' };
  assert.equal(planEvidenceAcquisition({ ...base, directSnapshot: snapshot }).reason, 'AUTHORITATIVE_STATE_AVAILABLE');
  assert.equal(planEvidenceAcquisition({ ...base, cachedSnapshots: [snapshot] }).reason, 'FRESH_EVIDENCE_REUSED');
});

test('planner only selects policy-valid x402 evidence when it can change the decision', () => {
  const provider = { providerId: 'provider-1', source: 'x402' as const, endpoint: 'https://provider.example/evidence', network: 'base-sepolia', asset: 'USDC', payTo: '0x2222222222222222222222222222222222222222', priceUsdc: '0.01', expectedReliability: 85, responseLimitBytes: 10_000 };
  const plan = planEvidenceAcquisition({ ...base, providers: [provider] });
  assert.equal(plan.action, 'purchase');
  if (plan.action === 'purchase') assert.equal(plan.reason, 'PAID_CLAIM_CAN_CHANGE_DECISION');
  assert.equal(planEvidenceAcquisition({ ...base, expectedDecisionValueUsdc: '0.001', providers: [provider] }).action, 'wait');
  assert.equal(planEvidenceAcquisition({ ...base, providers: [{ ...provider, endpoint: 'http://provider.example/evidence' }] }).action, 'wait');
});

test('planner rejects SSRF-prone, credentialed, and private provider endpoints', () => {
  const provider = { providerId: 'provider-ssrf', source: 'x402' as const, endpoint: 'https://127.0.0.1/evidence', network: 'base-sepolia', asset: 'USDC', payTo: '0x2222222222222222222222222222222222222222', priceUsdc: '0.01', expectedReliability: 85, responseLimitBytes: 10_000 };
  assert.equal(planEvidenceAcquisition({ ...base, providers: [provider] }).action, 'wait');
  assert.equal(planEvidenceAcquisition({ ...base, providers: [{ ...provider, endpoint: 'https://user:pass@provider.example/evidence' }] }).action, 'wait');
  assert.equal(planEvidenceAcquisition({ ...base, providers: [{ ...provider, endpoint: 'https://metadata.google.internal/evidence' }] }).action, 'wait');
  assert.equal(planEvidenceAcquisition({ ...base, providers: [{ ...provider, endpoint: 'https://[::1]/evidence' }] }).action, 'wait');
});

test('evidence purchase ledger reuses fresh snapshots and does not overwrite settled status', () => {
  const ledger = new InMemoryEvidencePurchaseLedger();
  assert.equal(ledger.recordStatus(need, 'UNKNOWN'), 'UNKNOWN');
  assert.equal(ledger.recordStatus(need, 'RECONCILING'), 'RECONCILING');
  assert.equal(ledger.recordStatus(need, 'SETTLED'), 'SETTLED');
  assert.equal(ledger.recordStatus(need, 'CREATED'), 'SETTLED');
  const snapshot = { snapshotId: 's1', needId: 'need-1', source: 'x402' as const, capturedAtUnix: 1_000, reliability: 90, status: 'fresh' as const, provenance: ['receipt-1'], responseHash: 'hash-1' };
  assert.equal(ledger.recordSnapshot(need, snapshot).snapshotId, 's1');
  assert.equal(ledger.getFresh(need, 1_001)?.snapshotId, 's1');
  assert.throws(() => ledger.recordSnapshot(need, { ...snapshot, responseHash: 'hash-2' }), /DIFFERENT_SNAPSHOT/);
});
