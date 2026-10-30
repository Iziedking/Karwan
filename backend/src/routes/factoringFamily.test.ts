import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import type { Hex } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import type { FactoringOffer } from '../db/factoring.js';
import type { FamilyFinancing, Receivable } from '../money/familyFinancing.js';
import { createFamilyOpenRoutes, familyAccept, familyOffer, familyOfferView, familyRequest, legacyRefusal, type FamilyRouteDeps } from './factoringFamily.js';

/// The factoring routes on a family deal (view 18): one branch to the core.

const SELLER = '0x5e11e5000000000000000000000000000000005e';
const FIN = '0xf100000000000000000000000000000000000f10';
const deal = (over: Partial<DirectDeal> = {}) =>
  ({ jobId: '0xjob', buyer: '0xb0', seller: SELLER, tradeLane: 'finance', escrowVersion: 'suite', escrowDealId: `0x${'11'.repeat(32)}`, dealAmountUsdc: '150', acceptedAt: 1, factoringRequestedAt: 1, ...over }) as DirectDeal;
const receivable: Receivable = { asset: '0x36' as Hex, seller: '0xa9' as Hex, unpaid: 150_000_000n, horizon: 1n, open: true, financeable: true };

function deps(over: Partial<FamilyFinancing> = {}) {
  const seen: Record<string, unknown[]> = { create: [], take: [], patch: [], notify: [] };
  const core = {
    createFamilyOffer: async (i: unknown) => { seen.create!.push(i); return { offer: { id: 'o1' } as FactoringOffer }; },
    takeOffer: async (i: unknown) => { seen.take!.push(i); return { state: 'awaiting_financier' as const, deadline: 5 }; },
    prepareOpenCalls: async () => ({ calls: [{ to: '0x01' as Hex, data: '0x02' as Hex }] }),
    completeOpen: async () => ({ state: 'accepted' as const }),
    ...over,
  } as FamilyFinancing;
  const d: FamilyRouteDeps = {
    core,
    receivable: async () => receivable,
    sellerReady: async () => true,
    listOffers: async () => [],
    patchDeal: async (jobId, p) => { seen.patch!.push([jobId, p]); return deal(p as Partial<DirectDeal>); },
    notifyFinanciers: async (dl) => { seen.notify!.push(dl.jobId); },
    freeGuarantee: async () => 4_000_000n,
  };
  return { d, seen };
}

test('a family deal is asked for before delivery', async () => {
  const { d, seen } = deps();
  const r = await familyRequest(d, { deal: deal({ delivered: false } as Partial<DirectDeal>), caller: SELLER, requestedAdvanceUsdc: '120' });
  assert.equal(r.status, 200);
  const [, patch] = seen.patch![0] as [string, Record<string, unknown>];
  assert.equal(patch.factoringRequestedAdvanceUsdc, '120');
  assert.ok(typeof patch.factoringRequestedAt === 'number');
  assert.deepEqual(seen.notify, ['0xjob']);
});

test('a request above what the deal still owes is refused', async () => {
  const { d } = deps();
  const r = await familyRequest(d, { deal: deal(), caller: SELLER, requestedAdvanceUsdc: '151' });
  assert.equal(r.status, 400);
});

test('a person-to-person deal cannot ask', async () => {
  const { d } = deps();
  const r = await familyRequest(d, { deal: deal({ tradeLane: 'service' }), caller: SELLER });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'not_business');
});

test('older escrows take no new lines', () => {
  assert.deepEqual(legacyRefusal({ escrowVersion: 'v2' } as DirectDeal), { status: 409, body: { error: 'Getting paid early now runs on new deals only. This deal finishes as it is.', code: 'FINANCING_MOVED' } });
  assert.equal(legacyRefusal({} as DirectDeal)?.body.code, 'FINANCING_MOVED');
  assert.equal(legacyRefusal({ escrowVersion: 'v3' } as DirectDeal)?.body.code, 'FINANCING_NOT_ON_V3');
  assert.equal(legacyRefusal(deal()), null);
});

test('a family offer needs no transfer authorization and carries the hold, 10% by default', async () => {
  const { d, seen } = deps();
  const r = await familyOffer(d, { deal: deal(), financier: FIN, offeredAdvanceUsdc: '120', expectedReturnUsdc: '123.6', expiresInHours: 24, walletId: 'w-fin' });
  assert.equal(r.status, 200);
  assert.deepEqual(seen.create![0], { jobId: '0xjob', financier: FIN, advance: 120_000_000n, repay: 123_600_000n, stake: 12_000_000n, walletId: 'w-fin', expiresInHours: 24 });
  await familyOffer(d, { deal: deal(), financier: FIN, offeredAdvanceUsdc: '120', expectedReturnUsdc: '123.6', stakeUsdc: '20', expiresInHours: 24 });
  assert.equal((seen.create![1] as { stake: bigint }).stake, 20_000_000n);
});

