import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDirectOffer,
  listDirectOffers,
  findPendingDirectOfferByAgent,
  setDirectOfferState,
  getDirectOffer,
  countLiveDirectOffers,
  __resetDirectOffersForTest,
} from './directOffers.js';

const base = {
  jobId: '0x' + '1'.repeat(64),
  sellerUser: '0xaaa',
  sellerAgent: '0xa9e',
  priceUsdc: '280',
  deliverByUnix: 1_500_000,
  note: 'n',
  lapsesAt: 1_600_000,
  createdAt: 1_000_000,
};

test('create is idempotent per seller per request while pending', async () => {
  __resetDirectOffersForTest();
  const a = await createDirectOffer(base);
  const b = await createDirectOffer({ ...base, priceUsdc: '250' });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(b.offer.id, a.offer.id);
  assert.equal(b.offer.priceUsdc, '280');
  assert.equal((await listDirectOffers(base.jobId)).length, 1);
});

test('after a failure or withdrawal the seller can offer again', async () => {
  __resetDirectOffersForTest();
  const a = await createDirectOffer(base);
  await setDirectOfferState(a.offer.id, 'failed', { failure: 'job-not-open' });
  const b = await createDirectOffer(base);
  assert.equal(b.created, true);
  assert.notEqual(b.offer.id, a.offer.id);
  assert.equal((await getDirectOffer(a.offer.id))?.failure, 'job-not-open');
});

test('counts live offers per request, skipping lapsed and non-pending ones', async () => {
  __resetDirectOffersForTest();
  const other = '0x' + '9'.repeat(64);
  await createDirectOffer(base);
  const b = await createDirectOffer({ ...base, sellerUser: '0xbbb' });
  await setDirectOfferState(b.offer.id, 'withdrawn');
  await createDirectOffer({ ...base, sellerUser: '0xccc', lapsesAt: 900_000 });
  await createDirectOffer({ ...base, jobId: other, sellerUser: '0xddd' });
  const counts = await countLiveDirectOffers([base.jobId, other, '0xnone'], 1_000_000);
  assert.equal(counts.get(base.jobId), 1);
  assert.equal(counts.get(other), 1);
  assert.equal(counts.get('0xnone') ?? 0, 0);
});

test('find by agent only returns pending offers, agent address compared case-insensitively', async () => {
  __resetDirectOffersForTest();
  const a = await createDirectOffer(base);
  assert.equal((await findPendingDirectOfferByAgent(base.jobId, '0xA9E'))?.id, a.offer.id);
  await setDirectOfferState(a.offer.id, 'withdrawn');
  assert.equal(await findPendingDirectOfferByAgent(base.jobId, '0xa9e'), null);
});

test('review #2: a lapsed pending offer no longer blocks a new one from the same seller', async () => {
  __resetDirectOffersForTest();
  const a = await createDirectOffer({ ...base, lapsesAt: 1_100_000 });
  const b = await createDirectOffer({ ...base, createdAt: 1_200_000, lapsesAt: 1_800_000 });
  assert.equal(b.created, true);
  assert.equal((await getDirectOffer(a.offer.id))?.state, 'lapsed');
});

test('review #3: a state change can be made conditional on the current state', async () => {
  __resetDirectOffersForTest();
  const a = await createDirectOffer(base);
  assert.equal(await setDirectOfferState(a.offer.id, 'accepted', { onlyFrom: 'pending' }), true);
  assert.equal(await setDirectOfferState(a.offer.id, 'withdrawn', { onlyFrom: 'pending' }), false);
  assert.equal((await getDirectOffer(a.offer.id))?.state, 'accepted');
});
