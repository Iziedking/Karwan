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

test('a financed deal pays the financier, so there is nothing to cash out', () => {
  assert.equal(cashoutOpen({ ...settled, factoringOfferId: 'f1' }, true), false);
  assert.equal(cashoutOpen({ ...settled, poFinancingId: 'p1' }, true), false);
});

test('a ruling only opens cash out when the seller got a share', () => {
  assert.equal(cashoutOpen({ ...settled, cancelKind: 'resolved', resolvedSellerBps: 0 }, true), false);
  assert.equal(cashoutOpen({ ...settled, cancelKind: 'resolved', resolvedSellerBps: 4000 }, true), true);
});
