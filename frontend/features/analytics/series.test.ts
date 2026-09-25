import assert from 'node:assert/strict';
import test from 'node:test';
import { compactUsdc, glanceUsdc, mondayOf, niceTicks, weekly } from './series.js';
import type { LifetimeDay } from '../../core/api.js';

function day(d: string, funded: string, deals = 1): LifetimeDay {
  return {
    day: d, deals, jobsPosted: 0, transactions: deals, financings: 0,
    fundedUsdc: funded, releasedUsdc: '0', settledUsdc: '0', refundedUsdc: '0', feesUsdc: '0',
    advancedUsdc: '0', repaidUsdc: '0', slashedUsdc: '0', stakedUsdc: '0', yieldUsdc: '0',
  };
}

test('weeks start on Monday, UTC', () => {
  assert.equal(mondayOf('2026-09-25'), '2026-09-21'); // Friday
  assert.equal(mondayOf('2026-09-21'), '2026-09-21'); // Monday
  assert.equal(mondayOf('2026-09-27'), '2026-09-21'); // Sunday
});

test('days fold into weeks, and a quiet week stays on the axis as zero', () => {
  const w = weekly([day('2026-09-01', '100.5'), day('2026-09-03', '20', 2), day('2026-09-17', '7')]);
  assert.deepEqual(w.map((p) => p.weekStart), ['2026-08-31', '2026-09-07', '2026-09-14']);
  assert.deepEqual(w.map((p) => p.fundedUsdc), [120.5, 0, 7]);
  assert.deepEqual(w.map((p) => p.deals), [3, 0, 1]);
});

test('no days, no weeks', () => {
  assert.deepEqual(weekly([]), []);
});

test('axis ticks start at zero, cover the maximum, and step evenly', () => {
  const t = niceTicks(3_730);
  assert.equal(t[0], 0);
  assert.ok(t[t.length - 1]! >= 3_730);
  assert.ok(t.length >= 3 && t.length <= 6);
  const step = t[1]! - t[0]!;
  t.forEach((v, i) => assert.equal(v, step * i));
});

test('money reads at a glance', () => {
  assert.equal(glanceUsdc(16874.27), '16,874');
  assert.equal(glanceUsdc(42.5), '42.50');
  assert.equal(glanceUsdc(0), '0');
  assert.equal(compactUsdc(1500), '1.5k');
  assert.equal(compactUsdc(20000), '20k');
});
