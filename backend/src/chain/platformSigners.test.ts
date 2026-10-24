import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DEAL_STATE, type DealV3View } from './dealEscrowV3.js';
import { createPlatformSigners, PlatformKeysError, type PlatformSignerPorts } from './platformSigners.js';

// Throwaway keys made for this test only; they hold nothing on any network.
const K1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const K2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as Hex;
const K3 = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' as Hex;
const ARBITER = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' as Hex;
const ISSUER = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex;
const FAMILY = `0x${'55'.repeat(20)}` as Hex;
const DEAL = `0x${'d1'.repeat(32)}` as Hex;
const DIGEST = `0x${'ab'.repeat(32)}` as Hex;
const Z20 = `0x${'00'.repeat(20)}` as Hex;

const view = (over: Partial<DealV3View> = {}): DealV3View => ({
  state: DEAL_STATE.Accepted, buyer: Z20, seller: Z20, buyerId: Z20, sellerId: Z20, count: 1, paid: 0, extUsed: 0, revision: 2,
  checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false, deliveredAt: 5n, reviewStartAt: 0n,
  reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n,
  feeReleased: 0n, reserved: 0n, termsHash: `0x${'00'.repeat(32)}`, ...over,
});

function ports(over: Partial<PlatformSignerPorts> = {}) {
  const logs: string[] = [];
  const sent: Array<{ fn: string; args: unknown[]; from: Hex }> = [];
  let current = view();
  const p: PlatformSignerPorts = {
    family: FAMILY,
    readReportDigest: async () => DIGEST,
    send: async (from, fn, args) => {
      sent.push({ fn, args, from });
      if (fn === 'report' && args[3] === true) current = { ...current, checkPassed: true };
      return `0x${'01'.repeat(32)}` as Hex;
    },
    readView: async () => current,
    receiptReported: async () => true,
    log: (line) => logs.push(line),
    ...over,
  };
  return { p, logs, sent };
}

const keys = { checkerKeys: [K3, K1, K2], arbiterKey: ARBITER, issuerKey: ISSUER };

test('two_signers_ascending_and_recover_to_checkers', async () => {
  const { p } = ports();
  const signers = createPlatformSigners(keys, p);
  const { signers: who, sigs } = await signers.twoCheckerSignatures(DIGEST);
  assert.equal(who.length, 2);
  assert.ok(BigInt(who[0]!) < BigInt(who[1]!), 'ascending');
  const checkers = [K1, K2, K3].map((k) => privateKeyToAccount(k).address.toLowerCase());
  for (let i = 0; i < 2; i++) {
    const recovered = (await recoverAddress({ hash: DIGEST, signature: sigs[i]! })).toLowerCase();
    assert.equal(recovered, who[i]!.toLowerCase());
    assert.ok(checkers.includes(recovered));
  }
});

test('refuses_to_start_with_fewer_than_three_checker_keys', () => {
  const { p } = ports();
  assert.throws(() => createPlatformSigners({ ...keys, checkerKeys: [K1, K2] }, p), PlatformKeysError);
  assert.throws(() => createPlatformSigners({ ...keys, checkerKeys: [K1, K1, K2] }, p), PlatformKeysError, 'three different keys');
  assert.throws(() => createPlatformSigners({ ...keys, arbiterKey: '0x1234' as Hex }, p), PlatformKeysError);
});

test('submit_check_proves_check_passed', async () => {
  const { p, sent } = ports();
  const signers = createPlatformSigners(keys, p);
  const r = await signers.submitCheck({ dealId: DEAL, revision: 2, pass: true, evidenceHash: `0x${'ee'.repeat(32)}` });
  assert.equal(r.txHash, `0x${'01'.repeat(32)}`);
  assert.equal(sent[0]!.fn, 'report');
  assert.equal(sent[0]!.from, privateKeyToAccount(ARBITER).address);
  assert.deepEqual(sent[0]!.args.slice(0, 5), [FAMILY, DEAL, 2, true, `0x${'ee'.repeat(32)}`]);
});

test('a_check_that_did_not_land_is_an_error', async () => {
  const { p } = ports({ send: async () => `0x${'02'.repeat(32)}` as Hex, receiptReported: async () => false });
  const signers = createPlatformSigners(keys, p);
  await assert.rejects(signers.submitCheck({ dealId: DEAL, revision: 2, pass: true, evidenceHash: `0x${'ee'.repeat(32)}` }), /did not land/);
  await assert.rejects(signers.submitCheck({ dealId: DEAL, revision: 2, pass: false, evidenceHash: `0x${'ee'.repeat(32)}` }), /did not land/);
});

test('keys_never_appear_in_log_output', async () => {
  const { p, logs } = ports({ send: async () => { throw new Error('rpc down'); } });
  const signers = createPlatformSigners(keys, p);
  await assert.rejects(signers.submitCheck({ dealId: DEAL, revision: 2, pass: true, evidenceHash: `0x${'ee'.repeat(32)}` }));
  await assert.rejects(signers.arbiterSend('proposeRuling', [DEAL, 5000, DIGEST]));
  const everything = [...logs, JSON.stringify(signers), String(signers), JSON.stringify(Object.entries(signers))].join('\n').toLowerCase();
  for (const k of [K1, K2, K3, ARBITER, ISSUER]) {
    assert.ok(!everything.includes(k.slice(2).toLowerCase()), 'a key leaked');
  }
  assert.ok(logs.length > 0, 'the failures were logged, without keys');
});

test('a_bad_or_missing_key_is_reported_without_stopping_the_backend', async () => {
  const { loadPlatformSigners } = await import('./platformSigners.js');
  const { p } = ports();
  const bad = loadPlatformSigners({ checkerKeys: [K1, K2, K3], arbiterKey: '0x1234', issuerKey: ISSUER }, p);
  assert.equal(bad.signers, null);
  assert.equal(bad.problem, 'the arbiter key is not a private key');
  const unset = loadPlatformSigners({ checkerKeys: [], arbiterKey: undefined, issuerKey: undefined }, p);
  assert.equal(unset.signers, null);
  assert.match(unset.problem ?? '', /not set/);
  const good = loadPlatformSigners(keys, p);
  assert.ok(good.signers);
  assert.equal(good.problem, null);
});
