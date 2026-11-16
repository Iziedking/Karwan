import assert from 'node:assert/strict';
import test from 'node:test';
import { newAgentRecord, type AgentRecord, type LockEntry } from './agentRecord.js';
import { mayLock } from './autopilotGate.js';
import { lockFacts, type LockFactsInput } from './lockFacts.js';
import { HELD_FOR_MS, heldFor, lockedThisWeekMicros, locksToday, microsOf, released, reserved, settled } from './lockLedger.js';

/// What an agent locked alone, counted against its person's limits (view 87).
///
///   npx tsx --test src/agents/lockLedger.test.ts

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16, 12);
const done = (at: number, usdc: number, jobId: string): LockEntry => ({ at, usdc, jobId, state: 'done' });

test('micros are exact', () => {
  assert.equal(microsOf(0.1) + microsOf(0.2), 300_000n);
  assert.equal(microsOf('42.5'), 42_500_000n);
  assert.equal(microsOf('31.2500009'), 31_250_000n);
});

test('the week counts the last seven days, held and finished', () => {
  const locks: LockEntry[] = [done(NOW - 8 * DAY, 50, '0xa'), done(NOW - 2 * DAY, 20, '0xb'), { at: NOW - 1000, usdc: 10, jobId: '0xc', state: 'held' }, { at: NOW - DAY, usdc: 5, jobId: '0xd' }];
  assert.equal(lockedThisWeekMicros(locks, NOW), 35_000_000n);
});

test('an amount held longer than a seller may take to answer is no longer counted', () => {
  const locks: LockEntry[] = [{ at: NOW - HELD_FOR_MS - 1, usdc: 10, jobId: '0xc', state: 'held' }];
  assert.equal(lockedThisWeekMicros(locks, NOW), 0n);
  assert.equal(locksToday(locks, NOW, 'UTC'), 0);
});

test('today is the day where the person lives', () => {
  // Lagos is an hour ahead of UTC: 22:30 UTC on the 15th is still the 15th
  // there, 23:30 UTC is already the 16th.
  const lateYesterday = Date.UTC(2026, 10, 15, 22, 30);
  const earlyToday = Date.UTC(2026, 10, 15, 23, 30);
  const locks = [done(lateYesterday, 1, '0xa'), done(earlyToday, 1, '0xb')];
  assert.equal(locksToday(locks, NOW, 'Africa/Lagos'), 1);
  assert.equal(locksToday(locks, NOW, 'UTC'), 0);
  assert.equal(locksToday(locks, NOW, 'Not/AZone'), 0, 'an unknown zone reads as UTC');
});

const withRules = (locks: LockEntry[] = []): AgentRecord => ({
  ...newAgentRecord('0xowner'),
  lock: { perDeal: { usdc: 50 }, perWeek: { usdc: 100 }, perDay: 3, who: 'record', locks },
});

test('holding, finishing and giving back', () => {
  let r = reserved(withRules([done(NOW - 9 * DAY, 5, '0xold')]), { at: NOW, usdc: 40, jobId: '0xJOB' });
  assert.deepEqual(r.lock?.locks, [{ at: NOW, usdc: 40, jobId: '0xjob', state: 'held' }], 'entries past a week are dropped');
  r = reserved(r, { at: NOW + 1, usdc: 42, jobId: '0xjob' });
  assert.equal(r.lock?.locks.length, 1, 'one entry for one request');
  assert.equal(heldFor(r, '0xJob')?.usdc, 42);
  assert.equal(released(settled(r, '0xjob'), '0xjob').lock?.locks[0]?.state, 'done', 'a finished lock is never given back');
  assert.deepEqual(released(r, '0xjob').lock?.locks, []);
  const none = newAgentRecord('0xowner');
  assert.equal(reserved(none, { at: NOW, usdc: 1, jobId: '0xj' }), none, 'no rules, nothing held');
});

const input = (over: Partial<LockFactsInput> = {}): LockFactsInput => ({
  serverOn: true, agentOn: true, lock: true, stopped: false, family: true,
  rules: withRules().lock!, totalUsdc: '42.42', agreedUsdc: '42', marketUsdc: 40, outlierPct: 40,
  timeZone: 'Africa/Lagos', seller: { verified: false, settledDeals: 2, upheldDisputes: 0 }, jobId: '0xjob', now: NOW,
  ...over,
});

test('the facts pass the gate when everything is inside the rules', () => {
  assert.deepEqual(mayLock(lockFacts(input())), { ok: true });
});

test('a request does not count against itself, and others do', () => {
  const own = withRules([{ at: NOW - 1000, usdc: 42.42, jobId: '0xjob', state: 'held' }]).lock!;
  assert.deepEqual(mayLock(lockFacts(input({ rules: own }))), { ok: true });
  const other = withRules([done(NOW - DAY, 60, '0xother')]).lock!;
  assert.deepEqual(mayLock(lockFacts(input({ rules: other }))), { ok: false, reason: 'over-week' });
  const three = withRules([done(NOW - 3000, 1, '0x1'), done(NOW - 2000, 1, '0x2'), done(NOW - 1000, 1, '0x3')]).lock!;
  assert.deepEqual(mayLock(lockFacts(input({ rules: three }))), { ok: false, reason: 'over-day' });
});

test('the fee is part of what is counted, and no market price means no outlier rule', () => {
  assert.deepEqual(mayLock(lockFacts(input({ totalUsdc: '50.01', agreedUsdc: '49.5' }))), { ok: false, reason: 'over-deal' });
  assert.deepEqual(mayLock(lockFacts(input({ marketUsdc: 20 }))), { ok: false, reason: 'price-outlier' });
  assert.deepEqual(mayLock(lockFacts(input({ marketUsdc: null }))), { ok: true });
  assert.deepEqual(mayLock(lockFacts(input({ rules: null }))), { ok: false, reason: 'switch-off' });
});
