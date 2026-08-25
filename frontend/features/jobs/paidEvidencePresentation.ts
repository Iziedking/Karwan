export type PaidEvidenceReceiptState = 'payment_only' | 'snapshot_recorded';

export interface PaidEvidenceReceiptPresentation {
  state: PaidEvidenceReceiptState;
  evidenceId: string | null;
  displayEvidenceId: string | null;
  providerId: string;
  claim: string;
  decisionImpact: 'legacy_match_unchanged';
}

/// Pure, read-only presentation mapping for the paid counterparty receipt.
/// The full identifier remains available for recovery/support; the compact
/// value is only for the narrow match banner line.
export function presentPaidEvidenceReceipt(input: {
  evidenceId?: string | null;
  providerId?: string | null;
  claim?: string | null;
  decisionImpact?: 'legacy_match_unchanged' | null;
}): PaidEvidenceReceiptPresentation {
  const evidenceId = input.evidenceId?.trim() || null;
  return {
    state: evidenceId ? 'snapshot_recorded' : 'payment_only',
    evidenceId,
    displayEvidenceId: evidenceId ? shortenEvidenceId(evidenceId) : null,
    providerId: input.providerId?.trim() || 'karwan-credit-passport',
    claim: input.claim?.trim() || 'completed-transactions',
    decisionImpact: input.decisionImpact ?? 'legacy_match_unchanged',
  };
}

export function shortenEvidenceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 22) return trimmed;
  return `${trimmed.slice(0, 14)}…${trimmed.slice(-6)}`;
}
