import type { Listing, ListingQuote } from '@/core/api';
import { fundingShortfall } from '@/features/deposit/fundingPlan';

/// Where an order stands on its review page (view 44, Figma 05 to 09).

export type OrderPhase = 'review' | 'short' | 'ready' | 'paying' | 'changed' | 'closed' | 'own';
export type OrderQuoteError = 'CLOSED' | 'CHANGED' | 'OWN';

export function orderPhase(input: {
  quote: ListingQuote | null;
  quoteError?: OrderQuoteError;
  spendableUsdc: number | null;
  busy: boolean;
}): OrderPhase {
  if (input.quoteError === 'CLOSED') return 'closed';
  if (input.quoteError === 'CHANGED') return 'changed';
  if (input.quoteError === 'OWN') return 'own';
  if (input.busy) return 'paying';
  if (!input.quote || input.spendableUsdc === null) return 'review';
  return fundingShortfall(Number(input.quote.youPayUsdc), input.spendableUsdc) > 0 ? 'short' : 'ready';
}

/// Paying draws on the person's own balance and their buying agent's.
export function spendableUsdc(money: { balance: number | null; buyer: number | null }): number | null {
  if (money.balance === null || money.buyer === null) return null;
  return Math.round((money.balance + money.buyer) * 1e6) / 1e6;
}

/// The part of the one balance this order cannot pay with, and where it is
/// (view 77). An email account pays from its own balance and its buying agent;
/// a wallet account from its buying agent. Null when the order can use it all.
export function payRest(
  money: { balance: number | null; pool: number; buyer: number | null; seller: number | null },
  circle: boolean,
): { amount: number; where: 'agents' | 'elsewhere' } | null {
  if (money.balance === null || money.buyer === null || money.seller === null) return null;
  const cents = (n: number) => Math.max(0, Math.floor(n * 100 + 1e-6));
  const own = cents(money.pool) + (circle ? 0 : cents(money.balance));
  const total = own + cents(money.seller);
  return total > 0 ? { amount: total / 100, where: own > 0 ? 'elsewhere' : 'agents' } : null;
}

/// What to add: the gap rounded up to the cent, so the top-up always covers it.
export function shortfallUsdc(youPay: string, spendable: number): string {
  return String(fundingShortfall(Number(youPay), spendable));
}

/// The gap as it is said beside the balance: exactly what you pay less what you
/// have. The rounded-up figure read ₦10 more than the two lines above it (11 Nov 2026).
export function shortByUsdc(youPay: string, spendable: number): string {
  const micros = Math.round(Number(youPay) * 1e6) - Math.round(spendable * 1e6);
  return String(Math.max(0, micros) / 1e6);
}

/// The deal a listing is sold as. It must equal the server's listingOrderTerms
/// (backend deals/listingOrder.ts), or the order is refused as changed.
export function orderTermsOf(listing: Listing): {
  dealAmountUsdc: number;
  deadlineDays: number;
  terms: string;
  firstReleasePct: number;
  milestonePcts: number[];
  reviewWindowDays?: number;
} {
  const pcts = listing.termsDraft?.parts.map((part) => part.pct).filter((pct) => pct > 0) ?? [];
  const milestonePcts = pcts.length && pcts.reduce((sum, pct) => sum + pct, 0) === 100 ? pcts : [100];
  const terms = listing.terms?.trim() || `${listing.title.trim()}\n\n${listing.description.trim()}`.trim();
  return {
    dealAmountUsdc: listing.askingPriceUsdc,
    deadlineDays: Math.max(1, listing.readyInDays ?? 1),
    terms: terms.slice(0, 4000),
    firstReleasePct: milestonePcts[0] ?? 100,
    milestonePcts,
    ...(listing.termsDraft?.reviewWindowDays ? { reviewWindowDays: listing.termsDraft.reviewWindowDays } : {}),
  };
}
