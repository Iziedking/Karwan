import { keccak256, toBytes } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import { ESCROW_ACCEPTED, ESCROW_DISPUTED } from '../chain/settlement.js';
import { deadlineRuleAction } from './deadlineRule.js';

/// v2 escrow states the runner acts on (Accepted 2, Disputed 4 in chain/contracts.ts).
export const STATE = { accepted: ESCROW_ACCEPTED, disputed: ESCROW_DISPUTED } as const;

export interface DeadlineRuleDeps {
  readState(jobId: string): Promise<number>;
  openDispute(jobId: string, buyerWalletId: string, reason: string): Promise<string>;
  resolveRefund(jobId: string, reason: string): Promise<string>;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<unknown>;
  emit(event: { type: string; jobId: string; actor: 'platform'; payload: Record<string, unknown> }): void;
  sellerRespondedAfterDispute(deal: DirectDeal): Promise<boolean>;
}

/// Carries out the deadline rule for one v2 deal. Reads the chain first, so a
/// deal someone already settled is never acted on, and only marks the deal
/// settled after the resolve wrapper has verified the chain.
export async function runDeadlineRule(
  deal: DirectDeal,
  now: number,
  deps: DeadlineRuleDeps,
  settings: { graceMs: number; statementWindowMs: number },
): Promise<'none' | 'refunded' | 'escalated' | 'blocked'> {
  const responded = deal.disputed && deal.disputedBy === 'buyer' ? await deps.sellerRespondedAfterDispute(deal) : false;
  const action = deadlineRuleAction(deal, { now, ...settings, sellerRespondedAfterDispute: responded });
  if (action.kind === 'none') return 'none';

  const state = await deps.readState(deal.jobId);
  if (state !== STATE.accepted && state !== STATE.disputed) return 'none';

  const parties = { buyer: deal.buyer, seller: deal.seller };
  const flagArbiter = async (reason: string) => {
    await deps.patchDeal(deal.jobId, { deadlineRuleAt: now, disputeTimeoutAlertedAt: now });
    deps.emit({ type: 'deal.dispute.needs_arbiter', jobId: deal.jobId, actor: 'platform', payload: { ...parties, reason } });
  };

  if (state === STATE.accepted) {
    if (!deal.buyerAgentWalletId) {
      await flagArbiter(`${action.reason}; no buyer agent wallet to open the dispute`);
      return 'blocked';
    }
    await deps.openDispute(deal.jobId, deal.buyerAgentWalletId, action.reason);
    await deps.patchDeal(deal.jobId, { disputed: true, disputedAt: now, disputedBy: 'buyer' });
  }

  if (action.kind === 'arbiter') {
    await flagArbiter(action.reason);
    return 'escalated';
  }

  const txHash = await deps.resolveRefund(deal.jobId, action.reason);
  await deps.patchDeal(deal.jobId, {
    deadlineRuleAt: now,
    settledAt: now,
    cancelKind: 'resolved',
    cancelReason: action.reason,
    resolvedSellerBps: 0,
    disputeLoser: 'seller',
  });
  deps.emit({
    type: 'deal.dispute.auto_resolved',
    jobId: deal.jobId,
    actor: 'platform',
    payload: { ...parties, sellerBps: 0, reason: action.reason, cause: action.cause, txHash },
  });
  return 'refunded';
}

/// The ruling hash committed on chain for a deadline-rule refund.
export function deadlineRulingHash(reason: string): `0x${string}` {
  return keccak256(toBytes(reason));
}
