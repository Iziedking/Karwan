import type { CircleWalletAdapter } from '../circle/CircleWalletAdapter.js';
import {
  reconcileFinancialRuntimeOnce,
  type ReconciliationBatchResult,
} from './reconciliation.js';
import type { FinancialRuntimeAuditStore, FinancialRuntimeRepository } from './runtime.js';

type ReadOnlyFinancialRepository = FinancialRuntimeRepository & FinancialRuntimeAuditStore;
type ReadOnlyCircleAdapter = Pick<CircleWalletAdapter, 'getTransaction'>;

export interface ReconciliationWorkerScheduler {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const nativeScheduler: ReconciliationWorkerScheduler = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface FinancialReconciliationWorkerOptions {
  intervalMs?: number;
  limit?: number;
  now?: () => number;
  scheduler?: ReconciliationWorkerScheduler;
  onResult?: (result: ReconciliationBatchResult) => void;
  onError?: (error: unknown) => void;
}

export interface FinancialReconciliationWorker {
  runOnce(): Promise<ReconciliationBatchResult>;
  start(): void;
  stop(): void;
}

/**
 * Creates a bounded, read-only reconciliation loop. The adapter type exposes
 * getTransaction only, so this worker cannot resubmit a transfer while it is
 * recovering an uncertain provider outcome. Repository lifecycle updates are
 * still optimistic and idempotent; provider execution remains elsewhere.
 */
export function createFinancialReconciliationWorker(
  repository: ReadOnlyFinancialRepository,
  adapter: ReadOnlyCircleAdapter,
  options: FinancialReconciliationWorkerOptions = {},
): FinancialReconciliationWorker {
  const intervalMs = Math.max(100, Math.floor(options.intervalMs ?? 15_000));
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  const now = options.now ?? (() => Date.now());
  const scheduler = options.scheduler ?? nativeScheduler;

  let stopped = true;
  let timer: unknown = null;
  let inFlight: Promise<ReconciliationBatchResult> | null = null;

  const schedule = (delayMs: number): void => {
    if (stopped || timer !== null) return;
    timer = scheduler.setTimeout(() => {
      timer = null;
      void tick();
    }, delayMs);
  };

  const execute = (): Promise<ReconciliationBatchResult> =>
    reconcileFinancialRuntimeOnce(repository, adapter, { now: now(), limit });

  const runOnce = (): Promise<ReconciliationBatchResult> => {
    if (inFlight) return inFlight;
    const current = execute();
    inFlight = current;
    // Observe both fulfillment and rejection so a caller can handle the
    // returned promise without an internal finally-chain becoming unhandled.
    void current.then(
      () => { if (inFlight === current) inFlight = null; },
      () => { if (inFlight === current) inFlight = null; },
    );
    return current;
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const result = await runOnce();
      options.onResult?.(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      if (!stopped) schedule(intervalMs);
    }
  };

  return {
    runOnce,
    start: () => {
      if (!stopped) return;
      stopped = false;
      schedule(0);
    },
    stop: () => {
      stopped = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
    },
  };
}
