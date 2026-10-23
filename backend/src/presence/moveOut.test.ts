import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The deal and user stores fall back to files under the working directory;
// keep them out of the repository.
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-move-out-')));
process.env.SESSION_SECRET ??= 'presence-move-out-test-secret-at-least-32-characters';
process.env.KARWAN_VAULT_ADDR ??= '0x00000000000000000000000000000000000000fa';
const { signSession } = await import('../auth/session.js');
const { configureMoneyOutGuard } = await import('../moneyOut/live.js');
const { CONFIRM_HEADER } = await import('./service.js');
const { presenceAction } = await import('./action.js');
const { grantFor } = await import('./grantFor.test.js');
const { createUser } = await import('../db/users.js');
const { activationRoutes } = await import('../routes/activation.js');
const { cashoutRoutes } = await import('../routes/cashout.js');
const { gatewayRoutes } = await import('../routes/gateway.js');
const { bridgeRoutes } = await import('../routes/bridge.js');
const { vaultRoutes } = await import('../routes/vault.js');

const ALICE = '0x00000000000000000000000000000000000000aa';
const STRANGER = '0x00000000000000000000000000000000000000cc';
const OTHER = '0x00000000000000000000000000000000000000cd';
const VAULT = process.env.KARWAN_VAULT_ADDR!.toLowerCase();
const session = { address: ALICE, method: 'circle' as const, email: 'alice@example.com' };
const cookie = `karwan_session=${signSession(session)}`;
createUser({ email: session.email, address: ALICE, circleIdentityWalletId: 'alice-identity' });

type App = { request: (path: string, init: RequestInit) => Response | Promise<Response> };
const post = (app: App, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify(body) });

/// Passes the early check and refuses the counting one, so no route reaches Circle.
function earlyOnlyGuard() {
  const counted: string[] = [];
  const restore = configureMoneyOutGuard({
    check: async (input, opts) => {
      if (opts?.reserve === false) return { ok: true, release: async () => {} };
      counted.push(input.reference);
      return { ok: false, refusal: { code: 'ADDRESS_NOT_SAVED' } };
    },
  });
  return { counted, restore };
}

const moveOut = (amountMicros: string, recipient: string, detail: Record<string, string>) =>
  presenceAction({ kind: 'move_out', wallet: ALICE, amountMicros, recipient, detail });

const ROUTES = [
  { name: 'arc-send', app: cashoutRoutes, path: '/arc-send', body: (to: string, usdc: number) => ({ recipient: to, amountUsdc: usdc, bridgeId: `b-${to}-${usdc}` }), detail: { chain: 'arc' } },
  { name: 'arc-withdraw', app: cashoutRoutes, path: '/arc-withdraw', body: (to: string, usdc: number) => ({ jobId: '0xjob', recipient: to, amountUsdc: usdc, requestId: `req-withdraw-${usdc}` }), detail: { chain: 'arc' } },
  { name: 'gateway cash-out', app: gatewayRoutes, path: '/cash-out', body: (to: string, usdc: number) => ({ destChainKey: 'baseSepolia', recipient: to, amountUsdc: usdc, requestId: `req-gateway-${usdc}` }), detail: { chain: 'baseSepolia' } },
  { name: 'bridge out', app: bridgeRoutes, path: '/circle-bridge-out', body: (to: string, usdc: number) => ({ bridgeId: `br-${usdc}`, address: ALICE, destChainKey: 'arbitrumSepolia', amountUsdc: usdc, recipient: to }), detail: { chain: 'arbitrumSepolia' } },
  { name: 'agent withdraw', app: activationRoutes, path: '/withdraw', body: (to: string, usdc: number) => ({ address: ALICE, agent: 'seller', toAddress: to, amountUsdc: usdc, requestId: `req-agent-${usdc}` }), detail: { chain: 'arc', agent: 'seller' } },
];

