import { fallback, defineChain } from 'viem';
import {
  baseSepolia,
  sepolia,
  optimismSepolia,
  arbitrumSepolia,
  polygonAmoy,
  avalancheFuji,
  unichainSepolia,
  seiTestnet,
  worldchainSepolia,
  hyperliquidEvmTestnet,
  mainnet as ethereum,
  base,
  optimism,
  arbitrum,
  polygon,
  avalanche,
  unichain,
  sei,
  sonic,
  worldchain,
  hyperEvm,
} from 'viem/chains';
import type { Chain, Transport } from 'viem';
import { http, createConfig } from 'wagmi';
import { ARC_NETWORK, publicRpcFor, settlementChain as arcChain } from './arcNetwork';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';

// The Arc chain for the active network (core/arcNetwork.ts), from viem's own
// definitions. Re-exported so callers keep their `@/core/wagmi` import path.
export { arcChain };

/// Arc RPC pool for the active network, primary first. A dedicated endpoint (QuickNode) leads
/// when NEXT_PUBLIC_ARC_RPC_URL is set, with the public RPC as the fallback so a
/// dedicated-endpoint hiccup never takes the app off-chain. NEXT_PUBLIC_ is
/// inlined into the client bundle, so the dedicated URL is PUBLIC — restrict it
/// to the app's domains via the provider's endpoint security (referrer/origin
/// allowlist), or it can be lifted and its quota drained.
export const ARC_RPC_URLS: string[] = [
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  publicRpcFor(ARC_NETWORK),
].filter((u): u is string => !!u && u.length > 0);

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || null;

// Hardened RPC pools for the source chains. The default viem URLs
// (sepolia.base.org / rpc.sepolia.org) rate-limit aggressively and 429 under
// any real load. bridge balance/allowance reads were failing at 2s. Stack
// publicnode + the canonical default with `fallback` so a single
// flaky provider doesn't kill the bridge. Override per environment via
// NEXT_PUBLIC_BASE_SEPOLIA_RPC / NEXT_PUBLIC_SEPOLIA_RPC.
const BASE_SEPOLIA_RPCS = [
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC,
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.drpc.org',
  'https://sepolia.base.org',
].filter((u): u is string => !!u);

const SEPOLIA_RPCS = [
  process.env.NEXT_PUBLIC_SEPOLIA_RPC,
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
].filter((u): u is string => !!u);

const OP_SEPOLIA_RPCS = [
  process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC,
  'https://optimism-sepolia-rpc.publicnode.com',
  'https://optimism-sepolia.drpc.org',
  'https://sepolia.optimism.io',
].filter((u): u is string => !!u);

const ARB_SEPOLIA_RPCS = [
  process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC,
  'https://arbitrum-sepolia-rpc.publicnode.com',
  'https://arbitrum-sepolia.drpc.org',
  'https://sepolia-rollup.arbitrum.io/rpc',
].filter((u): u is string => !!u);

const POLYGON_AMOY_RPCS = [
  process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC,
  'https://polygon-amoy-bor-rpc.publicnode.com',
  'https://rpc-amoy.polygon.technology',
].filter((u): u is string => !!u);

// Circle's Gateway reaches six chains beyond the CCTP set. Five ship with viem;
// Sonic Testnet does not. viem's `sonicTestnet` is 64165 and `sonicBlazeTestnet`
// is 57054, but Circle's Sonic_Testnet is 14601, so neither is the right chain.
// Defined here from Circle's own chain record rather than picking whichever
// viem export has a similar name.
export const sonicTestnet14601 = defineChain({
  id: 14601,
  name: 'Sonic Testnet',
  nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.soniclabs.com'] } },
  blockExplorers: {
    default: { name: 'SonicScan', url: 'https://testnet.sonicscan.org' },
  },
  testnet: true,
});

