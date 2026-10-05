import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealView } from '@/core/api';
import { latestLines, timelineRows } from './timeline';

type Progress = DealView['progress'];
const steps = (current: number, at: Record<string, number> = {}): Progress =>
  (['agreed', 'funded', 'delivered', 'checked', 'released'] as const).map((step, i) => ({
    step,
    state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
    ...(at[step] ? { at: at[step] } : {}),
  }));

test('every step is named and done steps keep their time', () => {
  const rows = timelineRows(steps(2, { agreed: 10, funded: 20 }), { viewerIsBuyer: true, check: null, dueAt: 99 });
  assert.deepEqual(rows.map((r) => [r.step, r.state, r.kind]), [
    ['agreed', 'done', 'label'],
    ['funded', 'done', 'label'],
    ['delivered', 'current', 'working'],
    ['checked', 'upcoming', 'label'],
    ['released', 'upcoming', 'label'],
  ]);
  assert.equal(rows[1].at, 20);
  assert.equal(rows[2].dueAt, 99);
});

test('the seller sees their own move, and a running check is its own moment', () => {
  assert.equal(timelineRows(steps(2), { viewerIsBuyer: false, check: null, dueAt: null })[2].kind, 'deliver');
  assert.equal(timelineRows(steps(3), { viewerIsBuyer: true, check: 'checking', dueAt: null })[3].kind, 'checking');
  assert.equal(timelineRows(steps(3), { viewerIsBuyer: true, check: 'passed', dueAt: null })[3].kind, 'label');
});

test('the latest feed is newest first and three lines long', () => {
  const msgs = [1, 2, 3, 4].map((n) => ({ id: String(n), ts: n, body: `m${n}` }));
  assert.deepEqual(latestLines(msgs).map((m) => m.id), ['4', '3', '2']);
});
