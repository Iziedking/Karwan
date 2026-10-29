import assert from 'node:assert/strict';
import test from 'node:test';
import { isQuestionStep, questionProgress, setupSteps } from './setupSteps';

/// The setup conversation asks only what a person's goals need.
///
///   npx tsx --test features/setup/setupSteps.test.ts

test('a freelancer is asked about their work and price', () => {
  assert.deepEqual(setupSteps(['work']), ['welcome', 'goals', 'what', 'price', 'paid', 'clients', 'own', 'reach', 'where', 'reading', 'summary']);
});

test('buying with a record skips the selling questions', () => {
  assert.deepEqual(setupSteps(['buy', 'record']), ['welcome', 'goals', 'buy', 'places', 'clients', 'own', 'reach', 'where', 'reading', 'summary']);
});

test('no goal picked goes straight to how the agent works', () => {
  assert.deepEqual(setupSteps([]), ['welcome', 'goals', 'own', 'reach', 'where', 'reading', 'summary']);
});

test('a business is asked its name', () => {
  assert.ok(setupSteps(['business']).includes('business'));
});

test('progress counts the questions after the goals', () => {
  const steps = setupSteps(['work']);
  assert.equal(questionProgress(steps, 'welcome'), null);
  assert.equal(questionProgress(steps, 'goals'), null);
  assert.deepEqual(questionProgress(steps, 'what'), { index: 1, total: 7 });
  assert.deepEqual(questionProgress(steps, 'where'), { index: 7, total: 7 });
  assert.equal(questionProgress(steps, 'summary'), null);
});

test('the total never changes once the goals are chosen', () => {
  for (const goals of [['work'], ['buy'], ['work', 'buy', 'business', 'record'], []] as const) {
    const steps = setupSteps(goals);
    const totals = new Set(steps.map((s) => questionProgress(steps, s)?.total).filter((t) => t !== undefined));
    assert.ok(totals.size <= 1, `one total for ${goals.join(',') || 'no goals'}`);
  }
});

test('the goals question is still a question', () => {
  assert.equal(isQuestionStep('goals'), true);
  assert.equal(isQuestionStep('welcome'), false);
  assert.equal(isQuestionStep('summary'), false);
});
