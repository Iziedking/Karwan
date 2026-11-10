import { browserCountry, currencyForCountry } from '@/features/signup/countries';
import { regionFromCookie } from '@/shared/utils/region';
import type { DisplayCurrency, LocalCurrency } from './displayCurrency';

/// The currency a visitor reads before sign-in (view 74): the money of the
/// region the request came from, then of the browser's language, then
/// dollars. Once signed in, the person's own choice in Settings decides.
export function visitorCurrency(cookie: string, languages: readonly string[]): LocalCurrency {
  const currency = currencyForCountry(regionFromCookie(cookie) ?? browserCountry(languages));
  return currency === 'USDC' ? 'USD' : currency;
}

const FIGURE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/// The dollar figure shown small beside a visitor's local price, or null
/// when the price already reads in dollars or the reader is signed in.
export function aboutUsdFigure(usdc: number, currency: DisplayCurrency, visitor: boolean): string | null {
  if (!visitor || currency === 'USD' || currency === 'USDC') return null;
  return FIGURE.format(Math.abs(usdc));
}
