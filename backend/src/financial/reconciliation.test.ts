import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFinancialRuntimeRepository } from './runtime.js';
import { reconcileFinancialCommand, reconcileFinancialRuntimeOnce } from './reconciliation.js';

function command() {
  return {
    commandId: 'reconcile-command-1', idempotencyKey: 'financial:reconcile:1', operation: 'ESCROW_FUNDING' as const,
    amountUsdc: '5', amountMicros: '5000000', sourceAddress: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222',
    expectedDealRoomVersion: 1, mandateVersion: 1, decision: 'AUTHORIZED' as const, reason: 'POLICY_ACCEPTED', data: {}, now: 100,
  };
}

test('reconciliation does not settle without a transaction hash and never resubmits', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision(command());
  const unknown = await repository.recordProviderUpdate(created.record.idempotencyKey, created.record.version, { lifecycle: 'UNKNOWN', providerId: 'circle-reconcile-1' }, 110);
  let calls = 0;
  const adapter = {
    async getTransaction(providerId: string) {
      calls += 1;
      return { providerId, status: calls === 1 ? 'COMPLETE' as const : 'COMPLETE' as const, raw: {} };
    },
  };
  const first = await reconcileFinancialCommand(repository, adapter, unknown.idempotencyKey, 120);
  assert.equal(first.status, 'updated');
  assert.equal((await repository.get(unknown.idempotencyKey))?.providerLifecycle, 'RECONCILING');
  const second = await reconcileFinancialCommand(repository, {
    async getTransaction(providerId: string) { return { providerId, status: 'COMPLETE' as const, txHash: '0xsettled', raw: {} }; },
  }, unknown.idempotencyKey, 130);
  assert.equal(second.status, 'updated');
  const settled = await repository.get(unknown.idempotencyKey);
  assert.equal(settled?.providerLifecycle, 'SETTLED');
  assert.equal(settled?.txHash, '0xsettled');
  assert.equal(calls, 1);
});

test('reconciliation maps provider failures and skips terminal commands', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision(command());
  const submitted = await repository.recordProviderUpdate(created.record.idempotencyKey, created.record.version, { lifecycle: 'SUBMITTED', providerId: 'circle-reconcile-2' }, 110);
  const failed = await reconcileFinancialCommand(repository, {
    async getTransaction(providerId: string) { return { providerId, status: 'FAILED' as const, raw: {} }; },
  }, submitted.idempotencyKey, 120);
  assert.equal(failed.status, 'updated');
  assert.equal((await repository.get(submitted.idempotencyKey))?.providerLifecycle, 'FAILED');
  const skipped = await reconcileFinancialCommand(repository, {
    async getTransaction() { throw new Error('must not poll terminal command'); },
  }, submitted.idempotencyKey, 130);
  assert.deepEqual(skipped, { status: 'skipped', reason: 'TERMINAL_COMMAND' });
});

test('bounded reconciliation polls only persisted non-terminal commands', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const first = await repository.recordDecision({ ...command(), idempotencyKey: 'financial:batch:unknown' });
  await repository.recordProviderUpdate(first.record.idempotencyKey, first.record.version, { lifecycle: 'UNKNOWN', providerId: 'circle-batch-1' }, 110);
  const second = await repository.recordDecision({ ...command(), commandId: 'reconcile-command-2', idempotencyKey: 'financial:batch:terminal' });
  await repository.recordProviderUpdate(second.record.idempotencyKey, second.record.version, { lifecycle: 'FAILED', providerId: 'circle-batch-2', failureCode: 'FAILED' }, 110);
  await repository.recordDecision({ ...command(), commandId: 'reconcile-command-3', idempotencyKey: 'financial:batch:no-provider' });
  let polls = 0;
  const result = await reconcileFinancialRuntimeOnce(repository, {
    async getTransaction(providerId: string) {
      polls += 1;
      return { providerId, status: 'COMPLETE' as const, raw: {} };
    },
  }, { now: 120, limit: 10 });
  assert.deepEqual(result, {
    scanned: 3,
    polled: 1,
    updated: 1,
    skipped: 2,
    errors: [],
  });
  assert.equal(polls, 1);
  assert.equal((await repository.get('financial:batch:unknown'))?.providerLifecycle, 'RECONCILING');
});
