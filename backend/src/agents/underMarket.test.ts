import assert from 'node:assert/strict';
import test from 'node:test';
import { isFarUnderMarket, underMarketNoteDue, UNDER_MARKET_CHECK_MS } from './underMarket.js';

test('far under market means under 60% of a grounded fair price', () => {
  assert.equal(isFarUnderMarket(50, 100), true);
  assert.equal(isFarUnderMarket(59.99, 100), true);
  assert.equal(isFarUnderMarket(60, 100), false);
  assert.equal(isFarUnderMarket(90, 100), false, 'a little under is a normal negotiation');
});

test('no note without a grounded fair price', () => {
  assert.equal(isFarUnderMarket(10, undefined), false);
  assert.equal(isFarUnderMarket(10, 0), false);
});

test('the note is due only when far under, nothing fits the limit, and it was not sent before', () => {
  assert.equal(underMarketNoteDue({ farUnder: true, offerWithinCap: false, noted: false }), true);
  assert.equal(underMarketNoteDue({ farUnder: true, offerWithinCap: true, noted: false }), false, 'a seller took it at this budget');
  assert.equal(underMarketNoteDue({ farUnder: false, offerWithinCap: false, noted: false }), false);
  assert.equal(underMarketNoteDue({ farUnder: true, offerWithinCap: false, noted: true }), false, 'once only');
});

test('the agent looks again after two seller sweeps, so sellers had their chance', () => {
  assert.equal(UNDER_MARKET_CHECK_MS, 20 * 60_000);
});
