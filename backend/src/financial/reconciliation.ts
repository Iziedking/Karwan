import type { CircleWalletAdapter, ProviderTransaction, ProviderTransactionStatus } from '../circle/CircleWalletAdapter.js';
import type {
  FinancialCommandRecord,
  FinancialRuntimeAuditStore,
  FinancialRuntimeRepository,
} from './runtime.js';

export interface ReconciliationResult {
  status: 'unchanged' | 'updated' | 'skipped';
  providerStatus?: ProviderTransactionStatus;
  reason?: string;
}

export interface ReconciliationBatchResult {
  scanned: number;
  polled: number;
  updated: number;
  skipped: number;
  errors: readonly { idempotencyKey: string; reason: string }[];
}

function lifecycleFor(transaction: ProviderTransaction): {
  lifecycle: 'SUBMITTED' | 'RECONCILING' | 'SETTLED' | 'FAILED';
  txHash?: string;
  failureCode?: string;
} {
  switch (transaction.status) {
    case 'COMPLETE':
      return transaction.txHash
        ? { lifecycle: 'SETTLED', txHash: transaction.txHash }
        : { lifecycle: 'RECONCILING', failureCode: 'COMPLETE_WITHOUT_TX_HASH' };
    case 'CANCELLED':
    case 'DENIED':
    case 'FAILED':
      return { lifecycle: 'FAILED', failureCode: transaction.status };
    case 'UNKNOWN':
    case 'STUCK':
      return { lifecycle: 'RECONCILING' };
    default:
      return { lifecycle: 'SUBMITTED' };
  }
}

/**
 * Reconcile one already-submitted command. This function never calls a create
 * or execute provider method, and it never invents a settlement without a
 * transaction hash. A caller can safely retry it after a worker crash.
 */
export async function reconcileFinancialCommand(
  repository: FinancialRuntimeRepository,
  adapter: Pick<CircleWalletAdapter, 'getTransaction'>,
  idempotencyKey: string,
  now = Date.now(),
): Promise<ReconciliationResult> {
  const current = await repository.get(idempotencyKey);
  if (!current) return { status: 'skipped', reason: 'COMMAND_NOT_FOUND' };
  if (current.providerLifecycle === 'SETTLED' || current.providerLifecycle === 'FAILED') {
    return { status: 'skipped', reason: 'TERMINAL_COMMAND' };
  }
  if (!current.providerId) return { status: 'skipped', reason: 'PROVIDER_ID_NOT_PERSISTED' };

  const transaction = await adapter.getTransaction(current.providerId);
  const next = lifecycleFor(transaction);
  const updated = await repository.recordProviderUpdate(
    current.idempotencyKey,
    current.version,
    {
      lifecycle: next.lifecycle,
      providerId: transaction.providerId,
      ...(next.txHash ? { txHash: next.txHash } : {}),
      ...(next.failureCode ? { failureCode: next.failureCode } : {}),
    },
    now,
  );
  return {
    status: updated.version === current.version ? 'unchanged' : 'updated',
    providerStatus: transaction.status,
  };
}

/**
 * Runs one bounded reconciliation pass over persisted commands. The adapter is
 * intentionally restricted to getTransaction, so a worker cannot resubmit a
 * transfer while recovering an uncertain provider outcome.
 */
export async function reconcileFinancialRuntimeOnce(
  repository: FinancialRuntimeRepository & FinancialRuntimeAuditStore,
  adapter: Pick<CircleWalletAdapter, 'getTransaction'>,
  options: { now?: number; limit?: number } = {},
): Promise<ReconciliationBatchResult> {
  const records = await repository.list(options.limit ?? 100);
  let polled = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ idempotencyKey: string; reason: string }> = [];
  for (const record of records as readonly FinancialCommandRecord[]) {
    try {
      const result = await reconcileFinancialCommand(
        repository,
        adapter,
        record.idempotencyKey,
        options.now ?? Date.now(),
      );
      if (result.status === 'skipped') skipped += 1;
      else {
        polled += 1;
        if (result.status === 'updated') updated += 1;
      }
    } catch (error) {
      errors.push({
        idempotencyKey: record.idempotencyKey,
        reason: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      });
    }
  }
  return { scanned: records.length, polled, updated, skipped, errors };
}
