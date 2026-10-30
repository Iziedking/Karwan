import { sellerMayBid } from '../verification/networkGate.js';
import { levelOf } from '../verification/live.js';
import { blocksOffer, sellerAgentBinding, SELLER_LINK_DETAIL } from '../deals/sellerBinding.js';
import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Address, type Hex, type Log } from 'viem';
import { vault, getReservationBps } from '../chain/contracts.js';
import { classifyAgentError } from '../chain/errors.js';
import { marketBoard } from '../marketplace/chainBoard.js';

/// KarwanJobBoard.JobState. None=0, Posted=1, Accepted=2, Cancelled=3,
/// Expired=4. Only Posted accepts a bid.
const JOB_STATE_POSTED = 1;
const JOB_STATE_ACCEPTED = 2;

/// A seller agent's offer and counter replies go to the market board (view 40).
/// `txHash` is the board's reference: a transaction on the old board, an event
/// id in Karwan's records.
async function placeOffer(walletId: string, seller: string, jobId: string, price: bigint, validUntilUnix: number) {
  const { ref } = await marketBoard().placeOffer({ walletId, seller: seller as Address, jobId: jobId as Hex, price, deadline: BigInt(validUntilUnix) });
  return { txHash: ref };
}

async function respondToCounter(walletId: string, seller: string, jobId: string, accept: boolean, price: bigint, deadlineUnix: number) {
  const { ref } = await marketBoard().respond({ walletId, seller: seller as Address, jobId: jobId as Hex, accept, price, deadline: BigInt(deadlineUnix) });
  return { txHash: ref };
}
import { negotiationModel } from '../llm/client.js';
import { bidDecisionSchema } from '../llm/schemas.js';
import { buildBidEvaluationPrompt, type JobContext } from '../llm/prompts.js';
import { nextSellerMove } from './concession.js';
import { buildReasonLinePrompt, checkReasonLine, fallbackReason, reasonLineSchema, type ReasonFacts } from '../llm/reasonLine.js';
import { recordAgreement } from './negotiationMeasures.js';
import { quantityWords } from '../llm/quantity.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';
import { bus } from '../events.js';
import { paysForResearch } from './suggestion.js';
import { getRecord, putRecord } from '../db/evidence.js';
import { suiteFundingEnabled } from '../chain/suiteConfig.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import type { SellerProfile } from './seller-profile.js';
import {
  resolveSellerProfile,
  resolveSellerProfilesForUsers,
  siblingSellerAddress,
} from './agent-registry.js';
import { withLlmRetry } from './llm-utils.js';
import { type Tier } from './strategy.js';
import { sellerOpeningBid as pureSellerOpeningBid } from './sellerPricing.js';
import { sellerViewOfRequest } from './sellerView.js';
import { reviseStandingOffer, type ReviseOutcome } from './reviseOffer.js';
import { limitDecision, orderSize } from './limits.js';
import { askOwner } from './agentQuestion.js';
import { getBrief } from '../db/briefs.js';
import { fittingWay, sellerForRequest } from './ways.js';
import { deliveryQuestions, reachGate } from '../location/deliveryQuestions.js';
import { locationOf } from '../location/live.js';
import { kindOf } from '../location/rules.js';
import { findPendingDirectOfferByAgent } from '../db/directOffers.js';
import { actorSignalsFor } from './signals.js';
import { saveActiveBids, saveActiveBidsSync, loadActiveBids } from '../db/activeBids.js';
import { marketHeat, setResearchHeat } from './marketDemand.js';
import { maybeRaiseNearMiss } from './nearMiss.js';
import { topicalOverlap, extractKeywords, judgeRelevance } from '../llm/keywords.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { accountTypeOf } from '../profile/accountType.js';
import { getProfile } from '../db/profiles.js';
import { researchMarket, getCachedMarketPrice, getCachedMarketRead } from '../x402/externalClient.js';
import { recordExternalResearchFailure, recordExternalResearchPayment } from '../x402/researchAccounting.js';
import { paidRecordRead, type PaidPassportSignal } from '../x402/buyerClient.js';
import { assessBuyer, type BuyerCheck } from './buyerCheck.js';
import { config } from '../config.js';
import { evaluationStarted, evaluationFinished } from './evaluationTracker.js';
import { rankSellers, requestsForSeller, sellerIndex } from '../matching/sellerIndex.js';
import { recordDecision, recordPosted } from './matchLatency.js';
import { cleanDealPartnersFor } from './workRecord.js';
import { getTierState } from '../db/tierState.js';
import type { Tier as StandingTier } from '../reputation/config.js';
import type {
  StakeQualificationShadowObserver,
} from './stakeQualificationShadow.js';
import { buildStakeQualificationObservation } from './stakeQualificationProjection.js';
import type { EvidenceAcquisitionShadowObserver } from './evidenceAcquisitionShadow.js';
import { buildMarketEvidenceAcquisitionObservation } from './evidenceAcquisitionProjection.js';
import { requestTitle, settleBid, type BidOutcomeRecord, type DealParties } from './bidOutcome.js';
import { recordBidOutcomes } from '../db/bidOutcomes.js';

// ERC-20 USDC on Arc uses 6 decimals (native gas interface uses 18). Bid amounts
// ride the ERC-20 rail because escrow.transferFrom is ERC-20.
const USDC_DECIMALS = 6;

/// How many seller evaluations run at once in the JobPosted sweep. Each one is
/// an LLM call plus a bounded research await, so serial was 60-90s end to end.
const EVAL_CONCURRENCY = Number(process.env.AGENT_EVAL_CONCURRENCY ?? 5);

/// Sweep-priority rank only (proven sellers evaluated earlier). Ranking at bid
/// time stays match-first per the match-ranking rule. Keyed by the tier-state
/// store's standing tier, not the strategy tier (different casing).
const EVAL_TIER_RANK: Record<StandingTier, number> = {
  ELITE: 4,
  STRONG: 3,
  ESTABLISHED: 2,
  COLD: 1,
  NEW: 0,
};

interface ActiveBid {
  // The seller profile of the user whose seller agent placed this bid.
  seller: SellerProfile;
  jobContext: JobContext;
  lastBidPrice: string;
  /** The seller's opening price on this auction. Anchors the counter-evaluation
   *  floor for profile-driven bids, so the agent won't drop the price more than
   *  PROFILE_MAX_DECREASE_PCT below this. Without it, the LLM would happily
   *  walk all the way down to the seller's profile-wide minBudgetUsdc on every
   *  job, even ones where they opened far above that floor. */
  originalBidPriceUsdc: string;
  counterRounds: number;
  finalized: boolean;
  responding: boolean;
  /// The buyer's last counter price, so a step comes only after they moved (view 41).
  lastBuyerPrice?: string;
  /// The time trade was offered once before crossing to the floor (view 41).
  tradedTime?: boolean;
  /** When the bid was triggered by a seller listing: the listing's floor below
   *  which the seller agent must NOT accept counters. Falls back to the seller
   *  profile's minBudgetUsdc when undefined. */
  listingFloorUsdc?: number;
  listingAskingPriceUsdc?: number;
  /** Set true by `adjustBidByTier` when the buyer is NEW-tier (see
   *  docs/reputation-model.md §6). The buyer agent reads this in
   *  `proposeMatch` to attach a `new-buyer` riskFlag on the resulting
   *  MatchProposal so the human gets a heads-up before approving. */
  humanReview?: boolean;
  /// What the agent learned from its paid read of the buyer before bidding.
  buyerCheck?: BuyerCheck;
}

/// How far below the original bid the seller agent will steer on a profile-
/// matched (non-listing) bid. 15% is a reasonable concession band, enough to
/// move on a real negotiation, not enough to capitulate to a lowball.
const PROFILE_MAX_DECREASE_PCT = 15;

// Keyed by `${jobId}:${sellerAgentAddress}` since many sellers can bid on one job.
const activeBids = new Map<string, ActiveBid>();
const handledEvents = new Set<string>();

// --- ActiveBid durability (survive a restart mid-negotiation) ---------------
// Debounced whole-map snapshot of the NON-finalized bids. Called at each state
// transition (submit + counter round); the debounce coalesces the burst and the
// 2s flush reads the final state, so it captures a bid's post-mutation form and
// naturally drops it once it finalizes. See db/activeBids.ts.
let activeBidsPersistTimer: ReturnType<typeof setTimeout> | null = null;
let stakeQualificationShadowObserver: StakeQualificationShadowObserver | null = null;
let evidenceAcquisitionShadowObserver: EvidenceAcquisitionShadowObserver | null = null;

/// Installs the optional read-only stake qualification observer. It records the
/// exact trusted-match shortfall as a durable shadow blocker, but never changes
/// the legacy seller decision and never submits a stake or transfer.
export function configureSellerStakeQualificationShadow(
  observer: StakeQualificationShadowObserver | null,
): () => void {
  stakeQualificationShadowObserver = observer;
  return () => {
    if (stakeQualificationShadowObserver === observer) stakeQualificationShadowObserver = null;
  };
}

/// Installs the read-only market-evidence acquisition observer. It records the
/// existing legacy research result only; it never initiates a provider call or
/// changes seller pricing, eligibility, or negotiation authority.
export function configureSellerEvidenceAcquisitionShadow(
  observer: EvidenceAcquisitionShadowObserver | null,
): () => void {
  evidenceAcquisitionShadowObserver = observer;
  return () => {
    if (evidenceAcquisitionShadowObserver === observer) evidenceAcquisitionShadowObserver = null;
  };
}

function publishMarketEvidenceAcquisitionShadow(read: Awaited<ReturnType<typeof researchMarket>>, jobId: string): void {
  const observer = evidenceAcquisitionShadowObserver;
  if (!observer) return;
  const data = buildMarketEvidenceAcquisitionObservation(read, jobId);
  void observer({ data }).catch((err) => {
    logger.warn(
      { jobId, err: (err as Error).message },
      'seller market evidence acquisition shadow observation failed',
    );
  });
}

function publishStakeQualificationShadow(
  job: JobContext,
  seller: SellerProfile,
  stakeOwner: string,
  fundingWallet: string,
  requiredUsdc: string,
  freeUsdc: string,
  reservationBps: number,
): void {
  const observer = stakeQualificationShadowObserver;
  if (!observer) return;
  const data = buildStakeQualificationObservation({
    dealRoomId: job.jobId,
    sellerAddress: seller.address,
    stakeOwner,
    fundingWallet,
    vaultAddress: vault.address,
    requiredStakeUsdc: requiredUsdc,
    freeStakeUsdc: freeUsdc,
    reservationBps,
    observedAtUnix: Math.floor(Date.now() / 1000),
  });
  void observer({ data }).catch((err) => {
    logger.warn(
      { jobId: job.jobId, seller: seller.address, err: (err as Error).message },
      'stake qualification shadow observation failed',
    );
  });
}

function liveActiveBids(): Record<string, ActiveBid> {
  const out: Record<string, ActiveBid> = {};
  for (const [k, v] of activeBids) {
    if (!v.finalized) out[k] = v; // only in-flight negotiations are worth resuming
  }
  return out;
}

function scheduleActiveBidsPersist(): void {
  if (activeBidsPersistTimer) return;
  activeBidsPersistTimer = setTimeout(() => {
    activeBidsPersistTimer = null;
    void saveActiveBids(liveActiveBids());
  }, 2_000);
}

