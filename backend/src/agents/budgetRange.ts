import type { JobContext } from '../llm/prompts.js';

/// The budget as sellers see it (view 73, decision 11; spec S2, S3): 70 to
/// 100 percent of it, rounded to two significant figures, the low down and the
/// high up. The exact budget never reaches the seller's side.

export interface BudgetRange {
  lowUsdc: number;
  highUsdc: number;
}

const LOW_SHARE = 0.7;
const EPSILON = 1e-9;

function twoFigures(n: number, direction: 'down' | 'up'): number {
  const scale = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  const units = direction === 'down' ? Math.floor(n / scale + EPSILON) : Math.ceil(n / scale - EPSILON);
  return Number((units * scale).toPrecision(12));
}

export function budgetRange(budgetUsdc: number): BudgetRange | null {
  if (!(budgetUsdc > 0) || !Number.isFinite(budgetUsdc)) return null;
  return { lowUsdc: twoFigures(budgetUsdc * LOW_SHARE, 'down'), highUsdc: twoFigures(budgetUsdc, 'up') };
}

/// The request as the seller's side may read it: the range, never the budget.
export interface SellerSideRequest {
  jobId: string;
  range: BudgetRange | null;
  deadlineUnix: number;
  keywords: string[];
  briefText?: string;
  quantity?: { count: number; unit: string | null } | null;
}

export function toSellerSide(job: JobContext): SellerSideRequest {
  return {
    jobId: job.jobId,
    range: budgetRange(Number(job.budgetUsdc)),
    deadlineUnix: job.deadlineUnix,
    keywords: job.keywords ?? [],
    ...(job.briefText !== undefined ? { briefText: job.briefText } : {}),
    ...(job.quantity !== undefined ? { quantity: job.quantity } : {}),
  };
}
