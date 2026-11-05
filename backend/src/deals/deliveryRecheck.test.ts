import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { recheckDelivery, RECHECK_DELAYS_MS, type RecheckDeps } from './deliveryRecheck.js';

/// A delivery check that gave no verdict runs again (view 43, owner 5 Nov 2026).
///
///   npx tsx --test src/deals/deliveryRecheck.test.ts

const deal = (over: Record<string, unknown> = {}) => ({
  jobId: '0xjob',
  terms: 'teach me how to program',
  delivered: true,
  deliveryProof: 'https://example.com/work',
  deliveryRevision: 1,
  deliveryMatch: { verdict: 'unknown', reason: '' },
  deliveryHistory: [{ revision: 1, submittedAt: 1, deliveryProof: 'https://example.com/work', deliveryMatch: { verdict: 'unknown', reason: '' } }],
  ...over,
}) as unknown as DirectDeal;

function harness(start: DirectDeal | null, verdict: 'aligned' | 'unknown' = 'aligned') {
  let current = start;
  const saved: Array<Partial<DirectDeal>> = [];
  let checks = 0;
  const deps: RecheckDeps = {
    get: async () => current,
    check: async () => {
      checks += 1;
      return { verdict, reason: verdict === 'aligned' ? 'On topic.' : '' };
    },
    save: async (_jobId, patch) => {
      saved.push(patch);
      current = { ...current!, ...patch } as DirectDeal;
      return true;
    },
  };
  return { deps, saved, checks: () => checks };
}

test('a delivery with no verdict is checked again and the new verdict is kept, on the delivery and its history', async () => {
  const h = harness(deal());
  assert.deepEqual(await recheckDelivery('0xjob', h.deps), { status: 'checked', verdict: 'aligned' });
  assert.deepEqual(h.saved[0]!.deliveryMatch, { verdict: 'aligned', reason: 'On topic.' });
  assert.deepEqual(h.saved[0]!.deliveryHistory!.at(-1)!.deliveryMatch, { verdict: 'aligned', reason: 'On topic.' });
});

test('a delivery that already has a verdict, or nothing to check, is left alone', async () => {
  for (const d of [deal({ deliveryMatch: { verdict: 'aligned', reason: 'x' } }), deal({ delivered: false }), deal({ tradeType: 'goods' }), null]) {
    const h = harness(d);
    assert.equal((await recheckDelivery('0xjob', h.deps)).status, 'not-needed');
    assert.equal(h.checks(), 0);
  }
});

test('still no verdict saves nothing and says so', async () => {
  const h = harness(deal(), 'unknown');
  assert.deepEqual(await recheckDelivery('0xjob', h.deps), { status: 'still-unknown' });
  assert.equal(h.saved.length, 0);
});

test('a newer delivery sent while the check ran is never overwritten', async () => {
  const h = harness(deal());
  const check = h.deps.check;
  h.deps.check = async (input) => {
    const out = await check(input);
    h.deps.get = async () => deal({ deliveryRevision: 2 });
    return out;
  };
  assert.equal((await recheckDelivery('0xjob', h.deps)).status, 'not-needed');
  assert.equal(h.saved.length, 0);
});

test('background tries come a few minutes apart', () => {
  assert.deepEqual(RECHECK_DELAYS_MS, [2 * 60_000, 10 * 60_000, 30 * 60_000]);
});
