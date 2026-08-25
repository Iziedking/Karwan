import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBusinessVerificationProgress,
  getBusinessVerificationStep,
  hasRequiredBusinessProfile,
} from './businessVerificationModel';

test('requires company name, sector, and region before evidence', () => {
  assert.equal(hasRequiredBusinessProfile(null), false);
  assert.equal(hasRequiredBusinessProfile({ companyName: 'Karwan', sector: 'logistics' }), false);
  assert.equal(
    hasRequiredBusinessProfile({ companyName: 'Karwan', sector: 'logistics', region: 'Lagos' }),
    true,
  );
});

test('moves through profile, evidence, review, and verified completion', () => {
  const completeProfile = { companyName: 'Karwan', sector: 'logistics', region: 'Lagos' };
  assert.equal(getBusinessVerificationStep('none', null), 'profile');
  assert.equal(getBusinessVerificationStep('rejected', completeProfile), 'evidence');
  assert.equal(getBusinessVerificationStep('submitted', completeProfile), 'review');
  assert.equal(getBusinessVerificationStep('verified', completeProfile), 'complete');
});

test('maps workflow states to the three visible progress stages', () => {
  assert.equal(getBusinessVerificationProgress('profile'), 1);
  assert.equal(getBusinessVerificationProgress('evidence'), 2);
  assert.equal(getBusinessVerificationProgress('review'), 3);
  assert.equal(getBusinessVerificationProgress('complete'), 3);
});
