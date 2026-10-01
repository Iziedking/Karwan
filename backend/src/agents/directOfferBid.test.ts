import assert from 'node:assert/strict';
import test from 'node:test';
import { isDirectOfferBid, __directOfferTest } from './buyer.js';

test('a bid is a direct offer only when a pending row exists for that agent', async () => {
  __directOfferTest.setLookup(async (jobId, agent) => (jobId === '0xj' && agent === '0xa9e' ? { id: 'o1' } : null));
  assert.equal(await isDirectOfferBid('0xj', '0xA9E'), true);
  assert.equal(await isDirectOfferBid('0xj', '0xother'), false);
});

test('a lookup failure is treated as a normal bid, never a crash', async () => {
  __directOfferTest.setLookup(async () => {
    throw new Error('db down');
  });
  assert.equal(await isDirectOfferBid('0xj', '0xa9e'), false);
});

test("review #4: a listing auto-bid never overwrites the seller's own pending direct offer", async () => {
  const { submitListingBid, __listingBidTest } = await import('./seller.js');
  __listingBidTest.setDirectOfferLookup(async (jobId, agent) => (jobId === '0xj' && agent === '0xa9e' ? { id: 'o1' } : null));
  const r = await submitListingBid(
    { jobId: '0xj', deadlineUnix: 2_000_000 } as never,
    { walletId: 'w', address: '0xA9E' } as never,
    { askingPriceUsdc: 100, floorUsdc: 90, description: 'd' },
  );
  assert.deepEqual(r.ok ? 'bid' : r.reason, 'direct-offer-pending');
});

test("one offer per seller: the agent never bids on a request where the seller already sent their own offer", async () => {
  const { __listingBidTest } = await import('./seller.js');
  const { bus } = await import('../events.js');
  __listingBidTest.setDirectOfferLookup(async (jobId, agent) => (jobId === '0xj' && agent === '0xa9e' ? { id: 'o1' } : null));
  const skipped: unknown[] = [];
  const off = bus.subscribe((e) => {
    if (e.type === 'agent.skipped') skipped.push(e.payload?.reason);
  });
  try {
    await __listingBidTest.evaluateAndBid(
      { walletId: 'w', address: '0xA9E', minBudgetUsdc: 1, maxBudgetUsdc: 1000, minDeadlineDays: 1, maxDeadlineDays: 60 } as never,
      { jobId: '0xj', budgetUsdc: '145', deadlineUnix: Math.floor(Date.now() / 1000) + 14 * 86_400 } as never,
    );
  } finally {
    off();
  }
  assert.deepEqual(skipped, ['seller-own-offer']);
});