for (const r of ROUTES) {
  test(`${r.name}: asks_without_a_grant`, async () => {
    const { restore, counted } = earlyOnlyGuard();
    try {
      const res = await post(r.app, r.path, r.body(STRANGER, 5));
      assert.equal(res.status, 428);
      const required = await res.json();
      assert.equal(required.code, 'CONFIRM_REQUIRED');
      assert.equal(required.action.kind, 'move_out');
      assert.equal(required.action.amountMicros, '5000000');
      assert.equal(required.action.recipient, STRANGER);
      assert.deepEqual(required.action.detail, r.detail);
      assert.deepEqual(counted, [], 'nothing is counted or sent before the person confirms');
    } finally {
      restore();
    }
  });

  test(`${r.name}: a_grant_lets_it_go_on_once_and_only_for_its_amount_and_address`, async () => {
    const { restore } = earlyOnlyGuard();
    try {
      const grant = await grantFor(session, moveOut('5000000', STRANGER, r.detail));
      assert.equal((await post(r.app, r.path, r.body(STRANGER, 6), { [CONFIRM_HEADER]: grant })).status, 428, 'a grant for 5 is refused for 6');
      const grant2 = await grantFor(session, moveOut('5000000', STRANGER, r.detail));
      assert.equal((await post(r.app, r.path, r.body(OTHER, 5), { [CONFIRM_HEADER]: grant2 })).status, 428, 'a grant for one address is refused for another');
      const grant3 = await grantFor(session, moveOut('5000000', STRANGER, r.detail));
      const both = await Promise.all([
        post(r.app, r.path, r.body(STRANGER, 5), { [CONFIRM_HEADER]: grant3 }),
        post(r.app, r.path, r.body(STRANGER, 5), { [CONFIRM_HEADER]: grant3 }),
      ]);
      assert.deepEqual(both.map((x) => x.status === 428).sort(), [false, true], 'one goes on, the other is asked again');
    } finally {
      restore();
    }
  });
}

test('to_own_identity_wallet_is_not_asked', async () => {
  const { restore } = earlyOnlyGuard();
  try {
    for (const r of ROUTES.filter((x) => x.detail.chain === 'arc')) {
      const res = await post(r.app, r.path, r.body(ALICE, 2));
      assert.notEqual(res.status, 428, r.name);
    }
  } finally {
    restore();
  }
});

test('the agent withdrawal and the cash-outs ask before they count or send', async () => {
  for (const [file, start, end, send] of [
    ['cashout.ts', "cashoutRoutes.post('/arc-withdraw'", "cashoutRoutes.post('/arc-send'", 'executeContractCall('],
    ['cashout.ts', "cashoutRoutes.post('/arc-send'", '\n});', 'executeContractCall('],
    ['gateway.ts', "gatewayRoutes.post('/cash-out'", '\n});', 'cashOutFromGateway('],
    ['bridge.ts', "bridgeRoutes.post('/circle-bridge-out'", '\n});', 'bridgeOutFromArcViaAppKit('],
    ['activation.ts', "activationRoutes.post('/withdraw'", 'activationRoutes.post(', 'executeContractCall('],
  ] as const) {
    const source = await readFile(new URL(`../routes/${file}`, import.meta.url), 'utf8');
    const route = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + start.length));
    const asked = route.indexOf('await confirmMoveOut(c, outgoing');
    assert.ok(asked > 0, `${start}: asks`);
    assert.ok(asked < route.indexOf('await moneyOutGuard.check(outgoing)'), `${start}: before counting`);
    assert.ok(asked < route.indexOf(send), `${start}: before sending`);
  }
});

test('putting_up_deal_insurance_asks_with_its_amount', async () => {
  const res = await post(vaultRoutes, '/deposit', { address: ALICE, amountUsdc: 25, requestId: 'stake-1' });
  assert.equal(res.status, 428);
  const required = await res.json();
  assert.equal(required.action.kind, 'deal_insurance');
  assert.equal(required.action.amountMicros, '25000000');
  assert.equal(required.action.recipient, VAULT);
  const grant = await grantFor(session, presenceAction({ kind: 'deal_insurance', wallet: ALICE, amountMicros: '25000000', recipient: VAULT }));
  assert.equal((await post(vaultRoutes, '/deposit', { address: ALICE, amountUsdc: 30, requestId: 'stake-2' }, { [CONFIRM_HEADER]: grant })).status, 428, 'a grant for 25 is refused for 30');
});

test('deal insurance is confirmed before the identity wallet stakes', async () => {
  const source = await readFile(new URL('../routes/vault.ts', import.meta.url), 'utf8');
  const start = "vaultRoutes.post('/deposit', async";
  const route = source.slice(source.indexOf(start), source.indexOf('vaultRoutes.post(', source.indexOf(start) + start.length));
  const asked = route.indexOf("kind: 'deal_insurance'");
  assert.ok(asked > 0);
  assert.ok(asked < route.indexOf('executeCircleVaultStake('));
});

test('vault_withdraw_and_claim_are_not_asked', async () => {
  const source = await readFile(new URL('../routes/vault.ts', import.meta.url), 'utf8');
  for (const path of ['/request-withdraw', '/cancel-withdraw', '/claim']) {
    const start = `vaultRoutes.post('${path}'`;
    const route = source.slice(source.indexOf(start), source.indexOf('\n);', source.indexOf(start)) + 3);
    assert.doesNotMatch(route, /requirePresence|confirmMoveOut/, path);
  }
});
