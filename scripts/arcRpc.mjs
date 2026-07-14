/// RPC transport for the standalone .mjs cron scripts.
///
/// These ship as plain ESM (Dockerfile: `COPY scripts backend/scripts`) and are
/// invoked by the host crontab by path, so they stay uncompiled and import each
/// other as siblings. backend/src/scripts/arcRpc.ts is the same helper for the
/// scripts that do compile into dist/.
///
/// Why this exists: a paid RPC provider's usual failure mode is quota
/// exhaustion, which arrives as a JSON-RPC error inside a 200 OK. A script
/// holding a single http() turns that into a cron that dies on its first read
/// and fails silently every morning. The API server already rotates off a dead
/// primary via fallback() in chain/client.ts; these scripts now do the same.

import { fallback, http } from 'viem';

export const PUBLIC_ARC_RPC = 'https://rpc.testnet.arc.network';
export const ARC_CHAIN_ID = 5042002;

/// Primary first, then ARC_TESTNET_RPC_URLS, then the public endpoint last so a
/// blown quota on a paid provider degrades instead of stopping the job.
export function arcRpcUrls() {
  const urls = [];
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
/// next URL regardless of JSON-RPC code. Without it viem treats a quota error as
/// a user error and never falls through. `rank: false` keeps the configured
/// order, so a healthy primary is still preferred.
export function arcTransport(urls) {
  const transports = urls.map((url) => http(url, { retryCount: 1, timeout: 10_000 }));
  return transports.length === 1
    ? transports[0]
    : fallback(transports, { rank: false, retryCount: 0, shouldThrow: () => false });
}

export function arcChain(urls) {
  return {
    id: ARC_CHAIN_ID,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
    rpcUrls: { default: { http: urls } },
  };
}
