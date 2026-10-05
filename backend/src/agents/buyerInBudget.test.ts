import assert from 'node:assert/strict';
import test from 'node:test';
import { inBudgetBidOf } from './buyer.js';

const A = '0x' + 'a'.repeat(40) as `0x${string}`;
const B = '0x' + 'b'.repeat(40) as `0x${string}`;
const C = '0x' + 'c'.repeat(40) as `0x${string}`;

function state(prices: Record<string, string>, tried: string[] = []) {
  const bids = new Map(Object.entries(prices).map(([seller, priceUsdc]) => [
    seller as `0x${string}`,
    { seller: seller as `0x${string}`, priceUsdc, priceWei: 0n, deadlineUnix: 0 },
  ]));
  return { bids, triedSellers: new Set(tried as `0x${string}`[]), finalized: false, expired: false } as never;
}

test('returns the cheapest live offer within the ceiling', () => {
  assert.deepEqual(inBudgetBidOf(state({ [A]: '359.93', [B]: '200', [C]: '290' }), 300, A), { seller: B, priceUsdc: 200 });
});

test('ignores the seller being asked about, tried sellers and offers over the ceiling', () => {
  assert.equal(inBudgetBidOf(state({ [A]: '200', [B]: '359' }), 300, A), null);
  assert.equal(inBudgetBidOf(state({ [B]: '200' }, [B]), 300, A), null);
});
