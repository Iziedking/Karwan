import {
  DurableTaskRunner,
  InMemoryDurableTaskStore,
  type DurableTaskRunSummary,
} from './durableTaskRunner.js';
import {
  InMemoryBuyerRuntimeSnapshotStore,
  createBuyerTimerShadowHandlers,
  createBuyerTimerShadowObserver,
} from './buyerTaskShadow.js';
import {
  InMemoryBuyerTimerParityAuditStore,
  createBuyerTimerParityObserver,
  type BuyerTimerParitySummary,
} from './buyerTaskParity.js';
import {
  BUYER_TIMER_SOAK_FIXTURES,
  BUYER_TIMER_SOAK_NOW,
  BUYER_TIMER_SOAK_STALE_FIXTURES,
  type BuyerTimerSoakFixture,
} from './buyerTaskSoakFixtures.js';

export interface BuyerTimerShadowSoakReport {
  fixtureCount: number;
  schedulesObserved: number;
  duplicateObservations: number;
  crashedLeaseClaims: number;
  runner: DurableTaskRunSummary;
  parity: BuyerTimerParitySummary;
  staleSuppressed: number;
  pendingAfterSoak: number;
}

export async function runBuyerTimerShadowSoak(
  fixtures: readonly BuyerTimerSoakFixture[] = BUYER_TIMER_SOAK_FIXTURES,
): Promise<BuyerTimerShadowSoakReport> {
  const taskStore = new InMemoryDurableTaskStore();
  const snapshotStore = new InMemoryBuyerRuntimeSnapshotStore();
  const parityStore = new InMemoryBuyerTimerParityAuditStore();
  const observeShadow = createBuyerTimerShadowObserver(
    taskStore,
    snapshotStore,
    parityStore,
  );
  const observeParity = createBuyerTimerParityObserver(parityStore);

  for (const fixture of fixtures) {
    await observeShadow({ snapshot: fixture.snapshot, schedule: fixture.schedule });
    await observeShadow({ snapshot: fixture.snapshot, schedule: fixture.schedule });
    await observeParity({
      snapshot: fixture.snapshot,
      schedule: fixture.schedule,
      legacyDecision: fixture.legacyDecision,
      observedAt: BUYER_TIMER_SOAK_NOW,
    });
  }

  const stale = BUYER_TIMER_SOAK_STALE_FIXTURES;
  await observeShadow({ snapshot: stale.old.snapshot, schedule: stale.old.schedule });
  await observeShadow({ snapshot: stale.current.snapshot, schedule: stale.current.schedule });
  await observeShadow({ snapshot: stale.current.snapshot, schedule: stale.current.schedule });
  await observeParity({
    snapshot: stale.current.snapshot,
    schedule: stale.current.schedule,
    legacyDecision: {
      ...stale.current.legacyDecision,
      candidateQueue: [...stale.current.legacyDecision.candidateQueue],
    },
    observedAt: BUYER_TIMER_SOAK_NOW,
  });

  const crashed = await taskStore.claimDue({
    workerId: 'soak-crashed-worker',
    now: BUYER_TIMER_SOAK_NOW,
    leaseMs: 100,
    limit: 1,
  });
  if (crashed.length !== 1) {
    throw new Error(`expected one simulated crashed lease, got ${crashed.length}`);
  }

  const runner = new DurableTaskRunner(
    taskStore,
    createBuyerTimerShadowHandlers(snapshotStore, {
      clock: () => BUYER_TIMER_SOAK_NOW + 100,
      parityStore,
    }),
    {
      workerId: 'soak-restarted-worker',
      clock: () => BUYER_TIMER_SOAK_NOW + 100,
      leaseMs: 100,
      batchSize: fixtures.length + 4,
    },
  );
  const runnerResult = await runner.runOnce();
  const parity = await parityStore.summary();
  const records = await parityStore.list({ limit: 500 });
  const pendingAfterSoak = records.filter(
    (record) => record.comparisonStatus === 'pending' || record.taskStatus === 'pending',
  ).length;

  if (parity.comparison.diverged !== 0 || parity.task.diverged !== 0) {
    throw new Error(`shadow soak found divergence: ${JSON.stringify({
      parity,
      records: records.filter((record) =>
        record.comparisonStatus === 'diverged' || record.taskStatus === 'diverged'),
    })}`);
  }
  if (runnerResult.deadLettered !== 0 || runnerResult.leaseLost !== 0) {
    throw new Error(`shadow soak found runner failures: ${JSON.stringify(runnerResult)}`);
  }
  if (parity.task['stale-suppressed'] < 2) {
    throw new Error(`shadow soak did not observe stale suppression: ${JSON.stringify(parity)}`);
  }

  return {
    fixtureCount: fixtures.length,
    schedulesObserved: fixtures.length + 2,
    duplicateObservations: fixtures.length + 1,
    crashedLeaseClaims: crashed.length,
    runner: runnerResult,
    parity,
    staleSuppressed: parity.task['stale-suppressed'],
    pendingAfterSoak,
  };
}
