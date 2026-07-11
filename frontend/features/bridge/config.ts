import {
  baseSepolia,
  sepolia,
  optimismSepolia,
  arbitrumSepolia,
  polygonAmoy,
} from 'viem/chains';
import { arcTestnet } from '@/core/wagmi';
import type { ChainKey } from '@/shared/components/ChainLogo';

// CCTP V2 deploys the same canonical TokenMessenger + MessageTransmitter across
// every testnet, so a chain is just chainId + domain + USDC. Verified against
// Circle's docs 2026-05-22. Mirrors backend/src/chain/cctpChains.ts.
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const;

export type CctpChainKey =
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'baseSepolia'
  | 'polygonAmoy'
  | 'avalancheFuji'
  | 'unichainSepolia'
  | 'seiTestnet'
  | 'sonicTestnet'
  | 'worldchainSepolia'
  | 'hyperevmTestnet';

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
  // The six Gateway chains also run CCTP v2. Domains, USDC addresses and
  // explorers come from the installed @circle-fin SDK's chain records; the
  // canonical TokenMessenger was verified byte-identical on all six.
  avalancheFuji: {
    key: 'avalancheFuji',
    chainId: 43113,
    domain: 1,
    name: 'Avalanche Fuji',
    shortName: 'Avalanche',
    nativeSymbol: 'AVAX',
    usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://subnets-test.avax.network/c-chain/tx/${h}`,
  },
  unichainSepolia: {
    key: 'unichainSepolia',
    chainId: 1301,
    domain: 10,
    name: 'Unichain Sepolia',
    shortName: 'Unichain',
    nativeSymbol: 'ETH',
    usdc: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://unichain-sepolia.blockscout.com/tx/${h}`,
  },
  seiTestnet: {
    key: 'seiTestnet',
    chainId: 1328,
    domain: 16,
    name: 'Sei Testnet',
    shortName: 'Sei',
    nativeSymbol: 'SEI',
    usdc: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://testnet.seiscan.io/tx/${h}`,
  },
  sonicTestnet: {
    key: 'sonicTestnet',
    chainId: 14601,
    domain: 13,
    name: 'Sonic Testnet',
    shortName: 'Sonic',
    nativeSymbol: 'S',
    usdc: '0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://testnet.sonicscan.org/tx/${h}`,
  },
  worldchainSepolia: {
    key: 'worldchainSepolia',
    chainId: 4801,
    domain: 14,
    name: 'World Chain Sepolia',
    shortName: 'World Chain',
    nativeSymbol: 'ETH',
    usdc: '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://sepolia.worldscan.org/tx/${h}`,
  },
  hyperevmTestnet: {
    key: 'hyperevmTestnet',
    chainId: 998,
    domain: 19,
    name: 'HyperEVM Testnet',
    shortName: 'HyperEVM',
    nativeSymbol: 'HYPE',
    usdc: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://app.hyperliquid-testnet.xyz/explorer/tx/${h}`,
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
/// Partial on purpose. The six chains added alongside Gateway have no faucet URL
/// here because none was verified, and a "Claim gas" button that opens a guessed
/// or dead link is worse than no button. BridgeCard hides the button when a
/// chain is missing. Add a URL here once it's confirmed and the button returns.
export const GAS_FAUCETS: Partial<Record<CctpChainKey, string>> = {
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
// Public Solana devnet SOL faucet (blockhash/tx fees on Solana).
export const SOLANA_GAS_FAUCET = 'https://faucet.solana.com/';
export const SOLANA_EXPLORER_TX = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// App Kit chain identifiers per source key. Verified against the installed
// @circle-fin SDK type definitions (2026-07-02), not guessed. Used by the
// kit.bridge + Forwarding Service path so every source chain routes the same
// way: the user signs the source burn, Circle's forwarder mints on Arc.
export const APPKIT_CHAIN: Record<AnySourceChainKey, string> = {
  sepolia: 'Ethereum_Sepolia',
  optimismSepolia: 'Optimism_Sepolia',
  arbitrumSepolia: 'Arbitrum_Sepolia',
  baseSepolia: 'Base_Sepolia',
  // The SDK's BridgeChain enum names this 'Polygon_Amoy_Testnet' (not
  // 'Polygon_Amoy' like the others). Using the short form made kit.bridge
  // reject it as an unsupported chain.
  polygonAmoy: 'Polygon_Amoy_Testnet',
  solanaDevnet: 'Solana_Devnet',
  avalancheFuji: 'Avalanche_Fuji',
  unichainSepolia: 'Unichain_Sepolia',
  seiTestnet: 'Sei_Testnet',
  sonicTestnet: 'Sonic_Testnet',
  worldchainSepolia: 'World_Chain_Sepolia',
  hyperevmTestnet: 'HyperEVM_Testnet',
};

/// Chains a Circle (email/passkey) account can bridge from. The other six are
/// web3-only: Circle's wallets cannot execute a contract there, and a CCTP burn
/// is a contract execution, so no backend wallet can sign it. Mirrors
/// supportsCircleWallet() on the backend. The picker uses this to disable those
/// chains for Circle users rather than letting them pick a dead end.
export const CIRCLE_SOURCE_KEYS: ReadonlySet<string> = new Set([
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
  'solanaDevnet',
]);

/// Chains we can withdraw TO. Bridging out has the backend relay the mint on the
/// destination, which again needs a Circle wallet there. So the six new chains
/// are bridge-in sources only, never bridge-out destinations.
export const WITHDRAW_DEST_KEYS: readonly CctpChainKey[] = [
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
];
export const APPKIT_ARC_CHAIN = 'Arc_Testnet';

/// Circle Gateway's chain set, which is WIDER than CCTP's. The bridge above
/// still burns only from SOURCE_CHAINS; these are the chains a user can pool
/// USDC from into their unified balance. Every field here (chain id, USDC
/// address, App Kit name) was read out of the installed @circle-fin SDK's own
/// chain records, not copied from docs. Solana Devnet is Gateway-supported but
/// deliberately absent: Gateway keys accounts by address, so a Solana address
/// is a SEPARATE depositor from the user's EOA, not the same pool.
export interface GatewayChainConfig {
  key: ChainKey;
  chainId: number;
  usdc: `0x${string}`;
  name: string;
  appKit: string;
}

export const GATEWAY_CHAINS: GatewayChainConfig[] = [
  { key: 'sepolia', chainId: sepolia.id, usdc: SOURCE_CHAINS.sepolia.usdc, name: 'Ethereum', appKit: 'Ethereum_Sepolia' },
  { key: 'baseSepolia', chainId: baseSepolia.id, usdc: SOURCE_CHAINS.baseSepolia.usdc, name: 'Base', appKit: 'Base_Sepolia' },
  { key: 'optimismSepolia', chainId: optimismSepolia.id, usdc: SOURCE_CHAINS.optimismSepolia.usdc, name: 'Optimism', appKit: 'Optimism_Sepolia' },
  { key: 'arbitrumSepolia', chainId: arbitrumSepolia.id, usdc: SOURCE_CHAINS.arbitrumSepolia.usdc, name: 'Arbitrum', appKit: 'Arbitrum_Sepolia' },
  { key: 'polygonAmoy', chainId: polygonAmoy.id, usdc: SOURCE_CHAINS.polygonAmoy.usdc, name: 'Polygon', appKit: 'Polygon_Amoy_Testnet' },
  { key: 'avalancheFuji', chainId: 43113, usdc: '0x5425890298aed601595a70ab815c96711a31bc65', name: 'Avalanche', appKit: 'Avalanche_Fuji' },
  { key: 'unichainSepolia', chainId: 1301, usdc: '0x31d0220469e10c4E71834a79b1f276d740d3768F', name: 'Unichain', appKit: 'Unichain_Sepolia' },
  { key: 'seiTestnet', chainId: 1328, usdc: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED', name: 'Sei', appKit: 'Sei_Testnet' },
  // Circle's Sonic_Testnet is 14601. viem's sonicTestnet (64165) and
  // sonicBlazeTestnet (57054) are different chains; see core/wagmi.ts.
  { key: 'sonicTestnet', chainId: 14601, usdc: '0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51', name: 'Sonic', appKit: 'Sonic_Testnet' },
  { key: 'worldchainSepolia', chainId: 4801, usdc: '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88', name: 'World Chain', appKit: 'World_Chain_Sepolia' },
  { key: 'hyperevmTestnet', chainId: 998, usdc: '0x2B3370eE501B4a559b57D449569354196457D8Ab', name: 'HyperEVM', appKit: 'HyperEVM_Testnet' },
  { key: 'arc', chainId: arcTestnet.id, usdc: '0x3600000000000000000000000000000000000000', name: 'Arc', appKit: 'Arc_Testnet' },
];

export const ARC_TESTNET = {
  chainId: arcTestnet.id,
  domain: 26,
  usdc: '0x3600000000000000000000000000000000000000' as const,
  messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const,
  tokenMinter: '0xb43db544E2c27092c107639Ad201b3dEfAbcF192' as const,
  explorerTx: (h: string) => `https://testnet.arcscan.app/tx/${h}`,
};

// CCTP V2 minFinalityThreshold for Fast Transfer. Per Circle: 1000 = fast (soft
// finality, needs maxFee > 0 to actually settle fast), 2000 = standard/max
// security (waits for full source-chain finality). Must match the backend
// constant (backend/src/chain/cctpChains.ts). Previously 2000 here, which
// mislabelled the slow path as "fast".
export const FINALITY_THRESHOLD_FAST = 1000;

// CCTP V2 message format pads the recipient to bytes32.
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}
