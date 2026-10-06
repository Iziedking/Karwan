import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerKey } from './sellerKey.js';

test('a seller is found whatever the casing of the address that names them', () => {
  const rounds = new Map<string, number>([['0x7bC198d5fd5d61be9019929F34B93ba0697843F3', 1]]);
  assert.equal(sellerKey(rounds, '0x7bc198d5fd5d61be9019929f34b93ba0697843f3'), '0x7bC198d5fd5d61be9019929F34B93ba0697843F3');
  assert.equal(sellerKey(rounds, '0x7BC198D5FD5D61BE9019929F34B93BA0697843F3'), '0x7bC198d5fd5d61be9019929F34B93ba0697843F3');
});

test('an unknown seller is not found', () => {
  assert.equal(sellerKey(new Map([['0xaaaa000000000000000000000000000000000001', 1]]), '0xbbbb000000000000000000000000000000000002'), null);
});

test('sets work too', () => {
  assert.equal(sellerKey(new Set(['0xAbC0000000000000000000000000000000000001']), '0xabc0000000000000000000000000000000000001'), '0xAbC0000000000000000000000000000000000001');
});
