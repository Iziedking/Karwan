import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../../core/api';
import { creVerificationPollInterval, creVerificationState } from './creVerification.js';

const deal = { evidenceRequired: true, delivered: true, evidenceReceipt: { state: 'not-recorded', agreementVersion: 1 } } as DirectDeal;
test('execution progress never invents a chain verdict', () => {
  for (const state of ['queued', 'checking', 'confirming', 'awaitingRequest'] as const) {
    assert.equal(creVerificationState({ ...deal, creVerification: { state } }), state);
  }
  assert.equal(creVerificationState({ ...deal, creVerification: { state: 'pass' } }), 'unavailable');
  assert.equal(creVerificationState(deal), 'unavailable');
  assert.equal(creVerificationState({ ...deal, delivered: false }), 'awaitingDelivery');
  assert.equal(creVerificationState({ ...deal, creVerification: { state: 'checking' }, evidenceReceipt: { state: 'pass', agreementVersion: 1 } }), 'pass');
  assert.equal(creVerificationState({ ...deal, creVerification: { state: 'checking' }, evidenceReceipt: { state: 'stale-delivery', agreementVersion: 1 } }), 'unavailable');
});

test('polls open CRE deliveries, stopping for ordinary, closed and verified outcomes', () => {
  assert.equal(creVerificationPollInterval(deal), 5000);
  assert.equal(creVerificationPollInterval({ ...deal, creVerification: { state: 'checking' } }), 5000);
  for (const candidate of [undefined, { ...deal, evidenceRequired: false }, { ...deal, delivered: false }, { ...deal, settledAt: 1 }, { ...deal, cancelledAt: 1 }]) {
    assert.equal(creVerificationPollInterval(candidate), false);
  }
  for (const state of ['pass', 'mismatch'] as const) {
    assert.equal(creVerificationPollInterval({ ...deal, evidenceReceipt: { state, agreementVersion: 1 } }), false);
  }
});
