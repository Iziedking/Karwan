import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSetup, setupReducer, type SetupState } from './setupMachine';

/// Moving through the setup conversation: back never loses an answer, skip
/// leaves it empty, an unreadable price is asked once more.
///
///   npx tsx --test features/setup/setupMachine.test.ts

const run = (state: SetupState, ...events: Parameters<typeof setupReducer>[1][]) => events.reduce(setupReducer, state);

test('back from price returns to what, with the answer kept', () => {
  const s = run(initialSetup(), { type: 'start' }, { type: 'toggleGoal', goal: 'work' }, { type: 'next' }, { type: 'answer', step: 'what', value: 'Logo design' }, { type: 'next' }, { type: 'back' });
  assert.equal(s.step, 'what');
  assert.equal(s.answers.what, 'Logo design');
});

test('skip leaves the answer empty and moves on', () => {
  const s = run(initialSetup(), { type: 'start' }, { type: 'toggleGoal', goal: 'work' }, { type: 'next' }, { type: 'answer', step: 'what', value: 'x' }, { type: 'skip' });
  assert.equal(s.step, 'price');
  assert.equal(s.answers.what, undefined);
});

test('an unreadable price goes back to the price question once', () => {
  const at = { ...initialSetup(), step: 'reading' as const, answers: { goals: ['work' as const], price: 'depends' } };
  const s = setupReducer(at, { type: 'read', lines: [], needs: ['price'] });
  assert.equal(s.step, 'price');
  assert.equal(s.answers.retried, true);
});

test('a clean reading shows the summary', () => {
  const at = { ...initialSetup(), step: 'reading' as const };
  const s = setupReducer(at, { type: 'read', lines: ['Your agent offers Logo design'], needs: [] });
  assert.equal(s.step, 'summary');
  assert.deepEqual(s.lines, ['Your agent offers Logo design']);
});

test('change something goes back to the goals with every answer kept', () => {
  const at = { ...initialSetup(), step: 'summary' as const, answers: { goals: ['work' as const], what: 'Logo design', reach: 'email' as const } };
  const s = setupReducer(at, { type: 'edit' });
  assert.equal(s.step, 'goals');
  assert.equal(s.answers.what, 'Logo design');
  assert.equal(s.answers.reach, 'email');
});

test('with every goal turned off the next question is how the agent works', () => {
  const s = run(initialSetup(), { type: 'start' }, { type: 'toggleGoal', goal: 'work' }, { type: 'toggleGoal', goal: 'work' }, { type: 'next' });
  assert.deepEqual(s.answers.goals, []);
  assert.equal(s.step, 'own');
});

test('a choice picked is kept', () => {
  const s = run({ ...initialSetup(), step: 'reach' }, { type: 'pick', step: 'reach', value: 'telegram' });
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
