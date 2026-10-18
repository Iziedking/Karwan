import test from 'node:test';
import assert from 'node:assert/strict';
import { cashoutOpen } from './cashoutOpen';

const settled = { settledAt: 1, cancelKind: undefined, resolvedSellerBps: undefined, factoringOfferId: undefined, poFinancingId: undefined };

test('the seller of a released deal can cash out', () => {
  assert.equal(cashoutOpen(settled, true), true);
});

test('never before release, never for the buyer', () => {
  assert.equal(cashoutOpen({ ...settled, settledAt: undefined }, true), false);
  assert.equal(cashoutOpen(settled, false), false);
});

test('a financed deal still pays the seller what is left after the financier, so cash out stays open', () => {
  // The 18 Oct 2026 rehearsal: the escrow repaid the financier 500 USDC and
  // paid the seller's deal wallet the remaining 492.5 USDC.
  const factored = { ...settled, factoringOfferId: 'f1' };
  const poFinanced = { ...settled, poFinancingId: 'p1' };
  assert.equal(cashoutOpen(factored, true), true);
  assert.equal(cashoutOpen(poFinanced, true), true);
});

test('a ruling only opens cash out when the seller got a share', () => {
  assert.equal(cashoutOpen({ ...settled, cancelKind: 'resolved', resolvedSellerBps: 0 }, true), false);
  assert.equal(cashoutOpen({ ...settled, cancelKind: 'resolved', resolvedSellerBps: 4000 }, true), true);
});
