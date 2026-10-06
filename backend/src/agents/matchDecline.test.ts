import assert from 'node:assert/strict';
import test from 'node:test';
import { matchDecliner } from './matchDecline.js';

const BUYER = '0xb000000000000000000000000000000000000001';
const SELLER = '0x5000000000000000000000000000000000000002';
const proposal = { buyerUser: BUYER, sellerUser: SELLER };

test('the seller can decline a match waiting on them', () => {
  assert.deepEqual(matchDecliner(proposal, SELLER), { ok: true, by: 'seller' });
});

test('the buyer can withdraw a match the seller has not accepted yet', () => {
  assert.deepEqual(matchDecliner(proposal, BUYER.toUpperCase().replace('0X', '0x')), { ok: true, by: 'buyer' });
});

test('after a seller raise only the buyer decides', () => {
  const raised = { ...proposal, awaitingParty: 'buyer' as const, raisedPriceUsdc: '70' };
  assert.deepEqual(matchDecliner(raised, BUYER), { ok: true, by: 'buyer' });
  assert.equal(matchDecliner(raised, SELLER).ok, false);
});

test('nobody else can decline', () => {
  assert.equal(matchDecliner(proposal, '0x9999999999999999999999999999999999999999').ok, false);
});
