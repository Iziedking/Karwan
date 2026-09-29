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
