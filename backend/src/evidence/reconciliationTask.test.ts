import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import {
  createEvidenceReconciliationOperationHandlers,
  createEvidenceReconciliationOperationObserver,
  EVIDENCE_RECONCILIATION_OPERATION_TASK,
  parseEvidenceReconciliationOperationTask,
  type EvidenceReconciliationOperationTaskData,
} from './reconciliationTask.js';
import { InMemoryEvidenceRuntimeRepository } from './runtime.js';
import type { DataBudget } from '../x402/dataGate.js';

function fakeBudget(failFirst = false) {
  const spent: Array<{ owner: string; usd: number }> = [];
  let failed = !failFirst;
  const budget: DataBudget = {
    fits: async () => true,
    spent: async (owner, usd) => {
      if (!failed) {
        failed = true;
        throw new Error('temporary budget store outage');
      }
      spent.push({ owner, usd });
    },
    reached: () => undefined,
  };
  return { budget, spent };
}

const OWNER = '0x1111111111111111111111111111111111111111';

async function uncertainPurchase() {
  const repository = new InMemoryEvidenceRuntimeRepository();
  const need = await repository.createNeed({
    id: 'need:reconcile-task',
    dealRoomId: 'room:reconcile-task',
    needKey: 'reconcile-task',
    kind: 'completed-transactions',
    riskClass: 'qualification',
    data: { subject: OWNER },
    now: 100,
  });
  const purchase = await repository.createPurchase({
    id: 'purchase:reconcile-task',
    evidenceNeedId: need.record.id,
    idempotencyKey: 'evidence:reconcile-task',
    providerId: 'provider-reconcile-task',
    priceUsdc: '0.25',
    data: {},
    now: 101,
  });
  const unknown = await repository.updatePurchase(purchase.record.id, purchase.record.version, 'unknown', {
    providerTransactionId: 'provider-tx-unknown',
    now: 102,
  });
  return { repository, purchase: unknown };
}

function taskData(purchaseVersion: number, overrides: Partial<EvidenceReconciliationOperationTaskData> = {}): EvidenceReconciliationOperationTaskData {
  return {
    dealRoomId: 'room:reconcile-task',
    purchaseId: 'purchase:reconcile-task',
    expectedPurchaseVersion: purchaseVersion,
    observationKey: 'provider-tx-unknown:settled:1',
    observedAtUnix: 120,
    source: 'provider-webhook',
    verificationReference: 'webhook:provider-tx-unknown:1',
    state: 'settled',
    providerTransactionId: 'provider-tx-unknown',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    snapshot: {
      snapshotId: 'snapshot:reconcile-task',
      source: 'x402',
      capturedAtUnix: 119,
      reliability: 91,
      status: 'fresh',
      responseHash: 'sha256:reconcile-task',
      provenance: ['provider-tx-unknown', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    },
    ...overrides,
  };
}

test('reconciliation observation settles one uncertain purchase and snapshot, and records the spend once', async () => {
  const { repository, purchase } = await uncertainPurchase();
  const fake = fakeBudget();
  const persistedPurchase = await repository.updatePurchase(
    purchase.id,
    purchase.version,
    purchase.state,
    { data: { budgetOwner: OWNER }, now: 104 },
  );
  const tasks = new InMemoryDurableTaskStore();
  const rooms = new InMemoryAgentRuntimeRepository();
  const observe = createEvidenceReconciliationOperationObserver(tasks, rooms);
  const input = taskData(persistedPurchase.version);
  assert.deepEqual(await observe(input), { created: true });
  assert.deepEqual(await observe(input), { created: false });

  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceReconciliationOperationHandlers({ repository, budget: fake.budget, clock: () => 130 }),
    { workerId: 'evidence-reconciliation-worker', clock: () => 130 },
  );
  assert.equal((await runner.runOnce(130)).succeeded, 1);
  const settled = await repository.getPurchase(purchase.id);
  assert.equal(settled?.state, 'settled');
  assert.equal(settled?.txHash, input.txHash);
  assert.equal(settled?.data.budgetRecorded, true);
  assert.equal((await repository.getNeed('need:reconcile-task'))?.state, 'fulfilled');
  assert.equal((await repository.listSnapshots('need:reconcile-task')).length, 1);
  assert.deepEqual(fake.spent, [{ owner: OWNER, usd: 0.25 }]);
  const checkpoint = (await tasks.listCheckpoints(`task:evidence:reconcile:${input.purchaseId}:${input.observationKey}`)).at(-1);
  assert.equal(checkpoint?.data.providerCallMade, false);
  assert.equal(checkpoint?.data.financialMutation, false);
  assert.equal(checkpoint?.data.budgetRecorded, true);
});

