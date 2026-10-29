import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The deal store falls back to a file under the working directory; keep it out
// of the repository.
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-exits-')));
process.env.SESSION_SECRET ??= 'money-out-exits-test-secret-at-least-32-characters';
const { signSession } = await import('../auth/session.js');
const { configureMoneyOutGuard } = await import('./live.js');
const { activationRoutes } = await import('../routes/activation.js');

const ALICE = '0x00000000000000000000000000000000000000aa';
const STRANGER = '0x00000000000000000000000000000000000000cc';
const cookie = `karwan_session=${signSession({ address: ALICE, method: 'circle' })}`;

type Asked = { wallet: string; exit: unknown; amountMicros: bigint; reference: string; reserve: boolean };

/// A guard that refuses everything and records what each exit asked.
function refusingGuard() {
  const asked: Asked[] = [];
  const restore = configureMoneyOutGuard({
    check: async (input, opts) => {
      asked.push({ ...input, reserve: opts?.reserve !== false });
      return { ok: false, refusal: { code: 'ADDRESS_NOT_SAVED' } };
    },
  });
  return { asked, restore };
}

const post = (app: { request: (path: string, init: RequestInit) => Response | Promise<Response> }, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });

/// The handler's source, to check the counting check sits before the transfer.
async function handler(file: string, start: string, end: string) {
  const source = await readFile(new URL(`../routes/${file}`, import.meta.url), 'utf8');
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${start} not found`);
  return source.slice(from, source.indexOf(end, from + start.length));
}

test('an agent-wallet withdrawal asks the guard before anything else and stops on its no', async () => {
  const { asked, restore } = refusingGuard();
  try {
    const res = await post(activationRoutes, '/withdraw', { address: ALICE, agent: 'seller', toAddress: STRANGER, amountUsdc: 12.5, requestId: 'req-00000001' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'MONEY_OUT_ADDRESS_NOT_SAVED');
    assert.equal(asked.length, 1);
    assert.deepEqual(asked[0], {
      wallet: ALICE,
      exit: { kind: 'payout', chain: 'arc', address: STRANGER },
      amountMicros: 12_500_000n,
      reference: `cashout:agent-withdraw:${ALICE}:seller:req-00000001`,
      reserve: false,
    });
  } finally {
    restore();
  }
});

test('the agent-wallet withdrawal counts the payment before it submits the transfer', async () => {
  const route = await handler('activation.ts', "activationRoutes.post('/withdraw'", 'activationRoutes.post(');
  const counted = route.indexOf('await moneyOutGuard.check(outgoing)');
  assert.ok(counted > 0, 'a counting check exists');
  assert.ok(counted < route.indexOf('executeContractCall('), 'and it comes before the transfer');
});

const { cashoutRoutes } = await import('../routes/cashout.js');

test('a send from the Karwan wallet asks the guard before anything else and stops on its no', async () => {
  const { asked, restore } = refusingGuard();
  try {
    const res = await post(cashoutRoutes, '/arc-send', { recipient: STRANGER, amountUsdc: 3, bridgeId: 'b-1' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'MONEY_OUT_ADDRESS_NOT_SAVED');
    assert.deepEqual(asked[0], {
      wallet: ALICE,
      exit: { kind: 'payout', chain: 'arc', address: STRANGER },
      amountMicros: 3_000_000n,
      reference: `cashout:arc-send:${ALICE}:b-1`,
      reserve: false,
    });
  } finally {
    restore();
  }
});

test("a settled deal's withdrawal asks the guard before anything else and stops on its no", async () => {
  const { asked, restore } = refusingGuard();
  try {
    const res = await post(cashoutRoutes, '/arc-withdraw', { jobId: '0xjob', recipient: STRANGER, amountUsdc: 7, requestId: 'req-00000002' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'MONEY_OUT_ADDRESS_NOT_SAVED');
    assert.equal(asked[0]?.reference, `cashout:arc-withdraw:${ALICE}:req-00000002`);
    assert.equal(asked[0]?.reserve, false);
  } finally {
    restore();
  }
});

test('both cash-out routes count the payment before they submit the transfer', async () => {
  for (const [start, end] of [
    ["cashoutRoutes.post('/arc-withdraw'", "cashoutRoutes.post('/arc-send'"],
    ["cashoutRoutes.post('/arc-send'", '\n});'],
  ]) {
    const route = await handler('cashout.ts', start, end);
    const counted = route.indexOf('await moneyOutGuard.check(outgoing)');
    assert.ok(counted > 0, `${start}: a counting check exists`);
    assert.ok(counted < route.indexOf('executeContractCall('), `${start}: before the transfer`);
  }
});

test('a seller can move any amount their wallet holds, not only what one deal paid', async () => {
  const route = await handler('cashout.ts', "cashoutRoutes.post('/arc-withdraw'", "cashoutRoutes.post('/arc-send'");
  assert.doesNotMatch(route, /OVER_DEAL_AMOUNT|dealAmountUsdc/);
  assert.match(route, /code: 'INSUFFICIENT_BALANCE'/);
  assert.match(route, /code: 'WITHDRAW_IN_PROGRESS'/);
});

const { gatewayRoutes } = await import('../routes/gateway.js');

test('a cash-out to another chain asks the guard by chain key before anything else', async () => {
  const { asked, restore } = refusingGuard();
  try {
    const res = await post(gatewayRoutes, '/cash-out', { destChainKey: 'baseSepolia', recipient: STRANGER, amountUsdc: 4, requestId: 'req-00000003' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'MONEY_OUT_ADDRESS_NOT_SAVED');
    assert.deepEqual(asked[0], {
      wallet: ALICE,
      exit: { kind: 'payout', chain: 'baseSepolia', address: STRANGER },
      amountMicros: 4_000_000n,
      reference: `gateway:cash-out:${ALICE}:req-00000003`,
      ownEverywhere: false,
      reserve: false,
    });
  } finally {
    restore();
  }
});

test('the cash-out counts the payment before it spends from the unified balance', async () => {
  const route = await handler('gateway.ts', "gatewayRoutes.post('/cash-out'", '\n});');
  const counted = route.indexOf('await moneyOutGuard.check(outgoing)');
  assert.ok(counted > 0, 'a counting check exists');
  assert.ok(counted < route.indexOf('cashOutFromGateway('), 'and it comes before the spend');
});

const { bridgeRoutes } = await import('../routes/bridge.js');

test('a bridge out asks the guard by chain key before anything else', async () => {
  const { asked, restore } = refusingGuard();
  try {
    const res = await post(bridgeRoutes, '/circle-bridge-out', {
      bridgeId: 'br-1', address: ALICE, destChainKey: 'arbitrumSepolia', amountUsdc: 9, recipient: STRANGER,
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'MONEY_OUT_ADDRESS_NOT_SAVED');
    assert.deepEqual(asked[0], {
      wallet: ALICE,
      exit: { kind: 'payout', chain: 'arbitrumSepolia', address: STRANGER },
      amountMicros: 9_000_000n,
      reference: `cashout:bridge-out:${ALICE}:br-1`,
      ownEverywhere: false,
      reserve: false,
    });
  } finally {
    restore();
  }
});

test('the bridge out counts the payment before it starts the burn', async () => {
  const route = await handler('bridge.ts', "bridgeRoutes.post('/circle-bridge-out'", '\n});');
  const counted = route.indexOf('await moneyOutGuard.check(outgoing)');
  assert.ok(counted > 0, 'a counting check exists');
  assert.ok(counted < route.indexOf('bridgeOutFromArcViaAppKit('), 'and it comes before the burn');
});

test("a top-up lands only in the person's own Karwan wallets, on both top-up routes", async () => {
  for (const path of ['/circle-bridge', '/circle-bridge-app-kit']) {
    const res = await post(bridgeRoutes, path, {
      bridgeId: `top-${path}`, address: ALICE, sourceChainKey: 'baseSepolia', amountUsdc: 5, mintRecipient: STRANGER,
    });
    assert.equal(res.status, 409, path);
    assert.equal((await res.json()).code, 'MINT_NOT_OWN_WALLET', path);
  }
});

test('a top-up into your own identity wallet passes that check', async () => {
  for (const path of ['/circle-bridge', '/circle-bridge-app-kit']) {
    const res = await post(bridgeRoutes, path, {
      bridgeId: `own-${path}`, address: ALICE, sourceChainKey: 'baseSepolia', amountUsdc: 5, mintRecipient: ALICE,
    });
    const body = (await res.json()) as { code?: string };
    assert.notEqual(body.code, 'MINT_NOT_OWN_WALLET', path);
  }
});

const { dealsRoutes } = await import('../routes/deals.js');
const { createDeal } = await import('../db/deals.js');

test('paying into escrow asks the guard, so the limit, the pause and the return check hold there too', async () => {
  const jobId = `0x${'ef'.repeat(32)}`;
  await createDeal({
    jobId,
    buyer: ALICE,
    seller: STRANGER,
    terms: 'Logo design',
    dealAmountUsdc: '20',
    firstReleasePct: 100,
    buyerAgentWalletId: 'wallet-buyer',
    buyerAgentAddress: '0x00000000000000000000000000000000000000ab',
    sellerApprovedAt: Date.now(),
  } as Parameters<typeof createDeal>[0]);
  const { asked, restore } = refusingGuard();
  try {
    const res = await post(dealsRoutes, `/direct/${jobId}/fund`, {
      caller: ALICE,
      expectedFeeBps: 150,
      maxFundedAmountUsdc: '20.15',
      quoteFingerprint: `0x${'12'.repeat(32)}`,
      expectedAgreementVersion: 1,
      expectedAgreementDigest: 'ab'.repeat(32),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'MONEY_OUT_ADDRESS_NOT_SAVED');
    assert.deepEqual(asked[0], {
      wallet: ALICE,
      exit: { kind: 'escrow' },
      amountMicros: 20_000_000n,
      reference: `fund:${jobId}`,
      reserve: false,
    });
  } finally {
    restore();
  }
});

test('both escrow payments count before they fund', async () => {
  const fund = await handler('deals.ts', "dealsRoutes.post('/direct/:jobId/fund'", 'dealsRoutes.post(');
  const counted = fund.indexOf('await moneyOutGuard.check(outgoing)');
  assert.ok(counted > 0, 'the direct deal has a counting check');
  assert.ok(counted < fund.indexOf('fundDirectDealV3('), 'before it funds');

  const source = await readFile(new URL('../agents/buyer.ts', import.meta.url), 'utf8');
  const approve = source.slice(source.indexOf('export async function approveAgentMatch('), source.indexOf('export async function proceedAgentNearMiss('));
  const dry = approve.indexOf('await moneyOutGuard.check(outgoing, { reserve: false })');
  const count = approve.indexOf('await moneyOutGuard.check(outgoing)');
  assert.ok(dry > approve.indexOf('chatFundingRefusal('), 'the match asks next to the chat limits');
  const accepts = approve.indexOf('await marketBoard().accept(');
  assert.ok(accepts > 0, 'the match accepts through the market board');
  assert.ok(count > 0 && count < accepts, 'and counts before it accepts');
});

const { saysWhy } = await import('../routes/jobs.js');

test("a match the guard refuses tells the buyer why, like the chat limits do", () => {
  assert.equal(saysWhy('CHAT_DEAL_LIMIT'), true);
  assert.equal(saysWhy('MONEY_OUT_DAILY_LIMIT'), true);
  assert.equal(saysWhy('MONEY_OUT_RETURN_CHECK'), true);
  assert.equal(saysWhy('BID_FAILED'), false);
});
