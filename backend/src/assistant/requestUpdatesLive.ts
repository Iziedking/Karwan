import { listAllBriefs, type Brief } from '../db/briefs.js';
import { getBuyerJob, getMatchProposal, getShortlist } from '../agents/buyer.js';
import { getPendingNearMiss } from '../db/nearMiss.js';
import { inBudgetAlternative } from '../agents/nearMiss.js';
import { getDeal } from '../db/deals.js';
import { personNameOf } from '../channels/personName.js';
import { buildApproveMatchConfirm, buildNavigateAction } from './actions.js';
import { buildChooseOfferConfirm } from './dealActions.js';
import { requestUpdate, updateTurn, type CardBuilders, type RequestView } from './requestUpdates.js';

/// The live reads behind view 30: each request this conversation posted, as
/// one up-to-date turn with its card.

const builders = (caller: string): CardBuilders => ({
  choose: (c, jobId) =>
    buildChooseOfferConfirm({ caller, jobId, seller: c.seller, sellerLabel: c.label, priceUsdc: String(c.priceUsdc), unverified: c.unverified }),
  approve: (c, jobId) =>
    buildApproveMatchConfirm({
      caller,
      jobId,
      counterpartyLabel: c.label,
      priceUsdc: String(c.priceUsdc),
      deadlineLabel: new Date(c.deadlineUnix * 1000).toISOString().slice(0, 10),
    }),
  request: (jobId) => buildNavigateAction({ destination: 'request', jobId, label: 'Open the request' }),
  deal: (jobId) => buildNavigateAction({ destination: 'open_deal', jobId, label: 'Open the deal' }),
});

export async function requestViewOf(brief: Brief): Promise<RequestView | null> {
  const job = getBuyerJob(brief.jobId);
  const budget = Number(job?.budgetUsdc ?? NaN);
  const [proposal, deal] = await Promise.all([getMatchProposal(brief.jobId).catch(() => null), getDeal(brief.jobId).catch(() => null)]);
  if (!job && !deal && !proposal) return null;
  const nm = getPendingNearMiss(brief.jobId);
  const shownNearMiss =
    nm && nm.askedSide === 'buyer' && !nm.proceededAt && !nm.declinedAt && nm.expiresAt > Date.now()
    && !inBudgetAlternative(brief.jobId, Number(nm.buyerCeilingUsdc), nm.sellerAgent)
      ? { proceedPriceUsdc: Number(nm.proceedPriceUsdc), gapUsdc: Number(nm.gapUsdc) }
      : null;
  const prices = (job?.bids ?? []).map((b) => Number(b.priceUsdc)).filter((n) => Number.isFinite(n) && n > 0);
  const live = proposal && !proposal.approvedAt && !proposal.declinedAt ? proposal : null;
  return {
    jobId: brief.jobId,
    budgetUsdc: Number.isFinite(budget) ? budget : Number(deal?.dealAmountUsdc ?? 0),
    agreeForMe: brief.agreeForMe === true,
    offers: { count: prices.length, lowestUsdc: prices.length ? Math.min(...prices) : null },
    shortlist: (getShortlist(brief.jobId) ?? []).map((e) => ({
      seller: e.seller, name: e.name, tag: e.tag, priceUsdc: e.priceUsdc, recommended: e.recommended, verified: e.verified, state: e.state,
    })),
    nearMiss: shownNearMiss,
    proposal: live
      ? {
          priceUsdc: Number(live.raisedPriceUsdc ?? live.agreedPriceUsdc),
          counterparty: await personNameOf(live.sellerUser),
          awaitingBuyer: (live.awaitingParty ?? 'seller') === 'buyer',
          deadlineUnix: live.deadlineUnix,
        }
      : null,
    deal: deal && !deal.cancelledAt
      ? {
          amountUsdc: Number(deal.dealAmountUsdc),
          counterparty: await personNameOf(deal.seller),
          funded: !!deal.acceptedAt || !!deal.fundTxHash,
          delivered: deal.delivered,
          settled: !!deal.settledAt,
        }
      : null,
    ended: job?.cancelledAt ? 'cancelled' : job?.expiredAt || brief.expiredAt ? 'expired' : job?.negotiationEndedAt && !live && !deal ? 'no_agreement' : null,
  };
}

/// One live turn per request this conversation posted, oldest first.
export async function requestTurnsForConversation(address: string, conversationId: string) {
  const me = address.toLowerCase();
  const briefs = listAllBriefs()
    .filter((b) => b.conversationId === conversationId && b.postedBy.toLowerCase() === me)
    .sort((a, b) => a.createdAt - b.createdAt);
  const turns = [];
  for (const brief of briefs) {
    const view = await requestViewOf(brief).catch(() => null);
    if (view) turns.push(updateTurn(brief.jobId, requestUpdate(view), builders(me)));
  }
  return turns;
}
