import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFeedDeal } from './publicFeed.js';

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

test('the public feed carries only the ticker fields, with addresses masked', () => {
  assert.deepEqual(publicFeedDeal(settled), {
    jobId: settled.jobId,
    buyer: '0x7711…5a35',
    seller: '0xa045…03c5',
    dealAmountUsdc: '100',
    createdAt: 1,
    acceptedAt: 2,
    settledAt: 3,
    updatedAt: 4,
    onChain: { state: 2 },
  });
});

test('nothing private survives serialization', () => {
  const wire = JSON.stringify(publicFeedDeal(settled));
  for (const secret of ['Deliver the agent', '960ba432', '0b7ed4bf', 'private assessment', 'Acme', '0x52dd', BUYER, SELLER, 'milestonePcts']) {
    assert.equal(wire.includes(secret), false, `leaked ${secret}`);
  }
});

test('a deal with no escrow read yet keeps a null chain state', () => {
  assert.equal(publicFeedDeal({ ...settled, onChain: undefined }).onChain, null);
});
