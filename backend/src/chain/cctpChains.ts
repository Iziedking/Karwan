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
  mainnet as ethereum,
  optimism,
  arbitrum,
  base,
  polygon,
  avalanche,
  unichain,
  sei,
  sonic,
  worldchain,
  hyperEvm,
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
import { ARC } from './client.js';
import { config } from '../config.js';
import type { ArcNetworkName } from './networks.js';

/// CCTP V2 uses one address on every testnet and another on every mainnet,
/// so the active Arc network's values hold for the source chains too.
export const TOKEN_MESSENGER_V2 = ARC.contracts.tokenMessengerV2;
export const MESSAGE_TRANSMITTER_V2 = ARC.contracts.messageTransmitterV2;
export const ARC_DOMAIN = 26;
// CCTP V2 finality thresholds: 1000 = Fast Transfer (soft/"confirmed" finality,
// ~seconds), 2000 = Standard Transfer (hard finality, ~13-19 min). Fast also
// requires a maxFee >= the route's fast fee on depositForBurn, else Circle falls
// the transfer back to Standard. See computeFastMaxFee in routes/bridge.ts.
export const FINALITY_THRESHOLD_FAST = 1000;
export const FINALITY_THRESHOLD_STANDARD = 2000;

/// Stable keys for the non-Arc CCTP chains, as a tuple so zod enums and the
/// union type stay in lockstep.
///
/// A key names a chain SLOT, not a network: 'baseSepolia' is Base Sepolia on
/// testnet and Base on mainnet. The names come from the testnet build and are
/// stored on bridge rows, so renaming them would orphan history. Each network
/// has its own database, so a key never refers to two chains in one place.
/// Anything a user sees comes from the record (name, shortName), never the key.
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
  /// Native USDC token on that chain.
  usdc: `0x${string}`;
  /// App Kit / Bridge Kit chain name, fed to kit.bridge and unifiedBalance.
  appKit: string;
  /// Native gas token symbol, for user-facing gas messages.
  nativeSymbol: string;
  /// viem chain for RPC reads on the source/destination side.
  viemChain: Chain;
  explorerTx: (hash: string) => string;
}

const TESTNET_CCTP_CHAINS: Record<CctpChainKey, CctpChain> = {
  sepolia: {
    key: 'sepolia',
    name: 'Ethereum Sepolia',
    shortName: 'Ethereum',
    domain: 0,
    circleBlockchain: ETH_SEPOLIA_BLOCKCHAIN,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    appKit: 'Ethereum_Sepolia',
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
    appKit: 'Optimism_Sepolia',
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
    appKit: 'Arbitrum_Sepolia',
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
    appKit: 'Base_Sepolia',
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
    appKit: 'Polygon_Amoy_Testnet',
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
    appKit: 'Avalanche_Fuji',
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
    appKit: 'Unichain_Sepolia',
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
    appKit: 'Sei_Testnet',
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
    appKit: 'Sonic_Testnet',
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
    appKit: 'World_Chain_Sepolia',
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
    appKit: 'HyperEVM_Testnet',
    nativeSymbol: 'HYPE',
    viemChain: hyperliquidEvmTestnet,
    explorerTx: (h) => `https://app.hyperliquid-testnet.xyz/explorer/tx/${h}`,
  },
};

/// Arc mainnet's counterparts, read from @circle-fin/bridge-kit 1.15.1's chain
/// records (chain id, CCTP domain, USDC, explorer) on 2026-09-23. The canonical
/// mainnet TokenMessenger is the same on all eleven. None carries a
/// circleBlockchain: on mainnet a backend Circle wallet signs only for agents,
/// so every deposit burn is signed by the user's own wallet.
const MAINNET_CCTP_CHAINS: Record<CctpChainKey, CctpChain> = {
  sepolia: {
    key: 'sepolia',
    name: 'Ethereum',
    shortName: 'Ethereum',
    domain: 0,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    appKit: 'Ethereum',
    nativeSymbol: 'ETH',
    viemChain: ethereum,
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
  },
  optimismSepolia: {
    key: 'optimismSepolia',
    name: 'OP Mainnet',
    shortName: 'Optimism',
    domain: 2,
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    appKit: 'Optimism',
    nativeSymbol: 'ETH',
    viemChain: optimism,
    explorerTx: (h) => `https://optimistic.etherscan.io/tx/${h}`,
  },
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    domain: 3,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    appKit: 'Arbitrum',
    nativeSymbol: 'ETH',
    viemChain: arbitrum,
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
  },
  baseSepolia: {
    key: 'baseSepolia',
    name: 'Base',
    shortName: 'Base',
    domain: 6,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    appKit: 'Base',
    nativeSymbol: 'ETH',
    viemChain: base,
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
  },
  polygonAmoy: {
    key: 'polygonAmoy',
    name: 'Polygon',
    shortName: 'Polygon',
    domain: 7,
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    appKit: 'Polygon',
    nativeSymbol: 'POL',
    viemChain: polygon,
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
  },
  avalancheFuji: {
    key: 'avalancheFuji',
    name: 'Avalanche',
    shortName: 'Avalanche',
    domain: 1,
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    appKit: 'Avalanche',
    nativeSymbol: 'AVAX',
    viemChain: avalanche,
    explorerTx: (h) => `https://subnets.avax.network/c-chain/tx/${h}`,
  },
  unichainSepolia: {
    key: 'unichainSepolia',
    name: 'Unichain',
    shortName: 'Unichain',
    domain: 10,
    usdc: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
    appKit: 'Unichain',
    nativeSymbol: 'ETH',
    viemChain: unichain,
    explorerTx: (h) => `https://unichain.blockscout.com/tx/${h}`,
  },
  seiTestnet: {
    key: 'seiTestnet',
    name: 'Sei',
    shortName: 'Sei',
    domain: 16,
    usdc: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
    appKit: 'Sei',
    nativeSymbol: 'SEI',
    viemChain: sei,
    explorerTx: (h) => `https://seiscan.io/tx/${h}`,
  },
  sonicTestnet: {
    key: 'sonicTestnet',
    name: 'Sonic',
    shortName: 'Sonic',
    domain: 13,
    usdc: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',
    appKit: 'Sonic',
    nativeSymbol: 'S',
    viemChain: sonic,
    explorerTx: (h) => `https://sonicscan.org/tx/${h}`,
  },
  worldchainSepolia: {
    key: 'worldchainSepolia',
    name: 'World Chain',
    shortName: 'World Chain',
    domain: 14,
    usdc: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    appKit: 'World_Chain',
    nativeSymbol: 'ETH',
    viemChain: worldchain,
    explorerTx: (h) => `https://worldscan.org/tx/${h}`,
  },
  hyperevmTestnet: {
    key: 'hyperevmTestnet',
    name: 'HyperEVM',
    shortName: 'HyperEVM',
    domain: 19,
    usdc: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
    appKit: 'HyperEVM',
    nativeSymbol: 'HYPE',
    viemChain: hyperEvm,
    explorerTx: (h) => `https://hyperevmscan.io/tx/${h}`,
  },
};

