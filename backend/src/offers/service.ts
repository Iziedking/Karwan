import { formatUnits, parseUnits } from 'viem';
import { forViewer, type ViewedBudget } from '../market/budgetView.js';
import type { SealedSeller } from '../agents/sealedSellers.js';
import { checkOffer, offerLapsesAt, type OfferInput } from './rules.js';
import { jobActionsInFlight } from './jobLock.js';
import type { LocalAmount } from '../rates/quote.js';
import {
  createDirectOffer,
  getDirectOffer,
  listDirectOffers,
  lowerDirectOfferPrice,
  setDirectOfferState,
  type DirectOffer,
} from '../db/directOffers.js';
import { getRecord, putRecord } from '../db/evidence.js';
import { MAX_OFFER_REVISIONS } from '../agents/sellerPricing.js';
import { getBrief } from '../db/briefs.js';
import { attachmentList } from '../attachments/attachments.js';
import { getAgentWallets } from '../db/agentWallets.js';
import {
  deleteMatchProposal,
  getMatchProposal,
  upsertMatchProposal,
  type MatchProposal,
} from '../db/matchProposals.js';
import { approveAgentMatch, getBuyerJob } from '../agents/buyer.js';
import { publicRequestOf } from '../market/publicRequests.js';
import { publicOffers, type PublicOffer } from '../market/requestState.js';
import { liveSellerSummaries, type ListingSeller } from '../listings/sellerSummary.js';
import { abandonBid, submitDirectOfferBid } from '../agents/seller.js';
import { suiteFundingEnabled } from '../chain/suiteConfig.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { computeFunding, getEscrowFeeBps } from '../chain/contracts.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { canReadPrivate, isPublic, type Visibility } from '../market/visibility.js';

/// A seller's own offer on a request, from send to accept. The row is written
/// before the on-chain bid so the buyer agent can tell it apart; accepting
/// turns the offer into a buyer-gated match and funds through the same path an
/// agent match uses, which checks the buyer agent's balance before anything
/// goes on chain. Accepts share the per-job lock with agent-match approvals.

type JobView = { budgetUsdc: string; deadlineUnix: number; open: boolean; termsHash: string; buyerAgent: string };
type Wallets = { userAddress: string; sellerWalletId?: string; sellerAddress?: string; buyerAddress?: string };
export type PublicRequest = {
  briefText: string;
  budgetUsdc: string;
  deadlineUnix: number;
  quantity?: { count: number; unit: string | null } | null;
  /// Where it stands on the open market (view 53). Absent reads as open.
  state?: 'open' | 'negotiating' | 'agreed';
  /// The seller holding the match, for the chosen mark. Never sent to a client.
  chosenSeller?: string | null;
  /// Agent bids on it, for the public list. Never sent to a client as is.
  bids?: Array<{ sellerUser: string | null; priceUsdc: string; deadlineUnix: number }>;
  /// A private request (view 53): only the buyer and sellers who offered see
  /// it; an invited one (view 72) only the buyer and the people asked.
  visibility?: Visibility;
  invited?: string[];
  /// Photos or PDFs posted with it (view 56), read one at a time from their own links.
  attachments?: Array<{ name: string; contentType: string }>;
};
/// One offer on a request as anyone may read it (view 53): the seller by name,
/// never an address, and no scores, counters or leeway.
export type OpenOfferView = Omit<PublicOffer, 'sellerUser'> & { seller: ListingSeller | null };
export type OfferViewerRole = 'buyer' | 'seller' | 'visitor';
/// What the buyer sees: the offer plus the exact amount that leaves their wallet.
/// Who the seller is, sealed (view 32): never a score or a count.
export type SellerBlock = Omit<SealedSeller, 'sellerAgent'>;
export type BuyerOfferView = DirectOffer & { fundedUsdc?: string; sellerBlock?: SellerBlock };

