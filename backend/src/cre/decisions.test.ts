import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackDue, proposalFromEvidence, verifierForFunding } from './decisions.js';

const evidence = (decision: 'PASS' | 'FAIL' | 'UNAVAILABLE', passed: number, required = 4) => ({ decision, passed, required });

test('a pass proposes full payment to the seller', () => {
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: 2 }, evidence('PASS', 4)), { kind: 'propose', sellerBps: 10_000 });
});

test('a fail at or above the agreed partial line proposes the partial share', () => {
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: 2 }, evidence('FAIL', 2)), { kind: 'propose', sellerBps: 5000 });
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: 2 }, evidence('FAIL', 3)), { kind: 'propose', sellerBps: 5000 });
});

test('a fail below the line, or with no partial share in the terms, proposes a full refund', () => {
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: 2 }, evidence('FAIL', 1)), { kind: 'propose', sellerBps: 0 });
  assert.deepEqual(proposalFromEvidence({ partialBps: 0 }, { partialAt: 2 }, evidence('FAIL', 3)), { kind: 'propose', sellerBps: 0 });
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: null }, evidence('FAIL', 3)), { kind: 'propose', sellerBps: 0 });
});

test('no evidence, or no result, goes to the reviewers', () => {
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: 2 }, null), { kind: 'escalate' });
  assert.deepEqual(proposalFromEvidence({ partialBps: 5000 }, { partialAt: 2 }, evidence('UNAVAILABLE', 0)), { kind: 'escalate' });
});

test('Karwan answers only after the fallback time, and only when nothing is on chain', () => {
  const base = { deliveredAtMs: 1_000_000, chainHasResult: false, creAnswered: false, afterMs: 3_600_000 };
  assert.equal(fallbackDue({ ...base, nowMs: 1_000_000 + 3_599_999 }), false);
  assert.equal(fallbackDue({ ...base, nowMs: 1_000_000 + 3_600_000 }), true);
  assert.equal(fallbackDue({ ...base, chainHasResult: true, nowMs: 9e12 }), false);
  assert.equal(fallbackDue({ ...base, creAnswered: true, nowMs: 9e12 }), false);
});

test('the verifier named at funding follows CRE_ENABLED', () => {
  const v = { verifierK: '0x000000000000000000000000000000000000000a', verifierCK: '0x000000000000000000000000000000000000000b' };
  assert.equal(verifierForFunding({ creEnabled: false, ...v }), v.verifierK);
  assert.equal(verifierForFunding({ creEnabled: true, ...v }), v.verifierCK);
  assert.equal(verifierForFunding({ creEnabled: true, verifierK: v.verifierK }), null);
});
