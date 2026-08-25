import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DurableTaskRunner,
  InMemoryDurableTaskStore,
} from './durableTaskRunner.js';
import type { BuyerRuntimeSnapshot } from './buyerTaskPlanning.js';
import {
  BUYER_COLLECTION_SHADOW_TASK,
  InMemoryBuyerRuntimeSnapshotStore,
  createBuyerTimerShadowHandlers,
  createBuyerTimerShadowObserver,
} from './buyerTaskShadow.js';

function snapshot(overrides: Partial<BuyerRuntimeSnapshot> = {}): BuyerRuntimeSnapshot {
  return {
    jobId: 'job-1',
    revision: 1,
    capturedAt: 900,
    budgetUsdc: '100',
    negotiationMaxIncreasePct: 20,
    trustedMatch: false,
    buyerMinDeadlineDays: 1,
    buyerMaxDeadlineDays: 30,
    buyerMaxCounterRounds: 3,
    bids: [{
      seller: 'seller-a',
      priceUsdc: '90',
      deadlineUnix: 200_000,
      score: 80,
      sellerTier: 'established',
      topicalMatch: 80,
    }],
    candidateQueue: [],
    triedSellers: [],
    sellersAtLastPass: [],
    lastSellerCounterBySeller: {},
    collection: {
      startedAt: 500,
      closeAt: 1_000,
      scheduleVersion: 1,
      fired: false,
      pendingEvaluations: 0,
      maxWindowMs: 5_000,
      holdRecheckMs: 300,
    },
    counter: { scheduleVersion: 0 },
    finalized: false,
    escrowFunded: false,
    expired: false,
    ...overrides,
  };
}

const collectionSchedule = {
  kind: 'collection' as const,
  data: { jobId: 'job-1', scheduleVersion: 1, closeAt: 1_000 },
};

test('shadow modules have no provider, wallet, proposal, event, or money authority imports', () => {
  const sources = [
    readFileSync(new URL('./buyerTaskPlanning.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('./buyerTaskShadow.ts', import.meta.url), 'utf8'),
  ].join('\n');
  for (const forbidden of [
    /chain\//,
    /circle\//,
    /money\//,
    /x402\//,
    /matchProposals/,
    /executeContractCall/,
    /bus\.emitEvent/,
  ]) {
    assert.doesNotMatch(sources, forbidden);
  }
});

test('snapshot revisions reject delayed older writes', async () => {
  const store = new InMemoryBuyerRuntimeSnapshotStore();
  assert.equal((await store.put(snapshot({ revision: 2, capturedAt: 950 }))).stored, true);
  assert.equal((await store.put(snapshot({ revision: 1, capturedAt: 975 }))).stored, false);
  assert.equal((await store.get('JOB-1'))?.revision, 2);
});

test('duplicate schedule observations create one durable task', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const snapshotStore = new InMemoryBuyerRuntimeSnapshotStore();
  const observe = createBuyerTimerShadowObserver(taskStore, snapshotStore);
  const observation = { snapshot: snapshot(), schedule: collectionSchedule };
  await Promise.all([observe(observation), observe(observation)]);

  const claimed = await taskStore.claimDue({
    workerId: 'worker-a',
    now: 1_000,
    leaseMs: 1_000,
    limit: 10,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]?.kind, BUYER_COLLECTION_SHADOW_TASK);
});

test('a fresh runner resumes a persisted shadow task without live mutations', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const snapshotStore = new InMemoryBuyerRuntimeSnapshotStore();
  await createBuyerTimerShadowObserver(taskStore, snapshotStore)({
    snapshot: snapshot(),
    schedule: collectionSchedule,
  });

  const restartedRunner = new DurableTaskRunner(
    taskStore,
    createBuyerTimerShadowHandlers(snapshotStore, { clock: () => 1_000 }),
    { workerId: 'worker-after-restart', clock: () => 1_000, leaseMs: 1_000 },
  );
  assert.deepEqual(await restartedRunner.runOnce(), {
    succeeded: 1,
    waiting: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  });

  const taskId = 'task:buyer:collection:job-1:1';
  const checkpoints = await taskStore.listCheckpoints(taskId);
  assert.equal(checkpoints.length, 1);
  assert.deepEqual(checkpoints[0]?.data, {
    mode: 'shadow',
    decision: {
      action: 'propose_match',
      seller: 'seller-a',
      priceUsdc: '90',
      reason: 'at-or-under-budget',
      candidateQueue: ['seller-a'],
    },
  });
  assert.equal(taskStore.inspect(taskId)?.state, 'succeeded');
});

test('a replaced soft-close generation completes as a stale no-op', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const snapshotStore = new InMemoryBuyerRuntimeSnapshotStore();
  const observe = createBuyerTimerShadowObserver(taskStore, snapshotStore);
  await observe({ snapshot: snapshot(), schedule: collectionSchedule });
  await observe({
    snapshot: snapshot({
      revision: 2,
      capturedAt: 950,
      collection: {
        ...snapshot().collection,
        closeAt: 1_200,
        scheduleVersion: 2,
      },
    }),
    schedule: {
      kind: 'collection',
      data: { jobId: 'job-1', scheduleVersion: 2, closeAt: 1_200 },
    },
  });

  const runner = new DurableTaskRunner(
    taskStore,
    createBuyerTimerShadowHandlers(snapshotStore, { clock: () => 1_000 }),
    { workerId: 'worker-a', clock: () => 1_000, leaseMs: 1_000 },
  );
  assert.equal((await runner.runOnce()).succeeded, 1);
  assert.deepEqual(
    (await taskStore.listCheckpoints('task:buyer:collection:job-1:1'))[0]?.data,
    { mode: 'shadow', decision: { action: 'stale', reason: 'schedule-replaced' } },
  );
  assert.equal(taskStore.inspect('task:buyer:collection:job-1:2')?.state, 'pending');
});
