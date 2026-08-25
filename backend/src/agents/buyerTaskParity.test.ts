import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DurableTaskRunner,
  InMemoryDurableTaskStore,
} from './durableTaskRunner.js';
import type { BuyerRuntimeSnapshot } from './buyerTaskPlanning.js';
import {
  InMemoryBuyerTimerParityAuditStore,
  classifyBuyerTimerParity,
  classifyBuyerTimerTask,
  createBuyerTimerParityObserver,
} from './buyerTaskParity.js';
import {
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

const schedule = {
  kind: 'collection' as const,
  data: { jobId: 'job-1', scheduleVersion: 1, closeAt: 1_000 },
};

const matchDecision = {
  action: 'propose_match' as const,
  seller: 'seller-a',
  priceUsdc: '90',
  reason: 'at-or-under-budget' as const,
  candidateQueue: ['seller-a'],
};

test('parity classification separates algorithm mismatches from stale task suppression', () => {
  assert.equal(classifyBuyerTimerParity(matchDecision, structuredClone(matchDecision)), 'matched');
  assert.equal(
    classifyBuyerTimerParity(matchDecision, { action: 'no_candidates', receivedBids: 0 }),
    'diverged',
  );
  assert.equal(classifyBuyerTimerParity(undefined, matchDecision), 'pending');
  assert.equal(
    classifyBuyerTimerTask(matchDecision, {
      action: 'stale',
      reason: 'schedule-replaced',
    }),
    'stale-suppressed',
  );
  assert.equal(classifyBuyerTimerTask(matchDecision, matchDecision), 'matched');
});

test('audit slots are first-write immutable and exact duplicate delivery is idempotent', async () => {
  const store = new InMemoryBuyerTimerParityAuditStore();
  const scheduled = {
    jobId: 'JOB-1',
    kind: 'collection' as const,
    scheduleVersion: 1,
    scheduledFor: 1_000,
    snapshotRevision: 1,
    createdAt: 900,
  };
  assert.equal((await store.ensureSchedule(scheduled)).comparisonStatus, 'pending');
  assert.deepEqual(await store.ensureSchedule(scheduled), await store.ensureSchedule(scheduled));

  const comparison = {
    jobId: 'job-1',
    kind: 'collection' as const,
    scheduleVersion: 1,
    snapshotRevision: 2,
    observedAt: 1_000,
    legacyDecision: matchDecision,
    plannerDecision: structuredClone(matchDecision),
  };
  assert.equal((await store.recordComparison(comparison)).comparisonStatus, 'matched');
  assert.equal((await store.recordComparison(comparison)).comparisonStatus, 'matched');
  await assert.rejects(
    () => store.recordComparison({
      ...comparison,
      legacyDecision: { action: 'no_candidates', receivedBids: 1 },
    }),
    /comparison conflict/,
  );

  const task = {
    jobId: 'job-1',
    kind: 'collection' as const,
    scheduleVersion: 1,
    observedAt: 1_050,
    taskDecision: { action: 'stale' as const, reason: 'already-finished' as const },
  };
  assert.equal((await store.recordTaskDecision(task)).taskStatus, 'stale-suppressed');
  assert.equal((await store.recordTaskDecision(task)).taskStatus, 'stale-suppressed');
  await assert.rejects(
    () => store.recordTaskDecision({ ...task, taskDecision: matchDecision }),
    /task conflict/,
  );

  assert.deepEqual(await store.summary(), {
    total: 1,
    byKind: { collection: 1, 'counter-timeout': 0 },
    comparison: { pending: 0, matched: 1, diverged: 0 },
    task: {
      pending: 0,
      'awaiting-planner': 0,
      matched: 0,
      'stale-suppressed': 1,
      diverged: 0,
    },
  });
});

test('same-snapshot observer records a deterministic legacy versus planner match', async () => {
  const store = new InMemoryBuyerTimerParityAuditStore();
  await store.ensureSchedule({
    jobId: 'job-1',
    kind: 'collection',
    scheduleVersion: 1,
    scheduledFor: 1_000,
    snapshotRevision: 1,
    createdAt: 900,
  });
  const inputSnapshot = snapshot();
  const before = structuredClone(inputSnapshot);
  await createBuyerTimerParityObserver(store)({
    snapshot: inputSnapshot,
    schedule,
    legacyDecision: matchDecision,
    observedAt: 1_000,
  });

  const [audit] = await store.list();
  assert.equal(audit?.comparisonStatus, 'matched');
  assert.deepEqual(audit?.legacyDecision, matchDecision);
  assert.deepEqual(audit?.plannerDecision, matchDecision);
  assert.deepEqual(inputSnapshot, before);
});

test('schedule persistence fills a comparison-first placeholder without losing evidence', async () => {
  const store = new InMemoryBuyerTimerParityAuditStore();
  const decision = { action: 'exhausted' as const, timedOutSeller: 'seller-a' };
  await store.recordComparison({
    jobId: 'job-race',
    kind: 'counter-timeout',
    scheduleVersion: 9,
    snapshotRevision: 5,
    observedAt: 1_010,
    legacyDecision: decision,
    plannerDecision: decision,
  });
  const completed = await store.ensureSchedule({
    jobId: 'job-race',
    kind: 'counter-timeout',
    scheduleVersion: 9,
    scheduledFor: 1_000,
    snapshotRevision: 4,
    createdAt: 900,
  });
  assert.equal(completed.scheduledFor, 1_000);
  assert.equal(completed.scheduledSnapshotRevision, 4);
  assert.equal(completed.createdAt, 900);
  assert.equal(completed.comparisonStatus, 'matched');
  assert.deepEqual(completed.legacyDecision, decision);
});

test('restarted durable handler records delivery evidence independently from comparison', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const snapshotStore = new InMemoryBuyerRuntimeSnapshotStore();
  const parityStore = new InMemoryBuyerTimerParityAuditStore();
  const observe = createBuyerTimerShadowObserver(taskStore, snapshotStore, parityStore);
  await observe({ snapshot: snapshot(), schedule });
  await createBuyerTimerParityObserver(parityStore)({
    snapshot: snapshot(),
    schedule,
    legacyDecision: matchDecision,
    observedAt: 1_000,
  });

  const restartedRunner = new DurableTaskRunner(
    taskStore,
    createBuyerTimerShadowHandlers(snapshotStore, {
      clock: () => 1_000,
      parityStore,
    }),
    { workerId: 'parity-restart', clock: () => 1_000, leaseMs: 1_000 },
  );
  assert.equal((await restartedRunner.runOnce()).succeeded, 1);
  const [audit] = await parityStore.list();
  assert.equal(audit?.comparisonStatus, 'matched');
  assert.equal(audit?.taskStatus, 'matched');
  assert.deepEqual(audit?.taskDecision, matchDecision);
});

test('parity and reporting modules are read-only and admin reporting exposes only the review disposition write', () => {
  const paritySource = readFileSync(new URL('./buyerTaskParity.ts', import.meta.url), 'utf8');
  const routeSource = readFileSync(
    new URL('../routes/adminAgentRuntime.ts', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    /chain\//,
    /circle\//,
    /money\//,
    /x402\//,
    /matchProposals/,
    /executeContractCall/,
    /bus\.emitEvent/,
  ]) {
    assert.doesNotMatch(`${paritySource}\n${routeSource}`, forbidden);
  }
  assert.match(routeSource, /routes\.use\('\*', requireAdmin\)/);
  assert.match(routeSource, /routes\.get\('\/buyer-timer-parity'/);
  const writeRoutes = [...routeSource.matchAll(/routes\.(post|put|patch|delete)\(\s*'([^']+)'/g)]
    .map((match) => `${match[1]} ${match[2]}`);
  assert.deepEqual(writeRoutes, ['post /tasks/:taskId/replay', 'post /matching-shadow/reviews']);
});
