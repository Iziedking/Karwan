'use client';
import { ownedBalance, type Owned } from '../ownedBalance';
import { useMoneyBalances } from './useMoneyBalances';

/// The one balance Home and the profile show, with its parts. Reads the same
/// sources as the balance page, so the numbers agree everywhere.
export function useOwnedBalance(): Owned & { loading: boolean; failed: boolean; retry: () => void } {
  const money = useMoneyBalances();
  const owned = ownedBalance({ wallet: money.balance, pool: money.pool, buyer: money.buyer, seller: money.seller });
  // The wallet read failed and nothing came back: say so rather than show a dash.
  return { ...owned, loading: money.loading, failed: money.error && owned.total === null, retry: money.refetch };
}
