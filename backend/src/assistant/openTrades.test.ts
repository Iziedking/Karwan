import assert from 'node:assert/strict';
import test from 'node:test';
import type { Contest } from '../db/contests.js';
import type { Engagement } from '../db/engagements.js';
import type { WorkRequest } from '../db/workRequests.js';
import { contestLines, workLines } from './openTrades.js';

const ME = '0x1111111111111111111111111111111111111111';
const contest = (id: string, status: Contest['status']) =>
  ({ id, title: `Contest ${id}`, prizeMicros: '300000000', status, entriesBy: Date.UTC(2026, 10, 27), createdAt: 1 }) as Contest;
const work = (id: string, status: WorkRequest['status']) =>
  ({ id, kind: 'hourly', title: `Work ${id}`, maxRateMicros: '10000000', startsAt: Date.UTC(2026, 10, 30), status, createdAt: 1 }) as WorkRequest;

test('contests: open ones you posted, and every one you entered with whether it is decided', () => {
  const out = contestLines([contest('a', 'open'), contest('b', 'awarded')], [contest('c', 'open'), contest('d', 'awarded')]);
  assert.deepEqual(out.posted.map((c) => [c.id, c.prizeUsdc, c.entriesClose, c.link]), [['a', 300, '2026-11-27', '/contests/a']]);
  assert.deepEqual(out.entered.map((c) => [c.id, c.decided]), [['c', false], ['d', true]]);
});

test('work: open work you posted, work you offered on, and work under way on either side', () => {
  const engagements = [
    { id: 'w1', kind: 'monthly', title: 'Books', rateMicros: '50000000', hirer: ME, status: 'active' },
    { id: 'w2', kind: 'hourly', title: 'Design', rateMicros: '8000000', hirer: '0x2222222222222222222222222222222222222222', status: 'offered' },
    { id: 'w3', kind: 'hourly', title: 'Old', rateMicros: '8000000', hirer: ME, status: 'closed' },
  ] as Engagement[];
  const out = workLines([work('r1', 'open'), work('r2', 'hired')], [work('r3', 'open')], engagements, ME);
  assert.deepEqual(out.posted.map((r) => [r.id, r.mostUsdc, r.link]), [['r1', 10, '/work/requests/r1']]);
  assert.deepEqual(out.offered.map((r) => r.id), ['r3']);
  assert.deepEqual(out.underWay.map((e) => [e.id, e.youAre, e.rateUsdc]), [['w1', 'hirer', 50], ['w2', 'worker', 8]]);
});
