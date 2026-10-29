import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import { memoryWorkRequestsStore } from '../db/workRequests.js';
import type { Engagement } from '../db/engagements.js';
import { createWorkRequests } from '../work/workRequests.js';
import { createWorkRequestRoutes } from './workRequests.js';

/// The posted hourly work routes (view 32): anyone reads it, only the hirer
/// sees the ranked offers, and a seller sees their own.

const HIRER: Address = '0x1111111111111111111111111111111111111111';
const ADA: Address = '0x2222222222222222222222222222222222222222';

function setup() {
  let who: string | null = HIRER;
  let n = 0;
  const core = createWorkRequests({
    store: memoryWorkRequestsStore(),
    draftWork: async () => ({ ok: true, card: { totalMicros: '100500000' } }),
    offerWork: async () => ({ ok: true, work: { id: 'w_9' } as Engagement }),
    sellerAgentFor: async (u) => ({ address: `0xa${u.slice(3)}` as Address }),
    keywords: async () => [],
    reach: async () => [],
    rank: async (_r, offers) => offers.map((o) => ({
      offerId: o.id, seller: o.seller, name: 'Ada', tag: 'ada', verified: true, tier: 'NEW', rating: { kind: 'new', count: 0 },
      reasons: ['best_fit'], recommended: true, rateMicros: o.rateMicros, note: o.note, overMost: false,
    })),
    tellPerson: () => {},
    now: () => Date.UTC(2026, 10, 2),
    newId: (prefix) => `${prefix}_${++n}`,
  });
  const app = createWorkRequestRoutes({ core, session: () => (who ? { address: who } : null) });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { call, as: (a: string | null) => { who = a; } };
}

const post = { kind: 'hourly', title: 'Bookkeeping', brief: 'Monthly books', maxRateUsdc: '10', maxHours: 10, periods: 4 };

test('anyone reads the work; only the hirer sees the ranked offers', async () => {
  const { call, as } = setup();
  const r = (await (await call('POST', '/', post)).json()) as { request: { id: string } };
  as(ADA);
  assert.equal((await call('POST', `/${r.request.id}/offers`, { rateUsdc: '9', note: 'QuickBooks' })).status, 200);
  const seller = (await (await call('GET', `/${r.request.id}`)).json()) as { request: { offers?: unknown; myOffer?: { rateMicros: string } } };
  assert.equal(seller.request.offers, undefined);
  assert.equal(seller.request.myOffer?.rateMicros, '9000000');
  as(null);
  const visitor = (await (await call('GET', `/${r.request.id}`)).json()) as { request: { offers?: unknown; title: string } };
  assert.equal(visitor.request.title, 'Bookkeeping');
  assert.equal(visitor.request.offers, undefined);
  assert.equal((await call('POST', `/${r.request.id}/offers`, { rateUsdc: '9' })).status, 401);
  as(HIRER);
  const hirer = (await (await call('GET', `/${r.request.id}`)).json()) as { request: { offers: Array<{ offerId: string; name: string }> } };
  assert.equal(hirer.request.offers[0]!.name, 'Ada');
  const card = (await (await call('POST', `/${r.request.id}/hire/card`, { offerId: hirer.request.offers[0]!.offerId })).json()) as { card: { totalMicros: string } };
  assert.equal(card.card.totalMicros, '100500000');
  const hired = (await (await call('POST', `/${r.request.id}/hire`, { offerId: hirer.request.offers[0]!.offerId })).json()) as { workId: string };
  assert.equal(hired.workId, 'w_9');
});

test('a refusal is worded, and an unknown id is a 404', async () => {
  const { call } = setup();
  const bad = await call('POST', '/', { ...post, brief: '' });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /what the work is/);
  assert.equal((await call('GET', '/wr_nope')).status, 404);
});
