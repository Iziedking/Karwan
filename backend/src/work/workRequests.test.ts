import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import { memoryWorkRequestsStore, type WorkOffer, type WorkRequest } from '../db/workRequests.js';
import type { Engagement } from '../db/engagements.js';
import type { WorkInput } from './engagements.js';
import { rankWorkOffers, type WorkRankDeps } from './workRank.js';
import { createWorkRequests, type WorkRequestInput } from './workRequests.js';

/// Hourly work posted to the market (view 32): who is told, who can offer,
/// how the hirer's agent ranks them, and hiring.

const HIRER: Address = '0x1111111111111111111111111111111111111111';
const ADA: Address = '0x2222222222222222222222222222222222222222';
const TUNDE: Address = '0x3333333333333333333333333333333333333333';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 9);

function world(over: { offerFails?: boolean } = {}) {
  let now = T0;
  let n = 0;
  const told: Array<{ to: string; text: string }> = [];
  const hired: Array<{ input: WorkInput; opts: unknown }> = [];
  const store = memoryWorkRequestsStore();
  const core = createWorkRequests({
    store,
    draftWork: async () => ({ ok: true, card: { totalMicros: '201000000' } }),
    offerWork: async (_h, input, opts) => {
      hired.push({ input, opts });
      return over.offerFails ? { ok: false, code: 'BUYER_AGENT_SHORT', message: 'Add 1 USDC' } : { ok: true, work: { id: 'w_1' } as Engagement };
    },
    sellerAgentFor: async (u) => (u === HIRER ? null : { address: `0xa${u.slice(3)}` as Address }),
    keywords: async () => ['bookkeeping', 'quickbooks'],
    reach: async () => [ADA, TUNDE, HIRER],
    rank: async (_r, offers) => offers.map((o, i) => ({
      offerId: o.id, seller: o.seller, name: o.seller, tag: null, verified: false, tier: 'NEW', rating: { kind: 'new', count: 0 },
      reasons: [], recommended: i === 0, rateMicros: o.rateMicros, note: o.note, overMost: false,
    })),
    tellPerson: (to, text) => told.push({ to, text }),
    now: () => now,
    newId: (prefix) => `${prefix}_${++n}`,
  });
  return { core, store, told, hired, at: (ms: number) => { now = ms; } };
}

const books: WorkRequestInput = { kind: 'hourly', title: 'Bookkeeping', brief: 'Monthly books in QuickBooks for a Lagos shop', maxRateUsdc: '10', maxHours: 10, periods: 4 };

test('posting tells the sellers who fit, never the hirer', async () => {
  const { core, told } = world();
  const r = await core.post(HIRER, books);
  assert.ok(r.ok);
  assert.equal(r.request.told, 2);
  assert.deepEqual(told.map((t) => t.to), [ADA, TUNDE]);
  assert.match(told[0]!.text, /up to 10 USDC an hour, 10 hours a week/);
  assert.equal(r.request.startsAt, T0 + 7 * DAY);
});

test('what posting refuses, in words', async () => {
  const { core } = world();
  const code = async (i: Partial<WorkRequestInput>) => {
    const r = await core.post(HIRER, { ...books, ...i });
    return r.ok ? 'ok' : r.code;
  };
  assert.equal(await code({ brief: '' }), 'BAD_TERMS');
  assert.equal(await code({ maxRateUsdc: '0' }), 'BAD_TERMS');
  assert.equal(await code({ maxHours: 0 }), 'BAD_TERMS');
  assert.equal(await code({ startsInDays: 1 }), 'BAD_TERMS');
  assert.equal(await code({ kind: 'monthly', periods: 13 }), 'BAD_TERMS');
});

test('an offer is a rate; offering again changes it; the hirer cannot offer', async () => {
  const { core, store, told } = world();
  const r = await core.post(HIRER, books);
  assert.ok(r.ok);
  const own = await core.offer(HIRER, r.request.id, { rateUsdc: '8' });
  assert.ok(!own.ok && own.code === 'OWN_REQUEST');
  assert.ok((await core.offer(ADA, r.request.id, { rateUsdc: '9', note: 'Five years of QuickBooks' })).ok);
  assert.ok((await core.offer(ADA, r.request.id, { rateUsdc: '8.5' })).ok);
  const offers = await store.offers(r.request.id);
  assert.equal(offers.length, 1, 'one live offer per seller');
  assert.equal(offers[0]!.rateMicros, '8500000');
  assert.ok(told.some((t) => t.to === HIRER && /an offer changed, 8\.5 USDC an hour/.test(t.text)));
});

test('offers close a day before the start, and the request expires then', async () => {
  const { core, told, at } = world();
  const r = await core.post(HIRER, books);
  assert.ok(r.ok);
  at(r.request.startsAt - DAY);
  const late = await core.offer(ADA, r.request.id, { rateUsdc: '9' });
  assert.ok(!late.ok && late.code === 'CLOSED');
  assert.equal(await core.expireDue(), 1);
  assert.ok(told.some((t) => t.to === HIRER && /nobody was hired/.test(t.text)));
  assert.deepEqual(await core.listOpen(), []);
});

