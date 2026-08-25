import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from './durableTaskRunner.js';
import { createFinancialReconciliationShadowHandlers, createFinancialReconciliationShadowObserver, parseCircleReconciliationObservation } from './financialReconciliationShadow.js';
import { InMemoryFinancialRuntimeRepository } from '../financial/runtime.js';

test('financial reconciliation shadow task is idempotent and records provider settlement', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const created = await repository.recordDecision({
    commandId: 'reconcile-task-command', idempotencyKey: 'financial:reconcile-task', operation: 'STAKE', amountUsdc: '5', amountMicros: '5000000',
    sourceAddress: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222',
    expectedDealRoomVersion: 1, mandateVersion: 1, decision: 'AUTHORIZED', reason: 'POLICY_ACCEPTED', data: {}, now: 100,
  });
  await repository.recordProviderUpdate(created.record.idempotencyKey, created.record.version, { lifecycle: 'UNKNOWN', providerId: 'circle-reconcile-task' }, 110);
  const observe = createFinancialReconciliationShadowObserver(tasks);
  const observation = { data: { idempotencyKey: created.record.idempotencyKey, providerId: 'circle-reconcile-task', lifecycle: 'SETTLED' as const, txHash: '0xsettled', observedAtUnix: 120 } };
  await observe(observation);
  await observe(observation);
  const runner = new DurableTaskRunner(tasks, createFinancialReconciliationShadowHandlers(repository, { clock: () => 200 }), { workerId: 'reconcile-worker', clock: () => 200 });
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const record = await repository.get(created.record.idempotencyKey);
  assert.equal(record?.providerLifecycle, 'SETTLED');
  assert.equal(record?.txHash, '0xsettled');
  const checkpoints = await tasks.listCheckpoints(`task:financial:reconcile:${created.record.idempotencyKey}:circle-reconcile-task`);
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, false);
});

test('circle reconciliation extraction requires an explicit command correlation and never guesses one', () => {
  assert.equal(parseCircleReconciliationObservation({ id: 'provider-only', state: 'COMPLETE' }, 10), null);
  assert.deepEqual(
    parseCircleReconciliationObservation({
      transaction: {
        id: 'provider-1',
        state: 'COMPLETE',
        transactionHash: '0xabc',
        metadata: { idempotencyKey: 'financial:1' },
      },
    }, 20),
    {
      idempotencyKey: 'financial:1', providerId: 'provider-1', lifecycle: 'SETTLED',
      txHash: '0xabc', observedAtUnix: 20,
    },
  );
  assert.deepEqual(
    parseCircleReconciliationObservation({
      id: 'provider-1', state: 'COMPLETE', txHash: '0xabc', idempotencyKey: 'financial:1',
    }, 20),
    {
      idempotencyKey: 'financial:1', providerId: 'provider-1', lifecycle: 'SETTLED',
      txHash: '0xabc', observedAtUnix: 20,
    },
  );
  assert.deepEqual(
    parseCircleReconciliationObservation({
      id: 'provider-2', state: 'UNKNOWN', idempotencyKey: 'financial:2',
    }, 30),
    {
      idempotencyKey: 'financial:2', providerId: 'provider-2', lifecycle: 'RECONCILING', observedAtUnix: 30,
    },
  );
});
