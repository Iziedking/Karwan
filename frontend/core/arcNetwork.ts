import type { Chain } from 'viem';
import { arc, arcTestnet } from 'viem/chains';

export type ArcNetworkName = 'testnet' | 'mainnet';

/// Which Arc network the app settles on, from NEXT_PUBLIC_ARC_NETWORK. Unset
/// means testnet. Anything else unrecognised throws, so a typo fails the build
/// instead of quietly pointing a mainnet deployment at testnet.
export function parseArcNetwork(raw: string | undefined): ArcNetworkName {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'testnet') return 'testnet';
  if (v === 'mainnet') return 'mainnet';
  throw new Error(`NEXT_PUBLIC_ARC_NETWORK must be "testnet" or "mainnet", got "${raw}"`);
}

/// Endpoints as Arc documents them (docs.arc.io, references/rpc-endpoints).
/// viem's own definitions can't be trusted here: its arcTestnet names hosts
/// that stopped resolving in October 2026 and its arc has no RPC at all, and
/// these lists are what a wallet receives when the app asks it to add Arc.
const ENDPOINTS: Record<ArcNetworkName, { http: string; ws: string; explorer: string; explorerName: string }> = {
  testnet: {
    http: 'https://rpc.testnet.arc.io',
    ws: 'wss://rpc.testnet.arc.io',
    explorer: 'https://explorer.testnet.arc.io',
    explorerName: 'Arc Testnet Explorer',
  },
  mainnet: {
    http: 'https://rpc.mainnet.arc.io',
    ws: 'wss://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
    explorerName: 'Arc Explorer',
  },
};

export function chainFor(name: ArcNetworkName): Chain {
  const e = ENDPOINTS[name];
  return {
    ...(name === 'mainnet' ? arc : arcTestnet),
    testnet: name === 'testnet',
    rpcUrls: { default: { http: [e.http], webSocket: [e.ws] } },
    blockExplorers: { default: { name: e.explorerName, url: e.explorer, apiUrl: `${e.explorer}/api` } },
  };
}

export function explorerTxUrl(chain: Chain, hash: string): string {
  return `${chain.blockExplorers?.default.url ?? ''}/tx/${hash}`;
}

export function publicRpcFor(name: ArcNetworkName): string {
  return ENDPOINTS[name].http;
}

/// Keyless RPCs a browser may call, after the network's own public endpoint.
/// dRPC backs up the public testnet RPC, which has gone dark on its own before.
const EXTRA_PUBLIC_RPCS: Record<ArcNetworkName, readonly string[]> = {
  testnet: ['https://rpc.drpc.testnet.arc.io'],
  mainnet: [],
};

/// Every Arc RPC the browser may use, in order: the dedicated endpoint
/// (NEXT_PUBLIC_ARC_RPC_URL) first, then the public ones, so the site stays on
/// chain when the dedicated one is down.
/// The setting may hold several URLs separated by commas (http allowed for a
/// local node); each is used on its own, and hosts on the retired arc.network
/// domain (stopped 15 Oct 2026) are dropped.
export function arcRpcPool(name: ArcNetworkName, dedicated: string | undefined): string[] {
  const own = (dedicated ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\/\S+$/.test(u) && !new URL(u).hostname.endsWith('.arc.network'));
  return [...new Set([...own, publicRpcFor(name), ...EXTRA_PUBLIC_RPCS[name]])];
}

export const ARC_NETWORK: ArcNetworkName = parseArcNetwork(process.env.NEXT_PUBLIC_ARC_NETWORK);

// Branding is independent of this choice; changing a label must never switch
// payment infrastructure. Only NEXT_PUBLIC_ARC_NETWORK does.
export const settlementChain = chainFor(ARC_NETWORK);
export const settlementExplorer = ENDPOINTS[ARC_NETWORK].explorer;

/// Karwan's deal contracts are live on testnet only. Mainnet is wallet-only
/// (balances, deposits, bridging) until the contract suite deploys there.
export const DEALS_AVAILABLE = ARC_NETWORK === 'testnet';
