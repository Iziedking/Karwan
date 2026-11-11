import { getBrief } from '../db/briefs.js';
import { getDeal } from '../db/deals.js';
import { getListing } from '../db/listings.js';
import { budgetInCents } from '../agents/budgetCents.js';
import type { LocalAmount } from './quote.js';
import type { KeptFigure } from './figure.js';

/// The amounts people typed on the records a message is about (view 77): a
/// request's budget, a deal's agreed price, an offer's asking price. A message
/// that says one of these amounts says it as it was typed.

interface Records {
  brief?: { budgetLocal?: LocalAmount } | null;
  deal?: { dealAmountUsdc: string; agreedLocal?: LocalAmount } | null;
  listing?: { askingPriceUsdc: number; askingLocal?: LocalAmount } | null;
}

export function keptFiguresOf(records: Records): KeptFigure[] {
  const kept: KeptFigure[] = [];
  const budget = records.brief?.budgetLocal;
  // A budget is the said figure at its rate, in whole cents, rounded down.
  if (budget) kept.push({ usdc: budgetInCents(Number(budget.amount) / budget.rate), local: budget });
  if (records.deal?.agreedLocal) kept.push({ usdc: Number(records.deal.dealAmountUsdc), local: records.deal.agreedLocal });
  if (records.listing?.askingLocal) kept.push({ usdc: records.listing.askingPriceUsdc, local: records.listing.askingLocal });
  return kept.filter((k) => Number.isFinite(k.usdc) && k.usdc > 0);
}

/// The kept figures behind an event. A record that cannot be read keeps
/// nothing, and the message reads at the shared rate.
export async function keptFiguresFor(ids: { jobId?: string; listingId?: string }): Promise<KeptFigure[]> {
  try {
    return keptFiguresOf({
      brief: ids.jobId ? getBrief(ids.jobId) : null,
      deal: ids.jobId ? await getDeal(ids.jobId).catch(() => null) : null,
      listing: ids.listingId ? getListing(ids.listingId) : null,
    });
  } catch {
    return [];
  }
}
