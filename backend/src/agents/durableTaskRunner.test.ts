import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DurableTaskRunner,
  InMemoryDurableTaskStore,
  IngestionCursorConflictError,
  TaskCheckpointConflictError,
  TaskLeaseLostError,
  latestExternalSubmission,
  scheduleReengagement,
  DeadLetterReplayConflictError,
  DeadLetterReplayStateError,
  isManualShadowReplayableTaskKind,
} from './durableTaskRunner.js';

function taskInput(overrides: Partial<Parameters<InMemoryDurableTaskStore['enqueue']>[0]> = {}) {
  return {
    id: 'task-1',
    dealRoomId: 'room-1',
    kind: 'test.resume',
    idempotencyKey: 'test:room-1',
    availableAt: 1_000,
    maxAttempts: 3,
    data: {},
    now: 900,
    ...overrides,
  };
}

test('enqueue is idempotent and two workers produce one lease winner', async () => {
  const store = new InMemoryDurableTaskStore();
  assert.equal((await store.enqueue(taskInput())).created, true);
  assert.equal((await store.enqueue(taskInput())).created, false);

  const [first, second] = await Promise.all([
    store.claimDue({ workerId: 'worker-a', now: 1_000, leaseMs: 1_000, limit: 1 }),
    store.claimDue({ workerId: 'worker-b', now: 1_000, leaseMs: 1_000, limit: 1 }),
  ]);
  assert.equal(first.length + second.length, 1);
  assert.equal((first[0] ?? second[0])?.attempt, 1);
});

test('a crashed task resumes after its external submission checkpoint', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(taskInput());
  const first = (await store.claimDue({ workerId: 'worker-a', now: 1_000, leaseMs: 1_000, limit: 1 }))[0]!;
  const firstLease = { taskId: first.id, workerId: 'worker-a', leaseToken: first.leaseToken! };
  await store.start(firstLease, 1_000);
  await store.checkpoint(firstLease, {
    checkpointKey: 'candidate-1',
    phase: 'candidate.generated',
    data: { candidateId: 'candidate-1' },
    now: 1_010,
  });
  await store.checkpoint(firstLease, {
    checkpointKey: 'provider-submit-1',
    phase: 'external.submitted',
    externalId: 'provider-transaction-7',
    data: { commandId: 'command-7' },
    now: 1_020,
  });

  const recovered = (await store.claimDue({ workerId: 'worker-b', now: 2_000, leaseMs: 1_000, limit: 1 }))[0]!;
  const recoveredLease = {
    taskId: recovered.id,
    workerId: 'worker-b',
    leaseToken: recovered.leaseToken!,
  };
  await store.start(recoveredLease, 2_000);
  const submission = latestExternalSubmission(await store.listCheckpoints(recovered.id));
  assert.equal(submission?.externalId, 'provider-transaction-7');
  await store.checkpoint(recoveredLease, {
    checkpointKey: 'provider-reconciled-1',
    phase: 'external.reconciled',
    externalId: submission!.externalId,
    data: { status: 'confirmed' },
    now: 2_010,
  });
  const completed = await store.complete(recoveredLease, 2_020);
  assert.equal(completed.state, 'succeeded');
  assert.equal(completed.attempt, 2);
});

test('lease expiry is counted once when a task is reclaimed', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(taskInput());
  const claimed = (await store.claimDue({ workerId: 'worker-a', now: 1_000, leaseMs: 1_000, limit: 1 }))[0]!;
  assert.equal((await store.summary()).leaseLosses, 0);
  const recovered = (await store.claimDue({ workerId: 'worker-b', now: 2_000, leaseMs: 1_000, limit: 1 }))[0]!;
  assert.equal(recovered.attempt, 2);
  assert.equal((await store.summary()).leaseLosses, 1);
  assert.equal((await store.claimDue({ workerId: 'worker-c', now: 2_001, leaseMs: 1_000, limit: 1 })).length, 0);
  assert.equal((await store.summary()).leaseLosses, 1);
  void claimed;
});

