import assert from 'node:assert/strict';
import test from 'node:test';
import { createReputationSourcesRoutes } from './reputationSources.js';
import type { ReputationSources } from '../reputation/consent.js';

const ADA = '0x00000000000000000000000000000000000000aa';
const TUNDE = '0x00000000000000000000000000000000000000bb';

function app(self: string) {
  const store = new Map<string, { reputationSources?: Partial<ReputationSources> }>();
  const routes = createReputationSourcesRoutes({
    isSelf: (_c, address) => address.toLowerCase() === self,
    load: async (a) => store.get(a.toLowerCase()) ?? null,
    save: async (a, s) => void store.set(a, { reputationSources: s }),
    readers: async () => [{ reader: TUNDE, purpose: 'shortlist', createdAt: 5 }],
    nameOf: async () => ({ name: 'Tunde', tag: 'tunde' }),
    readsBalance: async () => 0.07,
    now: () => 99,
  });
  return { routes, store };
}

test('another account cannot read or change consent', async () => {
  const { routes } = app(ADA);
  assert.equal((await routes.request(`/?address=${TUNDE}`)).status, 403);
  const put = await routes.request('/', { method: 'PUT', body: JSON.stringify({ address: TUNDE, outsideReadable: true }), headers: { 'content-type': 'application/json' } });
  assert.equal(put.status, 403);
});

test('the owner turns consent on and sees readers and balance', async () => {
  const { routes } = app(ADA);
  const put = await routes.request('/', { method: 'PUT', body: JSON.stringify({ address: ADA, outsideReadable: true }), headers: { 'content-type': 'application/json' } });
  assert.equal(put.status, 200);
  const body = await (await routes.request(`/?address=${ADA}`)).json();
  assert.equal(body.sources.outsideReadable, true);
  assert.equal(body.sources.acceptedAt, 99);
  assert.deepEqual(body.connected, ['karwan']);
  assert.deepEqual(body.readers, [{ name: 'Tunde', tag: 'tunde', purpose: 'shortlist', at: 5 }]);
  assert.equal(body.readsBalanceUsdc, 0.07);
});

test('a malformed body is refused', async () => {
  const { routes } = app(ADA);
  const res = await routes.request('/', { method: 'PUT', body: 'nope', headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 400);
});
