import type { DisplayCurrency, LocalCurrency } from './displayCurrency';

/// Amounts typed in the person's own currency (view 55). USDC is what moves;
/// the screen never shows it. These turn a typed figure into the USDC that
/// moves and back, the same way the server's quote does, so the figure on the
/// confirm and the record agree.

const WHOLE: ReadonlySet<string> = new Set(['NGN', 'KES', 'XOF']);

export function currencyDigits(currency: DisplayCurrency): number {
  if (currency === 'USDC') return 6;
  return WHOLE.has(currency) ? 0 : 2;
}

/// A typed figure as a plain number string, or null. Grouping commas are
/// dropped; a currency without a minor unit takes whole numbers only.
export function cleanTyped(input: string, currency: DisplayCurrency): string | null {
  const value = input.trim().replace(/,/g, '');
  const digits = currencyDigits(currency);
  const shape = digits === 0 ? /^\d{1,15}$/ : new RegExp(`^\\d{1,15}(\\.\\d{1,${digits}})?$`);
  if (!shape.test(value) || Number(value) <= 0) return null;
  return value;
}

/// What the person is allowed to keep typing: digits and, where the currency
/// has a minor unit, one point and that many places.
export function typingFilter(input: string, currency: DisplayCurrency): string {
  const digits = currencyDigits(currency);
  const latin = input.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (digits === 0) return latin.replace(/,/g, '').split(/[.٫]/)[0].replace(/\D/g, '');
  // "49,50" is a decimal comma; "1,250" is grouping.
  let plain = latin.replace(/٫/g, '.');
  if (!plain.includes('.') && /,\d{1,2}$/.test(plain)) plain = plain.replace(/,(\d{1,2})$/, '.$1');
  plain = plain.replace(/,/g, '');
  const [whole, ...rest] = plain.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, digits)}` : whole;
}

/// The USDC that moves for a typed local figure, rounded down to the micro so
/// nobody moves more than they typed. Matches the server's quote exactly.
export function usdcFor(typed: string, currency: DisplayCurrency, rate: number | null): number | null {
  const value = cleanTyped(typed, currency);
  if (value === null) return null;
  if (currency === 'USDC') return Number(value);
  if (!rate) return null;
  const micros = Math.floor((Number(value) / rate) * 1_000_000);
  return micros > 0 ? micros / 1_000_000 : null;
}

/// A USDC figure as the person would type it in their currency: a prefilled
/// price or an edit reads to the nearest unit; "Max" rounds down, so it never
/// asks for more than the balance holds.
export function typedFor(usdc: number, currency: DisplayCurrency, rate: number | null, round: 'nearest' | 'down' = 'nearest'): string {
  if (currency === 'USDC' || !rate) return String(Math.floor(usdc * 1_000_000) / 1_000_000);
  const digits = currencyDigits(currency);
  const scale = 10 ** digits;
  const raw = usdc * rate * scale;
  const value = (round === 'down' ? Math.floor(raw + 1e-6) : Math.round(raw)) / scale;
  return digits === 0 ? String(value) : value.toFixed(digits).replace(/\.00$/, '');
}

/// The currency's sign beside a field: "₦", "€", "KSh", or "USDC".
export function currencySign(currency: DisplayCurrency, locale: string): string {
  if (currency === 'USDC') return 'USDC';
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency;
}

export function isLocal(currency: DisplayCurrency): currency is LocalCurrency {
  return currency !== 'USDC';
}

/// A typed figure as it reads on a confirm and a receipt: "₦50,000", "€18.40",
/// "20 USDC". Latin digits in every language, as the money screens use.
export function formatTyped(value: string, currency: DisplayCurrency, locale: string): string {
  const n = Number(value);
  if (!value || !Number.isFinite(n)) return '';
  if (currency === 'USDC') {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 6, numberingSystem: 'latn' } as Intl.NumberFormatOptions).format(n)} USDC`;
  }
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: 'latn',
  } as Intl.NumberFormatOptions).format(n);
}

/// When a price agreed in a local currency is now worth more than 2% more or
/// less at today's rate (view 55): the agreed figure and today's, for the
/// funding confirm. Null when the reader is in another currency or the rate is
/// within 2%.
export function rateMoved(
  agreed: { currency: string; amount: string },
  usdc: number,
  currency: DisplayCurrency,
  rate: number | null,
  locale: string,
): { agreed: string; now: string } | null {
  if (currency === 'USDC' || agreed.currency !== currency || !rate) return null;
  const was = Number(agreed.amount);
  const now = usdc * rate;
  if (!(was > 0) || Math.abs(now - was) / was <= 0.02) return null;
  const digits = currencyDigits(currency);
  const scale = 10 ** digits;
  return { agreed: formatTyped(agreed.amount, currency, locale), now: formatTyped(String(Math.round(now * scale) / scale), currency, locale) };
}
