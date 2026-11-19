import assert from 'node:assert/strict';
import test from 'node:test';
import { answersFromProfile, initialSetup, setupReducer, type SetupState } from './setupMachine';

/// Moving through setup (view 39, 19 Nov): back never loses an answer, an
/// unreadable price returns to the first step once, and Change from the
/// summary returns there.
///
///   npx tsx --test features/setup/setupMachine.test.ts

const run = (state: SetupState, ...events: Parameters<typeof setupReducer>[1][]) => events.reduce(setupReducer, state);

test('setup opens on what brings you, with the time it started and both ways to reach', () => {
  const s = initialSetup(5_000, 'NG');
  assert.equal(s.step, 'role');
  assert.equal(s.answers.startedAt, 5_000);
  assert.equal(s.answers.reach, 'both');
  assert.deepEqual(s.answers.place, { country: 'NG' });
});

test('Next does nothing until the step is answered', () => {
  const s = run(initialSetup(0, 'NG'), { type: 'next' });
  assert.equal(s.step, 'role');
});

test('back from where you are keeps the line', () => {
  const s = run(
    initialSetup(0, 'NG'),
    { type: 'role', role: 'sell' },
    { type: 'line', side: 'sell', value: 'Logo design, 20 to 40 USDC, 3 days' },
    { type: 'next' },
    { type: 'back' },
  );
  assert.equal(s.step, 'role');
  assert.equal(s.answers.sellLine, 'Logo design, 20 to 40 USDC, 3 days');
});

test('a new country clears the town picked for the old one', () => {
  const s = run(
    initialSetup(0, 'NG'),
    { type: 'place', place: { country: 'NG', city: 'Lagos', point: { lat: 6.5, lng: 3.4 } } },
    { type: 'country', country: 'GH' },
  );
  assert.deepEqual(s.answers.place, { country: 'GH' });
});

test('an unreadable price returns to the first step once', () => {
  const s = run(
    initialSetup(0, 'NG'),
    { type: 'role', role: 'sell' },
    { type: 'line', side: 'sell', value: 'Logo design' },
    { type: 'next' },
    { type: 'place', place: { country: 'NG', city: 'Lagos' } },
    { type: 'next' },
    { type: 'read', lines: [], needs: ['price'] },
  );
  assert.equal(s.step, 'role');
  assert.equal(s.answers.retried, true);
});

test('Change from the summary returns to the summary after reading again', () => {
  let s = run(initialSetup(0, 'NG'), { type: 'resume', answers: { role: 'buy', buyLine: 'Rice', place: { country: 'NG', city: 'Kano' }, reach: 'email' }, lines: ['a'] });
  assert.equal(s.step, 'summary');
  s = run(s, { type: 'goto', step: 'where' });
  assert.equal(s.fromSummary, true);
  s = run(s, { type: 'next' });
  assert.equal(s.step, 'reading');
  assert.equal(run(run(s, { type: 'read', lines: ['b'], needs: [] })).step, 'summary');
});

test('saved answers come back from the profile', () => {
  const a = answersFromProfile({
    goals: ['work', 'buy'],
    ownWords: { what: 'Logo design', price: '20 to 40 USDC', buy: 'Rice' },
    location: { country: 'NG', city: 'Lagos', area: null },
    settings: { notifyVia: 'telegram' },
  });
  assert.deepEqual(a, { role: 'both', sellLine: 'Logo design, 20 to 40 USDC', buyLine: 'Rice', place: { country: 'NG', city: 'Lagos' }, reach: 'telegram' });
  assert.deepEqual(answersFromProfile(null), {});
});
