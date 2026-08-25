import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFinancialCommandLedger, decideFinancialCommand } from './commandBoundary.js';

const base = {
  commandId: 'command-1', idempotencyKey: 'stake:room-1:offer-1', operation: 'STAKE' as const,
  amountUsdc: '500', sourceAddress: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222',
  expectedDealRoomVersion: 4, expectedOfferVersion: 8, mandateVersion: 3, nowUnix: 100,
};
const policy = { autonomousMaxUsdc: '250', allowedDestinations: ['0x2222222222222222222222222222222222222222'], requireApprovalFor: [] as const };
const current = { dealRoomVersion: 4, offerVersion: 8, mandateVersion: 3 };

test('amounts above autonomous policy require approval without creating a provider submission', () => {
  const decision = decideFinancialCommand(base, policy, current);
  assert.equal(decision.decision, 'APPROVAL_REQUIRED');
  assert.equal(decision.reason, 'AUTONOMOUS_LIMIT_EXCEEDED');
});

test('approval is exact, scoped, unexpired, and cannot authorize a larger amount', () => {
  const approved = decideFinancialCommand({ ...base, approvalId: 'approval-1', approvalVersion: 2 }, policy, {
    ...current, approval: { id: 'approval-1', version: 2, expiresAtUnix: 200, amountUsdc: '500' },
  });
  assert.equal(approved.decision, 'AUTHORIZED');
  const tooSmall = decideFinancialCommand({ ...base, amountUsdc: '501', approvalId: 'approval-1', approvalVersion: 2 }, policy, {
    ...current, approval: { id: 'approval-1', version: 2, expiresAtUnix: 200, amountUsdc: '500' },
  });
  assert.equal(tooSmall.reason, 'APPROVAL_AMOUNT_TOO_SMALL');
  const expired = decideFinancialCommand({ ...base, approvalId: 'approval-1', approvalVersion: 2 }, policy, {
    ...current, approval: { id: 'approval-1', version: 2, expiresAtUnix: 100, amountUsdc: '500' },
  });
  assert.equal(expired.reason, 'EXPIRED_APPROVAL');
});

test('duplicate decisions and provider submissions replay the first result', () => {
  const ledger = new InMemoryFinancialCommandLedger();
  const first = ledger.decide({ ...base, amountUsdc: '100' }, policy, current);
  const replay = ledger.decide({ ...base, amountUsdc: '200' }, policy, current);
  assert.deepEqual(replay, first);
  const submitted = ledger.recordSubmission(base.idempotencyKey, { lifecycle: 'UNKNOWN', providerId: 'provider-1' });
  assert.deepEqual(ledger.recordSubmission(base.idempotencyKey, { lifecycle: 'SUBMITTED', providerId: 'provider-2' }), submitted);
  assert.throws(() => ledger.recordSubmission('settled-1', { lifecycle: 'SETTLED' }), /TX_HASH/);
});
