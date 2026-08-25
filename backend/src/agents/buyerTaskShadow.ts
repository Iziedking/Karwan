import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { SqlExecutor } from '../db/migrations.js';
import {
  type DurableTaskHandler,
  type DurableTaskStore,
} from './durableTaskRunner.js';
import {
  type BuyerRuntimeSnapshot,
  type CollectionShadowTaskData,
  type CounterTimeoutShadowTaskData,
  planCollectionShadow,
  planCounterTimeoutShadow,
} from './buyerTaskPlanning.js';
import {
  type BuyerTimerParityAuditStore,
  parityKeyFromSchedule,
} from './buyerTaskParity.js';

export const BUYER_COLLECTION_SHADOW_TASK = 'buyer.collection_finalize.shadow';
export const BUYER_COUNTER_TIMEOUT_SHADOW_TASK = 'buyer.counter_timeout.shadow';

const tierSchema = z.enum(['elite', 'strong', 'established', 'cold', 'new']);
const bidSchema = z.object({
  seller: z.string().min(1),
  priceUsdc: z.string().min(1),
  deadlineUnix: z.number().finite(),
  score: z.number().finite().optional(),
  suggestedCounterPrice: z.string().min(1).optional(),
  suggestedCounterDeadlineDays: z.number().finite().optional(),
  sellerReputationBps: z.number().finite().optional(),
  sellerTier: tierSchema.optional(),
  topicalMatch: z.number().finite().optional(),
  sellerFreeStakeUsdc: z.number().finite().optional(),
  completionRate: z.number().finite().optional(),
  velocity24h: z.number().finite().optional(),
  priorCleanDealsWithBuyer: z.number().finite().optional(),
});

const snapshotSchema = z.object({
  jobId: z.string().min(1),
  revision: z.number().int().positive(),
  capturedAt: z.number().int().nonnegative(),
  budgetUsdc: z.string().min(1),
  negotiationMaxIncreasePct: z.number().finite().optional(),
  trustedMatch: z.boolean(),
  buyerMinDeadlineDays: z.number().int().nonnegative(),
  buyerMaxDeadlineDays: z.number().int().nonnegative(),
  buyerMaxCounterRounds: z.number().int().nonnegative(),
  bids: z.array(bidSchema),
  candidateQueue: z.array(z.string().min(1)),
  triedSellers: z.array(z.string().min(1)),
  sellersAtLastPass: z.array(z.string().min(1)),
  lastSellerCounterBySeller: z.record(z.string()),
  collection: z.object({
    startedAt: z.number().int().nonnegative().optional(),
    closeAt: z.number().int().nonnegative().optional(),
    scheduleVersion: z.number().int().nonnegative(),
    fired: z.boolean(),
    pendingEvaluations: z.number().int().nonnegative(),
    maxWindowMs: z.number().int().positive(),
    holdRecheckMs: z.number().int().positive(),
  }),
  counter: z.object({
    seller: z.string().min(1).optional(),
    dueAt: z.number().int().nonnegative().optional(),
    scheduleVersion: z.number().int().nonnegative(),
    round: z.number().int().nonnegative().optional(),
  }),
  parkedAgreement: z.object({
    seller: z.string().min(1),
    priceUsdc: z.string().min(1),
  }).optional(),
  finalized: z.boolean(),
  escrowFunded: z.boolean(),
  expired: z.boolean(),
});

const collectionTaskSchema = z.object({
  jobId: z.string().min(1),
  scheduleVersion: z.number().int().positive(),
  closeAt: z.number().int().nonnegative(),
});

const counterTaskSchema = z.object({
  jobId: z.string().min(1),
  seller: z.string().min(1),
  scheduleVersion: z.number().int().positive(),
  round: z.number().int().positive(),
  dueAt: z.number().int().nonnegative(),
});

interface SnapshotRow extends Record<string, unknown> {
  data: unknown;
}

export interface BuyerRuntimeSnapshotStore {
  put(snapshot: BuyerRuntimeSnapshot): Promise<{ stored: boolean }>;
  get(jobId: string): Promise<BuyerRuntimeSnapshot | null>;
}

export class PostgresBuyerRuntimeSnapshotStore implements BuyerRuntimeSnapshotStore {
  constructor(private readonly executor: SqlExecutor) {}

  async put(snapshot: BuyerRuntimeSnapshot): Promise<{ stored: boolean }> {
    const parsed = parseSnapshot(snapshot);
    const result = await this.executor.query(
      `INSERT INTO buyer_runtime_snapshots_v2 (job_id, revision, captured_at, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id) DO UPDATE
       SET revision = EXCLUDED.revision,
           captured_at = EXCLUDED.captured_at,
           data = EXCLUDED.data
       WHERE buyer_runtime_snapshots_v2.revision < EXCLUDED.revision
       RETURNING revision`,
      [parsed.jobId.toLowerCase(), parsed.revision, parsed.capturedAt, parsed],
    );
    return { stored: result.rows.length === 1 };
  }

  async get(jobId: string): Promise<BuyerRuntimeSnapshot | null> {
    const result = await this.executor.query<SnapshotRow>(
      'SELECT data FROM buyer_runtime_snapshots_v2 WHERE job_id = $1',
      [jobId.toLowerCase()],
    );
    return result.rows[0] ? parseSnapshot(result.rows[0].data) : null;
  }
}

export class InMemoryBuyerRuntimeSnapshotStore implements BuyerRuntimeSnapshotStore {
  private readonly snapshots = new Map<string, BuyerRuntimeSnapshot>();

