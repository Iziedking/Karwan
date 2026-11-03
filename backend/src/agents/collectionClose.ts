import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import { logger } from '../logger.js';
import type { DurableTaskHandler, EnqueueTaskInput } from './durableTaskRunner.js';

/// The close of a request's offer window, as a durable task (view 48, step 7).
/// It survives a restart: the in-process timer it replaces did not.
export const COLLECTION_CLOSE_TASK = 'buyer.collection_close';

export interface CollectionClose {
  jobId: string;
  scheduleVersion: number;
  closeAt: number;
  startedAt?: number;
}

/// What the buyer agent holds for a request right now.
export interface LiveCollection {
  scheduleVersion: number;
  closeAt?: number;
  fired: boolean;
  finalized: boolean;
  expired: boolean;
  shortlisted: boolean;
}

export type CloseStep = 'missing' | 'stale' | 'close' | 'adopt';

const closeSchema = z.object({
  jobId: z.string().min(1),
  scheduleVersion: z.number().int().positive(),
  closeAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
});

/// Schedule versions come from the clock, so a window armed after a restart
/// always carries a higher version than one armed before it. A task whose
/// version is above what the agent holds is therefore a window the agent lost
/// in a restart, and the task adopts it.
export function planClose(live: LiveCollection | null, task: CollectionClose): CloseStep {
  if (!live) return 'missing';
  if (live.fired || live.finalized || live.expired) return 'stale';
  if (live.scheduleVersion > task.scheduleVersion) return 'stale';
  if (live.scheduleVersion < task.scheduleVersion) return live.shortlisted ? 'stale' : 'adopt';
  return live.closeAt === undefined ? 'stale' : 'close';
}

export function collectionCloseTask(close: CollectionClose, now?: number): EnqueueTaskInput {
  const key = `buyer:collection-close:${close.jobId.toLowerCase()}:${close.scheduleVersion}`;
  return {
    id: `task:${key}`,
    kind: COLLECTION_CLOSE_TASK,
    idempotencyKey: key,
    availableAt: close.closeAt,
    maxAttempts: 8,
    data: { ...close } as unknown as RuntimeData,
    ...(now !== undefined ? { now } : {}),
  };
}

type Enqueue = (input: EnqueueTaskInput) => Promise<unknown>;
let scheduler: Enqueue | null = null;

/// Set when the durable runtime is running. Passing null goes back to timers.
export function configureCollectionCloseScheduler(enqueue: Enqueue | null): () => void {
  scheduler = enqueue;
  return () => {
    if (scheduler === enqueue) scheduler = null;
  };
}

/// Arms a window's close. Returns true when the durable task owns it. A failed
/// enqueue falls back to the timer, so an auction always closes.
export function armClose(close: CollectionClose, armTimer: () => void): boolean {
  const enqueue = scheduler;
  if (!enqueue) {
    armTimer();
    return false;
  }
  void enqueue(collectionCloseTask(close)).catch((err) => {
    logger.warn(
      { jobId: close.jobId, err: (err as Error).message },
      'offer window close could not be queued, using a timer',
    );
    armTimer();
  });
  return true;
}

export interface CollectionClosePort {
  live(jobId: string): LiveCollection | null;
  reseed(jobId: string): Promise<boolean>;
  close(task: CollectionClose, adopt: boolean): Promise<void>;
}

/// How long a close waits for its request to be loaded back after a restart.
/// The boot reload and the task can race; the task waits instead of giving up.
export const RELOAD_GRACE_MS = 120_000;
export const RELOAD_RETRY_MS = 5_000;

export function createCollectionCloseHandlers(
  port: CollectionClosePort,
  options: { clock?: () => number } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [COLLECTION_CLOSE_TASK]: async (context) => {
      const task = closeSchema.parse(context.task.data) as CollectionClose;
      let step = planClose(port.live(task.jobId), task);
      if (step === 'missing') {
        await port.reseed(task.jobId);
        step = planClose(port.live(task.jobId), task);
      }
      const now = options.clock?.() ?? Date.now();
      if (step === 'missing' && now < task.closeAt + RELOAD_GRACE_MS) {
        return { state: 'waiting', availableAt: now + RELOAD_RETRY_MS };
      }
      if (step === 'close' || step === 'adopt') await port.close(task, step === 'adopt');
      await context.checkpoint({
        checkpointKey: 'collection-close',
        phase: 'task.completed',
        data: { step },
      });
      return { state: 'succeeded' };
    },
  };
}
