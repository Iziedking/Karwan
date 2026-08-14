import { getAgentWallets, saveAgentWallets, type AgentWallets } from '../db/agentWallets.js';
import { provisionUserBridgeWallet } from './wallets.js';
import type { BridgeBlockchain } from './wallets.js';
import { logger } from '../logger.js';

/// Let an agent spend the money it is already holding on another chain.
///
/// ## What was wrong before this
///
/// A Circle SCA has the same address on every EVM chain, so a buyer agent can
/// hold 20 USDC on Base with no Circle wallet record on Base at all. The record
/// is what lets us SIGN there, and the absence of one was mistaken for a
/// permanent property of agent wallets: the assistant told a user their agent's
/// cross-chain balance "can only be signed for on Arc" and could never be
/// moved. That was wrong, and it was wrong in the worst direction — telling
/// someone their money is unreachable when it is one API call away.
///
/// Circle documents this exact case: derive a wallet on the new chain from the
/// existing walletId and it comes back with the SAME address, which is how the
/// deposit wallets in this codebase have always worked. Gas Station sponsors
/// gas for developer-controlled SCAs on every chain in play, so the burn costs
/// the agent nothing and asks the user for nothing.
///
/// ## Why on demand
///
/// Two agents across seven chains is fourteen wallets per user, and almost none
/// of them ever hold anything. Derivation is idempotent and takes one call, so
/// it happens the first time an agent actually needs to spend on that chain.

export type AgentKind = 'buyerAgent' | 'sellerAgent';

interface Resolved {
  walletId: string;
  address: string;
}

function slotFor(kind: AgentKind): 'buyerBridgeWallets' | 'sellerBridgeWallets' {
  return kind === 'buyerAgent' ? 'buyerBridgeWallets' : 'sellerBridgeWallets';
}

function anchorFor(record: AgentWallets, kind: AgentKind): Resolved | null {
  const walletId = kind === 'buyerAgent' ? record.buyerWalletId : record.sellerWalletId;
  const address = kind === 'buyerAgent' ? record.buyerAddress : record.sellerAddress;
  return walletId && address ? { walletId, address } : null;
}

/// The agent's wallet on `blockchain`, deriving it if this is the first time.
///
/// Throws rather than returning null on failure: every caller is about to move
/// money and none of them can do anything useful with "maybe". The address it
/// returns is always the agent's own Arc address, because that is what deriving
/// from the agent anchor guarantees — if Circle ever returns a different one,
/// that is a broken assumption and not something to paper over, so it is
/// checked and refused.
/// The three collaborators, injectable so the address guarantee below can be
/// tested without a Circle account. ESM exports are read-only, so a test cannot
/// reach in and stub them; passing them is the only honest seam.
export interface AgentBridgeDeps {
  getAgentWallets: typeof getAgentWallets;
  saveAgentWallets: typeof saveAgentWallets;
  provisionUserBridgeWallet: typeof provisionUserBridgeWallet;
}

const liveDeps: AgentBridgeDeps = {
  getAgentWallets,
  saveAgentWallets,
  provisionUserBridgeWallet,
};

export async function ensureAgentBridgeWallet(
  userAddress: string,
  kind: AgentKind,
  blockchain: BridgeBlockchain,
  deps: AgentBridgeDeps = liveDeps,
): Promise<Resolved> {
  const owner = userAddress.toLowerCase();
  const record = await deps.getAgentWallets(owner);
  if (!record) throw new Error('no agent wallet record; activate first');

  const anchor = anchorFor(record, kind);
  if (!anchor) throw new Error(`${kind} wallet is not provisioned`);

  const slot = slotFor(kind);
  const existing = record[slot]?.[blockchain];
  if (existing?.walletId && existing.address) return existing;

  logger.info({ owner, kind, blockchain }, 'deriving an agent bridge wallet');

  // deriveOnly, always. The createWallets fallback takes the next per-chain
  // index from the shared wallet set, which would hand this agent a DIFFERENT
  // address on the source chain than the one actually holding the money — and
  // per this repo's own audit, an index that another user may already own.
  const derived = await deps.provisionUserBridgeWallet(owner, blockchain, anchor.walletId, {
    deriveOnly: true,
  });

  if (derived.address.toLowerCase() !== anchor.address.toLowerCase()) {
    throw new Error(
      `derived ${kind} wallet on ${blockchain} is ${derived.address}, not the agent address ${anchor.address}`,
    );
  }

  const next: AgentWallets = {
    ...record,
    [slot]: {
      ...(record[slot] ?? {}),
      [blockchain]: { walletId: derived.walletId, address: derived.address },
    },
  };
  await deps.saveAgentWallets(next);

  return { walletId: derived.walletId, address: derived.address };
}
