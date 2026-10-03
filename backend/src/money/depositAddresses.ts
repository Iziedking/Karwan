/// Where this account receives USDC from other chains. One EVM address serves
/// Ethereum, Base, Arbitrum and Polygon; Solana has its own. Shared by the
/// deposit card and the assistant so both name the same watched addresses.

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
  USER_DCW_WALLETS,
  type CctpChainKey,
} from '../chain/cctpChains.js';
import { logger } from '../logger.js';

/// The chains the deposit card offers. Solana last, because it is the one that
/// needs its own address and reads as the exception.
const DEPOSIT_CHAINS: BridgeBlockchain[] = [
  ETH_SEPOLIA_BLOCKCHAIN,
  BASE_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
];

export interface DepositChain {
  /// Frontend chain key, so the card can reuse the labels it already has.
  key: string;
  name: string;
  /// Where to send USDC on this chain.
  address: string;
}

function isCctpChainKey(key: string): key is CctpChainKey {
  return (CCTP_CHAIN_KEYS as readonly string[]).includes(key);
}

export type DepositAddresses =
  | { supported: true; chains: DepositChain[]; solana: DepositChain | null }
  | { supported: false; reason: 'not_on_this_network' | 'web3_account' | 'not_activated'; chains: []; solana: null };

/// The caller must already have proven `userAddress` is the signed-in account.
export async function readDepositAddresses(userAddress: string): Promise<DepositAddresses> {
  // Web3 accounts deposit by bridging from the wallet they already hold, so
  // there is nothing to show them here. Provisioning a backend deposit wallet
  // for them is also refused at the source: it advances the shared per-chain
  // index counter, which is what collides addresses between users.
  if (!USER_DCW_WALLETS) {
    return { supported: false, reason: 'not_on_this_network', chains: [], solana: null };
  }

  const user = getUserByAddress(userAddress);
  if (!user?.circleIdentityWalletId) {
    return { supported: false, reason: 'web3_account', chains: [], solana: null };
  }

  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return { supported: false, reason: 'not_activated', chains: [], solana: null };

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

  return { supported: true, chains, solana };
}
