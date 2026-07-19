import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  webSocket,
  type Abi,
  type Log,
} from 'viem';
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

/// Same shape as resolveRpcUrls, for the websocket endpoints: primary first,
/// then the comma-separated fallbacks from ARC_TESTNET_WSS_URLS, deduped in
/// order so a fallback matching the primary doesn't waste a rotation slot.
function resolveWssUrls(): string[] {
  const urls: string[] = [config.ARC_TESTNET_WSS_URL];
  const extra = (config.ARC_TESTNET_WSS_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const u of extra) {
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

const RPC_URLS = resolveRpcUrls();
const WSS_URLS = resolveWssUrls();

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
      webSocket: WSS_URLS,
    },
    public: {
      http: RPC_URLS,
      webSocket: WSS_URLS,
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

/// How far back one poll may read. A stall longer than this (RPC outage,
/// paused container) skips ahead rather than issuing a getLogs range the
/// provider would reject; the startup backfill and the reconcilers own gap
/// recovery.
const WATCH_MAX_RANGE = 5_000n;

/// Stateless contract-event watcher over getLogs. viem's watchContractEvent
/// on an HTTP client uses eth_newFilter + eth_getFilterChanges whenever the
/// RPC accepts filter creation, and filter STATE lives on one server — with
/// our fallback() pool the next poll can land on a different server (or the
/// server expires the filter), which strands the watcher in a permanent
/// error loop that viem only self-heals from on one narrow error type. Every
/// getLogs call here is self-contained, so pool rotation is harmless.
export function watchEventsViaGetLogs(input: {
  address: `0x${string}`;
  abi: Abi;
  eventName: string;
  pollingInterval: number;
  onLogs: (logs: Log[]) => void;
  onError: (err: Error) => void;
}): () => void {
  let prev: bigint | null = null;
  let inFlight = false;
  let stopped = false;
  // Exponential backoff so a persistently failing range (e.g. a getLogs window
  // the RPC keeps rejecting) stops re-firing every tick and hammering the RPC.
  let errorStreak = 0;
  let nextAllowedAt = 0;
  const BACKOFF_CAP_MS = 5 * 60_000;

  const tick = async () => {
    if (inFlight || stopped) return;
    if (Date.now() < nextAllowedAt) return; // backing off after errors
    inFlight = true;
    try {
      const head = await publicClient.getBlockNumber();
      if (prev === null) {
        // First tick anchors the cursor: only events AFTER watch start are
        // emitted, matching filter semantics (history is the backfill's job).
        prev = head;
        errorStreak = 0;
        return;
      }
      if (head <= prev) {
        errorStreak = 0;
        return;
      }
      let from = prev + 1n;
      if (head - from > WATCH_MAX_RANGE) {
        from = head - WATCH_MAX_RANGE;
      }
      const logs = await publicClient.getContractEvents({
        address: input.address,
        abi: input.abi,
        eventName: input.eventName,
        fromBlock: from,
        toBlock: head,
      });
      prev = head;
      errorStreak = 0;
      if (logs.length > 0) input.onLogs(logs as Log[]);
    } catch (err) {
      // Cursor stays put: the same range retries, but after a growing delay
      // (interval × 2^streak, capped) so a broken range doesn't spin the RPC.
      errorStreak += 1;
      const delay = Math.min(input.pollingInterval * 2 ** (errorStreak - 1), BACKOFF_CAP_MS);
      nextAllowedAt = Date.now() + delay;
      input.onError(err as Error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), input.pollingInterval);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/// One webSocket() transport per configured WSS endpoint, primary first. A
/// dropped or erroring socket rotates to the next endpoint (shouldThrow: false
/// forces rotation on any error, matching the http pool), so a QuickNode ws blip
/// doesn't strand the watchers on a dead socket. Single endpoint stays a plain
/// webSocket() with no fallback wrapper.
const wsTransports = WSS_URLS.map((url) => webSocket(url, { retryCount: 3 }));

export const wsClient = createPublicClient({
  chain: arcTestnet,
  transport:
    wsTransports.length === 1
      ? wsTransports[0]!
      : fallback(wsTransports, {
          rank: false,
          retryCount: 0,
          shouldThrow: () => false,
        }),
});

export type PublicClient = typeof publicClient;
