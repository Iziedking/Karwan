import type { DirectDeal } from '../db/deals.js';

/// Money in the escrow family that the selling agent never accepted: the
/// accept failed, or the seller had no record yet. While the escrow still
/// allows an accept, the watcher retries it; once it cannot, the money goes
/// back to the buyer. Nobody has to notice for the deal to move.
export const ACTIVATION_RETRY_MS = 30 * 60_000;

export type UnacceptedStep = 'activate' | 'refund' | null;

type Deal = Pick<DirectDeal, 'escrowVersion' | 'escrowDealId' | 'escrowTerms' | 'acceptedAt' | 'cancelledAt' | 'activationRetriedAt'>;

export function unacceptedStep(deal: Deal, fundedOnChain: boolean, now: number): UnacceptedStep {
  if (deal.escrowVersion !== 'suite' || !deal.escrowDealId || deal.acceptedAt || deal.cancelledAt || !fundedOnChain) return null;
  const acceptBy = (deal.escrowTerms as { acceptBy?: string } | undefined)?.acceptBy;
  if (!acceptBy) return null;
  // The contract refuses an accept after acceptBy, so from then on only a refund moves the money.
  if (now > Number(acceptBy) * 1000) return 'refund';
  if (deal.activationRetriedAt && now - deal.activationRetriedAt < ACTIVATION_RETRY_MS) return null;
  return 'activate';
}
