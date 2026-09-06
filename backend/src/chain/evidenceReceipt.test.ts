import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEvidenceReceipt, type RawEvidenceReceipt } from './evidenceReceipt.js';

const raw: RawEvidenceReceipt = {
  termsVersion: 1n,
  evidenceRevision: 2n,
  expiresAt: 2_000_000_000n,
  decisionCode: 1,
  evidenceCommitment: `0x${'11'.repeat(32)}`,
  verdictCommitment: `0x${'22'.repeat(32)}`,
  reportId: `0x${'33'.repeat(32)}`,
  recordedAt: 1_900_000_000n,
};

test('classifies a current PASS receipt without treating it as settlement approval', () => {
  assert.equal(classifyEvidenceReceipt(raw, 1, 1_950_000_000).state, 'pass');
});

test('keeps mismatch and unavailable distinct', () => {
  assert.equal(classifyEvidenceReceipt({ ...raw, decisionCode: 2 }, 1, 1_950_000_000).state, 'mismatch');
  assert.equal(classifyEvidenceReceipt({ ...raw, decisionCode: 3 }, 1, 1_950_000_000).state, 'unavailable');
});

test('rejects expired and stale agreement receipts before trusting PASS', () => {
  assert.equal(classifyEvidenceReceipt(raw, 2, 1_950_000_000).state, 'stale-terms');
  assert.equal(classifyEvidenceReceipt(raw, 1, 2_000_000_001).state, 'expired');
});

test('recognizes an empty registry slot', () => {
  assert.deepEqual(classifyEvidenceReceipt({ ...raw, termsVersion: 0n }, 1, 1_950_000_000), {
    state: 'not-recorded',
    agreementVersion: 1,
    registryAddress: undefined,
  });
});
