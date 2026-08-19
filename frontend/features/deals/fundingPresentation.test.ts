import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatExactUsdc,
  formatFeeRate,
  onChainFundingSummary,
  portionOfUsdc,
} from './fundingPresentation';

test('formats quoted USDC without losing micro-unit precision', () => {
  assert.equal(formatExactUsdc('1234567.000001'), '1,234,567.000001 USDC');
  assert.equal(formatExactUsdc('100'), '100.00 USDC');
});

test('derives milestone amounts with integer micro-USDC math', () => {
  assert.equal(portionOfUsdc('98.500001', 60), '59.10 USDC');
  assert.equal(portionOfUsdc('0.000001', 50), '0.00 USDC');
});

test('formats basis points as a readable percentage', () => {
  assert.equal(formatFeeRate(150), '1.5%');
  assert.equal(formatFeeRate(25), '0.25%');
});

test('reconstructs the funded total from authoritative on-chain amounts', () => {
  assert.deepEqual(
    onChainFundingSummary({
      dealAmountWei: '100000000',
      sellerNetWei: '99250000',
      feeTotalWei: '1500000',
    }),
    {
      dealAmountUsdc: '100',
      buyerFeeUsdc: '0.75',
      feeTotalUsdc: '1.5',
      fundedAmountUsdc: '100.75',
      sellerNetUsdc: '99.25',
    },
  );
});
