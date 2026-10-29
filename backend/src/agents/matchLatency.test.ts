import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchLatencySummary, percentile, recordDecision, recordPosted, resetMatchLatency, summarise } from './matchLatency.js';

/// Posted-to-first-decision time per request (view 41, measure 1).
///
///   npx tsx --test src/agents/matchLatency.test.ts

test('the first decision on a request is the one that counts', () => {
  resetMatchLatency();
  recordPosted('0xA', 1_000);
  recordPosted('0xa', 5_000);
  recordDecision('0xa', 4_000);
  recordDecision('0xa', 9_000);
  recordDecision('0xunknown', 9_000);
  const s = matchLatencySummary();
  assert.equal(s.decided, 1);
  assert.equal(s.waiting, 0);
  assert.deepEqual(s.recent, [{ jobId: '0xa', ms: 3_000 }]);
  resetMatchLatency();
});

test('percentiles read the way they are reported', () => {
  const ms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(ms, 50), 5);
  assert.equal(percentile(ms, 95), 10);
  assert.equal(percentile([], 50), null);
  const s = summarise([
    { jobId: 'a', postedAt: 0, decidedAt: 2_000 },
    { jobId: 'b', postedAt: 0, decidedAt: 12_000 },
    { jobId: 'c', postedAt: 0, decidedAt: null },
  ]);
  assert.equal(s.decided, 2);
  assert.equal(s.waiting, 1);
  assert.equal(s.p50Ms, 2_000);
  assert.equal(s.p95Ms, 12_000);
});

test('a decision before the posting time never reads as negative', () => {
  resetMatchLatency();
  recordPosted('0xb', 10_000);
  recordDecision('0xb', 9_000);
  assert.deepEqual(matchLatencySummary().recent, [{ jobId: '0xb', ms: 0 }]);
  resetMatchLatency();
});
