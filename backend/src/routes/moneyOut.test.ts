import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountKind } from '../moneyOut/rules.js';
import { ADDRESS_WAIT_MS } from '../moneyOut/rules.js';
import { createMemoryMoneyOutStore } from '../moneyOut/store.js';
import { WorldSessionError } from '../worldid/dealSessions.js';
import type { AccountCheckPurpose } from '../worldid/accountSessions.js';
import { createMoneyOutRoutes, type MoneyOutRouteDeps } from './moneyOut.js';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const ALICE = '0x00000000000000000000000000000000000000aa';
const DEST = '0x00000000000000000000000000000000000000Bb';

function setup(opts: { session?: string | null; kind?: AccountKind; hasSession?: boolean; worldOk?: boolean; sessions?: boolean } = {}) {
  const store = createMemoryMoneyOutStore();
  const verified: AccountCheckPurpose[] = [];
  const told: unknown[] = [];
  const deps: MoneyOutRouteDeps = {
    enabled: true,
    now: () => NOW,
    sessionAddress: () => (opts.session === undefined ? ALICE : opts.session),
    store,
    kindOf: async () => opts.kind ?? 'chat',
    hasSession: async () => opts.hasSession ?? true,
    sessions: () =>
      opts.sessions === false
        ? null
        : {
            request: async (_wallet, purpose) => ({ nonce: `n-${purpose}`, sig: 's', created_at: 1, expires_at: 2, proofMode: 'session', provider: 'world-id', appId: 'a', rpId: 'r', environment: 'staging' }),
            verify: async (_wallet, purpose) => {
              if (opts.worldOk === false) throw new WorldSessionError('WORLD_ID_SESSION_MISMATCH', 'Use the World ID linked to this account.');
              verified.push(purpose);
              return { purpose };
            },
          },
    notifyAddressAdded: async (wallet, saved) => {
      told.push({ wallet, saved });
    },
  };
  return { app: createMoneyOutRoutes(deps), store, verified, told };
}

const call = (app: ReturnType<typeof setup>['app'], method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });

test('every money-out route needs a signed-in account', async () => {
  const { app } = setup({ session: null });
  for (const [method, path] of [
    ['GET', '/status'],
    ['POST', '/session/request'],
    ['POST', '/session/verify'],
    ['DELETE', '/addresses/x'],
    ['POST', '/pause'],
  ] as const) {
    assert.equal((await call(app, method, path, method === 'GET' || method === 'DELETE' ? undefined : {})).status, 401, path);
  }
});

test('the status shows saved addresses, the limit left and when more opens', async () => {
  const { app, store } = setup();
  await store.addAddress(ALICE, 'arc', DEST, NOW - HOUR);
  await store.withAccountLock(ALICE, (s) => s.reserve('r1', 200_000_000n, NOW - 3 * HOUR));
  const res = await call(app, 'GET', '/status');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.enabled, true);
  assert.equal(body.kind, 'chat');
  assert.equal(body.hasSession, true);
  assert.equal(body.paused, false);
  assert.equal(body.returnCheckDue, false);
  assert.equal(body.limitUsdc, '500');
  assert.equal(body.leftUsdc, '300');
  assert.equal(body.moreAt, NOW + 21 * HOUR);
  assert.equal(body.addresses.length, 1);
  assert.equal(body.addresses[0].address, DEST.toLowerCase());
  assert.equal(body.addresses[0].opensAt, NOW - HOUR + ADDRESS_WAIT_MS);
});

test('adding an address needs a World ID proof, waits 24 hours and tells the chat', async () => {
  const { app, store, verified, told } = setup();
  const req = await call(app, 'POST', '/session/request', { purpose: 'add_address' });
  assert.equal(req.status, 200);
  assert.equal((await req.json()).request.nonce, 'n-add_address');

  const res = await call(app, 'POST', '/session/verify', { purpose: 'add_address', idkitResponse: { nonce: 'n' }, chain: 'arc', address: DEST });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.address.opensAt, NOW + ADDRESS_WAIT_MS);
  assert.deepEqual(verified, ['add_address']);
  assert.equal((await store.listAddresses(ALICE)).length, 1);
  assert.equal(told.length, 1);
});

