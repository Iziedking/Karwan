import assert from 'node:assert/strict';
import test from 'node:test';
import { TIER_START, tierProgress } from './tierProgress';

test('the next tier is the rung above the one HELD, never the next score band', () => {
  // The reported bug, with its real numbers: 711 points, held at ESTABLISHED
  // because only four deals had settled. The passport said "Elite +89", which
  // skipped STRONG and named a tier that no number of points could buy.
  const progress = tierProgress({
    score: 711,
    tier: 'ESTABLISHED',
    tierCappedBy: 'deals',
    dealsToNextTier: 4,
  });
  assert.deepEqual(progress, { kind: 'deals', nextTier: 'STRONG', deals: 4 });
});

test('a wallet held down by concentration is not offered points or deals', () => {
  // The other reported number: 647 points showing COLD, told "Elite +153".
  // Nothing about points or deals moves this wallet.
  const progress = tierProgress({
    score: 647,
    tier: 'COLD',
    tierCappedBy: 'concentration',
    dealsToNextTier: null,
  });
  assert.deepEqual(progress, { kind: 'concentration', nextTier: 'ESTABLISHED' });
});

test('points are the answer when points are what is missing', () => {
  assert.deepEqual(tierProgress({ score: 150, tier: 'NEW', tierCappedBy: null }), {
    kind: 'points',
    nextTier: 'COLD',
    points: 50,
  });
  assert.deepEqual(tierProgress({ score: 380, tier: 'COLD' }), {
    kind: 'points',
    nextTier: 'ESTABLISHED',
    points: 20,
  });
});

test('ELITE has nothing above it', () => {
  assert.deepEqual(tierProgress({ score: 950, tier: 'ELITE' }), { kind: 'top' });
  assert.deepEqual(tierProgress({ score: 1000, tier: 'ELITE', tierCappedBy: null }), { kind: 'top' });
});

test('a score past the next rung with nothing capping it says nothing', () => {
  // This is the state that produced "0 pts to ESTABLISHED" on a wallet that was
  // not there. It means the tier and the score came from different reads, and
  // the honest answer is no hint at all.
  assert.deepEqual(tierProgress({ score: 900, tier: 'COLD', tierCappedBy: null }), {
    kind: 'unknown',
  });
});

test('capped by deals with no count is not turned into a number', () => {
  assert.deepEqual(
    tierProgress({ score: 700, tier: 'ESTABLISHED', tierCappedBy: 'deals', dealsToNextTier: null }),
    { kind: 'unknown' },
  );
  assert.deepEqual(
    tierProgress({ score: 700, tier: 'ESTABLISHED', tierCappedBy: 'deals', dealsToNextTier: 0 }),
    { kind: 'unknown' },
  );
});

test('a hostile score cannot produce a hostile hint', () => {
  assert.deepEqual(tierProgress({ score: Number.NaN, tier: 'NEW' }), {
    kind: 'points',
    nextTier: 'COLD',
    points: 200,
  });
  const negative = tierProgress({ score: -500, tier: 'NEW' });
  assert.equal(negative.kind, 'points');
  assert.ok(negative.kind === 'points' && negative.points > 0);
});

test('an unrecognised tier says nothing rather than guessing', () => {
  assert.deepEqual(tierProgress({ score: 400, tier: 'PLATINUM' as never }), { kind: 'unknown' });
});

test('the breakpoints match the backend ladder', () => {
  // backend/src/reputation/config.ts TIER_BREAKPOINTS. A drift here is a card
  // that disagrees with the badge beside it.
  assert.deepEqual(TIER_START, {
    NEW: 0,
    COLD: 200,
    ESTABLISHED: 400,
    STRONG: 600,
    ELITE: 800,
  });
});
