/// Composite reputation, model v2 (docs/reputation-model.md).
///
///   score = round( 1000 × base × (1 − penalty) × decay )
///
/// `base` is an ADDITIVE weighted sum of six concave factor sub-scores, each in
/// [0,1]. Additive (not multiplicative) so every factor earns points on its own.
/// staking, tenure, and activity move the score even with zero completed deals.
/// Concave (log / sqrt) so the first stake / deal / day is worth far more than
/// the hundredth: gains are fast in NEW and progressively harder toward ELITE,
/// and climbing the last tiers needs several factors high at once, not one maxed.
///
/// `penalty` is a capped MULTIPLIER (1 − penalty), never a subtraction that can
/// drive the score negative, so a penalised wallet drops but always has a path
/// back. `decay` fades the visible score for idle wallets.

import {
  repConfig,
  tierFor,
  minTier,
  tierCeilingForDeals,
  tierCeilingForConcentration,
  TIER_MIN_DEALS,
  type Tier,
} from './config.js';
import type { ReputationInputs } from './signals.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReputationTerms {
  /// All in [0,1]. The six additive factors.
  stake: number;
  completion: number;
  volume: number;
  tenure: number;
  activity: number;
  referral: number;
  /// Weighted sum of the six factors, [0,1].
  base: number;
  /// In [0, penaltyCap]. Applied as (1 - penalty).
  penalty: number;
  /// Inactivity decay multiplier, [0,1].
  decay: number;
  /// Rolling rates feeding the penalty. Surfaced for diagnostics.
  rates: {
    disputesLost: number;
    cancel: number;
    spam: number;
    counterAbandon: number;
    security: number;
  };
}

export interface ReputationResult {
  address: string;
  score: number;
  /// The tier actually held, after ceilings. Never above `scoreTier`.
  tier: Tier;
  /// What the score alone would have earned, before ceilings. Kept so the UI can
  /// show a wallet what it is losing and why, rather than an unexplained tier.
  scoreTier: Tier;
  /// Which ceiling bound the tier down, if any. Null when the score governs.
  tierCappedBy: 'deals' | 'concentration' | null;
  /// Settled deals needed for the next tier up, when deals are the binding
  /// constraint. Null otherwise.
  dealsToNextTier: number | null;
  terms: ReputationTerms;
  inputs: ReputationInputs;
  modelVersion: number;
}

/// Apply the formula. Pure function for testability.
export function compute(inputs: ReputationInputs): ReputationResult {
  const stake = stakeScore(inputs);
  const completion = completionScore(inputs);
  const volume = volumeScore(inputs);
  const tenure = tenureScore(inputs);
  const activity = activityScore(inputs);
  const referral = referralScore(inputs);

  const base = clamp01(
    repConfig.wStake * stake +
      repConfig.wCompletion * completion +
      repConfig.wVolume * volume +
      repConfig.wTenure * tenure +
      repConfig.wActivity * activity +
      repConfig.wReferral * referral,
  );

  const rates = {
    disputesLost: ratio(inputs.failedCount, inputs.totalStarted),
    cancel: ratio(inputs.cancelsLast90d, inputs.totalStarted),
    spam: clamp01(inputs.spamScore),
    counterAbandon: clamp01(inputs.counterAbandonRate),
    // Flagged-link offenses, saturated to 1.0 at securityOffenseCap.
    security: clamp01(inputs.securityOffenses / Math.max(1, repConfig.securityOffenseCap)),
  };
  const penalty = Math.min(
    repConfig.penaltyCap,
    clamp01(
      repConfig.penaltyDispute * rates.disputesLost +
        repConfig.penaltyCancel * rates.cancel +
        repConfig.penaltySpam * rates.spam +
        repConfig.penaltyAbandon * rates.counterAbandon +
        repConfig.penaltySecurity * rates.security,
    ),
  );

  const decay = decayMultiplier(inputs.lastActionAt);
  const score = clamp(0, 1000, Math.round(1000 * base * (1 - penalty) * decay));

  // The score says how much standing has been earned. The ceilings say how much
  // of it can be HELD. Stake, tenure and activity all earn points without a
  // single deal closing, which is intended, but standing gates other people's
  // money now: it decides financing eligibility and how much collateral a seller
  // posts. So a tier has to be backed by completed deals with real
  // counterparties, not by capital parked and a calendar.
  const scoreTier = tierFor(score);
  const dealsCeiling = tierCeilingForDeals(inputs.completedDeals);
  const concentrationCeiling = tierCeilingForConcentration(
    inputs.concentrationSoft,
    inputs.concentrationHard,
  );
  const tier = minTier(scoreTier, dealsCeiling, concentrationCeiling);

  let tierCappedBy: 'deals' | 'concentration' | null = null;
  if (tier !== scoreTier) {
    // Concentration named first when both bind: it is the one the wallet cannot
    // fix by simply doing more of the same thing.
    tierCappedBy =
      concentrationCeiling === tier && concentrationCeiling !== dealsCeiling
        ? 'concentration'
        : dealsCeiling === tier
          ? 'deals'
          : 'concentration';
  }

  return {
    address: inputs.address,
    score,
    tier,
    scoreTier,
    tierCappedBy,
    dealsToNextTier: dealsToNext(inputs.completedDeals, tierCappedBy),
    terms: { stake, completion, volume, tenure, activity, referral, base, penalty, decay, rates },
    inputs,
    modelVersion: repConfig.modelVersion,
  };
}

