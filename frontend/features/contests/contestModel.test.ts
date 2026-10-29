import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContestView } from '@/core/api';
import { contestScreen, microsToUsdc, picksReady } from './contestModel';

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
