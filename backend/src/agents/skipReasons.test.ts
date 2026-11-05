import assert from 'node:assert/strict';
import test from 'node:test';
import { isPass } from './skipReasons.js';

///   npx tsx --test src/agents/skipReasons.test.ts

test('an agent that needs linking offered, so it is not a pass', () => {
  assert.equal(isPass({ type: 'agent.link-needed', payload: { reason: 'agent-not-linked' } }), false);
});

test('an older skip that still offered is not a pass', () => {
  assert.equal(isPass({ type: 'agent.skipped', payload: { reason: 'agent-not-linked', offering: true } }), false);
});

test('a real skip or a decline is a pass, and other events are not', () => {
  assert.equal(isPass({ type: 'agent.skipped', payload: { reason: 'budget-out-of-range' } }), true);
  assert.equal(isPass({ type: 'agent.declined', payload: {} }), true);
  assert.equal(isPass({ type: 'bid.submitted', payload: {} }), false);
});
