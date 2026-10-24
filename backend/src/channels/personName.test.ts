import assert from 'node:assert/strict';
import test from 'node:test';
import { personName, shortAddress } from './personName.js';

test('a person is named by their Karwan tag first', () => {
  assert.equal(personName({ displayName: 'Grace Chi', handle: 'grachi' }, 'x'), '@grachi');
  assert.equal(personName({ displayName: 'Grace Chi', handle: '@grachi' }, 'x'), '@grachi');
});

test('an older account without a tag is named by its display name, then the fallback', () => {
  assert.equal(personName({ displayName: 'Grace Chi', handle: null }, 'x'), 'Grace Chi');
  assert.equal(personName({ displayName: '  ', handle: '' }, 'the seller'), 'the seller');
  assert.equal(personName(null, shortAddress('0xb41c000000000000000000000000000000001b2')), '0xb41c…01b2');
});