export const CCTP_CHAINS_BY_NETWORK: Record<ArcNetworkName, Record<CctpChainKey, CctpChain>> = {
  testnet: TESTNET_CCTP_CHAINS,
  mainnet: MAINNET_CCTP_CHAINS,
};

export const CCTP_CHAINS = CCTP_CHAINS_BY_NETWORK[ARC.name];

export function isCctpChainKey(v: string): v is CctpChainKey {
  return (CCTP_CHAIN_KEYS as readonly string[]).includes(v);
}

/// Display name for a bridge chain key.
///
/// Bridge records store the raw key (`baseSepolia`, `solanaDevnet`) and those
/// were reaching users verbatim in activity summaries. Solana is named here
/// rather than in CCTP_CHAINS because it is not an EVM chain and carries none of
/// the contract addresses that interface requires. Anything unrecognised splits
/// its camelCase into words rather than showing the key.
/// The keys clients use for Arc itself. Arc is not a CCTP source chain (it is
/// the destination every bridge mints on), so it has no entry in CCTP_CHAINS and
/// there was nothing to compare against when a request named it. A cash-out that
/// names Arc as its destination never leaves the chain.
export const ARC_CHAIN_KEYS = new Set(['arc', 'arctestnet', 'arc-testnet', 'arcTestnet'.toLowerCase()]);

export function chainLabel(key: string): string {
  if (isCctpChainKey(key)) return CCTP_CHAINS[key].name;
  if (key === 'solanaDevnet') return ARC.testnet ? 'Solana Devnet' : 'Solana';
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/// Chains a backend Circle wallet can actually burn from. The Circle deposit
/// path must gate on this: the others are reachable only by a user-signed
/// (web3) burn.
export function supportsCircleWallet(key: CctpChainKey): boolean {
  return !!CCTP_CHAINS[key].circleBlockchain;
}

export const CIRCLE_WALLET_CHAIN_KEYS = CCTP_CHAIN_KEYS.filter(supportsCircleWallet);

/// Whether a backend Circle wallet may hold or move a USER's money. On mainnet
/// users sign with their own wallet (a modular wallet for email users) and
/// backend Circle wallets sign only for agents, decided 2026-09-23. Every route
/// that provisions a user wallet, or signs from one, checks this.
export const USER_DCW_WALLETS = ARC.testnet && config.USER_WALLETS !== 'modular';

/// Reverse lookup by CCTP domain (used when relaying a mint to resolve the
/// destination chain from a burn message's domain).
export function cctpChainByDomain(domain: number): CctpChain | null {
  return CCTP_CHAIN_KEYS.map((k) => CCTP_CHAINS[k]).find((c) => c.domain === domain) ?? null;
}

/// CCTP V2 pads the recipient address into a bytes32 field (high 12 bytes zero).
export function addressToBytes32(address: string): `0x${string}` {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}

/// Map a Circle DCW blockchain enum ('BASE-SEPOLIA') to the chain key used on
/// bridge records ('baseSepolia'). Needed because a user's deposit wallets are
/// stored keyed by Circle's enum while bridge records store our key, and
/// ownership checks must compare BOTH address and chain — an address alone is
/// not unique across chains in a shared Circle wallet set.
export function chainKeyForCircleBlockchain(circleBlockchain: string): string | null {
  if (circleBlockchain === 'SOL-DEVNET') return 'solanaDevnet';
  const match = CCTP_CHAIN_KEYS.find(
    (k) => CCTP_CHAINS[k].circleBlockchain === circleBlockchain,
  );
  return match ?? null;
}

/// A user's deposit wallets re-keyed by bridge-record chain key, ready for
/// listBridgesForUser.
export function depositWalletsByChainKey(
  bridgeWallets: Record<string, { address: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [circleChain, w] of Object.entries(bridgeWallets ?? {})) {
    const key = chainKeyForCircleBlockchain(circleChain);
    if (key) out[key] = w.address;
  }
  return out;
}