test('heartbeat extends the lease and checkpoint keys cannot change meaning', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(taskInput());
  const task = (await store.claimDue({ workerId: 'worker-a', now: 1_000, leaseMs: 1_000, limit: 1 }))[0]!;
  const lease = { taskId: task.id, workerId: 'worker-a', leaseToken: task.leaseToken! };
  await store.start(lease, 1_000);
  await store.heartbeat(lease, 1_500, 1_000);
  assert.equal((await store.claimDue({ workerId: 'worker-b', now: 2_000, leaseMs: 1_000, limit: 1 })).length, 0);
  await store.checkpoint(lease, {
    checkpointKey: 'authorization-1',
    phase: 'authorization.recorded',
    data: { outcome: 'allow', policyVersion: 'v1' },
    now: 1_510,
  });
  assert.equal((await store.checkpoint(lease, {
    checkpointKey: 'authorization-1',
    phase: 'authorization.recorded',
    data: { policyVersion: 'v1', outcome: 'allow' },
    now: 1_520,
  })).created, false);
  await assert.rejects(
    () => store.checkpoint(lease, {
      checkpointKey: 'authorization-1',
      phase: 'authorization.recorded',
      data: { outcome: 'deny' },
      now: 1_530,
    }),
    TaskCheckpointConflictError,
  );
});

test('an expired lease cannot be revived or commit task progress', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(taskInput());
  const task = (await store.claimDue({ workerId: 'worker-a', now: 1_000, leaseMs: 1_000, limit: 1 }))[0]!;
  const lease = { taskId: task.id, workerId: 'worker-a', leaseToken: task.leaseToken! };
  await store.start(lease, 1_000);

  await assert.rejects(() => store.heartbeat(lease, 2_000, 1_000), TaskLeaseLostError);
  await assert.rejects(
    () => store.checkpoint(lease, {
      checkpointKey: 'stale-progress',
      phase: 'candidate.evaluated',
      data: {},
      now: 2_000,
    }),
    TaskLeaseLostError,
  );
  await assert.rejects(() => store.complete(lease, 2_000), TaskLeaseLostError);
  await assert.rejects(
    () => store.fail(lease, { now: 2_000, nextAvailableAt: 3_000, error: 'stale failure' }),
    TaskLeaseLostError,
  );

  const recovered = (await store.claimDue({ workerId: 'worker-b', now: 2_000, leaseMs: 1_000, limit: 1 }))[0]!;
  assert.equal(recovered.attempt, 2);
  await assert.rejects(() => store.heartbeat(lease, 2_001, 1_000), TaskLeaseLostError);
});

test('runner retries with backoff then exposes a bounded dead letter', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(taskInput({ maxAttempts: 2 }));
  const runner = new DurableTaskRunner(
    store,
    { 'test.resume': async () => { throw new Error('handler unavailable'); } },
    { workerId: 'worker-a', baseBackoffMs: 10, leaseMs: 1_000 },
  );
  assert.equal((await runner.runOnce(1_000)).retried, 1);
  assert.equal((await runner.runOnce(1_010)).deadLettered, 1);
  assert.equal((await store.listDeadLetters()).length, 1);
  assert.equal(store.inspect('task-1')?.lastError, 'handler unavailable');
});

