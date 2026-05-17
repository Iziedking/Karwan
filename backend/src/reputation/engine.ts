/// Composite reputation per docs/reputation-model.md §2. The math is
/// dimension-light on purpose so it's reviewable and tunable from env. Every
/// term clamps before composition so a bad input can't blow up the score.

import { repConfig, tierFor, type Tier } from './config.js';
import type { ReputationInputs } from './signals.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReputationTerms {
  activity: number;
  completion: number;
  /// Range [1, 2]. Above 1 because stake is purely additive value.
  stake: number;
  time: number;
  /// In [0, 1]. Subtracted from the score after the tanh envelope.
  penalty: number;
  /// 90-day rolling rates used inside the penalty. Surfaced for diagnostics.
  rates: {
    disputesLost: number;
    cancel: number;
    spam: number;
    counterAbandon: number;
  };
  /// Decay multiplier in [0, 1]. Recently active users get 1.0; idle wallets
  /// see their visible score halved after `decayHalflifeDays` of silence.
  decay: number;
}

export interface ReputationResult {
  address: string;
  score: number;
  tier: Tier;
  terms: ReputationTerms;
  /// Inputs echoed for debugging + UI display.
  inputs: ReputationInputs;
  /// Engine + formula version. Pinned in config.
  modelVersion: number;
}

/// Apply the formula. Pure function for testability.
export function compute(inputs: ReputationInputs): ReputationResult {
  const activity = activityTerm(inputs.completedDeals);
  const completion = completionTerm(inputs.completedDeals, inputs.totalStarted);
  const stake = stakeTerm(inputs.tenureWeightedStakeUsdc);
  const time = timeTerm(inputs.firstActionAt);

  const rates = {
    disputesLost: rate90d(inputs.failedCount, inputs.totalStarted),
    cancel: rate90d(inputs.cancelsLast90d, inputs.totalStarted),
    spam: clamp01(inputs.spamScore),
    counterAbandon: clamp01(inputs.counterAbandonRate),
  };
  const penalty = clamp01(
    repConfig.penaltyDispute * rates.disputesLost +
      repConfig.penaltyCancel * rates.cancel +
      repConfig.penaltySpam * rates.spam +
      repConfig.penaltyAbandon * rates.counterAbandon,
  );

  // tanh envelope keeps early gains feeling fast and caps the upside.
  // 0.85 scaling so the saturation point lands near the ELITE boundary.
  const positive = Math.tanh(0.85 * activity * completion * stake * time);
  const raw = Math.round(1000 * positive - 1000 * penalty);

  // Decay only the visible score, not the underlying inputs.
  const decay = decayMultiplier(inputs.lastActionAt);
  const score = clamp(0, 1000, Math.floor(raw * decay));

  return {
    address: inputs.address,
    score,
    tier: tierFor(score),
    terms: { activity, completion, stake, time, penalty, rates, decay },
    inputs,
    modelVersion: repConfig.modelVersion,
  };
}

/* ============================================================================
   Individual terms. Kept exported so the spam detector and UI can call them
   in isolation when previewing the impact of a single signal change.
   ========================================================================== */

export function activityTerm(completedDeals: number): number {
  // log10(1 + n) / log10(1 + half) — saturates at half.
  if (completedDeals <= 0) return 0;
  const half = Math.max(1, repConfig.activityHalf);
  const out = Math.log10(1 + completedDeals) / Math.log10(1 + half);
  // Allow values above 1 to flow through; the tanh outside the multiplication
  // pulls everything back into a saturating curve so super-active wallets
  // still cap near the ELITE boundary.
  return Math.max(0, out);
}

export function completionTerm(completedDeals: number, totalStarted: number): number {
  // Laplace smoothing keeps fresh accounts at a neutral 0.5 instead of zero
  // and stops a single bad outcome from sinking a 0/0 wallet.
  return clamp01((completedDeals + 1) / (totalStarted + 2));
}

export function stakeTerm(tenureWeightedStakeUsdc: number): number {
  const cap = Math.max(1, repConfig.stakeCapUsdc);
  const sq = Math.sqrt(Math.max(0, tenureWeightedStakeUsdc) / cap);
  return 1 + Math.min(1, sq);
}

export function timeTerm(firstActionAt: number): number {
  if (!firstActionAt) return 0;
  const days = (Date.now() - firstActionAt) / MS_PER_DAY;
  return clamp01(days / Math.max(1, repConfig.timeRampDays));
}

export function decayMultiplier(lastActionAt: number): number {
  if (!lastActionAt) return 1;
  const days = (Date.now() - lastActionAt) / MS_PER_DAY;
  if (days <= 0) return 1;
  const halflife = Math.max(1, repConfig.decayHalflifeDays);
  return Math.exp(-(days / halflife));
}

/* ============================================================================
   helpers
   ========================================================================== */

function rate90d(count: number, total: number): number {
  if (total <= 0) return 0;
  // We don't yet distinguish 90-day totals from all-time totals at the engine
  // layer. Signals.ts feeds the rolling count, the denominator uses total
  // started which is conservative (slightly under-counts the rate). When the
  // DB grows a proper 90-day window this becomes exact.
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
