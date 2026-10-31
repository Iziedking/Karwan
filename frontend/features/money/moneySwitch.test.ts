import assert from 'node:assert/strict';
import test from 'node:test';
import { moneyV2Enabled } from './moneySwitch.js';

test('the money cards are on only when switched on, or asked for by URL', () => {
  assert.equal(moneyV2Enabled(undefined, ''), false);
  assert.equal(moneyV2Enabled('0', ''), false);
  assert.equal(moneyV2Enabled('1.', ''), false);
  assert.equal(moneyV2Enabled('true', ''), false);
  assert.equal(moneyV2Enabled('1', ''), true);
  assert.equal(moneyV2Enabled(undefined, '?money=v2'), true);
  assert.equal(moneyV2Enabled('1', '?money=v1'), false);
  assert.equal(moneyV2Enabled('1', '?intent=add&money=v1'), false);
});

test('the money page is the new one for everyone unless the old one is asked for (view 44, Batch 7)', () => {
  assert.equal(moneyV2Enabled(undefined, '', true), true);
  assert.equal(moneyV2Enabled(undefined, '?money=v1', true), false);
  assert.equal(moneyV2Enabled(undefined, ''), false);
});
