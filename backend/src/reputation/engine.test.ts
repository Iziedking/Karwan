import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compute,
  completionScore,
  decayMultiplier,
  referralScore,
  stakeScore,
  tenureScore,
  volumeScore,
  activityScore,
} from './engine.js';
import {
  repConfig,
  minTier,
  tierCeilingForConcentration,
  tierCeilingForDeals,
  tierFor,
  TIER_BREAKPOINTS,
} from './config.js';
import type { ReputationInputs } from './signals.js';

/// The composite decides financing eligibility and how much collateral a seller
/// posts, and it had no tests at all. These pin the formula, the tier ladder and
/// the ceilings, so a change to any of them has to be deliberate.

const DAY = 24 * 60 * 60 * 1000;
/// A fixed instant. Every assertion about tenure or decay names it rather than
/// reaching for the wall clock, which is what the injected `now` is for.
const NOW = 1_760_000_000_000;

function inputs(over: Partial<ReputationInputs> = {}): ReputationInputs {
  return {
    address: '0x1111111111111111111111111111111111111111',
    successCount: 0,
    disputedCount: 0,
    failedCount: 0,
    totalStarted: 0,
    completedDeals: 0,
    cancelsLast90d: 0,
    firstActionAt: 0,
    lastActionAt: NOW,
    stakeUsdc: 0,
    stakeDays: 0,
    registeredAt: NOW,
    activeDays: 0,
    lifetimeVolumeUsdc: 0,
    referredCount: 0,
    spamScore: 0,
    spamBreakdown: { burst: 0, diversity: 0, matchCancel: 0 } as never,
    counterAbandonRate: 0,
    concentrationRatio: 0,
    concentrationSoft: false,
    concentrationHard: false,
    securityOffenses: 0,
    ...over,
  } as ReputationInputs;
}

// ---------------------------------------------------------------- the ladder

test('the tier ladder is contiguous, with no score falling between bands', () => {
  // A gap or an overlap here is a wallet whose tier depends on which side of
  // the comparison ran.
  assert.equal(tierFor(0), 'NEW');
  assert.equal(tierFor(TIER_BREAKPOINTS.COLD - 1), 'NEW');
  assert.equal(tierFor(TIER_BREAKPOINTS.COLD), 'COLD');
  assert.equal(tierFor(TIER_BREAKPOINTS.ESTABLISHED - 1), 'COLD');
  assert.equal(tierFor(TIER_BREAKPOINTS.ESTABLISHED), 'ESTABLISHED');
  assert.equal(tierFor(TIER_BREAKPOINTS.STRONG - 1), 'ESTABLISHED');
  assert.equal(tierFor(TIER_BREAKPOINTS.STRONG), 'STRONG');
  assert.equal(tierFor(TIER_BREAKPOINTS.ELITE - 1), 'STRONG');
  assert.equal(tierFor(TIER_BREAKPOINTS.ELITE), 'ELITE');
  assert.equal(tierFor(1000), 'ELITE');
});

test('the base weights sum to exactly one', () => {
  // They are env-driven, and a sum below 1 silently caps the reachable score
  // while a sum above 1 lets a single factor carry more than its share.
  const sum =
    repConfig.wStake +
    repConfig.wCompletion +
    repConfig.wVolume +
    repConfig.wTenure +
    repConfig.wActivity +
    repConfig.wReferral;
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
});

test('a maxed wallet with no penalty reaches the top of the scale', () => {
  const result = compute(
    inputs({
      completedDeals: 60,
      totalStarted: 60,
      successCount: 60,
      stakeUsdc: repConfig.stakeCapUsdc * 4,
      stakeDays: repConfig.stakeFullDays * 2,
      registeredAt: NOW - repConfig.tenureFullDays * 2 * DAY,
      activeDays: repConfig.activeDaysCap * 4,
      lifetimeVolumeUsdc: repConfig.volumeCapUsdc * 4,
      referredCount: repConfig.referralCap * 4,
    }),
    NOW,
  );
  assert.ok(result.score > 950, `score was ${result.score}`);
  assert.equal(result.scoreTier, 'ELITE');
});

test('an empty wallet scores zero and is NEW', () => {
  const result = compute(inputs({ registeredAt: 0, lastActionAt: 0 }), NOW);
  assert.equal(result.score, 0);
  assert.equal(result.tier, 'NEW');
  assert.equal(result.tierCappedBy, null);
});

// ---------------------------------------------------------------- ceilings

test('deals cap the tier the score alone would have earned', () => {
  // Stake and tenure can carry a wallet into STRONG with four deals closed.
  // Standing is a claim about repeated completion, so it must not hold.
  const result = compute(
    inputs({
      completedDeals: 4,
      totalStarted: 4,
      stakeUsdc: repConfig.stakeCapUsdc,
      stakeDays: repConfig.stakeFullDays,
      registeredAt: NOW - repConfig.tenureFullDays * 2 * DAY,
      activeDays: repConfig.activeDaysCap,
      lifetimeVolumeUsdc: repConfig.volumeCapUsdc * 0.3,
    }),
    NOW,
  );
  assert.equal(result.scoreTier, 'STRONG');
  assert.equal(result.tier, 'ESTABLISHED');
  assert.equal(result.tierCappedBy, 'deals');
  assert.equal(result.dealsToNextTier, 4);
});

