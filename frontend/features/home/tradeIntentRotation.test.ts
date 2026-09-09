import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTradeIntentIndex, TRADE_INTENT_INTERVAL_MS } from './tradeIntentRotation';

test('trade intents advance and wrap without getting stuck on one platform', () => {
  assert.equal(nextTradeIntentIndex(1, 5), 2);
  assert.equal(nextTradeIntentIndex(4, 5), 0);
});

test('trade intent rhythm leaves enough time to read each example', () => {
  assert.equal(TRADE_INTENT_INTERVAL_MS, 5600);
});
