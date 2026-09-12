import type { DirectDeal } from '@/core/api';

type State = NonNullable<DirectDeal['evidenceReceipt']>['state'];

export type EvidenceReceiptCopyKey =
  | 'pass'
  | 'mismatch'
  | 'unavailable'
  | 'expired'
  | 'staleTerms'
  | 'staleDelivery'
  | 'readUnavailable'
  | 'notRecorded'
  | 'notConfigured';

export function evidenceReceiptCopyKey(state: State): EvidenceReceiptCopyKey {
  switch (state) {
    case 'pass': return 'pass';
    case 'mismatch': return 'mismatch';
    case 'unavailable': return 'unavailable';
    case 'expired': return 'expired';
    case 'stale-terms': return 'staleTerms';
    case 'stale-delivery': return 'staleDelivery';
    case 'read-unavailable': return 'readUnavailable';
    case 'not-recorded': return 'notRecorded';
    case 'not-configured': return 'notConfigured';
    default: {
      const exhaustive: never = state;
      void exhaustive;
      // A newer server must never produce blank copy in an older client.
      return 'readUnavailable';
    }
  }
}

export function evidenceReceiptBodyKey(state: State) {
  switch (state) {
    case 'pass': return 'passBody';
    case 'mismatch': return 'mismatchBody';
    case 'expired':
    case 'stale-terms':
    case 'stale-delivery': return 'staleBody';
    case 'not-recorded': return 'pendingBody';
    case 'not-configured': return 'notConfiguredBody';
    case 'unavailable': return 'unavailableBody';
    default: return 'readUnavailableBody';
  }
}

export function evidenceReceiptTone(state: State): 'positive' | 'warning' | 'neutral' {
  if (state === 'pass') return 'positive';
  if (state === 'not-recorded' || state === 'not-configured') return 'neutral';
  return 'warning';
}
