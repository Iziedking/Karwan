import { logger } from '../logger.js';

/// The negotiation measures from day one (view 41, measures 6): deals agreed,
/// exchanges per deal, the agreed price against the usual price, and the one
/// that must stay at zero: an agreement outside a side's mandate. Kept in
/// memory and read on the admin health page; reviewed after two weeks on
/// testnet before any step size changes.

export interface Agreement {
  jobId: string;
  side: 'seller' | 'buyer';
  agreedUsdc: number;
  /// The seller's lowest for the order, when the seller side agreed.
  floorUsdc?: number;
  /// The buyer's most, budget plus leeway, when the buyer side agreed.
  capUsdc?: number;
  usualUsdc?: number;
  exchanges: number;
  at: number;
}

export interface NegotiationSummary {
  deals: number;
  outsideMandate: number;
  exchangesAvg: number | null;
  /// Mean of agreed divided by usual, over deals with a usual price.
  agreedVsUsual: number | null;
  recent: Array<{ jobId: string; side: 'seller' | 'buyer'; agreedUsdc: number; exchanges: number; outsideMandate: boolean }>;
}

const KEEP = 500;
const agreements: Agreement[] = [];

/// A seller never agrees under their floor; a buyer never over their cap.
export function outsideMandate(a: Agreement): boolean {
  if (a.side === 'seller') return a.floorUsdc !== undefined && a.agreedUsdc < a.floorUsdc - 0.005;
  return a.capUsdc !== undefined && a.agreedUsdc > a.capUsdc + 0.005;
}

export function recordAgreement(a: Agreement): void {
  agreements.push(a);
  if (agreements.length > KEEP) agreements.shift();
  if (outsideMandate(a)) logger.error({ ...a }, 'agreement outside the mandate: this must never happen');
}

export function summarise(all: readonly Agreement[]): NegotiationSummary {
  const withUsual = all.filter((a) => a.usualUsdc && a.usualUsdc > 0);
  return {
    deals: all.length,
    outsideMandate: all.filter(outsideMandate).length,
    exchangesAvg: all.length ? Number((all.reduce((s, a) => s + a.exchanges, 0) / all.length).toFixed(2)) : null,
    agreedVsUsual: withUsual.length ? Number((withUsual.reduce((s, a) => s + a.agreedUsdc / a.usualUsdc!, 0) / withUsual.length).toFixed(3)) : null,
    recent: all.slice(-10).map((a) => ({ jobId: a.jobId, side: a.side, agreedUsdc: a.agreedUsdc, exchanges: a.exchanges, outsideMandate: outsideMandate(a) })),
  };
}

export function negotiationSummary(): NegotiationSummary {
  return summarise(agreements);
}

/// Tests only.
export function resetNegotiationMeasures(): void {
  agreements.length = 0;
}