test('failed reconciliation records no spend and never fabricates a snapshot', async () => {
  const { repository, purchase } = await uncertainPurchase();
  const fake = fakeBudget();
  const persistedPurchase = await repository.updatePurchase(
    purchase.id,
    purchase.version,
    purchase.state,
    { data: { budgetOwner: OWNER }, now: 104 },
  );
  const tasks = new InMemoryDurableTaskStore();
  const input = taskData(persistedPurchase.version, {
    observationKey: 'provider-tx-unknown:failed:1',
    verificationReference: 'webhook:provider-tx-unknown:failed',
    state: 'failed',
    providerTransactionId: undefined,
    txHash: undefined,
    failureCode: 'PROVIDER_DENIED',
    snapshot: undefined,
  });
  await tasks.enqueue({
    id: `task:evidence:reconcile:${input.purchaseId}:${input.observationKey}`,
    kind: EVIDENCE_RECONCILIATION_OPERATION_TASK,
    idempotencyKey: `evidence-reconciliation:${input.purchaseId}:${input.observationKey}`,
    availableAt: input.observedAtUnix,
    data: input,
    now: input.observedAtUnix,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceReconciliationOperationHandlers({ repository, budget: fake.budget, clock: () => 130 }),
    { workerId: 'evidence-reconciliation-failed-worker', clock: () => 130 },
  );
  assert.equal((await runner.runOnce(130)).succeeded, 1);
  assert.equal((await repository.getPurchase(purchase.id))?.state, 'failed');
  assert.equal((await repository.listSnapshots('need:reconcile-task')).length, 0);
  assert.deepEqual(fake.spent, []);
});

test('a spend that fails after settlement is recorded on the retry, once', async () => {
  const { repository, purchase } = await uncertainPurchase();
  const fake = fakeBudget(true);
  const persistedPurchase = await repository.updatePurchase(
    purchase.id,
    purchase.version,
    purchase.state,
    { data: { budgetOwner: OWNER }, now: 104 },
  );
  const tasks = new InMemoryDurableTaskStore();
  const input = taskData(persistedPurchase.version);
  await tasks.enqueue({
    id: `task:evidence:reconcile:${input.purchaseId}:${input.observationKey}`,
    kind: EVIDENCE_RECONCILIATION_OPERATION_TASK,
    idempotencyKey: `evidence-reconciliation:${input.purchaseId}:${input.observationKey}`,
    availableAt: input.observedAtUnix,
    data: input,
    now: input.observedAtUnix,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceReconciliationOperationHandlers({ repository, budget: fake.budget, clock: () => 130 }),
    { workerId: 'evidence-reconciliation-retry-worker', clock: () => 130 },
  );
  assert.deepEqual(await runner.runOnce(130), {
    succeeded: 0,
    waiting: 0,
    retried: 1,
    deadLettered: 0,
    leaseLost: 0,
  });
  assert.deepEqual(fake.spent, []);
  assert.equal((await repository.getPurchase(purchase.id))?.state, 'settled');
  assert.equal((await repository.listSnapshots('need:reconcile-task')).length, 1);
  assert.deepEqual(await runner.runOnce(1_130), {
    succeeded: 1,
    waiting: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  });
  assert.deepEqual(fake.spent, [{ owner: OWNER, usd: 0.25 }]);
  assert.equal((await repository.getPurchase(purchase.id))?.data.budgetRecorded, true);
  assert.equal((await repository.listSnapshots('need:reconcile-task')).length, 1);
});

test('duplicate observation conflicts do not overwrite settled proof', async () => {
  const { repository, purchase } = await uncertainPurchase();
  const tasks = new InMemoryDurableTaskStore();
  const first = taskData(purchase.version);
  const second = taskData(purchase.version, { txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  const taskId = `task:evidence:reconcile:${first.purchaseId}:${first.observationKey}`;
  await tasks.enqueue({
    id: taskId,
    kind: EVIDENCE_RECONCILIATION_OPERATION_TASK,
    idempotencyKey: `evidence-reconciliation:${first.purchaseId}:${first.observationKey}`,
    availableAt: first.observedAtUnix,
    data: first,
    now: first.observedAtUnix,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceReconciliationOperationHandlers({ repository, clock: () => 130 }),
    { workerId: 'evidence-reconciliation-conflict-worker', clock: () => 130 },
  );
  assert.equal((await runner.runOnce(130)).succeeded, 1);
  const current = await repository.getPurchase(purchase.id);
  assert.equal(current?.txHash, first.txHash);
  const conflictTasks = new InMemoryDurableTaskStore();
  await conflictTasks.enqueue({
    id: taskId,
    kind: EVIDENCE_RECONCILIATION_OPERATION_TASK,
    idempotencyKey: `evidence-reconciliation:${first.purchaseId}:${first.observationKey}:conflict`,
    availableAt: second.observedAtUnix,
    data: second,
    now: second.observedAtUnix,
  });
  const conflictRunner = new DurableTaskRunner(
    conflictTasks,
    createEvidenceReconciliationOperationHandlers({ repository, clock: () => 130 }),
    { workerId: 'evidence-reconciliation-conflict-replay-worker', clock: () => 130 },
  );
  assert.equal((await conflictRunner.runOnce(130)).succeeded, 1);
  assert.equal((await repository.getPurchase(purchase.id))?.txHash, first.txHash);
  const checkpoint = (await conflictTasks.listCheckpoints(taskId)).at(-1);
  assert.equal(checkpoint?.data.reason, 'EVIDENCE_RECONCILIATION_CONFLICT');
});

test('stale reconciliation observations are rejected without changing the purchase', async () => {
  const { repository, purchase } = await uncertainPurchase();
  const tasks = new InMemoryDurableTaskStore();
  const input = taskData(purchase.version - 1);
  await tasks.enqueue({
    id: `task:evidence:reconcile:${input.purchaseId}:${input.observationKey}`,
    kind: EVIDENCE_RECONCILIATION_OPERATION_TASK,
    idempotencyKey: `evidence-reconciliation:${input.purchaseId}:${input.observationKey}`,
    availableAt: input.observedAtUnix,
    data: input,
    now: input.observedAtUnix,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceReconciliationOperationHandlers({ repository, clock: () => 130 }),
    { workerId: 'evidence-reconciliation-stale-worker', clock: () => 130 },
  );
  assert.equal((await runner.runOnce(130)).succeeded, 1);
  assert.equal((await repository.getPurchase(purchase.id))?.state, 'unknown');
  const checkpoint = (await tasks.listCheckpoints(`task:evidence:reconcile:${input.purchaseId}:${input.observationKey}`)).at(-1);
  assert.equal(checkpoint?.data.reason, 'EVIDENCE_PURCHASE_VERSION_STALE');
});

test('reconciliation input requires exact settlement proof and rejects unknown fields', () => {
  assert.throws(() => parseEvidenceReconciliationOperationTask({
    ...taskData(1),
    txHash: undefined,
  }), /settled evidence requires txHash/);
  assert.throws(() => parseEvidenceReconciliationOperationTask({
    ...taskData(1),
    extra: true,
  }), /Unrecognized key/);
});
