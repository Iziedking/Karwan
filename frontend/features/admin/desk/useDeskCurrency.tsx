'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type LocalAmount } from '@/core/api';
import type { DisplayCurrency } from '@/features/money/displayCurrency';
import { deskMoney, readDeskCurrency, type DeskAmount, type DeskRates } from './deskMoney';

const KEY = 'karwan.desk.currency';
const EVERY_MS = 5 * 60_000;

interface DeskMoneyState {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  rates: DeskRates;
}

const DeskMoneyContext = createContext<DeskMoneyState | null>(null);

/// Holds the teammate's chosen currency (kept in this browser) and the shared
/// rate of this desk's network, refreshed every five minutes.
export function DeskMoneyProvider({ children }: { children: ReactNode }) {
  const [currency, setChosen] = useState<DisplayCurrency>('NGN');
  const [rates, setRates] = useState<DeskRates>({});

  useEffect(() => {
    try {
      setChosen(readDeskCurrency(window.localStorage.getItem(KEY)));
    } catch {
      setChosen('NGN');
    }
    let live = true;
    const load = () => api.adminRates().then((r) => live && setRates(r.rates)).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  const setCurrency = useCallback((c: DisplayCurrency) => {
    setChosen(c);
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      // Kept for this visit only.
    }
  }, []);

  return <DeskMoneyContext.Provider value={{ currency, setCurrency, rates }}>{children}</DeskMoneyContext.Provider>;
}

function useDeskMoneyState(): DeskMoneyState {
  const state = useContext(DeskMoneyContext);
  if (!state) throw new Error('useDeskCurrency outside the desk shell');
  return state;
}

export function useDeskCurrency(): [DisplayCurrency, (c: DisplayCurrency) => void, DeskRates] {
  const { currency, setCurrency, rates } = useDeskMoneyState();
  return [currency, setCurrency, rates];
}

/// Formats a USDC amount the way this teammate reads the desk.
export function useDeskMoney(): (usdc: string, opts?: { kept?: LocalAmount; theirs?: string }) => DeskAmount {
  const { currency, rates } = useDeskMoneyState();
  return useCallback((usdc, opts) => deskMoney(usdc, currency, rates, opts), [currency, rates]);
}
