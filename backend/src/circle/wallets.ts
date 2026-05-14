import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config } from '../config.js';

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

export interface ProvisionedAgentWallets {
  buyerWalletId: string;
  buyerAddress: string;
  sellerWalletId: string;
  sellerAddress: string;
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
