import type { Reputation, SealedReputation } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';

export interface RecordCopy {
  record: string;
  recordOne: string;
  recordNew: string;
}

/// The line beside a name where money goes to or comes from (view 50): how
/// many deals they settled. The tier stays on the profile and the record pages,
/// where there is room for its name (owner, 5 Nov 2026). A sealed record shows
/// no count, so it adds nothing here.
export function personRecordLine(
  reputation: { sealed: SealedReputation } | { open: Reputation } | null,
  copy: RecordCopy,
): string | null {
  if (reputation && 'sealed' in reputation) return reputation.sealed.tier === 'NEW' ? copy.recordNew : null;
  const settled = reputation?.open.successCount ?? 0;
  if (settled <= 0) return copy.recordNew;
  return settled === 1 ? copy.recordOne : fill(copy.record, { n: settled });
}
