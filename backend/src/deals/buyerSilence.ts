import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DirectDeal } from '../db/deals.js';

/// No payment goes to a seller only because review time ran out (owner, 24 Oct
/// 2026; view 27 decision 7). On the escrow family, when review ends with the
/// buyer silent, the seller is asked first; 24 hours later their selling agent
/// raises it. The dispute then gives the buyer the contract's 72 hours to answer
/// (agents/suiteDisputeWatcher.ts). Karwan never sends the contract's claim.

export const AGENT_RAISES_AFTER_MS = 24 * 3_600_000;
export const BUYER_SILENT_REASON = 'the buyer did not respond after the review period';

export type SilenceStep = 'none' | 'prompt' | 'agent-raise';

export function silenceStep(input: { deal: DirectDeal; view: DealV3View; reviewEndSecs: bigint; nowMs: number }): SilenceStep {
  const { deal, view, reviewEndSecs, nowMs } = input;
  if (deal.escrowVersion !== 'suite' || deal.disputed) return 'none';
  if (view.state !== DEAL_STATE.Accepted || view.deliveredAt === 0n) return 'none';
  // A failed check on this delivery is the buyer's case, not silence.
  if (deal.v3CheckFailedRevision === view.revision) return 'none';
  if (reviewEndSecs === 0n || BigInt(Math.floor(nowMs / 1000)) < reviewEndSecs) return 'none';
  const s = deal.buyerSilence;
  if (!s || s.revision !== view.revision || s.paid !== view.paid) return 'prompt';
  if (s.raisedAt) return 'none';
  return nowMs >= s.promptedAt + AGENT_RAISES_AFTER_MS ? 'agent-raise' : 'none';
}

/// When the buyer's review time ends, in ms; null once it has. A review that has
/// not started yet never ends, so the seller cannot ask before it does.
export function reviewOpenUntil(reviewEndSecs: bigint, nowMs: number): number | null {
  if (reviewEndSecs === 0n) return Number.POSITIVE_INFINITY;
  const endMs = Number(reviewEndSecs) * 1000;
  return nowMs < endMs ? endMs : null;
}

/// The buyer's answer window on a buyer-silence dispute: the contract's 72 hours
/// from the proposal, which follows the dispute within a watcher tick.
export const BUYER_ANSWER_MS = 72 * 3_600_000;

export interface BuyerSilenceDeps {
  readView(deal: DirectDeal): Promise<DealV3View>;
  readReviewEnd(deal: DirectDeal): Promise<bigint>;
  /// The selling agent disputes the delivered payment.
  raise(deal: DirectDeal): Promise<void>;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<unknown>;
  emit(e: { type: 'deal.buyer_silent'; jobId: string; actor: 'platform'; payload: Record<string, unknown> }): void;
}

export async function runBuyerSilence(deps: BuyerSilenceDeps, deal: DirectDeal, nowMs: number): Promise<SilenceStep> {
  const [view, reviewEndSecs] = await Promise.all([deps.readView(deal), deps.readReviewEnd(deal)]);
  const step = silenceStep({ deal, view, reviewEndSecs, nowMs });
  const parties = { buyer: deal.buyer, seller: deal.seller };
  if (step === 'prompt') {
    await deps.patchDeal(deal.jobId, { buyerSilence: { revision: view.revision, paid: view.paid, promptedAt: nowMs } });
    deps.emit({ type: 'deal.buyer_silent', jobId: deal.jobId, actor: 'platform', payload: { ...parties, stage: 'prompt', agentRaisesAt: nowMs + AGENT_RAISES_AFTER_MS } });
  } else if (step === 'agent-raise') {
    await deps.raise(deal);
    await deps.patchDeal(deal.jobId, {
      disputed: true,
      disputedAt: nowMs,
      disputedBy: 'seller',
      disputeKind: 'buyer-silent',
      buyerSilence: { ...deal.buyerSilence!, raisedAt: nowMs, raisedBy: 'agent' },
    });
    deps.emit({ type: 'deal.buyer_silent', jobId: deal.jobId, actor: 'platform', payload: { ...parties, stage: 'raised', by: 'agent' } });
  }
  return step;
}
