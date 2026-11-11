import { type DisplayCurrency, type UsdcRates } from './usdcRates.js';
import { figureFor, type KeptFigure } from './figure.js';

/// Prices in emails and Telegram read the way they do on the site (view 54):
/// one figure in the currency the person chose. Money always moves in USDC;
/// with USDC chosen, or no rate held, a message is sent exactly as written.
/// Every figure comes from the one reader (view 77).

/// A USDC amount in the chosen currency, "₦26,885", or null.
export function formatLocalAmount(usdc: number, currency: DisplayCurrency | undefined, rates: UsdcRates, locale = 'en'): string | null {
  return figureFor(usdc, currency, rates, locale);
}

const AMOUNT = /(?<![\w.,])([+\-−]?)(\d[\d,]*(?:\.\d+)?) USDC\b/g;

/// Every "N USDC" in a message becomes "₦X" for a person who chose naira.
/// Run it once, on the finished text, just before it is sent. `kept` holds the
/// amounts people typed on the records the message is about: one of those
/// reads as it was typed.
export function localiseUsdcText(
  text: string,
  currency: DisplayCurrency | undefined,
  rates: UsdcRates,
  locale = 'en',
  kept: readonly KeptFigure[] = [],
): string {
  if (!currency || currency === 'USDC') return text;
  return text.replace(AMOUNT, (whole, sign: string, figure: string) => {
    const usdc = Number(figure.replace(/,/g, ''));
    if (!Number.isFinite(usdc)) return whole;
    const local = figureFor(usdc, currency, rates, locale, kept);
    return local ? `${sign}${local}` : whole;
  });
}
