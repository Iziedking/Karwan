import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContestView } from '@/core/api';
import { SUGGESTED, canMark, contestPhase, contestScreen, equalShares, microsToUsdc, ownShares, picksReady, splitAmounts } from './contestModel';

/// The contest page (view 40): one next step for whoever is looking.

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const contest = (over: Partial<ContestView> = {}): ContestView => ({
  id: 'c_1', title: 'Best logo', brief: 'A bakery logo', tags: [], prizeMicros: '300000000', feeBps: 100, shares: [5000, 3000, 2000],
  entriesBy: NOW + 2 * DAY, awardBy: NOW + 9 * DAY, status: 'open', entries: 0, ...over,
});

test('amounts read as USDC without trailing zeros', () => {
  assert.equal(microsToUsdc('300000000'), '300');
  assert.equal(microsToUsdc('149250000'), '149.25');
  assert.equal(microsToUsdc('1500000'), '1.5');
});

test('a visitor signs in to enter; a seller enters while entries are open; then it closes', () => {
  assert.equal(contestScreen(contest(), { signedIn: false, now: NOW }).next, 'sign_in');
  assert.equal(contestScreen(contest(), { signedIn: true, now: NOW }).next, 'enter');
  assert.equal(contestScreen(contest({ myEntry: { id: 'e', note: '', status: 'in', previewUrl: '', files: 1 } }), { signedIn: true, now: NOW }).next, 'replace');
  assert.equal(contestScreen(contest(), { signedIn: true, now: NOW + 3 * DAY }).next, 'closed');
});

test('the buyer takes back an empty contest, and picks winners once there are entries', () => {
  assert.equal(contestScreen(contest({ mine: true, entryList: [] }), { signedIn: true, now: NOW }).next, 'take_back');
  const withEntries = contest({ mine: true, entries: 1, entryList: [{ id: 'e1', seller: '@ada', note: '', status: 'in', previewUrl: '', files: 1 }] });
  assert.equal(contestScreen(withEntries, { signedIn: true, now: NOW }).next, 'pick');
  assert.equal(contestScreen(withEntries, { signedIn: true, now: NOW + 10 * DAY }).next, 'none', 'past the date the prize goes back on its own');
  assert.equal(contestScreen({ ...withEntries, status: 'awarded' }, { signedIn: true, now: NOW }).next, 'none');
});

test('before entries close every place is filled; after, the first places are enough', () => {
  const c = contest({ mine: true });
  assert.equal(picksReady(c, ['e1', 'e2'], NOW), false);
  assert.equal(picksReady(c, ['e1', 'e2', 'e3'], NOW), true);
  assert.equal(picksReady(c, ['e1'], NOW + 3 * DAY), true);
  assert.equal(picksReady(c, [], NOW + 3 * DAY), false);
});

test('one to eight winners: every suggested and equal split shares the whole prize (view 88)', () => {
  for (let n = 1; n <= 8; n += 1) {
    assert.equal(SUGGESTED[n]!.reduce((a, b) => a + b, 0), 10_000);
    assert.equal(equalShares(n).reduce((a, b) => a + b, 0), 10_000);
  }
  assert.deepEqual(equalShares(3), [3334, 3333, 3333]);
  assert.deepEqual(splitAmounts(450, SUGGESTED[3]!), [225, 135, 90]);
});

test('my own amounts must add up to the prize; the screen says what is left or over', () => {
  assert.deepEqual(ownShares([150, 100, 80, 70, 50], 450), { shares: [3335, 2222, 1777, 1555, 1111], left: 0 });
  assert.equal(ownShares([150, 100, 80, 50, 50], 450).shares, null);
  assert.equal(ownShares([150, 100, 80, 50, 50], 450).left, 20);
  assert.equal(ownShares([200, 300], 450).left, -50);
  assert.equal(ownShares([450, null], 450).shares, null, 'every place needs an amount');
  assert.notEqual(ownShares([111.432201, 338.567799], 450).shares, null, 'a naira figure turned to USDC still adds up');
});

test('a contest that protects entrants says where it stands, and the buyer picks and marks through the wait', () => {
  const c = contest({ protects: true, payoutFrom: NOW + 12 * DAY });
  assert.deepEqual(contestPhase(c, NOW), { phase: 'entries', daysLeft: 2 });
  assert.deepEqual(contestPhase(c, NOW + 3 * DAY), { phase: 'judging', daysLeft: 6 });
  assert.deepEqual(contestPhase(c, NOW + 10 * DAY), { phase: 'waiting', daysLeft: 2 });
  assert.deepEqual(contestPhase({ ...c, status: 'awarded', auto: true }, NOW + 13 * DAY), { phase: 'paidEarliest', daysLeft: 0 });
  assert.equal(contestPhase(contest(), NOW), null, 'older contests keep their old page');
  const mine = { ...c, mine: true, entryList: [{ id: 'e1', seller: '@ada', note: '', status: 'in' as const, previewUrl: '', files: 1 }] };
  assert.equal(contestScreen(mine, { signedIn: true, now: NOW + 10 * DAY }).next, 'pick', 'still picking in the wait');
  assert.equal(contestScreen(mine, { signedIn: true, now: NOW + 12 * DAY }).next, 'none');
  assert.equal(canMark(mine, NOW + 10 * DAY), true);
  assert.equal(canMark(mine, NOW + 12 * DAY), false);
  assert.equal(canMark({ ...mine, protects: false }, NOW), false);
});