test('concentration caps the tier, and the advice names concentration not deals', () => {
  // The bug: dealsToNextTier came back as a number whenever ANY tier needed
  // more deals, whatever was actually binding. A wallet held at COLD by trading
  // with one counterparty was told to close more deals, which would not move it.
  const result = compute(
    inputs({
      completedDeals: 12,
      totalStarted: 12,
      stakeUsdc: repConfig.stakeCapUsdc * 4,
      stakeDays: repConfig.stakeFullDays * 2,
      registeredAt: NOW - repConfig.tenureFullDays * 3 * DAY,
      activeDays: repConfig.activeDaysCap * 2,
      lifetimeVolumeUsdc: repConfig.volumeCapUsdc * 2,
      concentrationRatio: 0.95,
      concentrationSoft: true,
      concentrationHard: true,
    }),
    NOW,
  );
  assert.equal(result.tier, 'COLD');
  assert.equal(result.tierCappedBy, 'concentration');
  assert.equal(
    result.dealsToNextTier,
    null,
    'closing deals cannot lift a wallet whose ceiling is concentration',
  );
});

test('the strictest ceiling wins when several bind', () => {
  assert.equal(minTier('STRONG', tierCeilingForDeals(3), tierCeilingForConcentration(true, false)), 'ESTABLISHED');
  assert.equal(minTier('ELITE', tierCeilingForDeals(20), tierCeilingForConcentration(false, true)), 'COLD');
});

test('a ceiling never raises a tier', () => {
  // minTier takes the lowest, so a wallet with 20 deals and a NEW score stays
  // NEW: the ceilings are a cap, not a floor.
  const result = compute(inputs({ completedDeals: 20, totalStarted: 20 }), NOW);
  assert.equal(result.tier, result.scoreTier);
  assert.equal(result.tierCappedBy, null);
});

// ---------------------------------------------------------------- penalty

test('penalty scales the score down and is capped, never zeroing it', () => {
  const clean = compute(
    inputs({
      completedDeals: 10,
      totalStarted: 10,
      stakeUsdc: repConfig.stakeCapUsdc,
      stakeDays: repConfig.stakeFullDays,
    }),
    NOW,
  );
  const penalised = compute(
    inputs({
      completedDeals: 10,
      totalStarted: 10,
      failedCount: 10,
      cancelsLast90d: 10,
      spamScore: 1,
      counterAbandonRate: 1,
      securityOffenses: 5,
      stakeUsdc: repConfig.stakeCapUsdc,
      stakeDays: repConfig.stakeFullDays,
    }),
    NOW,
  );
  assert.ok(penalised.score < clean.score);
  assert.equal(penalised.terms.penalty, repConfig.penaltyCap);
  assert.ok(penalised.score > 0, 'a penalised wallet must keep a path back');
});

test('a single flagged link lands most of the security penalty', () => {
  const one = compute(inputs({ securityOffenses: 1 }), NOW);
  assert.ok(one.terms.rates.security >= 0.5, `security rate was ${one.terms.rates.security}`);
});

// ---------------------------------------------------------------- decay

test('the decay half-life halves the score at the half-life, not before', () => {
  // It was `exp(-days / halflife)`, which is a TIME CONSTANT, not a half-life:
  // at 180 days it returned 0.368 where the config name promises 0.5, a 26%
  // harsher fade than documented, compounding at every multiple.
  const halflife = repConfig.decayHalflifeDays;
  assert.ok(Math.abs(decayMultiplier(NOW - halflife * DAY, NOW) - 0.5) < 1e-9);
  assert.ok(Math.abs(decayMultiplier(NOW - 2 * halflife * DAY, NOW) - 0.25) < 1e-9);
  assert.ok(Math.abs(decayMultiplier(NOW - 3 * halflife * DAY, NOW) - 0.125) < 1e-9);
  assert.equal(decayMultiplier(0, NOW), 1, 'a wallet with no last action is not decayed');
  assert.equal(decayMultiplier(NOW, NOW), 1, 'no elapsed time, no decay');
  assert.equal(decayMultiplier(NOW + DAY, NOW), 1, 'a future timestamp cannot boost a score');
});

// ------------------------------------------------------- the injected clock

test('tenure ramps to full over exactly tenureFullDays', () => {
  // Untestable before the clock was injected: the factor read Date.now() and a
  // test could only assert inequalities around "roughly now".
  const full = repConfig.tenureFullDays;
  const at = (days: number) => tenureScore(inputs({ registeredAt: NOW - days * DAY }), NOW);
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(full / 2) - 0.5) < 1e-9);
  assert.equal(at(full), 1);
  assert.equal(at(full * 10), 1, 'tenure saturates rather than overflowing');
  assert.equal(tenureScore(inputs({ registeredAt: 0 }), NOW), 0, 'never registered, no credit');
});

