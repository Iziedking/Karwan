import assert from 'node:assert/strict';
import test from 'node:test';
import { questionProgress, setupSteps } from './setupSteps';

/// The setup conversation asks only what a person's goals need.
///
///   npx tsx --test features/setup/setupSteps.test.ts

test('a freelancer is asked about their work and price', () => {
  assert.deepEqual(setupSteps(['work']), ['welcome', 'goals', 'what', 'price', 'clients', 'own', 'reach', 'where', 'reading', 'summary']);
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

test('progress counts only the questions', () => {
  const steps = setupSteps(['work']);
  assert.equal(questionProgress(steps, 'welcome'), null);
  assert.deepEqual(questionProgress(steps, 'goals'), { index: 1, total: 7 });
  assert.deepEqual(questionProgress(steps, 'where'), { index: 7, total: 7 });
  assert.equal(questionProgress(steps, 'summary'), null);
});
