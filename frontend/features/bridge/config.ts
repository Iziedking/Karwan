import {
  baseSepolia,
  sepolia,
  optimismSepolia,
  arbitrumSepolia,
  polygonAmoy,
} from 'viem/chains';
import { arcChain } from '@/core/wagmi';
import { ARC_NETWORK, type ArcNetworkName } from '@/core/arcNetwork';
import type { ChainKey } from '@/shared/components/ChainLogo';

// CCTP V2 deploys one canonical TokenMessenger on every testnet and another on
// every mainnet, so a chain is just chainId + domain + USDC. Mirrors
// backend/src/chain/cctpChains.ts; config.test.ts checks both tables against the
// installed @circle-fin/app-kit chain records.
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const;
const TOKEN_MESSENGER_V2_MAINNET = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as const;

/// A key names a chain SLOT, not a network: 'baseSepolia' is Base Sepolia on
/// testnet and Base on mainnet. Stored bridge rows carry these keys, so they
/// keep their testnet names. Users only ever see the record's name/shortName.
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
  /// App Kit / Bridge Kit chain name.
  appKit: string;
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

const TESTNET_SOURCE_CHAINS: Record<CctpChainKey, SourceChainConfig> = {
  sepolia: {
    key: 'sepolia',
    chainId: sepolia.id,
    domain: 0,
    appKit: 'Ethereum_Sepolia',
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
    appKit: 'Optimism_Sepolia',
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
    appKit: 'Arbitrum_Sepolia',
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
    appKit: 'Base_Sepolia',
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
    appKit: 'Polygon_Amoy_Testnet',
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
    appKit: 'Avalanche_Fuji',
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
    appKit: 'Unichain_Sepolia',
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
    appKit: 'Sei_Testnet',
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
    appKit: 'Sonic_Testnet',
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
    appKit: 'World_Chain_Sepolia',
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
    appKit: 'HyperEVM_Testnet',
    name: 'HyperEVM Testnet',
    shortName: 'HyperEVM',
    nativeSymbol: 'HYPE',
    usdc: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
    tokenMessenger: TOKEN_MESSENGER_V2,
    explorerTx: (h) => `https://app.hyperliquid-testnet.xyz/explorer/tx/${h}`,
  },
};

/// Arc mainnet's counterparts, from @circle-fin/app-kit's chain records.
const MAINNET_SOURCE_CHAINS: Record<CctpChainKey, SourceChainConfig> = {
  sepolia: {
    key: 'sepolia',
    chainId: 1,
    domain: 0,
    appKit: 'Ethereum',
    name: 'Ethereum',
    shortName: 'Ethereum',
    nativeSymbol: 'ETH',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
  },
  optimismSepolia: {
    key: 'optimismSepolia',
    chainId: 10,
    domain: 2,
    appKit: 'Optimism',
    name: 'OP Mainnet',
    shortName: 'Optimism',
    nativeSymbol: 'ETH',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://optimistic.etherscan.io/tx/${h}`,
  },
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    chainId: 42161,
    domain: 3,
    appKit: 'Arbitrum',
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    nativeSymbol: 'ETH',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
  },
  baseSepolia: {
    key: 'baseSepolia',
    chainId: 8453,
    domain: 6,
    appKit: 'Base',
    name: 'Base',
    shortName: 'Base',
    nativeSymbol: 'ETH',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
  },
  polygonAmoy: {
    key: 'polygonAmoy',
    chainId: 137,
    domain: 7,
    appKit: 'Polygon',
    name: 'Polygon',
    shortName: 'Polygon',
    nativeSymbol: 'POL',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
  },
  avalancheFuji: {
    key: 'avalancheFuji',
    chainId: 43114,
    domain: 1,
    appKit: 'Avalanche',
    name: 'Avalanche',
    shortName: 'Avalanche',
    nativeSymbol: 'AVAX',
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://subnets.avax.network/c-chain/tx/${h}`,
  },
  unichainSepolia: {
    key: 'unichainSepolia',
    chainId: 130,
    domain: 10,
    appKit: 'Unichain',
    name: 'Unichain',
    shortName: 'Unichain',
    nativeSymbol: 'ETH',
    usdc: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://unichain.blockscout.com/tx/${h}`,
  },
  seiTestnet: {
    key: 'seiTestnet',
    chainId: 1329,
    domain: 16,
    appKit: 'Sei',
    name: 'Sei',
    shortName: 'Sei',
    nativeSymbol: 'SEI',
    usdc: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://seiscan.io/tx/${h}`,
  },
  sonicTestnet: {
    key: 'sonicTestnet',
    chainId: 146,
    domain: 13,
    appKit: 'Sonic',
    name: 'Sonic',
    shortName: 'Sonic',
    nativeSymbol: 'S',
    usdc: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://sonicscan.org/tx/${h}`,
  },
  worldchainSepolia: {
    key: 'worldchainSepolia',
    chainId: 480,
    domain: 14,
    appKit: 'World_Chain',
    name: 'World Chain',
    shortName: 'World Chain',
    nativeSymbol: 'ETH',
    usdc: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://worldscan.org/tx/${h}`,
  },
  hyperevmTestnet: {
    key: 'hyperevmTestnet',
    chainId: 999,
    domain: 19,
    appKit: 'HyperEVM',
    name: 'HyperEVM',
    shortName: 'HyperEVM',
    nativeSymbol: 'HYPE',
    usdc: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
    tokenMessenger: TOKEN_MESSENGER_V2_MAINNET,
    explorerTx: (h) => `https://hyperevmscan.io/tx/${h}`,
  },
};

