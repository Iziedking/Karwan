import assert from 'node:assert/strict';
import test from 'node:test';
import { AGREED_LISTED_MS, listed, publicOffers, requestState } from './requestState.js';

///   npx tsx --test src/market/requestState.test.ts

const base = { finalized: false, escrowFunded: false, proposal: null, deal: false, nearMiss: false };

test('a request with nothing on it is open', () => {
  assert.deepEqual(requestState(base), { state: 'open', agreedAt: null });
});

test('a pending match or near-miss is in negotiation', () => {
  assert.equal(requestState({ ...base, finalized: true, proposal: { proposedAt: 1 } }).state, 'negotiating');
  assert.equal(requestState({ ...base, nearMiss: true }).state, 'negotiating');
});

test('a declined match does not count, and a finalized request with nothing left has ended', () => {
  assert.equal(requestState({ ...base, proposal: { proposedAt: 1, declinedAt: 2 } }).state, 'open');
  assert.equal(requestState({ ...base, finalized: true, proposal: { proposedAt: 1, declinedAt: 2 } }).state, 'ended');
});

test('an approved match, a deal or funded escrow is agreed, dated by the approval', () => {
  assert.deepEqual(requestState({ ...base, proposal: { proposedAt: 1, approvedAt: 5 } }), { state: 'agreed', agreedAt: 5 });
  assert.equal(requestState({ ...base, deal: true }).state, 'agreed');
  assert.deepEqual(requestState({ ...base, escrowFunded: true, proposal: { proposedAt: 3 } }), { state: 'agreed', agreedAt: 3 });
});

test('open and in-negotiation requests are listed; agreed ones for 7 days; ended ones never', () => {
  const now = 10 * AGREED_LISTED_MS;
  assert.equal(listed({ state: 'open', agreedAt: null }, now), true);
  assert.equal(listed({ state: 'negotiating', agreedAt: null }, now), true);
  assert.equal(listed({ state: 'agreed', agreedAt: now - AGREED_LISTED_MS + 1 }, now), true);
  assert.equal(listed({ state: 'agreed', agreedAt: now - AGREED_LISTED_MS }, now), false);
  assert.equal(listed({ state: 'agreed', agreedAt: null }, now), false);
  assert.equal(listed({ state: 'ended', agreedAt: null }, now), false);
});

test('public offers merge hand offers and agent bids, cheapest first, with no private fields', () => {
  const now = 1000;
  const hand = [
    { id: 'o1', sellerUser: '0xAA', priceUsdc: '90', deliverByUnix: 2000, note: 'I can start today', state: 'pending' as const, lapsesAt: 5000 },
    { id: 'o2', sellerUser: '0xbb', priceUsdc: '70', deliverByUnix: 2100, note: 'late', state: 'pending' as const, lapsesAt: 900 },
    { id: 'o3', sellerUser: '0xcc', priceUsdc: '60', deliverByUnix: 2100, note: '', state: 'withdrawn' as const, lapsesAt: 5000 },
  ];
  const bids = [
    { sellerUser: '0xaa', priceUsdc: '95', deadlineUnix: 2000 },
    { sellerUser: '0xDD', priceUsdc: '80', deadlineUnix: 2200 },
    { sellerUser: null, priceUsdc: '50', deadlineUnix: 2200 },
  ];
  const out = publicOffers(hand, bids, '0xdd', now);
  assert.deepEqual(out, [
    { id: out[0].id, kind: 'agent', sellerUser: '0xdd', priceUsdc: '80', deliverByUnix: 2200, note: null, chosen: true },
    { id: 'o1', kind: 'hand', sellerUser: '0xaa', priceUsdc: '90', deliverByUnix: 2000, note: 'I can start today', chosen: false },
  ]);
  assert.match(out[0].id, /^agent:[0-9a-f]{12}$/);
  assert.equal(out[0].id.includes('0xdd'), false);
});

test('an accepted hand offer stays listed and is marked chosen after it lapses', () => {
  const hand = [{ id: 'o1', sellerUser: '0xaa', priceUsdc: '90', deliverByUnix: 2000, note: '', state: 'accepted' as const, lapsesAt: 10 }];
  assert.deepEqual(publicOffers(hand, [], '0xaa', 1000).map((o) => [o.id, o.chosen]), [['o1', true]]);
});
