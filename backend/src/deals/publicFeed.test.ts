import assert from 'node:assert/strict';
import test from 'node:test';
import { amountBand, dealOrigin, publicFeedDeal } from './publicFeed.js';

const BUYER = '0x7711886865c33606ebd977da02a6a25373c75a35';
const SELLER = '0xa045e8104bc066fff5bfc673abf354871edc03c5';

// Shaped like a real enriched settled deal from production, private parts included.
const settled = {
  jobId: `0x${'ab'.repeat(32)}`,
  buyer: BUYER,
  seller: SELLER,
  dealAmountUsdc: '100',
  createdAt: 1,
  acceptedAt: 2,
  settledAt: 3,
  updatedAt: 4,
  terms: 'Deliver the agent-workflow and build-fix release',
  buyerAgentWalletId: '960ba432-205d-5521-bc7d-88da63d2879c',
  sellerAgentWalletId: '0b7ed4bf-4cb0-5922-a2e1-185a5da776eb',
  deliveryMatch: { verdict: 'partial', reason: 'buyer private assessment' },
  counterpartyCompany: { name: 'Acme Exports' },
  documentRefs: [{ hash: '0x01' }],
  fundTxHash: '0x52dd',
  onChain: { state: 2, dealAmountWei: '100000000', milestonePcts: [50, 50] },
};

test('the public feed carries a value band, a time and how the deal began, nothing that names a party', () => {
  assert.deepEqual(publicFeedDeal(settled, 'agent'), { amountBand: '100_500', settledAt: 0, origin: 'agent' });
  assert.deepEqual(publicFeedDeal(settled, 'direct'), { amountBand: '100_500', settledAt: 0, origin: 'direct' });
});

test('a deal began with an agent when it says so, or, for older rows, when it has a brief', () => {
  assert.equal(dealOrigin({ origin: 'agent' }, false), 'agent');
  assert.equal(dealOrigin({ origin: 'direct' }, true), 'direct');
  assert.equal(dealOrigin({}, true), 'agent');
  assert.equal(dealOrigin({}, false), 'direct');
});

test('bands follow the published edges', () => {
  assert.equal(amountBand('99.99'), 'under_100');
  assert.equal(amountBand('100'), '100_500');
  assert.equal(amountBand('499.99'), '100_500');
  assert.equal(amountBand('500'), '500_2000');
  assert.equal(amountBand('2000'), '2000_10000');
  assert.equal(amountBand('10000'), 'over_10000');
});

test('an amount that is not a number bands as under 100, never throws', () => {
  assert.equal(amountBand(''), 'under_100');
  assert.equal(amountBand('abc'), 'under_100');
});

test('a feed row without settledAt falls back to updatedAt', () => {
  assert.deepEqual(publicFeedDeal({ ...settled, settledAt: undefined }, 'direct'), { amountBand: '100_500', settledAt: 0, origin: 'direct' });
});

test('the settle time is rounded down to the UTC day, so it cannot be matched to a transaction', () => {
  const at = Date.UTC(2026, 9, 16, 14, 37, 12, 345);
  assert.equal(publicFeedDeal({ ...settled, settledAt: at }, 'agent').settledAt, Date.UTC(2026, 9, 16));
  assert.equal(publicFeedDeal({ ...settled, settledAt: Date.UTC(2026, 9, 16) }, 'agent').settledAt, Date.UTC(2026, 9, 16));
});

test('nothing private survives serialization', () => {
  const wire = JSON.stringify(publicFeedDeal(settled, 'agent'));
  for (const secret of ['Deliver the agent', '960ba432', '0b7ed4bf', 'private assessment', 'Acme', '0x52dd', BUYER, SELLER, settled.jobId, '0x7711', '0xa045', 'milestonePcts']) {
    assert.equal(wire.includes(secret), false, `leaked ${secret}`);
  }
});
