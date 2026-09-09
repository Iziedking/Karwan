import { createHash } from 'node:crypto';

/// Stable, non-secret version for the current off-chain commercial terms.
/// It is used to reject an invite that was issued before the buyer edited the
/// deal; it is not an authorization token and never controls escrow.
export function termsDigest(terms: string): string {
  return createHash('sha256').update(terms, 'utf8').digest('hex');
}