/// Synchronous flush for the shutdown hook (index.ts stopFns). The process exits
/// immediately after, so this sync write is the last durable copy.
export function flushActiveBidsSync(): void {
  saveActiveBidsSync(liveActiveBids());
}

/// Restore in-flight bids on boot so a deploy mid-auction resumes instead of
/// stalling. No-op once the map holds anything (never clobbers live state).
export async function hydrateActiveBids(): Promise<void> {
  if (activeBids.size > 0) return;
  try {
    const stored = await loadActiveBids();
    let n = 0;
    for (const [k, v] of Object.entries(stored)) {
      activeBids.set(k, v as ActiveBid);
      n += 1;
    }
    if (n > 0) logger.info({ count: n }, 'active bids hydrated from snapshot');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'active bids hydrate failed (non-fatal)');
  }
}

type DirectOfferLookup = (jobId: string, sellerAgent: string) => Promise<{ id: string } | null>;
let directOfferLookup: DirectOfferLookup = findPendingDirectOfferByAgent;

/// A selling agent offers whether or not its owner has a Karwan record (view 27,
/// decision 10). Where Karwan holds the owner's wallets the record is set up
/// first, so the deal counts on it; an owner with their own wallet gets theirs
/// with their next transaction.
async function prepareSellerRecord(sellerUser: string): Promise<void> {
  if (!suiteFundingEnabled() || !suiteIdentity) return;
  await suiteIdentity.ensureRecord(sellerUser, 'seller');
}

export const __listingBidTest = {
  setDirectOfferLookup(fn: DirectOfferLookup) {
    directOfferLookup = fn;
  },
  evaluateAndBid: (seller: SellerProfile, job: JobContext) => evaluateAndBid(seller, job),
};

/// A seller's own offer on a request. Same on-chain bid as a listing, but it
/// never enters activeBids: there is no counter loop, because the seller
/// already named their price and the buyer decides. The job-open read turns a
/// closed request into a clear message instead of a bare "tx FAILED".
export async function submitDirectOfferBid(
  jobId: `0x${string}`,
  seller: { walletId: string; address: string },
  priceUsdc: string,
  validUntilUnix: number,
): Promise<{ ok: true; txHash: string } | { ok: false; reason: string; message: string }> {
  try {
    const onBoard = await marketBoard().read(jobId);
    if (Number(onBoard?.state ?? 0) !== JOB_STATE_POSTED) {
      return { ok: false, reason: 'job-not-open', message: 'This request is closed and can no longer take offers.' };
    }
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'could not read job state before a direct offer');
  }
  try {
    const txResult = await placeOffer(seller.walletId, seller.address, jobId, parseUnits(priceUsdc, USDC_DECIMALS), validUntilUnix);
    bus.emitEvent({
      type: 'bid.submitted',
      jobId,
      actor: 'seller',
      payload: { seller: seller.address, priceUsdc, deadlineUnix: validUntilUnix, source: 'direct', txHash: txResult.txHash },
    });
    return { ok: true, txHash: txResult.txHash };
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, seller: seller.address, code: info.code, err: info.raw }, 'direct offer submitBid failed');
    return { ok: false, reason: info.code, message: info.message };
  }
}

/// Submit a bid on an open buyer brief on behalf of a seller listing. Bypasses
/// the seller agent's LLM bid decision because the listing IS the decision.
/// The seller has pre-committed to this price and tolerance. From here the bid
/// flows through the normal counter/accept loop, with the listing's tolerance
/// applied in counter-evaluation.
export async function submitListingBid(
  job: JobContext,
  seller: SellerProfile,
  listing: {
    askingPriceUsdc: number;
    floorUsdc: number;
    description: string;
    deadlineDays?: number;
  },
): Promise<
  | { ok: true; txHash: string }
  // `reason` is a CODE for callers to branch on, never prose. `message` is the
  // only field fit to show a person: the raw chain error is a contract label and
  // a job id, which tells a seller nothing and tells everyone else too much.
  | { ok: false; reason: string; message: string }
> {
  const key = bidKey(job.jobId, seller.address);
  if (activeBids.has(key)) {
    return { ok: false, reason: 'already-bid', message: 'This offer is already on the board.' };
  }
  await prepareSellerRecord(seller.userAddress);
  // The seller already named their own price on this request; a listing bid
  // from the same agent would overwrite it on chain.
  try {
    if (await directOfferLookup(job.jobId, seller.address.toLowerCase())) {
      return { ok: false, reason: 'direct-offer-pending', message: 'Your own offer on this request is already on the board.' };
    }
  } catch (err) {
    logger.warn({ jobId: job.jobId, err: (err as Error).message }, 'direct offer lookup failed before a listing bid');
  }

  // Is the job still open on chain?
  //
  // `submitBid` reverts JobNotOpen for anything past Posted, and the Circle SDK
  // collapses that into a bare "tx FAILED", so without this read the caller
  // cannot tell a closed job from a broken one. Worse, the listing sweep has no
  // reason to stop: it rediscovers the same job every cycle and burns an LLM
  // decision and a doomed transaction on it, indefinitely. One cheap read turns
  // that loop into a skip.
  //
  // A read failure is not treated as closed. RPC blips happen, and refusing to
  // bid because we could not check would cost real matches; the transaction is
  // the backstop.
  try {
    const onBoard = await marketBoard().read(job.jobId as `0x${string}`);
    const state = Number(onBoard?.state ?? 0);
    if (state !== JOB_STATE_POSTED) {
      logger.info(
        { jobId: job.jobId, seller: seller.address, state },
        'skipping listing bid: the job is no longer open on chain',
      );
      return {
        ok: false,
        reason: 'job-not-open',
        message:
          state === JOB_STATE_ACCEPTED
            ? 'This request already has an accepted offer, so it can no longer be bid on.'
            : 'This request is closed and can no longer be bid on.',
      };
    }
  } catch (err) {
    logger.warn(
      { jobId: job.jobId, err: (err as Error).message },
      'could not read job state before bidding; letting the transaction decide',
    );
  }

  // The on-chain bid deadline is the OFFER's acceptance validity (acceptBid
  // reverts BidExpired once it passes), not the delivery deadline (the brief's,
  // carried on the off-chain deal row). Keep the offer acceptable for the whole
  // job window so a seller approving the match minutes or hours later still funds.
  const buyerCheck = await checkBuyer(seller, job);
  if (buyerCheck?.verdict === 'pass') {
    passOnBuyer(seller, job, buyerCheck);
    return {
      ok: false,
      reason: 'buyer-record',
      message: 'Your agent passed on this request: the buyer lost more disputes than they completed.',
    };
  }

  const deadlineUnix = job.deadlineUnix;
  const priceUsdc = listing.askingPriceUsdc.toString();
  const priceWei = parseUnits(priceUsdc, USDC_DECIMALS);

  try {
    const txResult = await placeOffer(seller.walletId, seller.address, job.jobId, priceWei, deadlineUnix);

    activeBids.set(key, {
      seller,
      jobContext: job,
      lastBidPrice: priceUsdc,
      originalBidPriceUsdc: priceUsdc,
      counterRounds: 0,
      finalized: false,
      responding: false,
      listingAskingPriceUsdc: listing.askingPriceUsdc,
      listingFloorUsdc: listing.floorUsdc,
      ...(buyerCheck ? { buyerCheck, humanReview: buyerCheck.verdict === 'review' } : {}),
    });
    scheduleActiveBidsPersist();

    bus.emitEvent({
      type: 'bid.submitted',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        priceUsdc,
        deadlineUnix,
        source: 'listing',
        listingFloorUsdc: listing.floorUsdc,
        txHash: txResult.txHash,
        buyerChecked: !!buyerCheck,
      },
    });
    logger.info(
      { jobId: job.jobId, seller: seller.address, priceUsdc, floor: listing.floorUsdc, ...txResult },
      'listing-driven bid submitted',
    );
    return { ok: true, txHash: txResult.txHash };
  } catch (err) {
    // The raw string goes to the log, where it is useful. What comes back is
    // the classified message, because the Circle SDK collapses every contract
    // revert into a bare "tx FAILED" and handing that to a seller is neither
    // an explanation nor something we should be showing outside the building.
    const info = classifyAgentError(err);
    logger.error(
      { jobId: job.jobId, seller: seller.address, code: info.code, err: info.raw },
      'listing-driven submitBid failed',
    );
    return { ok: false, reason: info.code, message: info.message };
  }
}

function bidKey(jobId: string, sellerAddress: string): string {
  return `${jobId.toLowerCase()}:${sellerAddress.toLowerCase()}`;
}

function logDedupeKey(label: string, log: Log): string {
  const tx = (log as unknown as { transactionHash?: string }).transactionHash ?? '';
  const idx = (log as unknown as { logIndex?: number }).logIndex ?? '';
  return `${label}:${tx}:${idx}`;
}

/// Starts the multi-tenant seller agent. One set of watchers serves every user:
/// each posted job is evaluated by every activated user who has a seller
/// profile, and each bids through their own seller agent wallet.
export function startSellerAgents() {
  logger.info({ board: marketBoard().kind }, 'seller agent starting (multi-tenant)');

  // Who sells what, in memory (view 41): the match for a new request reads it
  // instead of every profile; a save refreshes one entry.
  void sellerIndex
    .rebuild()
    .then((n) => logger.info({ sellers: n }, 'seller index built'))
    .catch((err: Error) => logger.warn({ err: err.message }, 'seller index build failed, built on first request'));

  // The board delivers in order (view 40); the reconciler below is the extra
  // backstop.
  const board = marketBoard();
  const unwatchPosted = board.watch(
    'JobPosted',
    (logs) => {
      for (const log of logs) safe('JobPosted', () => handleJobPosted(log as never));
    },
    (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  );

  const unwatchCounter = board.watch(
    'CounterOfferIssued',
    (logs) => {
      for (const log of logs) safe('CounterOfferIssued', () => handleCounterOffer(log as never));
    },
    (err) => logger.error({ err: err.message }, 'CounterOfferIssued watch error'),
  );

  // Periodic safety net for missed websocket JobPosted events.
  const stopReconciler = startSellerReconciler();

  // Best and final (view 35): the invited agents each answer once, from their own floor.
  const unsubBestAndFinal = bus.subscribe((e) => {
    if (e.type !== 'request.best-and-final' || !e.jobId) return;
    const sellers = Array.isArray(e.payload?.sellers) ? (e.payload.sellers as string[]) : [];
    if (sellers.length) reviseStandingOffers(e.jobId, 'best-and-final', sellers);
  });

  return () => {
    unwatchPosted();
    unwatchCounter();
    stopReconciler();
    unsubBestAndFinal();
    logger.info('seller agent stopped');
  };
}

function safe(label: string, fn: () => Promise<unknown>) {
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      // reportError handles logger + errorTracker ring buffer + system.error
      // emit. Also keep the legacy agent.error bus event so the timeline UI
      // continues to render the "Agent hit an error · seller" row with the
      // scope chip; that surface is separate from the operator dashboard.
      reportError(`agents.seller.${label}`, err);
      const message = err instanceof Error ? err.message : String(err);
      bus.emitEvent({
        type: 'agent.error',
        actor: 'seller',
        payload: { scope: label, message },
      });
    });
}

