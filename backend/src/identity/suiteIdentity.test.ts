import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, hashTypedData } from 'viem';
import {
  BUYING_AGENT_LIMITS,
  IdentityNeeded,
  KIND,
  bindingTypedData,
  createSuiteIdentity,
  registryAbi,
  type IdentityPorts,
} from './suiteIdentity.js';

type Hex = `0x${string}`;
const REGISTRY = '0x5409e859E1604b6Efa01827CCd3d2D7aaB1e3D5D' as Hex;
const PERSON = `0x${'aa'.repeat(20)}` as Hex;
const BUYER = `0x${'b1'.repeat(20)}` as Hex;
const SELLER = `0x${'5e'.repeat(20)}` as Hex;
const NOW = 1_800_000_000;
const YEAR = 365 * 86_400;

interface Binding { id: bigint; kind: number; expiry: bigint }

function harness(opts: { custodial?: boolean } = {}) {
  const bindings = new Map<string, Binding>();
  const nonces = new Map<string, bigint>();
  const sent: Array<{ walletId: string; fn: string; args: unknown[] }> = [];
  const signed: Array<{ walletId: string; digest: Hex }> = [];
  let count = 0n;
  let revertNext = false;
  const ports: IdentityPorts = {
    registry: REGISTRY,
    chainId: 5042002,
    now: () => NOW,
    binding: async (w) => bindings.get(w.toLowerCase()) ?? { id: 0n, kind: 0, expiry: 0n },
    nonce: async (w) => nonces.get(w.toLowerCase()) ?? 0n,
    wallets: async (user) =>
      user.toLowerCase() === PERSON
        ? {
            identity: { address: PERSON, walletId: opts.custodial === false ? null : 'identity-w' },
            buyer: { address: BUYER, walletId: 'buyer-w' },
            seller: { address: SELLER, walletId: 'seller-w' },
          }
        : null,
    signTypedData: async (walletId, typed) => {
      signed.push({ walletId, digest: hashTypedData(typed as never) });
      return `0x${'51'.repeat(65)}` as Hex;
    },
    execute: async (walletId, fn, args) => {
      sent.push({ walletId, fn, args });
      if (revertNext) {
        revertNext = false;
        return { txHash: `0x${'00'.repeat(32)}` };
      }
      if (fn === 'register') bindings.set(PERSON, { id: ++count, kind: KIND.Wallet, expiry: 0n });
      if (fn === 'bind') {
        const [wallet, kind, expiry] = args as [Hex, number, bigint];
        bindings.set(wallet.toLowerCase(), { id: bindings.get(PERSON)!.id, kind, expiry });
        nonces.set(wallet.toLowerCase(), (nonces.get(wallet.toLowerCase()) ?? 0n) + 1n);
      }
      if (fn === 'unbind') bindings.delete((args[0] as Hex).toLowerCase());
      return { txHash: `0x${'01'.repeat(32)}` };
    },
  };
  return { ports, bindings, nonces, sent, signed, identity: createSuiteIdentity(ports), revert: () => { revertNext = true; } };
}

test('status_reads_identity_and_both_bindings', async () => {
  const h = harness();
  assert.deepEqual(await h.identity.identityStatus(PERSON), { identityId: 0n, buyerBound: false, buyerExpiresAt: 0n, sellerBound: false });
  h.bindings.set(PERSON, { id: 4n, kind: KIND.Wallet, expiry: 0n });
  h.bindings.set(BUYER, { id: 4n, kind: KIND.Agent, expiry: BigInt(NOW + 100) });
  h.bindings.set(SELLER, { id: 4n, kind: KIND.Wallet, expiry: 0n });
  assert.deepEqual(await h.identity.identityStatus(PERSON), { identityId: 4n, buyerBound: true, buyerExpiresAt: BigInt(NOW + 100), sellerBound: true });
});

test('custodial_setup_runs_register_then_both_binds', async () => {
  const h = harness();
  await h.identity.setUpIdentityForCustodial(PERSON);
  assert.deepEqual(h.sent.map((s) => [s.walletId, s.fn]), [['identity-w', 'register'], ['identity-w', 'bind'], ['identity-w', 'bind']]);
  assert.deepEqual(h.signed.map((s) => s.walletId), ['buyer-w', 'seller-w'], 'each agent signs its own binding');
  const status = await h.identity.identityStatus(PERSON);
  assert.equal(status.buyerBound && status.sellerBound, true);
});

test('buying_agent_gets_the_beta_limits_and_a_year', async () => {
  const h = harness();
  await h.identity.setUpIdentityForCustodial(PERSON);
  const [wallet, kind, expiry, perPayment, total] = h.sent[1]!.args as [Hex, number, bigint, bigint, bigint];
  assert.equal(wallet, BUYER);
  assert.equal(kind, KIND.Agent);
  assert.equal(expiry, BigInt(NOW + YEAR));
  assert.equal(perPayment, 1_005_000_000n);
  assert.equal(total, 10_000_000_000n);
  assert.deepEqual(BUYING_AGENT_LIMITS, { perPayment: 1_005_000_000n, total: 10_000_000_000n, days: 365 });
});

