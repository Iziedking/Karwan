export type ReleaseBlockReason =
  | 'requirement-mismatch'
  | 'evidence-unavailable'
  | 'security-hold'
  | 'no-agent-wallet';

export function releaseBlockReasonForDelivery(input: {
  /// Required-evidence lanes fail closed until a current receipt exists.
  /// Legacy deals omit this field and retain their previous optional behavior.
  evidenceRequired?: boolean;
  verificationStatus?: 'clean' | 'suspicious' | 'malicious' | 'unverifiable';
  deliveryMatch?: { verdict: 'aligned' | 'partial' | 'mismatch' | 'unknown' };
  evidenceReceipt?: { state: 'not-configured' | 'not-recorded' | 'pass' | 'mismatch' | 'unavailable' | 'expired' | 'stale-terms' | 'stale-delivery' | 'read-unavailable' };
}): ReleaseBlockReason | null {
  if (input.verificationStatus === 'suspicious' || input.verificationStatus === 'malicious') {
    return 'security-hold';
  }
  if (input.deliveryMatch?.verdict === 'mismatch') {
    return 'requirement-mismatch';
  }
  if (
    input.evidenceRequired
    && (!input.evidenceReceipt
      || input.evidenceReceipt.state === 'not-configured'
      || input.evidenceReceipt.state === 'not-recorded')
  ) {
    return 'evidence-unavailable';
  }
  if (input.evidenceReceipt?.state === 'mismatch') return 'requirement-mismatch';
  if (
    input.deliveryMatch?.verdict === 'unknown'
    || input.verificationStatus === 'unverifiable'
    || input.evidenceReceipt?.state === 'unavailable'
    || input.evidenceReceipt?.state === 'expired'
    || input.evidenceReceipt?.state === 'stale-terms'
    || input.evidenceReceipt?.state === 'stale-delivery'
    || input.evidenceReceipt?.state === 'read-unavailable'
  ) {
    return 'evidence-unavailable';
  }
  return null;
}
