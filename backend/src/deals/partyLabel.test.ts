import assert from 'node:assert/strict';
import test from 'node:test';
import { partyLabel } from './partyLabel.js';

test('a counterparty reads as their name, then their tag, never an address', () => {
  assert.equal(partyLabel({ displayName: ' Lawful ', handle: 'lawfuldlaw' }), 'Lawful');
  assert.equal(partyLabel({ displayName: '', handle: 'lawfuldlaw' }), '@lawfuldlaw');
  assert.equal(partyLabel({ handle: '@kingizie' }), '@kingizie');
  assert.equal(partyLabel(null), null);
  assert.equal(partyLabel({}), null);
});
