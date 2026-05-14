import { baseSepolia, sepolia } from 'viem/chains';
import { arcTestnet } from '@/core/wagmi';

// CCTP V2 deploys the same canonical addresses for TokenMessenger and MessageTransmitter
// across all supported testnets, so we only vary chainId, domain, and USDC.
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const;

export interface SourceChainConfig {
  key: 'baseSepolia' | 'sepolia';
  chainId: number;
  domain: number;
  name: string;
  shortName: string;
  usdc: `0x${string}`;
  tokenMessenger: `0x${string}`;
  explorerTx: (hash: string) => string;
}

export const SOURCE_CHAINS: Record<SourceChainConfig['key'], SourceChainConfig> = {
  baseSepolia: {
    key: 'baseSepolia',
    chainId: baseSepolia.id,
    domain: 6,
    name: 'Base Sepolia',
    shortName: 'Base',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
  sepolia: {
    key: 'sepolia',
    chainId: sepolia.id,
    domain: 0,
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
};

export const ARC_TESTNET = {
  chainId: arcTestnet.id,
  domain: 26,
  messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const,
  tokenMinter: '0xb43db544E2c27092c107639Ad201b3dEfAbcF192' as const,
};

// Default fast finality threshold for CCTP V2. 2000 = "fast" (~13s on Base/Eth testnets).
export const FINALITY_THRESHOLD_FAST = 2000;

// CCTP V2 message format pads the recipient to bytes32.
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}
