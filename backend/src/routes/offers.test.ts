import assert from 'node:assert/strict';
import test from 'node:test';
import { offersRoutes, __test } from './offers.js';
import { __resetDirectOffersForTest } from '../db/directOffers.js';
import type { OfferDeps } from '../offers/service.js';
import type { MatchProposal } from '../db/matchProposals.js';

const JOB = '0x' + '3'.repeat(64);
let signedIn: string | null = '0xseller';
__test.setSession(() => signedIn);
const deps: OfferDeps = {
  now: () => 1_000_000,
  brief: () => ({ postedBy: '0xbuyer' }),
  job: () => ({ budgetUsdc: '300', deadlineUnix: 2_000_000, open: true, termsHash: '0xt', buyerAgent: '0xbagent' }),
  wallets: async (u) =>
    u === '0xseller' ? { userAddress: u, sellerWalletId: 'w', sellerAddress: '0xsagent' } : { userAddress: u, buyerAddress: '0xbagent' },
  bid: async () => ({ ok: true as const, txHash: '0xtx' }),
  getProposal: async () => proposal,
  upsertProposal: async (p) => (proposal = p),
  deleteProposal: async () => {
    proposal = null;
  },
  approve: async () => ({ ok: true as const, txHash: '0xfund' }),
  publicRequest: () => null,
  withdrawAgentBid: () => false,
  fundedUsdc: async (p) => p,
};
let proposal: MatchProposal | null = null;
__test.setDeps(deps);

const post = (path: string, body: unknown = {}) =>
  offersRoutes.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const body = { priceUsdc: '280', deliverByUnix: 1_500_000, note: 'Three routes.' };

test('signed out cannot offer', async () => {
  __resetDirectOffersForTest();
  signedIn = null;
  assert.equal((await post(`/${JOB}/offers`, body)).status, 401);
  signedIn = '0xseller';
});

test('create returns 201 then 200 on retry', async () => {
  __resetDirectOffersForTest();
  assert.equal((await post(`/${JOB}/offers`, body)).status, 201);
  assert.equal((await post(`/${JOB}/offers`, body)).status, 200);
});

test('bad body is 400', async () => {
  assert.equal((await post(`/${JOB}/offers`, { priceUsdc: 280 })).status, 400);
});

test('a rule failure keeps its code', async () => {
  __resetDirectOffersForTest();
  const r = await post(`/${JOB}/offers`, { ...body, priceUsdc: '0' });
  assert.equal(r.status, 400);
  assert.equal(((await r.json()) as { code: string }).code, 'BAD_PRICE');
});

test('public read shows only the count', async () => {
  __resetDirectOffersForTest();
  await post(`/${JOB}/offers`, body);
  signedIn = null;
  const r = (await (await offersRoutes.request(`/${JOB}/offers`)).json()) as { count: number; offers: unknown[]; role: string };
  assert.equal(r.count, 1);
  assert.deepEqual(r.offers, []);
  assert.equal(r.role, 'visitor');
  signedIn = '0xseller';
});

test('seller cannot accept; buyer can', async () => {
  __resetDirectOffersForTest();
  const { offer } = (await (await post(`/${JOB}/offers`, body)).json()) as { offer: { id: string } };
  assert.equal((await post(`/${JOB}/offers/${offer.id}/accept`)).status, 403);
  signedIn = '0xbuyer';
  const r = await post(`/${JOB}/offers/${offer.id}/accept`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, txHash: '0xfund' });
  signedIn = '0xseller';
});

test('seller withdraws their own offer', async () => {
  __resetDirectOffersForTest();
  const { offer } = (await (await post(`/${JOB}/offers`, body)).json()) as { offer: { id: string } };
  assert.equal((await post(`/${JOB}/offers/${offer.id}/withdraw`)).status, 200);
  assert.equal((await post(`/${JOB}/offers/${offer.id}/withdraw`)).status, 409);
});
