import type { MatchingLane } from './types.js';

/**
 * Versioned evidence policy used by immutable matching mandate snapshots.
 * Service matching is conservative by default; finance matching requires a
 * higher reliability band because a bad counterparty can create direct loss.
 */
export const MATCHING_RELIABILITY_POLICY_VERSION = 'matching-reliability-v1';

export const MATCHING_MINIMUM_RELIABILITY: Readonly<Record<MatchingLane, number>> = {
  service: 60,
  finance: 80,
};

export function minimumReliabilityForLane(lane: MatchingLane): number {
  return MATCHING_MINIMUM_RELIABILITY[lane];
}
