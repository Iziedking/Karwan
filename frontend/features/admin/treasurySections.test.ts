import assert from 'node:assert/strict';
import test from 'node:test';
import { treasurySections } from './treasurySections';

test('a teammate ticked only for yield sees only the yield section, at their level', () => {
  assert.deepEqual(treasurySections({ owner: false, access: { usyc: 'read' } }), { treasury: null, yield: 'read' });
});

test('treasury alone shows the treasury section', () => {
  assert.deepEqual(treasurySections({ owner: false, access: { treasury: 'fix' } }), { treasury: 'fix', yield: null });
});

test('the owner sees both, with fix', () => {
  assert.deepEqual(treasurySections({ owner: true, access: {} }), { treasury: 'fix', yield: 'fix' });
});
