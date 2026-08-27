export type PublicJobStatus = 'open' | 'negotiating' | 'ended' | 'cancelled' | 'expired';

/**
 * Resolve the intentionally small status surface shown to non-participants.
 * Buyer `finalized` is not sufficient on its own because it is also used for
 * accepted matches awaiting approval/funding; callers must provide the
 * already-resolved match and terminal signals separately.
 */
export function publicJobStatus(input: {
  cancelled: boolean;
  expired: boolean;
  ended: boolean;
  matched: boolean;
}): PublicJobStatus {
  if (input.cancelled) return 'cancelled';
  if (input.expired) return 'expired';
  if (input.ended && !input.matched) return 'ended';
  if (input.matched) return 'negotiating';
  return 'open';
}
