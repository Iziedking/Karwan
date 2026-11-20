import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { DisputeHearingView } from '@/core/api';
import { elapsed, hearingSignal, hearingSteps, outcome, timeLeft } from './hearingSteps';

const H = 3_600_000;
const OPENED = Date.UTC(2026, 9, 23, 12);
const base: DisputeHearingView = { step: 'answers', answersBy: OPENED + 72 * H, findingBy: OPENED + 108 * H, objectBy: null, askedAt: null, ruleBy: null };
const shown = (h: DisputeHearingView) => hearingSteps(h, OPENED).rows.map((r) => `${r.key}:${r.state}`);

test('while both sides answer: opened, answering now, then the finding and the time to object', () => {
  assert.deepEqual(shown(base), ['opened:done', 'answers:current', 'finding:upcoming', 'object:upcoming']);
  assert.deepEqual(hearingSteps(base, OPENED).countdown, { from: OPENED, to: OPENED + 72 * H });
});

test('while Karwan writes the finding, its due date is the countdown', () => {
  const h = { ...base, step: 'finding' as const };
  assert.deepEqual(shown(h), ['opened:done', 'answers:done', 'finding:current', 'object:upcoming']);
  assert.deepEqual(hearingSteps(h, OPENED).countdown, { from: OPENED, to: OPENED + 108 * H });
});

test('in the time to object the route moves on to the payout, and the countdown is the 72 hours', () => {
  const objectBy = OPENED + 200 * H;
  const h = { ...base, step: 'object' as const, objectBy };
  assert.deepEqual(shown(h), ['answers:done', 'finding:done', 'object:current', 'paid:upcoming']);
  assert.deepEqual(hearingSteps(h, OPENED).countdown, { from: objectBy - 72 * H, to: objectBy });
});

test('once asked, people decide by the escrow date and the route says so', () => {
  const h = { ...base, step: 'people' as const, askedAt: OPENED + 120 * H, ruleBy: OPENED + 240 * H };
  assert.deepEqual(shown(h), ['finding:done', 'asked:done', 'people:current', 'paid:upcoming']);
  assert.deepEqual(hearingSteps(h, OPENED).countdown, { from: OPENED + 120 * H, to: OPENED + 240 * H });
  assert.equal(hearingSteps({ ...h, askedAt: null, ruleBy: null }, OPENED).countdown, null);
});

test('the bar fills with the time passed and never past either end', () => {
  const c = { from: 0, to: 100 };
  assert.equal(elapsed(c, 25), 0.25);
  assert.equal(elapsed(c, -5), 0);
  assert.equal(elapsed(c, 500), 1);
});

test('time left reads in days, then in hours on the last day', () => {
  assert.deepEqual(timeLeft(50 * H, 0), { days: 2 });
  assert.deepEqual(timeLeft(25 * H, 0), { days: 1 });
  assert.deepEqual(timeLeft(5.5 * H, 0), { hours: 6 });
  assert.deepEqual(timeLeft(0, 10), { hours: 1 });
});

test('who the finding pays reads from the viewer side', () => {
  assert.equal(outcome(10_000, false), 'toYou');
  assert.equal(outcome(10_000, true), 'toThem');
  assert.equal(outcome(0, true), 'backToYou');
  assert.equal(outcome(0, false), 'backToThem');
  assert.equal(outcome(6_000, true), 'split');
});

test('the closed card names the step now and its date, and opens itself only when the person has something to do', () => {
  assert.deepEqual(hearingSignal(base, false, OPENED), { key: 'youAnswer', at: base.answersBy, needsYou: true });
  assert.deepEqual(hearingSignal(base, true, OPENED), { key: 'theyAnswer', at: base.answersBy, needsYou: false });
  assert.deepEqual(hearingSignal({ ...base, step: 'finding' }, true, OPENED), { key: 'finding', at: base.findingBy, needsYou: false });
  const objectBy = OPENED + 200 * H;
  assert.deepEqual(hearingSignal({ ...base, step: 'object', objectBy }, true, objectBy - H), { key: 'object', at: objectBy, needsYou: true });
  assert.equal(hearingSignal({ ...base, step: 'object', objectBy }, true, objectBy + H).needsYou, false);
  const people = { ...base, step: 'people' as const, askedAt: OPENED + 120 * H, ruleBy: OPENED + 240 * H };
  assert.deepEqual(hearingSignal(people, true, OPENED), { key: 'people', at: people.ruleBy, needsYou: false });
  assert.equal(hearingSignal({ ...people, ruleBy: null }, true, OPENED).at, null);
});
