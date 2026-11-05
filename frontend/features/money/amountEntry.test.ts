import assert from 'node:assert/strict';
import test from 'node:test';
import { pressKey, pressKeys } from './amountEntry';

test('digits build the amount, and a lone zero gives way to the next digit', () => {
  assert.equal(pressKeys('', ['2', '5', '0']), '250');
  assert.equal(pressKeys('', ['0', '5']), '5');
  assert.equal(pressKeys('', ['0', '0']), '0');
});

test('one decimal point, and a point on its own reads as 0.', () => {
  assert.equal(pressKey('', '.'), '0.');
  assert.equal(pressKeys('', ['1', '.', '.', '5']), '1.5');
  assert.equal(pressKeys('', ['0', '.', '0', '5']), '0.05');
});

test('USDC has six decimals, so a seventh is ignored', () => {
  assert.equal(pressKey('1.123456', '7'), '1.123456');
  assert.equal(pressKey('1.12345', '6'), '1.123456');
});

test('nine whole digits at most, so the figure stays on one line', () => {
  assert.equal(pressKey('123456789', '0'), '123456789');
  assert.equal(pressKey('123456789', '.'), '123456789.');
});

test('back removes one character, and does nothing on empty', () => {
  assert.equal(pressKey('250', 'back'), '25');
  assert.equal(pressKey('0.', 'back'), '0');
  assert.equal(pressKey('', 'back'), '');
});

test('an amount typed or pasted elsewhere is kept as it is until the next key', () => {
  assert.equal(pressKey('12.50', '0'), '12.500');
});
