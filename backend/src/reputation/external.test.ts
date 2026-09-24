import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTERNAL_REPUTATION_PARAMS as P,
  externalReputation,
  importedFactorWeight,
  scoreSource,
  wilsonLowerBound,
  type ExternalOutcome,
  type SourceEvidence,
} from './external.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 24);

function outcomes(n: number, successRate: number, opts: Partial<ExternalOutcome> = {}): ExternalOutcome[] {
  return Array.from({ length: n }, (_, i) => ({
    at: NOW - 30 * DAY,
    success: i < Math.round(n * successRate),
    counterparty: `client-${i}`,
    ...opts,
  }));
}

const src = (outcomesList: ExternalOutcome[], verification: SourceEvidence['verification'] = 'official_api'): SourceEvidence => ({
  source: 'github',
  verification,
  outcomes: outcomesList,
});

test('Wilson lower bound matches the published formula', () => {
  // 90 of 100 at z = 1.96 is about 0.826 (Evan Miller, How Not To Sort By Average Rating).
  assert.ok(Math.abs(wilsonLowerBound(90, 100, 1.96) - 0.8256) < 0.001);
  assert.equal(wilsonLowerBound(0, 0, 1.96), 0);
});

test('no verifiable evidence gives no score, not a neutral one', () => {
  assert.equal(externalReputation([]).score, null);
  assert.equal(externalReputation([src(outcomes(50, 1), 'self_reported')], NOW).score, null);
});

test('a long record outranks a short one at the same success rate', () => {
  const thin = externalReputation([src(outcomes(5, 1))], NOW).score!;
  const deep = externalReputation([src(outcomes(200, 1))], NOW).score!;
  assert.ok(deep > thin, `${deep} > ${thin}`);
});

test('failures lower the score', () => {
  const good = externalReputation([src(outcomes(100, 0.98))], NOW).score!;
  const poor = externalReputation([src(outcomes(100, 0.6))], NOW).score!;
  assert.ok(good > poor);
});

test('old outcomes count for less than recent ones', () => {
  const recent = scoreSource(src(outcomes(10, 1)), NOW).effectiveTotal;
  const old = scoreSource(src(outcomes(10, 1, { at: NOW - 3 * 365 * DAY })), NOW).effectiveTotal;
  assert.ok(Math.abs(old / recent - Math.pow(2, -(3 * 365 - 30) / 365)) < 1e-9);
});

test('one repeat client cannot manufacture a track record', () => {
  const oneClient = outcomes(50, 1, { counterparty: 'same' });
  assert.ok(Math.abs(scoreSource(src(oneClient), NOW).effectiveTotal - P.perCounterpartyCap * Math.pow(2, -30 / 365)) < 1e-9);
});

test('deal value weighs concavely: ten times the value is not ten times the weight', () => {
  const small = scoreSource(src(outcomes(1, 1, { valueUsd: 100 })), NOW).effectiveTotal;
  const large = scoreSource(src(outcomes(1, 1, { valueUsd: 1000 })), NOW).effectiveTotal;
  assert.ok(large > small && large < 4 * small);
});

test('the better-verified record carries more weight in the blend', () => {
  const good = outcomes(100, 1);
  const mixed = outcomes(100, 0.5);
  const goodVerified = externalReputation(
    [{ source: 'a', verification: 'partner', outcomes: good }, { source: 'b', verification: 'user_proof', outcomes: mixed }],
    NOW,
  ).score!;
  const mixedVerified = externalReputation(
    [{ source: 'a', verification: 'user_proof', outcomes: good }, { source: 'b', verification: 'partner', outcomes: mixed }],
    NOW,
  ).score!;
  assert.ok(goodVerified > mixedVerified, `${goodVerified} > ${mixedVerified}`);
});

test('deterministic and independent of input order', () => {
  const a = src(outcomes(40, 0.9));
  const b = { ...src(outcomes(12, 1)), source: 'ebay' };
  const r1 = externalReputation([a, b], NOW);
  const r2 = externalReputation([b, { ...a, outcomes: [...a.outcomes].reverse() }], NOW);
  assert.equal(r1.score, r2.score);
  assert.ok(r1.score! >= 0 && r1.score! <= 1);
});

test('imported weight starts at the cap and fades as Karwan deals settle', () => {
  assert.equal(importedFactorWeight(0), P.maxImportedWeight);
  assert.ok(Math.abs(importedFactorWeight(10) - P.maxImportedWeight / Math.E) < 1e-12);
  assert.ok(importedFactorWeight(30) < importedFactorWeight(10));
  assert.equal(importedFactorWeight(-5), P.maxImportedWeight);
});
