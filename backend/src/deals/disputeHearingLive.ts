import type { StoredAgreementTerms } from '../chain/agreementTerms.js';
import { agreementEscrowAddress, readAgreementDispute } from '../chain/agreementEscrowLive.js';
import { config } from '../config.js';
import type { DirectDeal } from '../db/deals.js';
import { hearingView, type HearingView } from './disputeHearingView.js';
import { isHeldLink } from './heldLinkOnChain.js';

/// View 90: where an escrow family dispute stands, read from the escrow, for
/// the deal page and the assistant alike. Null while the hearing is off, off
/// the family, or when the read fails; callers then say it the plain way.
export async function familyHearing(deal: DirectDeal, now: number): Promise<HearingView | null> {
  if (!config.DISPUTE_HEARING_FAMILY || deal.escrowVersion !== 'suite' || !deal.escrowDealId || !agreementEscrowAddress) return null;
  try {
    const d = await readAgreementDispute(agreementEscrowAddress, deal.escrowDealId as `0x${string}`);
    return hearingView({
      dispute: { openedAt: BigInt(d.openedAt), proposed: d.proposed, escalated: d.escalated, proposedAt: BigInt(d.proposedAt), escalatedAt: BigInt(d.escalatedAt) },
      nowMs: now,
      statements: { buyer: !!deal.disputeStatements?.buyer, seller: !!deal.disputeStatements?.seller },
      finding: deal.judgeProposal ?? null,
      partialBps: (deal.escrowTerms as StoredAgreementTerms | undefined)?.partialBps ?? 0,
      linkHeld: isHeldLink(deal),
      windowMs: config.DISPUTE_STATEMENT_WINDOW_MS,
      deadlineMs: config.DISPUTE_FINDING_DEADLINE_MS,
    });
  } catch {
    return null;
  }
}
