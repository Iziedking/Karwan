/// A held delivery link is held on chain too (view 63, audit RT-09).
///
/// On the escrow family the contract knows nothing of Karwan's hold on a
/// flagged link, so once the buyer's review time runs out anyone could claim
/// the payment for the seller. Close to that time, while the link is still
/// held, Karwan uses the buyer's one request for more time, and if the link is
/// still held as that runs out, it opens the buyer's dispute. The claim is
/// refused while the deal is disputed. A person who clears the link first
/// leaves the chain alone.

import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DirectDeal } from '../db/deals.js';

export type HeldLinkStep =
  | { kind: 'none' }
  | { kind: 'wait' }
  | { kind: 'more-time'; revision: number }
  | { kind: 'dispute'; revision: number };

/// What was done for which delivery, kept on the deal.
export interface HeldLinkOnChain {
  revision: number;
  step: 'more-time' | 'dispute';
  at: number;
  txHash?: string;
}

/// The reason the buyer's dispute carries; its hash goes on chain.
export const HELD_LINK_DISPUTE_REASON = 'The delivery link is held by the safety check and no person has cleared it.';

/// How long before the seller could claim Karwan acts: a quarter of the
/// review window, at least 5 minutes and at most a day.
export function heldLinkLeadSecs(reviewWindowSecs: number): number {
  return Math.min(86_400, Math.max(300, Math.floor(reviewWindowSecs / 4)));
}

export function isHeldLink(deal: Pick<DirectDeal, 'verificationStatus'>): boolean {
  return deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious';
}

export function heldLinkStep(input: {
  deal: DirectDeal;
  view: DealV3View;
  /// `reviewEndOf` on the escrow: the review end with held time, 0 when not delivered.
  reviewEndSecs: bigint;
  nowMs: number;
  terms: { reviewWindow: number; silentLongstop: number; maxExtensions: number };
}): HeldLinkStep {
  const { deal, view, reviewEndSecs, nowMs, terms } = input;
  if (deal.escrowVersion !== 'suite' || deal.disputed || !isHeldLink(deal)) return { kind: 'none' };
  if (view.state !== DEAL_STATE.Accepted || view.deliveredAt === 0n) return { kind: 'none' };
  const revision = view.revision;
  const done = deal.heldLinkOnChain?.revision === revision ? deal.heldLinkOnChain : undefined;
  if (done?.step === 'dispute') return { kind: 'none' };

  const started = view.reviewStartAt !== 0n;
  const claimAt = started && reviewEndSecs > 0n ? reviewEndSecs : view.deliveredAt + BigInt(terms.silentLongstop);
  const nowSecs = BigInt(Math.floor(nowMs / 1000));
  if (nowSecs < claimAt - BigInt(heldLinkLeadSecs(terms.reviewWindow))) return { kind: 'wait' };

  const canAskMoreTime = started && !done && view.extUsed < terms.maxExtensions && nowSecs < claimAt;
  return canAskMoreTime ? { kind: 'more-time', revision } : { kind: 'dispute', revision };
}