const blockOf = ({ sellerAgent: _agent, ...block }: SealedSeller): SellerBlock => block;

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
  /// What the open market shows about a request (view 53).
  publicRequest: (jobId: string) => PublicRequest | null | Promise<PublicRequest | null>;
  /// Withdraws the seller agent's own negotiation on a request, so a seller's
  /// own offer replaces it. Returns false when the agent had no bid there.
  withdrawAgentBid: (jobId: string, sellerAgent: string) => boolean;
  /// Price plus the buyer's share of the fee, as funded on chain.
  fundedUsdc: (priceUsdc: string) => Promise<string>;
  /// Sets up a held wallet's Karwan record before the offer, so the deal counts
  /// on it. Never refuses the offer (view 27, decision 10).
  prepareRecord?: (sellerUser: string) => Promise<void>;
  /// The buyer's agent ranks the sellers who offered (view 32).
  sellerBlocks?: (jobId: string, offers: readonly DirectOffer[]) => Promise<SealedSeller[]>;
  /// Sellers by name and record, for the public list.
  sellerSummaries?: (users: string[]) => Promise<Map<string, ListingSeller | null>>;
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
  publicRequest: async (jobId) => {
    const b = await publicRequestOf(jobId);
    return b
      ? { briefText: b.briefText, budgetUsdc: b.budgetUsdc, deadlineUnix: b.deadlineUnix, quantity: b.quantity ?? null, state: b.state, chosenSeller: b.chosenSeller, bids: b.bids, visibility: b.visibility, ...(b.invited ? { invited: b.invited } : {}), attachments: attachmentList(getBrief(jobId)?.attachments) }
      : null;
  },
  sellerSummaries: liveSellerSummaries,
  withdrawAgentBid: abandonBid,
  fundedUsdc: async (priceUsdc) => {
    const { fundedAmount } = computeFunding(parseUnits(priceUsdc, 6), await getEscrowFeeBps());
    return formatUnits(fundedAmount, 6);
  },
  prepareRecord: async (sellerUser) => {
    if (!suiteFundingEnabled() || !suiteIdentity) return;
    await suiteIdentity.ensureRecord(sellerUser, 'seller');
  },
  sellerBlocks: async (jobId, offers) => {
    const job = getBuyerJob(jobId);
    if (!job) return [];
    const [{ sealedSellers }, { sealedSellerDeps }] = await Promise.all([import('../agents/sealedSellers.js'), import('../agents/sealedSellersLive.js')]);
    return sealedSellers(
      {
        requestId: jobId,
        // The person who posted; job.buyer is their buying agent.
        buyer: getBrief(jobId)?.postedBy ?? job.buyer,
        budgetUsdc: job.budgetUsdc,
        keywords: getBrief(jobId)?.keywords ?? [],
        offers: offers.map((o) => ({ sellerUser: o.sellerUser, sellerAgent: o.sellerAgent, priceUsdc: o.priceUsdc, deadlineUnix: o.deliverByUnix, note: o.note })),
      },
      sealedSellerDeps,
      Date.now(),
    );
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
  await deps.prepareRecord?.(low(sellerUser));
  // One offer per seller per request. The seller's own price replaces their
  // agent's bid: the agent stops negotiating first, then this offer takes its
  // place on chain (same agent, so submitBid overwrites the old bid).
  if (deps.withdrawAgentBid(jobId, w.sellerAddress)) {
    logger.info({ jobId, sellerAgent: w.sellerAddress }, 'seller offer replaces the agent bid');
  }

  const createdAt = deps.now();
  const priceLocal = input.priceLocal;
  const { offer, created } = await createDirectOffer({
    jobId,
    sellerUser,
    sellerAgent: w.sellerAddress,
    priceUsdc: input.priceUsdc,
    ...(priceLocal ? { priceLocal } : {}),
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

/// A seller lowers their own pending offer (view 35): a new bid on chain at the
/// lower price replaces the old one, down only, at most three times per seller
/// per request, the same count their agent's moves use.
export async function lowerOffer(
  sellerUser: string,
  offerId: string,
  priceUsdc: string,
  deps: OfferDeps = defaultDeps,
  priceLocal?: LocalAmount,
): Promise<{ ok: true; offer: DirectOffer } | Fail<400 | 403 | 404 | 409 | 502>> {
  const o = await getDirectOffer(offerId);
  if (!o) return { ok: false, status: 404, code: 'NO_OFFER' };
  if (o.sellerUser !== low(sellerUser)) return { ok: false, status: 403, code: 'NOT_YOURS' };
  if (jobActionsInFlight.has(o.jobId)) return { ok: false, status: 409, code: 'BUSY' };
  if (o.state !== 'pending') return { ok: false, status: 409, code: 'NOT_PENDING' };
  const job = deps.job(o.jobId);
  if (!job?.open) return { ok: false, status: 409, code: 'CLOSED' };
  if (!/^\d+(\.\d{1,6})?$/.test(priceUsdc) || !(Number(priceUsdc) > 0)) return { ok: false, status: 400, code: 'BAD_PRICE' };
  if (parseUnits(priceUsdc, 6) >= parseUnits(o.priceUsdc, 6)) return { ok: false, status: 400, code: 'NOT_LOWER' };
  const countKey = `${o.jobId.toLowerCase()}:${o.sellerAgent.toLowerCase()}`;
  const done = (await getRecord<{ n: number }>('offer-revisions', countKey).catch(() => null))?.n ?? 0;
  if (done >= MAX_OFFER_REVISIONS) return { ok: false, status: 409, code: 'LIMIT' };
  const w = await deps.wallets(low(sellerUser));
  if (!w?.sellerWalletId || !w.sellerAddress) return { ok: false, status: 409, code: 'NEEDS_ACTIVATION' };
  const res = await deps.bid(o.jobId as `0x${string}`, { walletId: w.sellerWalletId, address: w.sellerAddress }, priceUsdc, o.lapsesAt);
  if (!res.ok) return { ok: false, status: res.reason === 'job-not-open' ? 409 : 502, code: res.reason, message: res.message };
  const offer = await lowerDirectOfferPrice(o.id, priceUsdc, res.txHash, priceLocal);
  if (!offer) return { ok: false, status: 409, code: 'NOT_PENDING' };
  await putRecord('offer-revisions', countKey, { n: done + 1, at: Date.now() }).catch(() => {});
  const brief = deps.brief(o.jobId);
  bus.emitEvent({
    type: 'bid.revised',
    jobId: o.jobId,
    actor: 'seller',
    payload: { seller: o.sellerAgent, offerId: o.id, fromUsdc: o.priceUsdc, toUsdc: priceUsdc, sellerUser: o.sellerUser, ...(brief ? { buyerUser: low(brief.postedBy) } : {}) },
  });
  return { ok: true, offer };
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
/// wallet, and a seller sees their own to manage it. Everyone, signed in or not,
/// reads the public list (view 53): every hand offer and agent bid with the
/// seller by name, price, delivery date and note, and the request's state.
export async function viewOffers(
  viewer: string | null,
  jobId: string,
  deps: OfferDeps = defaultDeps,
): Promise<{
  count: number;
  offers: BuyerOfferView[];
  role: OfferViewerRole;
  request: ViewedBudget<Omit<PublicRequest, 'chosenSeller' | 'bids'>> | null;
  public: OpenOfferView[];
}> {
  const now = deps.now();
  const all = await listDirectOffers(jobId);
  const live = all.filter((o) => o.state === 'pending' && o.lapsesAt > now);
  const brief = deps.brief(jobId);
  const found = await deps.publicRequest(jobId);
  const v = viewer ? low(viewer) : null;
  const isBuyer = !!v && !!brief && low(brief.postedBy) === v;
  let request: Omit<PublicRequest, 'chosenSeller' | 'bids' | 'visibility'> | null = null;
  let open: OpenOfferView[] = [];
  if (found && !isPublic(found)) {
    // A private request (views 53 and 72): no public list, and its words only
    // for the buyer, a seller who offered on it by hand or through their
    // agent, and, when invited, the people asked.
    const { chosenSeller: _c, bids = [], visibility: _v, invited: _i, ...shown } = found;
    const offeredOn = !!v && (all.some((o) => low(o.sellerUser) === v) || bids.some((b) => b.sellerUser?.toLowerCase() === v));
    const readable = isBuyer || canReadPrivate({ visibility: found.visibility, buyer: brief?.postedBy ?? '', invited: found.invited }, v, { offered: offeredOn });
    request = readable ? shown : null;
  } else if (found) {
    const { chosenSeller = null, bids = [], visibility: _v, ...shown } = found;
    request = shown;
    const merged = publicOffers(all, bids, chosenSeller, now);
    const people = merged.length && deps.sellerSummaries
      ? await deps.sellerSummaries([...new Set(merged.map((o) => o.sellerUser))]).catch(() => new Map<string, ListingSeller | null>())
      : new Map<string, ListingSeller | null>();
    open = merged.map(({ sellerUser, ...o }) => ({ ...o, seller: people.get(sellerUser) ?? null }));
  }
  if (isBuyer) {
    const [funded, blocks] = await Promise.all([
      Promise.all(live.map((o) => deps.fundedUsdc(o.priceUsdc))),
      deps.sellerBlocks && live.length ? deps.sellerBlocks(jobId, live).catch(() => [] as SealedSeller[]) : Promise.resolve([] as SealedSeller[]),
    ]);
    const offers: BuyerOfferView[] = live.map((o, i) => {
      const hit = blocks.find((b) => low(b.sellerAgent) === low(o.sellerAgent));
      return { ...o, fundedUsdc: funded[i], ...(hit ? { sellerBlock: blockOf(hit) } : {}) };
    });
    return { count: live.length, offers, role: 'buyer', request, public: open };
  }
  // View 73: everyone but the buyer reads a bargaining request's budget as a range.
  const seen = request ? (({ jobId: _jobId, ...r }) => r)(forViewer({ jobId, ...request }, false)) : null;
  if (v) return { count: live.length, offers: live.filter((o) => o.sellerUser === v), role: 'seller', request: seen, public: open };
  return { count: live.length, offers: [], role: 'visitor', request: seen, public: open };
}