test('an offer before the seller asked is refused', async () => {
  const { d } = deps();
  const r = await familyOffer(d, { deal: deal({ factoringRequestedAt: undefined }), financier: FIN, offeredAdvanceUsdc: '120', expectedReturnUsdc: '123.6', expiresInHours: 24 });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'not_requested');
});

test('a core refusal comes back as 409 with its code and gap', async () => {
  const { d } = deps({ takeOffer: async () => ({ refused: 'Put up 8 USDC more', code: 'guarantee_short', gapMicros: '8000000' }) });
  const r = await familyAccept(d, { offerId: 'o1', seller: SELLER, putUpGap: false });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'Put up 8 USDC more', code: 'guarantee_short', gapMicros: '8000000' });
});

test('accept passes putUpGap to the core', async () => {
  const { d, seen } = deps();
  const r = await familyAccept(d, { offerId: 'o1', seller: SELLER, putUpGap: true });
  assert.equal(r.status, 200);
  assert.deepEqual(seen.take![0], { offerId: 'o1', seller: SELLER, putUpGap: true });
  assert.deepEqual(r.body, { state: 'awaiting_financier', deadline: 5 });
});

function app(core: Partial<FamilyFinancing>, address: string | null) {
  const { d } = deps(core);
  const a = new Hono();
  a.route('/api/factoring', createFamilyOpenRoutes({ core: () => d.core, session: () => (address ? { address } : null) }));
  return a;
}

test('the open routes say early payment is not set up until it is wired at startup', async () => {
  let core: FamilyFinancing | null = null;
  const { d } = deps({ prepareOpenCalls: async () => ({ calls: [] }) });
  const a = new Hono();
  a.route('/api/factoring', createFamilyOpenRoutes({ core: () => core, session: () => ({ address: FIN }) }));
  const before = await a.request('/api/factoring/offers/o1/open', { method: 'POST' });
  assert.equal(before.status, 503);
  assert.deepEqual(await before.json(), { error: 'getting paid early is not set up here' });
  core = d.core;
  const after = await a.request('/api/factoring/offers/o1/open', { method: 'POST' });
  assert.equal(after.status, 200);
});

test('open returns the calls to the signed-in financier', async () => {
  let asked: unknown;
  const a = app({ prepareOpenCalls: async (i) => { asked = i; return { calls: [{ to: '0x01', data: '0x02' }] }; } }, FIN);
  const res = await a.request('/api/factoring/offers/o1/open', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { calls: [{ to: '0x01', data: '0x02' }] });
  assert.deepEqual(asked, { offerId: 'o1', financier: FIN });
});

test('open needs a session, and a refusal is 409', async () => {
  assert.equal((await app({}, null).request('/api/factoring/offers/o1/open', { method: 'POST' })).status, 401);
  const refused = app({ prepareOpenCalls: async () => ({ refused: 'gone', code: 'expired' }) }, FIN);
  const res = await refused.request('/api/factoring/offers/o1/open', { method: 'POST' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'expired');
});

test('complete returns accepted and refuses a bad hash', async () => {
  const a = app({}, FIN);
  const ok = await a.request('/api/factoring/offers/o1/open/complete', { method: 'POST', body: JSON.stringify({ txHash: `0x${'ab'.repeat(32)}` }), headers: { 'content-type': 'application/json' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { state: 'accepted' });
  const bad = await a.request('/api/factoring/offers/o1/open/complete', { method: 'POST', body: JSON.stringify({ txHash: 'nope' }), headers: { 'content-type': 'application/json' } });
  assert.equal(bad.status, 400);
});

test('the seller sees the hold, the gap and whether the financier still has to pay', () => {
  const o = { rail: 'family', stakeMicros: '12000000', status: 'offered' } as FactoringOffer;
  assert.deepEqual(familyOfferView(o, 4_000_000n), { holdUsdc: '12', gapUsdc: '8', waitingForFinancier: false });
  assert.deepEqual(familyOfferView(o, 50_000_000n), { holdUsdc: '12', waitingForFinancier: false });
  assert.deepEqual(familyOfferView({ ...o, status: 'awaiting_financier', sellerDeadline: 9 }, 0n), { holdUsdc: '12', waitingForFinancier: true, sellerDeadline: 9 });
  assert.deepEqual(familyOfferView({ status: 'offered' } as FactoringOffer, 0n), {});
});

test('a refused ask says why, and tells an own-wallet seller where the record is set up', async () => {
  const { d } = deps();
  d.sellerReady = async () => false;
  const held = await familyRequest(d, { deal: deal(), caller: SELLER });
  assert.equal(held.status, 409);
  assert.deepEqual(held.body, { error: 'Your Karwan record is still being set up. Try again in a moment.', code: 'record_not_ready' });
  const own = await familyRequest(d, { deal: deal(), caller: SELLER, ownWallet: true });
  assert.equal(own.body.code, 'record_not_ready');
  assert.match(String(own.body.error), /not set up yet.*website/);
  const service = await familyRequest(d, { deal: deal({ tradeLane: 'service' }), caller: SELLER, ownWallet: true });
  assert.deepEqual(service.body, { error: 'Getting paid early is for business orders.', code: 'not_business' });
});
