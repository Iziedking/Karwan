import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarketEvidenceAcquisitionObservation,
  buildResearchScoutEvidenceAcquisitionObservation,
} from './evidenceAcquisitionProjection.js';

const read = {
  keywords: ['API', 'payments'],
  summary: 'A market read',
  demand: 'steady' as const,
  priceNote: 'Prices are stable',
  fairPriceUsdc: 125,
  priceConfidence: 'grounded' as const,
  priceBandUsdc: { low: 100, mid: 125, high: 150 },
  priceObservations: [{ amountUsdc: 125, unit: 'project', quote: '$125', sourceIndex: 0 }],
  highlights: ['One verified point'],
  sources: [{ title: 'Example', url: 'https://example.com/report' }],
  anglesRun: ['pricing', 'demand'],
  paidUsd: 0.03,
  payer: '0xpayer',
  txHash: '0xaggregate',
  researchedAt: 1_700_000_000_000,
  cached: false,
};

test('market research projection is deterministic and preserves payment uncertainty', () => {
  const first = buildMarketEvidenceAcquisitionObservation(read, 'job-market-1');
  const second = buildMarketEvidenceAcquisitionObservation(read, 'job-market-1');
  assert.deepEqual(first, second);
  assert.equal(first.planner.directSnapshot?.status, 'unknown');
  assert.equal(first.planner.directSnapshot?.reliability, 0);
  assert.equal(first.planner.need.claim, 'market-benchmark');
  assert.equal(first.planner.need.subject, 'api|payments');
  assert.equal(first.planner.need.maximumPriceUsdc, '0.030000');
  assert.ok(first.planner.directSnapshot?.provenance.includes('payment:0xaggregate'));
});

test('cached market reads reuse the same evidence identity without inventing settlement', () => {
  const cached = buildMarketEvidenceAcquisitionObservation(
    { ...read, cached: true, txHash: undefined },
    'job-market-1',
  );
  const fresh = buildMarketEvidenceAcquisitionObservation(read, 'job-market-1');
  assert.equal(cached.idempotencyKey, fresh.idempotencyKey);
  assert.equal(cached.planner.directSnapshot?.status, 'unknown');
  assert.equal(cached.planner.directSnapshot?.provenance.includes('payment:0xaggregate'), false);
});

test('a fresh research timestamp creates a new immutable evidence version', () => {
  const later = buildMarketEvidenceAcquisitionObservation(
    { ...read, researchedAt: read.researchedAt + 6 * 60 * 60 * 1000 },
    'job-market-1',
  );
  const first = buildMarketEvidenceAcquisitionObservation(read, 'job-market-1');
  assert.notEqual(later.idempotencyKey, first.idempotencyKey);
  assert.notEqual(later.planner.need.policyVersion, first.planner.need.policyVersion);
});

test('market research projection rejects empty subjects before durable enqueue', () => {
  assert.throws(
    () => buildMarketEvidenceAcquisitionObservation({ ...read, keywords: [] }, 'job-market-1'),
    /at least one keyword/,
  );
});

test('research scout projection uses an opaque deterministic room and explicit source', () => {
  const first = buildResearchScoutEvidenceAcquisitionObservation(read, '0xABCDEF');
  const second = buildResearchScoutEvidenceAcquisitionObservation(read, '0xabcdef');
  assert.deepEqual(first, second);
  assert.equal(first.source, 'research-scout-shadow');
  assert.match(first.dealRoomId, /^research-scout:[a-f0-9]{64}$/);
  assert.equal(first.dealRoomId.includes('abcdef'), false);
});

test('research scout owner changes the observation identity without changing the read claim', () => {
  const first = buildResearchScoutEvidenceAcquisitionObservation(read, '0x111111');
  const second = buildResearchScoutEvidenceAcquisitionObservation(read, '0x222222');
  assert.notEqual(first.dealRoomId, second.dealRoomId);
  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.planner.need.claim, 'market-benchmark');
  assert.equal(second.planner.need.claim, 'market-benchmark');
});

test('research scout projection rejects a missing owner', () => {
  assert.throws(
    () => buildResearchScoutEvidenceAcquisitionObservation(read, '   '),
    /requires an owner/,
  );
});