test('dead-letter replay is manual, shadow-allowlisted, and idempotent', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(taskInput({ id: 'task-replay', kind: 'financial.command.shadow', maxAttempts: 1 }));
  const runner = new DurableTaskRunner(
    store,
    { 'financial.command.shadow': async () => { throw new Error('shadow handler unavailable'); } },
    { workerId: 'replay-worker', baseBackoffMs: 1, clock: () => 100 },
  );
  assert.equal((await runner.runOnce(1_000)).deadLettered, 1);
  const before = store.inspect('task-replay')!;
  const first = await store.replayDeadLetter({
    taskId: before.id,
    replayKey: 'admin-replay-20260824-1',
    actor: 'admin',
    now: 200,
  });
  assert.equal(first.replayed, true);
  assert.equal(first.task.state, 'pending');
  assert.equal(first.task.attempt, 0);
  assert.equal(first.task.availableAt, 200);
  assert.equal(first.task.lastError, undefined);
  assert.equal(first.task.deadLetteredAt, undefined);
  assert.equal(isManualShadowReplayableTaskKind(first.task.kind), true);
  const duplicate = await store.replayDeadLetter({
    taskId: before.id,
    replayKey: 'admin-replay-20260824-1',
    actor: 'admin',
    now: 300,
  });
  assert.equal(duplicate.replayed, false);
  assert.equal(duplicate.task.version, first.task.version);
  await assert.rejects(
    () => store.replayDeadLetter({ taskId: before.id, replayKey: 'admin-replay-other', actor: 'admin', now: 301 }),
    DeadLetterReplayStateError,
  );
  await assert.rejects(
    () => store.replayDeadLetter({ taskId: 'missing', replayKey: 'admin-replay-missing', actor: 'admin', now: 302 }),
    DeadLetterReplayStateError,
  );
  await store.enqueue(taskInput({ id: 'task-replay-other', kind: 'negotiation.turn.shadow', idempotencyKey: 'test:room-other' }));
  await assert.rejects(
    () => store.replayDeadLetter({ taskId: 'task-replay-other', replayKey: 'admin-replay-20260824-1', actor: 'admin', now: 303 }),
    DeadLetterReplayConflictError,
  );
  assert.equal(isManualShadowReplayableTaskKind('financial.command.operation'), false);
});

test('one material trigger creates one re-engagement task after cooldown', async () => {
  const store = new InMemoryDurableTaskStore();
  const input = {
    dealRoomId: 'room-1',
    triggerKey: 'room-1:stake-confirmed:7',
    trigger: 'stake_confirmed' as const,
    sourceEventId: 'event-7',
    cooldownUntil: 5_000,
    attemptNumber: 2,
    now: 1_000,
  };
  const first = await scheduleReengagement(store, input);
  const duplicate = await scheduleReengagement(store, input);
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal((await store.summary()).repeatedReengagements, 1);
  assert.equal(first.task.availableAt, 5_000);
  assert.equal((await store.claimDue({ workerId: 'worker-a', now: 4_999, leaseMs: 1_000, limit: 1 })).length, 0);
  assert.equal((await store.claimDue({ workerId: 'worker-a', now: 5_000, leaseMs: 1_000, limit: 1 })).length, 1);
  await assert.rejects(
    () => scheduleReengagement(store, { ...input, dealRoomId: 'room-2' }),
    /trigger task not found|belongs to another task|idempotency key belongs to another task/,
  );
});

test('event ingestion combines dedupe with optimistic cursor advancement', async () => {
  const store = new InMemoryDurableTaskStore();
  const first = await store.recordIngestedEvent({
    source: 'jobboard',
    eventKey: '0xtx:1',
    partitionKey: 'arc',
    cursor: '100',
    expectedCursorVersion: 0,
    data: {},
    now: 1_000,
  });
  assert.equal(first.duplicate, false);
  assert.equal(first.cursor?.version, 1);
  const duplicate = await store.recordIngestedEvent({
    source: 'jobboard',
    eventKey: '0xtx:1',
    partitionKey: 'arc',
    cursor: '100',
    expectedCursorVersion: 0,
    data: {},
    now: 1_001,
  });
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    () => store.recordIngestedEvent({
      source: 'jobboard',
      eventKey: '0xtx:2',
      partitionKey: 'arc',
      cursor: '101',
      expectedCursorVersion: 0,
      data: {},
      now: 1_002,
    }),
    IngestionCursorConflictError,
  );
  const advanced = await store.recordIngestedEvent({
    source: 'jobboard',
    eventKey: '0xtx:2',
    partitionKey: 'arc',
    cursor: '101',
    expectedCursorVersion: 1,
    data: {},
    now: 1_003,
  });
  assert.equal(advanced.cursor?.version, 2);
});