test('selling_agent_binds_as_a_wallet', async () => {
  const h = harness();
  await h.identity.setUpIdentityForCustodial(PERSON);
  const [wallet, kind, expiry, perPayment, total] = h.sent[2]!.args as [Hex, number, bigint, bigint, bigint];
  assert.deepEqual([wallet, kind, expiry, perPayment, total], [SELLER, KIND.Wallet, 0n, 0n, 0n]);
});

test('setup_skips_what_is_already_on_chain', async () => {
  const h = harness();
  h.bindings.set(PERSON, { id: 2n, kind: KIND.Wallet, expiry: 0n });
  h.bindings.set(BUYER, { id: 2n, kind: KIND.Agent, expiry: BigInt(NOW + 1000) });
  await h.identity.setUpIdentityForCustodial(PERSON);
  assert.deepEqual(h.sent.map((s) => s.fn), ['bind']);
  assert.equal((h.sent[0]!.args as [Hex])[0], SELLER);
  h.sent.length = 0;
  await h.identity.setUpIdentityForCustodial(PERSON);
  assert.deepEqual(h.sent, [], 'nothing left to do');
});

test('a_step_circle_called_complete_that_did_not_land_is_an_error', async () => {
  const h = harness();
  h.revert();
  await assert.rejects(h.identity.setUpIdentityForCustodial(PERSON), /register did not land/);
});

test('an_expired_buying_agent_is_unbound_then_bound_again', async () => {
  const h = harness();
  h.bindings.set(PERSON, { id: 2n, kind: KIND.Wallet, expiry: 0n });
  h.bindings.set(BUYER, { id: 2n, kind: KIND.Agent, expiry: BigInt(NOW - 1) });
  h.bindings.set(SELLER, { id: 2n, kind: KIND.Wallet, expiry: 0n });
  await h.identity.setUpIdentityForCustodial(PERSON);
  assert.deepEqual(h.sent.map((s) => s.fn), ['unbind', 'bind']);
});

test('the_binding_digest_is_the_registrys_typed_data', () => {
  const typed = bindingTypedData({ registry: REGISTRY, chainId: 5042002, identityId: 1n, wallet: BUYER, kind: KIND.Agent, expiry: 9n, perPayment: 1n, total: 2n, deadline: 3n, nonce: 0n });
  assert.deepEqual(typed.domain, { name: 'KarwanIdentity', version: '1', chainId: 5042002, verifyingContract: REGISTRY });
  assert.deepEqual(typed.types.Bind.map((f) => `${f.type} ${f.name}`), [
    'uint64 id', 'address wallet', 'uint8 kind', 'uint64 expiry', 'uint128 perPayment', 'uint128 total', 'uint256 nonce', 'uint256 deadline',
  ]);
});

test('web3_gets_only_the_missing_calls', async () => {
  const h = harness({ custodial: false });
  const first = await h.identity.preparedSetupCalls(PERSON);
  assert.equal(first.length, 1, 'register first; the bindings name the identity it creates');
  assert.equal(decodeFunctionData({ abi: registryAbi, data: first[0]!.data }).functionName, 'register');
  assert.equal(first[0]!.to, REGISTRY);
  h.bindings.set(PERSON, { id: 3n, kind: KIND.Wallet, expiry: 0n });
  const second = await h.identity.preparedSetupCalls(PERSON);
  assert.deepEqual(second.map((c) => decodeFunctionData({ abi: registryAbi, data: c.data }).functionName), ['bind', 'bind']);
  assert.deepEqual(h.signed.map((s) => s.walletId), ['buyer-w', 'seller-w']);
  h.bindings.set(BUYER, { id: 3n, kind: KIND.Agent, expiry: BigInt(NOW + YEAR) });
  h.bindings.set(SELLER, { id: 3n, kind: KIND.Wallet, expiry: 0n });
  assert.deepEqual(await h.identity.preparedSetupCalls(PERSON), []);
});

test('expired_agent_asks_to_renew', async () => {
  const h = harness();
  h.bindings.set(PERSON, { id: 2n, kind: KIND.Wallet, expiry: 0n });
  h.bindings.set(BUYER, { id: 2n, kind: KIND.Agent, expiry: BigInt(NOW - 1) });
  h.bindings.set(SELLER, { id: 2n, kind: KIND.Wallet, expiry: 0n });
  await assert.rejects(h.identity.requireIdentity(PERSON, 'buyer'), (e: unknown) => e instanceof IdentityNeeded && e.code === 'agent_renewal_needed');
  await h.identity.requireIdentity(PERSON, 'seller');
});

test('require_identity_names_what_is_missing', async () => {
  const h = harness();
  await assert.rejects(h.identity.requireIdentity(PERSON, 'buyer'), (e: unknown) => e instanceof IdentityNeeded && e.code === 'record_setup_needed');
  await assert.rejects(h.identity.requireIdentity(PERSON, 'seller'), (e: unknown) => e instanceof IdentityNeeded && e.code === 'record_setup_needed');
  await assert.rejects(h.identity.requireIdentity(`0x${'cc'.repeat(20)}`, 'buyer'), (e: unknown) => e instanceof IdentityNeeded && e.code === 'record_setup_needed');
});
