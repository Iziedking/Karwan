import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionPayload } from '../auth/session.js';
import type { PresenceAction } from '../presence/action.js';
import type { VaultStake } from '../chain/guaranteeVault.js';
import { createGuaranteeRoutes, type GuaranteeDeps } from './guarantee.js';

const PERSON = `0x${'aa'.repeat(20)}`;
const VAULT = '0xF5FD1fd6d790da42C022a5c5404676c048007ed5' as const;
const USDC = '0x3600000000000000000000000000000000000000' as const;
const NOW = 1_800_000_000;
const U = 1_000_000n;

function harness(opts: { method?: 'circle' | 'web3'; confirmed?: boolean; identityId?: bigint; stake?: Partial<VaultStake>; free?: bigint; balance?: bigint; vault?: boolean; recordReady?: boolean } = {}) {
  const asked: PresenceAction[] = [];
  const executed: Array<{ step: string; amountMicros: bigint; identityId: bigint; walletId: string }> = [];
  const prepared: Array<{ step: string; amountMicros: bigint }> = [];
  const completed: Array<{ step: string; identityId: bigint; txHash: string }> = [];
  const records: string[] = [];
  let session: SessionPayload | null = { address: PERSON, method: opts.method ?? 'circle', exp: 9e9 } as SessionPayload;
  const stake: VaultStake = { active: 0n, reserved: 0n, cooling: 0n, coolUntil: 0n, ...opts.stake };
  const deps: GuaranteeDeps = {
    vault: () => (opts.vault === false ? null : VAULT),
    usdc: USDC,
    session: () => session,
    requirePresence: async (c, action) => {
      asked.push(action);
      return opts.confirmed ? null : c.json({ code: 'CONFIRM_REQUIRED' }, 428);
    },
    identityId: async () => opts.identityId ?? 9n,
    ensureRecord: async (address) => {
      records.push(address);
      return opts.recordReady === false ? 'not-ready' : 'ready';
    },
    read: {
      stakeOf: async () => stake,
      freeOf: async () => opts.free ?? 0n,
      balanceOf: async () => opts.balance ?? 1_000n * U,
      previousVaultMicros: async () => 250n * U,
    },
    now: () => NOW,
    circleWalletId: async () => (opts.method === 'web3' ? null : 'wallet-1'),
    executeCircle: async (input) => {
      executed.push({ step: input.step, amountMicros: input.amountMicros, identityId: input.identityId, walletId: input.walletId });
      return { reference: 'mm_1', txHash: '0xabc' };
    },
    prepareWeb3: async (input) => {
      prepared.push({ step: input.step, amountMicros: input.amountMicros });
      return { reference: 'mm_2' };
    },
    completeWeb3: async (input) => {
      completed.push({ step: input.step, identityId: input.identityId, txHash: input.txHash });
      return { reference: input.reference };
    },
    findIntent: async () => ({ reference: 'mm_2', amountMicros: (25n * U).toString() }),
    activity: () => undefined,
  };
  const app = createGuaranteeRoutes(deps);
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { call, asked, executed, prepared, completed, records, setSession: (s: SessionPayload | null) => { session = s; } };
}

test('reading the guarantee needs a session', async () => {
  const h = harness();
  h.setSession(null);
  assert.equal((await h.call('GET', '/')).status, 401);
});

test('with no vault set the guarantee reads as off', async () => {
  assert.deepEqual(await (await harness({ vault: false }).call('GET', '/')).json(), { available: false });
});

test('the guarantee reads in place, held, free, coming back and the previous contract', async () => {
  const h = harness({ stake: { active: 100n * U, reserved: 40n * U, cooling: 20n * U, coolUntil: BigInt(NOW + 3_600) }, free: 40n * U });
  const body = await (await h.call('GET', '/')).json();
  assert.equal(body.available, true);
  assert.equal(body.inPlaceUsdc, '80');
  assert.equal(body.heldUsdc, '40');
  assert.equal(body.freeUsdc, '40');
  assert.equal(body.comingBackUsdc, '20');
  assert.equal(body.readyAt, NOW + 3_600);
  assert.equal(body.ready, false);
  assert.equal(body.previousUsdc, '250');
  assert.equal(body.waitDays, 7);
});

