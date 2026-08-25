import assert from 'node:assert/strict';
import test from 'node:test';
import { EVIDENCE_ACQUISITION_OPERATION_TASK } from '../evidence/acquisitionTask.js';
import { EVIDENCE_RECONCILIATION_OPERATION_TASK } from '../evidence/reconciliationTask.js';
import { FINANCIAL_COMMAND_OPERATION_TASK } from '../financial/operationTask.js';
import { NEGOTIATION_OPERATION_TASK } from '../negotiation/operationTask.js';
import { createReviewedOperationTaskHandlers } from './reviewedOperationHandlers.js';

test('reviewed operation handler registry is empty without explicit dependencies', () => {
  assert.deepEqual(Object.keys(createReviewedOperationTaskHandlers({})), []);
});

test('reviewed operation handler registry composes only supplied operation seams', () => {
  const negotiation = createReviewedOperationTaskHandlers({
    negotiationExecutor: { async publishOffer() { throw new Error('not invoked'); } },
    negotiationAttempts: { create: async () => { throw new Error('not invoked'); }, get: async () => null, list: async () => [], update: async () => { throw new Error('not invoked'); } },
  });
  assert.deepEqual(Object.keys(negotiation), [NEGOTIATION_OPERATION_TASK]);
  const financial = createReviewedOperationTaskHandlers({
    financialRepository: {} as never,
    financialAdapter: { async createTransfer() { throw new Error('not invoked'); }, async executeContract() { throw new Error('not invoked'); } },
  });
  assert.deepEqual(Object.keys(financial), [FINANCIAL_COMMAND_OPERATION_TASK]);
  const evidence = createReviewedOperationTaskHandlers({
    evidenceRepository: {} as never,
    evidenceAdapter: { async acquire() { throw new Error('not invoked'); } },
  });
  assert.deepEqual(Object.keys(evidence), [EVIDENCE_ACQUISITION_OPERATION_TASK]);
  const evidenceReconciliation = createReviewedOperationTaskHandlers({
    evidenceReconciliationRepository: {} as never,
  });
  assert.deepEqual(Object.keys(evidenceReconciliation), [EVIDENCE_RECONCILIATION_OPERATION_TASK]);
});
