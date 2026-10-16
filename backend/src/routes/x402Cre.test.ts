import assert from 'node:assert/strict';
import test from 'node:test';
import type { Context } from 'hono';
import { createMemoryCreStore } from '../cre/store.js';
import { createX402CreRoutes, CRE_PRICES, type FeeAuthorization, type X402CreDeps } from './x402Cre.js';

const FAMILY = `0x${'f'.repeat(40)}`;
const DEAL = `0x${'d'.repeat(64)}`;
const BUYER = `0x${'b'.repeat(40)}`;
const STRANGER = `0x${'5'.repeat(40)}`;
const VERIFIER = `0x${'c'.repeat(40)}`;
const FEES = `0x${'fe'.repeat(20)}`;
const USDC = '0x3600000000000000000000000000000000000000';
const RUN = `0x${'7'.repeat(64)}`;
const NOW = 1_800_000_000_000;

const auth = (over: Partial<FeeAuthorization> = {}): FeeAuthorization => ({
  from: BUYER,
  to: FEES,
  value: '250000',
  validAfter: '0',
  validBefore: String(NOW / 1000 + 3600),
  nonce: `0x${'a'.repeat(64)}`,
  signature: `0x${'1b'.repeat(65)}`,
  ...over,
});

const paymentHeader = (a: FeeAuthorization) =>
  Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: { scheme: 'exact', network: 'eip155:5042002' },
    payload: { signature: a.signature, authorization: { from: a.from, to: a.to, value: a.value, validAfter: a.validAfter, validBefore: a.validBefore, nonce: a.nonce } },
  })).toString('base64');

function setup(over: Partial<X402CreDeps> & { paidBy?: string; openFails?: boolean } = {}) {
  const store = createMemoryCreStore();
  const charged: number[] = [];
  const started: unknown[] = [];
  const opened: FeeAuthorization[] = [];
  let now = NOW;
  const deps: X402CreDeps = {
    store,
    charge: async (c: Context, price: number) => {
      charged.push(price);
      return { payer: over.paidBy ?? BUYER, network: 'eip155:5042002', amountAtomic: String(price * 1e6), transaction: '0xtx' };
    },
    partyOf: async (wallet) => (wallet.toLowerCase() === BUYER ? 'buyer' : null),
    dealVerifier: async () => VERIFIER,
    creVerifiers: [VERIFIER],
    fee: { contract: FEES, usdc: USDC, network: 'eip155:5042002', amountAtomic: '250000', refundAfterSec: 3600 },
    openFee: async (a) => {
      opened.push(a);
      return over.openFails ? { error: 'FiatTokenV2: invalid signature' } : { runId: RUN };
    },
    start: async (input) => {
      started.push(input);
      return { executionId: 'exec-1' };
    },
    now: () => now,
    adapter: `0x${'a'.repeat(40)}`,
    ...over,
  };
  const app = createX402CreRoutes(deps);
  const call = (path: string, init: { method?: string; body?: unknown; payer?: string; payment?: string } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(init.payer ? { 'x-karwan-payer': init.payer } : {}),
        ...(init.payment ? { 'payment-signature': init.payment } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  return { store, call, charged, started, opened, advance: (ms: number) => { now += ms; } };
}

const dryBody = { branchSha: 'e'.repeat(40), pull: 4 };
const dryPath = `/dry-run/${FAMILY}/${DEAL}`;

test('without a payment, a dry run answers 402 naming the fee contract and what to sign', async () => {
  const s = setup();
  const res = await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER });
  assert.equal(res.status, 402);
  const required = JSON.parse(Buffer.from(res.headers.get('payment-required') ?? '', 'base64').toString('utf-8'));
  assert.equal(required.x402Version, 2);
  assert.deepEqual(required.accepts[0], {
    scheme: 'exact',
    network: 'eip155:5042002',
    amount: '250000',
    asset: USDC,
    payTo: FEES,
    maxTimeoutSeconds: 3600,
    extra: { name: 'USDC', version: '2', primaryType: 'ReceiveWithAuthorization' },
  });
  assert.deepEqual(s.opened, []);
  assert.deepEqual(s.started, []);
});

test('a party\'s signed payment opens a fee run on Arc, and the dry run starts with that run', async () => {
  const s = setup();
  const res = await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER, payment: paymentHeader(auth()) });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), {
    runId: RUN,
    poll: `/api/x402/cre/dry-run/${RUN}`,
    fee: { contract: FEES, refundableAfter: NOW / 1000 + 3600 },
  });
  assert.deepEqual(s.opened, [auth()]);
  assert.deepEqual(s.started, [{ runId: RUN, family: FAMILY, dealId: DEAL, branchSha: 'e'.repeat(40), pull: 4 }]);
  assert.deepEqual(s.charged, []);
});

