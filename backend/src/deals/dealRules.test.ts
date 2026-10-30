import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDealRules } from './dealRules.js';

/// The deals Karwan refuses because their shape takes away the buyer's
/// protection (view 32, decision 6). Built behind a switch that starts off.

const newSeller = { settledDeals: 0, verified: false };

test('a new unverified seller can take up to 100 USDC, not more', () => {
  assert.equal(checkDealRules({ amountUsdc: 100, kind: 'one_time', goodsWay: null, seller: newSeller }).verdict, 'ok');
  const r = checkDealRules({ amountUsdc: 100.01, kind: 'one_time', goodsWay: null, seller: newSeller });
  assert.equal(r.verdict, 'refuse');
  assert.equal(r.verdict === 'refuse' && r.rule, 'new_unverified_over_100');
  assert.match(r.verdict === 'refuse' ? r.fix : '', /verify|smaller deal/);
  assert.equal(checkDealRules({ amountUsdc: 500, kind: 'one_time', goodsWay: null, seller: { settledDeals: 0, verified: true } }).verdict, 'ok');
  assert.equal(checkDealRules({ amountUsdc: 500, kind: 'one_time', goodsWay: null, seller: { settledDeals: 1, verified: false } }).verdict, 'ok');
  // An invited seller who has not joined yet is checked when they claim the deal.
  assert.equal(checkDealRules({ amountUsdc: 500, kind: 'one_time', goodsWay: null, seller: null }).verdict, 'ok');
});

test('goods over 50 USDC need a way to show delivery: shipped or in person', () => {
  const known = { settledDeals: 3, verified: true };
  assert.equal(checkDealRules({ amountUsdc: 50, kind: 'goods', goodsWay: null, seller: known }).verdict, 'ok');
  const r = checkDealRules({ amountUsdc: 51, kind: 'goods', goodsWay: null, seller: known });
  assert.equal(r.verdict === 'refuse' && r.rule, 'goods_no_way_to_show');
  assert.equal(checkDealRules({ amountUsdc: 51, kind: 'goods', goodsWay: 'in_person', seller: known }).verdict, 'ok');
  assert.equal(checkDealRules({ amountUsdc: 51, kind: 'goods', goodsWay: 'shipped', seller: known }).verdict, 'ok');
  assert.equal(checkDealRules({ amountUsdc: 900, kind: 'one_time', goodsWay: null, seller: known }).verdict, 'ok');
});
