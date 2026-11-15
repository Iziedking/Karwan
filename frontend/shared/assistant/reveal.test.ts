import assert from 'node:assert/strict';
import test from 'node:test';
import { revealSteps } from './reveal';

test('a short answer ends on its last word within 600 ms', () => {
  const steps = revealSteps('Your deal is safe');
  assert.equal(steps.at(-1), 4);
  assert.ok(steps.length * 40 <= 600);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i]! >= steps[i - 1]!);
});

test('a long answer still takes no more than 600 ms', () => {
  const text = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
  const steps = revealSteps(text);
  assert.ok(steps.length <= 600 / 40);
  assert.equal(steps.at(-1), 2000);
});

test('an empty answer has nothing to reveal', () => {
  assert.deepEqual(revealSteps(''), []);
  assert.deepEqual(revealSteps('   '), []);
});
