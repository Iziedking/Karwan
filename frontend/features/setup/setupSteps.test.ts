import assert from 'node:assert/strict';
import test from 'node:test';
import { aboutProgress, isQuestionStep, setupSteps, withDefaults } from './setupSteps';

/// The setup conversation asks only what a person's goals need (view 39).
///
///   npx tsx --test features/setup/setupSteps.test.ts

test('a freelancer is asked about their work, then clients and reach', () => {
  assert.deepEqual(setupSteps(['work']), ['goals', 'work', 'contact', 'reading', 'summary']);
});

test('buying with a record skips the selling question', () => {
  assert.deepEqual(setupSteps(['buy', 'record']), ['goals', 'buy', 'places', 'contact', 'reading', 'summary']);
});

test('no goal picked goes straight to how we reach them', () => {
  assert.deepEqual(setupSteps([]), ['goals', 'contact', 'reading', 'summary']);
});

test('a business is asked its name', () => {
  assert.ok(setupSteps(['business']).includes('business'));
});

test('the bar for About you only moves forward and ends full on the summary', () => {
  const steps = setupSteps(['work', 'buy']);
  const values = steps.map((s) => aboutProgress(steps, s));
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! > values[i - 1]!, `${steps[i]} is further than ${steps[i - 1]}`);
});

test('the reading and the summary are not questions', () => {
  assert.equal(isQuestionStep('goals'), true);
  assert.equal(isQuestionStep('contact'), true);
  assert.equal(isQuestionStep('reading'), false);
  assert.equal(isQuestionStep('summary'), false);
});

test('what was not asked starts from an answer the summary can change', () => {
  assert.deepEqual(withDefaults({ goals: ['work'] }), { goals: ['work'], paid: 'one_time', own: 'offers' });
  assert.deepEqual(withDefaults({ goals: ['sell'] }), { goals: ['sell'], paid: 'goods', own: 'offers' });
  assert.deepEqual(withDefaults({ goals: ['buy'] }), { goals: ['buy'], own: 'offers' });
  assert.deepEqual(withDefaults({ goals: ['work'], paid: 'milestones', own: 'ask' }), { goals: ['work'], paid: 'milestones', own: 'ask' });
});
