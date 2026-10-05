import assert from 'node:assert/strict';
import test from 'node:test';
import { passportView } from './passportGate';

const ME = '0xAbCd000000000000000000000000000000000001';

test('the owner sees the full record whatever the letter case', () => {
  assert.equal(passportView(ME.toLowerCase(), ME), 'owner');
});

test('anyone else, or no session, sees the visitor passport', () => {
  assert.equal(passportView(null, ME), 'visitor');
  assert.equal(passportView('0x0000000000000000000000000000000000000002', ME), 'visitor');
});
