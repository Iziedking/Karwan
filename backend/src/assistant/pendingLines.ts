import type { DirectDeal } from '../db/deals.js';
import type { MatchProposal } from '../db/matchProposals.js';

/// The deal and match-proposal lines `whats_pending` reads out. Each line says
/// which side the person is on and whose move it is, because the model repeats
/// these lines nearly word for word: a line that only said "review the
/// remaining milestone" came back as "waiting for your review" to a seller.

export interface PendingLines {
  actionNeeded: string[];
  waitingOnOthers: string[];
  inFlight: string[];
}

/// Undecided match proposals. One whose request date has passed is no longer
/// something to act on, so it is only counted.
export function proposalPendingLines(address: string, proposals: readonly MatchProposal[], now: number) {
  const actionNeeded: string[] = [];
  const waitingOnOthers: string[] = [];
  let expired = 0;
  for (const p of proposals) {
    if (p.approvedAt || p.declinedAt) continue;
    if (p.deadlineUnix && p.deadlineUnix * 1000 <= now) {
      expired += 1;
      continue;
    }
    const myRole = p.buyerUser === address ? 'buyer' : 'seller';
    const awaiting = p.awaitingParty ?? 'seller';
    const price = p.raisedPriceUsdc ?? p.agreedPriceUsdc;
    if (awaiting === myRole) {
      actionNeeded.push(`Match proposal on job ${p.jobId} at ${price} USDC (you are the ${myRole}) is waiting for YOUR approval or decline.`);
    } else {
      waitingOnOthers.push(`Match proposal on job ${p.jobId} at ${price} USDC (you are the ${myRole}) is waiting for the ${awaiting} to approve.`);
    }
  }
  return { actionNeeded, waitingOnOthers, expired };
}

export function dealPendingLines(address: string, deals: readonly DirectDeal[], now: number): PendingLines {
  const out: PendingLines = { actionNeeded: [], waitingOnOthers: [], inFlight: [] };
  for (const d of deals) {
    if (d.settledAt || d.cancelledAt) continue;
    const isBuyer = d.buyer === address;
    const missed = !!d.acceptedAt && !d.delivered && !!d.deadlineUnix && d.deadlineUnix * 1000 <= now;
    if (d.legacyEscrow) {
      out.waitingOnOthers.push(
        `Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is on the earlier escrow, not one that is running now. Money held there is recovered at /legacy.`,
      );
    } else if (d.disputed) {
      out.actionNeeded.push(`Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is in dispute. The process and timelines are on /docs/disputes.`);
    } else if (d.delivered && isBuyer) {
      out.actionNeeded.push(
        `Deal ${d.jobId} (${d.dealAmountUsdc} USDC): the seller delivered. They review the delivery and release the payment on the deal page; release and check gates still apply.`,
      );
    } else if (d.delivered) {
      out.waitingOnOthers.push(`Deal ${d.jobId} (${d.dealAmountUsdc} USDC): you delivered. It is waiting for the buyer to release the payment.`);
    } else if (missed) {
      if (isBuyer) {
        out.actionNeeded.push(
          `Deal ${d.jobId} (${d.dealAmountUsdc} USDC): the delivery date passed with nothing delivered. They can take the money back (propose_take_back_deal); Karwan refunds it automatically after the grace period.`,
        );
      } else {
        out.waitingOnOthers.push(
          `Deal ${d.jobId} (${d.dealAmountUsdc} USDC): the delivery date passed with nothing delivered, so the buyer is refunded after the grace period unless they agreed to more time.`,
        );
      }
    } else if (d.sellerApprovedAt && !d.acceptedAt && isBuyer) {
      out.actionNeeded.push(
        d.origin === 'agent'
          ? `Deal ${d.jobId}: seller agreement is recorded; agent funding may proceed under the request's prior authorization. Read the deal before taking another funding action.`
          : `Deal ${d.jobId} (${d.dealAmountUsdc} USDC): the seller agreed. Review the current fee and exact total before funding escrow.`,
      );
    } else if (d.sellerApprovedAt && !d.acceptedAt) {
      out.waitingOnOthers.push(
        d.origin === 'agent'
          ? `Deal ${d.jobId}: agreement is recorded; check the deal for agent funding progress.`
          : `Deal ${d.jobId} (${d.dealAmountUsdc} USDC): you agreed to the terms. Waiting for the buyer to review and fund escrow.`,
      );
    } else if (!d.acceptedAt && !isBuyer && !d.pendingCounterparty) {
      out.actionNeeded.push(`Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is waiting for you to agree to the terms. Buyer funding happens afterward.`);
    } else if (!isBuyer && d.deadlineUnix && d.deadlineUnix * 1000 - now < 3 * 86_400_000 && d.deadlineUnix * 1000 > now) {
      const daysLeft = Math.max(1, Math.ceil((d.deadlineUnix * 1000 - now) / 86_400_000));
      out.actionNeeded.push(
        `Deal ${d.jobId}: the delivery deadline is in about ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Deliver on time: missing it lets the buyer reclaim and costs reputation.`,
      );
    } else {
      out.inFlight.push(`Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is in progress.`);
    }
  }
  return out;
}
