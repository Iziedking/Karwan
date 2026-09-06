import type { DirectDeal } from '@/core/api';

type State = NonNullable<DirectDeal['evidenceReceipt']>['state'];

export type EvidenceReceiptCopyKey =
  | 'pass'
  | 'mismatch'
  | 'unavailable'
  | 'expired'
  | 'staleTerms'
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
    case 'read-unavailable': return 'readUnavailable';
    case 'not-recorded': return 'notRecorded';
    case 'not-configured': return 'notConfigured';
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function evidenceReceiptTone(state: State): 'positive' | 'warning' | 'neutral' {
  if (state === 'pass') return 'positive';
  if (state === 'not-recorded' || state === 'not-configured') return 'neutral';
  return 'warning';
}
