import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { buildSeedPlan } from './plan.js';
import { __test, MAX_REQUEST_FAILURES_PER_ACCOUNT, runSeed, type SeedDeps } from './runner.js';

const emails = ['a@example.com', 'b@example.com'];

function fakeDeps(over: Partial<SeedDeps> = {}) {
  const offers = new Set<string>();
  const requests = new Set<string>();
  const deps: SeedDeps = {
    resolveAccount: async (email) => ({ address: `0x${email[0]}`, sellerAgent: '0xs', buyerReady: true, sellerReady: true }),
    offerExists: (k) => offers.has(k),
    createOffer: (_a, o) => void offers.add(o.seedKey),
    requestExists: (k) => requests.has(k),
    postRequest: async (_a, r) => {
      requests.add(r.seedKey);
      return { ok: true };
    },
    sleep: async () => undefined,
    ...over,
  };
  return { deps, offers, requests };
}

beforeEach(() => __test.reset());

test('a run creates every offer and request once, and a second run finds them all present', async () => {
  const plan = buildSeedPlan(emails);
  const { deps, offers, requests } = fakeDeps();
  const first = await runSeed(plan, deps);
  assert.equal(first.state, 'done');
  assert.equal(first.created, 400);
  assert.equal(offers.size, 300);
  assert.equal(requests.size, 100);
  const second = await runSeed(plan, deps);
  assert.equal(second.created, 0);
  assert.equal(second.alreadyPresent, 400);
});

test('an account whose requests keep failing stops posting requests but keeps its offers', async () => {
  const plan = buildSeedPlan(emails);
  let attempts = 0;
  const { deps, offers } = fakeDeps({
    postRequest: async (account) => {
      if (account.address === '0xa') {
        attempts += 1;
        return { ok: false, reason: 'buyer agent balance too low' };
      }
      return { ok: true };
    },
  });
  const result = await runSeed(plan, deps);
  assert.equal(attempts, MAX_REQUEST_FAILURES_PER_ACCOUNT);
  assert.equal(offers.size, 300);
  assert.equal(result.failed, 50);
});

test('an account that does not exist yet is skipped without stopping the others', async () => {
  const plan = buildSeedPlan(emails);
  const { deps } = fakeDeps({
    resolveAccount: async (email) =>
      email.startsWith('b') ? { missing: 'no account' } : { address: '0xa', sellerAgent: '0xs', buyerReady: true, sellerReady: true },
  });
  const result = await runSeed(plan, deps);
  assert.equal(result.created, 200);
  assert.equal(result.failed, 200);
});
