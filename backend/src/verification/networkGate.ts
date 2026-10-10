import { isDiscoverable, type Ladder } from './ladder.js';

/// The verified network: with it on, agents only put work-verified sellers in
/// front of buyers, and only show requests from buyers who passed the person
/// check. Off, the market behaves as before.

export function sellerMayBid(input: {
  enabled: boolean;
  level: Ladder;
}): { ok: true } | { ok: false; reason: 'seller-not-verified'; detail: string } {
  if (!input.enabled || isDiscoverable(input.level)) return { ok: true };
  return {
    ok: false,
    reason: 'seller-not-verified',
    detail: 'Only work-verified sellers are offered to buyers. Finish verification to be found.',
  };
}

export function buyerVisible(input: { enabled: boolean; level: Ladder }): boolean {
  return !input.enabled || input.level !== 'registered';
}
