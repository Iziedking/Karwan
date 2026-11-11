import { getBrief } from '../db/briefs.js';
import { getDeal } from '../db/deals.js';
import { getListing } from '../db/listings.js';
import { budgetInCents } from '../agents/budgetCents.js';
import type { LocalAmount } from './quote.js';
import type { KeptFigure } from './figure.js';
import { listMoneyMovementsForJob } from '../db/moneyMovements.js';
import type { MoneyMovement } from '../money/model.js';
import { figureForViewer } from '../money/worth.js';

/// The amounts people typed on the records a message is about (view 77): a
/// request's budget, a deal's agreed price, an offer's asking price. A message
/// that says one of these amounts says it as it was typed.

interface Records {
  brief?: { budgetLocal?: LocalAmount } | null;
  deal?: { dealAmountUsdc: string; agreedLocal?: LocalAmount; settledWorth?: Record<string, LocalAmount> } | null;
  /// Payments already made on the deal, and who is reading (view 77).
  movements?: readonly MoneyMovement[];
  viewer?: string;
  listing?: { askingPriceUsdc: number; askingLocal?: LocalAmount } | null;
}

export function keptFiguresOf(records: Records): KeptFigure[] {
  const kept: KeptFigure[] = [];
  const budget = records.brief?.budgetLocal;
  // A budget is the said figure at its rate, in whole cents, rounded down.
  if (budget) kept.push({ usdc: budgetInCents(Number(budget.amount) / budget.rate), local: budget });
  if (records.deal?.agreedLocal) kept.push({ usdc: Number(records.deal.dealAmountUsdc), local: records.deal.agreedLocal });
  if (records.listing?.askingLocal) kept.push({ usdc: records.listing.askingPriceUsdc, local: records.listing.askingLocal });
  // Paid stays paid: what a payment, or the settled deal, was worth to this
  // reader when it happened. Typed figures above come first.
  const viewer = records.viewer?.toLowerCase();
  const settled = viewer ? records.deal?.settledWorth?.[viewer] : undefined;
  if (records.deal && settled) kept.push({ usdc: Number(records.deal.dealAmountUsdc), local: settled });
  for (const movement of records.movements ?? []) {
    if (movement.state !== 'completed') continue;
    const figure = figureForViewer(movement, viewer);
    if (figure) kept.push({ usdc: Number(movement.amountMicros) / 1_000_000, local: figure });
  }
  return kept.filter((k) => Number.isFinite(k.usdc) && k.usdc > 0);
}

/// The kept figures behind an event. A record that cannot be read keeps
/// nothing, and the message reads at the shared rate.
export async function keptFiguresFor(ids: { jobId?: string; listingId?: string; viewer?: string }): Promise<KeptFigure[]> {
  try {
    return keptFiguresOf({
      brief: ids.jobId ? getBrief(ids.jobId) : null,
      deal: ids.jobId ? await getDeal(ids.jobId).catch(() => null) : null,
      movements: ids.jobId && ids.viewer ? await listMoneyMovementsForJob(ids.jobId).catch(() => []) : [],
      ...(ids.viewer ? { viewer: ids.viewer } : {}),
      listing: ids.listingId ? getListing(ids.listingId) : null,
    });
  } catch {
    return [];
  }
}
