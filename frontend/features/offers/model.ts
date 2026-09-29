import { formatUnits, parseUnits } from 'viem';
import type { OffersCopy } from '@/shared/i18n/messages/offers';

export type Offer = {
  id: string;
  jobId: string;
  sellerUser: string;
  priceUsdc: string;
  deliverByUnix: number;
  note: string;
  state: string;
  createdAt: number;
  lapsesAt: number;
  /// Buyer view only: what accepting takes from the wallet, fee included.
  fundedUsdc?: string;
};

export function offerDefaults(budgetUsdc: string, deadlineUnix: number) {
  return { priceUsdc: budgetUsdc, deliverByDate: new Date(deadlineUnix * 1000).toISOString().slice(0, 10) };
}

/// A date picked in the sheet means the end of that day.
export function deliverByUnixFromDate(date: string): number {
  return Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
}

type ErrorKey = keyof OffersCopy['errors'];

const ERRORS: Record<string, ErrorKey> = {
  OWN_REQUEST: 'ownRequest',
  REQUEST_CLOSED: 'closed',
  'job-not-open': 'closed',
  NO_REQUEST: 'closed',
  BAD_PRICE: 'price',
  PRICE_TOO_HIGH: 'priceHigh',
  DATE_PAST: 'datePast',
  DATE_TOO_LATE: 'dateLate',
  NOTE_TOO_LONG: 'noteLong',
  NEEDS_ACTIVATION: 'activate',
  LAPSED: 'lapsed',
  INSUFFICIENT_AGENT_BALANCE: 'topUp',
  ALREADY_BIDDING: 'alreadyBidding',
  BUSY: 'busy',
  ALREADY_MATCHED: 'matched',
  CONFLICT: 'matched',
};

export function offerErrorKey(code: string): ErrorKey {
  return ERRORS[code] ?? 'generic';
}

const micros = (v: string) => parseUnits(v, 6);

/// Native-USDC reads can have 18 decimals. Subtract before rounding to cents.
export function topUpAmount({ needUsdc, agentUsdc }: { needUsdc: string; agentUsdc: number }): number {
  const balance = agentUsdc.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 });
  const missing = parseUnits(needUsdc, 18) - parseUnits(balance, 18);
  if (missing <= 0n) return 0;
  const cent = 10n ** 16n;
  const cents = (missing + cent - 1n) / cent;
  return Number(cents) / 100;
}

/// The agent's pick first, then the cheapest, then whoever offered first.
export function orderOffers(offers: Offer[], pickSeller?: string): Offer[] {
  return [...offers].sort((a, b) => {
    if (pickSeller) {
      if (a.sellerUser === pickSeller && b.sellerUser !== pickSeller) return -1;
      if (b.sellerUser === pickSeller && a.sellerUser !== pickSeller) return 1;
    }
    const d = micros(a.priceUsdc) - micros(b.priceUsdc);
    if (d !== 0n) return d < 0n ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

export function budgetDifference(priceUsdc: string, budgetUsdc: string): string | null {
  const diff = micros(priceUsdc) - micros(budgetUsdc);
  return diff > 0n ? formatUnits(diff, 6) : null;
}