test('a registration timestamp in the future earns no tenure', () => {
  // Clock skew between a client and the server is real, and negative days must
  // not read as negative credit.
  assert.equal(tenureScore(inputs({ registeredAt: NOW + 30 * DAY }), NOW), 0);
});

test('compute is pure: same inputs and same instant, same score', () => {
  // The point of injecting the clock. Two calls a millisecond apart used to
  // differ, which is why nothing downstream could be pinned.
  const i = inputs({
    completedDeals: 6,
    totalStarted: 7,
    stakeUsdc: 60,
    stakeDays: 9,
    registeredAt: NOW - 30 * DAY,
    lastActionAt: NOW - 5 * DAY,
    activeDays: 11,
    lifetimeVolumeUsdc: 320,
  });
  const first = compute(i, NOW);
  const second = compute(i, NOW);
  assert.deepEqual(first.terms, second.terms);
  assert.equal(first.score, second.score);
  // And the same wallet read a year later has decayed, deterministically.
  const later = compute(i, NOW + 365 * DAY);
  assert.ok(later.score < first.score);
  assert.ok(later.terms.decay < first.terms.decay);
});

test('an idle wallet loses score on a documented curve, not an arbitrary one', () => {
  const i = inputs({
    completedDeals: 10,
    totalStarted: 10,
    stakeUsdc: repConfig.stakeCapUsdc,
    stakeDays: repConfig.stakeFullDays,
    registeredAt: NOW - 90 * DAY,
    lastActionAt: NOW,
    activeDays: repConfig.activeDaysCap,
    lifetimeVolumeUsdc: repConfig.volumeCapUsdc,
  });
  const fresh = compute(i, NOW);
  const halfLifeLater = compute(i, NOW + repConfig.decayHalflifeDays * DAY);
  // Tenure keeps growing while the wallet sits idle, so the score is not exactly
  // halved; the DECAY term is, which is the part the half-life governs.
  assert.ok(Math.abs(halfLifeLater.terms.decay - 0.5) < 1e-9);
  assert.ok(halfLifeLater.score < fresh.score);
});

// ---------------------------------------------------------------- factors

test('every factor stays inside [0,1] for hostile inputs', () => {
  const hostile = inputs({
    completedDeals: -5,
    totalStarted: -5,
    stakeUsdc: -1000,
    stakeDays: -10,
    activeDays: -3,
    lifetimeVolumeUsdc: Number.NaN,
    referredCount: Number.POSITIVE_INFINITY,
    registeredAt: NOW + 10 * DAY,
  });
  for (const [name, value] of Object.entries({
    stake: stakeScore(hostile, NOW),
    completion: completionScore(hostile, NOW),
    volume: volumeScore(hostile, NOW),
    tenure: tenureScore(hostile, NOW),
    activity: activityScore(hostile, NOW),
    referral: referralScore(hostile, NOW),
  })) {
    assert.ok(Number.isFinite(value), `${name} was not finite`);
    assert.ok(value >= 0 && value <= 1, `${name} was ${value}`);
  }
});

test('a negative or absurd input can never produce a score outside the scale', () => {
  const result = compute(
    inputs({
      completedDeals: -10,
      stakeUsdc: Number.NEGATIVE_INFINITY,
      lifetimeVolumeUsdc: Number.NaN,
      spamScore: 50,
      counterAbandonRate: -3,
    }),
    NOW,
  );
  assert.ok(result.score >= 0 && result.score <= 1000, `score was ${result.score}`);
  assert.ok(Number.isInteger(result.score));
});

test('factors are concave: the first unit is worth more than the tenth', () => {
  const first = volumeScore(inputs({ lifetimeVolumeUsdc: 50 }), NOW);
  const tenth = volumeScore(inputs({ lifetimeVolumeUsdc: 500 }), NOW) - volumeScore(inputs({ lifetimeVolumeUsdc: 450 }), NOW);
  assert.ok(first > tenth, 'volume should saturate');
  const firstDeal = completionScore(inputs({ completedDeals: 1, totalStarted: 1 }), NOW);
  const tenthDeal =
    completionScore(inputs({ completedDeals: 10, totalStarted: 10 }), NOW) -
    completionScore(inputs({ completedDeals: 9, totalStarted: 9 }), NOW);
  assert.ok(firstDeal > tenthDeal, 'completion should saturate');
});

test('staking pays something on day one', () => {
  // stakeFloorCredit exists so a fresh stake is visible immediately.
  const dayOne = stakeScore(inputs({ stakeUsdc: repConfig.stakeCapUsdc, stakeDays: 0 }), NOW);
  assert.ok(dayOne > 0, 'a same-day stake earned nothing');
  assert.ok(Math.abs(dayOne - repConfig.stakeFloorCredit) < 0.01);
});

test('a wallet that never staked gets no stake credit', () => {
  assert.equal(stakeScore(inputs({ stakeUsdc: 0, stakeDays: 90 }), NOW), 0);
});

test('completion rewards a clean record over a disputed one', () => {
  const clean = completionScore(inputs({ completedDeals: 8, totalStarted: 8 }), NOW);
  const messy = completionScore(inputs({ completedDeals: 8, totalStarted: 24 }), NOW);
  assert.ok(clean > messy);
});
