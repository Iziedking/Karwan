import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFactoringQuote } from './factoringQuote';

test('models early payout as an assigned settlement, not a prior seller payment', () => {
  assert.deepEqual(
    buildFactoringQuote({
      invoiceValueUsdc: '500',
      escrowAvailableUsdc: '495',
      requestedSettlementUsdc: '200',
      discountBps: 1_250,
    }),
    {
      invoiceValueUsdc: '500',
      settlementAssignedUsdc: '200',
      advanceUsdc: '175',
      settlementReturnUsdc: '200',
      spreadUsdc: '25',
      requestCappedByAvailability: false,
    },
  );
});

test('caps a stale request at what escrow can still pay', () => {
  assert.deepEqual(
    buildFactoringQuote({
      invoiceValueUsdc: '500',
      escrowAvailableUsdc: '150',
      requestedSettlementUsdc: '200',
      discountBps: 1_250,
    }),
    {
      invoiceValueUsdc: '500',
      settlementAssignedUsdc: '150',
      advanceUsdc: '131.25',
      settlementReturnUsdc: '150',
      spreadUsdc: '18.75',
      requestCappedByAvailability: true,
    },
  );
});

test('rounds the advance down to exact micro-USDC like settlement code', () => {
  const quote = buildFactoringQuote({
    invoiceValueUsdc: '1',
    requestedSettlementUsdc: '0.000001',
    discountBps: 100,
  });

  assert.equal(quote.advanceUsdc, '0');
  assert.equal(quote.spreadUsdc, '0.000001');
});
