import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSourceFor } from './checkSource.js';

test('with CRE off, Karwan checks ran', () => {
  assert.equal(checkSourceFor({ creEnabled: false, creResult: false }), 'karwan');
});

test('with CRE on and a CRE result, CRE ran', () => {
  assert.equal(checkSourceFor({ creEnabled: true, creResult: true }), 'cre');
});

test('with CRE on and no CRE result, Karwan checks ran as the fallback, and the record says so', () => {
  assert.equal(checkSourceFor({ creEnabled: true, creResult: false }), 'karwan-fallback');
});

test('a CRE result counts even when the switch is off, because it ran', () => {
  assert.equal(checkSourceFor({ creEnabled: false, creResult: true }), 'cre');
});
