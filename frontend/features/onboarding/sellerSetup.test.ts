import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSkill, selectedSkills, toggleSkill } from './sellerSetup';

test('skill suggestions add without duplicating existing input', () => {
  assert.equal(toggleSkill('Logistics', 'Sourcing'), 'Logistics, Sourcing');
  assert.equal(toggleSkill('Logistics', 'logistics'), '');
});

test('typed skills are normalized for matching suggestion state', () => {
  assert.deepEqual(selectedSkills('  Design, Logistics ,, Copywriting '), [
    'Design',
    'Logistics',
    'Copywriting',
  ]);
  assert.equal(hasSkill('Design, Logistics', 'logistics'), true);
});
