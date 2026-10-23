import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { awaitingPayment, conversationReference } from './conversationPayCards.js';

/// A deal sent from a conversation offers its payment there once the seller accepts (view 24).
///
///   npx tsx --test src/assistant/conversationPayCards.test.ts

const BUYER = '0x00000000000000000000000000000000000000b1';
const deal = (patch: Partial<DirectDeal>) =>
  ({ jobId: `0x${'1'.repeat(64)}`, buyer: BUYER, seller: '0xa1', dealAmountUsdc: '50', sourceContext: { channel: 'karwan', reference: conversationReference('c1') }, sellerApprovedAt: 1, ...patch }) as DirectDeal;

test('only accepted, unpaid deals from this conversation wait for payment here', () => {
  const ready = deal({});
  const deals = [
    ready,
    deal({ sellerApprovedAt: undefined }),
    deal({ fundTxHash: '0xf' }),
    deal({ acceptedAt: 2 }),
    deal({ cancelledAt: 3 }),
    deal({ sourceContext: { channel: 'karwan', reference: conversationReference('c2') } }),
    deal({ buyer: '0x00000000000000000000000000000000000000b2' }),
  ];
  assert.deepEqual(awaitingPayment(deals, BUYER, 'c1'), [ready]);
});
