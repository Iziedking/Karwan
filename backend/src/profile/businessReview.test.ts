import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTRY_STATUS, registryReviewCall, reviewBlocker, statusAfter } from './businessReview.js';

const applicant = '0x1111111111111111111111111111111111111111';
const docHash = `0x${'ab'.repeat(32)}`;
const reasonHash = `0x${'cd'.repeat(32)}`;

test('newer registries bind the decision to the reviewed document', () => {
  assert.deepEqual(registryReviewCall({ decision: 'approve', applicant, docHash, bindsDocHash: true }), {
    abiFunctionSignature: 'approve(address,bytes32)',
    abiParameters: [applicant, docHash],
  });
  assert.deepEqual(registryReviewCall({ decision: 'reject', applicant, docHash, reasonHash, bindsDocHash: true }), {
    abiFunctionSignature: 'reject(address,bytes32,bytes32)',
    abiParameters: [applicant, docHash, reasonHash],
  });
});

test('older testnet registries keep their original signatures', () => {
  assert.deepEqual(registryReviewCall({ decision: 'approve', applicant, docHash, bindsDocHash: false }), {
    abiFunctionSignature: 'approve(address)',
    abiParameters: [applicant],
  });
  assert.deepEqual(registryReviewCall({ decision: 'reject', applicant, docHash, reasonHash, bindsDocHash: false }), {
    abiFunctionSignature: 'reject(address,bytes32)',
    abiParameters: [applicant, reasonHash],
  });
});

test('a rejection without a reason is refused', () => {
  assert.throws(() => registryReviewCall({ decision: 'reject', applicant, docHash, bindsDocHash: true }));
});

test('the review only proceeds when the chain shows the same document waiting', () => {
  assert.equal(reviewBlocker({ status: REGISTRY_STATUS.submitted, docHash: docHash.toUpperCase().replace('0X', '0x') }, docHash), null);
  assert.equal(reviewBlocker({ status: REGISTRY_STATUS.submitted, docHash: `0x${'ef'.repeat(32)}` }, docHash), 'document_changed');
  assert.equal(reviewBlocker({ status: REGISTRY_STATUS.verified, docHash }, docHash), 'not_awaiting_review');
  assert.equal(reviewBlocker({ status: REGISTRY_STATUS.none, docHash }, docHash), 'not_awaiting_review');
});

test('each decision has one status the chain must show afterwards', () => {
  assert.equal(statusAfter('approve'), REGISTRY_STATUS.verified);
  assert.equal(statusAfter('reject'), REGISTRY_STATUS.rejected);
});
