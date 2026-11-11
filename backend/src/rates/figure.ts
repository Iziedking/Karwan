import { localFigure, type DisplayCurrency, type LocalCurrency, type UsdcRates } from './usdcRates.js';

/// The one reader (view 77). Every amount in an email, a Telegram message or an
/// assistant line becomes the figure a person reads through here, so the same
/// amount reads the same wherever it is said.
///
/// 1. Typed stays typed: an amount somebody typed or agreed in the reader's
///    currency reads as that figure, whatever the rate is now.
/// 2. Everything else reads at the shared rate.

/// An amount kept on a record beside its USDC, as it was said.
export interface KeptFigure {
  usdc: number;
  local: { currency: LocalCurrency; amount: string };
}

const wholeUnits = (currency: LocalCurrency) => currency === 'NGN' || currency === 'KES' || currency === 'XOF';

function money(amount: number, currency: LocalCurrency, locale: string, digits: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: 'latn',
  } as Intl.NumberFormatOptions).format(amount);
}

/// A message prints USDC to the cent, so a kept figure matches to the cent.
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

/// A USDC amount as its reader sees it, "₦300,000". Null when they read USDC,
/// or when nothing was kept and no rate is held.
export function figureFor(
  usdc: number,
  currency: DisplayCurrency | undefined,
  rates: UsdcRates,
  locale = 'en',
  kept: readonly KeptFigure[] = [],
): string | null {
  if (!currency || currency === 'USDC') return null;
  const said = kept.find((k) => k.local.currency === currency && sameAmount(k.usdc, usdc));
  if (said) return money(Number(said.local.amount), currency, locale, wholeUnits(currency) ? 0 : 2);
  const figure = localFigure(usdc, currency, rates);
  if (!figure) return null;
  return money(Number(figure.amount), figure.currency, locale, figure.amount.includes('.') ? 2 : 0);
}
