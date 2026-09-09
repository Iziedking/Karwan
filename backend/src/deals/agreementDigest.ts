import { createHash } from 'node:crypto';

/// Canonical commercial terms used for version-bound consent. This deliberately
/// includes the parties and every field that can change the economic or review
/// obligation, while excluding operational state such as delivery and payout
/// receipts.
export interface AgreementDigestInput {
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  firstReleasePct: number;
  milestonePcts?: number[];
  deadlineUnix?: number;
  acceptanceDeadlineUnix?: number;
  terms: string;
  requireStake?: boolean;
  evidenceRequired?: boolean;
  requireStakePct?: number;
  tradeType?: string;
  tradeLane?: string;
  incoterms?: string;
  paymentTerms?: string;
  counterpartyCompany?: unknown;
  documentRefs?: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function agreementDigest(input: AgreementDigestInput): string {
  const canonical = canonicalize({
    buyer: input.buyer.toLowerCase(),
    seller: input.seller.toLowerCase(),
    dealAmountUsdc: input.dealAmountUsdc,
    firstReleasePct: input.firstReleasePct,
    milestonePcts: input.milestonePcts ?? [input.firstReleasePct, 100 - input.firstReleasePct],
    deadlineUnix: input.deadlineUnix ?? null,
    acceptanceDeadlineUnix: input.acceptanceDeadlineUnix ?? null,
    terms: input.terms,
    requireStake: input.requireStake ?? false,
    // Preserve historical optional-evidence digests; required checks are consent.
    ...(input.evidenceRequired ? { evidenceRequired: true } : {}),
    requireStakePct: input.requireStakePct ?? null,
    tradeType: input.tradeType ?? null,
    tradeLane: input.tradeLane ?? null,
    incoterms: input.incoterms ?? null,
    paymentTerms: input.paymentTerms ?? null,
    counterpartyCompany: input.counterpartyCompany ?? null,
    documentRefs: input.documentRefs ?? null,
  });
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
