import assert from 'node:assert/strict';
import test from 'node:test';
import { createRatingRoutes } from '../routes/ratings.js';
import { ratingTools, type RatingToolDeps } from './ratingTools.js';

/// Rating a deal from any chat or from the deal page goes through one function.
///
///   npx tsx --test src/assistant/ratingTools.test.ts

const call = { toolCallId: 't1', messages: [] };

function setup() {
  const calls: Array<[string, string, number, string | undefined]> = [];
  const deps: RatingToolDeps = {
    rateDeal: async (caller, dealId, stars, note) => {
      calls.push([caller, dealId, stars, note]);
      return { ok: true, revealed: true, message: 'Saved.' };
    },
    waiting: async () => [{ dealId: 'd1', withTag: 'ada', settledAt: 1_760_000_000_000 }],
    hasRated: async (_caller, dealId) => dealId === 'done',
  };
  return { deps, calls };
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('the route and the tool both call rateDeal', async () => {
  const s = setup();
  const out = (await ratingTools('0xb', s.deps).rate_deal.execute!({ dealId: 'd1', stars: 5, note: 'Great' }, call)) as Record<string, unknown>;
  assert.equal(out.saved, true);
  const app = createRatingRoutes({ ...s.deps, viewer: () => '0xb' });
  const res = await app.request('/d1/rating', post({ stars: 4 }));
  assert.equal(res.status, 200);
  assert.deepEqual(s.calls, [['0xb', 'd1', 5, 'Great'], ['0xb', 'd1', 4, undefined]]);
});

test('the rating route needs a session', async () => {
  const s = setup();
  const app = createRatingRoutes({ ...s.deps, viewer: () => null });
  assert.equal((await app.request('/d1/rating', post({ stars: 4 }))).status, 401);
  assert.equal((await app.request('/d1/rating')).status, 401);
  assert.equal(s.calls.length, 0);
});

test('a refused rating is a 400 with the plain reason', async () => {
  const s = setup();
  const app = createRatingRoutes({
    ...s.deps,
    rateDeal: async () => ({ ok: false, message: 'You already rated this deal.' }),
    viewer: () => '0xb',
  });
  const res = await app.request('/d1/rating', post({ stars: 4 }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'You already rated this deal.' });
});

test('the deal page learns whether you rated already', async () => {
  const s = setup();
  const app = createRatingRoutes({ ...s.deps, viewer: () => '0xb' });
  assert.deepEqual(await (await app.request('/done/rating')).json(), { rated: true });
  assert.deepEqual(await (await app.request('/d1/rating')).json(), { rated: false });
});

test('the agent can list the deals waiting for a rating, by tag', async () => {
  const s = setup();
  const out = await ratingTools('0xb', s.deps).my_ratings_to_give.execute!({}, call);
  assert.deepEqual(out, { waiting: [{ dealId: 'd1', with: '@ada', settled: new Date(1_760_000_000_000).toISOString() }] });
});
