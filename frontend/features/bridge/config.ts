import {
  baseSepolia,
  sepolia,
  optimismSepolia,
  arbitrumSepolia,
  polygonAmoy,
} from 'viem/chains';
import { arcTestnet } from '@/core/wagmi';

// CCTP V2 deploys the same canonical TokenMessenger + MessageTransmitter across
// every testnet, so a chain is just chainId + domain + USDC. Verified against
// Circle's docs 2026-05-22. Mirrors backend/src/chain/cctpChains.ts.
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const;

export type CctpChainKey =
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'baseSepolia'
  | 'polygonAmoy';

export interface SourceChainConfig {
  key: CctpChainKey;
  chainId: number;
  domain: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
  usdc: `0x${string}`;
  tokenMessenger: `0x${string}`;
  explorerTx: (hash: string) => string;
}

export const SOURCE_CHAINS: Record<CctpChainKey, SourceChainConfig> = {
  sepolia: {
    key: 'sepolia',
    chainId: sepolia.id,
    domain: 0,
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum',
    nativeSymbol: 'ETH',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  optimismSepolia: {
    key: 'optimismSepolia',
    chainId: optimismSepolia.id,
    domain: 2,
    name: 'OP Sepolia',
    shortName: 'Optimism',
    nativeSymbol: 'ETH',
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia-optimism.etherscan.io/tx/${h}`,
  },
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    chainId: arbitrumSepolia.id,
    domain: 3,
    name: 'Arbitrum Sepolia',
    shortName: 'Arbitrum',
    nativeSymbol: 'ETH',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia.arbiscan.io/tx/${h}`,
  },
  baseSepolia: {
    key: 'baseSepolia',
    chainId: baseSepolia.id,
    domain: 6,
    name: 'Base Sepolia',
    shortName: 'Base',
    nativeSymbol: 'ETH',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
  polygonAmoy: {
    key: 'polygonAmoy',
    chainId: polygonAmoy.id,
    domain: 7,
    name: 'Polygon Amoy',
    shortName: 'Polygon',
    nativeSymbol: 'POL',
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://amoy.polygonscan.com/tx/${h}`,
  },
};

export const SOURCE_CHAIN_KEYS = Object.keys(SOURCE_CHAINS) as CctpChainKey[];

export const ARC_TESTNET = {
  chainId: arcTestnet.id,
  domain: 26,
  usdc: '0x3600000000000000000000000000000000000000' as const,
  messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const,
  tokenMinter: '0xb43db544E2c27092c107639Ad201b3dEfAbcF192' as const,
  explorerTx: (h: string) => `https://testnet.arcscan.app/tx/${h}`,
};

// Default fast finality threshold for CCTP V2. 2000 = "fast" (~13s on testnets).
export const FINALITY_THRESHOLD_FAST = 2000;

// CCTP V2 message format pads the recipient to bytes32.
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}
