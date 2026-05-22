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
export const OP_SEPOLIA_BLOCKCHAIN = 'OP-SEPOLIA' as const;
export const ARB_SEPOLIA_BLOCKCHAIN = 'ARB-SEPOLIA' as const;
export const POLYGON_AMOY_BLOCKCHAIN = 'MATIC-AMOY' as const;
export type BridgeBlockchain =
  | typeof BASE_SEPOLIA_BLOCKCHAIN
  | typeof ETH_SEPOLIA_BLOCKCHAIN
  | typeof OP_SEPOLIA_BLOCKCHAIN
  | typeof ARB_SEPOLIA_BLOCKCHAIN
  | typeof POLYGON_AMOY_BLOCKCHAIN;

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

export interface DripOptions {
  /// Target chain. Defaults to Arc Testnet. Use BASE-SEPOLIA / ETH-SEPOLIA to
  /// fund a bridge wallet on its source chain.
  blockchain?: string;
  /// Request native gas (e.g. Sepolia ETH) too. Needed for bridge wallets,
  /// which pay CCTP approve+burn gas in the source chain's native token. On Arc
  /// USDC is the gas token, so native is unnecessary there.
  native?: boolean;
  /// Request USDC. Defaults true.
  usdc?: boolean;
}

export interface DripResult {
  ok: boolean;
  /// HTTP status from the faucet when it answered (e.g. 429 on a rate limit).
  status?: number;
  /// Short reason when !ok, safe to surface to the user.
  detail?: string;
}

/// Best-effort testnet drip from Circle's public faucet to a wallet, so a new
/// user's wallet is usable immediately without hunting for a faucet (Circle
/// drips ~20 USDC and a little native gas per address per 2h). Auto-skips unless
/// the Circle key is a testnet key, so it's a no-op on mainnet. Returns a result
/// so a user-triggered refuel can report success vs a rate limit; signup /
/// activation callers ignore it (fire-and-forget) so the faucet never blocks them.
export async function dripTestnetUsdc(address: string, opts: DripOptions = {}): Promise<DripResult> {
  const key = config.CIRCLE_API_KEY;
  if (!key || !key.startsWith('TEST_API_KEY')) {
    return { ok: false, detail: 'faucet is only available on testnet' };
  }
  const blockchain = opts.blockchain ?? ARC_TESTNET_BLOCKCHAIN;
  const wantUsdc = opts.usdc ?? true;
  const wantNative = opts.native ?? false;
  if (!wantUsdc && !wantNative) return { ok: false, detail: 'nothing requested' };
  try {
    const res = await fetch(FAUCET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ address, blockchain, native: wantNative, usdc: wantUsdc }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn(
        { address, blockchain, native: wantNative, status: res.status, detail: detail.slice(0, 200) },
        'testnet drip non-2xx (often a per-address rate limit)',
      );
      return { ok: false, status: res.status, detail: detail.slice(0, 200) };
    }
    logger.info({ address, blockchain, native: wantNative, usdc: wantUsdc }, 'testnet drip requested');
    return { ok: true };
  } catch (err) {
    logger.warn(
      { address, blockchain, err: (err as Error).message },
      'testnet drip failed',
    );
    return { ok: false, detail: (err as Error).message };
  }
}
