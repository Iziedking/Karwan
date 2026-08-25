import { z } from 'zod';
import type {
  EvidenceNeedRecord,
  EvidencePurchaseRecord,
  EvidenceRuntimeRepository,
  EvidenceSnapshotRecord,
} from './runtime.js';

const snapshotSchema = z.object({
  snapshotId: z.string().min(1),
  source: z.string().min(1),
  capturedAtUnix: z.number().int().nonnegative(),
  reliability: z.number().int().min(0).max(100),
  status: z.enum(['fresh', 'stale', 'unknown', 'contradictory']),
  responseHash: z.string().min(1),
  provenance: z.array(z.string().min(1)).max(32),
}).strict();

const observationSchema = z.object({
  state: z.enum(['unknown', 'reconciling', 'settled', 'failed']),
  providerTransactionId: z.string().min(1).optional(),
  txHash: z.string().min(1).optional(),
  failureCode: z.string().min(1).optional(),
  snapshot: snapshotSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.state === 'settled' && !value.txHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['txHash'], message: 'settled evidence requires txHash' });
  }
});

export type EvidenceReconciliationObservation = z.infer<typeof observationSchema>;

export interface EvidenceReconciliationAdapter {
  reconcile(input: {
    purchase: EvidencePurchaseRecord;
    need: EvidenceNeedRecord;
    nowUnix: number;
  }): Promise<unknown>;
}

export interface EvidenceReconciliationBatchResult {
  scanned: number;
  polled: number;
  updated: number;
  settled: number;
  failed: number;
  snapshots: number;
  skipped: number;
  errors: string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

function hasPurchasePatch(
  purchase: EvidencePurchaseRecord,
  observation: EvidenceReconciliationObservation,
): boolean {
  return observation.state !== purchase.state
    || observation.providerTransactionId !== undefined
    || observation.txHash !== undefined
    || observation.failureCode !== undefined;
}

function snapshotRecord(
  snapshot: EvidenceReconciliationObservation['snapshot'],
  purchase: EvidencePurchaseRecord,
): Omit<EvidenceSnapshotRecord, 'createdAt'> {
  if (!snapshot) throw new Error('evidence snapshot is required');
  return {
    id: snapshot.snapshotId,
    evidenceNeedId: purchase.evidenceNeedId,
    purchaseId: purchase.id,
    source: snapshot.source,
    capturedAt: snapshot.capturedAtUnix,
    reliability: snapshot.reliability,
    state: snapshot.status,
    responseHash: snapshot.responseHash,
    provenance: snapshot.provenance,
  };
}

/**
 * Polls only already-created uncertain purchases. This boundary has no acquire
 * method and therefore cannot spend, fund, or resubmit a paid request.
 */
export async function reconcileEvidenceOnce(
  repository: EvidenceRuntimeRepository,
  adapter: EvidenceReconciliationAdapter,
  options: { now?: number; limit?: number } = {},
): Promise<EvidenceReconciliationBatchResult> {
  const nowUnix = options.now ?? Date.now();
  const purchases = await repository.listPurchasesByState(['unknown', 'reconciling'], options.limit ?? 100);
  const result: EvidenceReconciliationBatchResult = {
    scanned: purchases.length,
    polled: 0,
    updated: 0,
    settled: 0,
    failed: 0,
    snapshots: 0,
    skipped: 0,
    errors: [],
  };
  for (const purchase of purchases) {
    const need = await repository.getNeed(purchase.evidenceNeedId);
    if (!need) {
      result.skipped += 1;
      result.errors.push(`missing evidence need ${purchase.evidenceNeedId}`);
      continue;
    }
    try {
      result.polled += 1;
      const observation = observationSchema.parse(await adapter.reconcile({ purchase, need, nowUnix }));
      let current = purchase;
      if (hasPurchasePatch(purchase, observation)) {
        current = await repository.updatePurchase(purchase.id, purchase.version, observation.state, {
          ...(observation.providerTransactionId ? { providerTransactionId: observation.providerTransactionId } : {}),
          ...(observation.txHash ? { txHash: observation.txHash } : {}),
          ...(observation.failureCode ? { data: { failureCode: observation.failureCode } } : {}),
          now: nowUnix,
        });
        result.updated += 1;
      }
      if (observation.snapshot) {
        await repository.recordSnapshot({ ...snapshotRecord(observation.snapshot, current), now: nowUnix });
        result.snapshots += 1;
        if (current.state === 'settled' && observation.snapshot.status === 'fresh' && need.state === 'open') {
          await repository.updateNeed(need.id, need.version, 'fulfilled', {
            fulfilledBySnapshotId: observation.snapshot.snapshotId,
          }, nowUnix);
        }
      }
      if (current.state === 'settled') result.settled += 1;
      if (current.state === 'failed') result.failed += 1;
    } catch (error) {
      result.errors.push(`${purchase.id}: ${errorText(error)}`);
    }
  }
  return result;
}

export interface EvidenceReconciliationWorkerScheduler {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const nativeScheduler: EvidenceReconciliationWorkerScheduler = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface EvidenceReconciliationWorkerOptions {
  intervalMs?: number;
  limit?: number;
  now?: () => number;
  scheduler?: EvidenceReconciliationWorkerScheduler;
  onResult?: (result: EvidenceReconciliationBatchResult) => void;
  onError?: (error: unknown) => void;
}

export interface EvidenceReconciliationWorker {
  runOnce(): Promise<EvidenceReconciliationBatchResult>;
  start(): void;
  stop(): void;
}

export function createEvidenceReconciliationWorker(
  repository: EvidenceRuntimeRepository,
  adapter: EvidenceReconciliationAdapter,
  options: EvidenceReconciliationWorkerOptions = {},
): EvidenceReconciliationWorker {
  const intervalMs = Math.max(100, Math.floor(options.intervalMs ?? 15_000));
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  const now = options.now ?? (() => Date.now());
  const scheduler = options.scheduler ?? nativeScheduler;
  let stopped = true;
  let timer: unknown = null;
  let inFlight: Promise<EvidenceReconciliationBatchResult> | null = null;
  const schedule = (delayMs: number): void => {
    if (stopped || timer !== null) return;
    timer = scheduler.setTimeout(() => {
      timer = null;
      void tick();
    }, delayMs);
  };
  const runOnce = (): Promise<EvidenceReconciliationBatchResult> => {
    if (inFlight) return inFlight;
    const current = reconcileEvidenceOnce(repository, adapter, { now: now(), limit });
    inFlight = current;
    void current.then(
      () => { if (inFlight === current) inFlight = null; },
      () => { if (inFlight === current) inFlight = null; },
    );
    return current;
  };
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      options.onResult?.(await runOnce());
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
