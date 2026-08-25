import type {
  EvidenceNeedRecord,
  EvidencePurchaseRecord,
  EvidenceSnapshotRecord,
} from '../evidence/runtime.js';
import type { MatchingPaymentStatus, MatchingTransactionEvidence } from './types.js';

export interface ReputationEvidenceProjectionInput {
  subjectAddress: string;
  completed: number;
  disputed: number;
  failed: number;
  observedAtUnix: number;
  freshnessSeconds?: number;
}

/**
 * The legacy credit-passport response is useful context but its provider
 * transaction is not a per-request settlement receipt. Keep the projection
 * explicitly uncertain so matching can audit the claim without allowing it to
 * raise the reliability band.
 */
export interface PaidPassportEvidenceProjectionInput {
  subjectAddress: string;
  transaction: string;
  successCount?: number;
  disputedCount?: number;
  failedCount?: number;
  paidAtUnix: number;
  freshnessSeconds?: number;
  /** Durable evidence snapshot identity when the shadow task was persisted. */
  evidenceId?: string;
}

export interface EvidenceProjectionInput {
  need: EvidenceNeedRecord;
  snapshots: readonly EvidenceSnapshotRecord[];
  purchases: readonly EvidencePurchaseRecord[];
  nowUnix: number;
  freshnessSeconds: number;
}

function nonNegativeCount(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return Math.max(0, value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return Math.min(Number.MAX_SAFE_INTEGER, Number(value));
  return 0;
}

function sourceFor(snapshot: EvidenceSnapshotRecord): MatchingTransactionEvidence['source'] {
  const source = snapshot.source.toLowerCase();
  if (source.includes('x402') || source.includes('paid')) return 'paid_x402';
  if (source.includes('self')) return 'self_asserted';
  if (source.includes('settled')) return 'karwan_settled';
  return 'karwan_onchain';
}

function paymentStatus(purchase: EvidencePurchaseRecord | undefined): MatchingPaymentStatus | undefined {
  if (!purchase) return undefined;
  if (purchase.state === 'created') return 'AUTHORIZED';
  if (purchase.state === 'submitted') return 'SUBMITTED';
  if (purchase.state === 'unknown') return 'UNKNOWN';
  if (purchase.state === 'reconciling') return 'RECONCILING';
  if (purchase.state === 'settled') return 'SETTLED';
  return 'FAILED';
}

/**
 * Projects reconciled reputation-registry counts into the matching snapshot.
 * The identity is stable for the same counts, while fetched-at/expiry remain
 * explicit so stale reads cannot silently qualify a future evaluation.
 */
export function projectReputationEvidence(
  input: ReputationEvidenceProjectionInput,
): MatchingTransactionEvidence[] {
  const completed = Math.max(0, Math.floor(input.completed));
  const disputed = Math.max(0, Math.floor(input.disputed));
  const failed = Math.max(0, Math.floor(input.failed));
  if (completed + disputed + failed === 0) return [];
  const subject = input.subjectAddress.trim().toLowerCase();
  const freshnessSeconds = Math.max(1, Math.floor(input.freshnessSeconds ?? 3_600));
  return [{
    source: 'karwan_onchain',
    completed,
    disputed,
    failed,
    fetchedAtUnix: input.observedAtUnix,
    expiresAtUnix: input.observedAtUnix + freshnessSeconds,
    verified: true,
    evidenceId: `reputation:${subject}:${completed}:${disputed}:${failed}`,
  }];
}

export function projectPaidPassportEvidence(
  input: PaidPassportEvidenceProjectionInput,
): MatchingTransactionEvidence[] {
  const subject = input.subjectAddress.trim().toLowerCase();
  const transaction = input.transaction.trim();
  if (!subject || !transaction || !Number.isFinite(input.paidAtUnix)) return [];
  const freshnessSeconds = Math.max(1, Math.floor(input.freshnessSeconds ?? 3_600));
  const observedAtUnix = Math.floor(input.paidAtUnix);
  return [{
    source: 'paid_x402',
    completed: nonNegativeCount(input.successCount),
    disputed: nonNegativeCount(input.disputedCount),
    failed: nonNegativeCount(input.failedCount),
    fetchedAtUnix: observedAtUnix,
    expiresAtUnix: observedAtUnix + freshnessSeconds,
    paymentStatus: 'UNKNOWN',
    verified: false,
    evidenceId: input.evidenceId?.trim() || `paid-passport:${subject}:${transaction}`,
  }];
}

export function projectEvidenceToTransactions(input: EvidenceProjectionInput): MatchingTransactionEvidence[] {
  const purchases = new Map(input.purchases.map((purchase) => [purchase.id, purchase]));
  return input.snapshots
    .filter((snapshot) => snapshot.evidenceNeedId === input.need.id)
    .map((snapshot) => {
      const purchase = snapshot.purchaseId ? purchases.get(snapshot.purchaseId) : undefined;
      const payload = purchase?.data ?? {};
      const expiresAtUnix = snapshot.capturedAt + Math.max(0, input.freshnessSeconds);
      const fresh = snapshot.state === 'fresh' && expiresAtUnix > input.nowUnix;
      const payment = paymentStatus(purchase);
      const verified = fresh && snapshot.state === 'fresh' && (!purchase || purchase.state === 'settled');
      return {
        source: sourceFor(snapshot),
        completed: nonNegativeCount(payload.completed),
        disputed: nonNegativeCount(payload.disputed),
        failed: nonNegativeCount(payload.failed),
        fetchedAtUnix: snapshot.capturedAt,
        expiresAtUnix,
        ...(payment ? { paymentStatus: payment } : {}),
        verified,
        evidenceId: snapshot.id,
      };
    });
}