test('hiring opens the work on the offered rate with the worker agreeing, and tells the others', async () => {
  const { core, hired, told } = world();
  const r = await core.post(HIRER, books);
  assert.ok(r.ok);
  const a = await core.offer(ADA, r.request.id, { rateUsdc: '9' });
  await core.offer(TUNDE, r.request.id, { rateUsdc: '7' });
  assert.ok(a.ok);
  const h = await core.hire(HIRER, r.request.id, a.offer.id);
  assert.ok(h.ok && h.request.status === 'hired' && h.request.workId === 'w_1');
  assert.equal(hired.length, 1);
  assert.deepEqual(hired[0]!.input, { worker: ADA, kind: 'hourly', rateUsdc: '9', periods: 4, title: 'Bookkeeping', brief: books.brief, startsInDays: 7, maxHours: 10 });
  assert.deepEqual(hired[0]!.opts, { fromJob: r.request.id, fromOffer: a.offer.id, workerAgreed: true });
  assert.ok(told.some((t) => t.to === TUNDE && /chose someone else/.test(t.text)));
  const again = await core.hire(HIRER, r.request.id, a.offer.id);
  assert.ok(!again.ok);
});

test('a hire that does not go through leaves the work open', async () => {
  const { core } = world({ offerFails: true });
  const r = await core.post(HIRER, books);
  assert.ok(r.ok);
  const a = await core.offer(ADA, r.request.id, { rateUsdc: '9' });
  assert.ok(a.ok);
  const h = await core.hire(HIRER, r.request.id, a.offer.id);
  assert.ok(!h.ok && h.code === 'BUYER_AGENT_SHORT');
  assert.equal((await core.view(r.request.id, HIRER))?.status, 'open');
});

test('the hirer sees ranked offers; a seller sees only their own; a stranger neither', async () => {
  const { core } = world();
  const r = await core.post(HIRER, books);
  assert.ok(r.ok);
  await core.offer(ADA, r.request.id, { rateUsdc: '9' });
  const hv = (await core.view(r.request.id, HIRER)) as { offers?: unknown[]; mine: boolean };
  assert.equal(hv.mine, true);
  assert.equal(hv.offers?.length, 1);
  const sv = (await core.view(r.request.id, ADA)) as { offers?: unknown; myOffer?: { rateMicros: string } };
  assert.equal(sv.offers, undefined);
  assert.equal(sv.myOffer?.rateMicros, '9000000');
  const xv = (await core.view(r.request.id, TUNDE)) as { offers?: unknown; myOffer?: unknown };
  assert.equal(xv.offers, undefined);
  assert.equal(xv.myOffer, undefined);
});

test('the agent ranks a strong skill fit with no rating above a weak fit with a high one, and seals the rows', async () => {
  const request: WorkRequest = {
    id: 'wr_1', hirer: HIRER, kind: 'hourly', title: 'Bookkeeping', brief: '', keywords: ['bookkeeping', 'quickbooks', 'reconciliation'],
    maxRateMicros: '10000000', maxHours: 10, periods: 4, startsAt: T0 + 7 * DAY, status: 'open', createdAt: T0, updatedAt: T0,
  };
  const offer = (id: string, seller: Address, rate: string): WorkOffer => ({
    id, requestId: 'wr_1', seller, sellerAgent: `0xa${seller.slice(3)}` as Address, rateMicros: rate, note: '', status: 'live', createdAt: T0, updatedAt: T0,
  });
  const deps: WorkRankDeps = {
    sellerWords: async (u) => (u === ADA ? ['bookkeeping', 'quickbooks', 'reconciliation'] : ['logo', 'design']),
    readRecord: async () => null,
    level: async () => 'registered',
    engine: async (u) => ({ score: u === TUNDE ? 900 : 100, tier: u === TUNDE ? 'TRUSTED' : 'NEW', counts: { completed: u === TUNDE ? 40 : 0, onTimeRate: null, disputesLost: 0 } as never }),
    profile: async (u) => ({ name: u === ADA ? 'Ada' : 'Tunde', tag: null }),
    location: async () => null,
    rating: async (u) => (u === TUNDE ? { kind: 'rated', value: 4.9, count: 40, disputed: 0 } : { kind: 'new', count: 0 }),
    timeoutMs: 100,
    cleanRecordCounts: false,
  };
  const ranked = await rankWorkOffers(request, [offer('o_t', TUNDE, '6000000'), offer('o_a', ADA, '9000000')], deps, T0);
  assert.deepEqual(ranked.map((r) => r.name), ['Ada', 'Tunde']);
  assert.ok(ranked[0]!.reasons.includes('best_fit'));
  for (const row of ranked) {
    assert.equal('score' in row, false);
    assert.equal('counts' in row, false);
  }
});
