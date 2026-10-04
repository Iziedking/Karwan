import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerResponded } from './sellerResponse.js';

const SELLER = '0x00000000000000000000000000000000000000aa';
const AGENT = '0x00000000000000000000000000000000000000bb';
const BUYER = '0x00000000000000000000000000000000000000cc';
const deal = { seller: SELLER, sellerAgentAddress: AGENT, disputedAt: 1_000 };

test('a seller chat message after the dispute is a response', () => {
  assert.equal(sellerResponded(deal, [{ sender: SELLER.toUpperCase(), kind: 'participant', ts: 1_001 }]), true);
  assert.equal(sellerResponded(deal, [{ sender: AGENT, ts: 2_000 }]), true);
});

test('messages before the dispute, from the buyer, or from the system do not count', () => {
  assert.equal(sellerResponded(deal, [{ sender: SELLER, ts: 999 }]), false);
  assert.equal(sellerResponded(deal, [{ sender: BUYER, ts: 2_000 }]), false);
  assert.equal(sellerResponded(deal, [{ sender: 'system', kind: 'system', ts: 2_000 }]), false);
});

test('a redelivery after the dispute is a response', () => {
  assert.equal(sellerResponded({ ...deal, deliveredAt: 1_500 }, []), true);
  assert.equal(sellerResponded({ ...deal, deliveredAt: 500 }, []), false);
});
