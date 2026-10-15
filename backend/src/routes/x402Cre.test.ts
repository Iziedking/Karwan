import assert from 'node:assert/strict';
import test from 'node:test';
import type { Context } from 'hono';
import { createMemoryCreStore } from '../cre/store.js';
import { createX402CreRoutes, CRE_PRICES, type X402CreDeps } from './x402Cre.js';

const FAMILY = `0x${'f'.repeat(40)}`;
const DEAL = `0x${'d'.repeat(64)}`;
const BUYER = `0x${'b'.repeat(40)}`;
const STRANGER = `0x${'5'.repeat(40)}`;
const VERIFIER = `0x${'c'.repeat(40)}`;
const ID = '7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6';

function setup(over: Partial<X402CreDeps> & { paidBy?: string; unpaid?: boolean } = {}) {
  const store = createMemoryCreStore();
  const charged: number[] = [];
  const started: unknown[] = [];
  const deps: X402CreDeps = {
    store,
    charge: async (c: Context, price: number) => {
      charged.push(price);
      if (over.unpaid) return c.json({ error: 'payment required' }, 402);
      return { payer: over.paidBy ?? BUYER, network: 'eip155:5042002', amountAtomic: String(price * 1e6), transaction: '0xtx' };
    },
    partyOf: async (wallet) => (wallet.toLowerCase() === BUYER ? 'buyer' : null),
    dealVerifier: async () => VERIFIER,
    creVerifiers: [VERIFIER],
    start: async (input) => {
      started.push(input);
      return { executionId: 'exec-1' };
    },
    newId: () => ID,
    now: () => 100,
    adapter: `0x${'a'.repeat(40)}`,
    ...over,
  };
  const app = createX402CreRoutes(deps);
  const call = (path: string, init: { method?: string; body?: unknown; payer?: string } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(init.payer ? { 'x-karwan-payer': init.payer } : {}) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  return { store, call, charged, started };
}

const dryBody = { branchSha: 'e'.repeat(40), pull: 4 };

test('a party\'s agent pays for a dry run, which is queued on CRE', async () => {
  const s = setup();
  const res = await s.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody, payer: BUYER });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { dryRunId: ID, poll: `/api/x402/cre/dry-run/${ID}` });
  assert.deepEqual(s.charged, [CRE_PRICES.dryRun]);
  assert.deepEqual(s.started, [{ dryRunId: ID, family: FAMILY, dealId: DEAL, branchSha: 'e'.repeat(40), pull: 4 }]);
});

test('anyone who is not a party is refused before any payment', async () => {
  const s = setup();
  assert.equal((await s.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody, payer: STRANGER })).status, 403);
  assert.equal((await s.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody })).status, 403);
  assert.deepEqual(s.charged, []);
});

test('a deal that does not use a CRE check, or a malformed branch, is refused before payment', async () => {
  const none = setup({ dealVerifier: async () => null });
  assert.equal((await none.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody, payer: BUYER })).status, 404);
  const bad = setup();
  assert.equal((await bad.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: { branchSha: 'main' }, payer: BUYER })).status, 400);
  assert.deepEqual([...none.charged, ...bad.charged], []);
});

test('without payment the endpoint answers 402 and starts nothing', async () => {
  const s = setup({ unpaid: true });
  assert.equal((await s.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody, payer: BUYER })).status, 402);
  assert.deepEqual(s.started, []);
});

test('a payment from a wallet other than the claimed party starts nothing', async () => {
  const s = setup({ paidBy: STRANGER });
  assert.equal((await s.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody, payer: BUYER })).status, 403);
  assert.deepEqual(s.started, []);
});

test('the dry-run result is free to poll', async () => {
  const s = setup();
  assert.equal((await s.call(`/dry-run/${ID}`)).status, 404);
  await s.store.putDryRun(ID, { decision: 'PASS' }, 5);
  const res = await s.call(`/dry-run/${ID}`);
  assert.deepEqual(await res.json(), { dryRunId: ID, result: { decision: 'PASS' }, at: 5 });
});

test('evidence for a check is sold to parties only, with what is needed to verify it on Arc', async () => {
  const s = setup();
  await s.store.upsertCheckItem({ dealKey: `${DEAL}-r1`, kind: 'deal', family: FAMILY, dealId: DEAL, revision: 1, deliveredBlockHash: null, policyHash: `0x${'1'.repeat(64)}`, referenceHash: null }, 1);
  await s.store.closeCheckItem(`${DEAL}-r1`, { decision: 'PASS', evidenceHash: `0x${'9'.repeat(64)}`, attested: true }, 2);
  assert.equal((await s.call(`/evidence/${FAMILY}/${DEAL}/1`, { payer: STRANGER })).status, 403);
  const res = await s.call(`/evidence/${FAMILY}/${DEAL}/1`, { payer: BUYER });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { outcome: unknown; verify: { adapter: string; verifier: string } };
  assert.deepEqual(body.outcome, { decision: 'PASS', evidenceHash: `0x${'9'.repeat(64)}`, attested: true });
  assert.equal(body.verify.verifier, VERIFIER);
  assert.deepEqual(s.charged, [CRE_PRICES.evidence]);
});

test('polling a dry run never shows who paid or the payment', async () => {
  const s = setup({ start: () => new Promise(() => {}) });
  await s.call(`/dry-run/${FAMILY}/${DEAL}`, { method: 'POST', body: dryBody, payer: BUYER });
  const text = await (await s.call(`/dry-run/${ID}`)).text();
  assert.equal(text.toLowerCase().includes(BUYER), false);
  assert.equal(text.includes('0xtx'), false);
});
