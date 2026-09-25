'use client';
import { useEffect, useState } from 'react';
import { moneyV2Enabled } from './moneySwitch';

/// The switch for client components outside the two pages that branch on the
/// server. It starts from the build flag so the first render matches the
/// server's, then applies a ?money= override once mounted.
export function useMoneyV2(): boolean {
  const [on, setOn] = useState(process.env.NEXT_PUBLIC_MONEY_V2 === '1');
  useEffect(() => {
    setOn(moneyV2Enabled(process.env.NEXT_PUBLIC_MONEY_V2, window.location.search));
  }, []);
  return on;
}
