import type { UserProfile } from '../db/profiles.js';
import type { DirectDeal } from '../db/deals.js';

/** Deliberately exclude registration documents, invite tokens and proof material. */
export function workspaceContext(profile: UserProfile | null, owner: string) {
  if (!profile || profile.address.toLowerCase() !== owner.toLowerCase()) return { profile: null };
  return {
    workspaces: (profile.workspaces ?? []).filter((workspace) => workspace.ownerAddress.toLowerCase() === owner.toLowerCase())
      .slice(0, 10).map((workspace) => ({
        id: workspace.id, kind: workspace.kind, name: workspace.name,
        status: workspace.status, verificationStatus: workspace.business?.verificationStatus ?? null,
        updatedAt: workspace.updatedAt,
      })),
    businessReviewStatus: profile.business?.status ?? 'none',
    route: '/profile/business',
    note: 'Stored account records only. A business name is not verification. No active browser workspace was supplied; do not assume one or switch it. Legacy accounts may have business details without stored workspace rows. Open Business to complete setup or check review details.',
  };
}

export function dealProtectionContext(deal: DirectDeal, viewer: string, now = Date.now()) {
  if (![deal.buyer, deal.seller].some((party) => party.toLowerCase() === viewer.toLowerCase())) {
    return { error: 'This deal is unavailable to this account.' };
  }
  const partyState = (role: 'buyer' | 'seller') => {
    const party = deal.highSignalVerification?.[role];
    return party ? { recordedStatus: party.status, verifiedAt: party.verifiedAt, environment: party.environment } : null;
  };
  return {
    source: 'stored_deal_snapshot', readAt: now, updatedAt: deal.updatedAt,
    verificationPolicy: deal.verificationPolicy ?? 'standard',
    verificationSubject: deal.verificationSubject ?? null,
    world: { buyer: partyState('buyer'), seller: partyState('seller') },
    evidence: {
      required: deal.evidenceRequired === true, deliveryRevision: deal.deliveryRevision ?? null,
      requestRecorded: !!deal.creDeliveryRequest,
      receipt: deal.creEvidenceReceipt ? {
        termsVersion: deal.creEvidenceReceipt.termsVersion,
        evidenceRevision: deal.creEvidenceReceipt.evidenceRevision,
        expiresAt: deal.creEvidenceReceipt.expiresAt,
        boundAt: deal.creEvidenceReceipt.boundAt,
      } : null,
    },
    releaseBlockedReason: deal.releaseBlockedReason ?? null,
    disputed: deal.disputed === true,
    deadlineUnix: deal.deadlineUnix ?? null, deadlineAlertedAt: deal.deadlineAlertedAt ?? null,
    delayAppealRaisedAt: deal.delayAppealRaisedAt ?? null,
    nextStepRoute: `/deals/${deal.jobId}#action`,
    note: 'Recorded World/CRE state is not a fresh verification or current eligibility decision. The deal page rechecks agreement, environment, receipt validity and contract gates before action. No refund eligibility, live timer, balance or payment completion can be inferred from this snapshot alone.',
  };
}
