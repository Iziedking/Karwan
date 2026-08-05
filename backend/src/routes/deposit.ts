import { Hono } from 'hono';
import { z } from 'zod';
import { isSessionSelf } from '../auth/session.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { invalidateDepositIndex } from '../circle/depositWatcher.js';
import {
  provisionUserBridgeWallet,
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
  type BridgeBlockchain,
} from '../circle/wallets.js';
import {
  CCTP_CHAINS,
  CCTP_CHAIN_KEYS,
  chainKeyForCircleBlockchain,
  type CctpChainKey,
} from '../chain/cctpChains.js';
import { logger } from '../logger.js';

/// Everything the deposit card needs, with Circle's vocabulary left behind.
///
/// The card asks one question: where do I send money from another chain, and is
/// it being watched? So this answers in those terms. `BASE-SEPOLIA`, walletIds
/// and the per-chain derivation never reach the browser, because a user
/// depositing money has no use for any of it.
///
/// Two addresses, not five. Circle derives every EVM deposit wallet from the
/// user's identity anchor, so one address serves Ethereum, Base, Arbitrum and
/// Polygon. Solana is a different curve and can never share it, so it is
/// reported separately rather than folded in and quietly wrong.
export const depositRoutes = new Hono();

const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

/// The chains the deposit card offers. Solana last, because it is the one that
/// needs its own address and reads as the exception.
const DEPOSIT_CHAINS: BridgeBlockchain[] = [
  ETH_SEPOLIA_BLOCKCHAIN,
  BASE_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
];

interface DepositChain {
  /// Frontend chain key, so the card can reuse the labels it already has.
  key: string;
  name: string;
  /// Where to send USDC on this chain.
  address: string;
}

function isCctpChainKey(key: string): key is CctpChainKey {
  return (CCTP_CHAIN_KEYS as readonly string[]).includes(key);
}

depositRoutes.get('/address', async (c) => {
  const raw = c.req.query('address');
  if (!raw) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const userAddress = parsed.data.toLowerCase();

  // A deposit address is where somebody's money lands. Handing one out for an
  // account that is not yours would let a stranger watch, or misdirect, another
  // user's funding.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only read your own deposit address.', code: 'forbidden' }, 403);
  }

  // Web3 accounts deposit by bridging from the wallet they already hold, so
  // there is nothing to show them here. Provisioning a backend deposit wallet
  // for them is also refused at the source: it advances the shared per-chain
  // index counter, which is what collides addresses between users.
  const user = getUserByAddress(userAddress);
  if (!user?.circleIdentityWalletId) {
    return c.json({ supported: false, reason: 'web3_account', chains: [], solana: null });
  }

  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ supported: false, reason: 'not_activated', chains: [], solana: null });

  // Heal accounts that activated before every chain was provisioned up front.
  // Without this an older user is told to send from Arbitrum and nothing is
  // watching, because Circle only reports inbound transfers on a chain it holds
  // a wallet on.
  let bridgeWallets = wallets.bridgeWallets ?? {};
  const missing = DEPOSIT_CHAINS.filter((chain) => !bridgeWallets[chain]);
  if (missing.length > 0) {
    // deriveOnly on the EVM chains: derive is a pure function of the anchor and
    // safe to run concurrently, while the createWallets fallback consumes a
    // shared index. Solana has no derive path and is the single create.
    const results = await Promise.allSettled(
      missing.map((chain) =>
        provisionUserBridgeWallet(userAddress, chain, undefined, {
          deriveOnly: chain !== SOL_DEVNET_BLOCKCHAIN,
        }),
      ),
    );
    const added: Record<string, { walletId: string; address: string }> = {};
    for (const [i, result] of results.entries()) {
      const chain = missing[i]!;
      if (result.status === 'fulfilled') {
        added[chain] = { walletId: result.value.walletId, address: result.value.address };
      } else {
        logger.warn(
          { userAddress, chain, err: (result.reason as Error)?.message },
          'deposit chain could not be provisioned on demand; it stays off the card',
        );
      }
    }
    if (Object.keys(added).length > 0) {
      bridgeWallets = { ...bridgeWallets, ...added };
      await saveAgentWallets({ ...wallets, bridgeWallets });
      // So a deposit arriving in the next few seconds is attributed rather than
      // waiting out the watcher's index TTL.
      invalidateDepositIndex();
    }
  }

  const chains: DepositChain[] = [];
  let solana: DepositChain | null = null;
  for (const chain of DEPOSIT_CHAINS) {
    const wallet = bridgeWallets[chain];
    // A chain with no wallet is omitted rather than shown as unavailable. The
    // card must never name a chain nothing is watching, and "Arbitrum, but not
    // right now" is a sentence a person depositing money should not have to read.
    if (!wallet) continue;
    const key = chainKeyForCircleBlockchain(chain);
    if (!key) continue;

    if (chain === SOL_DEVNET_BLOCKCHAIN) {
      // Solana is not a CCTP_CHAINS row (no hex USDC address, no viem chain), so
      // its name is stated here rather than looked up.
      solana = { key, name: 'Solana', address: wallet.address };
      continue;
    }
    if (!isCctpChainKey(key)) continue;
    chains.push({ key, name: CCTP_CHAINS[key].shortName, address: wallet.address });
  }

  return c.json({ supported: true, chains, solana });
});
