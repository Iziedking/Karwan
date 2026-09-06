export type ReleaseBlockReason =
  | 'requirement-mismatch'
  | 'evidence-unavailable'
  | 'security-hold'
  | 'no-agent-wallet';

export function releaseBlockReasonForDelivery(input: {
  verificationStatus?: 'clean' | 'suspicious' | 'malicious' | 'unverifiable';
  deliveryMatch?: { verdict: 'aligned' | 'partial' | 'mismatch' | 'unknown' };
  evidenceReceipt?: { state: 'not-configured' | 'not-recorded' | 'pass' | 'mismatch' | 'unavailable' | 'expired' | 'stale-terms' | 'read-unavailable' };
}): ReleaseBlockReason | null {
  if (input.verificationStatus === 'suspicious' || input.verificationStatus === 'malicious') {
    return 'security-hold';
  }
  if (input.deliveryMatch?.verdict === 'mismatch') {
    return 'requirement-mismatch';
  }
  if (input.evidenceReceipt?.state === 'mismatch') return 'requirement-mismatch';
  if (
    input.deliveryMatch?.verdict === 'unknown'
    || input.verificationStatus === 'unverifiable'
    || input.evidenceReceipt?.state === 'unavailable'
    || input.evidenceReceipt?.state === 'expired'
    || input.evidenceReceipt?.state === 'stale-terms'
    || input.evidenceReceipt?.state === 'read-unavailable'
  ) {
    return 'evidence-unavailable';
  }
  return null;
}
