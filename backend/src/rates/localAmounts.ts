import { localFigure, type DisplayCurrency, type UsdcRates } from './usdcRates.js';

/// Prices in emails and Telegram read the way they do on the site (owner,
/// 5 Nov 2026): the currency the person chose leads, and the USDC it really is
/// stays beside it. Money always moves in USDC; with USDC chosen, or no fresh
/// rate, a message is sent exactly as written.

/// A USDC amount in the chosen currency, "₦26,885", or null.
export function formatLocalAmount(usdc: number, currency: DisplayCurrency | undefined, rates: UsdcRates, locale = 'en'): string | null {
  const figure = localFigure(usdc, currency, rates);
  if (!figure) return null;
  const digits = figure.amount.includes('.') ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: figure.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: 'latn',
  } as Intl.NumberFormatOptions).format(Number(figure.amount));
}

const AMOUNT = /(?<![\w.,])([+\-−]?)(\d[\d,]*(?:\.\d+)?) USDC\b/g;

/// Every "N USDC" in a message becomes "₦X · N USDC" for a person who chose
/// naira. Run it once, on the finished text, just before it is sent.
export function localiseUsdcText(text: string, currency: DisplayCurrency | undefined, rates: UsdcRates, locale = 'en'): string {
  if (!currency || currency === 'USDC') return text;
  return text.replace(AMOUNT, (whole, sign: string, figure: string) => {
    const usdc = Number(figure.replace(/,/g, ''));
    if (!Number.isFinite(usdc)) return whole;
    const local = formatLocalAmount(usdc, currency, rates, locale);
    return local ? `${sign}${local} · ${sign}${figure} USDC` : whole;
  });
}
