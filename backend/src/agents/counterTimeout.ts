import { z } from 'zod';
import type { RuntimeData } from '../db/agentRuntime.js';
import type { DurableTaskHandler, EnqueueTaskInput } from './durableTaskRunner.js';
import { RELOAD_GRACE_MS, RELOAD_RETRY_MS, armDurable } from './durableTimers.js';

/// The wait for a seller's reply to the buyer agent's counter, as a durable
/// task (view 48, step 7). When the seller stays silent past it, the agent
/// moves on to the next seller instead of waiting forever.
export const COUNTER_TIMEOUT_TASK = 'buyer.counter_timeout';

export interface CounterWait {
  jobId: string;
  seller: string;
  scheduleVersion: number;
  round: number;
  dueAt: number;
}

/// What the buyer agent holds for the request and the seller it countered.
export interface LiveCounter {
  scheduleVersion: number;
  dueAt?: number;
  finalized: boolean;
  expired: boolean;
  sellerTried: boolean;
  otherOffers: number;
}

export type CounterStep = 'missing' | 'stale' | 'move-on' | 'resume';

const waitSchema = z.object({
  jobId: z.string().min(1),
  seller: z.string().min(1),
  scheduleVersion: z.number().int().positive(),
  round: z.number().int().positive(),
  dueAt: z.number().int().nonnegative(),
});

/// The same version rules as the window close: a task above what the agent
/// holds is a wait lost in a restart. After a restart the agent no longer has
/// its queue of sellers, so it resumes by ranking the offers it brought back
/// without the silent seller, and only when there is another offer to go to.
export function planCounterWait(live: LiveCounter | null, task: CounterWait): CounterStep {
  if (!live) return 'missing';
  if (live.finalized || live.expired || live.sellerTried) return 'stale';
  if (live.scheduleVersion > task.scheduleVersion) return 'stale';
  if (live.scheduleVersion < task.scheduleVersion) return live.otherOffers > 0 ? 'resume' : 'stale';
  return live.dueAt === undefined ? 'stale' : 'move-on';
}

export function counterWaitTask(wait: CounterWait, now?: number): EnqueueTaskInput {
  const key = `buyer:counter-timeout:${wait.jobId.toLowerCase()}:${wait.scheduleVersion}`;
  return {
    id: `task:${key}`,
    kind: COUNTER_TIMEOUT_TASK,
    idempotencyKey: key,
    availableAt: wait.dueAt,
    maxAttempts: 8,
    data: { ...wait } as unknown as RuntimeData,
    ...(now !== undefined ? { now } : {}),
  };
}

export function armCounterWait(wait: CounterWait, armTimer: () => void): boolean {
  return armDurable(counterWaitTask(wait), armTimer);
}

export interface CounterWaitPort {
  live(jobId: string, seller: string): LiveCounter | null;
  reseed(jobId: string): Promise<boolean>;
  moveOn(task: CounterWait): Promise<void>;
  resume(task: CounterWait): Promise<void>;
}

export function createCounterWaitHandlers(
  port: CounterWaitPort,
  options: { clock?: () => number } = {},
): Readonly<Record<string, DurableTaskHandler>> {
  return {
    [COUNTER_TIMEOUT_TASK]: async (context) => {
      const task = waitSchema.parse(context.task.data) as CounterWait;
      let step = planCounterWait(port.live(task.jobId, task.seller), task);
      if (step === 'missing') {
        await port.reseed(task.jobId);
        step = planCounterWait(port.live(task.jobId, task.seller), task);
      }
      const now = options.clock?.() ?? Date.now();
      if (step === 'missing' && now < task.dueAt + RELOAD_GRACE_MS) {
        return { state: 'waiting', availableAt: now + RELOAD_RETRY_MS };
      }
      if (step === 'move-on') await port.moveOn(task);
      if (step === 'resume') await port.resume(task);
      await context.checkpoint({
        checkpointKey: 'counter-timeout',
        phase: 'task.completed',
        data: { step },
      });
      return { state: 'succeeded' };
    },
  };
}
