import assert from 'node:assert/strict';
import test from 'node:test';
import { partyLabel } from './partyLabel.js';

test('a counterparty reads as their tag, then their name, never an address', () => {
  assert.equal(partyLabel({ displayName: ' Lawful ', handle: 'lawfuldlaw' }), '@lawfuldlaw');
  assert.equal(partyLabel({ displayName: ' Lawful ', handle: '' }), 'Lawful');
  assert.equal(partyLabel({ handle: '@kingizie' }), '@kingizie');
  assert.equal(partyLabel(null), null);
  assert.equal(partyLabel({}), null);
});
