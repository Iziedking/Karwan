import assert from 'node:assert/strict';
import test from 'node:test';
import { createRatingRoutes } from './ratings.js';

/// The deal page's rating read says whether you rated and what you received.
///
///   node ../scripts/run-tests.mjs src/routes/ratings.test.ts

const routes = createRatingRoutes({
  viewer: () => '0xs',
  rateDeal: async () => ({ ok: true, revealed: true, message: 'Saved.' }),
  waiting: async () => [],
  hasRated: async () => false,
  receivedRating: async (caller, dealId) => (caller === '0xs' && dealId === 'd1' ? { stars: 5, note: 'Fast' } : null),
});

test('the rating read carries the rating you received', async () => {
  const one = (await (await routes.request('/d1/rating')).json()) as { rated: boolean; received: unknown };
  assert.deepEqual(one, { rated: false, received: { stars: 5, note: 'Fast' } });
  const none = (await (await routes.request('/d2/rating')).json()) as { received: unknown };
  assert.equal(none.received, null);
});
