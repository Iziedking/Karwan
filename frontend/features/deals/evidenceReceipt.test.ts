import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceReceiptBodyKey, evidenceReceiptCopyKey, evidenceReceiptTone } from './evidenceReceipt.js';
import type { EvidenceReceiptState } from '../../../backend/src/chain/evidenceReceipt.js';

test('maps every chain receipt state to deliberate UI copy', () => {
  const states = {
    pass: 'pass', mismatch: 'mismatch', unavailable: 'unavailable', expired: 'expired',
    'stale-terms': 'staleTerms', 'stale-delivery': 'staleDelivery',
    'read-unavailable': 'readUnavailable', 'not-recorded': 'notRecorded', 'not-configured': 'notConfigured',
  } as const satisfies Record<EvidenceReceiptState, string>;
  for (const [state, key] of Object.entries(states)) {
    assert.equal(evidenceReceiptCopyKey(state as EvidenceReceiptState), key);
  }
  assert.equal(evidenceReceiptCopyKey('pass'), 'pass');
  assert.equal(evidenceReceiptCopyKey('stale-terms'), 'staleTerms');
  assert.equal(evidenceReceiptCopyKey('read-unavailable'), 'readUnavailable');
});

test('separates missing, stale, unreadable and failed-source evidence', () => {
  assert.equal(evidenceReceiptBodyKey('stale-delivery'), 'staleBody');
  assert.equal(evidenceReceiptBodyKey('not-recorded'), 'pendingBody');
  assert.equal(evidenceReceiptBodyKey('not-configured'), 'notConfiguredBody');
  assert.equal(evidenceReceiptBodyKey('read-unavailable'), 'readUnavailableBody');
  assert.equal(evidenceReceiptBodyKey('unavailable'), 'unavailableBody');
  assert.equal(evidenceReceiptTone('stale-delivery'), 'warning');
});

test('reserves the positive tone for current PASS evidence', () => {
  assert.equal(evidenceReceiptTone('pass'), 'positive');
  assert.equal(evidenceReceiptTone('mismatch'), 'warning');
  assert.equal(evidenceReceiptTone('not-recorded'), 'neutral');
});