test('putting up asks the person to confirm first, naming the vault', async () => {
  const h = harness();
  const res = await h.call('POST', '/put-up', { amountUsdc: '25', requestId: 'r1' });
  assert.equal(res.status, 428);
  assert.equal(h.asked[0]!.kind, 'deal_guarantee');
  assert.equal(h.asked[0]!.recipient, VAULT.toLowerCase());
  assert.equal(h.executed.length, 0);
});

test('putting up more than the balance is refused before anything is asked or signed', async () => {
  const h = harness({ confirmed: true, balance: 10n * U });
  const res = await h.call('POST', '/put-up', { amountUsdc: '25', requestId: 'r1' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'not_enough');
  assert.equal(h.asked.length, 0);
});

test('a confirmed put up sets up the record, then signs for this identity', async () => {
  const h = harness({ confirmed: true });
  const res = await h.call('POST', '/put-up', { amountUsdc: '25', requestId: 'r1' });
  assert.equal(res.status, 200);
  assert.deepEqual(h.records, [PERSON]);
  assert.deepEqual(h.executed, [{ step: 'put_up', amountMicros: 25n * U, identityId: 9n, walletId: 'wallet-1' }]);
});

test('a put up whose record could not be set up is refused, with nothing signed', async () => {
  const h = harness({ confirmed: true, recordReady: false, identityId: 0n });
  const res = await h.call('POST', '/put-up', { amountUsdc: '25', requestId: 'r1' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'record_not_ready');
  assert.equal(h.executed.length, 0);
});

test('taking out more than is free is refused with the free amount', async () => {
  const h = harness({ stake: { active: 100n * U, reserved: 40n * U }, free: 60n * U });
  const res = await h.call('POST', '/take-out', { amountUsdc: '70', requestId: 'r2' });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, 'over_free');
  assert.equal(body.freeUsdc, '60');
});

test('taking out what is free starts the wait without asking again', async () => {
  const h = harness({ stake: { active: 100n * U }, free: 100n * U });
  assert.equal((await h.call('POST', '/take-out', { amountUsdc: '60', requestId: 'r2' })).status, 200);
  assert.deepEqual(h.executed.map((e) => [e.step, e.amountMicros]), [['take_out', 60n * U]]);
  assert.equal(h.asked.length, 0);
});

test('collecting before the date is refused with the date, and collects everything coming back after it', async () => {
  const early = harness({ stake: { active: 20n * U, cooling: 20n * U, coolUntil: BigInt(NOW + 60) } });
  const res = await early.call('POST', '/collect', { requestId: 'r3' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).readyAt, NOW + 60);
  const ready = harness({ stake: { active: 20n * U, cooling: 20n * U, coolUntil: BigInt(NOW) } });
  assert.equal((await ready.call('POST', '/collect', { requestId: 'r3' })).status, 200);
  assert.deepEqual(ready.executed.map((e) => [e.step, e.amountMicros]), [['collect', 20n * U]]);
});

test('cancelling with nothing coming back is refused', async () => {
  const h = harness({ stake: { active: 20n * U } });
  assert.equal((await h.call('POST', '/cancel-take-out', { requestId: 'r4' })).status, 409);
});

test('an own wallet cannot use the routes Karwan signs, and gets an intent to sign instead', async () => {
  const h = harness({ method: 'web3' });
  assert.equal((await h.call('POST', '/take-out', { amountUsdc: '1', requestId: 'r5' })).status, 409);
  const res = await h.call('POST', '/intent', { step: 'put_up', amountUsdc: '25', requestId: 'r6' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.reference, 'mm_2');
  assert.equal(body.amountMicros, (25n * U).toString());
  assert.equal(body.vault, VAULT);
  assert.deepEqual(h.prepared, [{ step: 'put_up', amountMicros: 25n * U }]);
});

test('an own wallet completes with the identity read after the transaction', async () => {
  const h = harness({ method: 'web3', identityId: 54n });
  const res = await h.call('POST', '/complete', { step: 'put_up', amountUsdc: '25', requestId: 'r6', txHash: `0x${'cd'.repeat(32)}` });
  assert.equal(res.status, 200);
  assert.deepEqual(h.completed, [{ step: 'put_up', identityId: 54n, txHash: `0x${'cd'.repeat(32)}` }]);
});

test('a wallet Karwan holds cannot complete a browser intent', async () => {
  const h = harness();
  assert.equal((await h.call('POST', '/complete', { step: 'put_up', amountUsdc: '25', requestId: 'r6', txHash: `0x${'cd'.repeat(32)}` })).status, 409);
});
