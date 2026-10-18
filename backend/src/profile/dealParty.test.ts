import assert from 'node:assert/strict';
import test from 'node:test';
import { isDealParty } from './dealParty.js';

/// A deal's own buyer or seller is never its financier: they would learn the
/// seller asked to be paid early, and could fund their own trade.
///
///   npx tsx --test src/profile/dealParty.test.ts

const deal = {
  buyer: '0xAAAA000000000000000000000000000000000001',
  seller: '0xBBBB000000000000000000000000000000000002',
  buyerAgentAddress: '0xAAAA000000000000000000000000000000000003',
  sellerAgentAddress: '0xBBBB000000000000000000000000000000000004',
};

test('the buyer and seller, and their agent wallets, are parties, in any letter case', () => {
  assert.equal(isDealParty(deal, '0xaaaa000000000000000000000000000000000001'), true);
  assert.equal(isDealParty(deal, deal.seller), true);
  assert.equal(isDealParty(deal, '0xaaaa000000000000000000000000000000000003'), true);
  assert.equal(isDealParty(deal, deal.sellerAgentAddress), true);
});

test('anyone else is not', () => {
  assert.equal(isDealParty(deal, '0xCCCC000000000000000000000000000000000005'), false);
  assert.equal(isDealParty({ buyer: deal.buyer, seller: deal.seller }, '0xCCCC000000000000000000000000000000000005'), false);
});
