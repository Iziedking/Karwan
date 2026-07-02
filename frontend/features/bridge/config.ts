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

/// Source chains supported by the App Kit bridge path on top of the EVM CCTP
/// V2 set. Solana doesn't fit the SourceChainConfig shape (no chainId, SPL
/// USDC instead of an ERC-20 address, no wagmi signer), so it routes
/// exclusively through POST /api/bridge/circle-bridge-app-kit using a
/// Solana Devnet Circle DCW the backend provisions on first use.
export type AppKitOnlyChainKey = 'solanaDevnet';
export type AnySourceChainKey = CctpChainKey | AppKitOnlyChainKey;

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

/// App-Kit-only source chain (currently Solana Devnet). The frontend never
/// signs from this chain itself; the burn happens on a Circle DCW the
/// backend provisions, and the App Kit forwarder broadcasts the Arc mint.
/// Web3 users cannot use these sources (no wagmi connector); the picker
/// gates accordingly.
export interface AppKitSourceConfig {
  key: AppKitOnlyChainKey;
  name: string;
  shortName: string;
  nativeSymbol: string;
  /// Used for the per-chain Circle faucet/gas help link in the UI.
  faucet?: string;
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

/// App-Kit-only chains. Currently just Solana Devnet. The frontend lists
/// these alongside the EVM source chains in the picker but routes the
/// bridge call to /circle-bridge-app-kit because no wagmi signer exists.
export const APP_KIT_SOURCES: Record<AppKitOnlyChainKey, AppKitSourceConfig> = {
  solanaDevnet: {
    key: 'solanaDevnet',
    name: 'Solana Devnet',
    shortName: 'Solana',
    nativeSymbol: 'SOL',
    faucet: 'https://faucet.solana.com/',
    explorerTx: (h) => `https://explorer.solana.com/tx/${h}?cluster=devnet`,
  },
};

export const APP_KIT_SOURCE_KEYS = Object.keys(APP_KIT_SOURCES) as AppKitOnlyChainKey[];

export function isAppKitOnlyChainKey(k: string): k is AppKitOnlyChainKey {
  return k in APP_KIT_SOURCES;
}

// Native-gas testnet faucets per source chain. Only web3 users need these (they
// pay their own source-chain burn gas); Circle users are sponsored by Gas
// Station. USDC for any chain comes from faucet.circle.com.
export const GAS_FAUCETS: Record<CctpChainKey, string> = {
  sepolia: 'https://www.alchemy.com/faucets/ethereum-sepolia',
  optimismSepolia: 'https://www.alchemy.com/faucets/optimism-sepolia',
  arbitrumSepolia: 'https://www.alchemy.com/faucets/arbitrum-sepolia',
  baseSepolia: 'https://www.alchemy.com/faucets/base-sepolia',
  polygonAmoy: 'https://faucet.polygon.technology/',
};

export const USDC_FAUCET = 'https://faucet.circle.com/';

// Solana Devnet: the user connects their own wallet (Phantom) and signs the
// CCTP burn there, so we read their SPL USDC balance directly over JSON-RPC.
// USDC mint verified against Circle's contract-addresses page (2026-07-02).
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com';
export const SOLANA_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const SOLANA_EXPLORER_TX = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

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
