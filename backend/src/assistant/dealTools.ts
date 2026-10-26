import { tool } from 'ai';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getBrief } from '../db/briefs.js';
import { getDeal, type DirectDeal } from '../db/deals.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import { getBuyerJob, getShortlist } from '../agents/buyer.js';
import { assistantShortlistNote, assistantView, isVerified } from '../agents/shortlist.js';
import { levelOf } from '../verification/live.js';
import { isRequestOwner } from '../agents/chooseOffer.js';
import { statementWindowOpen } from '../deals/disputeJudge.js';
import { reviewHasStarted } from '../deals/reviewClock.js';
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
  buildRaiseProblemConfirm,
  buildGoodsArrivedConfirm,
  buildReviewDeliveryMyselfConfirm,
  buildClaimPaymentConfirm,
  buildStillReviewingConfirm,
  buildDelayAppealConfirm,
  buildAnswerDelayAppealConfirm,
  buildTakeBackDealConfirm,
  buildChangeDealTermsConfirm,
  buildMakeOfferConfirm,
  buildWithdrawOfferConfirm,
  buildAcceptSellerOfferConfirm,
  buildNearMissConfirm,
  buildReconsiderOfferConfirm,
  buildEditListingConfirm,
  buildStopAgentBidConfirm,
  buildConfirmGoodsReceivedConfirm,
} from './dealActions.js';
import { viewOffers } from '../offers/service.js';
import { listDirectOffers } from '../db/directOffers.js';
import { getPendingNearMiss } from '../db/nearMiss.js';
import { getOutOfReach } from '../db/outOfReach.js';
import { personNames } from '../channels/personName.js';
import { keccak256, toHex } from 'viem';
import { listListingsForSeller } from '../db/listings.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { getSellerBidFlags } from '../agents/seller.js';
import { agreementEscrowAddress, readAgreementReviewEnd } from '../chain/agreementEscrowLive.js';

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

/// How the person signs, and the in-process call that writes as them.
export interface DealStepDeps {
  signer: 'karwan' | 'wallet';
  call: (address: string, method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;
}

export function dealStepTools(address: string, actions: AssistantAction[], deps: DealStepDeps) {
  return {
    propose_edit_offer: tool({
      description:
        "Prepare a confirm card for a SELLER to change one of their own live offers on the market: the title, the description or the asking price. Use for 'change my offer price to 60', 'update the description of my logo offer'. Call get_my_market_activity first if you need the listingId.",
      inputSchema: z.object({
        listingId: z.string().min(1).max(120),
        title: z.string().max(120).optional(),
        description: z.string().max(500).optional(),
        askingPriceUsdc: z.number().positive().max(5_000_000).optional(),
      }),
      execute: async ({ listingId, title, description, askingPriceUsdc }) =>
        guarded('propose_edit_offer', async () => {
          const mine = listListingsForSeller(address).find((l) => l.id === listingId);
          if (!mine) return { error: 'That offer is not one of theirs.' };
          if (mine.cancelledAt) return { error: 'That offer is taken down.' };
          if (mine.matchedAt) return { error: 'That offer already matched into a deal. Change the deal instead.' };
          if (mine.expiresAt < Date.now()) return { error: 'That offer has expired. Offer to post it again.' };
          return offer(actions, buildEditListingConfirm({
            caller: address,
            listingId,
            currentTitle: mine.title,
            currentPriceUsdc: String(mine.askingPriceUsdc),
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(askingPriceUsdc !== undefined ? { askingPriceUsdc } : {}),
          }));
        }),
    }),

    propose_stop_agent_bid: tool({
      description:
        "Prepare a confirm card for a SELLER to make their seller agent stop negotiating on one request. Use for 'stop bidding on that', 'tell my agent to drop that request'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The request id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_stop_agent_bid', async () => {
          const wallets = await getAgentWallets(address);
          if (!wallets?.sellerAddress || !getSellerBidFlags(jobId, wallets.sellerAddress)) {
            return { error: 'Their agent is not bidding on that request.' };
          }
          return offer(actions, buildStopAgentBidConfirm({ jobId, briefText: getBrief(jobId)?.briefText ?? jobId.slice(0, 10) }));
        }),
    }),

