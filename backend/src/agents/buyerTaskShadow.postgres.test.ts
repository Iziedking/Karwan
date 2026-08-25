import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations, type SqlExecutor } from '../db/migrations.js';
import type { TransactionRunner } from '../events/domainEventStore.js';
import {
  DurableTaskRunner,
  PostgresDurableTaskStore,
} from './durableTaskRunner.js';
import type { BuyerRuntimeSnapshot } from './buyerTaskPlanning.js';
import {
  PostgresBuyerRuntimeSnapshotStore,
  createBuyerTimerShadowHandlers,
  createBuyerTimerShadowObserver,
} from './buyerTaskShadow.js';
import {
  PostgresBuyerTimerParityAuditStore,
  createBuyerTimerParityObserver,
} from './buyerTaskParity.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function snapshot(revision: number): BuyerRuntimeSnapshot {
  return {
    jobId: 'job-1',
    revision,
    capturedAt: 900 + revision,
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
  };
}

test(
  'Postgres buyer shadow snapshots, scheduling, and restart execution are durable',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_buyer_shadow_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_buyer_shadow_[a-f0-9]{32}$/);
    const client = await pool.connect();
    const transaction: TransactionRunner = async <T>(
      operation: (executor: SqlExecutor) => Promise<T>,
    ) => {
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

      const snapshotStore = new PostgresBuyerRuntimeSnapshotStore(client);
      assert.equal((await snapshotStore.put(snapshot(2))).stored, true);
      assert.equal((await snapshotStore.put(snapshot(1))).stored, false);
      assert.equal((await snapshotStore.get('JOB-1'))?.revision, 2);

      const taskStore = new PostgresDurableTaskStore(client, transaction);
      const parityStore = new PostgresBuyerTimerParityAuditStore(client);
      const observe = createBuyerTimerShadowObserver(taskStore, snapshotStore, parityStore);
      const observation = {
        snapshot: snapshot(3),
        schedule: {
          kind: 'collection' as const,
          data: { jobId: 'job-1', scheduleVersion: 1, closeAt: 1_000 },
        },
      };
      await Promise.all([observe(observation), observe(observation)]);
      const taskCount = await client.query<{ count: string }>(
        "SELECT count(*) FROM agent_tasks WHERE kind = 'buyer.collection_finalize.shadow'",
      );
      assert.equal(taskCount.rows[0]?.count, '1');

      const matchDecision = {
        action: 'propose_match' as const,
        seller: 'seller-a',
        priceUsdc: '90',
        reason: 'at-or-under-budget' as const,
        candidateQueue: ['seller-a'],
      };
      await createBuyerTimerParityObserver(parityStore)({
        snapshot: snapshot(3),
        schedule: observation.schedule,
        legacyDecision: matchDecision,
        observedAt: 1_000,
      });

      const restartedRunner = new DurableTaskRunner(
        taskStore,
        createBuyerTimerShadowHandlers(snapshotStore, {
          clock: () => 1_000,
          parityStore,
        }),
        { workerId: 'worker-after-restart', clock: () => 1_000, leaseMs: 1_000 },
      );
      assert.equal((await restartedRunner.runOnce()).succeeded, 1);
      const checkpoint = await client.query<{ data: unknown }>(
        "SELECT data FROM agent_task_checkpoints WHERE checkpoint_key = 'shadow-decision'",
      );
      assert.deepEqual(checkpoint.rows[0]?.data, {
        mode: 'shadow',
        decision: {
          action: 'propose_match',
          seller: 'seller-a',
          priceUsdc: '90',
          reason: 'at-or-under-budget',
          candidateQueue: ['seller-a'],
        },
      });
      const [audit] = await parityStore.list({ jobId: 'job-1' });
      assert.equal(audit?.comparisonStatus, 'matched');
      assert.equal(audit?.taskStatus, 'matched');
      assert.deepEqual(audit?.legacyDecision, matchDecision);
      assert.deepEqual(audit?.taskDecision, matchDecision);
      const exhaustedDecision = {
        action: 'exhausted' as const,
        timedOutSeller: 'seller-race',
      };
      await parityStore.recordComparison({
        jobId: 'job-race',
        kind: 'counter-timeout',
        scheduleVersion: 9,
        snapshotRevision: 5,
        observedAt: 1_010,
        legacyDecision: exhaustedDecision,
        plannerDecision: exhaustedDecision,
      });
      const completedSchedule = await parityStore.ensureSchedule({
        jobId: 'job-race',
        kind: 'counter-timeout',
        scheduleVersion: 9,
        scheduledFor: 1_000,
        snapshotRevision: 4,
        createdAt: 900,
      });
      assert.equal(completedSchedule.scheduledFor, 1_000);
      assert.equal(completedSchedule.scheduledSnapshotRevision, 4);
      assert.equal(completedSchedule.comparisonStatus, 'matched');
      assert.deepEqual(await parityStore.summary(), {
        total: 2,
        byKind: { collection: 1, 'counter-timeout': 1 },
        comparison: { pending: 0, matched: 2, diverged: 0 },
        task: {
          pending: 1,
          'awaiting-planner': 0,
          matched: 1,
          'stale-suppressed': 0,
          diverged: 0,
        },
      });
      await assert.rejects(
        () => parityStore.recordTaskDecision({
          jobId: 'job-1',
          kind: 'collection',
          scheduleVersion: 1,
          observedAt: 1_001,
          taskDecision: { action: 'no_candidates', receivedBids: 1 },
        }),
        /task conflict/,
      );
    } finally {
      if (!/^karwan_buyer_shadow_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
