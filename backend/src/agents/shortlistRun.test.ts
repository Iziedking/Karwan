import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidates, type ShortlistDeps } from './shortlistRun.js';

const zero = { completed: 0, onTimeRate: null, disputesWon: 0, disputesLost: 0, cancelled: 0 };
const deps = (over: Partial<ShortlistDeps> = {}): ShortlistDeps => ({
  readRecord: async () => ({ counts: { ...zero, completed: 9, onTimeRate: 90 }, score: 81 }),
  level: async () => 'work_verified',
  engine: async () => ({ score: 700, tier: 'STRONG', counts: zero }),
  profile: async () => ({ name: 'Ada', tag: 'ada' }),
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

test('reads run for at most five bids', async () => {
  let calls = 0;
  const counting = deps({ readRecord: async () => { calls += 1; return null; } });
  const out = await buildCandidates(input(Array.from({ length: 8 }, (_, i) => bid(`s${i}`))), counting);
  assert.equal(calls, 5);
  assert.equal(out.length, 5);
});
