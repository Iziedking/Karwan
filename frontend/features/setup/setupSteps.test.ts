import assert from 'node:assert/strict';
import test from 'node:test';
import { aboutProgress, canGoOn, firstPostKind, isQuestionStep, setupSteps } from './setupSteps';

/// Set up in two minutes (view 39, 19 Nov): sell, buy or both with one line
/// each, then where you are and how we reach you, then the summary.
///
///   npx tsx --test features/setup/setupSteps.test.ts

test('everyone has the same four steps', () => {
  assert.deepEqual(setupSteps(), ['role', 'where', 'reading', 'summary']);
});

test('the first step waits for a choice and its line', () => {
  assert.equal(canGoOn('role', {}), false);
  assert.equal(canGoOn('role', { role: 'sell' }), false);
  assert.equal(canGoOn('role', { role: 'sell', sellLine: ' x ' }), false);
  assert.equal(canGoOn('role', { role: 'sell', sellLine: 'Logo design, 20 USDC' }), true);
  assert.equal(canGoOn('role', { role: 'buy', buyLine: 'Rice' }), true);
  assert.equal(canGoOn('role', { role: 'both', sellLine: 'Phone repairs' }), false);
  assert.equal(canGoOn('role', { role: 'both', sellLine: 'Phone repairs', buyLine: 'Screens' }), true);
});

test('where you are needs a country and a town, and a way to reach you', () => {
  assert.equal(canGoOn('where', { place: { country: 'NG' }, reach: 'both' }), false);
  assert.equal(canGoOn('where', { place: { country: 'NG', city: 'Lagos' } }), false);
  assert.equal(canGoOn('where', { place: { country: 'NG', city: 'Lagos' }, reach: 'telegram' }), true);
});

test('the bar for About you moves forward and ends full on the summary', () => {
  const steps = setupSteps();
  const values = steps.map((s) => aboutProgress(steps, s));
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! > values[i - 1]!);
});

test('the reading and the summary are not questions', () => {
  assert.equal(isQuestionStep('role'), true);
  assert.equal(isQuestionStep('where'), true);
  assert.equal(isQuestionStep('reading'), false);
  assert.equal(isQuestionStep('summary'), false);
});

test('the first post is an offer for anyone who sells', () => {
  assert.equal(firstPostKind({ role: 'sell' }), 'offer');
  assert.equal(firstPostKind({ role: 'both' }), 'offer');
  assert.equal(firstPostKind({ role: 'buy' }), 'request');
  assert.equal(firstPostKind({}), null);
});