export const SOURCE_CHAINS_BY_NETWORK: Record<ArcNetworkName, Record<CctpChainKey, SourceChainConfig>> = {
  testnet: TESTNET_SOURCE_CHAINS,
  mainnet: MAINNET_SOURCE_CHAINS,
};

export const SOURCE_CHAINS = SOURCE_CHAINS_BY_NETWORK[ARC_NETWORK];

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

/// Solana runs on devnet only for now: both of its paths (a backend Circle
/// wallet, or a Phantom burn against the devnet mint) are testnet-specific.
export const APP_KIT_SOURCE_KEYS: AppKitOnlyChainKey[] =
  ARC_NETWORK === 'testnet' ? (Object.keys(APP_KIT_SOURCES) as AppKitOnlyChainKey[]) : [];

export function isAppKitOnlyChainKey(k: string): k is AppKitOnlyChainKey {
  return (APP_KIT_SOURCE_KEYS as string[]).includes(k);
}

/// The five EVM chains the App Kit bridge route actually accepts as a SOURCE.
/// The other CCTP chains have no App Kit bridge and must use the hand-rolled
/// pipeline; routing them to App Kit is a 400. Mirrors CircleBridgeChainKey.
/// Empty on mainnet, where a backend Circle wallet never signs for a user.
const APP_KIT_BRIDGE_SOURCE_KEYS = new Set(
  ARC_NETWORK === 'testnet'
    ? ['sepolia', 'optimismSepolia', 'arbitrumSepolia', 'baseSepolia', 'polygonAmoy']
    : [],
);
export function appKitBridgeSupportsSource(k: string): boolean {
  return APP_KIT_BRIDGE_SOURCE_KEYS.has(k);
}

// Native-gas testnet faucets per source chain. Only web3 users need these (they
// pay their own source-chain burn gas). Circle users don't pay gas: on Gas-
// Station chains (CIRCLE_GAS_SPONSORED_KEYS) the paymaster covers it, on the rest
// Karwan funds the deposit wallet. USDC for any chain comes from faucet.circle.com.
/// Partial on purpose. The six chains added alongside Gateway have no faucet URL
/// here because none was verified, and a "Claim gas" button that opens a guessed
/// or dead link is worse than no button. BridgeCard hides the button when a
/// chain is missing. Add a URL here once it's confirmed and the button returns.
export const GAS_FAUCETS: Partial<Record<CctpChainKey, string>> = ARC_NETWORK !== 'testnet' ? {} : {
  sepolia: 'https://www.alchemy.com/faucets/ethereum-sepolia',
  optimismSepolia: 'https://www.alchemy.com/faucets/optimism-sepolia',
  arbitrumSepolia: 'https://www.alchemy.com/faucets/arbitrum-sepolia',
  baseSepolia: 'https://www.alchemy.com/faucets/base-sepolia',
  polygonAmoy: 'https://faucet.polygon.technology/',
};

export const USDC_FAUCET: string | null = ARC_NETWORK === 'testnet' ? 'https://faucet.circle.com/' : null;

// Solana Devnet: the user connects their own wallet (Phantom) and signs the
// CCTP burn there, so we read their SPL USDC balance directly over JSON-RPC.
// USDC mint verified against Circle's contract-addresses page (2026-07-02).
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com';
export const SOLANA_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
// Public Solana devnet SOL faucet (blockhash/tx fees on Solana).
export const SOLANA_GAS_FAUCET = 'https://faucet.solana.com/';

