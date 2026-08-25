import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations, type SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';
import {
  PostgresDurableTaskStore,
  TaskLeaseLostError,
  latestExternalSubmission,
  scheduleReengagement,
} from './durableTaskRunner.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('Postgres task leases, checkpoints, triggers, cursors, and recovery are durable', { skip: !testDatabaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
  const schema = `karwan_tasks_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^karwan_tasks_[a-f0-9]{32}$/);
  const client = await pool.connect();
  const transaction: TransactionRunner = async <T>(operation: (executor: SqlExecutor) => Promise<T>) => {
    const tx = await pool.connect();
    await tx.query('BEGIN');
    try {
      await tx.query(`SET LOCAL search_path TO "${schema}"`);
      const result = await operation(tx);
      await tx.query('COMMIT');
      return result;
    } catch (error) {
      await tx.query('ROLLBACK');
      throw error;
    } finally {
      tx.release();
    }
  };

  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await runNumberedMigrations(client);
    await client.query(
      `INSERT INTO deal_rooms (
         id, job_id, state, version, last_sequence, created_at, updated_at, data
       ) VALUES ('room-1', 'job-1', 'temporary_impasse', 1, 0, 100, 100, '{}')`,
    );
    const store = new PostgresDurableTaskStore(client, transaction);
    await store.enqueue({
      id: 'task-1',
      dealRoomId: 'room-1',
      kind: 'test.resume',
      idempotencyKey: 'test:room-1',
      availableAt: 1_000,
      maxAttempts: 3,
      data: {},
      now: 900,
    });

    const [workerA, workerB] = await Promise.all([
      store.claimDue({ workerId: 'worker-a', now: 1_000, leaseMs: 1_000, limit: 1 }),
      store.claimDue({ workerId: 'worker-b', now: 1_000, leaseMs: 1_000, limit: 1 }),
    ]);
    assert.equal(workerA.length + workerB.length, 1);
    const claimed = (workerA[0] ?? workerB[0])!;
    const firstLease = {
      taskId: claimed.id,
      workerId: claimed.leaseOwner!,
      leaseToken: claimed.leaseToken!,
    };
    await store.start(firstLease, 1_000);
    await store.checkpoint(firstLease, {
      checkpointKey: 'external-submit-1',
      phase: 'external.submitted',
      externalId: 'provider-42',
      data: { commandId: 'command-42' },
      now: 1_010,
    });

    await assert.rejects(
      () => store.heartbeat(firstLease, 2_000, 1_000),
      TaskLeaseLostError,
    );
    await assert.rejects(
      () => store.checkpoint(firstLease, {
        checkpointKey: 'stale-progress',
        phase: 'candidate.evaluated',
        data: {},
        now: 2_000,
      }),
      TaskLeaseLostError,
    );

    const recovered = (await store.claimDue({ workerId: 'worker-restart', now: 2_000, leaseMs: 1_000, limit: 1 }))[0]!;
    assert.equal(recovered.attempt, 2);
    const recoveredLease = {
      taskId: recovered.id,
      workerId: 'worker-restart',
      leaseToken: recovered.leaseToken!,
    };
    await store.start(recoveredLease, 2_000);
    assert.equal(latestExternalSubmission(await store.listCheckpoints(recovered.id))?.externalId, 'provider-42');
    await store.checkpoint(recoveredLease, {
      checkpointKey: 'external-reconcile-1',
      phase: 'external.reconciled',
      externalId: 'provider-42',
      data: { status: 'confirmed' },
      now: 2_010,
    });
    assert.equal((await store.complete(recoveredLease, 2_020)).state, 'succeeded');

    const triggerInput = {
      dealRoomId: 'room-1',
      triggerKey: 'room-1:funding-confirmed:event-9',
      trigger: 'funding_confirmed' as const,
      sourceEventId: 'event-9',
      cooldownUntil: 4_000,
      attemptNumber: 2,
      now: 3_000,
    };
    const triggered = await Promise.all([
      scheduleReengagement(store, triggerInput),
      scheduleReengagement(store, triggerInput),
    ]);
    assert.equal(triggered.filter((result) => result.created).length, 1);
    const triggerCount = await client.query<{ count: string }>(
      'SELECT count(*) FROM agent_task_triggers WHERE trigger_key = $1',
      [triggerInput.triggerKey],
    );
    assert.equal(triggerCount.rows[0]?.count, '1');

    const ingested = await store.recordIngestedEvent({
      source: 'jobboard',
      eventKey: '0xtx:1',
      partitionKey: 'arc',
      cursor: '100',
      expectedCursorVersion: 0,
      data: {},
      now: 5_000,
    });
    assert.equal(ingested.cursor?.version, 1);
    assert.equal((await store.recordIngestedEvent({
      source: 'jobboard',
      eventKey: '0xtx:1',
      partitionKey: 'arc',
      cursor: '100',
      expectedCursorVersion: 0,
      data: {},
      now: 5_001,
    })).duplicate, true);

    await store.enqueue({
      id: 'task-dead-letter',
      dealRoomId: 'room-1',
      kind: 'financial.command.shadow',
      idempotencyKey: 'test:dead-letter',
      availableAt: 6_000,
      maxAttempts: 1,
      data: { preserved: true },
      now: 5_900,
    });
    const deadClaim = (await store.claimDue({ workerId: 'dead-worker', now: 6_000, leaseMs: 1_000, limit: 10 }))
      .find((task) => task.id === 'task-dead-letter')!;
    const deadLease = { taskId: deadClaim.id, workerId: 'dead-worker', leaseToken: deadClaim.leaseToken! };
    await store.start(deadLease, 6_000);
    await store.checkpoint(deadLease, {
      checkpointKey: 'shadow-observation',
      phase: 'candidate.evaluated',
      data: { preserved: true },
      now: 6_001,
    });
    assert.equal((await store.fail(deadLease, { now: 6_002, nextAvailableAt: 7_000, error: 'shadow failure' })).state, 'dead_letter');
    const replay = await store.replayDeadLetter({
      taskId: 'task-dead-letter', replayKey: 'postgres-replay-20260824-1', actor: 'admin', now: 6_100,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.task.state, 'pending');
    assert.equal(replay.task.attempt, 0);
    assert.equal((await store.listCheckpoints('task-dead-letter')).length, 1);
    const duplicateReplay = await store.replayDeadLetter({
      taskId: 'task-dead-letter', replayKey: 'postgres-replay-20260824-1', actor: 'admin', now: 6_200,
    });
    assert.equal(duplicateReplay.replayed, false);
    const replayAudit = await client.query<{ task_id: string; actor: string }>(
      'SELECT task_id, actor FROM agent_task_replays_v2 WHERE replay_key = $1',
      ['postgres-replay-20260824-1'],
    );
    assert.deepEqual(replayAudit.rows, [{ task_id: 'task-dead-letter', actor: 'admin' }]);

    const taskSummary = await store.summary();
    assert.equal(taskSummary.total, 3);
    assert.equal(taskSummary.byState.succeeded, 1);
    assert.equal(taskSummary.byState.pending, 1);
    assert.equal(taskSummary.deadLettered, 0);
    const succeededTasks = await store.listRecent({ state: 'succeeded', limit: 10 });
    assert.deepEqual(succeededTasks.map((task) => task.id), ['task-1']);
  } finally {
    if (!/^karwan_tasks_[a-f0-9]{32}$/.test(schema)) {
      throw new Error(`refusing to drop unexpected schema ${schema}`);
    }
    await client.query('RESET search_path');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
