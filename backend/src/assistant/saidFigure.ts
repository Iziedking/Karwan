import { currencyDigits, makeQuote } from '../rates/quote.js';
import type { LocalCurrency, UsdcRates } from '../rates/usdcRates.js';
import { readSharedRates } from '../rates/sharedRate.js';

/// A figure said to the assistant in the person's own currency (view 77): the
/// quote that fixes its USDC, and the figure as its card reads. The card
/// carries the quote, so the record made on Confirm keeps the figure as said,
/// from the website and from Telegram alike.

export interface Said {
  usdc: number;
  /// "₦50,000".
  text: string;
  quote: string;
}

/// How long a card holds the figure said. The card's USDC is fixed when it is
/// drawn, so this only decides whether the figure is kept.
export const CARD_QUOTE_MS = 30 * 60_000;

type SaidOptions = { said?: { currency: LocalCurrency; amounts: Record<string, number> } } | undefined;

/// Null when the figure was given in USDC, or no rate is held.
export async function saidFigure(
  options: unknown,
  field: string,
  deps: { rates?: () => Promise<UsdcRates>; now?: () => number; secret?: string } = {},
): Promise<Said | null> {
  const said = (options as SaidOptions)?.said;
  const amount = said?.amounts[field];
  if (!said || typeof amount !== 'number') return null;
  const rates = await (deps.rates ?? readSharedRates)().catch(() => null);
  const quote = rates ? makeQuote(said.currency, String(amount), rates, (deps.now ?? Date.now)(), deps.secret, CARD_QUOTE_MS) : null;
  if (!quote) return null;
  const text = new Intl.NumberFormat('en', { style: 'currency', currency: said.currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: currencyDigits(said.currency) }).format(Number(quote.amount));
  return { usdc: Number(quote.usdcMicros) / 1_000_000, text, quote: quote.token };
}

/// The card with the figure as said: the named rows read it, and the payload
/// carries its quote for the record.
export function keepOnCard<T extends { fields?: Array<{ label: string; value: string }>; payload: object }>(card: T, said: Said | null, labels: readonly string[]): T {
  if (!said) return card;
  return {
    ...card,
    ...(card.fields ? { fields: card.fields.map((f) => (labels.includes(f.label) ? { ...f, value: said.text } : f)) } : {}),
    payload: { ...card.payload, quote: said.quote },
  } as T;
}
