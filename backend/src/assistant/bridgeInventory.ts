import type { AgentWallets } from '../db/agentWallets.js';

export type BridgeHolder = { address: string; signer: 'user' | 'backend' };
export type BridgeSourceHolders = {
  accountType: 'web3' | 'email/passkey';
  main: BridgeHolder;
  buyerAgent: BridgeHolder;
  sellerAgent: BridgeHolder;
};

export function bridgeSourceHolders(
  method: string,
  identityAddress: string,
  record: AgentWallets,
  circleBlockchain: string,
): BridgeSourceHolders {
  const circle = method === 'circle';
  const deposit = record.bridgeWallets?.[circleBlockchain]?.address;
  return {
    accountType: circle ? 'email/passkey' : 'web3',
    main: { address: (circle ? deposit : identityAddress) ?? identityAddress, signer: circle ? 'backend' : 'user' },
    buyerAgent: { address: record.buyerAddress, signer: 'backend' },
    sellerAgent: { address: record.sellerAddress, signer: 'backend' },
  };
}
