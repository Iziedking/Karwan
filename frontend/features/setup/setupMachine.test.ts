import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSetup, setupReducer, type SetupState } from './setupMachine';

/// Moving through the setup conversation: back never loses an answer, an
/// unreadable price is asked once more, and Change from the summary returns
/// there.
///
///   npx tsx --test features/setup/setupMachine.test.ts

const run = (state: SetupState, ...events: Parameters<typeof setupReducer>[1][]) => events.reduce(setupReducer, state);

test('setup opens on the goals question', () => {
  assert.equal(initialSetup().step, 'goals');
});

test('back from clients and reach returns to the work, with the answers kept', () => {
  const s = run(
    initialSetup(),
    { type: 'toggleGoal', goal: 'work' },
    { type: 'next' },
    { type: 'answer', step: 'what', value: 'Logo design' },
    { type: 'answer', step: 'price', value: '20 to 40 USDC, 3 days' },
    { type: 'next' },
    { type: 'back' },
  );
  assert.equal(s.step, 'work');
  assert.equal(s.answers.what, 'Logo design');
  assert.equal(s.answers.price, '20 to 40 USDC, 3 days');
});

test('leaving clients and reach fills in what was not asked', () => {
  const s = run(initialSetup(), { type: 'toggleGoal', goal: 'work' }, { type: 'next' }, { type: 'next' }, { type: 'next' });
  assert.equal(s.step, 'reading');
  assert.equal(s.answers.paid, 'one_time');
  assert.equal(s.answers.own, 'offers');
});

test('an unreadable price goes back to the work question once', () => {
  const at = { ...initialSetup(), step: 'reading' as const, answers: { goals: ['work' as const], price: 'depends' } };
  const s = setupReducer(at, { type: 'read', lines: [], needs: ['price'] });
  assert.equal(s.step, 'work');
  assert.equal(s.answers.retried, true);
});

test('a clean reading shows the summary', () => {
  const at = { ...initialSetup(), step: 'reading' as const };
  const s = setupReducer(at, { type: 'read', lines: ['Your agent offers Logo design'], needs: [] });
  assert.equal(s.step, 'summary');
  assert.deepEqual(s.lines, ['Your agent offers Logo design']);
});

test('change from the summary reads again on Next and returns without reading on Back', () => {
  const at = { ...initialSetup(), step: 'summary' as const, answers: { goals: ['work' as const], own: 'offers' as const } };
  const changed = run(at, { type: 'goto', step: 'own' }, { type: 'pick', step: 'own', value: 'ask' }, { type: 'next' });
  assert.equal(changed.step, 'reading');
  assert.equal(changed.answers.own, 'ask');
  assert.equal(changed.fromSummary, false);
  const left = run(at, { type: 'goto', step: 'paid' }, { type: 'back' });
  assert.equal(left.step, 'summary');
});

test('change something goes back to the goals with every answer kept', () => {
  const at = { ...initialSetup(), step: 'summary' as const, answers: { goals: ['work' as const], what: 'Logo design', reach: 'email' as const } };
  const s = setupReducer(at, { type: 'edit' });
  assert.equal(s.step, 'goals');
  assert.equal(s.answers.what, 'Logo design');
  assert.equal(s.answers.reach, 'email');
});

test('with every goal turned off the next question is how we reach them', () => {
  const s = run(initialSetup(), { type: 'toggleGoal', goal: 'work' }, { type: 'toggleGoal', goal: 'work' }, { type: 'next' });
  assert.deepEqual(s.answers.goals, []);
  assert.equal(s.step, 'contact');
});

test('a choice picked is kept', () => {
  const s = run({ ...initialSetup(), step: 'contact' }, { type: 'pick', step: 'reach', value: 'telegram' });
  assert.equal(s.answers.reach, 'telegram');
});

test('change from Me starts from what was saved', async () => {
  const { answersFromProfile } = await import('./setupMachine');
  const answers = answersFromProfile({
    goals: ['work'],
    ownWords: { what: 'Logo design', price: '20 to 40 USDC' },
    agentPrefs: { findClients: false, agentMode: 'ask' },
    settings: { notifyVia: 'email' },
    workPlaces: 'Instagram',
  });
  assert.deepEqual(answers, { goals: ['work'], what: 'Logo design', price: '20 to 40 USDC', places: 'Instagram', clients: 'own', own: 'ask', reach: 'email' });
  assert.deepEqual(answersFromProfile(null), { goals: [] });
});
