export type ReleaseBlockReason =
  | 'requirement-mismatch'
  | 'evidence-unavailable'
  | 'security-hold'
  | 'no-agent-wallet';

export function releaseBlockReasonForDelivery(input: {
  verificationStatus?: 'clean' | 'suspicious' | 'malicious' | 'unverifiable';
  deliveryMatch?: { verdict: 'aligned' | 'partial' | 'mismatch' | 'unknown' };
}): ReleaseBlockReason | null {
  if (input.verificationStatus === 'suspicious' || input.verificationStatus === 'malicious') {
    return 'security-hold';
  }
  if (input.deliveryMatch?.verdict === 'mismatch') {
    return 'requirement-mismatch';
  }
  if (input.deliveryMatch?.verdict === 'unknown' || input.verificationStatus === 'unverifiable') {
    return 'evidence-unavailable';
  }
  return null;
}
