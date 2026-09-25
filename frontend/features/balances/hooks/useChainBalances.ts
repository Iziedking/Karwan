'use client';
import { useBalance } from 'wagmi';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { arcChain } from '@/core/wagmi';
import type { ChainKey } from '@/shared/components/ChainLogo';

// Arc (settlement) first, then the CCTP source chains a backend wallet can sign
// a burn on, which is exactly the set an email account gets a deposit wallet
// for. Sei, Sonic, World Chain and HyperEVM stay off: Circle exposes them as
// EOA-only, so no backend wallet holds USDC there to show.
export type RowKey =
  | 'arc'
  | 'baseSepolia'
  | 'sepolia'
  | 'arbitrumSepolia'
  | 'optimismSepolia'
  | 'polygonAmoy'
  | 'avalancheFuji'
  | 'unichainSepolia';

export const ROW_KEYS: RowKey[] = [
  'arc',
  'baseSepolia',
  'sepolia',
  'arbitrumSepolia',
  'optimismSepolia',
  'polygonAmoy',
  'avalancheFuji',
  'unichainSepolia',
];

export const CHAIN_META: Record<RowKey, { name: string; sub: string; key: ChainKey }> = {
  arc: { name: 'Arc', sub: 'Testnet', key: 'arc' },
  baseSepolia: { name: 'Base', sub: 'Sepolia', key: 'baseSepolia' },
  sepolia: { name: 'Ethereum', sub: 'Sepolia', key: 'sepolia' },
  arbitrumSepolia: { name: 'Arbitrum', sub: 'Sepolia', key: 'arbitrumSepolia' },
  optimismSepolia: { name: 'Optimism', sub: 'Sepolia', key: 'optimismSepolia' },
  polygonAmoy: { name: 'Polygon', sub: 'Amoy', key: 'polygonAmoy' },
  avalancheFuji: { name: 'Avalanche', sub: 'Fuji', key: 'avalancheFuji' },
  unichainSepolia: { name: 'Unichain', sub: 'Sepolia', key: 'unichainSepolia' },
};

/// Arc is a safety net behind SSE invalidation, so 30s; the source chains only
/// change when the person moves money on another chain, so a minute.
const ARC_POLL_MS = 30_000;
const SOURCE_POLL_MS = 60_000;

/// USDC balance for one address across Arc and every source chain. Native on
/// Arc (USDC is the gas token), ERC-20 elsewhere. A fixed-arity hook so the
/// rules-of-hooks order never shifts; `enabled` keeps a closed panel from
/// reading anything.
export function useChainBalances(address: `0x${string}` | undefined, enabled: boolean) {
  const arc = { enabled: !!address && enabled, refetchInterval: ARC_POLL_MS };
  const source = { enabled: !!address && enabled, refetchInterval: SOURCE_POLL_MS };
  return {
    arc: useBalance({ address, chainId: arcChain.id, query: arc }),
    baseSepolia: useBalance({ address, chainId: SOURCE_CHAINS.baseSepolia.chainId, token: SOURCE_CHAINS.baseSepolia.usdc, query: source }),
    sepolia: useBalance({ address, chainId: SOURCE_CHAINS.sepolia.chainId, token: SOURCE_CHAINS.sepolia.usdc, query: source }),
    arbitrumSepolia: useBalance({ address, chainId: SOURCE_CHAINS.arbitrumSepolia.chainId, token: SOURCE_CHAINS.arbitrumSepolia.usdc, query: source }),
    optimismSepolia: useBalance({ address, chainId: SOURCE_CHAINS.optimismSepolia.chainId, token: SOURCE_CHAINS.optimismSepolia.usdc, query: source }),
    polygonAmoy: useBalance({ address, chainId: SOURCE_CHAINS.polygonAmoy.chainId, token: SOURCE_CHAINS.polygonAmoy.usdc, query: source }),
    avalancheFuji: useBalance({ address, chainId: SOURCE_CHAINS.avalancheFuji.chainId, token: SOURCE_CHAINS.avalancheFuji.usdc, query: source }),
    unichainSepolia: useBalance({ address, chainId: SOURCE_CHAINS.unichainSepolia.chainId, token: SOURCE_CHAINS.unichainSepolia.usdc, query: source }),
  };
}
