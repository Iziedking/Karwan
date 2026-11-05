'use client';
import { useCallback } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { fillMoney, localHint, localiseFigures, moneyText, usdcFigure, type MoneyTextOptions } from '../moneyText';
import { useDisplayCurrency } from './useDisplayCurrency';

/// A figure from the API ("20.5", 20.5, "" or null) as a number, or null.
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

/// Prices as text in the person's chosen currency, with the USDC beside it.
/// `defaults` sets the screen's own USDC style; a call can still override it.
export function useMoneyText(defaults: MoneyTextOptions = {}) {
  const { compact, exact, signed } = defaults;
  const { locale } = useLocale();
  const { currency, rate } = useDisplayCurrency();

  const text = useCallback(
    (usdc: number | string | null | undefined, options?: MoneyTextOptions): string => {
      const n = toNumber(usdc);
      return n === null ? '' : moneyText(n, currency, rate, locale, { compact, exact, signed, ...options });
    },
    [currency, rate, locale, compact, exact, signed],
  );

  const fill = useCallback(
    (template: string, money: Record<string, number | string | null | undefined>, vars?: Record<string, string | number>, options?: MoneyTextOptions) => {
      const numbers: Record<string, number | null> = {};
      for (const [key, value] of Object.entries(money)) {
        numbers[key] = toNumber(value);
      }
      return fillMoney(template, numbers, currency, rate, locale, vars, { compact, exact, signed, ...options });
    },
    [currency, rate, locale, compact, exact, signed],
  );

  const hint = useCallback(
    (usdc: number | string | null | undefined): string | null => {
      const n = toNumber(usdc);
      return n === null || n <= 0 ? null : localHint(n, currency, rate, locale);
    },
    [currency, rate, locale],
  );

  /// The exact USDC that moves, for the one line a confirm card keeps (view 54).
  const usdc = useCallback(
    (value: number | string | null | undefined, options?: MoneyTextOptions): string => {
      const n = toNumber(value);
      return n === null ? '' : `${usdcFigure(n, locale, { compact, exact, ...options })} USDC`;
    },
    [locale, compact, exact],
  );

  /// A recorded sentence, every "N USDC" in it said in the chosen currency.
  const line = useCallback(
    (sentence: string, options?: MoneyTextOptions): string =>
      localiseFigures(sentence, (n) => moneyText(n, currency, rate, locale, { compact, exact, ...options })),
    [currency, rate, locale, compact, exact],
  );

  return { text, fill, hint, usdc, line, currency };
}
