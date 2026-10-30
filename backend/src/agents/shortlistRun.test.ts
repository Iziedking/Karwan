import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidates, type ShortlistDeps } from './shortlistRun.js';

const zero = { completed: 0, onTimeRate: null, disputesWon: 0, disputesLost: 0, cancelled: 0 };
const deps = (over: Partial<ShortlistDeps> = {}): ShortlistDeps => ({
  readRecord: async () => ({ counts: { ...zero, completed: 9, onTimeRate: 90 }, score: 81 }),
  level: async () => 'work_verified',
  engine: async () => ({ score: 700, tier: 'STRONG', counts: zero }),
  profile: async () => ({ name: 'Ada', tag: 'ada' }),
  location: async () => null,
  rating: async () => ({ kind: 'new', count: 0 }),
  timeoutMs: 50,
  ...over,
});
const bid = (seller: string) => ({ seller, sellerUserAddress: `${seller}u`, priceUsdc: '80', deadlineUnix: 1_000 + 5 * 86_400, topicalMatch: 80, deterministicScore: 50 });
const input = (bids: ReturnType<typeof bid>[]) => ({ jobId: 'j', buyerAgent: 'b', buyerUser: 'bu', bids, nowUnix: 1_000 });

test('a successful read replaces the free counts and score and marks the row checked', async () => {
  const [c] = await buildCandidates(input([bid('s')]), deps());
  assert.equal(c!.recordChecked, true);
  assert.equal(c!.counts.completed, 9);
  assert.equal(c!.engineScore, 810);
  assert.equal(c!.deliveryDays, 5);
  assert.equal(c!.matchBand, 3);
  assert.equal(c!.sellerUser, 'su');
});

test('a slow read falls back to free data', async () => {
  const slow = deps({ readRecord: () => new Promise((r) => setTimeout(() => r(null), 500)) });
  const [c] = await buildCandidates(input([bid('s')]), slow);
  assert.equal(c!.recordChecked, false);
  assert.equal(c!.counts.completed, 0);
  assert.equal(c!.engineScore, 700);
});

test('a read that throws falls back to free data', async () => {
  const [c] = await buildCandidates(input([bid('s')]), deps({ readRecord: async () => { throw new Error('x402 down'); } }));
  assert.equal(c!.recordChecked, false);
});

test('reads run for at most five bids, and every bid is a candidate (view 41, decision 12)', async () => {
  let calls = 0;
  const counting = deps({ readRecord: async () => { calls += 1; return null; } });
  const out = await buildCandidates(input(Array.from({ length: 8 }, (_, i) => bid(`s${i}`))), counting);
  assert.equal(calls, 5);
  assert.equal(out.length, 8);
  assert.ok(out.slice(5).every((c) => !c.recordChecked));
});

test('a candidate carries whether its agent is linked to its owner', async () => {
  const out = await buildCandidates(input([bid('a'), bid('b')]), deps({ linked: async (agent) => agent !== 'b' }));
  assert.deepEqual(out.map((c) => c.linked), [true, false]);
  const [plain] = await buildCandidates(input([bid('a')]), deps());
  assert.equal(plain!.linked, true, 'without a link check every agent counts as linked');
});

test('location fit and country come from the seller\'s private location and the request', async () => {
  const lagos = { country: 'NG', city: 'Lagos', area: null, reach: {} };
  const [c] = await buildCandidates(
    { ...input([bid('s')]), where: { scope: 'near' as const }, deliveryKind: 'goods' as const, buyerLocation: lagos },
    deps({ location: async () => ({ ...lagos }) }),
  );
  assert.equal(c!.locationFit, 3);
  assert.equal(c!.country, 'NG');
});

test('without a where every seller fits the same', async () => {
  const [c] = await buildCandidates(input([bid('s')]), deps({ location: async () => ({ country: 'GH', city: null, area: null, reach: {} }) }));
  assert.equal(c!.locationFit, 1);
});

test('each candidate carries the seller\'s public rating', async () => {
  const [c] = await buildCandidates(input([bid('s')]), deps({ rating: async () => ({ kind: 'rated', value: 4.5, count: 6 }) }));
  assert.deepEqual(c!.rating, { kind: 'rated', value: 4.5, count: 6 });
});
