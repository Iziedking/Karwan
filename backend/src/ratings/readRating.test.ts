import assert from 'node:assert/strict';
import test from 'node:test';
import { readRating, type ReadRatingDeps } from './readRating.js';
import type { PublicRating } from './rules.js';

/// The free rating read (view 93): any agent, any channel, never the record.
///
///   npx tsx --test src/ratings/readRating.test.ts

const rated: PublicRating = { kind: 'rated', value: 4.6, count: 31, disputed: 1, forWork: { value: 4.8, count: 6, rank: 4.81 } };
const deps = (rating: PublicRating = rated, seen: string[][] = []): ReadRatingDeps => ({
  byTag: async (tag) => (tag === 'ada' ? '0xada' : null),
  load: async (_address, request) => {
    seen.push(request);
    return rating;
  },
});

test('readRating never returns record fields', async () => {
  const r = await readRating('@Ada', 'made-to-measure suit', deps());
  assert.deepEqual(r, { ok: true, tag: 'ada', rating: { kind: 'rated', stars: 4.6, count: 31, disputed: 1, likeThis: { stars: 4.8, count: 6 } } });
  const text = JSON.stringify(r);
  for (const field of ['score', 'onTimeRate', 'completed', 'disputesLost', 'rank']) assert.ok(!text.includes(field), field);
});

test('unknown tag is not found', async () => {
  assert.deepEqual(await readRating('nobody', undefined, deps()), { ok: false, error: 'not_found' });
});

test('the work text is split into the words find uses', async () => {
  const seen: string[][] = [];
  await readRating('ada', 'Made-to-measure SUIT for a wedding', deps(rated, seen));
  assert.deepEqual(seen[0], ['made', 'measure', 'suit', 'for', 'wedding']);
  await readRating('ada', undefined, deps(rated, seen));
  assert.deepEqual(seen[1], []);
});

test('a new person and a rating with no close deals', async () => {
  assert.deepEqual(await readRating('ada', undefined, deps({ kind: 'new', count: 2 })), { ok: true, tag: 'ada', rating: { kind: 'new', count: 2 } });
  const none = await readRating('ada', 'logo', deps({ kind: 'rated', value: 4.6, count: 31, disputed: 0, forWork: { value: 4.6, count: 0, rank: 4.6 } }));
  assert.deepEqual(none, { ok: true, tag: 'ada', rating: { kind: 'rated', stars: 4.6, count: 31, disputed: 0, likeThis: null } });
});
