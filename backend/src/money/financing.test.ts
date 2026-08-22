import test from 'node:test';
import assert from 'node:assert/strict';
import { financingOperationKey, matchesFinancingTransfer } from './financing.js';

test('financing movement keys are stable and scoped by rail, position, phase, and hash', () => {
  assert.equal(
    financingOperationKey('po', 'invoice-1', 'advance', '0xABC'),
    'financing:po:invoice-1:advance:0xabc',
  );
});

test('financing transfer proof requires exact token, parties, and amount', () => {
  const expected = { tokenAddress: '0xToken', sourceAddress: '0xSource', destinationAddress: '0xDest', amountMicros: 20n };
  assert.equal(matchesFinancingTransfer({ tokenAddress: '0xToken', from: '0xSource', to: '0xDest', value: 20n }, expected), true);
  assert.equal(matchesFinancingTransfer({ tokenAddress: '0xToken', from: '0xSource', to: '0xDest', value: 21n }, expected), false);
  assert.equal(matchesFinancingTransfer({ tokenAddress: '0xOther', from: '0xSource', to: '0xDest', value: 20n }, expected), false);
});
