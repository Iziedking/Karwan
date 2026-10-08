import { tool } from 'ai';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getBrief } from '../db/briefs.js';
import { getDeal, type DirectDeal } from '../db/deals.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import { getBuyerJob } from '../agents/buyer.js';
import { isRequestOwner } from '../agents/chooseOffer.js';
import { statementWindowOpen } from '../deals/disputeJudge.js';
import { hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import {
  buildChooseOfferConfirm,
  buildEditRequestConfirm,
  buildRaiseOfferConfirm,
  buildRequestExtensionConfirm,
  buildRespondExtensionConfirm,
  buildCancelDealConfirm,
  buildDisputeStatementConfirm,
  buildEscalateDisputeConfirm,
  buildDeclineDealConfirm,
} from './dealActions.js';

/// Tools for every step after a request or deal is posted. Each one reads the
/// live record, refuses when it is not this person's move, and only prepares a
/// card; the route behind the card re-checks everything when they confirm.

const jobIdField = z.string().min(1).max(120);

type Side = 'buyer' | 'seller';

function sideOf(deal: Pick<DirectDeal, 'buyer' | 'seller'>, address: string): Side | null {
  const me = address.toLowerCase();
  if (deal.buyer.toLowerCase() === me) return 'buyer';
  if (deal.seller.toLowerCase() === me) return 'seller';
  return null;
}

async function partyDeal(jobId: string, address: string): Promise<{ deal: DirectDeal; side: Side } | { error: string }> {
  const deal = await getDeal(jobId);
  if (!deal) return { error: `No deal found with id ${jobId}. Call list_my_deals for their deal ids.` };
  const side = sideOf(deal, address);
  if (!side) return { error: 'That deal is not one of theirs.' };
  return { deal, side };
}

function offer(actions: AssistantAction[], built: ConfirmAction | { error: string }) {
  if ('error' in built) return built;
  if (!hasEquivalentConfirm(actions, built)) actions.push(built);
  return { ok: true, shown: built.title };
}

async function guarded<T>(name: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, `assistant ${name} failed`);
    return { error: 'Could not prepare that right now. Try again shortly.' };
  }
}

const dayOf = (unix?: number) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : 'not set');

