import assert from 'node:assert/strict';
import test from 'node:test';
import { ADDRESS_WAIT_MS, DAILY_LIMIT_MICROS, decide, type Exit } from './rules.js';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const OWN = '0x00000000000000000000000000000000000000aa';
const SAVED = '0x00000000000000000000000000000000000000bb';
const STRANGER = '0x00000000000000000000000000000000000000cc';
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));

const payout = (address: string, chain = 'arc'): Exit => ({ kind: 'payout', chain, address });

function chat(over: Partial<Parameters<typeof decide>[0]> = {}): Parameters<typeof decide>[0] {
  return {
    kind: 'chat',
    exit: payout(SAVED),
    amountMicros: usdc(10),
    now: NOW,
    ownAddresses: [OWN],
    saved: [{ chain: 'arc', address: SAVED, opensAt: NOW - HOUR }],
    spent: [],
    hasSession: true,
    paused: false,
    returnCheckDue: false,
    ...over,
  };
}

test('a chat payout to a saved address that has opened goes through', () => {
  assert.deepEqual(decide(chat()), { ok: true });
});

test('a chat payout to an address it never saved is refused', () => {
  assert.deepEqual(decide(chat({ exit: payout(STRANGER) })), { ok: false, refusal: { code: 'ADDRESS_NOT_SAVED' } });
});

test('a saved address waits until it opens', () => {
  const opensAt = NOW + ADDRESS_WAIT_MS - HOUR;
  const r = decide(chat({ saved: [{ chain: 'arc', address: SAVED, opensAt }] }));
  assert.deepEqual(r, { ok: false, refusal: { code: 'ADDRESS_OPENS_LATER', opensAt } });
});

test('an address saved on one chain is not saved on another', () => {
  assert.deepEqual(decide(chat({ exit: payout(SAVED, 'base') })), { ok: false, refusal: { code: 'ADDRESS_NOT_SAVED' } });
});

test('addresses compare without case', () => {
  assert.deepEqual(decide(chat({ exit: payout(SAVED.toUpperCase().replace('0X', '0x')) })), { ok: true });
});

test('a Solana address is compared exactly, since its case is part of it', () => {
  const sol = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const saved = [{ chain: 'solana', address: sol, opensAt: NOW - HOUR }];
  assert.deepEqual(decide(chat({ saved, exit: payout(sol, 'solana') })), { ok: true });
  assert.deepEqual(decide(chat({ saved, exit: payout(sol.toLowerCase(), 'solana') })), {
    ok: false,
    refusal: { code: 'ADDRESS_NOT_SAVED' },
  });
});

test("a payout to the account's own wallet needs no saved address", () => {
  assert.deepEqual(decide(chat({ exit: payout(OWN), saved: [] })), { ok: true });
});

test("moving money between the account's own wallets is not money leaving", () => {
  const r = decide(
    chat({ exit: payout(OWN), saved: [], hasSession: false, paused: true, amountMicros: usdc(900), spent: [{ amountMicros: usdc(500), at: NOW - HOUR }] }),
  );
  assert.deepEqual(r, { ok: true });
});

test('no World ID session refuses before anything else', () => {
  const r = decide(chat({ hasSession: false, paused: true, returnCheckDue: true, exit: payout(STRANGER) }));
  assert.deepEqual(r, { ok: false, refusal: { code: 'NO_SESSION' } });
});

test('a paused account moves nothing, into escrow included', () => {
  assert.deepEqual(decide(chat({ paused: true })), { ok: false, refusal: { code: 'PAUSED' } });
  assert.deepEqual(decide(chat({ paused: true, exit: { kind: 'escrow' } })), { ok: false, refusal: { code: 'PAUSED' } });
});

test('an account back after a long silence proves it is the same person first, into escrow included', () => {
  assert.deepEqual(decide(chat({ returnCheckDue: true })), { ok: false, refusal: { code: 'RETURN_CHECK' } });
  assert.deepEqual(decide(chat({ returnCheckDue: true, exit: { kind: 'escrow' } })), {
    ok: false,
    refusal: { code: 'RETURN_CHECK' },
  });
});

test('the daily limit says what is left and when more opens', () => {
  const r = decide(
    chat({
      amountMicros: usdc(100),
      spent: [
        { amountMicros: usdc(250), at: NOW - 20 * HOUR },
        { amountMicros: usdc(200), at: NOW - 2 * HOUR },
      ],
    }),
  );
  assert.deepEqual(r, { ok: false, refusal: { code: 'DAILY_LIMIT', leftMicros: usdc(50), moreAt: NOW + 4 * HOUR } });
});

test('a payment that lands exactly on the limit goes through', () => {
  const r = decide(chat({ amountMicros: usdc(50), spent: [{ amountMicros: DAILY_LIMIT_MICROS - usdc(50), at: NOW - HOUR }] }));
  assert.deepEqual(r, { ok: true });
});

test('spending older than 24 hours does not count', () => {
  const r = decide(chat({ amountMicros: usdc(500), spent: [{ amountMicros: usdc(500), at: NOW - 24 * HOUR }] }));
  assert.deepEqual(r, { ok: true });
});

test('a payment into escrow counts towards the limit and needs no saved address', () => {
  assert.deepEqual(decide(chat({ exit: { kind: 'escrow' }, saved: [] })), { ok: true });
  const r = decide(chat({ exit: { kind: 'escrow' }, amountMicros: usdc(501) }));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.refusal.code, 'DAILY_LIMIT');
});

test("a web account's agent wallets pay out only to its own wallet", () => {
  const web = { kind: 'web' as const, saved: [], hasSession: false };
  assert.deepEqual(decide(chat({ ...web, exit: payout(STRANGER) })), { ok: false, refusal: { code: 'OWN_WALLET_ONLY' } });
  assert.deepEqual(decide(chat({ ...web, exit: payout(OWN), amountMicros: usdc(5_000) })), { ok: true });
});

test('a web account is not held to the chat rules when it pays into escrow', () => {
  const r = decide(chat({ kind: 'web', exit: { kind: 'escrow' }, hasSession: false, amountMicros: usdc(5_000) }));
  assert.deepEqual(r, { ok: true });
});
