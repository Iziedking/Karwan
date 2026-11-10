'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { isDisplayCurrency, type DisplayCurrency } from '../displayCurrency';
import { visitorCurrency } from '../visitorCurrency';

const RATES_KEY = ['money', 'rates'] as const;
const settingsKey = (address: string | null) => ['settings', address] as const;

const never = () => () => {};
const readVisitor = (): DisplayCurrency => visitorCurrency(document.cookie, navigator.languages ?? []);
const serverVisitor = (): DisplayCurrency => 'USD';

/// The currency a person reads amounts in, and today's rate for it (view 51).
/// No rate, or USDC chosen, means amounts read in USDC. A visitor who is not
/// signed in reads the money of their region (view 74).
export function useDisplayCurrency() {
  const { address, isLoading } = useAuth();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: settingsKey(address ?? null),
    queryFn: () => api.getSettings(address as string),
    enabled: !!address,
    staleTime: 5 * 60_000,
  });
  const rates = useQuery({ queryKey: RATES_KEY, queryFn: () => api.moneyRates(), staleTime: 60_000, refetchInterval: 60_000 });
  const regional = useSyncExternalStore(never, readVisitor, serverVisitor);

  const visitor = !address && !isLoading;
  const chosen = settings.data?.settings?.displayCurrency;
  const currency: DisplayCurrency = visitor ? regional : isDisplayCurrency(chosen) ? chosen : 'USDC';
  const table = rates.data?.rates ?? {};
  const rate = currency === 'USDC' ? null : (table[currency] ?? null);

  const set = useCallback(
    async (next: DisplayCurrency) => {
      if (!address) return;
      const saved = await api.saveSettings(address, { displayCurrency: next });
      client.setQueryData(settingsKey(address), saved);
    },
    [address, client],
  );

  return { currency, rate, rates: table, ratesLoaded: rates.isSuccess, set, visitor };
}
