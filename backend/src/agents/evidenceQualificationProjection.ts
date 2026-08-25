import { createHash } from 'node:crypto';
import type { PaidPassportSignal } from '../x402/buyerClient.js';
import type { EvidenceQualificationShadowTaskData } from './evidenceQualificationShadow.js';

/** Maps the legacy paid-passport result into an auditable shadow observation.
 * A Gateway deposit or provider response is deliberately not marked settled. */
export function buildPaidEvidenceQualificationObservation(
  signal: PaidPassportSignal,
  subject: string,
  actor: 'buyer' | 'seller',
  jobId: string,
): EvidenceQualificationShadowTaskData {
  const evidenceKey = createHash('sha256')
    .update(`${jobId}|${actor}|${subject}|completed-transactions|v1`)
    .digest('hex');
  const observedAtUnix = Math.floor(signal.paidAt / 1000);
  const responseHash = createHash('sha256')
    .update(JSON.stringify({
      subject: signal.subject,
      tier: signal.tier,
      score: signal.score,
      successCount: signal.successCount ?? null,
      disputedCount: signal.disputedCount ?? null,
      failedCount: signal.failedCount ?? null,
      transaction: signal.transaction,
    }))
    .digest('hex');
  return {
    dealRoomId: jobId,
    idempotencyKey: `legacy-evidence:${evidenceKey}`,
    observedAtUnix,
    source: 'matching-shadow',
    need: {
      id: `legacy-evidence-need:${evidenceKey}`,
      needKey: `legacy:evidence:${evidenceKey}`,
      kind: 'completed-transactions',
      riskClass: 'matching',
      data: {
        subject,
        actor,
        reportedTier: signal.tier,
        reportedScore: signal.score,
      },
    },
    purchase: {
      id: `legacy-evidence-purchase:${evidenceKey}`,
      idempotencyKey: `legacy-evidence-purchase:${evidenceKey}`,
      providerId: 'karwan-credit-passport',
      priceUsdc: signal.amountUsd.toFixed(6),
      observedState: 'unknown',
      providerTransactionId: signal.transaction,
      data: {
        subject,
        actor,
        reportedTier: signal.tier,
        reportedScore: signal.score,
        successCount: signal.successCount ?? null,
        disputedCount: signal.disputedCount ?? null,
        failedCount: signal.failedCount ?? null,
        depositTxHash: signal.depositTxHash ?? null,
        paymentProofKind: 'provider-response-not-per-request-settlement',
      },
    },
    snapshot: {
      id: `legacy-evidence-snapshot:${evidenceKey}`,
      purchaseId: `legacy-evidence-purchase:${evidenceKey}`,
      source: 'karwan-credit-passport',
      capturedAt: observedAtUnix,
      reliability: 0,
      state: 'unknown',
      responseHash: `sha256:${responseHash}`,
      provenance: [
        `provider:${signal.transaction}`,
        ...(signal.depositTxHash ? [`deposit:${signal.depositTxHash}`] : []),
      ],
    },
  };
}
