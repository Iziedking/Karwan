import type { Chain } from 'viem';
import { sepolia, baseSepolia, optimismSepolia, arbitrumSepolia, polygonAmoy } from 'viem/chains';
import {
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  OP_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  type BridgeBlockchain,
} from '../circle/wallets.js';



export const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const;
export const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const;
export const ARC_DOMAIN = 26;
// CCTP V2 fast finality (~13s on testnets). Same threshold both directions.
export const FINALITY_THRESHOLD_FAST = 2000;

/// Stable keys for the non-Arc CCTP chains, as a tuple so zod enums and the
/// union type stay in lockstep. The values match the viem chain export names.
export const CCTP_CHAIN_KEYS = [
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
] as const;

export type CctpChainKey = (typeof CCTP_CHAIN_KEYS)[number];

export interface CctpChain {
  key: CctpChainKey;
  /// Full name for headings.
  name: string;
  /// Short name for chips and dropdowns.
  shortName: string;
  /// CCTP domain id (the burn/mint routing key).
  domain: number;
  /// Circle Developer-Controlled-Wallets createWallets blockchain code, used to
  /// provision the per-chain bridge DCW that signs the burn (in) / relays the
  /// mint (out).
  circleBlockchain: BridgeBlockchain;
  /// Native USDC token on that chain's testnet.
  usdc: `0x${string}`;
  /// Native gas token symbol, for user-facing gas messages.
  nativeSymbol: string;
  /// viem chain for RPC reads on the source/destination side.
  viemChain: Chain;
  explorerTx: (hash: string) => string;
}

export const CCTP_CHAINS: Record<CctpChainKey, CctpChain> = {
  sepolia: {
    key: 'sepolia',
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum',
    domain: 0,
    circleBlockchain: ETH_SEPOLIA_BLOCKCHAIN,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    nativeSymbol: 'ETH',
    viemChain: sepolia,
    explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  optimismSepolia: {
    key: 'optimismSepolia',
    name: 'OP Sepolia',
    shortName: 'Optimism',
    domain: 2,
    circleBlockchain: OP_SEPOLIA_BLOCKCHAIN,
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    nativeSymbol: 'ETH',
    viemChain: optimismSepolia,
    explorerTx: (h) => `https://sepolia-optimism.etherscan.io/tx/${h}`,
  },
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    name: 'Arbitrum Sepolia',
    shortName: 'Arbitrum',
    domain: 3,
    circleBlockchain: ARB_SEPOLIA_BLOCKCHAIN,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    nativeSymbol: 'ETH',
    viemChain: arbitrumSepolia,
    explorerTx: (h) => `https://sepolia.arbiscan.io/tx/${h}`,
  },
  baseSepolia: {
    key: 'baseSepolia',
    name: 'Base Sepolia',
    shortName: 'Base',
    domain: 6,
    circleBlockchain: BASE_SEPOLIA_BLOCKCHAIN,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    nativeSymbol: 'ETH',
    viemChain: baseSepolia,
    explorerTx: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
  polygonAmoy: {
    key: 'polygonAmoy',
    name: 'Polygon Amoy',
    shortName: 'Polygon',
    domain: 7,
    circleBlockchain: POLYGON_AMOY_BLOCKCHAIN,
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    nativeSymbol: 'POL',
    viemChain: polygonAmoy,
    explorerTx: (h) => `https://amoy.polygonscan.com/tx/${h}`,
  },
};

export function isCctpChainKey(v: string): v is CctpChainKey {
  return (CCTP_CHAIN_KEYS as readonly string[]).includes(v);
}

/// Reverse lookup by CCTP domain (used when relaying a mint to resolve the
/// destination chain from a burn message's domain).
export function cctpChainByDomain(domain: number): CctpChain | null {
  return CCTP_CHAIN_KEYS.map((k) => CCTP_CHAINS[k]).find((c) => c.domain === domain) ?? null;
}

/// CCTP V2 pads the recipient address into a bytes32 field (high 12 bytes zero).
export function addressToBytes32(address: string): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}
