import assert from 'node:assert/strict';
import test from 'node:test';
import { carriedGate } from './proposalCarry.js';

const prior = {
  sellerAgent: '0xaaa', approvedAt: 5, declinedAt: 6,
  awaitingParty: 'buyer' as const, raisedPriceUsdc: '120', originalPriceUsdc: '100', raisedAt: 7, raiseOverCap: false,
};

test('a refresh of the same match keeps its approval, decline and pending raise', () => {
  const kept = carriedGate(prior, '0xAAA', { humanChosen: false });
  assert.equal(kept.approvedAt, 5);
  assert.equal(kept.declinedAt, 6);
  assert.equal(kept.raisedPriceUsdc, '120');
});

test('a match to another seller starts clean, so it is never born declined', () => {
  assert.deepEqual(carriedGate(prior, '0xbbb', { humanChosen: false }), {});
});

test('an offer a person chose starts clean, even for the same seller', () => {
  assert.deepEqual(carriedGate(prior, '0xaaa', { humanChosen: true }), {});
  assert.deepEqual(carriedGate(null, '0xaaa', { humanChosen: false }), {});
});