// WalletConnect and the MetaMask QR fallback both require a real Reown project
// id. A demo id makes every local page issue a doomed remote-config request.
// When the id is absent, keep browser-injected, Rabby, and Coinbase sign-in
// available without initializing Reown. Deployments with a configured id keep
// the full wallet and QR set.
const walletFactories = WC_PROJECT_ID
  ? [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet, injectedWallet]
  : [rabbyWallet, coinbaseWallet, injectedWallet];

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: walletFactories,
    },
  ],
  { appName: 'Karwan', projectId: WC_PROJECT_ID ?? 'walletconnect-disabled' },
);

/// Source chains per network. Testnet keeps the hardened RPC stacks above;
/// mainnet uses viem's public endpoints until real traffic shows which need a
/// fallback stack.
const TESTNET_SOURCE_CHAINS: readonly Chain[] = [
  baseSepolia,
  sepolia,
  optimismSepolia,
  arbitrumSepolia,
  polygonAmoy,
  // Gateway-only sources. Not CCTP source chains: the bridge still burns from
  // the five above. These exist so a wallet can switch to them to pool USDC.
  avalancheFuji,
  unichainSepolia,
  seiTestnet,
  sonicTestnet14601,
  worldchainSepolia,
  hyperliquidEvmTestnet,
];

const ARC_TRANSPORT = fallback(ARC_RPC_URLS.map((url) => http(url, { retryCount: 1 })));

const TESTNET_TRANSPORTS: Record<number, Transport> = {
  [baseSepolia.id]: fallback(BASE_SEPOLIA_RPCS.map((url) => http(url))),
  [sepolia.id]: fallback(SEPOLIA_RPCS.map((url) => http(url))),
  [optimismSepolia.id]: fallback(OP_SEPOLIA_RPCS.map((url) => http(url))),
  [arbitrumSepolia.id]: fallback(ARB_SEPOLIA_RPCS.map((url) => http(url))),
  [polygonAmoy.id]: fallback(POLYGON_AMOY_RPCS.map((url) => http(url))),
  // Single public RPC each, taken from Circle's own chain records. These only
  // serve a balance read and a deposit, not the bridge's hot path, so they do
  // not get the fallback stack the CCTP chains needed.
  [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc'),
  [unichainSepolia.id]: http('https://sepolia.unichain.org'),
  [seiTestnet.id]: http('https://evm-rpc-testnet.sei-apis.com'),
  [sonicTestnet14601.id]: http('https://rpc.testnet.soniclabs.com'),
  [worldchainSepolia.id]: fallback([
    http('https://worldchain-sepolia.drpc.org'),
    http('https://worldchain-sepolia.g.alchemy.com/public'),
  ]),
  [hyperliquidEvmTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm'),
};

const MAINNET_SOURCE_CHAINS: readonly Chain[] = [
  ethereum,
  base,
  optimism,
  arbitrum,
  polygon,
  avalanche,
  unichain,
  sei,
  sonic,
  worldchain,
  hyperEvm,
];

const SOURCE_CHAINS_FOR_NETWORK =
  ARC_NETWORK === 'mainnet' ? MAINNET_SOURCE_CHAINS : TESTNET_SOURCE_CHAINS;

const SOURCE_TRANSPORTS: Record<number, Transport> =
  ARC_NETWORK === 'mainnet'
    ? Object.fromEntries(MAINNET_SOURCE_CHAINS.map((c) => [c.id, http()]))
    : TESTNET_TRANSPORTS;

export const wagmiConfig = createConfig({
  chains: [arcChain, ...SOURCE_CHAINS_FOR_NETWORK],
  connectors,
  transports: {
    // retryCount 1, not viem's default of 3.
    //
    // A rate limit amplifies itself here. Every read that gets throttled is
    // retried three times by the transport, then rotated to the next URL in the
    // fallback and retried three more, then retried again by react-query. One
    // throttled render of three Arc balances became roughly two dozen requests,
    // which is what filled the console on /profile. Worse, a throttled response
    // arrives without CORS headers, so the browser reports it as a CORS failure
    // and the retries look like a policy problem rather than a load problem.
    //
    // `fallback` already provides the redundancy: rotating to the next endpoint
    // is a better answer to a busy one than asking it again.
    [arcChain.id]: ARC_TRANSPORT,
    ...SOURCE_TRANSPORTS,
  },
  ssr: true,
});