test('anyone who is not a party is refused before any payment', async () => {
  const s = setup();
  assert.equal((await s.call(dryPath, { method: 'POST', body: dryBody, payer: STRANGER })).status, 403);
  assert.equal((await s.call(dryPath, { method: 'POST', body: dryBody })).status, 403);
  assert.deepEqual(s.opened, []);
});

test('a deal that does not use a CRE check, or a malformed branch, is refused before payment', async () => {
  const none = setup({ dealVerifier: async () => null });
  assert.equal((await none.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER })).status, 404);
  const bad = setup();
  assert.equal((await bad.call(dryPath, { method: 'POST', body: { branchSha: 'main' }, payer: BUYER })).status, 400);
  assert.deepEqual([...none.opened, ...bad.opened], []);
});

test('a payment from someone else, to another contract, of another amount, or about to expire opens nothing', async () => {
  const s = setup();
  for (const a of [
    auth({ from: STRANGER }),
    auth({ to: `0x${'9'.repeat(40)}` }),
    auth({ value: '1' }),
    auth({ validBefore: String(NOW / 1000 + 30) }),
  ]) {
    const res = await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER, payment: paymentHeader(a) });
    assert.equal(res.status, 402);
  }
  assert.equal((await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER, payment: 'not base64 json' })).status, 400);
  assert.deepEqual(s.opened, []);
  assert.deepEqual(s.started, []);
});

test('a payment Arc refuses starts nothing', async () => {
  const s = setup({ openFails: true });
  const res = await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER, payment: paymentHeader(auth()) });
  assert.equal(res.status, 402);
  assert.deepEqual(s.started, []);
});

test('an unanswered run says how anyone can return the fee to the payer, and is never run again for free', async () => {
  const s = setup({ start: () => new Promise(() => {}) });
  await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER, payment: paymentHeader(auth()) });
  const early = (await (await s.call(`/dry-run/${RUN}`)).json()) as { result: { state: string; refund?: unknown } };
  assert.equal(early.result.state, 'queued');
  assert.equal(early.result.refund, undefined);
  s.advance(3_600_001);
  const late = (await (await s.call(`/dry-run/${RUN}`)).json()) as { result: { state: string; refund?: unknown } };
  assert.equal(late.result.state, 'unanswered');
  assert.deepEqual(late.result.refund, { contract: FEES, call: `refund(${RUN})`, to: 'the payer' });
  const rerun = await s.call(`/dry-run/${RUN}/rerun`, { method: 'POST', payer: BUYER });
  assert.notEqual(rerun.status, 202);
  const after = (await (await s.call(`/dry-run/${RUN}`)).json()) as { result: { state: string } };
  assert.equal(after.result.state, 'unanswered');
});

test('the dry-run result is free to poll and never shows who paid', async () => {
  const s = setup();
  assert.equal((await s.call(`/dry-run/${RUN}`)).status, 404);
  await s.call(dryPath, { method: 'POST', body: dryBody, payer: BUYER, payment: paymentHeader(auth()) });
  const text = await (await s.call(`/dry-run/${RUN}`)).text();
  assert.equal(text.toLowerCase().includes(BUYER), false);
  await s.store.putDryRun(RUN, { payload: { decision: 'PASS' }, report: {} }, 5);
  const res = await s.call(`/dry-run/${RUN}`);
  assert.deepEqual(await res.json(), { runId: RUN, result: { payload: { decision: 'PASS' }, report: {} }, at: 5 });
});

test('evidence for a check is sold to parties only, with what is needed to verify it on Arc', async () => {
  const s = setup();
  await s.store.upsertCheckItem({ dealKey: `${DEAL}-r1`, kind: 'deal', family: FAMILY, dealId: DEAL, revision: 1, deliveredBlockHash: null, deliveredBlockNumber: null, policyHash: `0x${'1'.repeat(64)}`, referenceHash: null }, 1);
  await s.store.closeCheckItem(`${DEAL}-r1`, { decision: 'PASS', evidenceHash: `0x${'9'.repeat(64)}`, attested: true }, 2);
  assert.equal((await s.call(`/evidence/${FAMILY}/${DEAL}/1`, { payer: STRANGER })).status, 403);
  const res = await s.call(`/evidence/${FAMILY}/${DEAL}/1`, { payer: BUYER });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { outcome: unknown; verify: { adapter: string; verifier: string } };
  assert.deepEqual(body.outcome, { decision: 'PASS', evidenceHash: `0x${'9'.repeat(64)}`, attested: true });
  assert.equal(body.verify.verifier, VERIFIER);
  assert.deepEqual(s.charged, [CRE_PRICES.evidence]);
});
