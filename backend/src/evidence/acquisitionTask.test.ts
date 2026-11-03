import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import {
  createEvidenceAcquisitionOperationHandlers,
  createEvidenceAcquisitionOperationObserver,
  EVIDENCE_ACQUISITION_OPERATION_TASK,
  type EvidenceAcquisitionOperationTaskData,
} from './acquisitionTask.js';
import { evidenceNeedKey } from './planner.js';
import { InMemoryEvidenceRuntimeRepository } from './runtime.js';
import type { DataBudget } from '../x402/dataGate.js';

function fakeBudget(limitUsd: number) {
  const spent: Array<{ owner: string; usd: number; kind: string }> = [];
  let reached = 0;
  const budget: DataBudget = {
    fits: async (_owner, priceUsd) => spent.reduce((sum, s) => sum + s.usd, 0) + priceUsd <= limitUsd,
    spent: async (owner, usd, kind) => {
      spent.push({ owner, usd, kind });
    },
    reached: () => {
      reached += 1;
    },
  };
  return { budget, spent, reached: () => reached };
}

const PAY_TO = '0x2222222222222222222222222222222222222222';

function taskData(overrides: Partial<EvidenceAcquisitionOperationTaskData> = {}): EvidenceAcquisitionOperationTaskData {
  return {
    dealRoomId: 'room-evidence-operation-1',
    source: 'manual-review',
    idempotencyKey: 'evidence-operation:room-1:need-1',
    planner: {
      need: {
        needId: 'need-1', claim: 'completed-transactions', subject: '0x1111111111111111111111111111111111111111',
        decision: 'qualification', requiredFreshnessSeconds: 3_600, minimumReliability: 70,
        maximumPriceUsdc: '2', mandateVersion: 1, policyVersion: 'policy-1', expiresAtUnix: 1_000,
      },
      nowUnix: 100,
      cachedSnapshots: [],
      providers: [{
        providerId: 'provider-x402-1', source: 'x402', endpoint: 'https://evidence.example.test/v1',
        network: 'arc-testnet', asset: 'USDC', payTo: PAY_TO, priceUsdc: '0.25', expectedReliability: 90,
        responseLimitBytes: 100_000, providerVersion: '2026-08-24', claims: ['completed-transactions'],
        provenanceRequirements: ['receipt'], enabled: true,
        circuit: { state: 'closed', consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
      }],
      expectedDecisionValueUsdc: '5', perDealSpentUsdc: '0', perDealBudgetUsdc: '1',
      allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'], allowedPayTo: [PAY_TO],
      requiredProvenance: ['receipt'],
    },
    ...overrides,
  };
}

test('reviewed acquisition observer and handler submit one injected provider call and persist its snapshot', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const rooms = new InMemoryAgentRuntimeRepository();
  let calls = 0;
  const observe = createEvidenceAcquisitionOperationObserver(tasks, rooms);
  const data = taskData();
  assert.deepEqual(await observe(data), { created: true });
  assert.deepEqual(await observe(data), { created: false });
  assert.equal((await rooms.getDealRoom(data.dealRoomId))?.state, 'open');

  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionOperationHandlers({
      repository,
      clock: () => 200,
      adapter: {
        async acquire(input) {
          calls += 1;
          assert.equal(input.idempotencyKey, `evidence:${evidenceNeedKey(data.planner.need)}:provider-x402-1`);
          return {
            state: 'settled',
            providerTransactionId: 'provider-evidence-1',
            txHash: '0xreceipt-1',
            snapshot: {
              snapshotId: 'snapshot-evidence-1', needId: 'need-1', source: 'x402', capturedAtUnix: 100,
              reliability: 90, status: 'fresh', provenance: ['receipt'], responseHash: 'hash-1',
            },
          };
        },
      },
    }),
    { workerId: 'evidence-operation-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 1);
  const need = await repository.getNeed(`need:${evidenceNeedKey(data.planner.need)}`);
  assert.equal(need?.state, 'fulfilled');
  const purchaseKey = `evidence:${evidenceNeedKey(data.planner.need)}:provider-x402-1`;
  const purchases = await repository.getPurchaseByIdempotencyKey(purchaseKey);
  assert.equal(purchases?.state, 'settled');
  assert.equal(purchases?.txHash, '0xreceipt-1');
  const checkpoints = await tasks.listCheckpoints(`task:evidence:operation:${data.idempotencyKey}`);
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { mode?: string }).mode, 'reviewed-evidence-operation-seam');
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, true);
  assert.equal((await runner.runOnce(200)).succeeded, 0);
  assert.deepEqual(await observe(taskData({ idempotencyKey: 'evidence-operation:reengagement' })), { created: true });
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 1);
});

test('provider uncertainty is persisted as UNKNOWN and duplicate delivery cannot resubmit', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const data = taskData({ idempotencyKey: 'evidence-operation:timeout' });
  await tasks.enqueue({ id: 'task:evidence:timeout', kind: EVIDENCE_ACQUISITION_OPERATION_TASK, idempotencyKey: 'evidence-operation:timeout', availableAt: 100, data, now: 100 });
  let calls = 0;
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionOperationHandlers({
      repository,
      adapter: { async acquire() { calls += 1; throw new Error('provider timeout'); } },
      clock: () => 200,
    }),
    { workerId: 'evidence-timeout-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 1);
  const purchaseKey = `evidence:${evidenceNeedKey(data.planner.need)}:provider-x402-1`;
  const purchase = await repository.getPurchaseByIdempotencyKey(purchaseKey);
  assert.equal(purchase?.state, 'unknown');
  assert.equal((await runner.runOnce(200)).succeeded, 0);
  assert.equal(calls, 1);
});

