import assert from 'node:assert/strict';
import test from 'node:test';
import { protectionLines, type ProtectionCopy } from './protection';

const copy: ProtectionCopy = {
  title: 'Protection on this deal',
  escrow: 'Money held in escrow until release',
  you: 'You verify with World ID',
  buyer: 'The buyer verifies with World ID',
  seller: 'The seller verifies with World ID',
  reasons: { first_deal: 'first deal', large_deal: 'large deal', fast_new_account: 'many new deals today', flagged_link_before: 'a flagged link on record' },
  stake: 'Seller holds {pct}% stake',
  github: 'Delivery checked on GitHub',
  offMarket: 'Price is well above similar deals',
  belowMarket: 'Price is well below similar deals',
};

test('escrow alone when the engine asks nothing', () => {
  assert.deepEqual(protectionLines(undefined, 'buyer', copy), ['Money held in escrow until release']);
});

test('names who verifies and why, from the viewer\'s side', () => {
  const view = { verify: { buyer: 'first_deal' as const, seller: 'check' as const }, stakeRequired: false, delivery: 'github' as const, reasons: ['first_deal' as const] };
  assert.deepEqual(protectionLines(view, 'buyer', copy), [
    'Money held in escrow until release',
    'You verify with World ID · first deal',
    'The seller verifies with World ID',
    'Delivery checked on GitHub',
  ]);
  assert.deepEqual(protectionLines(view, 'seller', copy).slice(1, 3), [
    'The buyer verifies with World ID · first deal',
    'You verify with World ID',
  ]);
});

test('stake and an off-market price are listed', () => {
  const view = { verify: {}, stakeRequired: true, delivery: 'plain' as const, reasons: ['off_market_price' as const] };
  assert.deepEqual(protectionLines(view, 'buyer', copy, 50).slice(1), ['Seller holds 50% stake', 'Price is well above similar deals']);
});

test('a price well below similar deals says below, not just far', () => {
  const lines = protectionLines({ level: 'watch', verify: {}, reasons: ['below_market_price'] } as never, 'buyer', copy);
  assert.ok(lines.includes('Price is well below similar deals'));
  assert.ok(!lines.includes('Price is well above similar deals'));
});
