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

/// viem's Arc mainnet chain leaves `testnet` and `blockExplorers` unset; set
/// both so the app never presents mainnet as an unknown network or links to
/// nowhere.
export function chainFor(name: ArcNetworkName): Chain {
  return name === 'mainnet'
    ? {
        ...arc,
        testnet: false as const,
        blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
      }
    : arcTestnet;
}

export function explorerTxUrl(chain: Chain, hash: string): string {
  return `${chain.blockExplorers?.default.url ?? ''}/tx/${hash}`;
}

export function publicRpcFor(name: ArcNetworkName): string {
  return name === 'mainnet' ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.network';
}

/// Keyless RPCs a browser may call, after the network's own public endpoint.
/// dRPC backs up the public testnet RPC, which has gone dark on its own before.
const EXTRA_PUBLIC_RPCS: Record<ArcNetworkName, readonly string[]> = {
  testnet: ['https://arc-testnet.drpc.org'],
  mainnet: [],
};

/// Every Arc RPC the browser may use, in order: the dedicated endpoint
/// (NEXT_PUBLIC_ARC_RPC_URL) first, then the public ones, so the site stays on
/// chain when the dedicated one is down.
export function arcRpcPool(name: ArcNetworkName, dedicated: string | undefined): string[] {
  const pool = [dedicated?.trim(), publicRpcFor(name), ...EXTRA_PUBLIC_RPCS[name]];
  return [...new Set(pool.filter((u): u is string => !!u))];
}

export const ARC_NETWORK: ArcNetworkName = parseArcNetwork(process.env.NEXT_PUBLIC_ARC_NETWORK);

// Branding is independent of this choice; changing a label must never switch
// payment infrastructure. Only NEXT_PUBLIC_ARC_NETWORK does.
export const settlementChain = chainFor(ARC_NETWORK);

/// Karwan's deal contracts are live on testnet only. Mainnet is wallet-only
/// (balances, deposits, bridging) until the contract suite deploys there.
export const DEALS_AVAILABLE = ARC_NETWORK === 'testnet';
