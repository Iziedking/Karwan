/// Reputation engine config (model v2). The composite score is an ADDITIVE
/// weighted sum of concave factor sub-scores, scaled to 0-1000, then trimmed by
/// a capped penalty multiplier and an inactivity decay. Weights + saturation
/// caps are env-driven so testnet stays flexible and mainnet can tighten without
/// a redeploy. Tier breakpoints are FIXED (not env). the score is the lever, the
/// tiers mean the same everywhere. Full formula in docs/reputation-model.md.

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const repConfig = {
  // ---- additive base weights (sum to 1.0) -------------------------------
  // Stake-forward: staking is the strongest lever. it grows TVL and buys trust
  // regardless of tier, so it carries the most weight.
  wStake: num('REP_W_STAKE', 0.3),
  wCompletion: num('REP_W_COMPLETION', 0.25),
  wVolume: num('REP_W_VOLUME', 0.13),
  wTenure: num('REP_W_TENURE', 0.12),
  wActivity: num('REP_W_ACTIVITY', 0.12),
  wReferral: num('REP_W_REFERRAL', 0.08),

  // ---- concave saturation caps (testnet-friendly defaults) --------------
  // Each factor reaches ~full credit at its cap; below the cap, early units are
  // worth far more than later ones (diminishing returns). Raise all of these
  // for mainnet so tiers are earned over months, not days.
  dealsCap: num('REP_DEALS_CAP', 10),
  stakeCapUsdc: num('REP_STAKE_CAP_USDC', 100),
  stakeFullDays: num('REP_STAKE_FULL_DAYS', 14),
  tenureFullDays: num('REP_TENURE_FULL_DAYS', 14),
  activeDaysCap: num('REP_ACTIVE_DAYS_CAP', 14),
  referralCap: num('REP_REFERRAL_CAP', 5),
  volumeCapUsdc: num('REP_VOLUME_CAP_USDC', 500),
  // Fraction of the stake-amount score granted the moment you stake, before
  // duration accrues. Keeps day-one staking meaningful (you don't wait days to
  // see any boost). Duration scales the rest in.
  stakeFloorCredit: num('REP_STAKE_FLOOR_CREDIT', 0.4),

  // ---- penalty (a capped multiplier, never a zeroing subtraction) -------
  // score is multiplied by (1 - penalty). Capped so a penalised account drops
  // hard but always keeps a path back. Lighter weights on testnet so test
  // cancels / bursts don't tank an account.
  penaltyCap: num('REP_PENALTY_CAP', 0.6),
  penaltyDispute: num('REP_PENALTY_DISPUTE_W', 0.5),
  penaltyCancel: num('REP_PENALTY_CANCEL_W', 0.12),
  penaltySpam: num('REP_PENALTY_SPAM_W', 0.2),
  penaltyAbandon: num('REP_PENALTY_ABANDON_W', 0.08),

  // ---- decay + spam -----------------------------------------------------
  decayHalflifeDays: num('REP_DECAY_HALFLIFE_DAYS', 180),
  spamBurstLimit: num('REP_SPAM_BURST_LIMIT', 5),

  // Bumped to 2 for the additive rewrite. Older v1 scores stay comparable
  // under their own version key.
  modelVersion: 2,
} as const;

export type Tier = 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';

/// Fixed 0-1000 tier breakpoints. Deliberately NOT env-driven: the score scale
/// does the work, so a tier label means the same thing on testnet and mainnet.
///   NEW 0-199 · COLD 200-399 · ESTABLISHED 400-599 · STRONG 600-799 · ELITE 800+
export const TIER_BREAKPOINTS = {
  COLD: 200,
  ESTABLISHED: 400,
  STRONG: 600,
  ELITE: 800,
} as const;

const TIER_RANK: Record<Tier, number> = {
  NEW: 0,
  COLD: 1,
  ESTABLISHED: 2,
  STRONG: 3,
  ELITE: 4,
};

export function tierFor(score: number): Tier {
  if (score >= TIER_BREAKPOINTS.ELITE) return 'ELITE';
  if (score >= TIER_BREAKPOINTS.STRONG) return 'STRONG';
  if (score >= TIER_BREAKPOINTS.ESTABLISHED) return 'ESTABLISHED';
  if (score >= TIER_BREAKPOINTS.COLD) return 'COLD';
  return 'NEW';
}

/// Ordinal rank for comparing tiers (e.g. detecting a tier-up). Higher = better.
export function tierRank(tier: Tier): number {
  return TIER_RANK[tier] ?? 0;
}