export function dealStepTools(address: string, actions: AssistantAction[]) {
  return {
    list_offers_on_request: tool({
      description:
        "List the offers sellers' agents have made on ONE of the user's own requests: seller name, price and reputation tier. Call this before propose_choose_offer, and whenever they ask 'who offered', 'show me the offers', 'any bids on my request'. Only the request's owner sees offers.",
      inputSchema: z.object({ jobId: jobIdField.describe('The request id.') }),
      execute: async ({ jobId }) =>
        guarded('list_offers_on_request', async () => {
          const brief = getBrief(jobId);
          if (!brief) return { error: `No request found with id ${jobId}.` };
          if (!isRequestOwner(address, brief)) return { error: 'That request is not theirs, so its offers are private.' };
          const job = getBuyerJob(jobId);
          if (!job) return { offers: [], note: 'This request is not collecting offers any more. It may have closed, matched or expired.' };
          const offers = job.bids.slice(0, 10).map((b) => ({
            seller: b.seller,
            sellerName: b.sellerDisplayName ?? 'A Karwan seller',
            priceUsdc: b.priceUsdc,
            reputationTier: b.sellerTier ?? 'not rated yet',
          }));
          return {
            offers,
            note: offers.length
              ? 'Show name, price and tier. To pick one, call propose_choose_offer with its seller value. Never show the seller value itself.'
              : 'No offers yet. The agent keeps collecting until the request closes.',
          };
        }),
    }),

    propose_choose_offer: tool({
      description:
        "Prepare a confirm card for the BUYER to choose one offer on their request. Confirming funds escrow from their buyer agent and starts the deal. Use for 'go with the second one', 'pick Ada', 'choose that offer'. Call list_offers_on_request first to get the seller value.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The request id.'),
        seller: z.string().min(1).max(120).describe('The seller value from list_offers_on_request.'),
      }),
      execute: async ({ jobId, seller }) =>
        guarded('propose_choose_offer', async () => {
          const brief = getBrief(jobId);
          if (!brief) return { error: `No request found with id ${jobId}.` };
          if (!isRequestOwner(address, brief)) return { error: 'Only the person who posted the request chooses an offer.' };
          const job = getBuyerJob(jobId);
          if (!job) return { error: 'This request is not collecting offers any more. Offer to post it again.' };
          const bid = job.bids.find((b) => b.seller.toLowerCase() === seller.toLowerCase());
          if (!bid) return { error: 'That seller has no open offer on this request. Call list_offers_on_request again.' };
          return offer(
            actions,
            buildChooseOfferConfirm({
              caller: address,
              jobId,
              seller: bid.seller,
              sellerLabel: bid.sellerDisplayName ?? 'A Karwan seller',
              priceUsdc: bid.priceUsdc,
            }),
          );
        }),
    }),

    propose_edit_request: tool({
      description:
        "Prepare a confirm card for the BUYER to change an open request before a match: the description, or how far above budget their agent may negotiate (percent). Budget and due date cannot change here because they are fixed on chain; for those, offer to cancel and post again.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The request id.'),
        briefText: z.string().min(10).max(2000).optional().describe('The full new description.'),
        negotiationMaxIncreasePct: z.number().int().min(0).max(50).optional().describe('How far above budget the agent may go, in percent.'),
      }),
      execute: async ({ jobId, briefText, negotiationMaxIncreasePct }) =>
        guarded('propose_edit_request', async () => {
          const brief = getBrief(jobId);
          if (!brief) return { error: `No request found with id ${jobId}.` };
          if (!isRequestOwner(address, brief)) return { error: 'Only the person who posted the request can edit it.' };
          return offer(
            actions,
            buildEditRequestConfirm({
              caller: address,
              jobId,
              ...(briefText ? { briefText } : {}),
              ...(negotiationMaxIncreasePct !== undefined ? { negotiationMaxIncreasePct } : {}),
            }),
          );
        }),
    }),

    propose_raise_offer: tool({
      description:
        "Prepare a confirm card for the SELLER to ask for a higher price on a match that is waiting for their approval. The buyer then approves at that price or declines. Use for 'ask for 150 instead', 'I want more for this'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The job id of the match.'),
        priceUsdc: z.number().positive().max(1_000_000).describe('The new price in USDC.'),
      }),
      execute: async ({ jobId, priceUsdc }) =>
        guarded('propose_raise_offer', async () => {
          const p = (await listMatchProposalsForUser(address)).find((x) => x.jobId === jobId);
          if (!p) return { error: `No match found on ${jobId} for this account.` };
          if (p.sellerUser.toLowerCase() !== address.toLowerCase()) return { error: 'Only the seller can ask for a higher price.' };
          if (p.approvedAt || p.declinedAt) return { error: 'That match is already decided.' };
          if ((p.awaitingParty ?? 'seller') !== 'seller') return { error: 'A price is already waiting on the buyer.' };
          return offer(
            actions,
            buildRaiseOfferConfirm({ caller: address, jobId, currentPriceUsdc: p.raisedPriceUsdc ?? p.agreedPriceUsdc, priceUsdc }),
          );
        }),
    }),

    propose_extension: tool({
      description:
        "Deadline extensions on a funded deal. SELLER: action 'request' asks for more days (1 to 30) with an optional reason. BUYER: 'approve' or 'decline' a pending ask. Use for 'I need 3 more days', 'give them more time', 'no, keep the deadline'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        action: z.enum(['request', 'approve', 'decline']),
        days: z.number().int().min(1).max(30).optional().describe("Whole days to add; 'request' only."),
        reason: z.string().max(400).optional().describe("Short reason for the buyer; 'request' only."),
      }),
      execute: async ({ jobId, action, days, reason }) =>
        guarded('propose_extension', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is closed.' };
          if (!deal.acceptedAt) return { error: 'The deal is not funded yet, so there is no delivery deadline to extend.' };
          if (action === 'request') {
            if (side !== 'seller') return { error: 'Only the seller asks for more time. The buyer approves or declines.' };
            if (deal.extensionRequest) return { error: 'An extension request is already waiting on the buyer.' };
            if (!deal.deadlineUnix) return { error: 'This deal has no delivery deadline to extend.' };
            if (!days) return { error: 'Ask them how many extra days they need.' };
            return offer(
              actions,
              buildRequestExtensionConfirm({ caller: address, jobId, days, currentDeadlineUnix: deal.deadlineUnix, ...(reason ? { reason } : {}) }),
            );
          }
          if (side !== 'buyer') return { error: 'Only the buyer answers an extension request.' };
          const ask = deal.extensionRequest;
          if (!ask) return { error: 'There is no extension request waiting on this deal.' };
          const askedDays = Math.max(1, Math.round(ask.additionalSeconds / 86_400));
          return offer(
            actions,
            buildRespondExtensionConfirm({
              caller: address,
              jobId,
              decision: action,
              days: askedDays,
              ...(deal.deadlineUnix ? { newDeadlineUnix: deal.deadlineUnix + ask.additionalSeconds } : {}),
            }),
          );
        }),
    }),

    propose_cancel_deal: tool({
      description:
        "Cancel a funded deal by agreement. 'propose' sends a cancellation with a reason to the other side; 'accept' or 'decline' answers one they sent. Accepting ends the deal and returns escrow as the cancellation sets out. Use for 'cancel this deal', 'they want to cancel, agree', 'no, keep going'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        step: z.enum(['propose', 'accept', 'decline']),
        reason: z.string().max(400).optional().describe("Required for 'propose'."),
      }),
      execute: async ({ jobId, step, reason }) =>
        guarded('propose_cancel_deal', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is already closed.' };
          if (!deal.acceptedAt) {
            return {
              error: side === 'seller'
                ? 'The deal is not funded yet. To say no, use propose_decline_deal.'
                : 'The deal is not funded yet, so nothing is held. Offer a button to the deal page to withdraw it.',
            };
          }
          const pending = deal.cancellationProposal;
          if (step === 'propose') {
            if (pending) {
              return { error: pending.proposedBy === side ? 'Their cancellation is already waiting on the other side.' : 'The other side already proposed cancelling. Offer to accept or decline it.' };
            }
          } else {
            if (!pending) return { error: 'There is no cancellation waiting on this deal.' };
            if (pending.proposedBy === side) return { error: 'They proposed this cancellation; the other side answers it.' };
          }
          return offer(
            actions,
            buildCancelDealConfirm({ caller: address, jobId, step, amountUsdc: deal.dealAmountUsdc, ...(reason ? { reason } : {}) }),
          );
        }),
    }),

    propose_dispute_statement: tool({
      description:
        "Prepare a confirm card for a party in a DISPUTE to give their statement: what was received, what is missing, and how late it was, plus up to five links. Ask for any answer they have not given, in their words. Statements open when the dispute starts and close after the statement window.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        received: z.string().max(1000).describe('What was received.'),
        missing: z.string().max(1000).describe('What is missing or wrong.'),
        late: z.string().max(500).describe("How late it was, or 'on time'."),
        links: z.array(z.string().max(500)).max(5).default([]).describe('Optional evidence links, http or https.'),
      }),
      execute: async ({ jobId, received, missing, late, links }) =>
        guarded('propose_dispute_statement', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal } = found;
          if (!deal.disputed) return { error: 'That deal is not in dispute.' };
          if (!statementWindowOpen(deal, Date.now(), config.DISPUTE_STATEMENT_WINDOW_MS)) {
            return { error: 'The statement window on this dispute has closed.' };
          }
          if (deal.judgeProposal) return { error: 'A ruling has already been proposed, so statements are closed.' };
          return offer(actions, buildDisputeStatementConfirm({ caller: address, jobId, received, missing, late, links }));
        }),
    }),

    propose_escalate_dispute: tool({
      description:
        "Prepare a confirm card to send an open dispute to a Karwan reviewer: to appeal a proposed ruling, or when no ruling came in time. Use for 'appeal this', 'I want a person to look at it', 'escalate'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_escalate_dispute', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal } = found;
          if (!deal.disputed || deal.settledAt || deal.cancelledAt) return { error: 'That deal has no open dispute.' };
          return offer(actions, buildEscalateDisputeConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc }));
        }),
    }),

    propose_decline_deal: tool({
      description:
        "Prepare a confirm card for the SELLER to turn down a direct deal they have not agreed to yet, with a short note to the buyer. No money has moved. Use for 'I can't take this', 'turn it down', 'say no to that deal'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        note: z.string().max(400).describe('Short note to the buyer.'),
      }),
      execute: async ({ jobId, note }) =>
        guarded('propose_decline_deal', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'seller') return { error: 'Only the seller turns down a deal. The buyer can withdraw it from the deal page.' };
          if (deal.acceptedAt || deal.sellerApprovedAt) return { error: 'They already agreed to this deal. To end it now, propose cancelling.' };
          if (deal.cancelledAt || deal.settledAt) return { error: 'That deal is no longer open.' };
          return offer(
            actions,
            buildDeclineDealConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc, counterpartyLabel: deal.buyer, note }),
          );
        }),
    }),
  };
}

