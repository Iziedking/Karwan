import { logger } from '../logger.js';
import type { EnqueueTaskInput } from './durableTaskRunner.js';

/// The buyer agent's timers as durable tasks (view 48, step 7). When the
/// durable runtime runs, a timer is a task that survives a restart; when it
/// does not, or a task cannot be queued, the in-process timer runs instead.
type Enqueue = (input: EnqueueTaskInput) => Promise<unknown>;
let scheduler: Enqueue | null = null;

/// Set when the durable runtime is running. Passing null goes back to timers.
export function configureDurableTimers(enqueue: Enqueue | null): () => void {
  scheduler = enqueue;
  return () => {
    if (scheduler === enqueue) scheduler = null;
  };
}

/// Returns true when the durable task owns the timer. A failed enqueue falls
/// back to the timer, so the step still happens.
export function armDurable(task: EnqueueTaskInput, armTimer: () => void): boolean {
  const enqueue = scheduler;
  if (!enqueue) {
    armTimer();
    return false;
  }
  void enqueue(task).catch((err) => {
    logger.warn({ taskKind: task.kind, taskId: task.id, err: (err as Error).message }, 'timer could not be queued, using an in-process timer');
    armTimer();
  });
  return true;
}

/// How long a task waits for its request to be loaded back after a restart.
/// The boot reload and the task can race; the task waits instead of giving up.
export const RELOAD_GRACE_MS = 120_000;
export const RELOAD_RETRY_MS = 5_000;
