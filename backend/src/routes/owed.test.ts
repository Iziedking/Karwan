import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, parseAbi } from 'viem';
import type { SessionPayload } from '../auth/session.js';
import type { OwedLine } from '../money/owed.js';
import { createOwedRoutes, type OwedDeps } from './owed.js';

const ME = `0x${'aa'.repeat(20)}`;
const SELLER = `0x${'bb'.repeat(20)}`;
const AGREEMENT = `0x${'cc'.repeat(20)}`;
const CRE = `0x${'dd'.repeat(20)}`;
const USDC = '0x3600000000000000000000000000000000000000';
const U = 1_000_000n;

const held: OwedLine = { id: `agreement:${SELLER}`, contract: 'agreement', contractAddress: AGREEMENT, wallet: SELLER, walletId: 'w-seller', perAsset: true, amountMicros: 40n * U };
const own: OwedLine = { id: `cre:${ME}`, contract: 'cre', contractAddress: CRE, wallet: ME, walletId: null, perAsset: false, amountMicros: U / 4n };

function harness(opts: { lines?: OwedLine[]; unread?: number; signedIn?: boolean; failHeld?: boolean; failIds?: string[]; slowHeld?: Promise<void> } = {}) {
  const lines = opts.lines ?? [held, own];
  const collected: string[] = [];
  const prepared: string[] = [];
  const completed: Array<{ id: string; txHash: string }> = [];
  const activity: string[] = [];
  const session = opts.signedIn === false ? null : ({ address: ME, method: 'web3', exp: 9e9 } as SessionPayload);
  const deps: OwedDeps = {
    session: () => session,
    usdc: USDC,
    sources: () => [
      { contract: 'agreement', address: AGREEMENT, perAsset: true },
      { contract: 'cre', address: CRE, perAsset: false },
    ],
    lines: async () => ({ lines, totalMicros: lines.reduce((s, l) => s + l.amountMicros, 0n), unread: opts.unread ?? 0 }),
    collectHeld: async (line) => {
      if (opts.slowHeld) await opts.slowHeld;
      if (opts.failHeld || opts.failIds?.includes(line.id)) throw new Error('circle refused');
      collected.push(line.id);
      return { reference: `mm_${line.contract}`, txHash: '0xabc' };
    },
    prepareOwn: async (line) => {
      prepared.push(line.id);
      return { reference: 'mm_own' };
    },
    completeOwn: async (line, _requestId, txHash) => {
      completed.push({ id: line.id, txHash });
      return { reference: 'mm_own' };
    },
    findIntent: async (key) => (key.startsWith(`owed:${own.id}:`) ? { reference: 'mm_own', amountMicros: own.amountMicros.toString() } : null),
    activity: (e) => activity.push(`${e.lineId}:${e.amountMicros}`),
  };
  const app = createOwedRoutes(deps);
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { call, collected, prepared, completed, activity };
}

const TX = `0x${'ef'.repeat(32)}`;

test('signed out is refused', async () => {
  const h = harness({ signedIn: false });
  assert.equal((await h.call('GET', '/')).status, 401);
  assert.equal((await h.call('POST', '/collect', { requestId: 'r1' })).status, 401);
});

test('the list shows each owed line, who signs it, and the total', async () => {
  const res = await harness({ unread: 1 }).call('GET', '/');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    totalUsdc: '40.25',
    unreadable: true,
    lines: [
      { id: held.id, amountUsdc: '40', signs: 'karwan', from: 'deal' },
      { id: own.id, amountUsdc: '0.25', signs: 'you', from: 'check' },
    ],
  });
});

test('nothing owed answers an empty list, and Collect says there is nothing to collect', async () => {
  const h = harness({ lines: [] });
  assert.deepEqual(await (await h.call('GET', '/')).json(), { totalUsdc: '0', unreadable: false, lines: [] });
  const res = await h.call('POST', '/collect', { requestId: 'r1' });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, 'nothing_owed');
});

test('Collect sends every line Karwan signs and leaves the own-wallet lines to the person', async () => {
  const h = harness();
  const res = await h.call('POST', '/collect', { requestId: 'r1' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    collected: [{ id: held.id, amountUsdc: '40', reference: 'mm_agreement', txHash: '0xabc' }],
    failed: [],
    yoursToSign: [own.id],
  });
  assert.deepEqual(h.collected, [held.id]);
  assert.deepEqual(h.activity, [`${held.id}:${40n * U}`]);
});

test('when nothing could be collected the answer is a failure that names the lines', async () => {
  const res = await harness({ failHeld: true, lines: [held] }).call('POST', '/collect', { requestId: 'r1' });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { code: 'collect_failed', error: 'It could not be collected right now. Nothing was lost.', failed: [held.id] });
});

test('a line that fails is reported and the rest are still sent', async () => {
  const second: OwedLine = { ...held, id: `vault:${SELLER}`, contract: 'vault' };
  const h = harness({ lines: [held, second], failIds: [held.id] });
  const res = await h.call('POST', '/collect', { requestId: 'r1' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    collected: [{ id: second.id, amountUsdc: '40', reference: 'mm_vault', txHash: '0xabc' }],
    failed: [held.id],
    yoursToSign: [],
  });
});

test('only own-wallet lines leave Karwan to the person, who is told to sign', async () => {
  const res = await harness({ lines: [own] }).call('POST', '/collect', { requestId: 'r1' });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, 'sign_in_wallet');
});

test('a second Collect while one is running is refused', async () => {
  let release!: () => void;
  const h = harness({ lines: [held], slowHeld: new Promise<void>((r) => (release = r)) });
  const first = h.call('POST', '/collect', { requestId: 'r1' });
  await new Promise((r) => setTimeout(r, 10));
  const second = await h.call('POST', '/collect', { requestId: 'r2' });
  assert.equal(second.status, 409);
  assert.equal(((await second.json()) as { code: string }).code, 'already_collecting');
  release();
  assert.equal((await first).status, 200);
});

test('an own-wallet intent returns the one call the wallet signs', async () => {
  const h = harness();
  const res = await h.call('POST', '/intent', { id: own.id, requestId: 'r1' });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { to: string; data: `0x${string}`; amountUsdc: string; reference: string };
  assert.equal(body.to, CRE);
  assert.equal(body.amountUsdc, '0.25');
  const decoded = decodeFunctionData({ abi: parseAbi(['function withdrawOwed()']), data: body.data });
  assert.equal(decoded.functionName, 'withdrawOwed');
  assert.deepEqual(h.prepared, [own.id]);
});

test('an intent for a line Karwan signs, or one that is not the caller\'s, is refused', async () => {
  const h = harness();
  assert.equal(((await (await h.call('POST', '/intent', { id: held.id, requestId: 'r1' })).json()) as { code: string }).code, 'karwan_signs');
  assert.equal((await h.call('POST', '/intent', { id: `vault:${ME}`, requestId: 'r1' })).status, 404);
});

test('complete proves the signed withdrawal against the intent', async () => {
  const h = harness();
  const res = await h.call('POST', '/complete', { id: own.id, requestId: 'r1', txHash: TX });
  assert.equal(res.status, 200);
  assert.deepEqual(h.completed, [{ id: own.id, txHash: TX }]);
  const missing = await h.call('POST', '/complete', { id: held.id, requestId: 'r1', txHash: TX });
  assert.equal(missing.status, 409);
});
