import { createPublicClient, defineChain, http, webSocket } from 'viem';
import { config } from '../config.js';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [config.ARC_TESTNET_RPC_URL],
      webSocket: [config.ARC_TESTNET_WSS_URL],
    },
    public: {
      http: [config.ARC_TESTNET_RPC_URL],
      webSocket: [config.ARC_TESTNET_WSS_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: config.ARC_TESTNET_EXPLORER_URL,
    },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(config.ARC_TESTNET_RPC_URL, {
    retryCount: 3,
    timeout: 10_000,
  }),
});

export const wsClient = createPublicClient({
  chain: arcTestnet,
  transport: webSocket(config.ARC_TESTNET_WSS_URL, {
    retryCount: 3,
  }),
});

export type PublicClient = typeof publicClient;
