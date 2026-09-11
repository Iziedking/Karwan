import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { receiptBindingFromView } from './creEvidenceReconciler.js';

const base = {
  agreementVersion: 1,
  termsVersion: 1,
  evidenceRevision: 3,
  expiresAt: 2_000_000_000,
  evidenceCommitment: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
  verdictCommitment: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`,
  reportId: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as `0x${string}`,
};

describe('CRE receipt reconciliation', () => {
  test('maps terminal chain decisions to a bindable receipt', () => {
    const binding = receiptBindingFromView({ ...base, state: 'pass' });
    assert.ok(binding);
    assert.equal(binding.termsVersion, 1);
    assert.equal(binding.evidenceRevision, 3);
    assert.equal(binding.decisionCode, 1);
    assert.equal(binding.reportId, base.reportId);
    assert.equal(typeof binding.boundAt, 'number');
    assert.equal(receiptBindingFromView({ ...base, state: 'mismatch' })?.decisionCode, 2);
    assert.equal(receiptBindingFromView({ ...base, state: 'unavailable' })?.decisionCode, 3);
  });

  test('keeps unrecorded, expired, and unreadable states unbound', () => {
    assert.equal(receiptBindingFromView({ ...base, state: 'not-recorded' }), null);
    assert.equal(receiptBindingFromView({ ...base, state: 'expired' }), null);
    assert.equal(receiptBindingFromView({ ...base, state: 'read-unavailable' }), null);
    assert.equal(receiptBindingFromView({ ...base, state: 'pass', reportId: undefined }), null);
  });
});
