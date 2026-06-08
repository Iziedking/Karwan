import { createPublicClient, defineChain, fallback, http, webSocket } from 'viem';
import { config } from '../config.js';

/// Build the ordered list of RPC URLs to try. Primary first, then any
/// comma-separated fallbacks from ARC_TESTNET_RPC_URLS. Deduped while
/// preserving order so a fallback that matches the primary doesn't waste
/// a retry slot.
function resolveRpcUrls(): string[] {
  const urls: string[] = [config.ARC_TESTNET_RPC_URL];
  const extra = (config.ARC_TESTNET_RPC_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const u of extra) {
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

const RPC_URLS = resolveRpcUrls();

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
      http: RPC_URLS,
      webSocket: [config.ARC_TESTNET_WSS_URL],
    },
    public: {
      http: RPC_URLS,
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

/// Wrap each RPC URL in its own http() transport so viem's fallback()
/// transport rotates through them when one returns an error. Rank order
/// matches RPC_URLS: primary first, fallbacks after. `rank` rebalances
/// based on latency so a degraded primary naturally drops back; a single
/// URL skips the fallback wrapper entirely.
const httpTransports = RPC_URLS.map((url) =>
  http(url, {
    retryCount: 3,
    timeout: 10_000,
  }),
);

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport:
    httpTransports.length === 1
      ? httpTransports[0]!
      : fallback(httpTransports, { rank: true }),
});

export const wsClient = createPublicClient({
  chain: arcTestnet,
  transport: webSocket(config.ARC_TESTNET_WSS_URL, {
    retryCount: 3,
  }),
});

export type PublicClient = typeof publicClient;
