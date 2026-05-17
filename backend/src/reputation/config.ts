/// Reputation engine config per docs/reputation-model.md §9. Every weight and
/// threshold lives here, env-driven so tuning happens without redeploys.
/// The formula version is pinned so historical scores stay comparable.

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const repConfig = {
  /// Saturates activityTerm. 50 means: 50 completed deals → activity = 1.0.
  activityHalf: num('REP_ACTIVITY_HALF', 50),
  /// Stake (tenure-weighted) at which stakeTerm caps at 2.0.
  stakeCapUsdc: num('REP_STAKE_CAP_USDC', 1000),
  /// Days to reach full timeTerm.
  timeRampDays: num('REP_TIME_RAMP_DAYS', 90),
  /// Days of inactivity that halve the displayed score.
  decayHalflifeDays: num('REP_DECAY_HALFLIFE_DAYS', 180),
  /// Burst-rate threshold for spam (posts in 24h before each extra adds).
  spamBurstLimit: num('REP_SPAM_BURST_LIMIT', 5),

  /// Tier boundaries (lower bounds).
  tierNew: num('REP_TIER_NEW', 200),
  tierCold: num('REP_TIER_COLD', 400),
  tierEstablished: num('REP_TIER_ESTABLISHED', 600),
  tierStrong: num('REP_TIER_STRONG', 800),

  /// Penalty weights. Sum gets clamped to 1 inside the formula.
  penaltyDispute: num('REP_PENALTY_DISPUTE_W', 0.3),
  penaltyCancel: num('REP_PENALTY_CANCEL_W', 0.15),
  penaltySpam: num('REP_PENALTY_SPAM_W', 0.4),
  penaltyAbandon: num('REP_PENALTY_ABANDON_W', 0.1),

  /// Pin the version of the formula. Older scores keyed under v1 stay
  /// comparable even if we ship v2 later.
  modelVersion: 1,
} as const;

export type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';

export function tierFor(score: number): Tier {
  if (score < repConfig.tierNew) return 'NEW';
  if (score < repConfig.tierCold) return 'COLD';
  if (score < repConfig.tierEstablished) return 'ESTABLISHED';
  if (score < repConfig.tierStrong) return 'STRONG';
  return 'ELITE';
}