/// Lines for whats_pending about the steps above, so the assistant can see
/// work that is waiting on this person.
export function dealStepPendingLines(
  address: string,
  deals: DirectDeal[],
  now: number,
): { actionNeeded: string[]; waitingOnOthers: string[] } {
  const actionNeeded: string[] = [];
  const waitingOnOthers: string[] = [];
  for (const d of deals) {
    if (d.settledAt || d.cancelledAt) continue;
    const side = sideOf(d, address);
    if (!side) continue;
    if (d.extensionRequest) {
      const days = Math.max(1, Math.round(d.extensionRequest.additionalSeconds / 86_400));
      if (side === 'buyer') {
        actionNeeded.push(`Deal ${d.jobId}: the seller asked for ${days} more day${days === 1 ? '' : 's'} (deadline now ${dayOf(d.deadlineUnix)}). Approve or decline with propose_extension.`);
      } else {
        waitingOnOthers.push(`Deal ${d.jobId}: your ask for ${days} more day${days === 1 ? '' : 's'} is waiting on the buyer.`);
      }
    }
    if (d.cancellationProposal) {
      if (d.cancellationProposal.proposedBy === side) {
        waitingOnOthers.push(`Deal ${d.jobId}: your cancellation proposal is waiting on the other side.`);
      } else {
        actionNeeded.push(`Deal ${d.jobId}: the ${d.cancellationProposal.proposedBy} proposed cancelling ("${d.cancellationProposal.reason}"). Accept or decline with propose_cancel_deal.`);
      }
    }
    if (d.disputed && !d.judgeProposal && !d.disputeStatements?.[side] && statementWindowOpen(d, now, config.DISPUTE_STATEMENT_WINDOW_MS)) {
      actionNeeded.push(`Deal ${d.jobId}: the dispute needs their statement before the window closes. Offer propose_dispute_statement.`);
    }
  }
  return { actionNeeded, waitingOnOthers };
}
