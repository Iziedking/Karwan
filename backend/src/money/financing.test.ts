import test from 'node:test';
import assert from 'node:assert/strict';
import { financingOperationKey, matchesFinancingTransfer, receiptInvokedContract } from './financing.js';

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

test('financing receipt accepts an internal registry call from a smart account', () => {
  const registry = '0xFb0Debd5E2618881699ED9b02CE0c9B718a1C649';
  assert.equal(
    receiptInvokedContract({
      to: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      logs: [{ address: registry }],
    }, registry),
    true,
  );
  assert.equal(
    receiptInvokedContract({ to: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', logs: [] }, registry),
    false,
  );
});
