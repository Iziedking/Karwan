import { formatBalance } from './balanceModel';

/// How amounts can read (view 51). Money always stays in USDC; these change
/// only the figure a person reads. The same list the backend accepts.
export const DISPLAY_CURRENCIES = ['USDC', 'NGN', 'USD', 'EUR', 'GBP', 'CNY', 'INR', 'AED', 'KES', 'XOF'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export type LocalCurrency = Exclude<DisplayCurrency, 'USDC'>;

/// Currencies whose smallest everyday unit is the whole note.
const WHOLE: ReadonlySet<LocalCurrency> = new Set(['NGN', 'KES', 'XOF']);

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

/// A USDC amount in a local currency, or null when there is no fresh rate.
/// Latin digits in every language, as the money screens already do.
export function formatLocal(usdc: number, currency: DisplayCurrency, rate: number | null, locale: string, signed = false): string | null {
  if (currency === 'USDC' || !rate) return null;
  const digits = WHOLE.has(currency) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: 'latn',
    signDisplay: signed ? 'exceptZero' : 'auto',
  } as Intl.NumberFormatOptions).format(usdc * rate);
}

/// The figure that leads, and the USDC line under it when a local currency
/// leads. With no rate the USDC figure leads alone.
export function formatDisplay(
  usdc: number,
  currency: DisplayCurrency,
  rate: number | null,
  locale: string,
): { primary: string; unit: 'USDC' | null; secondary: string | null } {
  const usdcText = formatBalance(usdc, locale === 'ar' ? 'ar-u-nu-latn' : locale);
  const local = formatLocal(usdc, currency, rate, locale);
  if (!local) return { primary: usdcText, unit: 'USDC', secondary: null };
  return { primary: local, unit: null, secondary: `${usdcText} USDC` };
}

/// "1 USDC = ₦1,346", shown beside each choice in Settings.
export function rateLine(currency: DisplayCurrency, rate: number | null, locale: string): string | null {
  if (currency === 'USDC' || !rate) return null;
  const digits = WHOLE.has(currency) ? 0 : 2;
  const figure = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: 'latn',
  } as Intl.NumberFormatOptions).format(rate);
  return `1 USDC = ${figure}`;
}
