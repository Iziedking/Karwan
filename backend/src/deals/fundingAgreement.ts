import { agreementDigest, type AgreementDigestInput } from './agreementDigest.js';
import { termsDigest } from './termsDigest.js';

export interface FundingAgreementDeal extends AgreementDigestInput {
  agreementVersion?: number;
  sellerApprovedAt?: number;
  sellerApprovedAgreementVersion?: number;
  sellerApprovedAgreementDigest?: string;
  /// Approvals recorded before agreement versions existed bound only the terms text.
  sellerApprovedTermsDigest?: string;
}

export type FundingAgreementBlock =
  | { code: 'STALE_AGREEMENT' }
  | { code: 'AGREEMENT_CHANGED'; agreementVersion: number; agreementDigest: string };

/// Whether a buyer may fund these exact terms right now. Both sides must have
/// consented to the same version: the seller's approval and the buyer's
/// reviewed digest are each checked against the latest agreement. A counter
/// that keeps the amount but moves the split, the evidence check or the
/// deadlines leaves the funding quote untouched, so the quote alone cannot
/// prove the buyer saw these terms (audit 2026-09-19, HIGH-2).
export function fundingAgreementBlock(
  deal: FundingAgreementDeal,
  buyerReviewed: { version: number; digest: string },
): FundingAgreementBlock | null {
  const version = deal.agreementVersion ?? 1;
  const digest = agreementDigest(deal);
  const approvalMatches =
    deal.sellerApprovedAgreementVersion === version && deal.sellerApprovedAgreementDigest === digest;
  const legacyApprovalMatches =
    !deal.sellerApprovedAgreementVersion
    && !!deal.sellerApprovedTermsDigest
    && deal.sellerApprovedTermsDigest === termsDigest(deal.terms);
  if (!deal.sellerApprovedAt || (!approvalMatches && !legacyApprovalMatches)) {
    return { code: 'STALE_AGREEMENT' };
  }
  if (buyerReviewed.version !== version || buyerReviewed.digest !== digest) {
    return { code: 'AGREEMENT_CHANGED', agreementVersion: version, agreementDigest: digest };
  }
  return null;
}
