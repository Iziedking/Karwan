import { formatUnits, parseUnits } from 'viem';
import { checkOffer, offerLapsesAt, type OfferInput } from './rules.js';
import { jobActionsInFlight } from './jobLock.js';
import {
  createDirectOffer,
  getDirectOffer,
  listDirectOffers,
  setDirectOfferState,
  type DirectOffer,
} from '../db/directOffers.js';
import { getBrief } from '../db/briefs.js';
import { getAgentWallets } from '../db/agentWallets.js';
import {
  deleteMatchProposal,
  getMatchProposal,
  upsertMatchProposal,
  type MatchProposal,
} from '../db/matchProposals.js';
import { approveAgentMatch, getBuyerJob, getMarketplaceBriefs } from '../agents/buyer.js';
import { abandonBid, submitDirectOfferBid } from '../agents/seller.js';
import { computeFunding, getEscrowFeeBps } from '../chain/contracts.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// A seller's own offer on a request, from send to accept. The row is written
/// before the on-chain bid so the buyer agent can tell it apart; accepting
/// turns the offer into a buyer-gated match and funds through the same path an
/// agent match uses, which checks the buyer agent's balance before anything
/// goes on chain. Accepts share the per-job lock with agent-match approvals.

type JobView = { budgetUsdc: string; deadlineUnix: number; open: boolean; termsHash: string; buyerAgent: string };
type Wallets = { userAddress: string; sellerWalletId?: string; sellerAddress?: string; buyerAddress?: string };
export type PublicRequest = { briefText: string; budgetUsdc: string; deadlineUnix: number };
export type OfferViewerRole = 'buyer' | 'seller' | 'visitor';
/// What the buyer sees: the offer plus the exact amount that leaves their wallet.
export type BuyerOfferView = DirectOffer & { fundedUsdc?: string };

export type OfferDeps = {
  now: () => number;
  brief: (jobId: string) => { postedBy: string } | null;
  job: (jobId: string) => JobView | null;
  wallets: (user: string) => Promise<Wallets | null>;
  bid: typeof submitDirectOfferBid;
  getProposal: (jobId: string) => Promise<MatchProposal | null>;
  upsertProposal: (p: MatchProposal) => Promise<MatchProposal>;
  deleteProposal: (jobId: string) => Promise<void>;
  approve: typeof approveAgentMatch;
  /// What the market already shows publicly about an open request.
  publicRequest: (jobId: string) => PublicRequest | null;
  /// Withdraws the seller agent's own negotiation on a request, so a seller's
  /// own offer replaces it. Returns false when the agent had no bid there.
  withdrawAgentBid: (jobId: string, sellerAgent: string) => boolean;
  /// Price plus the buyer's share of the fee, as funded on chain.
  fundedUsdc: (priceUsdc: string) => Promise<string>;
};

const low = (s: string) => s.toLowerCase();

export const defaultDeps: OfferDeps = {
  now: () => Math.floor(Date.now() / 1000),
  brief: (jobId) => getBrief(jobId),
  job: (jobId) => {
    const j = getBuyerJob(jobId);
    if (!j) return null;
    return {
      budgetUsdc: j.budgetUsdc,
      deadlineUnix: j.deadlineUnix,
      // `finalized` is left out on purpose: a job waiting on an agent match is
      // still Posted on chain, and the bid's own job-open read is the authority.
      open: !j.escrowFunded && !j.cancelledAt && !j.expiredAt,
      termsHash: j.termsHash,
      // The agent that posted this job funds it, whatever the user's agent is now.
      buyerAgent: j.buyer,
    };
  },
  wallets: getAgentWallets,
  bid: submitDirectOfferBid,
  getProposal: getMatchProposal,
  upsertProposal: upsertMatchProposal,
  deleteProposal: deleteMatchProposal,
  approve: approveAgentMatch,
  publicRequest: (jobId) => {
    const b = getMarketplaceBriefs().find((m) => m.jobId === jobId);
    return b ? { briefText: b.briefText, budgetUsdc: b.budgetUsdc, deadlineUnix: b.deadlineUnix } : null;
  },
  withdrawAgentBid: abandonBid,
  fundedUsdc: async (priceUsdc) => {
    const { fundedAmount } = computeFunding(parseUnits(priceUsdc, 6), await getEscrowFeeBps());
    return formatUnits(fundedAmount, 6);
  },
};

