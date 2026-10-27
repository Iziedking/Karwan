import type { RecordSide } from './suiteRecordStatus.js';

/// The receipt line (view 27, decision 11) shows at most once in this long.
export const RECORD_NUDGE_EVERY_MS = 30 * 86_400_000;

/// A person with their own wallet who only receives money may never sign an Arc
/// transaction, so their record never sets itself up. After a settled deal that
/// is not on their record, their receipt offers to count the next ones.
export function recordNudgeDue(i: {
  side: RecordSide | undefined;
  ownWallet: boolean;
  recordComplete: boolean;
  shownAt: number | undefined;
  nowMs: number;
}): boolean {
  if (i.side !== 'missing' || !i.ownWallet || i.recordComplete) return false;
  return i.shownAt === undefined || i.nowMs - i.shownAt >= RECORD_NUDGE_EVERY_MS;
}
