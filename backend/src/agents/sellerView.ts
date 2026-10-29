import type { JobContext } from '../llm/prompts.js';

/// What a seller's agent is told about a request (view 35): the request, its
/// budget and the buyer's trust settings. Never the buyer's leeway, how far
/// above the budget they would go: that is their private limit, and a seller
/// who knows it prices up to it. Karwan's own checks (the near match, Trusted
/// Match's stake) read the leeway from the request record, not from here.
export function sellerViewOfRequest(input: {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  keywords: string[];
  brief?: {
    briefText?: string;
    quantity?: { count: number; unit: string | null } | null;
    trustedMatch?: boolean;
    tradeLane?: 'service' | 'finance';
    counterpartyCompany?: { sector?: string; region?: string };
  };
}): JobContext {
  return {
    jobId: input.jobId,
    buyer: input.buyer,
    budgetUsdc: input.budgetUsdc,
    deadlineUnix: input.deadlineUnix,
    termsHash: input.termsHash,
    buyerReputationBps: 5000,
    briefText: input.brief?.briefText,
    quantity: input.brief?.quantity ?? null,
    keywords: input.keywords,
    trustedMatch: input.brief?.trustedMatch === true,
    tradeLane: input.brief?.tradeLane ?? 'service',
    sourcingSector: input.brief?.counterpartyCompany?.sector,
    sourcingRegion: input.brief?.counterpartyCompany?.region,
  };
}