/// The burn makes the user both the fee payer AND the rent payer for the
/// MessageSent event account (see solanaCctp.ts), so they must hold SOL or the
/// transaction cannot even be simulated: Phantom shows an empty preview with
/// Confirm permanently greyed out, which reads as "the app is broken".
/// ~0.002 SOL of rent + fee + priority, so gate a little above that.
export const SOLANA_MIN_SOL = 0.005;

export const SOLANA_EXPLORER_TX = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// App Kit chain identifiers per source key, for the active network. Used by the
// kit.bridge + Forwarding Service path so every source chain routes the same
// way: the user signs the source burn, Circle's forwarder mints on Arc.
export const APPKIT_CHAIN: Record<AnySourceChainKey, string> = {
  ...(Object.fromEntries(SOURCE_CHAIN_KEYS.map((k) => [k, SOURCE_CHAINS[k].appKit])) as Record<
    CctpChainKey,
    string
  >),
  solanaDevnet: ARC_NETWORK === 'testnet' ? 'Solana_Devnet' : 'Solana',
};

/// Chains a Circle (email/passkey) account can bridge from. The remaining four
/// (Sei, Sonic, World Chain, HyperEVM) are web3-only: Circle exposes them only as
/// "Other EVMs" (EOA signing, no contract execution), and a CCTP burn is a
/// contract execution, so no backend wallet can sign it. Mirrors
/// supportsCircleWallet() on the backend. The picker uses this to disable those
/// chains for Circle users rather than letting them pick a dead end.
export const CIRCLE_SOURCE_KEYS: ReadonlySet<string> = new Set(ARC_NETWORK !== 'testnet' ? [] : [
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
  'avalancheFuji',
  'unichainSepolia',
  'solanaDevnet',
]);

/// Source chains whose burn gas is sponsored by a Circle Gas Station policy —
/// mirrors the backend CIRCLE_GAS_STATION_SPONSORED_CHAINS env. All of these have
/// an Active default policy in the Circle console, so the source send is fully
/// gasless via the paymaster and the banner shows "Sponsored". If a Circle source
/// chain is ever added WITHOUT a policy, leave it out here and the banner falls
/// back to "Covered" (Karwan funds the deposit wallet's gas instead). Keep this in
/// sync with the backend env.
export const CIRCLE_GAS_SPONSORED_KEYS: ReadonlySet<string> = new Set(ARC_NETWORK !== 'testnet' ? [] : [
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
  'avalancheFuji',
  'unichainSepolia',
  'solanaDevnet',
]);

/// Chains we can withdraw TO: every non-Arc CCTP chain.
///
/// This used to be five. Bridging out relayed the destination mint from a Circle
/// DCW on the destination chain, so it could only reach chains Circle can hold a
/// wallet on. Withdrawals now go through App Kit with the Forwarding Service, so
/// CIRCLE submits that mint and no destination wallet exists to constrain us.
/// Verified: all eleven report cctp.forwarderSupported.destination = true.
export const WITHDRAW_DEST_KEYS: readonly CctpChainKey[] = [
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
];
export const APPKIT_ARC_CHAIN = ARC_NETWORK === 'testnet' ? 'Arc_Testnet' : 'Arc';

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

const GATEWAY_ORDER: CctpChainKey[] = [
  'sepolia',
  'baseSepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'polygonAmoy',
  'avalancheFuji',
  'unichainSepolia',
  'seiTestnet',
  'sonicTestnet',
  'worldchainSepolia',
  'hyperevmTestnet',
];

export const GATEWAY_CHAINS: GatewayChainConfig[] = [
  ...GATEWAY_ORDER.map((k) => ({
    key: k,
    chainId: SOURCE_CHAINS[k].chainId,
    usdc: SOURCE_CHAINS[k].usdc,
    name: SOURCE_CHAINS[k].shortName,
    appKit: SOURCE_CHAINS[k].appKit,
  })),
  {
    key: 'arc',
    chainId: arcChain.id,
    usdc: '0x3600000000000000000000000000000000000000',
    name: 'Arc',
    appKit: APPKIT_ARC_CHAIN,
  },
];

/// Arc as a CCTP endpoint on the active network.
export const ARC_CCTP = {
  chainId: arcChain.id,
  domain: 26,
  usdc: '0x3600000000000000000000000000000000000000' as const,
  explorerTx: (h: string) =>
    ARC_NETWORK === 'testnet' ? `https://testnet.arcscan.app/tx/${h}` : `https://explorer.arc.io/tx/${h}`,
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