type Fail<S extends number> = { ok: false; status: S; code: string; message?: string };

export async function createOffer(
  sellerUser: string,
  jobId: string,
  input: OfferInput,
  deps: OfferDeps = defaultDeps,
): Promise<{ ok: true; offer: DirectOffer; created: boolean } | Fail<400 | 404 | 409 | 502>> {
  const brief = deps.brief(jobId);
  const job = deps.job(jobId);
  if (!brief || !job) return { ok: false, status: 404, code: 'NO_REQUEST' };
  const rule = checkOffer(input, {
    budgetUsdc: job.budgetUsdc,
    requestDeadlineUnix: job.deadlineUnix,
    nowUnix: deps.now(),
    sellerUser,
    buyerUser: brief.postedBy,
    jobOpen: job.open,
  });
  if (!rule.ok) return { ok: false, status: 400, code: rule.code };
  const w = await deps.wallets(low(sellerUser));
  if (!w?.sellerWalletId || !w.sellerAddress) return { ok: false, status: 409, code: 'NEEDS_ACTIVATION' };
  // One offer per seller per request. The seller's own price replaces their
  // agent's bid: the agent stops negotiating first, then this offer takes its
  // place on chain (same agent, so submitBid overwrites the old bid).
  if (deps.withdrawAgentBid(jobId, w.sellerAddress)) {
    logger.info({ jobId, sellerAgent: w.sellerAddress }, 'seller offer replaces the agent bid');
  }

  const createdAt = deps.now();
  const { offer, created } = await createDirectOffer({
    jobId,
    sellerUser,
    sellerAgent: w.sellerAddress,
    priceUsdc: input.priceUsdc,
    deliverByUnix: input.deliverByUnix,
    note: input.note.trim(),
    createdAt,
    lapsesAt: offerLapsesAt(createdAt, job.deadlineUnix),
  });
  if (!created) return { ok: true, offer, created };

  const res = await deps.bid(
    jobId as `0x${string}`,
    { walletId: w.sellerWalletId, address: w.sellerAddress },
    offer.priceUsdc,
    offer.lapsesAt,
  );
  if (!res.ok) {
    await setDirectOfferState(offer.id, 'failed', { failure: res.reason });
    return { ok: false, status: res.reason === 'job-not-open' ? 409 : 502, code: res.reason, message: res.message };
  }
  await setDirectOfferState(offer.id, 'pending', { txHash: res.txHash });
  bus.emitEvent({
    type: 'offer.created',
    jobId,
    actor: 'seller',
    payload: { offerId: offer.id, buyerUser: low(brief.postedBy), sellerUser: low(sellerUser), priceUsdc: offer.priceUsdc },
  });
  return { ok: true, offer: { ...offer, txHash: res.txHash }, created };
}

export async function withdrawOffer(sellerUser: string, offerId: string): Promise<{ ok: true } | Fail<403 | 404 | 409>> {
  const o = await getDirectOffer(offerId);
  if (!o) return { ok: false, status: 404, code: 'NO_OFFER' };
  if (o.sellerUser !== low(sellerUser)) return { ok: false, status: 403, code: 'NOT_YOURS' };
  // The buyer may be funding this offer right now; the money decides.
  if (jobActionsInFlight.has(o.jobId)) return { ok: false, status: 409, code: 'BUSY' };
  if (!(await setDirectOfferState(o.id, 'withdrawn', { onlyFrom: 'pending' }))) {
    return { ok: false, status: 409, code: 'NOT_PENDING' };
  }
  bus.emitEvent({ type: 'offer.withdrawn', jobId: o.jobId, actor: 'seller', payload: { offerId: o.id } });
  return { ok: true };
}