test('a bad address is refused before the World ID proof is used', async () => {
  const { app, verified } = setup();
  for (const bad of [
    { chain: 'arc', address: '0x12' },
    { chain: 'arc' },
    { chain: 'ARC!', address: DEST },
    { chain: 'mars', address: DEST },
    { chain: 'solanaDevnet', address: DEST },
    { chain: 'baseSepolia', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
  ]) {
    const res = await call(app, 'POST', '/session/verify', { purpose: 'add_address', idkitResponse: { nonce: 'n' }, ...bad });
    assert.equal(res.status, 400);
  }
  assert.deepEqual(verified, []);
});

test('an address is saved on any chain Karwan pays out to, by its chain key', async () => {
  const { app, store } = setup();
  for (const good of [
    { chain: 'baseSepolia', address: DEST },
    { chain: 'solanaDevnet', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
  ]) {
    const res = await call(app, 'POST', '/session/verify', { purpose: 'add_address', idkitResponse: { nonce: 'n' }, ...good });
    assert.equal(res.status, 200, good.chain);
  }
  assert.deepEqual((await store.listAddresses(ALICE)).map((a) => a.chain), ['baseSepolia', 'solanaDevnet']);
});

test('a proof of a different World ID saves nothing', async () => {
  const { app, store } = setup({ worldOk: false });
  const res = await call(app, 'POST', '/session/verify', { purpose: 'add_address', idkitResponse: { nonce: 'n' }, chain: 'arc', address: DEST });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'WORLD_ID_SESSION_MISMATCH');
  assert.deepEqual(await store.listAddresses(ALICE), []);
});

test('a web account does not save addresses: its agent wallets pay only to its own wallet', async () => {
  const { app } = setup({ kind: 'web' });
  const res = await call(app, 'POST', '/session/verify', { purpose: 'add_address', idkitResponse: { nonce: 'n' }, chain: 'arc', address: DEST });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'MONEY_OUT_OWN_WALLET_ONLY');
});

test('the return check and the unpause clear only after a proof', async () => {
  const { app, store } = setup();
  await store.setReturnCheckDue(ALICE, 1);
  await store.setPaused(ALICE, 1);
  assert.equal((await call(app, 'POST', '/session/verify', { purpose: 'return', idkitResponse: { nonce: 'n' } })).status, 200);
  assert.equal((await store.state(ALICE)).returnCheckDueAt, null);
  assert.equal((await store.state(ALICE)).pausedAt, 1, 'the return check does not unpause');
  assert.equal((await call(app, 'POST', '/session/verify', { purpose: 'unpause', idkitResponse: { nonce: 'n' } })).status, 200);
  assert.equal((await store.state(ALICE)).pausedAt, null);
});

test('pausing and removing need no proof, and only touch your own account', async () => {
  const { app, store } = setup();
  const theirs = await store.addAddress('0x00000000000000000000000000000000000000ff', 'arc', DEST, NOW);
  const mine = await store.addAddress(ALICE, 'arc', DEST, NOW);
  assert.equal((await call(app, 'DELETE', `/addresses/${theirs.id}`)).status, 404);
  assert.equal((await store.listAddresses('0x00000000000000000000000000000000000000ff')).length, 1);
  assert.equal((await call(app, 'DELETE', `/addresses/${mine.id}`)).status, 200);
  assert.deepEqual(await store.listAddresses(ALICE), []);

  assert.equal((await call(app, 'POST', '/pause')).status, 200);
  assert.equal((await store.state(ALICE)).pausedAt, NOW);
});

test('an unknown purpose is refused, and World ID being off says so', async () => {
  assert.equal((await call(setup().app, 'POST', '/session/request', { purpose: 'withdraw' })).status, 400);
  const off = await call(setup({ sessions: false }).app, 'POST', '/session/request', { purpose: 'enrol' });
  assert.equal(off.status, 503);
  assert.equal((await off.json()).code, 'WORLD_ID_UNAVAILABLE');
});
