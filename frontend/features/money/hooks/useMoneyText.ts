'use client';
import { useCallback } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { fillMoney, localHint, localiseFigures, moneyText, paidText, rowLine, usdcFigure, type MoneyTextOptions } from '../moneyText';
import { useDisplayCurrency } from './useDisplayCurrency';
import { formatTyped } from '../localAmount';

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
  const { locale, t: messages } = useLocale();
  const { currency, rate } = useDisplayCurrency();
  const aboutTemplate = messages.money.about;

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

  /// A price agreed in a local currency reads as agreed for anyone in that
  /// currency (view 55); everyone else reads its USDC at today's rate.
  const price = useCallback(
    (usdc: number | string | null | undefined, agreed?: { currency: string; amount: string } | null, options?: MoneyTextOptions): string =>
      agreed && agreed.currency === currency && rate
        ? `${options?.signed && Number(usdc) > 0 ? '+' : options?.signed && Number(usdc) < 0 ? '−' : ''}${formatTyped(agreed.amount, currency, locale)}`
        : text(usdc, options),
    [currency, rate, locale, text],
  );

  /// A sentence with one price in it, "Up to {amount} an hour": the price reads
  /// as typed for anyone in its currency (view 77), at the shared rate otherwise.
  const fillPrice = useCallback(
    (template: string, usdc: number | string | null | undefined, agreed?: { currency: string; amount: string } | null, key = 'amount', options?: MoneyTextOptions): string =>
      agreed && agreed.currency === currency && rate
        ? template.replace(new RegExp(`(USDC\\s?)?\\{${key}\\}(\\s?USDC)?`), () => formatTyped(agreed.amount, currency, locale))
        : fill(template, { [key]: usdc }, {}, options),
    [currency, rate, locale, fill],
  );

  /// A payment already made: the figure kept for this reader, or today's
  /// figure marked "about" when none was kept (view 77).
  const paid = useCallback(
    (usdc: number | string | null | undefined, kept?: { currency: string; amount: string } | null, options?: MoneyTextOptions): string => {
      const mine = kept && kept.currency === currency && rate ? price(usdc, kept, options) : null;
      return paidText(text(usdc, options), mine, currency !== 'USDC' && rate ? 'local' : 'usdc', aboutTemplate);
    },
    [currency, rate, price, text, aboutTemplate],
  );

  /// A money row's words: its own amount reads as kept for this reader, as the
  /// amount beside the words does; other figures at today's rate (L-05).
  const row = useCallback(
    (sentence: string, usdc: number | string | null | undefined, kept?: { currency: string; amount: string } | null): string =>
      rowLine(
        sentence,
        (n) => moneyText(n, currency, rate, locale, { compact, exact }),
        usdc,
        kept && kept.currency === currency && rate ? formatTyped(kept.amount, currency, locale) : null,
      ),
    [currency, rate, locale, compact, exact],
  );

  return { text, fill, hint, usdc, line, row, price, paid, fillPrice, currency };
}
