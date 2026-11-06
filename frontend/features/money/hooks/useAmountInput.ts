'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { useDisplayCurrency } from './useDisplayCurrency';
import { cleanTyped, currencySign, formatTyped, isLocal, typedFor, typingFilter, usdcFor } from '../localAmount';

/// One amount field in the person's own currency (view 55). They type "50000"
/// beside "₦"; `usdc` is what moves underneath, never shown. With USDC chosen,
/// or no fresh rate, the field is in USDC exactly as before.
export function useAmountInput(initialUsdc?: number | null) {
  const { locale } = useLocale();
  const { currency, rate } = useDisplayCurrency();
  const local = isLocal(currency) && !!rate;
  const unit = local ? currency : 'USDC';
  const [typed, setRaw] = useState(() => (initialUsdc ? typedFor(initialUsdc, unit, rate) : ''));
  const touched = useRef(false);

  // The currency and rate arrive after the first paint: a prefilled figure is
  // said again in the person's currency until they type themselves.
  useEffect(() => {
    if (!touched.current && initialUsdc) setRaw(typedFor(initialUsdc, unit, rate));
  }, [initialUsdc, unit, rate]);

  const setTyped = useCallback((value: string | ((current: string) => string)) => {
    touched.current = true;
    setRaw((current) => typingFilter(typeof value === 'function' ? value(current) : value, unit));
  }, [unit]);
  const setFromUsdc = useCallback(
    (usdc: number | null, round: 'nearest' | 'down' = 'nearest') => {
      touched.current = true;
      setRaw(usdc ? typedFor(usdc, unit, rate, round) : '');
    },
    [unit, rate],
  );
  const usdc = useMemo(() => usdcFor(typed, unit, rate), [typed, unit, rate]);
  /// What was typed, as it reads on the confirm: "₦50,000".
  const display = useMemo(() => formatTyped(cleanTyped(typed, unit) ?? '', unit, locale), [typed, unit, locale]);

  /// The signed quote for what is typed, for the move to carry; undefined when
  /// the field is in USDC or the server has no fresh rate (the move still goes,
  /// in USDC, and the record reads at today's rate).
  const quote = useCallback(async (): Promise<{ token: string; usdc: number } | undefined> => {
    if (!local || !typed) return undefined;
    try {
      const q = await api.moneyQuote(unit, typed);
      return { token: q.token, usdc: Number(q.usdcMicros) / 1_000_000 };
    } catch {
      return undefined;
    }
  }, [local, typed, unit]);

  return { typed, setTyped, setFromUsdc, usdc, display, unit, sign: currencySign(unit, locale), local, quote };
}

export type AmountInput = ReturnType<typeof useAmountInput>;
