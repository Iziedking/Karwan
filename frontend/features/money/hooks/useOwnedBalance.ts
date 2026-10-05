'use client';
import { formatUnits } from 'viem';
import { useAuth } from '@/shared/hooks/useAuth';
import { useChainBalances } from '@/features/balances/hooks/useChainBalances';
import { ownedBalance, type Owned } from '../ownedBalance';
import { useMoneyBalances } from './useMoneyBalances';

/// The one balance Home and the profile show, with its parts. Reads the same
/// sources as the balance page, so the numbers agree everywhere.
export function useOwnedBalance(): Owned & { loading: boolean } {
  const money = useMoneyBalances();
  const { address } = useAuth();
  const chains = useChainBalances(address as `0x${string}` | undefined, !!address);
  const others = Object.entries(chains).filter(([key]) => key !== 'arc').map(([, query]) => query);
  const otherChains = others.some((q) => q.data === undefined && q.isLoading)
    ? null
    : others.reduce((sum, q) => sum + (q.data ? Number(formatUnits(q.data.value, q.data.decimals)) : 0), 0);
  const owned = ownedBalance({ wallet: money.balance, pool: money.pool, otherChains, buyer: money.buyer, seller: money.seller });
  return { ...owned, loading: money.loading };
}
