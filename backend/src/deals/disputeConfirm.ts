import { keccak256, toBytes, type Hex } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import { findingHash } from './disputeCase.js';
import type { JudgeProposal } from './disputeJudge.js';

/// A reviewer confirms a finding on an escrow family dispute (view 90) before
/// the arbiter proposes anything. Pure: the desk route stores what this
/// returns, and the deal watcher acts on it at its next tick.

export type ConfirmResult =
  | { ok: true; proposal: JudgeProposal }
  | {
      ok: false;
      status: 400 | 409;
      code: 'BAD_INPUT' | 'NOT_DISPUTED' | 'NOT_FAMILY' | 'HEARING_OPEN' | 'NO_FINDING' | 'ALREADY_CONFIRMED';
      error: string;
    };

export function confirmFinding(
  deal: DirectDeal,
  input: { sellerBps: number; reason: string },
  reviewer: string,
  now: number,
  settings: { windowMs: number },
): ConfirmResult {
  const reason = input.reason.trim();
  if (!Number.isInteger(input.sellerBps) || input.sellerBps < 0 || input.sellerBps > 10_000 || !reason || reason.length > 1000) {
    return { ok: false, status: 400, code: 'BAD_INPUT', error: 'give a share from 0 to 10000 and a reason' };
  }
  if (!deal.disputed || deal.settledAt || deal.cancelledAt) {
    return { ok: false, status: 409, code: 'NOT_DISPUTED', error: 'this deal is not in dispute' };
  }
  if (deal.escrowVersion !== 'suite') {
    return { ok: false, status: 409, code: 'NOT_FAMILY', error: 'findings are confirmed this way only on the escrow family' };
  }
  const s = deal.disputeStatements ?? {};
  const heard = (!!s.buyer && !!s.seller) || now > (deal.disputedAt ?? 0) + settings.windowMs;
  if (!heard) return { ok: false, status: 409, code: 'HEARING_OPEN', error: 'a side can still answer; confirm once both have or the window has closed' };
  const p = deal.judgeProposal;
  if (!p) return { ok: false, status: 409, code: 'NO_FINDING', error: 'there is no finding to confirm yet' };
  if (p.status !== 'awaiting-review') {
    return { ok: false, status: 409, code: 'ALREADY_CONFIRMED', error: 'this finding was already confirmed' };
  }

  const hash = findingHash({
    dealKey: deal.jobId,
    inputsHash: p.inputsHash,
    sellerBps: input.sellerBps,
    items: p.items,
    reviewer,
    reason,
    confirmedAt: now,
  });
  return {
    ok: true,
    proposal: {
      ...p,
      status: input.sellerBps === p.sellerBps ? 'confirmed' : 'overridden',
      reviewedSellerBps: input.sellerBps,
      reviewReason: reason,
      reviewedBy: reviewer,
      reviewedAt: now,
      findingHash: hash,
    },
  };
}

/// The hash the review Safe signs. Ruling the share a reviewer confirmed, it is
/// the finding's own hash, so the record can be checked against the chain; a
/// panel ruling otherwise, on an objection, hashes its own reason.
export function panelRuling(deal: DirectDeal, sellerBps: number, reason: string): { rulingHash: Hex } {
  const p = deal.judgeProposal;
  if (p && p.status !== 'awaiting-review' && p.findingHash && p.reviewedSellerBps === sellerBps) {
    return { rulingHash: p.findingHash };
  }
  return { rulingHash: keccak256(toBytes(reason)) };
}
