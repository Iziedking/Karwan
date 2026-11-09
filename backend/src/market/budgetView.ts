import { bargainOn } from '../db/briefs.js';
import { budgetRange, type BudgetRange } from '../agents/budgetRange.js';

/// How a request's budget reads to whoever is looking (view 73, decision 11;
/// spec S2). On a request posted with bargaining on, everyone but its buyer
/// sees a range, 70 to 100 percent of the budget, and never the budget itself.
/// The buyer, and requests from before the switch, keep the exact figure.

export type ViewedBudget<T extends { budgetUsdc: unknown }> = Omit<T, 'budgetUsdc'> & { budgetUsdc?: T['budgetUsdc']; budgetRange?: BudgetRange | null };

export function forViewer<T extends { jobId: string; budgetUsdc: string | number }>(
  request: T,
  viewerIsBuyer: boolean,
  bargain: (jobId: string) => boolean = bargainOn,
): ViewedBudget<T> {
  if (viewerIsBuyer || !bargain(request.jobId)) return request as ViewedBudget<T>;
  const { budgetUsdc, ...rest } = request;
  return { ...rest, budgetRange: budgetRange(Number(budgetUsdc)) } as ViewedBudget<T>;
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