/// Sellers already evaluated for a given job (bid OR skipped OR excluded),
/// keyed by jobId. Lets the periodic reconciler re-run a job's scan without
/// re-evaluating sellers that were already handled, so a rescan only picks up
/// sellers the live listener missed and never double-bids or spams skip events.
const evaluatedSellers = new Map<string, Set<string>>();

async function handleJobPosted(log: Log, opts?: { rescan?: boolean }) {
  const dedupeKey = logDedupeKey('JobPosted', log);
  // The live path dedupes per JobPosted log. The reconciler passes rescan:true
  // to bypass that and re-enter the scan; the per-seller guard below keeps it
  // idempotent, so an already-fully-scanned job is a cheap no-op on rescan.
  if (!opts?.rescan) {
    if (handledEvents.has(dedupeKey)) return;
    handledEvents.add(dedupeKey);
  }

  const args = (log as unknown as { args: JobPostedArgs }).args;
  const jobId = args.jobId;
  // Operator-seeded requests stay out of agent bidding and the offer scan; at
  // market-seeding volume each one would pay the model once per seller and offer.
  // People still find them in the market and respond by hand.
  if (getBrief(jobId)?.seedKey) return;
  // The sweep re-enters every recent request. Skip the ones that no longer take
  // offers, so a matched, funded, expired or cancelled request stops costing a
  // model call per seller on every pass and after every restart.
  if (opts?.rescan) {
    const { isJobClosedForOffers } = await import('./buyer.js');
    if (isJobClosedForOffers(jobId)) return;
  }

  // Keep a user's own seller agent out of their own auction.
  const excludeSeller = (await siblingSellerAddress(args.buyer))?.toLowerCase();
  const evaluated = evaluatedSellers.get(jobId) ?? new Set<string>();
  evaluatedSellers.set(jobId, evaluated);

  // Pull off-chain brief metadata if the buyer posted via our API. Lets the
  // LLM bid decision evaluate topical match against the seller's profile.
  const brief = getBrief(jobId);
  // Brief keywords power the deterministic topical guard in evaluateAndBid. They
  // are extracted fire-and-forget at post time, so on a fresh brief they may not
  // have landed yet when this fires. Extract once here (shared across every
  // seller's evaluation below) so the guard always has tags to judge against,
  // instead of racing the post-time extraction and silently skipping the check.
  let briefKeywords = brief?.keywords ?? [];
  if (briefKeywords.length === 0 && brief?.briefText) {
    briefKeywords = await extractKeywords(brief.briefText, `brief-match:${jobId}`);
  }
  const baseJob: JobContext = sellerViewOfRequest({
    jobId,
    buyer: args.buyer,
    budgetUsdc: formatUnits(args.budget, USDC_DECIMALS),
    deadlineUnix: Number(args.deadline),
    termsHash: args.termsHash,
    keywords: briefKeywords,
    brief: brief ?? undefined,
  });

  // Who hears of this request (view 41): every seller on the market sharing a
  // word with it, plus at most MATCH_CANDIDATE_LIMIT without one for the model
  // judge, read from the in-memory index instead of every profile in the store.
  if (!sellerIndex.isBuilt()) await sellerIndex.rebuild();
  const candidates = rankSellers(sellerIndex.entries(), {
    jobId,
    keywords: briefKeywords,
    briefText: brief?.briefText,
    sourcingSector: brief?.counterpartyCompany?.sector ?? null,
    tradeType: brief?.tradeType ?? null,
    where: brief?.where ?? null,
  });
  if (!opts?.rescan) recordPosted(jobId, brief?.createdAt ?? Date.now());
  const sellers = await resolveSellerProfilesForUsers([...candidates.byWords, ...candidates.toJudge].map((s) => s.userAddress));
  logger.info(
    { jobId, byWords: candidates.byWords.length, toJudge: candidates.toJudge.length, skipped: candidates.skipped, resolved: sellers.length },
    'request matched against the seller index',
  );
  if (sellers.length === 0) return;

  // Read the buyer's deterministic signals once and share across every seller
  // evaluation. Saves N reputation reads and keeps the read window aligned.
  try {
    const buyerSig = await actorSignalsFor(args.buyer);
    baseJob.buyerReputationBps = buyerSig.reputationBps;
    baseJob.buyerRepTier = buyerSig.repTier;
    baseJob.buyerCompletionRate = buyerSig.completionRate;
    baseJob.buyerVelocity24h = buyerSig.velocity24h;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'buyer signals lookup failed, falling back to neutral',
    );
  }

  // Order the sweep the way a human works their contacts: providers this buyer
  // has closed clean deals with before ("my regulars") first, then proven tiers,
  // then everyone else in registry order. The old registration-order serial scan
  // put diligent elite sellers at the back where their bid landed after the
  // buyer's collection window (deal 0x29e498: ELITE match-95 bid 7s late, a COLD
  // match-80 got the deal).
  const buyerOwner = (await findAgentWalletByAgentAddress(args.buyer))?.userAddress ?? null;
  let familiar = new Map<string, number>();
  if (buyerOwner) {
    try {
      familiar = await cleanDealPartnersFor(buyerOwner);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'familiarity lookup failed, sweeping unordered');
    }
  }
  // Precompute both sort keys once per seller; the comparator runs O(n log n)
  // times and getTierState reads a file per call.
  const sweepKey = new Map<string, { familiarity: number; tier: number }>();
  for (const s of sellers) {
    sweepKey.set(s.address, {
      familiarity:
        familiar.get(s.userAddress.toLowerCase()) ?? familiar.get(s.address.toLowerCase()) ?? 0,
      tier: EVAL_TIER_RANK[getTierState(s.userAddress)?.tier ?? 'NEW'] ?? 0,
    });
  }
  const ordered = [...sellers].sort((a, b) => {
    const ka = sweepKey.get(a.address)!;
    const kb = sweepKey.get(b.address)!;
    return kb.familiarity - ka.familiarity || kb.tier - ka.tier;
  });

  // Evaluate concurrently (bounded) instead of one-by-one. Each evaluation is
  // an LLM decision plus, for research-active sellers, a bounded research
  // await, so a serial sweep spread bids over 60-90s and the window missed the
  // tail. Every in-flight evaluation is tracked so the buyer's collection
  // window can hold until the market has actually answered. A single seller's
  // failure no longer aborts the rest of the sweep.
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(EVAL_CONCURRENCY, ordered.length)) },
    async () => {
      while (cursor < ordered.length) {
        const seller = ordered[cursor++]!;
        const sellerLower = seller.address.toLowerCase();
        // Skip sellers already handled for this job (idempotent rescans).
        if (evaluated.has(sellerLower)) continue;
        if (sellerLower === excludeSeller) {
          // The buyer's own seller agent is kept out of their own request so they
          // don't bid against themselves. Emit it so the owner sees why their seller
          // stood down instead of wondering where their bid went (the silent skip
          // here read as "my agent ignored my request").
          evaluated.add(sellerLower);
          bus.emitEvent({
            type: 'agent.skipped',
            jobId,
            actor: 'seller',
            payload: {
              seller: seller.address,
              reason: 'own-auction',
              detail: 'This is your own seller agent. Karwan keeps it out of your own request so you never bid against yourself.',
            },
          });
          continue;
        }
        if (activeBids.has(bidKey(jobId, seller.address))) {
          evaluated.add(sellerLower);
          continue;
        }
        evaluationStarted(jobId);
        try {
          await evaluateAndBid(seller, { ...baseJob });
          recordDecision(jobId, Date.now());
          // Marked only on success, so the reconciler's rescan retries a seller
          // whose evaluation failed instead of writing them off for the job.
          evaluated.add(sellerLower);
        } catch (err) {
          logger.warn(
            { jobId, seller: seller.address, err: (err as Error).message },
            'seller evaluation failed, continuing the sweep',
          );
        } finally {
          evaluationFinished(jobId);
        }
      }
    },
  );
  await Promise.all(workers);

  // After profile-driven evaluation, scan open listings against this fresh
  // brief so listings posted BEFORE the brief still match. Listings posted
  // AFTER a brief are handled by the listings route's scanBriefsForListing.
  // The shared activeBids dedupe prevents a profile-bid + listing-bid race.
  try {
    const { scanListingsForBrief } = await import('../routes/listings.js');
    await scanListingsForBrief({ ...baseJob });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'scanListingsForBrief failed');
  }
}

/// The seller agent researches an open order before pricing it, so it arrives
/// informed even when its principal is away. Gated on the SELLER owner having
/// agent research active (and the platform x402 rail configured); metered
/// against that account. Writes the order's demand into the shared heat cache
/// so the seller anchoring (and the buyer, on the same keywords) negotiates
/// tuned to it. Keyword-scoped, never tied to the counterparty. Best-effort.
async function maybeSellerResearch(
  seller: SellerProfile,
  keywords: string[],
  jobId: string,
): Promise<void> {
  if (!config.X402_PAID_SIGNALS_ENABLED || !config.X402_BASE_PRIVATE_KEY) return;
  if (keywords.length === 0) return;
  try {
    // General baseline: the seller agent researches the order regardless of any
    // per-agent activation. The platform fronts the call and the cost is settled
    // on the matched pair at match (buyer.ts persistApprovedMatch), not here.
    const read = await researchMarket(keywords, undefined, {
      onPayment: async (notice) => {
        await recordExternalResearchPayment({
          notice,
          actor: 'seller',
          agent: 'seller',
          jobId,
          owner: seller.address,
          scope: 'matching',
        });
      },
      onFailure: (notice) => {
        recordExternalResearchFailure({
          notice,
          actor: 'seller',
          agent: 'seller',
          jobId,
          scope: 'matching',
        });
      },
    });
    publishMarketEvidenceAcquisitionShadow(read, jobId);
    setResearchHeat(keywords, read);
    logger.info(
      { seller: seller.address, demand: read.demand, cached: read.cached },
      'seller agent researched the order before pricing',
    );
  } catch (err) {
    logger.warn(
      { seller: seller.address, err: (err as Error).message },
      'seller market research failed (non-fatal)',
    );
  }
}

/// The buyer's passport the seller agent pulled for a job, keyed by jobId. Lets
/// the seller vet the buyer it is negotiating with: the opening pull is fired
/// non-blocking, lands here, and the counter round reads it to lean its
/// concession on the buyer's real reliability. Short-lived, cleared lazily on a
/// stale TTL so the map cannot grow without bound.
const sellerBuyerPassport = new Map<string, { signal: PaidPassportSignal; at: number }>();
const SELLER_PASSPORT_TTL_MS = 60 * 60 * 1000;

function cachedBuyerPassport(jobId: string): PaidPassportSignal | undefined {
  const hit = sellerBuyerPassport.get(jobId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > SELLER_PASSPORT_TTL_MS) {
    sellerBuyerPassport.delete(jobId);
    return undefined;
  }
  return hit.signal;
}

/// The seller agent's paid pull of the buyer's passport for a job, if it ran and
/// is still cached. Read at deal creation so the pull is persisted durably on
/// the deal (the seller-side mirror of `proposal.paidSignal`), letting the
/// counterparty report gate the buyer's record on the payment that bought it.
export function getSellerBuyerPassport(jobId: string): PaidPassportSignal | undefined {
  return cachedBuyerPassport(jobId);
}

