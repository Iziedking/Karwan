import { fallback, defineChain } from 'viem';
import {
  arcTestnet,
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
} from 'viem/chains';
import { http, createConfig } from 'wagmi';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';

// Arc Testnet ships with viem (v2.48+): chain id 5042002, native USDC at 18
// decimals, three RPC fallbacks (arc + quicknode + blockdaemon), multicall3,
// arcscan explorer + apiUrl. Re-exported here so the existing callers around
// the app keep their `@/core/wagmi` import path; no functional change.
export { arcTestnet };

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'karwan-demo';

// Hardened RPC pools for the source chains. The default viem URLs
// (sepolia.base.org / rpc.sepolia.org) rate-limit aggressively and 429 under
// any real load. bridge balance/allowance reads were failing at 2s. Stack
// publicnode + drpc + the canonical default with `fallback` so a single
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
  'https://sepolia.drpc.org',
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
  'https://polygon-amoy.drpc.org',
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

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet, injectedWallet],
    },
  ],
  { appName: 'Karwan', projectId: WC_PROJECT_ID },
);

export const wagmiConfig = createConfig({
  chains: [
    arcTestnet,
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
  ],
  connectors,
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
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
  },
  ssr: true,
});
