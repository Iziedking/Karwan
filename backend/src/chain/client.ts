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
/// transport rotates through them when one returns an error. Static
/// order matches RPC_URLS (primary first, fallbacks after); rank-by-
/// latency is intentionally disabled. The primary's failure mode is
/// daily-quota exhaustion (TransactionRejectedRpcError, code -32003),
/// which is a JSON-RPC application error wrapped in a 200 OK response.
/// With `rank: true` viem's ranking poll kept choosing the lower-latency
/// primary even while it was returning that error, and viem's default
/// `shouldThrow` treated -32003 as a user error and didn't rotate.
///
/// `shouldThrow: () => false` forces every per-transport error to fall
/// through to the next URL, regardless of code. Per-transport retryCount
/// stays at 0 here because each http() already has its own retryCount
/// internally; we want the fallback to rotate fast, not retry the dead
/// transport.
const httpTransports = RPC_URLS.map((url) =>
  http(url, {
    retryCount: 1,
    timeout: 10_000,
  }),
);

/// Shared Arc transport: a single http() when only one RPC is configured,
/// otherwise a fallback() that rotates on any per-transport error. Exported so
/// write paths (the USYC wrap signer) ride the same fallback as reads instead of
/// pinning a single RPC, which makes a rate-limited primary rotate to a backup.
export const arcTransport =
  httpTransports.length === 1
    ? httpTransports[0]!
    : fallback(httpTransports, {
        rank: false,
        retryCount: 0,
        shouldThrow: () => false,
      });

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: arcTransport,
});

export const wsClient = createPublicClient({
  chain: arcTestnet,
  transport: webSocket(config.ARC_TESTNET_WSS_URL, {
    retryCount: 3,
  }),
});

export type PublicClient = typeof publicClient;
