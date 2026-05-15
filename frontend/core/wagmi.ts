import { defineChain, fallback } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import { http, createConfig } from 'wagmi';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'karwan-demo';

// Hardened RPC pools for the source chains. The default viem URLs
// (sepolia.base.org / rpc.sepolia.org) rate-limit aggressively and 429 under
// any real load — bridge balance/allowance reads were failing at 2s. Stack
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
  chains: [arcTestnet, baseSepolia, sepolia],
  connectors,
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
    [baseSepolia.id]: fallback(BASE_SEPOLIA_RPCS.map((url) => http(url))),
    [sepolia.id]: fallback(SEPOLIA_RPCS.map((url) => http(url))),
  },
  ssr: true,
});
