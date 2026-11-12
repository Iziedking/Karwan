import assert from 'node:assert/strict';
import test from 'node:test';
import { homeFor, lagosMidnight, type HomeFacts } from './deskHome.js';

///   npx tsx --test src/ops/deskHome.test.ts

const NOW = Date.UTC(2026, 10, 12, 13, 0); // 14:00 in Lagos
const MIN = 60_000;
const MIDNIGHT = Date.UTC(2026, 10, 11, 23, 0);

const ada = { id: 'm-ada', name: 'Ada Obi', email: 'ada@karwan.site', role: 'support' };
const tobi = { id: 'm-tobi', name: 'Tobi Martins', email: 'tobi@karwan.site', role: 'ops' };
const kemi = { id: 'm-kemi', name: 'Kemi Eze', email: 'kemi@karwan.site', role: 'ops' };

const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  now: NOW,
  callerId: 'm-ada',
  requests: [
    { id: 'r1', label: 'Retry a payout', method: 'POST', path: '/api/admin/deals/0x999/release', status: 'pending', requestedAt: NOW - 14 * MIN, expiresAt: NOW + 20 * 60 * MIN, requestedBy: { memberId: 'm-tobi', name: 'Tobi Martins', email: null } },
    { id: 'r2', label: 'Release deal funds', method: 'POST', path: '/api/admin/deals/0xabc/release', status: 'pending', requestedAt: NOW - 30 * MIN, expiresAt: NOW + 20 * 60 * MIN, requestedBy: { memberId: 'm-ada', name: 'Ada Obi', email: null } },
    { id: 'r3', label: 'Old one', method: 'POST', path: '/api/admin/deals/0xdef/release', status: 'pending', requestedAt: NOW - 30 * 60 * MIN, expiresAt: NOW - MIN, requestedBy: { memberId: 'm-tobi', name: 'Tobi Martins', email: null } },
  ],
  cases: [
    { ref: 'KS-1038', kind: 'transfer_missing', state: 'open', email: 'ibrahim@example.com', dueAt: NOW - 10 * MIN, createdAt: NOW - 130 * MIN, assignee: 'm-ada' },
    { ref: 'KS-1040', kind: 'account', state: 'open', dueAt: NOW + 30 * MIN, createdAt: NOW - 90 * MIN, firstRepliedAt: NOW - 50 * MIN, assignee: 'm-ada' },
    { ref: 'KS-1041', kind: 'other', state: 'open', dueAt: NOW - 5 * MIN, createdAt: NOW - 125 * MIN, firstRepliedAt: NOW - 100 * MIN, assignee: 'm-tobi' },
    { ref: 'KS-1001', kind: 'other', state: 'solved', dueAt: NOW - 780 * MIN, createdAt: NOW - 900 * MIN, firstRepliedAt: NOW - 880 * MIN, assignee: 'm-ada' },
  ],
  deals: [
    { jobId: '0x7b2e000000000000000000000000000000000000000000000000000000091c4', buyer: '0xaaa', seller: '0xbbb', amountUsdc: '45', stage: 'disputed', createdAt: NOW - 3 * 24 * 60 * MIN },
    { jobId: '0x1', buyer: '0xccc', seller: '0xddd', amountUsdc: '100.5', stage: 'accepted', createdAt: NOW - 60 * MIN },
    { jobId: '0x2', buyer: '0xccc', seller: '0xddd', amountUsdc: '20', stage: 'open', createdAt: NOW - 30 * MIN },
    { jobId: '0x3', buyer: '0xccc', seller: '0xddd', amountUsdc: '7', stage: 'settled', createdAt: MIDNIGHT - MIN },
  ],
  accounts: [
    { createdAt: NOW - 10 * MIN, setupDone: true },
    { createdAt: MIDNIGHT + MIN, setupDone: false },
    { createdAt: MIDNIGHT - MIN, setupDone: true },
  ],
  system: [{ label: 'Website and app', state: 'working' }],
  rows: [
    { at: NOW - 5 * MIN, memberId: 'm-ada' },
    { at: NOW - 20 * MIN, memberId: 'm-kemi' },
    { at: NOW - 3 * MIN, memberId: 'm-ada' },
    { at: NOW - 45 * MIN, memberId: 'm-tobi' },
    { at: NOW - 2 * MIN, memberId: null },
  ],
  members: [ada, tobi, kemi],
  ...over,
});

test('midnight in Lagos is 23:00 UTC the day before', () => {
  assert.equal(lagosMidnight(NOW), MIDNIGHT);
  assert.equal(lagosMidnight(MIDNIGHT), MIDNIGHT);
  assert.equal(lagosMidnight(MIDNIGHT - 1), MIDNIGHT - 24 * 60 * MIN);
});

test('a support teammate sees late cases and the Support tile, and no System block', () => {
  const view = homeFor({ support: 'change' }, false, facts());
  assert.deepEqual(view.needsYou.map((n) => n.kind), ['late_case']);
  assert.equal(view.needsYou[0]!.title, 'KS-1038 · Transfer did not arrive');
  assert.equal(view.needsYou[0]!.line, 'ibrahim@example.com · past the 2-hour reply');
  assert.equal(view.needsYou[0]!.since, NOW - 10 * MIN);
  assert.deepEqual(view.today.map((t) => t.key), ['support']);
  assert.deepEqual(view.today[0], { key: 'support', count: 3, minutes: 33 });
  assert.equal(view.system, null);
});

test('approvals the caller asked for, expired ones, and ones off their pages are not in their Needs you', () => {
  const view = homeFor({ deals: 'fix', support: 'fix' }, false, facts());
  const approvals = view.needsYou.filter((n) => n.kind === 'approval');
  assert.deepEqual(approvals.map((n) => n.href), ['/admin/waiting']);
  assert.equal(approvals[0]!.title, 'Retry a payout');
  assert.equal(approvals[0]!.line, 'asked by Tobi Martins');
  const tobiView = homeFor({ support: 'fix' }, false, facts({ callerId: 'm-tobi' }));
  assert.deepEqual(tobiView.needsYou.filter((n) => n.kind === 'approval'), []);
});

test('the owner gets all four tiles, disputes to rule, and System; oldest waiting first', () => {
  const view = homeFor({}, true, facts({ callerId: 'm-owner' }));
  assert.deepEqual(view.today, [
    { key: 'accounts', count: 2, extra: 1 },
    { key: 'deals', count: 2, usdc: '120.5' },
    { key: 'held', count: 2, usdc: '145.5' },
    { key: 'support', count: 3, minutes: 33 },
  ]);
  assert.deepEqual(view.system, [{ label: 'Website and app', state: 'working' }]);
  assert.deepEqual(view.needsYou.map((n) => n.kind), ['dispute', 'approval', 'approval', 'late_case']);
  const dispute = view.needsYou[0]!;
  assert.equal(dispute.title, 'Rule on deal 0x7b2e…91c4');
  assert.equal(dispute.amountUsdc, '45');
  assert.deepEqual(view.counts, { waiting: 2, support: 3, disputes: 1 });
});

test('team on the desk: anyone with a desk row in the last 30 minutes, with their open cases', () => {
  const view = homeFor({}, true, facts());
  assert.deepEqual(view.onShift, [
    { name: 'Ada Obi', role: 'support', lastAt: NOW - 3 * MIN, openCases: 2 },
    { name: 'Kemi Eze', role: 'ops', lastAt: NOW - 20 * MIN, openCases: 0 },
  ]);
});
