import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAgentBridgeWallet, type AgentBridgeDeps } from './agentBridgeWallet.js';
import type { AgentWallets } from '../db/agentWallets.js';

/// The rule this file protects: an agent's wallet on a source chain must come
/// back at the agent's OWN address. Derivation from the agent anchor guarantees
/// that; `createWallets` does not, and taking that fallback would hand the agent
/// a different address on the source chain than the one holding the money — and,
/// per this repo's own wallet audit, possibly an index another user owns.

const OWNER = '0xbbb45de4771e5f465f800785bb919ea35ad813d7';
const BUYER = '0x73ac47e2da42d43f6ab467eebfe68328beccde00';
const SELLER = '0x1111111111111111111111111111111111111111';

interface Harness {
  deps: AgentBridgeDeps;
  calls: Array<{ anchor?: string; blockchain: string; deriveOnly?: boolean }>;
  saved: AgentWallets | null;
}

function harness(
  record: AgentWallets | null,
  derived: { walletId: string; address: string } | Error,
): Harness {
  const h: Harness = { calls: [], saved: null, deps: {} as AgentBridgeDeps };
  h.deps = {
    getAgentWallets: async () => record,
    saveAgentWallets: async (next: AgentWallets) => {
      h.saved = next;
    },
    provisionUserBridgeWallet: async (
      _owner: string,
      blockchain: string,
      anchor?: string,
      opts?: { deriveOnly?: boolean },
    ) => {
      h.calls.push({ anchor, blockchain, deriveOnly: opts?.deriveOnly });
      if (derived instanceof Error) throw derived;
      return { ...derived, blockchain } as never;
    },
  } as AgentBridgeDeps;
  return h;
}

const base = (over: Partial<AgentWallets> = {}): AgentWallets => ({
  userAddress: OWNER,
  buyerWalletId: 'buyer-arc',
  buyerAddress: BUYER,
  sellerWalletId: 'seller-arc',
  sellerAddress: SELLER,
  createdAt: 1,
  ...over,
});

test('derives from the AGENT anchor, not the identity anchor', async () => {
  const h = harness(base(), { walletId: 'buyer-base', address: BUYER });
  const got = await ensureAgentBridgeWallet(OWNER, 'buyerAgent', 'BASE-SEPOLIA', h.deps);
  assert.equal(got.address, BUYER);
  assert.equal(h.calls.length, 1);
  // The anchor pins the address. The identity wallet would derive the USER's
  // address and burn from a wallet that holds nothing.
  assert.equal(h.calls[0]!.anchor, 'buyer-arc');
  // deriveOnly, always: the createWallets fallback takes the next per-chain
  // index and produces a different address.
  assert.equal(h.calls[0]!.deriveOnly, true);
});

test('refuses a derived address that is not the agent address', async () => {
  const h = harness(base(), {
    walletId: 'buyer-base',
    address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  });
  await assert.rejects(
    () => ensureAgentBridgeWallet(OWNER, 'buyerAgent', 'BASE-SEPOLIA', h.deps),
    /not the agent address/,
  );
  // Nothing persisted. A wrong address written once would be reused forever.
  assert.equal(h.saved, null);
});

test('reuses an already derived wallet instead of deriving twice', async () => {
  const h = harness(
    base({ buyerBridgeWallets: { 'BASE-SEPOLIA': { walletId: 'buyer-base', address: BUYER } } }),
    new Error('should not be called'),
  );
  const got = await ensureAgentBridgeWallet(OWNER, 'buyerAgent', 'BASE-SEPOLIA', h.deps);
  assert.equal(got.walletId, 'buyer-base');
  assert.equal(h.calls.length, 0);
});

test('buyer and seller keep separate slots', async () => {
  const h = harness(base(), { walletId: 'seller-base', address: SELLER });
  await ensureAgentBridgeWallet(OWNER, 'sellerAgent', 'BASE-SEPOLIA', h.deps);
  assert.ok(h.saved?.sellerBridgeWallets?.['BASE-SEPOLIA']);
  assert.equal(h.saved?.buyerBridgeWallets, undefined);
  assert.equal(h.calls[0]!.anchor, 'seller-arc');
});

test('a chain already derived for the buyer does not stop the seller', async () => {
  const h = harness(
    base({ buyerBridgeWallets: { 'BASE-SEPOLIA': { walletId: 'buyer-base', address: BUYER } } }),
    { walletId: 'seller-base', address: SELLER },
  );
  await ensureAgentBridgeWallet(OWNER, 'sellerAgent', 'BASE-SEPOLIA', h.deps);
  assert.equal(h.calls.length, 1);
  // Both slots survive the write.
  assert.ok(h.saved?.buyerBridgeWallets?.['BASE-SEPOLIA']);
  assert.ok(h.saved?.sellerBridgeWallets?.['BASE-SEPOLIA']);
});

test('an unactivated account is refused rather than half-provisioned', async () => {
  const h = harness(null, new Error('should not be called'));
  await assert.rejects(
    () => ensureAgentBridgeWallet(OWNER, 'buyerAgent', 'BASE-SEPOLIA', h.deps),
    /activate first/,
  );
  assert.equal(h.calls.length, 0);
});