/// How many more settled deals unlock the next tier, when deals are what is
/// holding the wallet back.
///
/// Null unless DEALS are the binding ceiling. It used to take the tier and the
/// score tier and answer whenever the two differed, which meant a wallet held
/// at COLD by counterparty concentration was told to close more deals: true
/// that some higher tier needs them, false that closing them would move this
/// wallet anywhere. Advice that cannot work is worse than no advice, because
/// the reader acts on it.
function dealsToNext(
  completedDeals: number,
  tierCappedBy: 'deals' | 'concentration' | null,
): number | null {
  if (tierCappedBy !== 'deals') return null;
  const order: Array<Exclude<Tier, 'NEW'>> = ['COLD', 'ESTABLISHED', 'STRONG', 'ELITE'];
  for (const t of order) {
    const need = TIER_MIN_DEALS[t];
    if (completedDeals < need) return need - completedDeals;
  }
  return null;
}

// Factor sub-scores. Each returns [0,1]. Exported for unit tests + UI preview.

/// Staking. amount (sqrt-saturating toward stakeCapUsdc) times a duration
/// envelope that starts at stakeFloorCredit on day one and ramps to full over
/// stakeFullDays. The strongest single lever (highest weight).
export function stakeScore(i: ReputationInputs): number {
  const amount = satSqrt(i.stakeUsdc, repConfig.stakeCapUsdc);
  const duration = clamp01(i.stakeDays / Math.max(1, repConfig.stakeFullDays));
  const envelope = repConfig.stakeFloorCredit + (1 - repConfig.stakeFloorCredit) * duration;
  return clamp01(amount * envelope);
}

/// Completed deals weighted by success rate. Count gives the magnitude
/// (log-saturating toward dealsCap), success rate (Laplace-smoothed) scales it
/// between 0.5x and 1x so a clean record is worth double a disputed one.
export function completionScore(i: ReputationInputs): number {
  const successRate = clamp01((i.completedDeals + 1) / (i.totalStarted + 2));
  return clamp01(satLog(i.completedDeals, repConfig.dealsCap) * (0.5 + 0.5 * successRate));
}

/// Lifetime USDC settled through escrow. sqrt-saturating toward volumeCapUsdc.
export function volumeScore(i: ReputationInputs): number {
  return satSqrt(i.lifetimeVolumeUsdc, repConfig.volumeCapUsdc);
}

/// Days since registration. Linear ramp to full over tenureFullDays.
export function tenureScore(i: ReputationInputs): number {
  if (!i.registeredAt) return 0;
  const days = (Date.now() - i.registeredAt) / MS_PER_DAY;
  return clamp01(days / Math.max(1, repConfig.tenureFullDays));
}

/// Distinct days the wallet was active. log-saturating toward activeDaysCap.
export function activityScore(i: ReputationInputs): number {
  return satLog(i.activeDays, repConfig.activeDaysCap);
}

/// Wallets that registered via a direct deal with this user. log-saturating.
export function referralScore(i: ReputationInputs): number {
  return satLog(i.referredCount, repConfig.referralCap);
}

/// Idle fade. A wallet that stops trading should read as less current, and the
/// config calls the knob a HALF-LIFE, so the curve has to be one.
///
/// It was `exp(-days / halflife)`, which decays on a TIME CONSTANT: at 180 days
/// that returns 0.368, not the 0.5 the name promises, and the gap widens at
/// every multiple (0.135 against 0.25 at a year). Every idle wallet was being
/// faded about a quarter harder than the model documented. `Math.LN2` is what
/// turns a time constant into a half-life.
export function decayMultiplier(lastActionAt: number): number {
  if (!lastActionAt) return 1;
  const days = (Date.now() - lastActionAt) / MS_PER_DAY;
  if (!Number.isFinite(days) || days <= 0) return 1;
  const halflife = Math.max(1, repConfig.decayHalflifeDays);
  return clamp01(Math.exp(-Math.LN2 * (days / halflife)));
}

// helpers

/// log10(1+n) / log10(1+cap), clamped. Concave: fast early, saturates at cap.
function satLog(n: number, cap: number): number {
  if (n <= 0) return 0;
  const c = Math.max(1, cap);
  return clamp01(Math.log10(1 + n) / Math.log10(1 + c));
}

/// sqrt(x/cap), clamped. Concave: fast early, full at the cap.
function satSqrt(x: number, cap: number): number {
  const c = Math.max(1e-9, cap);
  return clamp01(Math.sqrt(Math.max(0, x) / c));
}

function ratio(count: number, total: number): number {
  if (total <= 0) return 0;
  return clamp01(count / total);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clamp(min: number, max: number, n: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
