import type { PassReason } from './fitAlert.js';

/// Which of a selling agent's passes the seller hears about (view 96): only
/// when something other than the work stopped the agent, said as the seller's
/// own setting or the request's rule, never the buyer's name or score.
/// Everything else is silent: the request does not fit, it was already
/// handled, or it was the person's own choice.

const TOLD: Record<string, PassReason> = {
  'no-ask-below': 'under-lowest',
  'buyer-record': 'buyer-record',
  'buyer-dispute-record': 'buyer-record',
  'buyer-reputation-too-low': 'buyer-record',
  'insufficient-stake-trusted-match': 'needs-guarantee',
  'finance-lane-requires-business': 'business-only',
};

/// Passes the agent makes before it checks the request against the seller's
/// work, so the listener checks the fit itself before telling anyone.
export const BEFORE_FIT_CHECK = new Set(['buyer-record', 'buyer-dispute-record', 'buyer-reputation-too-low', 'finance-lane-requires-business']);

export function passReasonOf(sellerReason: string): PassReason | null {
  return TOLD[sellerReason] ?? null;
}
