import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeLockedUntil, lastCodeStep, recordCode, CODE_LOCK_MS } from './deskSignIn.js';
import { teamDatabaseUrl } from './teamClient.js';

const MIN = 60_000;
// The store drops entries by the real clock, so times start from now.
const T0 = Date.now();

test('the team list reads the team database first, then the server\'s own', () => {
  assert.equal(teamDatabaseUrl({ TEAM_DATABASE_URL: 'postgres://team', DATABASE_URL: 'postgres://own' }), 'postgres://team');
  assert.equal(teamDatabaseUrl({ DATABASE_URL: 'postgres://own' }), 'postgres://own');
  assert.equal(teamDatabaseUrl({}), undefined);
});

test('the fifth wrong code locks that email for 15 minutes', () => {
  const now = T0 + 10 * MIN;
  for (let i = 0; i < 4; i++) assert.deepEqual(recordCode('a@x.com', 'm-a', false, null, now + i), { locked: false });
  assert.deepEqual(recordCode('a@x.com', 'm-a', false, null, now + 5), { locked: true });
  assert.equal(CODE_LOCK_MS, 15 * MIN);
  assert.equal(codeLockedUntil('a@x.com', now + 6), now + 5 + 15 * MIN);
  assert.equal(codeLockedUntil('a@x.com', now + 5 + 15 * MIN + 1), null);
});

test('after the lock, the count starts again', () => {
  const now = T0 + 100 * MIN;
  for (let i = 0; i < 5; i++) recordCode('b@x.com', 'm-b', false, null, now);
  const later = now + 16 * MIN;
  assert.deepEqual(recordCode('b@x.com', 'm-b', false, null, later), { locked: false });
});

test('a right code clears the wrong ones and keeps its step', () => {
  const now = T0 + 200 * MIN;
  for (let i = 0; i < 4; i++) recordCode('c@x.com', 'm-c', false, null, now);
  assert.deepEqual(recordCode('c@x.com', 'm-c', true, 41_000_000, now), { locked: false });
  assert.equal(lastCodeStep('m-c', now), 41_000_000);
  for (let i = 0; i < 4; i++) assert.deepEqual(recordCode('c@x.com', 'm-c', false, null, now + 1), { locked: false });
  assert.equal(lastCodeStep('m-other', now), undefined);
});
