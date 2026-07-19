import { defineChain, type Chain } from 'viem';
import {
  sepolia,
  baseSepolia,
  optimismSepolia,
  arbitrumSepolia,
  polygonAmoy,
  avalancheFuji,
  unichainSepolia,
  seiTestnet,
  worldchainSepolia,
  hyperliquidEvmTestnet,
} from 'viem/chains';
import {
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  OP_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  AVAX_FUJI_BLOCKCHAIN,
  UNI_SEPOLIA_BLOCKCHAIN,
  type BridgeBlockchain,
} from '../circle/wallets.js';



export const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const;
export const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const;
export const ARC_DOMAIN = 26;
// CCTP V2 finality thresholds: 1000 = Fast Transfer (soft/"confirmed" finality,
// ~seconds), 2000 = Standard Transfer (hard finality, ~13-19 min). Fast also
// requires a maxFee >= the route's fast fee on depositForBurn, else Circle falls
// the transfer back to Standard. See computeFastMaxFee in routes/bridge.ts.
export const FINALITY_THRESHOLD_FAST = 1000;
export const FINALITY_THRESHOLD_STANDARD = 2000;

/// Stable keys for the non-Arc CCTP chains, as a tuple so zod enums and the
/// union type stay in lockstep. The values match the viem chain export names.
/// Sonic Testnet is not in viem: its `sonicTestnet` (64165) and
/// `sonicBlazeTestnet` (57054) are different chains from Circle's Sonic_Testnet
/// (14601). Defined from Circle's own chain record rather than assuming the
/// similarly-named export is the right one. Mirrors frontend/core/wagmi.ts.
const sonicTestnet14601 = defineChain({
  id: 14601,
  name: 'Sonic Testnet',
  nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.soniclabs.com'] } },
  testnet: true,
});

export const CCTP_CHAIN_KEYS = [
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
  'avalancheFuji',
  'unichainSepolia',
  'seiTestnet',
  'sonicTestnet',
  'worldchainSepolia',
  'hyperevmTestnet',
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
  ///
  /// OPTIONAL, and the omission is load-bearing. A CCTP burn is a contract
  /// execution (approve + depositForBurn), and Circle's DCWs only support
  /// contract execution on their named chains. Everything else falls under
  /// "Other EVM blockchains", where the Wallets docs state contract execution is
  /// NOT supported. So Sei, Sonic, World Chain and HyperEVM can never be burned
  /// from by a backend Circle wallet, no matter what we configure.
  ///
  /// A chain with no code here is WEB3-ONLY: the user's own wallet signs the
  /// burn. Circle/email accounts cannot bridge from it. Guard every Circle-path
  /// call site on this being present.
  circleBlockchain?: BridgeBlockchain;
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
  // The six chains Gateway reaches also run CCTP v2. Domains, USDC addresses and
  // explorers come from the installed @circle-fin SDK's chain records; the
  // canonical TokenMessenger was verified byte-identical on all six.
  //
  // Avalanche Fuji and Unichain Sepolia ARE named by Circle with full SCA +
  // contract-execution support, so a backend DCW CAN sign the CCTP burn — they
  // carry a circleBlockchain and are Circle source chains. Sei, Sonic, World
  // Chain and HyperEVM stay web3-only: Circle exposes them only as "Other EVMs"
  // (EOA signing, no contract execution), and a CCTP burn is a contract call.
  avalancheFuji: {
    key: 'avalancheFuji',
    name: 'Avalanche Fuji',
    shortName: 'Avalanche',
    domain: 1,
    usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
    nativeSymbol: 'AVAX',
    viemChain: avalancheFuji,
    circleBlockchain: AVAX_FUJI_BLOCKCHAIN,
    explorerTx: (h) => `https://subnets-test.avax.network/c-chain/tx/${h}`,
  },
  unichainSepolia: {
    key: 'unichainSepolia',
    name: 'Unichain Sepolia',
    shortName: 'Unichain',
    domain: 10,
    usdc: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
    nativeSymbol: 'ETH',
    viemChain: unichainSepolia,
    circleBlockchain: UNI_SEPOLIA_BLOCKCHAIN,
    explorerTx: (h) => `https://unichain-sepolia.blockscout.com/tx/${h}`,
  },
  seiTestnet: {
    key: 'seiTestnet',
    name: 'Sei Testnet',
    shortName: 'Sei',
    domain: 16,
    usdc: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
    nativeSymbol: 'SEI',
    viemChain: seiTestnet,
    explorerTx: (h) => `https://testnet.seiscan.io/tx/${h}`,
  },
  sonicTestnet: {
    key: 'sonicTestnet',
    name: 'Sonic Testnet',
    shortName: 'Sonic',
    domain: 13,
    usdc: '0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51',
    nativeSymbol: 'S',
    viemChain: sonicTestnet14601,
    explorerTx: (h) => `https://testnet.sonicscan.org/tx/${h}`,
  },
  worldchainSepolia: {
    key: 'worldchainSepolia',
    name: 'World Chain Sepolia',
    shortName: 'World Chain',
    domain: 14,
    usdc: '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88',
    nativeSymbol: 'ETH',
    viemChain: worldchainSepolia,
    explorerTx: (h) => `https://sepolia.worldscan.org/tx/${h}`,
  },
  hyperevmTestnet: {
    key: 'hyperevmTestnet',
    name: 'HyperEVM Testnet',
    shortName: 'HyperEVM',
    domain: 19,
    usdc: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
    nativeSymbol: 'HYPE',
    viemChain: hyperliquidEvmTestnet,
    explorerTx: (h) => `https://app.hyperliquid-testnet.xyz/explorer/tx/${h}`,
  },
};

export function isCctpChainKey(v: string): v is CctpChainKey {
  return (CCTP_CHAIN_KEYS as readonly string[]).includes(v);
}

/// Chains a backend Circle wallet can actually burn from. The Circle deposit
/// path must gate on this: the others are reachable only by a user-signed
/// (web3) burn.
export function supportsCircleWallet(key: CctpChainKey): boolean {
  return !!CCTP_CHAINS[key].circleBlockchain;
}

export const CIRCLE_WALLET_CHAIN_KEYS = CCTP_CHAIN_KEYS.filter(supportsCircleWallet);

/// Reverse lookup by CCTP domain (used when relaying a mint to resolve the
/// destination chain from a burn message's domain).
export function cctpChainByDomain(domain: number): CctpChain | null {
  return CCTP_CHAIN_KEYS.map((k) => CCTP_CHAINS[k]).find((c) => c.domain === domain) ?? null;
}

/// CCTP V2 pads the recipient address into a bytes32 field (high 12 bytes zero).
export function addressToBytes32(address: string): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}
