import type { FundingQuote } from '@/core/api';

export interface RequestFunding {
  balance: number;
  /// The most the buying agent can spend on this request: the price limit,
  /// the buyer's half of the fee, and the reserve kept for network costs.
  canSpend: number;
  parts: { price: number; fee: number; reserve: number } | null;
  topUp: number;
  enough: boolean;
}

/// The funding quote, read for the request review. Null when there is no
/// usable quote; the server still checks the balance when the request posts.
export function requestFunding(quote: FundingQuote | undefined): RequestFunding | null {
  if (!quote) return null;
  const balance = Number(quote.balanceUsdc);
  const canSpend = Number(quote.requiredUsdc);
  const topUp = Number(quote.topUpNeededUsdc);
  if (![balance, canSpend, topUp].every(Number.isFinite)) return null;
  const price = Number(quote.priceUsdc);
  const fee = Number(quote.buyerFeeUsdc);
  const reserve = Number(quote.reserveUsdc);
  const parts =
    quote.priceUsdc !== undefined && [price, fee, reserve].every(Number.isFinite) ? { price, fee, reserve } : null;
  return { balance, canSpend, parts, topUp, enough: topUp <= 0 };
}
