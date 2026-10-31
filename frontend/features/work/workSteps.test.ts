import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContestView, WorkWeekView } from '@/core/api';
import { workSteps } from './workSteps';
import { contestSteps } from '../contests/contestSteps';

/// Hourly work and contests on the deal page's steps (view 44, section 6).
///
///   npx tsx --test features/work/workSteps.test.ts

const NOW = Date.UTC(2026, 10, 1);
const DAY = 86_400_000;
const week = (over: Partial<WorkWeekView> = {}) => ({
  k: 0, fundedMicros: '90000000', loggedMinutes: 0, approvedMinutes: 0, objectedMinutes: 0, log: [], status: 'funded',
  start: NOW - 6 * DAY, end: NOW + DAY, logBy: NOW + 2 * DAY, reviewBy: NOW + 7 * DAY, ...over,
}) as WorkWeekView;
const states = (steps: Array<{ key: string; state: string }>) => steps.map((s) => `${s.key}:${s.state}`);

test('a week is Paid in, Hours sent, Paid out', () => {
  assert.deepEqual(states(workSteps(week())), ['paidIn:done', 'hoursSent:current', 'paidOut:upcoming']);
  assert.deepEqual(states(workSteps(week({ status: 'logged', loggedMinutes: 1080, logBy: NOW - DAY }))), ['paidIn:done', 'hoursSent:done', 'paidOut:current']);
  assert.deepEqual(states(workSteps(week({ status: 'objected', loggedMinutes: 60 }))), ['paidIn:done', 'hoursSent:done', 'paidOut:current']);
  assert.deepEqual(states(workSteps(week({ status: 'settled' }))), ['paidIn:done', 'hoursSent:done', 'paidOut:done']);
});

const contest = (over: Partial<ContestView> = {}) => ({
  id: 'c1', title: 'Logo', brief: 'b', tags: [], prizeMicros: '250000000', feeBps: 100, shares: [60, 40], entriesBy: NOW + DAY, awardBy: NOW + 5 * DAY,
  status: 'open', entries: 3, ...over,
}) as ContestView;

test('a contest is Prize in, Entries, Winners, Paid out', () => {
  assert.deepEqual(states(contestSteps(contest(), NOW)), ['prizeIn:done', 'entries:current', 'winners:upcoming', 'paidOut:upcoming']);
  assert.deepEqual(states(contestSteps(contest({ status: 'awarding', entriesBy: NOW - DAY }), NOW)), ['prizeIn:done', 'entries:done', 'winners:current', 'paidOut:upcoming']);
  assert.deepEqual(states(contestSteps(contest({ status: 'awarded', entriesBy: NOW - DAY }), NOW)), ['prizeIn:done', 'entries:done', 'winners:done', 'paidOut:done']);
  assert.deepEqual(states(contestSteps(contest({ status: 'opening' }), NOW)), ['prizeIn:current', 'entries:upcoming', 'winners:upcoming', 'paidOut:upcoming']);
  assert.deepEqual(states(contestSteps(contest({ status: 'returned' }), NOW)), ['prizeIn:done', 'cancelled:done', 'refunded:done']);
});
