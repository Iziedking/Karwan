import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal, DirectDealOnChain, DirectDealOnChainV3 } from '../../../core/api.js';
import { v3PanelState } from './v3PanelState.js';

const BUYER = '0xbuyer';
const SELLER = '0xseller';
const NOW = 1_800_000_000_000;

function v3(over: Partial<DirectDealOnChainV3> = {}): DirectDealOnChainV3 {
  return {
    accepted: true, reviewStartedAtMs: null, extensionsUsed: 0, checkPassed: false, disputedAtMs: NOW - 1_000,
    escalated: false, ruling: null, escalateOpensAtMs: null, lapseAtMs: null, reclaimed: false, split: false, ...over,
  };
}

function deal(state: number, v: DirectDealOnChainV3 | undefined, over: Partial<DirectDeal> = {}) {
  const onChain = {
    state, milestonePcts: [50, 50], milestonesReleased: 0, dealAmountWei: '1000000000', sellerNetWei: '992500000',
    feeTotalWei: '15000000', releasedWei: '0', escrowVersion: v ? 'v3' : 'v2', ...(v ? { v3: v } : {}),
  } as DirectDealOnChain;
  return { buyer: BUYER, seller: SELLER, onChain, cancelledAt: undefined, settledAt: undefined, ...over } as DirectDeal;
}

test('v2 deals, strangers and closed deals see nothing', () => {
  assert.equal(v3PanelState(deal(1, undefined), BUYER, NOW).kind, 'none');
  assert.equal(v3PanelState(deal(1, v3({ accepted: false })), '0xstranger', NOW).kind, 'none');
  assert.equal(v3PanelState(deal(1, v3({ accepted: false }), { cancelledAt: 1 }), BUYER, NOW).kind, 'none');
});

test('an unaccepted deal offers the buyer the whole funded amount back, fee included', () => {
  const s = v3PanelState(deal(1, v3({ accepted: false })), BUYER, NOW);
  assert.deepEqual(s, { kind: 'unaccepted', viewer: 'buyer', refundUsdc: '1,007.5' });
  assert.equal(v3PanelState(deal(1, v3({ accepted: false })), SELLER, NOW).kind, 'unaccepted');
});

test('a ruling can be appealed only inside its window', () => {
  const ruling = { sellerBps: 0, toSellerUsdc: '0', toBuyerUsdc: '1007.5', proposedAtMs: NOW - 10, appealEndsAtMs: NOW + 10, ruleId: 'R1-no-delivery' };
  const open = v3PanelState(deal(4, v3({ ruling })), SELLER, NOW);
  assert.equal(open.kind === 'ruling' && open.canAct, true);
  const closed = v3PanelState(deal(4, v3({ ruling: { ...ruling, appealEndsAtMs: NOW } })), SELLER, NOW);
  assert.equal(closed.kind === 'ruling' && closed.canAct, false);
});

test('with no ruling, escalation opens at the deadline the escrow sets', () => {
  const before = v3PanelState(deal(4, v3({ escalateOpensAtMs: NOW + 1 })), BUYER, NOW);
  assert.equal(before.kind === 'waiting' && before.canAct, false);
  const after = v3PanelState(deal(4, v3({ escalateOpensAtMs: NOW })), BUYER, NOW);
  assert.equal(after.kind === 'waiting' && after.canAct, true);
});

test('an escalated dispute shows review, with when it would lapse', () => {
  const s = v3PanelState(deal(4, v3({ escalated: true, lapseAtMs: NOW + 5 })), BUYER, NOW);
  assert.deepEqual(s, { kind: 'review', viewer: 'buyer', lapseAtMs: NOW + 5 });
});
