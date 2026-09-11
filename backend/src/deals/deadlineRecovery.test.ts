import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claimDeadlineRecovery,
  completeDeadlineRecovery,
  deadlineRecoveryBackoffMs,
  deadlineRecoveryReadyAt,
  ensureDeadlineRecovery,
  failDeadlineRecovery,
  getDeadlineRecovery,
  recordDeadlineRecoveryMovement,
} from './deadlineRecovery.js';

function jobId(label: string): string {
  return `deadline-recovery-test-${label}-${Date.now()}-${Math.random()}`;
}

test('deadline recovery leases one attempt and can resume after a failed attempt', async () => {
  const id = jobId('lease');
  const availableAt = deadlineRecoveryReadyAt(100, 1_000);
  const initial = await ensureDeadlineRecovery({
    jobId: id,
    deadlineUnix: 100,
    availableAt,
    now: 1,
  });

  assert.equal(initial.state, 'waiting');
  assert.equal(await claimDeadlineRecovery({ jobId: id, now: availableAt - 1 }), null);

  const firstLease = await claimDeadlineRecovery({ jobId: id, now: availableAt, leaseMs: 5_000 });
  assert.ok(firstLease);
  assert.equal(await claimDeadlineRecovery({ jobId: id, now: availableAt + 1 }), null);

  await recordDeadlineRecoveryMovement(firstLease, 'KWN-TEST-RECOVERY');
  const retryAt = availableAt + deadlineRecoveryBackoffMs(1);
  await failDeadlineRecovery(firstLease, {
    error: 'temporary provider timeout',
    nextAvailableAt: retryAt,
    now: availableAt + 2,
  });

  const failed = await getDeadlineRecovery(id);
  assert.equal(failed?.state, 'failed');
  assert.equal(failed?.attempt, 1);
  assert.equal(failed?.movementReference, 'KWN-TEST-RECOVERY');
  assert.equal(await claimDeadlineRecovery({ jobId: id, now: retryAt - 1 }), null);

  const secondLease = await claimDeadlineRecovery({ jobId: id, now: retryAt, leaseMs: 5_000 });
  assert.ok(secondLease);
  assert.notEqual(secondLease.leaseToken, firstLease.leaseToken);
  await completeDeadlineRecovery(secondLease, {
    movementReference: 'KWN-TEST-RECOVERY',
    txHash: '0xabc',
    now: retryAt + 1,
  });

  const completed = await getDeadlineRecovery(id);
  assert.equal(completed?.state, 'succeeded');
  assert.equal(completed?.attempt, 2);
  assert.equal(completed?.txHash, '0xabc');
  assert.equal(completed?.leaseToken, undefined);
});

test('changing a deadline resets a failed recovery schedule', async () => {
  const id = jobId('reanchor');
  const firstAvailableAt = deadlineRecoveryReadyAt(200, 1_000);
  await ensureDeadlineRecovery({
    jobId: id,
    deadlineUnix: 200,
    availableAt: firstAvailableAt,
    now: 1,
  });
  const lease = await claimDeadlineRecovery({ jobId: id, now: firstAvailableAt });
  assert.ok(lease);
  await failDeadlineRecovery(lease, {
    error: 'temporary failure',
    nextAvailableAt: firstAvailableAt + 60_000,
    now: firstAvailableAt + 1,
  });

  const nextAvailableAt = deadlineRecoveryReadyAt(300, 1_000);
  const reset = await ensureDeadlineRecovery({
    jobId: id,
    deadlineUnix: 300,
    availableAt: nextAvailableAt,
    now: firstAvailableAt + 2,
  });
  assert.equal(reset.state, 'waiting');
  assert.equal(reset.attempt, 0);
  assert.equal(reset.deadlineUnix, 300);
  assert.equal(reset.availableAt, nextAvailableAt);
});
