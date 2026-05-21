import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config } from '../config.js';
import { logger } from '../logger.js';

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function circleWalletsClient() {
  if (_client) return _client;
  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');
  }
  _client = initiateDeveloperControlledWalletsClient({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
  });
  return _client;
}

export const ARC_TESTNET_BLOCKCHAIN = 'ARC-TESTNET' as const;
/// Source chains Circle users can bridge USDC INTO Arc from. Provisioned per
/// user so the backend can sign the CCTP burn on the source side without the
/// user needing to bring a web3 wallet. The exact strings here must match
/// Circle's DCW createWallets blockchain enum (verified against the API ref
/// at https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-wallet).
export const BASE_SEPOLIA_BLOCKCHAIN = 'BASE-SEPOLIA' as const;
export const ETH_SEPOLIA_BLOCKCHAIN = 'ETH-SEPOLIA' as const;
export type BridgeBlockchain =
  | typeof BASE_SEPOLIA_BLOCKCHAIN
  | typeof ETH_SEPOLIA_BLOCKCHAIN;

export interface ProvisionedAgentWallets {
  buyerWalletId: string;
  buyerAddress: string;
  sellerWalletId: string;
  sellerAddress: string;
}

export interface ProvisionedIdentityWallet {
  walletId: string;
  address: string;
}

export interface ProvisionedBridgeWallet {
  walletId: string;
  address: string;
  blockchain: BridgeBlockchain;
}

/// Creates a single Circle wallet that represents a user's on-chain identity.
/// Used by the email + passkey signup flow so users who never bring a web3
/// wallet still have a real Arc address. The refId carries the email's hash
/// so the Circle wallet set can be rebuilt from emails if our DB ever burns.
export async function provisionUserIdentityWallet(
  emailHash: string,
): Promise<ProvisionedIdentityWallet> {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [{ name: 'karwan-identity', refId: emailHash }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error('identity wallet provisioning returned incomplete data');
  }
  return { walletId: wallet.id, address: wallet.address };
}

/// Creates a buyer agent wallet and a seller agent wallet for one user. Both are
/// SCA wallets on Arc Testnet under the platform wallet set. The user funds them
/// themselves; the platform never holds their keys beyond the entity secret.
///
/// Each wallet carries the user's address as its Circle refId. The wallets live
/// on Circle's infrastructure, not in our database, so if our store is ever
/// lost the user -> wallet mapping can be rebuilt by listing the wallet set and
/// reading refId. No funds are at risk from a database loss.
export async function provisionUserAgentWallets(
  userAddress: string,
): Promise<ProvisionedAgentWallets> {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const refId = userAddress.toLowerCase();
  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    count: 2,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [
      { name: 'karwan-buyer-agent', refId },
      { name: 'karwan-seller-agent', refId },
    ],
  });
  const wallets = res.data?.wallets ?? [];
  if (wallets.length !== 2) {
    throw new Error(`expected 2 wallets, got ${wallets.length}`);
  }
  const [buyer, seller] = wallets;
  if (!buyer?.id || !buyer.address || !seller?.id || !seller.address) {
    throw new Error('wallet provisioning returned incomplete data');
  }
  return {
    buyerWalletId: buyer.id,
    buyerAddress: buyer.address,
    sellerWalletId: seller.id,
    sellerAddress: seller.address,
  };
}

/// Creates a single Circle wallet on a CCTP source chain (Base Sepolia,
/// Ethereum Sepolia, etc.) for the user. Used by the bridge flow so a
/// Circle-auth user can have the backend sign their CCTP burn from a DCW
/// the platform controls. The user funds this DCW via faucet or external
/// transfer before bridging.
///
/// Lazy provisioning: this is called both at activation (Base Sepolia by
/// default) and on-demand the first time a user bridges from a chain we
/// haven't already provisioned. The metadata `refId` carries the user
/// address so the same wallet can be rebuilt from Circle's wallet set
/// listing if our DB is ever lost.
export async function provisionUserBridgeWallet(
  userAddress: string,
  blockchain: BridgeBlockchain,
): Promise<ProvisionedBridgeWallet> {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const refId = userAddress.toLowerCase();
  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [blockchain],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [{ name: `karwan-bridge-${blockchain.toLowerCase()}`, refId }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error(`bridge wallet provisioning on ${blockchain} returned incomplete data`);
  }
  return { walletId: wallet.id, address: wallet.address, blockchain };
}

const FAUCET_URL = 'https://api.circle.com/v1/faucet/drips';

/// Best-effort testnet USDC drip from Circle's public faucet to a wallet, so a
/// new user's wallet is spendable immediately without hunting for a faucet
/// (Circle drips 20 USDC per address per 2h, Arc Testnet supported). Non-fatal
/// by design: faucet rate limits and outages must NEVER block signup or
/// activation, so this swallows all errors and is meant to be fire-and-forget.
/// Auto-skips unless the Circle key is a testnet key, so it's a no-op on
/// mainnet without any extra config.
export async function dripTestnetUsdc(
  address: string,
  blockchain: string = ARC_TESTNET_BLOCKCHAIN,
): Promise<void> {
  const key = config.CIRCLE_API_KEY;
  if (!key || !key.startsWith('TEST_API_KEY')) return; // live key: no faucet
  try {
    const res = await fetch(FAUCET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ address, blockchain, usdc: true }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn(
        { address, blockchain, status: res.status, detail: detail.slice(0, 200) },
        'testnet USDC drip non-2xx (often a per-address rate limit; non-fatal)',
      );
      return;
    }
    logger.info({ address, blockchain }, 'testnet USDC drip requested');
  } catch (err) {
    logger.warn(
      { address, blockchain, err: (err as Error).message },
      'testnet USDC drip failed (non-fatal)',
    );
  }
}
