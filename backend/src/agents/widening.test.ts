import assert from 'node:assert/strict';
import test from 'node:test';
import type { Mandate, MandatePatch } from './mandate.js';
import { widens } from './widening.js';

const RULES = { perDeal: { usdc: 30 }, perWeek: { usdc: 90 }, perDay: 3, who: 'record' as const };
const set: Pick<Mandate, 'lock'> = { lock: RULES };
const unset: Pick<Mandate, 'lock'> = { lock: null };
const rules = (p: Omit<Extract<MandatePatch, { part: 'lock-rules' }>, 'part'>): MandatePatch => ({ part: 'lock-rules', ...p });

test('every change that lets the agent lock more is a widening', () => {
  assert.equal(widens(set, { part: 'switch', name: 'lock', on: true }), true);
  assert.equal(widens(set, rules({ on: true })), true);
  assert.equal(widens(set, rules({ perDealUsdc: 30.000001 })), true);
  assert.equal(widens(set, rules({ perWeekUsdc: 91 })), true);
  assert.equal(widens(set, rules({ perDay: 4 })), true);
  assert.equal(widens(set, rules({ who: 'anyone' })), true);
  assert.equal(widens({ lock: { ...RULES, who: 'verified' } }, rules({ who: 'record' })), true);
  assert.equal(widens({ lock: { ...RULES, who: 'verified' } }, rules({ who: 'anyone' })), true);
});

test('lowering, narrowing and turning off are never a widening', () => {
  assert.equal(widens(set, { part: 'switch', name: 'lock', on: false }), false);
  assert.equal(widens(set, rules({ perDealUsdc: 29.999999 })), false);
  assert.equal(widens(set, rules({ perWeekUsdc: 60 })), false);
  assert.equal(widens(set, rules({ perDay: 1 })), false);
  assert.equal(widens(set, rules({ who: 'verified' })), false);
  assert.equal(widens(set, rules({ perDealUsdc: 30, perWeekUsdc: 90, perDay: 3, who: 'record' })), false, 'the same figures again');
});

test('one figure down does not hide another going up', () => {
  assert.equal(widens(set, rules({ perDealUsdc: 10, perWeekUsdc: 500 })), true);
  assert.equal(widens(set, rules({ perDay: 1, who: 'anyone' })), true);
});

test('limits set for the first time are a widening, even with Lock money off', () => {
  assert.equal(widens(unset, rules({ perDealUsdc: 30, perWeekUsdc: 90 })), true);
  assert.equal(widens(unset, rules({ perDealUsdc: 30 })), false, 'half a rule is refused before it is asked about');
});

test('no other switch or part is a widening', () => {
  for (const name of ['offers', 'bargain', 'agree', 'find', 'data', 'brief'] as const) {
    assert.equal(widens(set, { part: 'switch', name, on: true }), false, name);
  }
  assert.equal(widens(set, { part: 'resume' }), false);
  assert.equal(widens(set, { part: 'power', on: true }), false);
  assert.equal(widens(set, { part: 'weekly-limit', usdc: 5 }), false);
  assert.equal(widens(set, { part: 'alone', mode: 'agree' }), false);
});
