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

export function publicRpcFor(name: ArcNetworkName): string {
  return name === 'mainnet' ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.network';
}

export const ARC_NETWORK: ArcNetworkName = parseArcNetwork(process.env.NEXT_PUBLIC_ARC_NETWORK);

// Branding is independent of this choice; changing a label must never switch
// payment infrastructure. Only NEXT_PUBLIC_ARC_NETWORK does.
export const settlementChain = chainFor(ARC_NETWORK);

/// Karwan's deal contracts are live on testnet only. Mainnet is wallet-only
/// (balances, deposits, bridging) until the contract suite deploys there.
export const DEALS_AVAILABLE = ARC_NETWORK === 'testnet';
