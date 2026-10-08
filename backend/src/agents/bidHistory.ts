/// A request's offers rebuilt from its event history. The buyer agent holds
/// offers in memory, so a backend restart used to leave a live request with
/// none: the page showed 0 offers and a reopened request had nothing to
/// choose from, while the sellers had already bid and would not bid again.

import { getAddress, isAddress, parseUnits } from 'viem';

export interface RestoredBid {
  seller: `0x${string}`;
  priceUsdc: string;
  priceWei: bigint;
  deadlineUnix: number;
  score?: number;
  suggestedCounterPrice?: string;
  suggestedCounterDeadlineDays?: number;
  sellerTier?: string;
  pattern?: string;
  topicalMatch?: number;
}

type HistoryEvent = { type: string; ts: number; payload?: Record<string, unknown> };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

export function bidsFromHistory(events: readonly HistoryEvent[]): RestoredBid[] {
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const bids = new Map<string, RestoredBid>();
  for (const e of ordered) {
    const p = e.payload ?? {};
    const raw = str(p.seller);
    if (!raw || !isAddress(raw, { strict: false })) continue;
    const seller = getAddress(raw);
    if (e.type === 'bid.submitted') {
      const price = str(p.priceUsdc);
      const deadline = num(p.deadlineUnix);
      if (!price || deadline === undefined || !/^\d+(\.\d{1,6})?$/.test(price)) continue;
      bids.set(seller, { seller, priceUsdc: price, priceWei: parseUnits(price, 6), deadlineUnix: deadline });
    } else if (e.type === 'bid.scored') {
      const bid = bids.get(seller);
      if (!bid) continue;
      bid.score = num(p.score) ?? bid.score;
      bid.suggestedCounterPrice = str(p.suggestedCounterPrice) ?? bid.suggestedCounterPrice;
      bid.suggestedCounterDeadlineDays = num(p.suggestedCounterDeadlineDays) ?? bid.suggestedCounterDeadlineDays;
      bid.sellerTier = str(p.tier) ?? bid.sellerTier;
      bid.pattern = str(p.pattern) ?? bid.pattern;
      bid.topicalMatch = num(p.topicalMatch) ?? bid.topicalMatch;
    }
  }
  return [...bids.values()];
}