  async put(snapshot: BuyerRuntimeSnapshot): Promise<{ stored: boolean }> {
    const parsed = parseSnapshot(snapshot);
    const key = parsed.jobId.toLowerCase();
    const prior = this.snapshots.get(key);
    if (prior && prior.revision >= parsed.revision) return { stored: false };
    this.snapshots.set(key, structuredClone(parsed));
    return { stored: true };
  }

  async get(jobId: string): Promise<BuyerRuntimeSnapshot | null> {
    const snapshot = this.snapshots.get(jobId.toLowerCase());
    return snapshot ? structuredClone(snapshot) : null;
  }
}

export type BuyerTimerShadowSchedule =
  | { kind: 'collection'; data: CollectionShadowTaskData }
  | { kind: 'counter-timeout'; data: CounterTimeoutShadowTaskData };

export interface BuyerTimerShadowObservation {
  snapshot: BuyerRuntimeSnapshot;
  schedule?: BuyerTimerShadowSchedule;
}

export type BuyerTimerShadowObserver = (
  observation: BuyerTimerShadowObservation,
) => Promise<void>;

export function createBuyerTimerShadowObserver(
  taskStore: DurableTaskStore,
  snapshotStore: BuyerRuntimeSnapshotStore,
  parityStore?: BuyerTimerParityAuditStore,
): BuyerTimerShadowObserver {
  return async ({ snapshot, schedule }) => {
    await snapshotStore.put(snapshot);
    if (!schedule) return;
    const now = snapshot.capturedAt;
    if (parityStore) {
      const key = parityKeyFromSchedule(schedule);
      await parityStore.ensureSchedule({
        ...key,
        snapshotRevision: snapshot.revision,
        createdAt: now,
      });
    }
    if (schedule.kind === 'collection') {
      const data = collectionTaskSchema.parse(schedule.data) as CollectionShadowTaskData;
      await taskStore.enqueue({
        id: `task:buyer:collection:${data.jobId.toLowerCase()}:${data.scheduleVersion}`,
        kind: BUYER_COLLECTION_SHADOW_TASK,
        idempotencyKey: `buyer:collection:${data.jobId.toLowerCase()}:${data.scheduleVersion}`,
        availableAt: data.closeAt,
        maxAttempts: 8,
        data: data as unknown as RuntimeData,
        now,
      });
      return;
    }
    const data = counterTaskSchema.parse(schedule.data) as CounterTimeoutShadowTaskData;
    await taskStore.enqueue({
      id: `task:buyer:counter-timeout:${data.jobId.toLowerCase()}:${data.scheduleVersion}`,
      kind: BUYER_COUNTER_TIMEOUT_SHADOW_TASK,
      idempotencyKey: `buyer:counter-timeout:${data.jobId.toLowerCase()}:${data.scheduleVersion}`,
      availableAt: data.dueAt,
      maxAttempts: 8,
      data: data as unknown as RuntimeData,
      now,
    });
  };
}

export function createBuyerTimerShadowHandlers(
  snapshotStore: BuyerRuntimeSnapshotStore,
  options: {
    clock?: () => number;
    parityStore?: BuyerTimerParityAuditStore;
  } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [BUYER_COLLECTION_SHADOW_TASK]: async (context) => {
      const input = collectionTaskSchema.parse(context.task.data) as CollectionShadowTaskData;
      const snapshot = await requiredSnapshot(snapshotStore, input.jobId);
      const now = options.clock?.() ?? Date.now();
      const decision = planCollectionShadow(snapshot, input, now);
      if (decision.action === 'waiting' || decision.action === 'hold_for_evaluations') {
        return { state: 'waiting', availableAt: decision.availableAt };
      }
      await options.parityStore?.recordTaskDecision({
        jobId: input.jobId,
        kind: 'collection',
        scheduleVersion: input.scheduleVersion,
        observedAt: now,
        taskDecision: decision,
      });
      await context.checkpoint({
        checkpointKey: 'shadow-decision',
        phase: 'task.completed',
        data: { mode: 'shadow', decision },
      });
      return { state: 'succeeded' };
    },
    [BUYER_COUNTER_TIMEOUT_SHADOW_TASK]: async (context) => {
      const input = counterTaskSchema.parse(context.task.data) as CounterTimeoutShadowTaskData;
      const snapshot = await requiredSnapshot(snapshotStore, input.jobId);
      const now = options.clock?.() ?? Date.now();
      const decision = planCounterTimeoutShadow(snapshot, input, now);
      if (decision.action === 'waiting') {
        return { state: 'waiting', availableAt: decision.availableAt };
      }
      await options.parityStore?.recordTaskDecision({
        jobId: input.jobId,
        kind: 'counter-timeout',
        scheduleVersion: input.scheduleVersion,
        observedAt: now,
        taskDecision: decision,
      });
      await context.checkpoint({
        checkpointKey: 'shadow-decision',
        phase: 'task.completed',
        data: { mode: 'shadow', decision },
      });
      return { state: 'succeeded' };
    },
  };
}

function parseSnapshot(value: unknown): BuyerRuntimeSnapshot {
  return snapshotSchema.parse(value) as BuyerRuntimeSnapshot;
}

async function requiredSnapshot(
  store: BuyerRuntimeSnapshotStore,
  jobId: string,
): Promise<BuyerRuntimeSnapshot> {
  const snapshot = await store.get(jobId);
  if (!snapshot) throw new Error(`buyer runtime snapshot missing: ${jobId}`);
  return snapshot;
}
