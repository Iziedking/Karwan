/// RPC transport for the standalone cron scripts.
///
/// The scripts read env directly rather than through config.js, so they stay
/// runnable in a bare container without the full zod schema being satisfied.
/// That independence cost them the resilience chain/client.ts already has: a
/// single http() turns the primary's known failure mode (quota exhaustion,
/// which arrives as a JSON-RPC error inside a 200 OK) into a dead cron that
/// fails silently every morning.
///
/// Mirrors the server's pool: primary first, then ARC_TESTNET_RPC_URLS, and
/// the public Arc endpoint last so a blown quota on a paid provider degrades
/// instead of stopping the daily credit.

import { fallback, http, type Transport } from 'viem';

export const PUBLIC_ARC_RPC = 'https://rpc.testnet.arc.network';
export const ARC_CHAIN_ID = 5042002;

export function arcRpcUrls(): string[] {
  const urls: string[] = [];
  const primary = process.env.ARC_TESTNET_RPC_URL?.trim();
  if (primary) urls.push(primary);

  for (const u of (process.env.ARC_TESTNET_RPC_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!urls.includes(u)) urls.push(u);
  }

  if (!urls.includes(PUBLIC_ARC_RPC)) urls.push(PUBLIC_ARC_RPC);
  return urls;
}

/// `shouldThrow: () => false` forces every per-transport error to rotate to the
/// next URL regardless of JSON-RPC code. Without it viem treats a quota error
/// as a user error and never falls through. `rank: false` keeps the configured
/// order, so a healthy primary is still preferred.
export function arcTransport(urls: string[]): Transport {
  const transports = urls.map((url) => http(url, { retryCount: 1, timeout: 10_000 }));
  return transports.length === 1
    ? transports[0]!
    : fallback(transports, { rank: false, retryCount: 0, shouldThrow: () => false });
}

export function arcChain(urls: string[]) {
  return {
    id: ARC_CHAIN_ID,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
    rpcUrls: { default: { http: urls } },
  } as const;
}
