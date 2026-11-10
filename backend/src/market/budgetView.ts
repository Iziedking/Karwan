import { bargainOn, getBrief } from '../db/briefs.js';
import type { LocalAmount } from '../rates/quote.js';
import { budgetRange, type BudgetRange } from '../agents/budgetRange.js';

/// How a request's budget reads to whoever is looking (view 73, decision 11;
/// spec S2). On a request posted with bargaining on, everyone but its buyer
/// sees a range, 70 to 100 percent of the budget, and never the budget itself.
/// The buyer, and requests from before the switch, keep the exact figure, and
/// with it the figure the buyer said in their own currency (view 55).

export type ViewedBudget<T extends { budgetUsdc: unknown }> = Omit<T, 'budgetUsdc'> & { budgetUsdc?: T['budgetUsdc']; budgetRange?: BudgetRange | null; budgetLocal?: LocalAmount };

export function forViewer<T extends { jobId: string; budgetUsdc: string | number }>(
  request: T,
  viewerIsBuyer: boolean,
  bargain: (jobId: string) => boolean = bargainOn,
  saidOf: (jobId: string) => LocalAmount | undefined = (jobId) => getBrief(jobId)?.budgetLocal,
): ViewedBudget<T> {
  if (viewerIsBuyer || !bargain(request.jobId)) {
    const budgetLocal = saidOf(request.jobId);
    return (budgetLocal ? { ...request, budgetLocal } : request) as ViewedBudget<T>;
  }
  const { budgetUsdc, budgetLocal: _said, ...rest } = request as T & { budgetLocal?: LocalAmount };
  return { ...rest, budgetRange: budgetRange(Number(budgetUsdc)) } as unknown as ViewedBudget<T>;
}

/// A buyer's own requests, each with the figure they said (view 55).
export function withSaidBudgets<T extends { jobId: string }>(
  requests: readonly T[],
  saidOf: (jobId: string) => LocalAmount | undefined = (jobId) => getBrief(jobId)?.budgetLocal,
): Array<T & { budgetLocal?: LocalAmount }> {
  return requests.map((r) => {
    const budgetLocal = saidOf(r.jobId);
    return budgetLocal ? { ...r, budgetLocal } : r;
  });
}

/// The budget in words for a seller: the range when bargaining is on.
export function budgetWords(
  jobId: string,
  budgetUsdc: number,
  money: (usdc: number) => Promise<string>,
  bargain: (jobId: string) => boolean = bargainOn,
): Promise<string> {
  if (!bargain(jobId)) return money(budgetUsdc).then((m) => `about ${m}`);
  const r = budgetRange(budgetUsdc);
  if (!r) return Promise.resolve('no budget said');
  return Promise.all([money(r.lowUsdc), money(r.highUsdc)]).then(([low, high]) => `${low} to ${high}`);
}
