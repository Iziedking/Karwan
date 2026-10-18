import assert from 'node:assert/strict';
import test from 'node:test';
import { financeHref } from './financeHref';

/// A financier is not a party to the deal, so their finance notices open their
/// position or the desk; the seller's open the deal.
///
///   npx tsx --test features/notifications/financeHref.test.ts

test('a financier opens the position, or the desk for a new request', () => {
  assert.equal(financeHref({ role: 'financier', jobId: '0xd', payload: { offerId: 'o1' } }), '/financier/factoring/o1');
  assert.equal(financeHref({ role: 'financier', jobId: '0xd', payload: { lineId: 'l1' } }), '/financier/po/l1');
  assert.equal(financeHref({ role: 'financier', jobId: '0xd', payload: {} }), '/financier');
});

test('a seller opens the deal', () => {
  assert.equal(financeHref({ role: 'seller', jobId: '0xd', payload: { offerId: 'o1' } }), '/deals/0xd');
  assert.equal(financeHref({ role: 'seller', jobId: '', payload: {} }), '/financier');
});