/// Store a seller-side buyer-passport pull. Written by the match-time
/// verification (which runs in the buyer process) so the deal's passportPulls
/// can read the seller's paid check on the buyer at accept.
export function setSellerBuyerPassport(jobId: string, signal: PaidPassportSignal): void {
  sellerBuyerPassport.set(jobId, { signal, at: Date.now() });
}

const BUYER_READ_TIMEOUT_MS = 10_000;

/// Before bidding, the seller's agent pays to read the buyer's record and
/// weighs it against this request. A read that fails or is refused (the buyer
/// has not allowed reads) never blocks the bid. A read that lands after the
/// agent stopped waiting was still paid for, so it is kept on the bid.
async function checkBuyer(seller: SellerProfile, job: JobContext): Promise<BuyerCheck | null> {
  if (!config.SHORTLIST_MODE || !config.RECORD_READS_ENABLED) return null;
  const poster = getBrief(job.jobId)?.postedBy;
  const owner = await findAgentWalletByAgentAddress(seller.address).catch(() => null);
  if (!poster || !owner) return null;
  const requestUsdc = Number(job.budgetUsdc) || 0;
  const reading = paidRecordRead(seller.address, poster, { purpose: 'bid', ref: job.jobId, forAccount: owner.userAddress })
    .then((r) => assessBuyer(r.read, requestUsdc, { paidUsdc: r.amountUsd, receipt: r.transaction || null, checkedAt: Date.now() }))
    .catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inTime = await Promise.race([
    reading,
    new Promise<'late'>((resolve) => {
      timer = setTimeout(() => resolve('late'), BUYER_READ_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  if (inTime !== 'late') return inTime;
  void reading.then((check) => {
    if (check) attachLateBuyerCheck(job.jobId, seller.address, check);
  });
  return null;
}

function attachLateBuyerCheck(jobId: string, sellerAddress: string, check: BuyerCheck): void {
  const bid = activeBids.get(bidKey(jobId, sellerAddress));
  if (!bid || bid.buyerCheck) return;
  bid.buyerCheck = { ...check, late: true };
  if (check.verdict !== 'bid') bid.humanReview = true;
  scheduleActiveBidsPersist();
}

function passOnBuyer(seller: SellerProfile, job: JobContext, check: BuyerCheck): void {
  bus.emitEvent({
    type: 'agent.skipped',
    jobId: job.jobId,
    actor: 'seller',
    payload: {
      seller: seller.address,
      reason: 'buyer-dispute-record',
      detail: 'The buyer lost more disputes than they completed.',
    },
  });
  recordBidOutcomes([
    {
      jobId: job.jobId.toLowerCase(),
      sellerAgent: seller.address,
      title: requestTitle(job.briefText),
      outcome: 'passed',
      lastPrice: '0',
      at: Date.now(),
      buyerCheck: check,
    },
  ]);
}

/// A request that fits but sits outside the person's limits, or one their agent
/// waits on them for: one question with a suggested answer, on every channel,
/// and the buyer hears that the seller is checking (view 41).
async function askSellerOwner(
  seller: SellerProfile,
  job: JobContext,
  kind: import('../db/agentQuestions.js').QuestionKind,
  suggested: { priceUsdc: string; days: number },
  limit: number | null,
): Promise<void> {
  if (!seller.userAddress) return;
  const dueDays = Math.max(1, Math.ceil((job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400));
  await askOwner({
    owner: seller.userAddress,
    side: 'seller',
    jobId: job.jobId,
    kind,
    title: requestTitle(job.briefText) ?? '',
    budgetUsdc: job.budgetUsdc,
    dueDays,
    limit,
    suggested,
    counterpartUser: getBrief(job.jobId)?.postedBy ?? null,
  });
  bus.emitEvent({
    type: 'agent.decision',
    jobId: job.jobId,
    actor: 'seller',
    payload: { seller: seller.address, stage: 'limits', decision: 'asked-owner', kind },
  });
  logger.info({ jobId: job.jobId, seller: seller.address, kind }, 'request outside the limits: owner asked');
}

async function evaluateAndBid(profile: SellerProfile, job: JobContext) {
  const tradeType = getBrief(job.jobId)?.tradeType;
  const seller = sellerForRequest(profile, tradeType);
  // Limits decide whether the agent offers or asks its person, never whether
  // the person hears of a request that fits (view 41). Fit is judged below,
  // so a request outside the limits is held here and asked about after it.
  const limits = limitDecision({
    seller,
    job,
    nowUnix: Math.floor(Date.now() / 1000),
    hasWay: !profile.ways || fittingWay(profile.ways, tradeType) !== null,
  });

  // One offer per seller per request: when the seller already named their own
  // price here, the agent stays out. Its bid would overwrite that offer on chain
  // and run a second negotiation the seller never asked for. If the lookup
  // fails, stand down too: missing one bid is cheaper than replacing a price a
  // person set.
  let ownOffer = true;
  try {
    ownOffer = (await directOfferLookup(job.jobId, seller.address.toLowerCase())) !== null;
  } catch (err) {
    logger.warn({ jobId: job.jobId, err: (err as Error).message }, 'direct offer lookup failed before an agent bid');
  }
  if (ownOffer) {
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: { seller: seller.address, reason: 'seller-own-offer', detail: 'The seller already sent their own offer on this request.' },
    });
    return;
  }

  // Finance-lane (SME/B2B trade-finance) requests only accept bids from verified
  // business sellers. A person seller's agent stands down so the finance lane
  // never leaks into the P2P seller pool. Service-lane requests are open to all.
  if ((job.tradeLane ?? 'service') === 'finance') {
    const ownerWallet = await findAgentWalletByAgentAddress(seller.address);
    const ownerType = ownerWallet ? await accountTypeOf(ownerWallet.userAddress) : 'person';
    if (ownerType !== 'business') {
      bus.emitEvent({
        type: 'agent.skipped',
        jobId: job.jobId,
        actor: 'seller',
        payload: {
          seller: seller.address,
          reason: 'finance-lane-requires-business',
          detail: 'This is an SME trade-finance request. Only verified business sellers bid here.',
        },
      });
      return;
    }
  }

  // Goods and in-person work only go where the seller delivers. When the agent
  // does not know yet, it stays out of this deal and asks the seller once.
  const brief = getBrief(job.jobId);
  const kind = brief ? kindOf(brief) : 'remote';
  if (kind !== 'remote') {
    const [sellerOwner, buyerOwner] = await Promise.all([
      findAgentWalletByAgentAddress(seller.address).catch(() => null),
      findAgentWalletByAgentAddress(job.buyer).catch(() => null),
    ]);
    if (sellerOwner && buyerOwner) {
      const [sellerLoc, buyerLoc] = await Promise.all([locationOf(sellerOwner.userAddress), locationOf(buyerOwner.userAddress)]);
      const buyerCountry = buyerLoc?.country ?? null;
      const gate = (await deliveryQuestions.isUnreachable(sellerOwner.userAddress))
        ? 'bid'
        : reachGate({ kind, where: brief?.where, seller: sellerLoc, buyerCountry, now: Date.now() });
      if (gate !== 'bid') {
        const asked = brief?.where?.scope === 'country' ? brief.where.country?.toUpperCase() : buyerCountry;
        if (gate === 'ask' && asked) await deliveryQuestions.queue(sellerOwner.userAddress, asked);
        bus.emitEvent({
          type: 'agent.skipped',
          jobId: job.jobId,
          actor: 'seller',
          payload: {
            seller: seller.address,
            reason: gate === 'ask' ? 'delivery-unknown' : 'delivery-no',
            detail: gate === 'ask' ? 'Asking the seller whether they deliver to the buyer\'s country first.' : 'The seller does not deliver to the buyer\'s country.',
          },
        });
        return;
      }
    }
  }

  // The verified network: a seller whose work is not verified is not put in
  // front of buyers.
  if (config.VERIFIED_NETWORK_ONLY && !config.SHORTLIST_MODE) {
    const ownerWallet = await findAgentWalletByAgentAddress(seller.address);
    const gate = sellerMayBid({ enabled: true, level: ownerWallet ? await levelOf(ownerWallet.userAddress) : 'registered' });
    if (!gate.ok) {
      bus.emitEvent({
        type: 'agent.skipped',
        jobId: job.jobId,
        actor: 'seller',
        payload: { seller: seller.address, reason: gate.reason, detail: gate.detail },
      });
      return;
    }
  }

  if (job.buyerReputationBps < 3000) {
    logger.info(
      { jobId: job.jobId, seller: seller.address, score: job.buyerReputationBps },
      'skipping: buyer reputation too low',
    );
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        reason: 'buyer-reputation-too-low',
        detail: `buyer reputation ${job.buyerReputationBps} bps is below the 3000 bps minimum`,
        buyerReputationBps: job.buyerReputationBps,
      },
    });
    return;
  }

  // Topical match: substring overlap on the meaningful tokens from both sides.
  // The keyword extractor is now prompt-tuned to emit related roles + adjacent
  // skills (a "Backend Engineer" profile tags `api`/`service`; an "API service"
  // request tags `backend`/`developer`), so the deterministic gate catches most
  // legitimate matches without an LLM call.
  //
  // When the deterministic gate still finds zero overlap, run an LLM relevance
  // bridge once before skipping. This handles older profiles whose tags were
  // extracted under the narrow prompt, and any borderline case where the two
  // sides describe the same thing in non-overlapping language. judgeRelevance
  // is cached per (briefTags, sellerTags, profile) so a brief that triggers
  // the bridge across N seller agents costs at most N cache writes, not N×LLM.
  const briefTags = job.keywords ?? [];
  const sellerTags = [...(seller.keywords ?? []), ...(seller.skills ?? [])];
  if (briefTags.length > 0 && sellerTags.length > 0 && topicalOverlap(briefTags, sellerTags) === 0) {
    // B2B sector fit is a strong relevance signal on its own: a supplier in the
    // brief's sourcing sector is a real partner even when the free-text tokens
    // don't overlap ("500kg shea butter" vs a seller tagged "agriculture, bulk
    // commodities"). When the sector fits, skip the LLM bridge and proceed.
    let sectorFit = false;
    if (job.sourcingSector) {
      try {
        const ownerWallet = await findAgentWalletByAgentAddress(seller.address);
        const ownerSector = ownerWallet
          ? (await getProfile(ownerWallet.userAddress))?.smeProfile?.sector
          : undefined;
        sectorFit =
          !!ownerSector && ownerSector.toLowerCase() === job.sourcingSector.toLowerCase();
      } catch {
        /* leave false; fall through to the LLM relevance bridge */
      }
    }
    if (sectorFit) {
      logger.info(
        { jobId: job.jobId, seller: seller.address, sourcingSector: job.sourcingSector },
        'zero keyword overlap but sourcing sector fits; proceeding',
      );
      bus.emitEvent({
        type: 'agent.decision',
        jobId: job.jobId,
        actor: 'seller',
        payload: {
          seller: seller.address,
          stage: 'relevance',
          decision: 'sector-fit',
          source: 'deterministic',
          detail: `Sourcing sector "${job.sourcingSector}" matches this seller's sector; bidding despite no keyword overlap.`,
          signals: { sourcingSector: job.sourcingSector },
        },
      });
    } else {
    const judgement = await judgeRelevance({
      briefText: job.briefText,
      briefTags,
      sellerProfile: `${seller.displayName}: ${seller.bio}`,
      sellerTags,
    });
    if (!judgement.relevant || judgement.confidence < 0.6) {
      logger.info(
        { jobId: job.jobId, seller: seller.address, judgement, briefTags, sellerTags },
        'skipping: deterministic overlap zero + LLM relevance bridge declined',
      );
      bus.emitEvent({
        type: 'agent.skipped',
        jobId: job.jobId,
        actor: 'seller',
        payload: {
          seller: seller.address,
          reason: 'no-topical-overlap',
          detail: judgement.reasoning || 'the seller cannot fulfill this brief',
          briefTags,
          sellerTags,
          relevance: judgement,
        },
      });
      return;
    }
    // Bridge said yes. Surface the agent's reasoning so the timeline reflects
    // why a brief and seller with no shared tokens are now being matched.
    logger.info(
      { jobId: job.jobId, seller: seller.address, judgement },
      'topical overlap zero but LLM relevance bridge confirmed; proceeding',
    );
    bus.emitEvent({
      type: 'agent.decision',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        stage: 'relevance',
        decision: 'bridged',
        source: 'llm',
        detail: judgement.reasoning,
        signals: { confidence: judgement.confidence, briefTags, sellerTags },
      },
    });
    }
  }

  // An offer from an agent not linked to its person would fund an escrow whose
  // record lands on the agent. Hold it and say how to link.
  const linkOwner = await findAgentWalletByAgentAddress(seller.address);
  if (linkOwner?.userAddress) {
    const link = await sellerAgentBinding(seller.address, linkOwner.userAddress);
    if (blocksOffer(link)) {
      logger.info({ jobId: job.jobId, seller: seller.address, link: link.kind }, 'skipping: seller agent not linked to its owner');
      bus.emitEvent({
        type: 'agent.skipped',
        jobId: job.jobId,
        actor: 'seller',
        payload: { seller: seller.address, reason: 'agent-not-linked', detail: SELLER_LINK_DETAIL },
      });
      return;
    }
  }

  if (!limits.act) {
    if (limits.kind === 'polite-no') {
      // Under the level the person set for not being asked (view 41): a no with
      // the door open, counted for their daily summary, never a question.
      bus.emitEvent({
        type: 'agent.declined',
        jobId: job.jobId,
        actor: 'seller',
        payload: {
          seller: seller.address,
          reason: 'no-ask-below',
          polite: true,
          detail: 'The budget is under the level the seller set for not being asked.',
          reasonLine: fallbackReason({ move: 'declined', priceUsdc: Number(limits.suggested.priceUsdc) }),
        },
      });
      return;
    }
    await askSellerOwner(seller, job, limits.kind, limits.suggested, limits.limit);
    return;
  }

  // Trusted Match: filter sellers whose stake can't cover the worst-case
  // reservation. freeStakeOf reads against the identity wallet (where stake
  // lives), not the seller agent.
  if (job.trustedMatch) {
    try {
      const reservationBps = await getReservationBps();
      // Karwan's own stake check, so it reads the leeway from the request record.
      const tolerance = getBrief(job.jobId)?.negotiationMaxIncreasePct ?? 0;
      const maxDealUsdc = Number(job.budgetUsdc) * (1 + tolerance / 100);
      const maxDealWei = parseUnits(maxDealUsdc.toFixed(2), USDC_DECIMALS);
      const requiredWei = (maxDealWei * BigInt(reservationBps)) / 10000n;
      const sellerWallet = await findAgentWalletByAgentAddress(seller.address);
      const stakeOwner = (sellerWallet?.userAddress ?? seller.address) as `0x${string}`;
      const sellerFreeWei = (await vault.read.freeStakeOf([stakeOwner])) as bigint;
      if (sellerFreeWei < requiredWei) {
        const requiredUsdc = formatUnits(requiredWei, USDC_DECIMALS);
        const freeUsdc = formatUnits(sellerFreeWei, USDC_DECIMALS);
        logger.info(
          { jobId: job.jobId, seller: seller.address, stakeOwner, requiredUsdc, freeUsdc },
          'skipping: insufficient free stake for trusted match',
        );
        publishStakeQualificationShadow(
          job,
          seller,
          stakeOwner,
          sellerWallet?.sellerAddress ?? seller.address,
          requiredUsdc,
          freeUsdc,
          reservationBps,
        );
        bus.emitEvent({
          type: 'agent.skipped',
          jobId: job.jobId,
          actor: 'seller',
          payload: {
            seller: seller.address,
            reason: 'insufficient-stake-trusted-match',
            detail: `Trusted Match needs at least ${requiredUsdc} USDC free stake. You have ${freeUsdc} USDC staked. Top up at /stake to bid on requests like this.`,
            requiredReservationUsdc: requiredUsdc,
            freeStakeUsdc: freeUsdc,
            reservationBps,
          },
        });
        return;
      }
    } catch (err) {
      // Vault read failed. Fall through and let the chain-side acceptEscrow
      // enforce the rule. Surfacing a clear "couldn't accept" later beats
      // silently dropping a real bid because of a transient RPC hiccup.
      logger.warn(
        { jobId: job.jobId, err: (err as Error).message },
        'freeStake read failed for trusted-match gate; falling through',
      );
    }
  }

  let decision;
  try {
    const result = await withLlmRetry(`bidDecision(${job.jobId})`, () =>
      generateObject({
        model: negotiationModel,
        schema: bidDecisionSchema,
        prompt: buildBidEvaluationPrompt(job, seller),
      }),
    );
    decision = result.object;
  } catch (err) {
    const message = (err as Error).message;
    // The deterministic gates above (budget/deadline range, buyer reputation,
    // and the topical keyword overlap) already cleared this job, so the LLM's
    // only remaining job was a bid/skip judgment call. Dropping a qualified
    // seller because the model hiccuped is exactly the "fail toward silence" we
    // forbid. Fall back to bidding; sellerOpeningBid computes the real opening
    // deterministically, and the buyer agent plus the two human gates still
    // filter from here. (docs/agent.md, rules R1/R2.)
    logger.warn(
      { jobId: job.jobId, err: message },
      'bid LLM call failed; bidding on the deterministic floor',
    );
    reportError('agents.seller.bidDecision', err, { jobId: job.jobId, seller: seller.address });
    bus.emitEvent({
      type: 'agent.fallback',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        scope: 'bidDecision',
        message,
        decision: 'bid',
        reasoning:
          'LLM unavailable; budget, deadline, and topical checks passed, so bidding at the deterministic opening.',
      },
    });
    decision = {
      decision: 'bid' as const,
      confidence: 0.95,
      suggestedPrice: String(Math.max(seller.minBudgetUsdc, Number(job.budgetUsdc))),
      suggestedDeadlineDays: seller.minDeadlineDays,
      reasoning: 'deterministic fallback (LLM unavailable)',
    };
  }

  logger.info({ jobId: job.jobId, seller: seller.address, decision }, 'llm decision');

  if (decision.decision === 'skip' || decision.confidence < seller.confidenceThreshold) {
    logger.info({ jobId: job.jobId, confidence: decision.confidence }, 'skipping: low confidence');
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: { seller: seller.address, reason: 'low-confidence-or-skip', decision },
    });
    return;
  }

  // Each seller agent prices INDEPENDENTLY from its own range, with no view of
  // other bids, so a multi-seller auction spreads out instead of every seller
  // converging on the buyer's ceiling. The opening number is deterministic per
  // seller (seeded by the seller address) within [floor, min(sellerMax, buyer
  // ceiling)] and biased by the buyer's reputation tier. The buyer agent is the
  // one that sees the incoming bids and ranks them by reputation and price.
  const buyerTier = (job.buyerRepTier ?? 'established') as Tier;
  // Research the order first (gated on this seller's agent-research activation),
  // then price by the deal's market heat. Keying on the brief's keywords (the
  // order) rather than the seller's generic skills means the seller and buyer
  // agents share one heat signal for the same deal. Hot -> hold nearer the
  // buyer's ceiling; soft -> price nearer the posted budget.
  const dealKeywords =
    (job.keywords ?? []).length > 0
      ? job.keywords!
      : [...(seller.keywords ?? []), ...(seller.skills ?? [])];
  // Fire research WITHOUT blocking the bid. The paid Exa web search plus LLM
  // synthesis took ~15s, and whichever seller evaluated first ate that latency,
  // pushing its bid past the buyer's collection window so it missed the auction
  // outright (deals 0xb807, 0x9922, 0xb4ec). The read is cached by keywords and
  // single-flight across agents, so the opening bid prices on whatever is
  // already warm (often the buyer's research on the same order); the fresh read
  // lands during the window and tunes the counter rounds. Mirrors the buyer's
  // non-blocking `void maybeResearchMarket`.
  // When RESEARCH_AWAIT_ENABLED, block the opening bid on the research read up
  // to an 8s deadline so the opening prices on the FRESH read (getCachedMarketPrice
  // + heat below both reflect it) instead of whatever happened to be warm. On
  // timeout we proceed exactly as the non-blocking path did — the read still
  // lands during the collection window and tunes the counter rounds. This is the
  // opening-bid half of review #3 (opening prices before research arrives).
  let researchAwaited = false;
  // "Ask me first" pays for no research; the owner sets the real price.
  const research = paysForResearch(seller.agentMode ?? 'offers');
  if (research && config.RESEARCH_AWAIT_ENABLED && dealKeywords.length > 0) {
    researchAwaited = await settledWithin(
      maybeSellerResearch(seller, dealKeywords, job.jobId),
      RESEARCH_AWAIT_DEADLINE_MS,
    );
  } else if (research) {
    void maybeSellerResearch(seller, dealKeywords, job.jobId);
  }
  // Counterparty verification is paid at MATCH, not during the auction: the
  // seller reads the buyer's credit passport when the two are matched (done in
  // the buyer process via verifyCounterpartyAtMatch), so the bidding phase stays
  // free of internal Arc receipts. Counters here price on free reputation.
  const heat = await marketHeat(dealKeywords, seller.address);
  // Under the seller's floor the agent still offers, at the floor, and the
  // buyer sees it as outside their request (view 41, decision 11).
  const atOwnPrice = limits.atOwnPriceUsdc ?? null;
  const opening = atOwnPrice
    ? Number(atOwnPrice)
    : pureSellerOpeningBid(seller, job, buyerTier, heat, getCachedMarketPrice(dealKeywords), Math.random);
  if (opening === null) {
    // Seller floor sits above the buyer's ceiling, so no price clears both
    // ranges. When the gap is small, ask the blocked side to stretch instead of
    // walking away silently (a near-miss). The guard inside maybeRaiseNearMiss
    // only fires when the seller floor genuinely exceeds the buyer ceiling.
    // The near match is Karwan's check, so it reads the leeway from the request record.
    const tol = getBrief(job.jobId)?.negotiationMaxIncreasePct ?? 0;
    const buyerCeiling = Number(job.budgetUsdc) * (1 + tol / 100);
    const raised = await maybeRaiseNearMiss({
      jobId: job.jobId,
      buyerAgent: job.buyer,
      sellerAgent: seller.address,
      deadlineUnix: job.deadlineUnix,
      buyerCeilingUsdc: buyerCeiling,
      sellerFloorUsdc: seller.minBudgetUsdc,
    });
    if (raised) {
      logger.info(
        { jobId: job.jobId, seller: seller.address, minBudget: seller.minBudgetUsdc, buyerCeiling },
        'near-miss raised: seller floor just above buyer ceiling',
      );
      return;
    }
    const days = Math.max(1, Math.ceil((job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400));
    await askSellerOwner(seller, job, 'price-below-floor', { priceUsdc: String(seller.minBudgetUsdc), days }, seller.minBudgetUsdc);
    return;
  }
  const buyerCheck = await checkBuyer(seller, job);
  if (buyerCheck?.verdict === 'pass') {
    passOnBuyer(seller, job, buyerCheck);
    return;
  }

  // "Ask me first": tell the owner about the request at this price, once, and
  // let them make the offer themselves.
  if ((seller.agentMode ?? 'offers') === 'ask') {
    const days = Math.max(seller.minDeadlineDays, Math.min(seller.maxDeadlineDays, Math.ceil((job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400)));
    await askSellerOwner(seller, job, 'ask-first', { priceUsdc: opening.toFixed(2), days }, null);
    return;
  }

  await prepareSellerRecord(seller.userAddress);

  const finalPrice = opening.toFixed(2);
  // NEW buyers, and buyers the record read sends to review, raise a
  // human-review flag so the seller looks before any match is approved.
  const humanReview = buyerTier === 'new' || buyerCheck?.verdict === 'review';

  // The on-chain bid deadline is the offer's acceptance validity (acceptBid
  // reverts BidExpired past it), not the delivery deadline (the brief's, kept on
  // the off-chain deal row). A short LLM-suggested delivery used to make the
  // offer expire in minutes, so a late match approval hit BidExpired. Keep the
  // offer acceptable for the whole job window.
  const deadlineUnix = job.deadlineUnix;
  const priceWei = parseUnits(finalPrice, USDC_DECIMALS);

  const txResult = await placeOffer(seller.walletId, seller.address, job.jobId, priceWei, deadlineUnix);

  activeBids.set(bidKey(job.jobId, seller.address), {
    seller,
    jobContext: job,
    lastBidPrice: finalPrice,
    originalBidPriceUsdc: finalPrice,
    counterRounds: 0,
    finalized: false,
    responding: false,
    humanReview,
    ...(buyerCheck ? { buyerCheck } : {}),
  });
  scheduleActiveBidsPersist();

  logger.info({ jobId: job.jobId, seller: seller.address, ...txResult }, 'bid submitted');
  bus.emitEvent({
    type: 'bid.submitted',
    jobId: job.jobId,
    actor: 'seller',
    payload: {
      seller: seller.address,
      priceUsdc: finalPrice,
      deadlineUnix,
      txHash: txResult.txHash,
      buyerTier,
      humanReview,
      buyerChecked: !!buyerCheck,
      ...(atOwnPrice ? { outsideRequest: 'price' } : {}),
      // Whether the opening priced on an awaited (fresh) research read vs a
      // best-effort warm cache. Lets the audit trail (and the eval harness) tell
      // a research-grounded opening from one that raced the read.
      researchAwaited,
    },
  });
}

/// Max time the opening bid will block on the research read when
/// RESEARCH_AWAIT_ENABLED. Chosen to stay well inside the buyer's bid-collection
/// floor so an awaited bid still lands in the auction; on timeout we proceed on
/// the warm cache exactly as the non-blocking path did.
const RESEARCH_AWAIT_DEADLINE_MS = 8_000;

/// Await a promise but give up after `ms`. Returns true if it settled (resolved
/// OR rejected — maybeSellerResearch swallows its own errors and resolves void)
/// within the deadline, false on timeout. "Settled in time" is the signal that
/// the read landed and the cache is warm for the opening bid.
async function settledWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([
    p.then(() => true, () => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

/// A buyer's counter past what the seller allowed (under their floor, or past
/// the last round): the agent asks its person instead of walking away, and the
/// buyer hears the seller is checking (view 41). The counter stays open on
/// chain until the person answers through `answerCounterQuestion`.
async function askAtFloor(
  seller: SellerProfile,
  active: ActiveBid,
  buyerPriceUsdc: string,
  floorUsdc: number,
  kind: 'counter-below-floor' | 'last-price-passed',
): Promise<void> {
  const job = active.jobContext;
  if (!seller.userAddress) {
    active.finalized = true;
    return;
  }
  const dueDays = Math.max(1, Math.ceil((job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400));
  const hold = Math.max(floorUsdc, Number(active.lastBidPrice) || floorUsdc);
  await askOwner({
    owner: seller.userAddress,
    side: 'seller',
    jobId: job.jobId,
    kind,
    title: requestTitle(job.briefText) ?? '',
    budgetUsdc: job.budgetUsdc,
    dueDays,
    limit: Number(floorUsdc.toFixed(2)),
    suggested: { priceUsdc: (kind === 'last-price-passed' ? hold : floorUsdc).toFixed(2), days: dueDays },
    theirPriceUsdc: buyerPriceUsdc,
    counterpartUser: getBrief(job.jobId)?.postedBy ?? null,
  });
  bus.emitEvent({
    type: 'agent.decision',
    jobId: job.jobId,
    actor: 'seller',
    payload: { seller: seller.address, stage: 'counter', decision: 'asked-owner', kind, buyerCounterPrice: buyerPriceUsdc },
  });
}

/// The person's answer to a counter question: take the buyer's price, hold at
/// a price of their own, or walk away politely with the door open.
export async function answerCounterQuestion(
  jobId: string,
  sellerUser: string,
  answer: { choice: 'yes' | 'change' | 'no'; priceUsdc?: string; theirPriceUsdc?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const owner = sellerUser.toLowerCase();
  const active = [...activeBids.values()].find(
    (b) => b.jobContext.jobId.toLowerCase() === jobId.toLowerCase() && b.seller.userAddress?.toLowerCase() === owner,
  );
  if (!active || active.finalized) return { ok: false, message: 'This negotiation has already ended.' };
  const { seller } = active;
  if (answer.choice === 'no') {
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: active.jobContext.jobId,
      actor: 'seller',
      payload: { seller: seller.address, reason: 'owner-declined', detail: 'Thanks, the seller cannot do this price. If it changes, they are here.', reasonLine: fallbackReason({ move: 'declined', priceUsdc: Number(active.lastBidPrice) }) },
    });
    scheduleActiveBidsPersist();
    return { ok: true };
  }
  const accept = answer.choice === 'yes';
  const price = accept ? 0n : parseUnits(answer.priceUsdc ?? active.lastBidPrice, USDC_DECIMALS);
  const deadline = accept ? 0 : active.jobContext.deadlineUnix;
  const result = await respondToCounter(seller.walletId, seller.address, active.jobContext.jobId, accept, price, deadline);
  if (accept) {
    active.finalized = true;
    recordAgreement({
      jobId: active.jobContext.jobId,
      side: 'seller',
      agreedUsdc: Number(answer.theirPriceUsdc ?? active.lastBuyerPrice ?? active.lastBidPrice),
      floorUsdc: seller.minBudgetUsdc * orderSize(seller, active.jobContext),
      usualUsdc: seller.usualPriceUsdc,
      exchanges: active.counterRounds,
      at: Date.now(),
    });
  } else {
    active.counterRounds += 1;
    active.lastBidPrice = answer.priceUsdc ?? active.lastBidPrice;
  }
  bus.emitEvent({
    type: 'counter.response.submitted',
    jobId: active.jobContext.jobId,
    actor: 'seller',
    payload: accept
      ? { accepted: true, txHash: result.txHash, by: 'owner' }
      : { accepted: false, counterPrice: answer.priceUsdc ?? active.lastBidPrice, txHash: result.txHash, by: 'owner' },
  });
  scheduleActiveBidsPersist();
  return { ok: true };
}

async function handleCounterOffer(log: Log) {
  const args = (log as unknown as { args: CounterOfferIssuedArgs }).args;

  const dedupeKey = logDedupeKey('CounterOfferIssued', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  // The counter names a seller agent address; only act if it is one of ours.
  const seller = await resolveSellerProfile(args.seller);
  if (!seller) return;

  const active = activeBids.get(bidKey(args.jobId, seller.address));
  if (!active || active.finalized) return;
  // Per-(jobId,seller) mutex. If a redelivered event reaches us while we're already
  // running the LLM or broadcasting a respondToCounter tx, drop it.
  if (active.responding) return;
  active.responding = true;

  try {
    await runCounterEvaluation(seller, active, args);
  } finally {
    active.responding = false;
    // Persist the post-round state (counterRounds, lastBidPrice, or finalized)
    // so a restart resumes this negotiation where it left off.
    scheduleActiveBidsPersist();
  }
}

async function runCounterEvaluation(
  seller: SellerProfile,
  active: ActiveBid,
  args: CounterOfferIssuedArgs,
) {
  const buyerCounterPrice = formatUnits(args.newPrice, USDC_DECIMALS);
  const buyerCounterDeadlineUnix = Number(args.newDeadline);

  // Counter steering. Pick a floor and ceiling for the LLM's negotiation range:
  //  * Listing-driven bids: floor = listing's floor, ceiling = listing's asking
  //    price (set at listing time, overrides profile-wide range).
  //  * Profile-driven bids: floor = max(profile minimum, original bid * (1 -
  //    PROFILE_MAX_DECREASE_PCT/100)). This anchors counters to the seller's
  //    opening on this specific job, so the agent doesn't capitulate to the
  //    profile-wide minimum just because the buyer pushed hard. Ceiling stays
  //    at the seller's profile-wide maximum.
  const originalBid = Number(active.originalBidPriceUsdc);
  // Brief-flow floor is the seller's own: their minimum and how far they will
  // come down from their opening. It is no longer pinned to the buyer's budget,
  // so a seller who opened under it keeps the room to agree (view 35). Listing
  // flow keeps the listing's own floor.
  const profileFloor = active.listingFloorUsdc
    ? active.listingFloorUsdc
    : Math.max(
        seller.minBudgetUsdc * orderSize(seller, active.jobContext),
        Number((originalBid * (1 - PROFILE_MAX_DECREASE_PCT / 100)).toFixed(2)),
      );
  // No seller maximum (view 41): the agent never counters above what it opened at.
  const maxAcceptable = active.listingAskingPriceUsdc ?? Math.max(originalBid, seller.usualPriceUsdc ?? 0);

  // Strategy module computes a deterministic counter price for this round.
  // Tier elasticity + urgency lean the move in the right direction; the LLM
  // ratifies (and writes the reasoning trace).
  const buyerTier = (active.jobContext.buyerRepTier ?? 'established') as Tier;
  const dealKeywords =
    (active.jobContext.keywords ?? []).length > 0
      ? active.jobContext.keywords!
      : [...(seller.keywords ?? []), ...(seller.skills ?? [])];
  // Non-blocking research here too (same latency reason as the opening bid):
  // by the counter round the read is almost always warm from the opening, so
  // the counter still prices research-tuned without stalling on a fresh call.
  void maybeSellerResearch(seller, dealKeywords, active.jobContext.jobId);
  const buyerPassport = cachedBuyerPassport(active.jobContext.jobId);
  const heat = await marketHeat(dealKeywords, seller.address);
  // Market-aware counter floor: the seller won't concede below what the deal is
  // worth across rounds either. A grounded market price above the budget lifts
  // the floor toward market (clamped to 2x budget and the seller's own max);
  // below the budget it stays at the profile/budget floor.
  const counterMarket = getCachedMarketPrice(dealKeywords);
  const counterRead = getCachedMarketRead(dealKeywords);
  const briefBudget = Number(active.jobContext.budgetUsdc);
  const budgetForClamp = Number.isFinite(briefBudget) ? briefBudget : 0;
  const marketFloor =
    counterMarket && counterMarket > 0 && budgetForClamp > 0
      ? Math.min(counterMarket, budgetForClamp * 2, maxAcceptable)
      : 0;
  const minAcceptable = Math.max(profileFloor, marketFloor);
  // The schedule in code (view 41): firm while there is time and little
  // competition, a step only after the buyer moved, never under the floor, at
  // most five exchanges with the fourth a last price, a question past that.
  // The model is never asked whether to accept; it writes the reason line.
  const { getBuyerJob } = await import('./buyer.js');
  const competitors = Math.max(0, (getBuyerJob(args.jobId)?.bids.length ?? 1) - 1);
  const requestBrief = getBrief(args.jobId);
  const nowSec = Math.floor(Date.now() / 1000);
  const postedSec = Math.floor((requestBrief?.createdAt ?? Date.now()) / 1000);
  const timeUsed = Math.max(0, Math.min(1, (nowSec - postedSec) / Math.max(1, active.jobContext.deadlineUnix - postedSec)));
  const theirPrice = Number(buyerCounterPrice);
  const theirMoved = active.lastBuyerPrice === undefined || Number(active.lastBuyerPrice) !== theirPrice;
  active.lastBuyerPrice = buyerCounterPrice;
  const buyerDays = Math.max(1, Math.ceil((buyerCounterDeadlineUnix - nowSec) / 86_400));
  const tradeDays = seller.maxDeadlineDays > buyerDays ? Math.min(seller.maxDeadlineDays, buyerDays + Math.max(2, Math.ceil(buyerDays / 2))) : null;
  const agreeInsideLimits = (seller.agentMode ?? 'offers') === 'agree';
  const move = nextSellerMove({
    opening: originalBid,
    floor: minAcceptable,
    current: Number(active.lastBidPrice),
    timeUsed,
    exchanges: active.counterRounds,
    competitors,
    theirPrice,
    theirMoved,
    seed: `${seller.address}:${args.jobId}`,
    tradeDays,
    traded: active.tradedTime === true,
    agreeInsideLimits,
  });
  logger.info(
    { jobId: args.jobId, seller: seller.address, move, timeUsed, competitors, exchanges: active.counterRounds, buyerTier, heat, marketRead: !!counterRead, buyerChecked: !!buyerPassport },
    'counter evaluated by the schedule',
  );

  // The reason line goes with the move; the model writes it from facts and code
  // checks it. The buyer's words, if any, are quoted as a message, never followed.
  const forbidden = [minAcceptable, maxAcceptable, seller.minBudgetUsdc, seller.usualPriceUsdc ?? 0, Number(active.jobContext.budgetUsdc)];
  const quantity = active.jobContext.quantity ? quantityWords(active.jobContext.quantity) : undefined;
  const reasonFor = async (facts: ReasonFacts): Promise<string> => {
    try {
      const result = await withLlmRetry(`reasonLine(${args.jobId})`, () =>
        generateObject({ model: negotiationModel, schema: reasonLineSchema, prompt: buildReasonLinePrompt(facts, forbidden) }),
      );
      return checkReasonLine(result.object.line, forbidden, facts);
    } catch (err) {
      logger.warn({ jobId: args.jobId, err: (err as Error).message }, 'reason line failed, plain line sent');
      return fallbackReason(facts);
    }
  };

  if (move.kind === 'ask') {
    const noAsk = (seller.noAskBelowUsdc ?? 0) * orderSize(seller, active.jobContext);
    if (noAsk > 0 && theirPrice < noAsk) {
      // Under the no-ask level: a polite no, the offer stays as it is (view 41).
      active.finalized = true;
      bus.emitEvent({
        type: 'agent.declined',
        jobId: args.jobId,
        actor: 'seller',
        payload: {
          seller: seller.address,
          reason: 'no-ask-below',
          polite: true,
          detail: 'The counter is under the level the seller set for not being asked.',
          reasonLine: fallbackReason({ move: 'declined', priceUsdc: Number(active.lastBidPrice) }),
        },
      });
      return;
    }
    await askAtFloor(seller, active, buyerCounterPrice, minAcceptable, 'last-price-passed');
    return;
  }

  if (move.kind === 'accept') {
    const result = await respondToCounter(seller.walletId, seller.address, args.jobId, true, 0n, 0);
    active.finalized = true;
    recordAgreement({
      jobId: args.jobId,
      side: 'seller',
      agreedUsdc: theirPrice,
      floorUsdc: minAcceptable,
      usualUsdc: seller.usualPriceUsdc,
      exchanges: active.counterRounds,
      at: Date.now(),
    });
    logger.info({ jobId: args.jobId, ...result }, 'counter accepted');
    bus.emitEvent({
      type: 'counter.response.submitted',
      jobId: args.jobId,
      actor: 'seller',
      payload: { accepted: true, txHash: result.txHash, move: 'accept', reasonLine: await reasonFor({ move: 'accept', priceUsdc: theirPrice, quantity }) },
    });
    return;
  }

  // Hold, step, last price or a time trade: a counter at the schedule's price,
  // inside the seller's own delivery window.
  const counterDeadlineDays =
    move.kind === 'trade' ? move.days : Math.max(seller.minDeadlineDays, Math.min(seller.maxDeadlineDays, buyerDays));
  const counterDeadlineUnix = nowSec + counterDeadlineDays * 86_400;
  const finalCounterPrice = move.price.toFixed(2);
  const counterPriceWei = parseUnits(finalCounterPrice, USDC_DECIMALS);
  active.counterRounds += 1;
  if (move.kind === 'trade') active.tradedTime = true;
  const result = await respondToCounter(seller.walletId, seller.address, args.jobId, false, counterPriceWei, counterDeadlineUnix);
  active.lastBidPrice = finalCounterPrice;
  logger.info({ jobId: args.jobId, move: move.kind, ...result }, 'counter back submitted');
  bus.emitEvent({
    type: 'counter.response.submitted',
    jobId: args.jobId,
    actor: 'seller',
    payload: {
      accepted: false,
      counterPrice: finalCounterPrice,
      counterDeadlineDays,
      txHash: result.txHash,
      move: move.kind,
      reasonLine: await reasonFor({ move: move.kind, priceUsdc: move.price, days: counterDeadlineDays, quantity }),
    },
  });
}

interface JobPostedArgs {
  jobId: `0x${string}`;
  buyer: `0x${string}`;
  budget: bigint;
  deadline: bigint;
  termsHash: string;
}

interface CounterOfferIssuedArgs {
  jobId: `0x${string}`;
  seller: `0x${string}`;
  newPrice: bigint;
  newDeadline: bigint;
}

export interface SellerActiveBidSnapshot {
  jobId: string;
  seller: string;
  jobBuyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
  /// First line of the brief, never the buyer. Null when the brief was lost.
  title: string | null;
  buyerCheck: BuyerCheck | null;
}

/// Returns the seller-side flags attached to a bid (currently just the
/// human-review intent set by `adjustBidByTier` when the buyer is NEW-tier).
/// Read by `buyer.ts:proposeMatch` so the resulting `MatchProposal` can carry
/// a `new-buyer` riskFlag forward to the MatchBanner. Null when there is no
/// active bid for this (jobId, sellerAgent) pair (e.g. listing-driven bids
/// also pass through here and return their own humanReview = undefined).
export function getSellerBidFlags(
  jobId: string,
  sellerAgentAddress: string,
): { humanReview: boolean } | null {
  const entry = activeBids.get(bidKey(jobId, sellerAgentAddress));
  if (!entry) return null;
  return { humanReview: entry.humanReview === true };
}

/// Prune bids whose auction has concluded, so the seller's active-bids view is
/// live-only and the in-memory map (plus its persisted snapshot) stop gathering
/// dead negotiations. A bid is done when a deal exists for its job (the auction
/// was awarded, to us or to another seller) or its offer deadline has passed;
/// each one leaves with its outcome recorded for the seller desk. Called from
/// the job-expiry watcher tick. Returns how many were settled.
export function reconcileActiveBids(dealsByJob: Map<string, DealParties>, now: number): number {
  const settled: BidOutcomeRecord[] = [];
  for (const [key, bid] of activeBids) {
    const jobId = bid.jobContext.jobId.toLowerCase();
    const outcome = settleBid(
      {
        jobId,
        sellerAgent: bid.seller.address,
        sellerUser: bid.seller.userAddress ?? '',
        deadlineUnix: Number(bid.jobContext.deadlineUnix),
      },
      dealsByJob.get(jobId) ?? null,
      now,
    );
    // A finalized bid is waiting on the buyer's side; it stays until a deal
    // exists or the deadline passes, so its outcome is known when it leaves.
    if (!outcome) continue;
    activeBids.delete(key);
    settled.push({
      jobId,
      sellerAgent: bid.seller.address,
      title: requestTitle(bid.jobContext.briefText),
      outcome,
      lastPrice: bid.lastBidPrice,
      at: now,
    });
  }
  if (settled.length > 0) {
    recordBidOutcomes(settled);
    scheduleActiveBidsPersist();
    logger.info({ removed: settled.length }, 'settled concluded/expired active bids');
  }
  return settled.length;
}

/// Manually abandon an in-flight bid: the seller walks away from the
/// negotiation. Off-chain and consistent with the agent's own decline path
/// (which also just stops responding): it drops the bid from the active map so
/// the agent stops countering and it leaves the seller's list. A bid already on
/// chain still expires at its offer deadline; the agent simply won't pursue it.
/// Returns true if a matching bid was found and removed.
export function abandonBid(jobId: string, sellerAgentAddress: string): boolean {
  const key = bidKey(jobId, sellerAgentAddress);
  const bid = activeBids.get(key);
  if (!bid) return false;
  activeBids.delete(key);
  recordBidOutcomes([
    {
      jobId: jobId.toLowerCase(),
      sellerAgent: sellerAgentAddress,
      title: requestTitle(bid.jobContext.briefText),
      outcome: 'withdrawn',
      lastPrice: bid.lastBidPrice,
      at: Date.now(),
    },
  ]);
  scheduleActiveBidsPersist();
  bus.emitEvent({
    type: 'agent.declined',
    jobId,
    actor: 'seller',
    payload: { seller: sellerAgentAddress, reason: 'seller-abandoned' },
  });
  logger.info({ jobId, seller: sellerAgentAddress }, 'seller abandoned bid');
  return true;
}

/// A seller's agent answers a change to a request it offered on (view 35):
/// keep, lower with a new submitBid, or withdraw. The floor is the seller's
/// own: their minimum, a listing's floor, a grounded market price.
export async function reviseOffer(
  jobId: string,
  sellerAgent: string,
  reason: 'request-changed' | 'best-and-final',
  lowestOtherUsdc?: number,
): Promise<ReviseOutcome> {
  const key = bidKey(jobId, sellerAgent);
  const recordKey = `${jobId.toLowerCase()}:${sellerAgent.toLowerCase()}`;
  const outcome = await reviseStandingOffer(jobId, sellerAgent, reason, {
    standing: async () => {
      const active = activeBids.get(key);
      if (!active || active.finalized || active.responding) return null;
      const budget = Number(active.jobContext.budgetUsdc);
      const keywords = active.jobContext.keywords?.length
        ? active.jobContext.keywords
        : [...(active.seller.keywords ?? []), ...(active.seller.skills ?? [])];
      const market = getCachedMarketPrice(keywords);
      const marketFloor = market && market > 0 ? Math.min(market, budget * 2) : 0;
      return {
        priceUsdc: Number(active.lastBidPrice),
        deadlineUnix: active.jobContext.deadlineUnix,
        budgetUsdc: budget,
        floorUsdc: Math.max(active.seller.minBudgetUsdc, active.listingFloorUsdc ?? 0, marketFloor),
      };
    },
    // A failed lookup counts as a hand offer: never replace a price a person set.
    handOffer: async () => (await directOfferLookup(jobId, sellerAgent.toLowerCase()).catch(() => 'unknown')) !== null,
    revisionsSoFar: async () => (await getRecord<{ n: number }>('offer-revisions', recordKey).catch(() => null))?.n ?? 0,
    saveRevisions: (n) => putRecord('offer-revisions', recordKey, { n, at: Date.now() }),
    submit: async (price, deadline) => {
      const active = activeBids.get(key);
      if (!active) return;
      const finalPrice = price.toFixed(2);
      await placeOffer(active.seller.walletId, active.seller.address, jobId, parseUnits(finalPrice, USDC_DECIMALS), Number(deadline));
      active.lastBidPrice = finalPrice;
      scheduleActiveBidsPersist();
    },
    withdraw: () => {
      abandonBid(jobId, sellerAgent);
    },
    random: Math.random,
  }, lowestOtherUsdc);
  logger.info({ jobId, seller: sellerAgent, reason, outcome }, 'seller agent answered a change to the request');
  return outcome;
}

/// Spread over the next minutes so a market's moves land as a market's do.
const REVISE_MIN_DELAY_MS = 15_000;
const REVISE_MAX_DELAY_MS = 240_000;

/// Every seller agent with a standing offer on this request gets its turn after
/// the buyer changes it (view 35). Returns how many were asked.
export function reviseStandingOffers(jobId: string, reason: 'request-changed' | 'best-and-final' = 'request-changed', sellers?: string[]): number {
  const wanted = sellers ? new Set(sellers.map((s) => s.toLowerCase())) : null;
  const agents = [...activeBids.values()]
    .filter((b) => b.jobContext.jobId.toLowerCase() === jobId.toLowerCase() && !b.finalized)
    .map((b) => b.seller.address)
    .filter((a) => !wanted || wanted.has(a.toLowerCase()));
  for (const agent of agents) {
    const delay = REVISE_MIN_DELAY_MS + Math.random() * (REVISE_MAX_DELAY_MS - REVISE_MIN_DELAY_MS);
    const timer = setTimeout(() => {
      const lowest = reason === 'best-and-final' ? lowestOtherOffer?.(jobId, agent) : undefined;
      void reviseOffer(jobId, agent, reason, lowest ?? undefined).catch((err: Error) =>
        logger.warn({ jobId, seller: agent, err: err.message }, 'seller agent could not answer a change'),
      );
    }, delay);
    timer.unref?.();
  }
  return agents.length;
}

/// Set by the buyer side: the lowest other offer a seller is measured against on
/// best and final. Never sent to the seller, only to its own decision.
let lowestOtherOffer: ((jobId: string, sellerAgent: string) => number | null) | null = null;
export function setLowestOtherOfferReader(fn: (jobId: string, sellerAgent: string) => number | null): void {
  lowestOtherOffer = fn;
}

/// Snapshot of active bids. Pass a seller agent address to scope it to the bids
/// that agent placed.
export function getSellerSnapshot(
  filterSellerAddress?: string,
): { activeBids: SellerActiveBidSnapshot[] } {
  const f = filterSellerAddress?.toLowerCase();
  return {
    activeBids: [...activeBids.values()]
      .filter((b) => !f || b.seller.address.toLowerCase() === f)
      .map((b) => ({
      jobId: b.jobContext.jobId,
      seller: b.seller.address,
      jobBuyer: b.jobContext.buyer,
      budgetUsdc: b.jobContext.budgetUsdc,
      deadlineUnix: b.jobContext.deadlineUnix,
      lastBidPrice: b.lastBidPrice,
      counterRounds: b.counterRounds,
      finalized: b.finalized,
      title: requestTitle(b.jobContext.briefText),
      buyerCheck: b.buyerCheck ?? null,
    })),
  };
}

/// Replays recent JobPosted logs through the handler. `rescan` re-enters the
/// scan for already-seen jobs (the per-seller guard keeps it idempotent); the
/// default (startup backfill) relies on the per-log dedupe.
async function replayRecentJobLogs(opts: { blocks: bigint; ms: number; rescan?: boolean }) {
  const logs = await marketBoard().recentPosted(opts);
  for (const log of logs) await handleJobPosted(log as unknown as Log, { rescan: opts.rescan });
  return logs.length;
}

/// Replays recent JobPosted logs through the live handler, so a freshly started
/// agent picks up jobs posted while it was down.
export async function backfillRecentJobs() {
  const count = await replayRecentJobLogs({ blocks: 10_000n, ms: 2 * 86_400_000 });
  logger.info({ count }, 'seller backfilling jobs');
}

/// Periodic self-heal for the websocket JobPosted listener, which can silently
/// drop events on Arc testnet. Every tick it re-runs the seller scan over recent
/// jobs (rescan: per-seller guard makes already-scanned jobs no-ops), so a job
/// whose live event was missed still gets evaluated and bid on within one tick
/// instead of sitting at zero bids forever. Returns a stop handle.
const RECONCILE_INTERVAL_MS = 90_000;
// Bounded look-back per tick. Arc ~0.5s blocks, so ~2400 blocks is ~20 min:
// wide enough to catch a transient websocket drop (which resolves in minutes)
// across several ticks, narrow enough to keep each sweep cheap. Restart-scale
// gaps are covered by the wider startup backfill.
const RECONCILE_LOOKBACK_BLOCKS = 2_400n;
const RECONCILE_LOOKBACK_MS = 20 * 60_000;
/// A request stays open until its date, far longer than the chain look-back, so
/// every OPEN_REQUEST_SWEEP_MS the reconciler also offers each open request to
/// the sellers who have not seen it: a seller who joined later, or every seller
/// again after the buyer changed the request.
const OPEN_REQUEST_SWEEP_MS = 10 * 60_000;
export function startSellerReconciler(): () => void {
  let lastOpenSweep = Date.now();
  const tick = () =>
    safe('reconcile', async () => {
      const count = await replayRecentJobLogs({ blocks: RECONCILE_LOOKBACK_BLOCKS, ms: RECONCILE_LOOKBACK_MS, rescan: true });
      logger.debug({ count }, 'seller reconciler swept recent jobs');
      if (Date.now() - lastOpenSweep >= OPEN_REQUEST_SWEEP_MS) {
        lastOpenSweep = Date.now();
        await sweepOpenRequests();
      }
    });
  const id = setInterval(tick, RECONCILE_INTERVAL_MS);
  logger.info({ everyMs: RECONCILE_INTERVAL_MS }, 'seller reconciler started');
  return () => clearInterval(id);
}

function jobLogFor(job: JobContext): Log {
  return {
    transactionHash: `0x${job.jobId.slice(2)}`,
    logIndex: 0,
    args: {
      jobId: job.jobId as `0x${string}`,
      buyer: job.buyer as `0x${string}`,
      budget: parseUnits(job.budgetUsdc, USDC_DECIMALS),
      deadline: BigInt(job.deadlineUnix),
      termsHash: job.termsHash,
    } satisfies JobPostedArgs,
  } as unknown as Log;
}

async function sweepOpenRequests() {
  const { listOpenJobContexts } = await import('./buyer.js');
  const nowSec = Math.floor(Date.now() / 1000);
  const open = listOpenJobContexts().filter((job) => job.deadlineUnix > nowSec);
  for (const job of open) await handleJobPosted(jobLogFor(job), { rescan: true });
  logger.debug({ count: open.length }, 'seller reconciler swept open requests');
}

/// A seller just saved their profile, a way or an offer (view 41): their entry
/// in the index is read again and the open requests that fit are offered to
/// their agent now, instead of at the next sweep. Returns how many it judged.
export async function matchSellerNow(userAddress: string): Promise<number> {
  const entry = await sellerIndex.refresh(userAddress);
  if (!entry || !entry.onMarket || entry.example) return 0;
  const { listOpenJobContexts } = await import('./buyer.js');
  const nowSec = Math.floor(Date.now() / 1000);
  const open = listOpenJobContexts().filter((j) => j.deadlineUnix > nowSec);
  const fits = requestsForSeller(
    entry,
    open.map((j) => {
      const brief = getBrief(j.jobId);
      return { jobId: j.jobId, keywords: j.keywords, briefText: j.briefText, sourcingSector: j.sourcingSector ?? null, tradeType: brief?.tradeType ?? null, where: brief?.where ?? null };
    }),
  );
  if (fits.length === 0) return 0;
  const [seller] = await resolveSellerProfilesForUsers([userAddress]);
  if (!seller) return 0;
  const sellerLower = seller.address.toLowerCase();
  let judged = 0;
  for (const fit of fits) {
    const job = open.find((j) => j.jobId === fit.jobId);
    if (!job) continue;
    if (activeBids.has(bidKey(job.jobId, seller.address))) continue;
    const evaluated = evaluatedSellers.get(job.jobId) ?? new Set<string>();
    evaluatedSellers.set(job.jobId, evaluated);
    if (evaluated.has(sellerLower)) continue;
    if ((await siblingSellerAddress(job.buyer))?.toLowerCase() === sellerLower) continue;
    evaluationStarted(job.jobId);
    try {
      await evaluateAndBid(seller, { ...job });
      evaluated.add(sellerLower);
      judged += 1;
    } catch (err) {
      logger.warn({ jobId: job.jobId, seller: seller.address, err: (err as Error).message }, 'seller evaluation after a save failed');
    } finally {
      evaluationFinished(job.jobId);
    }
  }
  logger.info({ userAddress, fits: fits.length, judged }, 'seller matched against open requests after a save');
  return judged;
}

/// Offers one open request to the sellers again. `fresh` forgets who already
/// looked, for a request the buyer just changed (text, price limit), so a seller
/// who passed on the old one judges the new one.
export async function rescanRequest(jobId: string, opts: { fresh?: boolean } = {}): Promise<void> {
  const { listOpenJobContexts } = await import('./buyer.js');
  const job = listOpenJobContexts().find((j) => j.jobId.toLowerCase() === jobId.toLowerCase());
  if (!job) return;
  if (opts.fresh) evaluatedSellers.delete(job.jobId);
  await handleJobPosted(jobLogFor(job), { rescan: true });
}
