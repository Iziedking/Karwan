import type { AgentWallets } from '../db/agentWallets.js';

export type CircleBridgeSourceKind = 'identity' | 'buyerAgent' | 'sellerAgent';

export function resolveCircleBridgeSource(
  wallets: AgentWallets,
  sourceKind: CircleBridgeSourceKind,
  circleBlockchain: string,
  mintRecipient: string,
): { walletId: string; address: string; mintRecipient: string } {
  const source = sourceKind === 'buyerAgent'
    ? { walletId: wallets.buyerWalletId, address: wallets.buyerAddress }
    : sourceKind === 'sellerAgent'
      ? { walletId: wallets.sellerWalletId, address: wallets.sellerAddress }
      : wallets.bridgeWallets?.[circleBlockchain];
  if (!source?.walletId || !source.address) throw new Error(`${sourceKind} wallet is not provisioned`);
  if (sourceKind !== 'identity' && source.address.toLowerCase() !== mintRecipient.toLowerCase()) {
    throw new Error('agent bridge must mint to the same agent wallet');
  }
  return { ...source, mintRecipient: mintRecipient.toLowerCase() };
}
