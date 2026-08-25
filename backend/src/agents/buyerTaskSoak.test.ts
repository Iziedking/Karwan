import assert from 'node:assert/strict';
import test from 'node:test';
import { runBuyerTimerShadowSoak } from './buyerTaskSoak.js';

test('offline buyer timer shadow soak proves parity, restart recovery, and stale suppression', async () => {
  const report = await runBuyerTimerShadowSoak();
  assert.equal(report.fixtureCount, 11);
  assert.equal(report.schedulesObserved, 13);
  assert.equal(report.duplicateObservations, 12);
  assert.equal(report.crashedLeaseClaims, 1);
  assert.equal(report.parity.comparison.diverged, 0);
  assert.equal(report.parity.task.diverged, 0);
  assert.ok(report.parity.comparison.matched >= 12);
  assert.ok(report.staleSuppressed >= 2);
  assert.equal(report.runner.deadLettered, 0);
  assert.equal(report.runner.leaseLost, 0);
  assert.ok(report.pendingAfterSoak >= 1);
});
