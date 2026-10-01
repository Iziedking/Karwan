'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/// What the deal being written will need from the buying agent, shared from
/// the form to the balance beside it so a shortfall shows before posting.
const DealAmountContext = createContext<{ need: number | null; setNeed: (value: number | null) => void } | null>(null);

export function DealAmountProvider({ children }: { children: ReactNode }) {
  const [need, setNeed] = useState<number | null>(null);
  return <DealAmountContext.Provider value={{ need, setNeed }}>{children}</DealAmountContext.Provider>;
}

export function useReportDealAmount(amount: number | null) {
  const setNeed = useContext(DealAmountContext)?.setNeed;
  useEffect(() => {
    if (!setNeed) return;
    setNeed(amount && amount > 0 ? amount : null);
    return () => setNeed(null);
  }, [setNeed, amount]);
}

export function useDealAmountNeed(): number | null {
  return useContext(DealAmountContext)?.need ?? null;
}