export async function acceptOffer(
  buyerUser: string,
  offerId: string,
  deps: OfferDeps = defaultDeps,
): Promise<{ ok: true; txHash: string } | Fail<403 | 404 | 409 | 502>> {
  const o = await getDirectOffer(offerId);
  if (!o) return { ok: false, status: 404, code: 'NO_OFFER' };
  const brief = deps.brief(o.jobId);
  if (!brief || low(brief.postedBy) !== low(buyerUser)) return { ok: false, status: 403, code: 'NOT_BUYER' };
  if (o.state !== 'pending') return { ok: false, status: 409, code: 'NOT_PENDING' };
  if (o.lapsesAt <= deps.now()) {
    await setDirectOfferState(o.id, 'lapsed', { onlyFrom: 'pending' });
    return { ok: false, status: 409, code: 'LAPSED' };
  }
  if (jobActionsInFlight.has(o.jobId)) return { ok: false, status: 409, code: 'BUSY' };
  jobActionsInFlight.add(o.jobId);
  try {
    const job = deps.job(o.jobId);
    if (!job || !job.open) return { ok: false, status: 409, code: 'REQUEST_CLOSED' };
    const prior = await deps.getProposal(o.jobId);
    if (prior?.approvedAt) return { ok: false, status: 409, code: 'ALREADY_MATCHED' };

    await deps.upsertProposal({
      jobId: o.jobId,
      buyerUser: low(buyerUser),
      buyerAgent: job.buyerAgent,
      sellerUser: o.sellerUser,
      sellerAgent: o.sellerAgent,
      agreedPriceUsdc: o.priceUsdc,
      deadlineUnix: o.deliverByUnix,
      termsHash: job.termsHash,
      proposedAt: Date.now(),
      awaitingParty: 'buyer',
    });
    const res = await deps.approve(o.jobId);
    if (!res.ok) {
      // Leave nothing a seller could approve later: put back what was there.
      if (prior) await deps.upsertProposal(prior);
      else await deps.deleteProposal(o.jobId);
      return { ok: false, status: res.code === 'INSUFFICIENT_AGENT_BALANCE' ? 409 : 502, code: res.code, message: res.message };
    }
    const funded = await deps.getProposal(o.jobId);
    if (!funded || low(funded.sellerAgent) !== low(o.sellerAgent)) {
      return { ok: false, status: 409, code: 'CONFLICT' };
    }
    await setDirectOfferState(o.id, 'accepted', { txHash: res.txHash });
    bus.emitEvent({ type: 'offer.accepted', jobId: o.jobId, actor: 'buyer', payload: { offerId: o.id } });
    return { ok: true, txHash: res.txHash };
  } finally {
    jobActionsInFlight.delete(o.jobId);
  }
}

/// The buyer sees every live offer with the amount it would take from their
/// wallet, a seller sees only their own, and everyone else sees how many there
/// are. The public request rides along so a seller who is not yet a party can
/// read what they are offering on.
export async function viewOffers(
  viewer: string | null,
  jobId: string,
  deps: OfferDeps = defaultDeps,
): Promise<{ count: number; offers: BuyerOfferView[]; role: OfferViewerRole; request: PublicRequest | null }> {
  const now = deps.now();
  const live = (await listDirectOffers(jobId)).filter((o) => o.state === 'pending' && o.lapsesAt > now);
  const brief = deps.brief(jobId);
  const request = deps.publicRequest(jobId);
  const v = viewer ? low(viewer) : null;
  if (v && brief && low(brief.postedBy) === v) {
    const offers = await Promise.all(live.map(async (o) => ({ ...o, fundedUsdc: await deps.fundedUsdc(o.priceUsdc) })));
    return { count: live.length, offers, role: 'buyer', request };
  }
  if (v) return { count: live.length, offers: live.filter((o) => o.sellerUser === v), role: 'seller', request };
  return { count: live.length, offers: [], role: 'visitor', request };
}
