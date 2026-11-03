import { CATEGORY_NAMES, type CategoryId } from '../listings/categories.js';
import type { CategoryDemand } from './marketStore.js';
import { categoryOfRequest } from './marketStore.js';

/// find_customers (view 48, step 5): who might buy from a seller now. The
/// requests whose shortlist already names them, the open ones in categories
/// they serve that they have not offered on, and the categories rising this
/// week. Only what the public market shows goes out, never the buyer.

const OPEN_MAX = 8;

export interface CustomerRequest {
  jobId: string;
  briefText: string;
  budgetUsdc: string;
  deadlineUnix: number;
  postedAt: number;
  postedBy?: string;
  bidsCount: number;
  example?: boolean;
}

export interface CustomerRow {
  jobId: string;
  title: string;
  category: string | null;
  budgetUsdc: number;
  neededBy: string;
  offersSoFar: number;
}

function firstLine(text: string): string {
  return (text.split('\n').find((l) => l.trim()) ?? text).trim().slice(0, 120);
}

function row(r: CustomerRequest, category: CategoryId | null): CustomerRow {
  return {
    jobId: r.jobId,
    title: firstLine(r.briefText),
    category: category ? CATEGORY_NAMES[category] : null,
    budgetUsdc: Number(r.budgetUsdc),
    neededBy: new Date(r.deadlineUnix * 1000).toISOString().slice(0, 10),
    offersSoFar: r.bidsCount,
  };
}

export function findCustomers(input: {
  me: string;
  categories: ReadonlySet<CategoryId>;
  requests: readonly CustomerRequest[];
  fits: ReadonlySet<string>;
  offered: ReadonlySet<string>;
  rising: readonly CategoryDemand[];
}): { alreadyFit: CustomerRow[]; openInYourCategories: CustomerRow[]; rising: string[] } {
  const me = input.me.toLowerCase();
  const alreadyFit: CustomerRow[] = [];
  const open: Array<{ at: number; row: CustomerRow }> = [];
  for (const r of input.requests) {
    if (r.example || r.postedBy?.toLowerCase() === me) continue;
    const category = categoryOfRequest(r);
    if (input.fits.has(r.jobId)) {
      alreadyFit.push(row(r, category));
      continue;
    }
    if (!category || !input.categories.has(category) || input.offered.has(r.jobId)) continue;
    open.push({ at: r.postedAt, row: row(r, category) });
  }
  return {
    alreadyFit,
    openInYourCategories: open.sort((a, b) => b.at - a.at).slice(0, OPEN_MAX).map((o) => o.row),
    rising: input.rising.filter((c) => c.rising && input.categories.has(c.id)).map((c) => c.name),
  };
}
