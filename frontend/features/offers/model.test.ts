import assert from 'node:assert/strict';
import test from 'node:test';
import { offerFundingTotal, budgetDifference, deliverByUnixFromDate, offerDefaults, offerErrorKey, orderOffers, topUpAmount, type Offer } from './model';

const o = (id: string, price: string, createdAt: number): Offer => ({
  id,
  jobId: 'j',
  sellerUser: id,
  priceUsdc: price,
  deliverByUnix: 1,
  note: '',
  state: 'pending',
  createdAt,
  lapsesAt: 9,
});

test('defaults to the budget and the request deadline', () => {
  assert.deepEqual(offerDefaults('300', Date.UTC(2026, 9, 6) / 1000), { priceUsdc: '300', deliverByDate: '2026-10-06' });
});

test('a picked date means the end of that day', () => {
  assert.equal(deliverByUnixFromDate('2026-10-06'), Date.UTC(2026, 9, 6, 23, 59, 59) / 1000);
});

test('maps server codes to copy keys, unknown to generic', () => {
  assert.equal(offerErrorKey('OWN_REQUEST'), 'ownRequest');
  assert.equal(offerErrorKey('job-not-open'), 'closed');
  assert.equal(offerErrorKey('INSUFFICIENT_AGENT_BALANCE'), 'topUp');
  assert.equal(offerErrorKey('something-new'), 'generic');
});

test('orders the agent pick first, then cheapest, then oldest', () => {
  const list = [o('a', '300', 1), o('b', '220', 3), o('c', '220', 2), o('d', '280', 4)];
  assert.deepEqual(orderOffers(list, 'd').map((x) => x.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(orderOffers(list).map((x) => x.id), ['c', 'b', 'd', 'a']);
});

test('shows the budget difference only above budget, exactly', () => {
  assert.equal(budgetDifference('320', '300'), '20');
  assert.equal(budgetDifference('300.5', '300'), '0.5');
  assert.equal(budgetDifference('280', '300'), null);
});

test('review: new server refusals map to plain messages', () => {
  assert.equal(offerErrorKey('ALREADY_BIDDING'), 'alreadyBidding');
  assert.equal(offerErrorKey('BUSY'), 'busy');
  assert.equal(offerErrorKey('ALREADY_MATCHED'), 'matched');
  assert.equal(offerErrorKey('CONFLICT'), 'matched');
});

test('top-up subtracts the available agent balance exactly', () => {
  assert.equal(topUpAmount({ needUsdc: '280.35', agentUsdc: 30.1 }), 250.25);
  assert.equal(topUpAmount({ needUsdc: '0.3', agentUsdc: 0.1 }), 0.2);
});

test('top-up rounds a fractional cent upward', () => {
  assert.equal(topUpAmount({ needUsdc: '20.000001', agentUsdc: 10 }), 10.01);
  assert.equal(topUpAmount({ needUsdc: '10.009999', agentUsdc: 10 }), 0.01);
});

test('top-up is at least one cent when the agent is short', () => {
  assert.equal(topUpAmount({ needUsdc: '0.000001', agentUsdc: 0 }), 0.01);
  assert.equal(topUpAmount({ needUsdc: '10', agentUsdc: 9.999999 }), 0.01);
});

test('top-up never asks for money when the agent already covers the amount', () => {
  assert.equal(topUpAmount({ needUsdc: '10.01', agentUsdc: 10.01 }), 0);
  assert.equal(topUpAmount({ needUsdc: '10', agentUsdc: 50 }), 0);
  assert.equal(topUpAmount({ needUsdc: '0', agentUsdc: 0 }), 0);
});

test('top-up accepts a native-USDC dust balance written in exponent notation', () => {
  assert.equal(topUpAmount({ needUsdc: '0.01', agentUsdc: 1e-7 }), 0.01);
  assert.equal(topUpAmount({ needUsdc: '0.000000000000000001', agentUsdc: 1e-18 }), 0);
});

test('top-up preserves a shortfall smaller than one USDC micro-unit', () => {
  assert.equal(topUpAmount({ needUsdc: '10', agentUsdc: 9.9999999 }), 0.01);
  assert.equal(topUpAmount({ needUsdc: '10.00000001', agentUsdc: 10 }), 0.01);
});

test('the payment CTA requires a valid server total rather than the base price', () => {
  for (const total of [undefined, '', 'NaN', 'Infinity', '-100', '99.99', '100.0000001', '1e2', 100 as unknown as string]) {
    assert.equal(offerFundingTotal({ priceUsdc: '100', fundedUsdc: total }), null);
  }
  assert.equal(offerFundingTotal({priceUsdc:'100',fundedUsdc:'100.5'}),'100.5');
  assert.equal(offerFundingTotal({priceUsdc:'100',fundedUsdc:'100'}),'100');
  assert.equal(offerFundingTotal({priceUsdc:'bad',fundedUsdc:'100.5'}),null);
});

test('an offer price reads as typed, or as the budget was said when it is exactly the budget (view 77)', async () => {
  const { offerPriceSaid } = await import('./model');
  const typed = { currency: 'NGN', amount: '280000' };
  const budget = { currency: 'NGN', amount: '300000' };
  assert.deepEqual(offerPriceSaid({ priceUsdc: '208', priceLocal: typed }, { budgetUsdc: '222.86', budgetLocal: budget }), typed);
  assert.deepEqual(offerPriceSaid({ priceUsdc: '222.86' }, { budgetUsdc: '222.86', budgetLocal: budget }), budget);
  assert.equal(offerPriceSaid({ priceUsdc: '222.85' }, { budgetUsdc: '222.86', budgetLocal: budget }), undefined);
  assert.equal(offerPriceSaid({ priceUsdc: '222.86' }, { budgetUsdc: null, budgetLocal: null }), undefined, 'a seller shown a range has no budget figure to read');
  assert.equal(offerPriceSaid({ priceUsdc: '222.86' }), undefined);
});
