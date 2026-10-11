import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyOutGuard } from './guard.js';
import type { AccountKind } from './rules.js';
import { createMemoryMoneyOutStore } from './store.js';

const HOUR = 3_600_000;
const WALLET = '0x00000000000000000000000000000000000000aa';
const DEST = '0x00000000000000000000000000000000000000bb';
const usdc = (n: number) => BigInt(n) * 1_000_000n;

function setup(over: { enabled?: boolean; kind?: AccountKind; hasSession?: boolean } = {}) {
  let clock = 1_800_000_000_000;
  const store = createMemoryMoneyOutStore();
  const guard = createMoneyOutGuard({
    enabled: over.enabled ?? true,
    now: () => clock,
    store,
    kindOf: async () => over.kind ?? 'chat',
    ownAddresses: async () => [WALLET],
    hasSession: async () => over.hasSession ?? true,
  });
  return { guard, store, tick: (ms: number) => (clock += ms), now: () => clock };
}

const payout = { kind: 'payout' as const, chain: 'arc', address: DEST };

test('switched off, the guard lets everything through and counts nothing', async () => {
  const { guard, store } = setup({ enabled: false, hasSession: false });
  const r = await guard.check({ wallet: WALLET, exit: payout, amountMicros: usdc(10_000), reference: 'a' });
  assert.equal(r.ok, true);
  assert.deepEqual(await store.withAccountLock(WALLET, (s) => s.spentSince(0)), []);
});

test('a refused payment is not counted', async () => {
  const { guard, store } = setup();
  const r = await guard.check({ wallet: WALLET, exit: payout, amountMicros: usdc(10), reference: 'a' });
  assert.deepEqual(r, { ok: false, refusal: { code: 'ADDRESS_NOT_SAVED' } });
  assert.deepEqual(await store.withAccountLock(WALLET, (s) => s.spentSince(0)), []);
});

test('an allowed payment is counted, a retry counts once, and release gives it back', async () => {
  const { guard, store, tick, now } = setup();
  await store.addAddress(WALLET, 'arc', DEST, now() - 48 * HOUR);
  tick(1);
  const first = await guard.check({ wallet: WALLET, exit: payout, amountMicros: usdc(300), reference: 'pay-1' });
  assert.equal(first.ok, true);
  const retry = await guard.check({ wallet: WALLET, exit: payout, amountMicros: usdc(300), reference: 'pay-1' });
  assert.equal(retry.ok, true, 'the same payment retried is not a second payment');
  const second = await guard.check({ wallet: WALLET, exit: payout, amountMicros: usdc(300), reference: 'pay-2' });
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.refusal.code, 'DAILY_LIMIT');

  if (first.ok) await first.release();
  const third = await guard.check({ wallet: WALLET, exit: payout, amountMicros: usdc(300), reference: 'pay-3' });
  assert.equal(third.ok, true);
});

test('the pause and the return check come from the account state', async () => {
  const { guard, store } = setup();
  await store.setPaused(WALLET, 1);
  const paused = await guard.check({ wallet: WALLET, exit: { kind: 'escrow' }, amountMicros: usdc(1), reference: 'p' });
  assert.deepEqual(paused, { ok: false, refusal: { code: 'PAUSED' } });
  await store.setPaused(WALLET, null);
  await store.setReturnCheckDue(WALLET, 1);
  const back = await guard.check({ wallet: WALLET, exit: { kind: 'escrow' }, amountMicros: usdc(1), reference: 'q' });
  assert.deepEqual(back, { ok: false, refusal: { code: 'RETURN_CHECK' } });
});

test("a web account's escrow payment is not counted against a chat limit", async () => {
  const { guard, store } = setup({ kind: 'web', hasSession: false });
  const r = await guard.check({ wallet: WALLET, exit: { kind: 'escrow' }, amountMicros: usdc(900), reference: 'w' });
  assert.equal(r.ok, true);
  assert.deepEqual(await store.withAccountLock(WALLET, (s) => s.spentSince(0)), []);
});