    propose_confirm_goods_received: tool({
      description:
        "Prepare a confirm card for the BUYER of a goods deal to record on the trade record that the goods reached them, once the seller marked it delivered. It does not pay the seller. Use for 'I got the goods, confirm it', 'sign that I received them'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_confirm_goods_received', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'buyer') return { error: 'Only the buyer confirms the goods were received.' };
          if (deal.tradeType !== 'goods') return { error: 'This is not a goods deal.' };
          if (!deal.acceptedAt || !deal.delivered) return { error: 'The seller has not marked the goods delivered yet.' };
          if (deal.deliveredAt) return { error: 'It is already confirmed on the trade record.' };
          if (!config.KARWAN_INVOICE_REGISTRY_ADDR) return { error: 'The trade record is not open on this network.' };
          if (deps.signer === 'wallet') return { error: 'Their own wallet signs this. Offer a button to the deal page, where they confirm it.' };
          const podHash = keccak256(toHex(`pod:${deal.jobId}:${Date.now()}`));
          return offer(actions, buildConfirmGoodsReceivedConfirm({ address, jobId, amountUsdc: deal.dealAmountUsdc, podHash }));
        }),
    }),

    message_in_deal: tool({
      description:
        "Write in the chat of one of their deals, to the other side. Use for 'tell the seller it arrived', 'ask the buyer for the address', 'reply to them on the deal'. A message never moves money or changes the deal. If the chat is closed, say so.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        text: z.string().min(1).max(2000),
      }),
      execute: async ({ jobId, text }) =>
        guarded('message_in_deal', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const r = await deps.call(address, 'POST', `/api/chat/${jobId}`, { body: text });
          if (r.status >= 400) return { sent: false, error: typeof r.json.error === 'string' ? r.json.error : 'The message was not sent.' };
          return { sent: true, next: 'They see it in the deal chat, with an alert if they turned those on.' };
        }),
    }),

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
          if (config.SHORTLIST_MODE) {
            const shortlist = assistantView(getShortlist(jobId) ?? [], config.SEALED_RECORDS);
            return {
              shortlist,
              note: shortlist.length
                ? assistantShortlistNote(config.SEALED_RECORDS)
                : 'No offers yet. The agent keeps looking until the request closes.',
            };
          }
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
          const row = config.SHORTLIST_MODE
            ? (getShortlist(jobId) ?? []).find((e) => e.seller.toLowerCase() === bid.seller.toLowerCase())
            : undefined;
          if (row?.state === 'unavailable') return { error: 'That offer is no longer available. Call list_offers_on_request again.' };
          const unverified = row
            ? !row.verified
            : config.SHORTLIST_MODE && !isVerified(await levelOf(bid.sellerUserAddress ?? bid.seller));
          return offer(
            actions,
            buildChooseOfferConfirm({
              caller: address,
              jobId,
              seller: bid.seller,
              sellerLabel: row?.name ?? bid.sellerDisplayName ?? 'A Karwan seller',
              priceUsdc: row ? String(row.priceUsdc) : bid.priceUsdc,
              unverified,
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

    propose_raise_problem: tool({
      description:
        "Prepare a confirm card for the BUYER or the SELLER to raise a problem with a delivered deal: the payment stays held and the deal goes to dispute, where each side has 72 hours to give their side and a silent side loses. A buyer can raise one only while their review time runs; when it ends the payment goes to the seller. Ask what is wrong in a sentence first. Use for 'something is wrong', 'the work is not what we agreed', 'open a dispute'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.'), reason: z.string().min(1).max(400).describe('What is wrong, in their words.') }),
      execute: async ({ jobId, reason }) =>
        guarded('propose_raise_problem', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (!deal.delivered) return { error: side === 'buyer' ? 'Nothing has been delivered yet. If the deadline passes, you can take the money back.' : 'Mark the work delivered first.' };
          if (deal.disputed) return { error: 'This deal already has an open dispute. Give your side with the dispute statement.' };
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is no longer open.' };
          if (side === 'buyer' && deal.escrowVersion === 'suite' && agreementEscrowAddress && deal.escrowDealId) {
            const end = Number(await readAgreementReviewEnd(agreementEscrowAddress, deal.escrowDealId as `0x${string}`)) * 1000;
            if (end > 0 && Date.now() >= end) return { error: 'Your review time for this delivery has ended, so the payment goes to the seller.' };
          }
          return offer(actions, buildRaiseProblemConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc, reason }));
        }),
    }),

    propose_make_offer: tool({
      description:
        "Prepare a confirm card for a SELLER to make their own offer on someone else's open request: a price in USDC, how many days to deliver, and a short note to the buyer (280 characters at most). It replaces any bid their agent made there. Use for 'offer 120 on that request', 'I can do it for 80 in 5 days'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The request id.'),
        priceUsdc: z.number().positive().max(1_000_000),
        deliverInDays: z.number().int().min(1).max(180).describe('Whole days from now to deliver.'),
        note: z.string().max(280).default('').describe('Short note to the buyer.'),
      }),
      execute: async ({ jobId, priceUsdc, deliverInDays, note }) =>
        guarded('propose_make_offer', async () => {
          const brief = getBrief(jobId);
          const job = getBuyerJob(jobId);
          if (!brief || !job) return { error: `No open request found with id ${jobId}.` };
          return offer(actions, buildMakeOfferConfirm({
            me: address,
            jobId,
            buyerUser: brief.postedBy,
            briefText: brief.briefText,
            budgetUsdc: job.budgetUsdc,
            requestDeadlineUnix: job.deadlineUnix,
            jobOpen: !job.escrowFunded && !job.cancelledAt && !job.expiredAt,
            priceUsdc,
            deliverInDays,
            note,
            nowUnix: Math.floor(Date.now() / 1000),
          }));
        }),
    }),

    propose_withdraw_offer: tool({
      description: "Prepare a confirm card for a SELLER to withdraw their own live offer on a request. Use for 'take back my offer', 'withdraw my bid on that'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The request id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_withdraw_offer', async () => {
          const mine = (await listDirectOffers(jobId)).find((o) => o.sellerUser === address.toLowerCase() && o.state === 'pending');
          if (!mine) return { error: 'They have no live offer of their own on this request.' };
          return offer(actions, buildWithdrawOfferConfirm({ jobId, offerId: mine.id, priceUsdc: mine.priceUsdc }));
        }),
    }),

    propose_accept_offer: tool({
      description:
        "Prepare a confirm card for the BUYER to take an offer a seller made themselves on their request. Confirming pays the escrow from their buying agent and starts the deal. Call list_sellers_own_offers first for the offerId.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The request id.'),
        offerId: z.string().min(1).max(80).describe('The offerId from list_sellers_own_offers.'),
      }),
      execute: async ({ jobId, offerId }) =>
        guarded('propose_accept_offer', async () => {
          const brief = getBrief(jobId);
          if (!brief || !isRequestOwner(address, brief)) return { error: 'Only the person who posted the request takes an offer on it.' };
          const view = await viewOffers(address, jobId);
          const o = view.offers.find((x) => x.id === offerId);
          if (!o) return { error: 'That offer is no longer open. Call list_sellers_own_offers again.' };
          const names = await personNames([o.sellerUser]);
          return offer(actions, buildAcceptSellerOfferConfirm({
            jobId,
            offerId,
            sellerLabel: names.get(o.sellerUser) ?? 'the seller',
            priceUsdc: o.priceUsdc,
            ...(o.fundedUsdc ? { fundedUsdc: o.fundedUsdc } : {}),
            deliverByUnix: o.deliverByUnix,
          }));
        }),
    }),

    propose_near_match: tool({
      description:
        "A near match: the agents got close but outside the limits, and this person is asked whether to go ahead at the price reached. 'proceed' starts the deal and pays the escrow at that price; 'pass' declines and keeps the request open. 'bring_back' is for a BUYER who passed: the same price comes back so they can go ahead after all. Use for 'go ahead at that price', 'no, keep looking', 'actually I'll take the one I passed'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The request id.'),
        decision: z.enum(['proceed', 'pass', 'bring_back']),
      }),
      execute: async ({ jobId, decision }) =>
        guarded('propose_near_match', async () => {
          const me = address.toLowerCase();
          if (decision === 'bring_back') {
            const rec = getOutOfReach(jobId);
            if (!rec?.passed) return { error: 'There is no passed price on this request to bring back.' };
            if (rec.passed.buyerUser.toLowerCase() !== me) return { error: 'Only the buyer can bring back the price they passed.' };
            if (getPendingNearMiss(jobId)) return { error: 'A near match is already waiting. Answer it with proceed or pass.' };
            return offer(actions, buildReconsiderOfferConfirm({ caller: address, jobId, priceUsdc: rec.passed.proceedPriceUsdc }));
          }
          const nm = getPendingNearMiss(jobId);
          if (!nm) return { error: 'There is no near match waiting on this request.' };
          if (nm.askedUser !== me) return { error: 'This near match is waiting on the other side, not them.' };
          return offer(actions, buildNearMissConfirm({ caller: address, jobId, decision, askedSide: nm.askedSide, priceUsdc: nm.proceedPriceUsdc }));
        }),
    }),

    propose_goods_arrived: tool({
      description:
        "Prepare a confirm card for the BUYER to say the goods on a shipped deal have arrived. It starts their review time; it does not pay the seller. Use for 'the goods came', 'it arrived', 'I got the package'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_goods_arrived', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'buyer') return { error: 'Only the buyer says the goods arrived.' };
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is closed.' };
          if (!deal.shipment) return { error: 'This deal has no shipment yet. The seller adds it when they send the goods.' };
          if (deal.shipment.arrivedAt) return { error: 'Arrival is already recorded on this deal.' };
          return offer(actions, buildGoodsArrivedConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc, ...(deal.shipment.carrierName ? { carrier: deal.shipment.carrierName } : {}) }));
        }),
    }),

    propose_review_delivery_myself: tool({
      description:
        "Prepare a confirm card for the BUYER to check a delivery themselves when Karwan's delivery check has not answered, so the deal is not stuck. It skips the check for this delivery only and starts their review time. Use for 'the check is stuck', 'let me review it myself'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_review_delivery_myself', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'buyer') return { error: 'Only the buyer can review the delivery themselves.' };
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is closed.' };
          if (!deal.delivered) return { error: 'The seller has not marked the work delivered yet.' };
          if (deal.releaseBlockedReason !== 'evidence-unavailable') return { error: 'The delivery check is not stuck on this deal, so there is nothing to take over.' };
          return offer(actions, buildReviewDeliveryMyselfConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc }));
        }),
    }),

    propose_claim_payment: tool({
      description:
        "Prepare a confirm card for the SELLER to claim the next payment on a deal held by the earlier escrow, once the buyer's review time ended with no release and no problem raised. On a deal held by the new escrow the seller is paid by itself when the review ends. Use for 'claim my payment', 'the buyer never released'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_claim_payment', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'seller') return { error: 'Only the seller claims a payment. The buyer releases it.' };
          if (deal.escrowVersion === 'suite') return { error: 'This deal pays you by itself when the buyer’s review time ends.' };
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is closed.' };
          if (deal.disputed) return { error: 'This deal has an open dispute, so nothing can be claimed.' };
          if (!deal.delivered) return { error: 'Mark the work delivered first.' };
          return offer(actions, buildClaimPaymentConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc }));
        }),
    }),

    propose_more_review_time: tool({
      description:
        "Prepare a confirm card for the BUYER to add review time on a delivered deal because they are still checking it. Each deal allows a few additions. Use for 'I need more time to check', 'I'm still reviewing'.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_more_review_time', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'buyer') return { error: 'Only the buyer adds review time.' };
          if (deal.settledAt || deal.cancelledAt) return { error: 'That deal is closed.' };
          if (!reviewHasStarted(deal)) return { error: 'Their review time has not started on this deal.' };
          const terms = deal.escrowVersion === 'v3' || deal.escrowVersion === 'suite'
            ? (deal.escrowTerms as { maxExtensions?: number; extensionSecs?: number } | undefined)
            : undefined;
          const max = terms?.maxExtensions ?? config.DEAL_MAX_REVIEW_EXTENSIONS;
          const stepMs = terms?.extensionSecs !== undefined ? terms.extensionSecs * 1000 : config.DEAL_REVIEW_EXTENSION_MS;
          return offer(actions, buildStillReviewingConfirm({ caller: address, jobId, stepMs, left: max - (deal.reviewExtensionCount ?? 0) }));
        }),
    }),

    propose_delay_appeal: tool({
      description:
        "The buyer is sitting on a release. SELLER: action 'raise' asks the buyer to release; with no answer in the response window the payment is released to the seller. BUYER: action 'answer' replies to an open appeal with a reason, which keeps the payment held. Use for 'the buyer is not releasing', 'tell them why I'm waiting'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        action: z.enum(['raise', 'answer']),
        reason: z.string().max(600).optional().describe("The buyer's reason; 'answer' only."),
      }),
      execute: async ({ jobId, action, reason }) =>
        guarded('propose_delay_appeal', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (deal.settledAt || deal.cancelledAt || deal.disputed) return { error: 'That deal is closed or in dispute.' };
          const open = (deal.delayAppealRaisedAt ?? 0) > (deal.delayAppealRespondedAt ?? 0);
          if (action === 'raise') {
            if (side !== 'seller') return { error: 'Only the seller asks the buyer to release.' };
            if (deal.escrowVersion === 'suite') return { error: 'This deal pays you by itself when the buyer’s review time ends.' };
            if (!deal.reviewWindowStartedAt) return { error: 'No payment has been released yet, so there is nothing to appeal.' };
            if (open) return { error: 'An appeal is already waiting on the buyer.' };
            const eligibleAt = (deal.lastReleaseAt ?? deal.reviewWindowStartedAt) + config.DEAL_DELAY_APPEAL_GRACE_MS;
            if (Date.now() < eligibleAt) return { error: `Too early. The buyer has until ${new Date(eligibleAt).toUTCString()} first.` };
            return offer(actions, buildDelayAppealConfirm({ caller: address, jobId, amountUsdc: deal.dealAmountUsdc, responseMs: config.DEAL_DELAY_APPEAL_RESPONSE_MS }));
          }
          if (side !== 'buyer') return { error: 'Only the buyer answers an appeal.' };
          if (!open) return { error: 'There is no appeal waiting on this deal.' };
          if (Date.now() > (deal.delayAppealRaisedAt ?? 0) + config.DEAL_DELAY_APPEAL_RESPONSE_MS) return { error: 'The time to answer has passed.' };
          return offer(actions, buildAnswerDelayAppealConfirm({ caller: address, jobId, reason: reason ?? '' }));
        }),
    }),

    propose_take_back_deal: tool({
      description:
        "Prepare a confirm card for the BUYER to take back a direct deal the seller has not accepted, or one whose delivery deadline passed with nothing delivered. Any money they paid in comes back. Use for 'take it back', 'I changed my mind', 'they never delivered, I want my money back'. While the seller is working within the deadline, use propose_cancel_deal.",
      inputSchema: z.object({ jobId: jobIdField.describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_take_back_deal', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (side !== 'buyer') return { error: 'Only the buyer takes a deal back. The seller can turn it down with propose_decline_deal.' };
          if (deal.cancelledAt || deal.settledAt || deal.disputed) return { error: 'That deal is no longer open.' };
          if (deal.delivered) return { error: 'The seller already delivered. Release it, or raise a problem.' };
          const missedDeadline = !!deal.acceptedAt && !!deal.deadlineUnix && Date.now() >= deal.deadlineUnix * 1000;
          const onEscrowFamily = deal.escrowVersion === 'v3' || deal.escrowVersion === 'suite';
          if (deal.acceptedAt && !missedDeadline && !onEscrowFamily) {
            return { error: 'The seller is working on it and the deadline has not passed. Propose cancelling with propose_cancel_deal instead.' };
          }
          return offer(actions, buildTakeBackDealConfirm({
            caller: address,
            jobId,
            amountUsdc: deal.dealAmountUsdc,
            paidIn: !!deal.acceptedAt || !!deal.escrowDealId,
            missedDeadline,
          }));
        }),
    }),

    propose_change_deal_terms: tool({
      description:
        "Change a direct deal before anything is paid in. The BUYER edits their deal; the SELLER sends a counter. Any of: the price in USDC, what is delivered, the days to deliver from now. Use for 'make it 250', 'counter with 3 logos', 'give me 10 days'.",
      inputSchema: z.object({
        jobId: jobIdField.describe('The deal id.'),
        amountUsdc: z.number().positive().max(1_000_000).optional().describe('The new price in USDC.'),
        terms: z.string().max(4000).optional().describe('The full new description of what is delivered.'),
        deadlineDays: z.number().int().min(1).max(180).optional().describe('Days to deliver, counted from now.'),
      }),
      execute: async ({ jobId, amountUsdc, terms, deadlineDays }) =>
        guarded('propose_change_deal_terms', async () => {
          const found = await partyDeal(jobId, address);
          if ('error' in found) return found;
          const { deal, side } = found;
          if (deal.acceptedAt) return { error: 'Money is already in this deal, so its terms are locked.' };
          if (deal.cancelledAt || deal.settledAt) return { error: 'That deal is no longer open.' };
          if (side === 'seller' && deal.pendingCounterparty) return { error: 'Accept the invite to this deal first.' };
          return offer(actions, buildChangeDealTermsConfirm({
            caller: address,
            jobId,
            as: side,
            currentAmountUsdc: deal.dealAmountUsdc,
            ...(amountUsdc !== undefined ? { amountUsdc } : {}),
            ...(terms ? { terms } : {}),
            ...(deadlineDays !== undefined ? { deadlineDays } : {}),
          }));
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