test('x402 evidence is checked against the weekly data budget and its price recorded once settled', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const fake = fakeBudget(1);
  const data = taskData({ idempotencyKey: 'evidence-operation:budget-settle', budgetOwner: '0x1111111111111111111111111111111111111111' });
  await tasks.enqueue({
    id: 'task:evidence:budget-settle', kind: EVIDENCE_ACQUISITION_OPERATION_TASK,
    idempotencyKey: data.idempotencyKey, availableAt: 100, data, now: 100,
  });
  let calls = 0;
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionOperationHandlers({
      repository,
      budget: fake.budget,
      clock: () => 200,
      adapter: {
        async acquire() {
          calls += 1;
          return {
            state: 'settled', providerTransactionId: 'budget-provider-1', txHash: '0xbudget-receipt',
            snapshot: {
              snapshotId: 'budget-snapshot', needId: 'need-1', source: 'x402', capturedAtUnix: 100,
              reliability: 90, status: 'fresh', provenance: ['receipt'], responseHash: 'budget-hash',
            },
          };
        },
      },
    }),
    { workerId: 'budget-settle-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 1);
  assert.deepEqual(fake.spent, [{ owner: '0x1111111111111111111111111111111111111111', usd: 0.25, kind: 'research' }]);
  const purchase = await repository.getPurchaseByIdempotencyKey(`evidence:${evidenceNeedKey(data.planner.need)}:provider-x402-1`);
  assert.equal(purchase?.data.budgetOwner, '0x1111111111111111111111111111111111111111');
});

test('a reached data budget waits with an unsubmitted purchase and no adapter call', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const fake = fakeBudget(0.1);
  const data = taskData({ idempotencyKey: 'evidence-operation:budget-reached', budgetOwner: '0x1111111111111111111111111111111111111111' });
  await tasks.enqueue({
    id: 'task:evidence:budget-reached', kind: EVIDENCE_ACQUISITION_OPERATION_TASK,
    idempotencyKey: data.idempotencyKey, availableAt: 100, data, now: 100,
  });
  let calls = 0;
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionOperationHandlers({
      repository,
      budget: fake.budget,
      clock: () => 200,
      adapter: { async acquire() { calls += 1; throw new Error('must not call provider'); } },
    }),
    { workerId: 'budget-reached-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).waiting, 1);
  assert.equal(calls, 0);
  assert.equal((await repository.getPurchaseByIdempotencyKey(`evidence:${evidenceNeedKey(data.planner.need)}:provider-x402-1`))?.state, 'created');
  assert.equal(fake.reached(), 1);
  assert.deepEqual(fake.spent, []);
});

test('replaying an already-settled purchase does not record the spend again', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const fake = fakeBudget(1);
  const data = taskData({ idempotencyKey: 'evidence-operation:budget-replay', budgetOwner: '0x1111111111111111111111111111111111111111' });
  const needKey = evidenceNeedKey(data.planner.need);
  const need = await repository.createNeed({
    id: `need:${needKey}`, dealRoomId: data.dealRoomId, needKey, kind: data.planner.need.claim,
    riskClass: data.planner.need.decision, data: {}, now: 100,
  });
  const purchase = await repository.createPurchase({
    id: `purchase:${needKey}:provider-x402-1`, evidenceNeedId: need.record.id,
    idempotencyKey: `evidence:${needKey}:provider-x402-1`, providerId: 'provider-x402-1',
    priceUsdc: '0.25', data: {}, now: 100,
  });
  let current = purchase.record;
  current = await repository.updatePurchase(current.id, current.version, 'submitted', { providerTransactionId: 'already-paid', now: 101 });
  await repository.updatePurchase(current.id, current.version, 'settled', { txHash: '0xalready-paid', now: 102 });
  await tasks.enqueue({
    id: 'task:evidence:budget-replay', kind: EVIDENCE_ACQUISITION_OPERATION_TASK,
    idempotencyKey: data.idempotencyKey, availableAt: 100, data, now: 100,
  });
  let calls = 0;
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionOperationHandlers({
      repository,
      budget: fake.budget,
      adapter: { async acquire() { calls += 1; throw new Error('must not call provider'); } },
      clock: () => 200,
    }),
    { workerId: 'budget-replay-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 0);
  assert.deepEqual(fake.spent, []);
});

test('fresh evidence is fulfilled without invoking the provider adapter', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const data = taskData({
    idempotencyKey: 'evidence-operation:fresh',
    planner: {
      ...taskData().planner,
      directSnapshot: {
        snapshotId: 'snapshot-direct', needId: 'need-1', source: 'karwan-state', capturedAtUnix: 100,
        reliability: 100, status: 'fresh', provenance: ['ledger'], responseHash: 'direct-hash',
      },
    },
  });
  await tasks.enqueue({ id: 'task:evidence:fresh', kind: EVIDENCE_ACQUISITION_OPERATION_TASK, idempotencyKey: 'evidence-operation:fresh', availableAt: 100, data, now: 100 });
  let calls = 0;
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionOperationHandlers({
      repository,
      adapter: { async acquire() { calls += 1; throw new Error('unexpected provider call'); } },
      clock: () => 200,
    }),
    { workerId: 'evidence-fresh-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 0);
  const snapshots = await repository.listSnapshots(`need:${evidenceNeedKey(data.planner.need)}`);
  assert.equal(snapshots.length, 1);
  const checkpoints = await tasks.listCheckpoints('task:evidence:fresh');
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'use');
});
