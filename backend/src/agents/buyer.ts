import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, watchEventsViaGetLogs } from '../chain/client.js';
import {
  jobBoard,
  escrow,
  vault,
  usdc as usdcAddress,
  getEscrowFeeBps,
  computeFunding,
  readEscrow,
  invalidateEscrowCache,
  readUsdcBalance,
} from '../chain/contracts.js';
import { ESCROW_FUNDED, buildFundEscrowCall } from '../chain/settlement.js';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { executeContractCall } from '../chain/txs.js';
import { negotiationModel } from '../llm/client.js';
import {
  bidScoreSchema,
  counterEvaluationSchema,
  type CounterEvaluation,
} from '../llm/schemas.js';
import {
  buildBidRankingPrompt,
  buildCounterEvaluationPrompt,
  type BidContext,
  type JobContext,
} from '../llm/prompts.js';
import { topicalMatchScore } from '../llm/keywords.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';
import { bus } from '../events.js';
import type { BuyerProfile } from './buyer-profile.js';
import { resolveBuyerProfile, resolveSellerProfile } from './agent-registry.js';
import {
  heuristicCounterDecision,
  nextCounterPrice,
  relationshipScoreFromDeals,
  scoreBidDeterministic,
  shouldAcceptOnFinalRound,
  type Tier,
} from './strategy.js';
import { countCleanDealsBetween } from './workRecord.js';

/// Hard cap on how many seller candidates the buyer agent will attempt
/// sequentially on a single brief. Without this, a 10-bid auction could
/// spawn 10 sequential negotiations. Three is the sweet spot for
/// community testing: enough to recover from a stubborn top seller,
/// few enough to keep total negotiation time bounded.
const MAX_CANDIDATES = 3;
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { createDeal, getDeal, patchDeal } from '../db/deals.js';
import { getBrief, patchBrief } from '../db/briefs.js';
import { getProfile } from '../db/profiles.js';
import {
  getMatchProposal as dbGetMatchProposal,
  upsertMatchProposal as dbUpsertMatchProposal,
  listMatchProposalsForUser as dbListMatchProposalsForUser,
  listAllMatchProposals as dbListAllMatchProposals,
  hasPendingProposal as dbHasPendingProposal,
  type MatchProposal as DbMatchProposal,
} from '../db/matchProposals.js';
import { getSellerBidFlags, submitListingBid } from './seller.js';
import { withLlmRetry } from './llm-utils.js';
import {
  actorSignalsFor,
  priceAnomalyScore,
  priceHistorySnapshot,
  classifyBid,
  type BidSignals,
  type RepTier,
} from './signals.js';
import { classifyAgentError } from '../chain/errors.js';
import { maybeRaiseNearMiss } from './nearMiss.js';
import { clearNearMiss, getPendingNearMiss, type NearMissApproval } from '../db/nearMiss.js';
import { clearOutOfReach } from '../db/outOfReach.js';
import { config } from '../config.js';
import { paidCreditPassport, type PaidPassportSignal } from '../x402/buyerClient.js';
import { researchMarket, type MarketRead } from '../x402/externalClient.js';
import { chargeResearch, getResearchState } from '../x402/researchAccount.js';
import { securityResearchOrder } from '../security/orderResearch.js';
import { shouldDenyPaidCall } from '../security/sa-stub.js';
import { recordSpend } from '../security/spendGuard.js';
import { evaluateMatch } from '../security/matchGate.js';
import { upsertMarketAdvisory } from '../db/marketAdvisory.js';
import {
  recordDealPrice,
  categoryPriceSnapshot,
  categoryPriceAnomaly,
} from '../db/priceObservations.js';
import { setResearchHeat, researchHeatFromRead, classifyVsMarket, type MarketVerdict } from './marketDemand.js';

// USDC on Arc has a dual interface: native (18 decimals) for gas, ERC-20 (6 decimals)
// for transfers/approvals. Bid + escrow amounts ride the ERC-20 rail, so all our math
// uses 6.
const USDC_DECIMALS = 6;

interface Bid {
  seller: `0x${string}`;
  priceUsdc: string;
  priceWei: bigint;
  deadlineUnix: number;
  score?: number;
  suggestedCounterPrice?: string;
  suggestedCounterDeadlineDays?: number;
  /// Cached on the bid so finalizeBidCollection can use it as a soft tiebreaker
  /// without re-fetching from chain. Source: ReputationRegistry.getReputationScore
  /// at the moment the bid was received. 0–10000 bps; defaults to 5000 (neutral)
  /// if the read failed.
  sellerReputationBps?: number;
  /// Composite-engine tier at bid time. Drives the tier-aware adjustments in
  /// finalizeBidCollection (reputation-model.md §6): ELITE skips auction,
  /// STRONG short-circuits inside +5% of next-best, COLD gets a forced -5%
  /// counter even when already in range, NEW gets the full counter cycle and
  /// can route to human review.
  sellerTier?: RepTier;
  /// Pattern label from classifyBid(). Carried so finalizeBidCollection (and
  /// the Phase C risk-escalator) can route on it without re-computing.
  pattern?: ReturnType<typeof classifyBid>;
  /// Cached actor signals so the deterministic bid score can compute without
  /// re-fetching reputation data. completionRate in [0, 1]; velocity24h is
  /// the rolling 24-hour bid+listing+cancel count for the seller.
  completionRate?: number;
  velocity24h?: number;
  /// Coverage-based 0-100 score for how well this seller's skills/keywords
  /// cover what the brief asks for (see topicalMatchScore). Computed at bid
  /// time against the brief's keywords. undefined when the brief carries no
  /// keywords to score against, in which case ranking falls back to the
  /// deterministic price+reputation score alone. This is the dominant ranking
  /// key: a clearly better skill fit beats a higher-reputation weaker fit.
  topicalMatch?: number;
  /// Free stake (USDC) on the seller agent at bid time. Used as the secondary
  /// ranking key in Trusted Match mode after reputation tier: skin in the game
  /// breaks ties between sellers of the same tier. 0 when the vault read failed
  /// or the seller has no stake.
  sellerFreeStakeUsdc?: number;
  /// Owner address behind the seller agent. Resolved once at bid time via
  /// the agent-wallet store so the bid card can open a profile peek by the
  /// user address (profiles are keyed by user, not agent). Absent when the
  /// agent has no recorded binding (rare; happens on stale data).
  sellerUserAddress?: string;
  /// Display name from the seller's profile. Surfaced inline on the bid
  /// card and in the compact peek so the buyer sees a human name instead
  /// of just an address. Absent when the seller hasn't set one.
  sellerDisplayName?: string;
  /// Credit passport the agent PAID for over x402 at bid time (real USDC,
  /// agent Gateway deposit -> platform treasury). Carries the settlement
  /// reference so the match proposal and timeline can prove the pull.
  /// Absent when paid signals are disabled or the call failed; the bid
  /// scores on local signals alone in that case.
  paidSignal?: PaidPassportSignal;
  /// Relationship memory: prior CLEAN deals this buyer has closed with this
  /// seller before. Resolved once at bid time (countCleanDealsBetween) and fed
  /// to scoreBidDeterministic as a small within-band ranking nudge so a
  /// familiar, proven counterparty wins a near-tie. 0 when there is no history.
  priorCleanDealsWithBuyer?: number;
}

/// Score difference under which two bids are "tied" for the purposes of the
/// reputation tiebreaker. LLM scoring is noisy at the unit level, so 3 points
/// on a 0-100 scale is well inside the noise floor.
const REPUTATION_TIEBREAK_EPSILON = 3;

/// Width of a topical-match band, on the 0-100 match scale. Bids whose match
/// scores land in the same band are "comparable" on skill and ranked by the
/// deterministic price+reputation score; a bid in a higher band always ranks
/// above one in a lower band, regardless of price or reputation. 25 gives four
/// bands (<25, 25-49, 50-74, 75-100), which cleanly separates a near-exact
/// skill fit from a partial one while staying coarse enough that two genuinely
/// comparable sellers aren't split by match-score noise. Bucketing (rather than
/// a pairwise epsilon) keeps the sort comparator transitive.
const MATCH_BAND_SIZE = 25;

/// The match band for a bid. A bid with no computable match (brief had no
/// keywords) shares one neutral band with every other such bid on the same
/// brief, so ranking among them is decided entirely by the deterministic score
/// (preserving pre-match-ranking behaviour). Within a single brief, keywords
/// are uniform, so bids are either all scored or all neutral; the two never mix.
function matchBand(bid: Bid): number {
  if (typeof bid.topicalMatch !== 'number') return -1;
  // Clamp to the top band so a perfect 100 stays in the documented 75-100 band
  // instead of spilling into a band of its own. Without this, floor(100/25)=4
  // sits above floor(88/25)=3, so a NEW seller at 100% outranks an ELITE at 88%
  // on a one-point boundary, when the two are genuinely comparable and the
  // deterministic score (tier + reputation + price) should decide between them.
  const topBand = Math.ceil(100 / MATCH_BAND_SIZE) - 1;
  return Math.min(Math.floor(bid.topicalMatch / MATCH_BAND_SIZE), topBand);
}

interface JobState {
  jobId: `0x${string}`;
  // The buyer profile of the user whose buyer agent posted this job. Carried on
  // the state so bid/counter handlers do not have to re-resolve it per event.
  buyer: BuyerProfile;
  context: JobContext;
  /// The paid market read for this brief's keywords, fetched once when the
  /// collection window opens (gated on the buyer's agent-research activation).
  /// Tunes scoring + seller anchoring via the heat cache and is reused on the
  /// proposal for display. Absent when research is off or the call failed.
  marketRead?: MarketRead;
  /// One-time verdict of the buyer's budget vs the grounded market price.
  /// Computed when research lands; drives the overpay advisory. Stays put for
  /// the rest of the deal so the agent doesn't re-decide and oscillate.
  marketVerdict?: MarketVerdict;
  bids: Map<`0x${string}`, Bid>;
  collectionTimer: NodeJS.Timeout | null;
  /// When the first bid landed. The collection window's floor + hard cap are
  /// measured from here for the adaptive soft-close.
  collectionStartedAt?: number;
  collectionFired: boolean;
  counterRoundsBySeller: Map<`0x${string}`, number>;
  lastCounterPriceBySeller: Map<`0x${string}`, string>;
  /// Cascading negotiation queue. After finalizeBidCollection ranks bids by
  /// the deterministic score, the top N are queued here. When a negotiation
  /// with the head candidate fails (LLM decline, max-counter-rounds, etc.),
  /// the buyer pops the next candidate and runs a fresh negotiation. Bounded
  /// at MAX_CANDIDATES so a 10-bid auction can't spawn 10 sequential rounds.
  candidateQueue: Bid[];
  triedSellers: Set<`0x${string}`>;
  /// Snapshot of triedSellers at the moment a near-miss was passed and the
  /// auction re-opened. The walk-end near-miss skips these, so only genuinely
  /// NEW sellers (bidding after the pass) can raise a fresh prompt — old offers
  /// the buyer already declined never re-nag.
  sellersAtLastPass?: Set<`0x${string}`>;
  /// Seller's most recent on-chain counter price, keyed by seller agent
  /// address. Updated every time handleCounterResponse processes a non-accept
  /// reply. Used by the walk-end near-miss path so the buyer sees the best
  /// last price the agent could extract instead of a flat "no match" when
  /// the candidate queue exhausts without convergence.
  lastSellerCounterBySeller: Map<`0x${string}`, string>;
  finalized: boolean;
  escrowFunded: boolean;
  /// Set by the jobExpiryWatcher when deadline passes with no accepted bid
  /// and no approved match proposal. Treated as a terminal state by the
  /// listings cross-match scanner and bid handlers.
  expired: boolean;
  /// When the brief expired (epoch ms). Mirrors brief.expiredAt and is the
  /// authoritative value the snapshot exposes so the UI can render a read-only
  /// expired state instead of 404ing.
  expiredAt?: number;
  /// Timestamp of when the resulting deal was cancelled (mutual, platform,
  /// unilateral, or pre-accept). Set by the bus subscription in
  /// startBuyerAgents() when a `deal.cancelled` event fires. After the grace
  /// window (MANAGED_CANCELLED_GRACE_MS) the job is filtered out of the
  /// snapshot so it stops showing as Open in the buyer's Managed Deals table.
  cancelledAt?: number;
  /// Armed when the buyer issues a counter, cleared when the seller's on-chain
  /// CounterResponse lands. If it fires first, the negotiation is treated as
  /// stalled (seller declined off-chain, dropped event, or a seller-side crash)
  /// and the buyer cascades to the next candidate. See COUNTER_RESPONSE_TIMEOUT_MS.
  counterWatchdog?: NodeJS.Timeout | null;
}

/// How long a cancelled managed job lingers in the buyer's Managed Deals
/// snapshot so the user can see the terminal state. After this it drops off.
const MANAGED_CANCELLED_GRACE_MS = 60 * 60 * 1000;

/// How long the buyer waits for a seller's on-chain CounterResponse before
/// treating the negotiation as stalled and cascading to the next candidate.
/// A seller reply costs an LLM call (up to LLM_TIMEOUT_MS, 45s default) plus a
/// Circle contract call (polled up to ~90s), so the default clears that worst
/// case with margin. This is the only recovery for the gaps the on-chain path
/// can't signal: a seller that declined off-chain (no respondToCounter tx is
/// broadcast), a dropped WebSocket event, or a seller-side crash mid-round.
/// Tunable via NEGOTIATION_RESPONSE_TIMEOUT_MS.
const envCounterTimeout = Number(process.env.NEGOTIATION_RESPONSE_TIMEOUT_MS ?? '');
const COUNTER_RESPONSE_TIMEOUT_MS =
  Number.isFinite(envCounterTimeout) && envCounterTimeout > 0 ? envCounterTimeout : 180_000;

const jobs = new Map<`0x${string}`, JobState>();
const handledEvents = new Set<string>();

/// Cancels a pending counter-response watchdog. Safe to call when none is
/// armed. Called whenever the negotiation leaves the "waiting for the seller"
/// state: a response landed, the buyer cascaded, or the job reached a terminal
/// state (match proposed, expired).
function clearCounterWatchdog(state: JobState) {
  if (state.counterWatchdog) {
    clearTimeout(state.counterWatchdog);
    state.counterWatchdog = null;
  }
}

/// Pushes the job's working deadline out to a later proposed counter deadline,
/// so the jobExpiryWatcher (which checks context.deadlineUnix) does not reap a
/// negotiation that is still actively exchanging counters. Extend only; a
/// proposal carrying an earlier or equal deadline leaves the clock untouched.
/// A stalled negotiation is handled by the counter watchdog, not the deadline,
/// so this never keeps a dead job alive.
function extendWorkingDeadline(state: JobState, proposedDeadlineUnix: number) {
  if (
    Number.isFinite(proposedDeadlineUnix) &&
    proposedDeadlineUnix > state.context.deadlineUnix
  ) {
    state.context.deadlineUnix = proposedDeadlineUnix;
  }
}

/// The cap the buyer agent will accept counters up to. The brief's per-deal
/// tolerance is the buyer's explicit authorization for that brief and is
/// authoritative. We used to clip it against buyer.maxBudgetUsdc but that
/// silently overruled tolerance the buyer set with eyes open (a brief with
/// 15% tolerance on a 50 USDC budget got clipped to 50 because the activation
/// default left maxBudgetUsdc low). The profile cap stays as a creation-time
/// safety guide; runtime negotiation trusts the per-deal authorization.
function computeBuyerEffectiveCap(
  context: { budgetUsdc: string; negotiationMaxIncreasePct?: number },
  _buyer: BuyerProfile,
): number {
  const base = Number(context.budgetUsdc);
  const tolerance = context.negotiationMaxIncreasePct ?? 0;
  return base * (1 + tolerance / 100);
}

/// A brief with `negotiationMaxIncreasePct` unset or 0 means "no hard
/// ceiling, ask me about anything reasonable". The cap returned by
/// computeBuyerEffectiveCap stays at the budget for the walk math (the
/// agent still anchors counter-offers there), but ask-mode briefs use a
/// wider near-miss band so the buyer hears about stretches up to a
/// configurable "outrageous" cap and only declines silently above it.
/// Default outrageous cap is 200% above budget = 3x budget; configurable
/// via NEAR_MISS_ASK_MODE_BAND_PCT for tuning.
function isAskMode(ctx: { negotiationMaxIncreasePct?: number | null }): boolean {
  const t = ctx.negotiationMaxIncreasePct;
  return t === undefined || t === null || t === 0;
}

const ASK_MODE_NEAR_MISS_BAND_PCT = (() => {
  const raw = process.env.NEAR_MISS_ASK_MODE_BAND_PCT;
  if (!raw) return 200;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 200;
})();

/// Returns the near-miss band override to use for this brief, wider when
/// ask-mode is on, undefined (use the default 100% LISTING_MAX_GAP_PCT)
/// when the buyer explicitly set a tolerance.
function nearMissBandFor(ctx: { negotiationMaxIncreasePct?: number }): number | undefined {
  return isAskMode(ctx) ? ASK_MODE_NEAR_MISS_BAND_PCT : undefined;
}

/// The deal's paid market read, shaped for the near-miss. Lets the proceed-or-
/// pass alert justify an over-budget price with the market ("demand is hot...")
/// and widens the gap band when the market backs the price.
function marketContextFor(
  state: JobState,
): { demand: 'hot' | 'steady' | 'soft'; note: string; fairPriceUsdc?: number } | undefined {
  return state.marketRead
    ? {
        demand: state.marketRead.demand,
        note: state.marketRead.priceNote,
        fairPriceUsdc: state.marketRead.fairPriceUsdc,
      }
    : undefined;
}

function logDedupeKey(label: string, log: Log): string {
  const tx = (log as unknown as { transactionHash?: string }).transactionHash ?? '';
  const idx = (log as unknown as { logIndex?: number }).logIndex ?? '';
  return `${label}:${tx}:${idx}`;
}

/// Starts the multi-tenant buyer agent. One set of watchers serves every user:
/// each posted job is matched to the buyer profile of whoever's buyer agent
/// posted it, and that profile drives the auction.
/// Event-watch poll cadence (HTTP polling, no websocket). Matches the seller
/// agent; ~4s picks up bids/counters within seconds without heavy getLogs load.
const WATCH_POLL_MS = 15_000;

export function startBuyerAgents() {
  logger.info(
    { jobBoard: jobBoard.address, escrow: escrow.address },
    'buyer agent starting (multi-tenant)',
  );

  // Stateless getLogs polling, NOT websockets (Arc's wss drops at boot and
  // viem's ws watcher never recovered) and NOT viem's filter-based polling
  // either: eth_newFilter state lives on ONE server, and our fallback RPC
  // pool rotates requests across servers, which strands the filter watcher
  // in a permanent "filter not found"/unsupported-method error loop.
  const unwatchPosted = watchEventsViaGetLogs({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    pollingInterval: WATCH_POLL_MS,
    onLogs: (logs) => {
      for (const log of logs) safe('JobPosted', () => handleJobPosted(log as never));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchBid = watchEventsViaGetLogs({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'BidSubmitted',
    pollingInterval: WATCH_POLL_MS,
    onLogs: (logs) => {
      for (const log of logs) safe('BidSubmitted', () => handleBidSubmitted(log as never));
    },
    onError: (err) => logger.error({ err: err.message }, 'BidSubmitted watch error'),
  });

  const unwatchCounter = watchEventsViaGetLogs({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterResponse',
    pollingInterval: WATCH_POLL_MS,
    onLogs: (logs) => {
      for (const log of logs) safe('CounterResponse', () => handleCounterResponse(log as never));
    },
    onError: (err) => logger.error({ err: err.message }, 'CounterResponse watch error'),
  });

  const unsubBus = bus.subscribe((e) => {
    // Mark tracked jobs as cancelled when their resulting deal is cancelled, so
    // the Managed Deals table stops surfacing them as "Escrow funded".
    if (e.type === 'deal.cancelled') {
      const jobId = e.jobId as `0x${string}` | undefined;
      if (!jobId) return;
      const state = jobs.get(jobId);
      if (!state) return;
      state.cancelledAt = Date.now();
      return;
    }

    // A seller agent that declines a counter (price below its floor, round cap,
    // out-of-range) only emits this in-process event; it does NOT broadcast an
    // on-chain CounterResponse. handleCounterResponse would therefore never fire
    // and the buyer would wait on the watchdog timeout. Cascade immediately the
    // moment we hear the seller walked away. Guarded to a seller we are actively
    // countering (has a counterRounds entry, not already tried) so a seller's
    // initial decline-to-bid can't finalize the job before bid collection runs.
    if (e.type === 'agent.declined' && e.actor === 'seller') {
      const jobId = e.jobId as `0x${string}` | undefined;
      const seller = e.payload?.seller as `0x${string}` | undefined;
      if (!jobId || !seller) return;
      const state = jobs.get(jobId);
      if (!state || state.finalized || state.expired) return;
      if (!state.counterRoundsBySeller.has(seller)) return;
      if (state.triedSellers.has(seller)) return;
      logger.info(
        { jobId, seller, reason: e.payload?.reason },
        'seller declined off-chain, cascading to next candidate',
      );
      safe('sellerDeclinedCascade', () =>
        tryNextCandidate(state, seller, 'seller-declined'),
      );
    }
  });

  return () => {
    unwatchPosted();
    unwatchBid();
    unwatchCounter();
    unsubBus();
    for (const state of jobs.values()) {
      if (state.collectionTimer) clearTimeout(state.collectionTimer);
      clearCounterWatchdog(state);
    }
    logger.info('buyer agent stopped');
  };
}

function safe(label: string, fn: () => Promise<unknown>) {
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ scope: label, err: message }, 'agent handler error');
      bus.emitEvent({
        type: 'agent.error',
        actor: 'buyer',
        payload: { scope: label, message },
      });
    });
}

async function handleJobPosted(log: Log, opts?: { silent?: boolean }) {
  const dedupeKey = logDedupeKey('JobPosted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: JobPostedArgs }).args;
  if (jobs.has(args.jobId)) return;

  // Only manage jobs posted by one of our users' buyer agents.
  const buyer = await resolveBuyerProfile(args.buyer);
  if (!buyer) return;

  const brief = getBrief(args.jobId);
  // Re-track expired briefs as read-only state so the UI can still load /jobs/[id]
  // after a restart. The bid handler short-circuits on `state.expired`, so this
  // never re-opens the auction; it just keeps the snapshot available for view.
  const isExpired = !!brief?.expiredAt;
  const state: JobState = {
    jobId: args.jobId,
    buyer,
    context: {
      jobId: args.jobId,
      buyer: args.buyer,
      budgetUsdc: formatUnits(args.budget, USDC_DECIMALS),
      deadlineUnix: Number(args.deadline),
      termsHash: args.termsHash,
      buyerReputationBps: 5000,
      negotiationMaxIncreasePct: brief?.negotiationMaxIncreasePct,
      keywords: brief?.keywords,
      milestonePcts: brief?.milestonePcts,
      trustedMatch: brief?.trustedMatch === true,
      tradeLane: brief?.tradeLane ?? 'service',
    },
    bids: new Map(),
    collectionTimer: null,
    collectionFired: false,
    counterRoundsBySeller: new Map(),
    lastCounterPriceBySeller: new Map(),
    candidateQueue: [],
    triedSellers: new Set(),
    lastSellerCounterBySeller: new Map(),
    finalized: false,
    escrowFunded: false,
    expired: isExpired,
    expiredAt: brief?.expiredAt,
  };
  jobs.set(args.jobId, state);
  logger.info(
    { jobId: args.jobId, budget: state.context.budgetUsdc, buyer: buyer.displayName, silent: opts?.silent ?? false },
    'tracking job',
  );
  // Inherit cancelledAt from the persisted deal so a restart doesn't undo the
  // grace-period filter (otherwise a cancelled deal would re-surface as "Open"
  // on the Managed Deals table until the bus next fires).
  try {
    const existing = await getDeal(args.jobId);
    if (existing?.cancelledAt) {
      state.cancelledAt = existing.cancelledAt;
    }
  } catch {
    /* non-fatal, worst case the row lingers until the bus fires again */
  }
  // Don't broadcast tracked-events during boot backfill. The JobPosted log is
  // historical, and emitting it now would surface every old job in the activity
  // feed as if it had just been posted (timestamp comes from Date.now()).
  if (opts?.silent) return;
  bus.emitEvent({
    type: 'job.tracked',
    jobId: args.jobId,
    actor: 'buyer',
    payload: { budgetUsdc: state.context.budgetUsdc, deadlineUnix: state.context.deadlineUnix },
  });
  // The SecurityAgent fronts the one paid market read for this order now, so the
  // shared cache is warm before any seller evaluates and the paid call never
  // sits on the bid critical path. Buyer/seller research then reads from cache.
  safe('securityResearch', () => securityResearchOrder(args.jobId, state.context.keywords));
}

async function handleBidSubmitted(log: Log) {
  const dedupeKey = logDedupeKey('BidSubmitted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: BidSubmittedArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state) return;
  // A pending near-miss finalizes the job, but a cheaper or stronger bid that
  // lands during the proceed-or-pass window must not be dropped: that is how an
  // elite undercutting the near-miss candidate 17s later got silently discarded.
  // Collect + score it and let it supersede the near-miss if it dominates. Any
  // other finalized reason (match proposed, escrow funded, cancelled) still bails.
  const nmPending = state.finalized ? getPendingNearMiss(args.jobId) : null;
  if (state.finalized && !nmPending) return;
  if (state.escrowFunded) return;
  if (state.bids.has(args.seller)) return;
  const buyer = state.buyer;

  let sellerReputationBps = 5000;
  let sellerRepTier: RepTier = 'established';
  let sellerCompletionRate = 1;
  let sellerVelocity24h = 0;
  try {
    const sig = await actorSignalsFor(args.seller);
    sellerReputationBps = sig.reputationBps;
    sellerRepTier = sig.repTier;
    sellerCompletionRate = sig.completionRate;
    sellerVelocity24h = sig.velocity24h;
  } catch {
    /* keep neutral defaults */
  }

  // Topical match: how well the seller's skills/keywords cover what the brief
  // asks for. This is the dominant ranking key in finalizeBidCollection, so a
  // near-exact skill fit wins ahead of price and reputation (the karwan-match-
  // ranking rule). Left undefined when the brief has no keywords to score
  // against; ranking then falls back to the deterministic price+reputation score.
  let topicalMatch: number | undefined;
  const briefKeywords = state.context.keywords ?? [];
  if (briefKeywords.length > 0) {
    try {
      const sellerProfile = await resolveSellerProfile(args.seller);
      const sellerTags = sellerProfile
        ? [...sellerProfile.keywords, ...sellerProfile.skills]
        : [];
      topicalMatch = topicalMatchScore(briefKeywords, sellerTags);
    } catch {
      /* leave undefined: ranking falls back to the deterministic score */
    }
  }

  // Seller free stake, used as the secondary ranking key in Trusted Match.
  // freeStakeOf reads against the identity wallet, not the agent.
  let sellerFreeStakeUsdc = 0;
  try {
    const sellerWallet = await findAgentWalletByAgentAddress(args.seller);
    const stakeOwner = (sellerWallet?.userAddress ?? args.seller) as `0x${string}`;
    const freeWei = (await vault.read.freeStakeOf([stakeOwner])) as bigint;
    sellerFreeStakeUsdc = Number(formatUnits(freeWei, USDC_DECIMALS));
  } catch {
    /* leave at 0 */
  }

  // Resolve the seller's user address + display name so the bid card can open
  // a profile peek by user address (profiles are keyed by user, not agent).
  // Best-effort: stale or missing bindings leave both undefined and the card
  // falls back to the masked address.
  let sellerUserAddress: string | undefined;
  let sellerDisplayName: string | undefined;
  try {
    const wallet = await findAgentWalletByAgentAddress(args.seller);
    if (wallet?.userAddress) {
      sellerUserAddress = wallet.userAddress;
      const profile = await getProfile(wallet.userAddress);
      if (profile?.displayName?.trim()) {
        sellerDisplayName = profile.displayName.trim();
      }
    }
  } catch {
    /* leave both undefined */
  }

  // Paid x402 pull: the agent buys the seller's credit passport from
  // Karwan's own paid endpoint before scoring ($0.01, agent Gateway
  // deposit -> treasury, settled through Circle Gateway batching).
  // Gated on the buyer owner having agent research active, mirroring the seller
  // pull: the 1.5 USDC subscription is what unlocks the agent buying counterparty
  // evidence beyond the public score. A non-activated buyer scores on local
  // signals only and skips the pull entirely, so nothing waits on it.
  // Best-effort with a hard deadline: a cold start (EOA provisioning +
  // first Gateway deposit) can outrun the window, in which case the
  // deposit still lands and the next bid gets the signal. The bid is
  // never blocked or dropped over a failed pull.
  let paidSignal: PaidPassportSignal | undefined;
  const buyerResearchActive =
    config.X402_PAID_SIGNALS_ENABLED && config.KARWAN_TREASURY_ADDR
      ? await getResearchState(state.context.buyer)
          .then((s) => s.active)
          .catch(() => false)
      : false;
  // Per-deal spend cap: a job flooded with bids must not trigger unbounded paid
  // pulls. Skip the pull (score on free signals) once this deal's paid spend
  // would exceed the cap. The pull is best-effort anyway, so skipping is safe.
  const paidPullDenied =
    buyerResearchActive &&
    (await shouldDenyPaidCall({
      invoiceId: state.jobId,
      signal: 'credit-passport',
      costEstimateUsdc: '0.01',
      callerRole: 'buyer-agent',
    }));
  if (paidPullDenied) {
    logger.info({ jobId: state.jobId, seller: args.seller }, 'paid passport pull skipped: per-deal cap reached');
  }
  if (buyerResearchActive && !paidPullDenied) {
    try {
      paidSignal = await Promise.race([
        paidCreditPassport(buyer.address, args.seller),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('paid passport pull timed out')), 45_000),
        ),
      ]);
      recordSpend(state.jobId, paidSignal.amountUsd);
      logger.info(
        {
          jobId: state.jobId,
          seller: args.seller,
          amountUsd: paidSignal.amountUsd,
          transaction: paidSignal.transaction,
        },
        'x402: paid credit passport pulled at bid time',
      );
      bus.emitEvent({
        type: 'agent.paid',
        jobId: state.jobId,
        actor: 'buyer',
        payload: {
          rail: 'arc',
          kind: 'reputation',
          agent: 'buyer',
          seller: args.seller,
          amountUsd: paidSignal.amountUsd,
          txHash: paidSignal.transaction,
          tier: paidSignal.tier,
          score: paidSignal.score,
        },
      });
    } catch (err) {
      logger.warn(
        { jobId: state.jobId, seller: args.seller, err: (err as Error).message },
        'x402: paid passport pull failed (non-fatal, scoring on local signals)',
      );
    }
  }

  const priceUsdc = formatUnits(args.price, USDC_DECIMALS);
  const briefBudget = Number(state.context.budgetUsdc);
  const priceMultiple = briefBudget > 0 ? Number(priceUsdc) / briefBudget : 1;
  // Prefer a per-category anomaly (this bid vs recent deals in the same skill
  // bucket); fall back to the global cross-category ring when the bucket is thin.
  const anomaly =
    categoryPriceAnomaly(Number(priceUsdc), state.context.keywords ?? []) ??
    priceAnomalyScore(Number(priceUsdc));

  // Relationship memory: prior clean deals this buyer has closed with this
  // seller. Resolved once here so the ranking nudge stays a synchronous read.
  // Non-fatal: a lookup failure just means no nudge, never a dropped bid.
  let priorCleanDealsWithBuyer = 0;
  try {
    priorCleanDealsWithBuyer = await countCleanDealsBetween(
      state.context.buyer,
      sellerUserAddress ?? null,
      args.seller,
    );
  } catch (err) {
    logger.warn(
      { jobId: state.jobId, seller: args.seller, err: (err as Error).message },
      'relationship lookup failed (non-fatal, no nudge applied)',
    );
  }

  const bid: Bid = {
    seller: args.seller,
    priceUsdc,
    priceWei: args.price,
    deadlineUnix: Number(args.deadline),
    sellerReputationBps,
    sellerTier: sellerRepTier,
    completionRate: sellerCompletionRate,
    velocity24h: sellerVelocity24h,
    topicalMatch,
    sellerFreeStakeUsdc,
    sellerUserAddress,
    sellerDisplayName,
    paidSignal,
    priorCleanDealsWithBuyer,
  };

  const bidContext: BidContext = {
    seller: args.seller,
    priceUsdc,
    deadlineUnix: bid.deadlineUnix,
    repTier: sellerRepTier,
    completionRate: sellerCompletionRate,
    velocity24h: sellerVelocity24h,
    priceMultiple,
    priceAnomaly: anomaly,
    sellerReputationBps,
    priorCleanDeals: priorCleanDealsWithBuyer,
    ...(paidSignal && (paidSignal.successCount != null || paidSignal.disputedCount != null)
      ? {
          paidEvidence: {
            settledDeals:
              (paidSignal.successCount ?? 0) +
              (paidSignal.disputedCount ?? 0) +
              (paidSignal.failedCount ?? 0),
            clean: paidSignal.successCount ?? 0,
            disputed: paidSignal.disputedCount ?? 0,
            failed: paidSignal.failedCount ?? 0,
            volumeUsdc: paidSignal.lifetimeVolumeUsdc,
            completionRate: paidSignal.completionRate,
          },
        }
      : {}),
    // Route the paid market read into the ranking. Present only once research
    // has landed (it fires non-blocking at collection open); later bids in the
    // window score with it, matching the existing timing. review #4.
    ...(state.marketRead
      ? {
          fairPriceUsdc: state.marketRead.fairPriceUsdc,
          priceConfidence: state.marketRead.priceConfidence,
          researchSummary: state.marketRead.summary?.slice(0, 300),
          marketHeatContinuous: researchHeatFromRead(state.marketRead),
        }
      : {}),
  };

  // Classify the bid against deterministic patterns BEFORE the LLM call. The
  // pattern is logged + emitted so the audit trail records *why* the agent
  // treated this bid the way it did, not just the LLM's score.
  const signals: BidSignals = {
    priceMultiple,
    priceAnomaly: anomaly,
    actor: {
      reputationBps: sellerReputationBps,
      repTier: sellerRepTier,
      completionRate: sellerCompletionRate,
      velocity24h: sellerVelocity24h,
    },
  };
  const pattern = classifyBid(signals);
  logger.info(
    { jobId: state.jobId, seller: args.seller, pattern, signals },
    'bid pattern classified',
  );

  try {
    const { object: score } = await withLlmRetry(`bidScore(${state.jobId})`, () =>
      generateObject({
        model: negotiationModel,
        schema: bidScoreSchema,
        prompt: buildBidRankingPrompt(state.context, bidContext, buyer),
      }),
    );
    bid.score = score.score;
    bid.suggestedCounterPrice = score.suggestedCounterPrice;
    bid.suggestedCounterDeadlineDays = score.suggestedCounterDeadlineDays;
    bid.pattern = pattern;
    logger.info({ jobId: state.jobId, seller: args.seller, score, pattern }, 'bid scored');
    bus.emitEvent({
      type: 'bid.scored',
      jobId: state.jobId,
      actor: 'buyer',
      // tier + topicalMatch are surfaced so the timeline shows the agent scored
      // this bid with the seller's reputation AND skill fit in hand, not just price.
      // paidSignal carries the x402 settlement reference when the agent paid for
      // the seller's passport, so the audit trail proves the pull.
      payload: {
        seller: args.seller,
        priceUsdc,
        pattern,
        tier: sellerRepTier,
        topicalMatch,
        // Surface the relationship nudge so the timeline shows when the buyer
        // favored a seller it has a clean track record with (only when there is
        // one, to keep the audit trail quiet for first-time counterparties).
        ...(priorCleanDealsWithBuyer > 0 ? { priorCleanDeals: priorCleanDealsWithBuyer } : {}),
        ...(paidSignal
          ? {
              paidSignal: {
                amountUsd: paidSignal.amountUsd,
                transaction: paidSignal.transaction,
                tier: paidSignal.tier,
                score: paidSignal.score,
              },
            }
          : {}),
        ...score,
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: state.jobId, seller: args.seller, err: message },
      'bid scoring LLM failed; using deterministic fallback',
    );
    reportError('agents.buyer.bidScore', err, {
      jobId: state.jobId,
      seller: args.seller,
    });
    // Recover deterministically so an LLM hiccup never drops this bid from the
    // pool. Without this the bid stays unscored, finalizeBidCollection filters
    // it out, and the agent ends "no bids" despite a real bid (feedback
    // #186/#188). Emit a soft fallback, not a hard error, since the agent kept
    // going. suggestedCounterPrice is left for the counter step's own fallback.
    const det = scoreBidDeterministic({
      bidPriceUsdc: Number(priceUsdc),
      briefBudgetUsdc: Number(state.context.budgetUsdc),
      effectiveCapUsdc: computeBuyerEffectiveCap(state.context, buyer),
      sellerTier: (sellerRepTier ?? 'established') as Tier,
      sellerCompletionRate,
      sellerVelocity24h,
      topicalMatch,
      relationshipScore: relationshipScoreFromDeals(priorCleanDealsWithBuyer),
    });
    bid.score = det.score;
    bid.pattern = pattern;
    bus.emitEvent({
      type: 'agent.fallback',
      jobId: state.jobId,
      actor: 'buyer',
      payload: { seller: args.seller, scope: 'bidScore', tier: sellerRepTier, topicalMatch, score: det.score },
    });
  }

  state.bids.set(args.seller, bid);

  // Bid landed during a pending near-miss: decide whether it beats the price the
  // buyer is being asked to stretch to, and if so re-rank so the better seller
  // is surfaced instead of the worse one.
  if (nmPending) {
    await maybeSupersedeNearMiss(state, bid, nmPending);
    return;
  }

  if (!state.collectionFired) {
    if (state.collectionStartedAt == null) {
      state.collectionStartedAt = Date.now();
      logger.info(
        { jobId: state.jobId, floorSec: BID_COLLECTION_FLOOR_MS / 1000 },
        'first bid received, collection window open',
      );
      // Kick off paid market research now (non-blocking) so the finding lands
      // during the window and tunes later scoring + the seller anchoring.
      void maybeResearchMarket(state);
    }
    // Adaptive soft close: each new bid keeps the window open a little longer,
    // so a slower agent's bid is still caught instead of missing a fixed
    // window. Bounded by Karwan's floor and a hard cap, not a per-buyer value.
    scheduleCollectionClose(state, BID_COLLECTION_FLOOR_MS);
  }
}

/// A bid arrived while the buyer was sitting on a proceed-or-pass near-miss. If
/// it offers a strictly better price than the near-miss is asking the buyer to
/// stretch to, drop that near-miss and re-finalize so the cheaper or stronger
/// seller is surfaced instead (it closes when it now fits the cap, or re-anchors
/// the near-miss on itself via the dominance rule in finalizeBidCollection). A
/// bid that does not beat the standing offer is left collected but does not
/// disturb the buyer's pending decision.
async function maybeSupersedeNearMiss(
  state: JobState,
  bid: Bid,
  nm: NearMissApproval,
): Promise<void> {
  // Same seller re-bidding their own near-miss, or a worse/equal price: leave
  // the pending decision untouched.
  if (bid.seller.toLowerCase() === nm.sellerAgent.toLowerCase()) return;
  if (state.triedSellers.has(bid.seller)) return;
  const beatsPrice = Number(bid.priceUsdc) < Number(nm.proceedPriceUsdc);
  // Don't let an off-topic cheap bid hijack a confirmed-topical near-miss.
  const hasFit = (bid.topicalMatch ?? 50) >= 50;
  if (!beatsPrice || !hasFit) return;

  logger.info(
    {
      jobId: state.jobId,
      newSeller: bid.seller,
      newPrice: bid.priceUsdc,
      nmSeller: nm.sellerAgent,
      nmProceedPrice: nm.proceedPriceUsdc,
    },
    'late bid undercuts the pending near-miss, superseding to re-rank',
  );
  bus.emitEvent({
    type: 'negotiation.near-miss.superseded',
    jobId: state.jobId,
    actor: 'buyer',
    payload: {
      seller: bid.seller,
      priceUsdc: bid.priceUsdc,
      supersededSeller: nm.sellerAgent,
      supersededPriceUsdc: nm.proceedPriceUsdc,
    },
  });

  // Drop the pending near-miss and reopen the finalize path. finalizeBidCollection
  // ranks only untried sellers, so the standing near-miss candidate (already in
  // triedSellers) is not re-surfaced; the fresh, cheaper bid is.
  clearNearMiss(state.jobId);
  state.finalized = false;
  state.collectionFired = false;
  await finalizeBidCollection(state);
}

/// The bid-collection window is run by Karwan, not chosen per buyer. The floor
/// is the minimum the window stays open from the first bid; the quiet period
/// extends it on each new bid; the cap bounds it. Real agents bid over a wider
/// span than a demo's 30s, so the window stays open while bids are still
/// arriving rather than slamming shut on a fixed timer. All three are config,
/// not user input, so the negotiation design can be retuned in one place.
const BID_COLLECTION_FLOOR_MS = Number(process.env.BID_COLLECTION_FLOOR_SECONDS ?? 45) * 1000;
const BID_WINDOW_QUIET_MS = Number(process.env.BID_WINDOW_QUIET_MS ?? 15_000);
const BID_WINDOW_MAX_MS = Number(process.env.BID_WINDOW_MAX_MS ?? 180_000);

function scheduleCollectionClose(state: JobState, floorMs: number): void {
  if (state.collectionFired) return;
  const now = Date.now();
  const started = state.collectionStartedAt ?? now;
  const floorEnd = started + floorMs;
  const capEnd = started + BID_WINDOW_MAX_MS;
  // Close no sooner than the floor, extend by the quiet period on each new bid,
  // never past the cap.
  const nextClose = Math.min(capEnd, Math.max(floorEnd, now + BID_WINDOW_QUIET_MS));
  if (state.collectionTimer) clearTimeout(state.collectionTimer);
  state.collectionTimer = setTimeout(
    () => finalizeBidCollection(state),
    Math.max(0, nextClose - now),
  );
}

/// Paid market research for the brief's keywords, gated on the buyer owner
/// having agent research active (and the platform x402 rail configured). Runs
/// once per auction. Stores the read on the state for the proposal, pushes the
/// demand into the shared heat cache so both agents negotiate tuned to it, and
/// meters the account's credit only on a fresh (uncached) call. Best-effort.
async function maybeResearchMarket(state: JobState): Promise<void> {
  if (state.marketRead) return;
  if (!config.X402_PAID_SIGNALS_ENABLED || !config.X402_BASE_PRIVATE_KEY) return;
  const keywords = state.context.keywords ?? [];
  if (keywords.length === 0) return;
  const owner = state.context.buyer;
  try {
    // Market research is a general baseline now: every deal is researched (the
    // platform fronts the Base call), the intel is shared, and only the matched
    // buyer + seller are charged for it at match (see persistApprovedMatch). No
    // per-agent activation gate, no charge at trigger time.
    const read = await researchMarket(keywords);
    state.marketRead = read;
    setResearchHeat(keywords, read);

    // One-time budget-vs-market verdict. fairPriceUsdc is only present when the
    // research was grounded, so unknown/rough prices simply yield 'unknown' and
    // nothing fires. When the buyer's cap sits 40%+ above a grounded market
    // price, advise (non-destructively) that they may be overpaying — the
    // operator decides whether to reopen at market, the agent never cancels.
    const cap = computeBuyerEffectiveCap(state.context, state.buyer);
    const verdict = classifyVsMarket(cap, read.fairPriceUsdc);
    state.marketVerdict = verdict.verdict;
    if (verdict.verdict === 'overpriced') {
      const advisory = {
        jobId: state.jobId,
        buyer: owner,
        budgetUsdc: Number(cap.toFixed(2)),
        fairPriceUsdc: verdict.fairPriceUsdc,
        overPct: verdict.overPct,
        demand: read.demand,
        note: read.priceNote,
        createdAt: Date.now(),
      };
      upsertMarketAdvisory(advisory); // persist so it survives a refresh
      bus.emitEvent({
        type: 'negotiation.market-advisory',
        jobId: state.jobId,
        actor: 'buyer',
        payload: {
          buyer: owner,
          budgetUsdc: advisory.budgetUsdc,
          fairPriceUsdc: verdict.fairPriceUsdc,
          overPct: verdict.overPct,
          demand: read.demand,
          note: read.priceNote,
        },
      });
      logger.info(
        { jobId: state.jobId, cap, fairPriceUsdc: verdict.fairPriceUsdc, overPct: verdict.overPct },
        'market advisory: buyer budget sits well above market price',
      );
    }

    if (!read.cached) {
      bus.emitEvent({
        type: 'agent.paid',
        jobId: state.jobId,
        actor: 'buyer',
        payload: {
          rail: 'base',
          kind: 'research',
          agent: 'buyer',
          amountUsd: read.paidUsd,
          txHash: read.txHash,
          payer: read.payer,
          demand: read.demand,
          keywords,
        },
      });
    }
    logger.info(
      { jobId: state.jobId, demand: read.demand, cached: read.cached },
      'agent market research applied to negotiation',
    );
  } catch (err) {
    logger.warn(
      { jobId: state.jobId, err: (err as Error).message },
      'agent market research failed (non-fatal)',
    );
  }
}

const TIER_RANK: Record<Tier, number> = {
  elite: 4,
  strong: 3,
  established: 2,
  cold: 1,
  new: 0,
};

interface RankedBidEntry {
  bid: Bid;
  deterministicScore: number;
}

/// Rank the bids currently in the pool, highest first. Match-first: the seller
/// whose skills/keywords best cover the brief wins ahead of price and
/// reputation (the karwan-match-ranking rule). Within a topical-match band the
/// deterministic score (price + reputation + completion + age + velocity)
/// decides, with reputation breaking near-ties. Trusted Match flips it to
/// reputation tier first, stake second, price third. Shared by the collection
/// window and the late-bid supersede guard so both rank by identical rules.
function rankBidEntries(state: JobState): RankedBidEntry[] {
  const budget = Number(state.context.budgetUsdc);
  const effectiveCap = computeBuyerEffectiveCap(state.context, state.buyer);
  const trusted = state.context.trustedMatch === true;
  return [...state.bids.values()]
    .filter((b) => typeof b.score === 'number')
    .map((b) => {
      const det = scoreBidDeterministic({
        bidPriceUsdc: Number(b.priceUsdc),
        briefBudgetUsdc: budget,
        effectiveCapUsdc: effectiveCap,
        sellerTier: (b.sellerTier ?? 'established') as Tier,
        sellerCompletionRate: b.completionRate,
        sellerVelocity24h: b.velocity24h,
        relationshipScore: relationshipScoreFromDeals(b.priorCleanDealsWithBuyer ?? 0),
      });
      return { bid: b, deterministicScore: det.score };
    })
    .sort((a, b) => {
      const bandDelta = matchBand(b.bid) - matchBand(a.bid);
      if (bandDelta !== 0) return bandDelta;

      if (trusted) {
        const tierA = TIER_RANK[(a.bid.sellerTier ?? 'established') as Tier];
        const tierB = TIER_RANK[(b.bid.sellerTier ?? 'established') as Tier];
        if (tierA !== tierB) return tierB - tierA;
        const stakeA = a.bid.sellerFreeStakeUsdc ?? 0;
        const stakeB = b.bid.sellerFreeStakeUsdc ?? 0;
        if (stakeA !== stakeB) return stakeB - stakeA;
        // Within the same tier and stake, cheaper wins.
        return Number(a.bid.priceUsdc) - Number(b.bid.priceUsdc);
      }

      const scoreDelta = b.deterministicScore - a.deterministicScore;
      if (Math.abs(scoreDelta) < REPUTATION_TIEBREAK_EPSILON) {
        const repA = a.bid.sellerReputationBps ?? 5000;
        const repB = b.bid.sellerReputationBps ?? 5000;
        if (repA !== repB) return repB - repA;
      }
      return scoreDelta;
    });
}

/// Late-bid supersede guard. The collection window ranks and queues candidates
/// once; a stronger bid that lands after it closed (e.g. an ELITE arriving while
/// the agent is mid-negotiation with a COLD seller) would otherwise never be
/// reconsidered. Before a match commits, re-rank the whole pool: if the best bid
/// is now a different, untried seller that strictly outranks the one about to be
/// proposed AND its bid price is already within the buyer's cap (acceptable
/// directly, no fresh negotiation), return it to commit instead. Returns null
/// when the intended seller is still best, when it has no bid in the pool, or
/// when the better bid would need negotiation. It never abandons an in-flight
/// negotiation; it only redirects the commit to an already-acceptable winner.
function pickSupersedingBid(
  state: JobState,
  intendedSeller: `0x${string}`,
): Bid | null {
  const ranked = rankBidEntries(state);
  if (ranked.length === 0) return null;
  const top = ranked[0]!.bid;
  if (top.seller.toLowerCase() === intendedSeller.toLowerCase()) return null;
  if (state.triedSellers.has(top.seller)) return null;

  const intendedEntry = ranked.find(
    (e) => e.bid.seller.toLowerCase() === intendedSeller.toLowerCase(),
  );
  // Without the intended seller's own bid to compare against (listing-driven or
  // near-miss commits), stay conservative and don't redirect.
  if (!intendedEntry) return null;

  // Only supersede on a clear edge: a higher match band, or the same band with a
  // higher reputation tier. A marginal score shuffle inside a band shouldn't
  // yank a converged negotiation away at the last moment.
  const betterBand = matchBand(top) > matchBand(intendedEntry.bid);
  const sameBand = matchBand(top) === matchBand(intendedEntry.bid);
  const betterTier =
    TIER_RANK[(top.sellerTier ?? 'established') as Tier] >
    TIER_RANK[(intendedEntry.bid.sellerTier ?? 'established') as Tier];
  if (!betterBand && !(sameBand && betterTier)) return null;

  // The winner must be acceptable at its own bid price; we do not reopen
  // negotiation here.
  const effectiveCap = computeBuyerEffectiveCap(state.context, state.buyer);
  if (Number(top.priceUsdc) > effectiveCap) return null;

  return top;
}

async function finalizeBidCollection(state: JobState) {
  if (state.collectionFired || state.finalized) return;
  state.collectionFired = true;
  state.collectionTimer = null;

  // Match-first ranking (see rankBidEntries). budget + effectiveCap are also
  // used by the tier-aware branches below.
  const budget = Number(state.context.budgetUsdc);
  const effectiveCap = computeBuyerEffectiveCap(state.context, state.buyer);
  // Only rank sellers not already worked through. On the first run triedSellers
  // is empty (no effect); after a re-open (near-miss passed) this leaves just
  // the fresh bids, so the same exhausted pool can never re-negotiate in a loop.
  const rankedEntries = rankBidEntries(state).filter((e) => !state.triedSellers.has(e.bid.seller));
  const ranked = rankedEntries.map((entry) => entry.bid);

  // Audit: log when a ranking rule put a seller on top that a plain price+rep
  // sort would not have, so the choice is narratable and the bands are tunable.
  // Two cases worth surfacing: a stronger skill fit overriding a higher
  // deterministic score (the whole point of match ranking), and reputation
  // breaking a near-tie within a band.
  if (rankedEntries.length > 1) {
    const top = rankedEntries[0]!;
    const second = rankedEntries[1]!;
    if (matchBand(top.bid) > matchBand(second.bid) && top.deterministicScore < second.deterministicScore) {
      logger.info(
        {
          jobId: state.jobId,
          chosen: top.bid.seller,
          chosenMatch: top.bid.topicalMatch,
          chosenScore: top.deterministicScore,
          runnerUp: second.bid.seller,
          runnerUpMatch: second.bid.topicalMatch,
          runnerUpScore: second.deterministicScore,
        },
        'skill match outranked a higher price+reputation score',
      );
    } else if (
      Math.abs(top.deterministicScore - second.deterministicScore) < REPUTATION_TIEBREAK_EPSILON &&
      (top.bid.sellerReputationBps ?? 5000) > (second.bid.sellerReputationBps ?? 5000) &&
      top.deterministicScore < second.deterministicScore
    ) {
      logger.info(
        {
          jobId: state.jobId,
          chosen: top.bid.seller,
          chosenRepBps: top.bid.sellerReputationBps ?? 5000,
          runnerUp: second.bid.seller,
          runnerUpRepBps: second.bid.sellerReputationBps ?? 5000,
        },
        'reputation broke a near-tie in bid ranking',
      );
    }
  }

  if (ranked.length === 0) {
    const received = state.bids.size;
    logger.warn({ jobId: state.jobId, received }, 'no scored bids, nothing to counter');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        // Be accurate: distinguish "nobody bid" from "bids came in but could
        // not be evaluated", so the timeline never says "no bids" when bids
        // were actually received.
        reason: received > 0 ? 'bids-unevaluated' : 'no-bids',
        detail:
          received > 0
            ? `received ${received} bid(s) but none could be evaluated`
            : 'bid collection window closed with no bids from any seller',
        receivedBids: received,
      },
    });
    return;
  }

  // Build the candidate queue: top-MAX_CANDIDATES bids in ranked (match-first)
  // order. When the head's negotiation fails, the buyer agent moves to the
  // next candidate instead of finalizing. This turns the bid pool into a
  // funnel the agent works through, mirroring how a human would line up
  // alternatives before committing.
  state.candidateQueue = ranked.slice(0, MAX_CANDIDATES);
  logger.info(
    {
      jobId: state.jobId,
      queueDepth: state.candidateQueue.length,
      candidates: state.candidateQueue.map((c) => ({
        seller: c.seller,
        priceUsdc: c.priceUsdc,
        tier: c.sellerTier,
        match: c.topicalMatch,
      })),
    },
    'candidate queue built',
  );

  const top = ranked[0]!;
  const topPrice = Number(top.priceUsdc);
  const topTier = top.sellerTier ?? 'established';

  // Tier-aware bid handling per reputation-model.md §6. Branches BEFORE the
  // standard budget short-circuit so each tier gets its specific treatment.

  // ELITE: skip the auction window entirely. Accept any price within the
  // buyer's effective cap (budget × tolerance and the profile maxBudgetUsdc).
  // Rationale: top-tier sellers have earned discretion. The LLM may still
  // have countered them in normal flow, but the spec says elite gets first
  // look, so we honour that.
  if (topTier === 'elite' && topPrice <= effectiveCap) {
    logger.info(
      {
        jobId: state.jobId,
        seller: top.seller,
        bidPrice: topPrice,
        budget,
        effectiveCap,
        bids: ranked.length,
      },
      'top bid from elite seller, accepting directly (skip auction per §6)',
    );
    await proposeMatch(state, top.seller, top.priceUsdc, top.pattern);
    return;
  }

  // STRONG: short-circuit when top bid is within 5% of the next-best bid.
  // This means the LLM's near-tie ranking is reliable enough that we trust
  // it without an extra counter round. Falls through to standard logic
  // when there's no second bid or the gap is wider.
  if (topTier === 'strong' && ranked.length >= 2 && topPrice <= budget) {
    const secondPrice = Number(ranked[1]!.priceUsdc);
    if (secondPrice > 0 && Math.abs(topPrice - secondPrice) / secondPrice <= 0.05) {
      logger.info(
        {
          jobId: state.jobId,
          seller: top.seller,
          bidPrice: topPrice,
          runnerUpPrice: secondPrice,
          tier: topTier,
        },
        'strong-tier top bid within +5% of next-best, accepting directly (§6)',
      );
      await proposeMatch(state, top.seller, top.priceUsdc, top.pattern);
      return;
    }
  }

  // COLD: even when the bid is already at/under budget, the spec asks for a
  // single -5% counter to discourage opportunistic pricing from unproven
  // sellers. Skip the counter if it would dip below a sensible floor (1 USDC)
  // so degenerate cases don't ratchet to zero.
  if (topTier === 'cold' && topPrice <= budget) {
    const counterPrice = topPrice * 0.95;
    if (counterPrice >= 1) {
      const remainingDays = Math.max(
        state.buyer.minDeadlineDays,
        Math.min(
          state.buyer.maxDeadlineDays,
          Math.floor((top.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
        ),
      );
      logger.info(
        {
          jobId: state.jobId,
          seller: top.seller,
          bidPrice: topPrice,
          counterPrice: counterPrice.toFixed(2),
          tier: topTier,
        },
        'cold-tier seller, forcing -5% counter even at/under budget (§6)',
      );
      await issueCounter(state, {
        ...top,
        suggestedCounterPrice: counterPrice.toFixed(2),
        suggestedCounterDeadlineDays: remainingDays,
      });
      return;
    }
  }

  // ESTABLISHED + un-handled STRONG + un-handled COLD: standard direct-accept
  // short-circuit. If the top bid is already at or below the buyer's stated
  // budget, accept it. Prevents the LLM-vs-LLM race-to-the-bottom counter
  // pattern where both sides reflexively counter-down regardless of context.
  if (topPrice <= budget) {
    logger.info(
      {
        jobId: state.jobId,
        seller: top.seller,
        bidPrice: topPrice,
        budget,
        bids: ranked.length,
        tier: topTier,
      },
      'top bid at/under budget, accepting directly (no counter)',
    );
    await proposeMatch(state, top.seller, top.priceUsdc, top.pattern);
    return;
  }

  logger.info(
    {
      jobId: state.jobId,
      seller: top.seller,
      score: top.score,
      bids: ranked.length,
      bidPrice: topPrice,
      budget,
      tier: topTier,
    },
    'top bid above budget, issuing counter',
  );

  // The LLM scoring does not always attach a counter suggestion. We still owe a
  // counter on an above-budget bid, so fall back to anchoring at the buyer's
  // budget (their committed valuation) over their deadline window, the same way
  // the cold-tier path builds its counter, rather than stalling the deal inside
  // issueCounter when the suggestion is missing.
  const fallbackCounterDeadlineDays =
    top.suggestedCounterDeadlineDays ??
    Math.max(
      state.buyer.minDeadlineDays,
      Math.min(
        state.buyer.maxDeadlineDays,
        Math.floor((top.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
      ),
    );
  await issueCounter(state, {
    ...top,
    suggestedCounterPrice: top.suggestedCounterPrice ?? budget.toFixed(2),
    suggestedCounterDeadlineDays: fallbackCounterDeadlineDays,
  });
}

/// Returns the tried candidate with the lowest last seller-counter price.
/// Used by the walk-end near-miss path: when the candidate queue exhausts
/// without a match, this picks the best (cheapest) "they wouldn't go below"
/// price across all tried sellers. Returns null when no seller ever
/// counter-responded (handleCounterResponse never fired), so the buyer never
/// got a chance to see a real counter from anyone, so there is no number
/// worth surfacing as a near-miss.
function pickLowestSellerLast(
  state: JobState,
): { seller: `0x${string}`; lastPrice: string } | null {
  let best: { seller: `0x${string}`; lastPrice: string } | null = null;
  for (const [seller, lastPrice] of state.lastSellerCounterBySeller.entries()) {
    if (!state.triedSellers.has(seller)) continue;
    // Skip sellers already exhausted before the buyer's last pass — only a fresh
    // bidder may raise a new near-miss, so a pass can't loop on old offers.
    if (state.sellersAtLastPass?.has(seller)) continue;
    const n = Number(lastPrice);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!best || n < Number(best.lastPrice)) {
      best = { seller, lastPrice };
    }
  }
  return best;
}

/// Pop the next candidate off the queue and start a fresh negotiation with
/// them. Called from any terminal-failure path on the current candidate
/// (LLM decline, counter-out-of-range, max-counter-rounds). Marks the
/// previous seller as tried so we don't loop. When the queue is empty,
/// emits `negotiation.exhausted` and finalizes the job, or raises a
/// walk-end near-miss with the best last seller price across all tried
/// candidates so the buyer can approve the stretch instead of getting a
/// silent decline (karwan_near_miss doctrine extended).
///
/// The new candidate gets a fresh negotiation: their bid is re-evaluated
/// against the buyer's budget and tier rules. If their bid is in budget
/// the buyer proposes a match (fast path). If above budget but inside the
/// effective cap, the buyer issues a counter (full round budget). Anything
/// further out is skipped, and we recurse to the next candidate.
async function tryNextCandidate(state: JobState, failedSeller: `0x${string}`, reason: string) {
  if (state.finalized) return;
  // Leaving the "waiting on this seller" state: cancel any pending watchdog so
  // it can't double-fire after we've already moved on.
  clearCounterWatchdog(state);
  state.triedSellers.add(failedSeller);
  bus.emitEvent({
    type: 'negotiation.attempt-ended',
    jobId: state.jobId,
    actor: 'buyer',
    payload: { seller: failedSeller, reason, triedCount: state.triedSellers.size },
  });

  // Find the next not-tried bid in the queue.
  const next = state.candidateQueue.find((b) => !state.triedSellers.has(b.seller));
  if (!next) {
    logger.info(
      {
        jobId: state.jobId,
        triedSellers: state.triedSellers.size,
        queueDepth: state.candidateQueue.length,
      },
      'candidate queue exhausted, attempting walk-end near-miss',
    );

    // Walk-end near-miss. The buyer set a budget + tolerance with eyes open;
    // when negotiation walked and nothing converged, surface the best last
    // seller price as an approval prompt instead of a silent decline. The
    // near-miss module's gap-band gate (default 100% above buyer ceiling for
    // confirmed-topical matches) keeps runaway proposals out: a 50 USDC brief
    // can surface up to ~100 USDC, never 500. If no candidate's last counter
    // is within band, we fall through to the existing decline path.
    const buyerCeiling = computeBuyerEffectiveCap(state.context, state.buyer);
    const best = pickLowestSellerLast(state);
    if (best && Number(best.lastPrice) > buyerCeiling) {
      try {
        const raised = await maybeRaiseNearMiss({
          jobId: state.jobId,
          buyerAgent: state.buyer.address,
          sellerAgent: best.seller,
          deadlineUnix: state.context.deadlineUnix,
          buyerCeilingUsdc: buyerCeiling,
          sellerFloorUsdc: Number(best.lastPrice),
          confirmedTopical: true,
          bandPctOverride: nearMissBandFor(state.context),
          market: marketContextFor(state),
        });
        if (raised) {
          state.finalized = true;
          bus.emitEvent({
            type: 'negotiation.exhausted',
            jobId: state.jobId,
            actor: 'buyer',
            payload: {
              triedCount: state.triedSellers.size,
              queueDepth: state.candidateQueue.length,
              nearMissRaised: true,
              askedPriceUsdc: best.lastPrice,
              askedSeller: best.seller,
            },
          });
          logger.info(
            { jobId: state.jobId, seller: best.seller, askedPriceUsdc: best.lastPrice },
            'walk-end near-miss raised; buyer can approve the stretch',
          );
          return;
        }
      } catch (err) {
        logger.warn(
          { jobId: state.jobId, err: (err as Error).message },
          'walk-end near-miss raise failed; falling through to decline',
        );
      }
    }

    state.finalized = true;
    bus.emitEvent({
      type: 'negotiation.exhausted',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        triedCount: state.triedSellers.size,
        queueDepth: state.candidateQueue.length,
      },
    });
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        reason: 'all-candidates-exhausted',
        detail: `Attempted ${state.triedSellers.size} of ${state.candidateQueue.length} candidates; none converged.`,
        triedCount: state.triedSellers.size,
      },
    });
    return;
  }

  bus.emitEvent({
    type: 'negotiation.next-candidate',
    jobId: state.jobId,
    actor: 'buyer',
    payload: {
      seller: next.seller,
      priceUsdc: next.priceUsdc,
      tier: next.sellerTier,
      remainingInQueue: state.candidateQueue.filter((b) => !state.triedSellers.has(b.seller)).length - 1,
    },
  });

  const nextPrice = Number(next.priceUsdc);
  const budget = Number(state.context.budgetUsdc);
  const effectiveCap = computeBuyerEffectiveCap(state.context, state.buyer);
  const nextTier = next.sellerTier ?? 'established';

  // Apply the same accept-or-counter logic as finalizeBidCollection. ELITE
  // and at/under budget land directly; above budget but in cap issues a
  // fresh counter (round budget resets for this seller since the
  // counterRoundsBySeller map is keyed by seller address).
  if (nextTier === 'elite' && nextPrice <= effectiveCap) {
    logger.info(
      { jobId: state.jobId, seller: next.seller, bidPrice: nextPrice },
      'next candidate is elite, accepting directly',
    );
    await proposeMatch(state, next.seller, next.priceUsdc, next.pattern);
    return;
  }
  if (nextPrice <= budget) {
    logger.info(
      { jobId: state.jobId, seller: next.seller, bidPrice: nextPrice, budget },
      'next candidate at/under budget, accepting directly',
    );
    await proposeMatch(state, next.seller, next.priceUsdc, next.pattern);
    return;
  }
  if (nextPrice <= effectiveCap) {
    logger.info(
      { jobId: state.jobId, seller: next.seller, bidPrice: nextPrice, effectiveCap },
      'next candidate above budget but in cap, issuing fresh counter',
    );
    // Same fallback as the primary counter path: if the LLM did not attach a
    // counter suggestion, anchor at budget over the deadline window instead of
    // stalling in issueCounter.
    const fallbackCounterDeadlineDays =
      next.suggestedCounterDeadlineDays ??
      Math.max(
        state.buyer.minDeadlineDays,
        Math.min(
          state.buyer.maxDeadlineDays,
          Math.floor((next.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
        ),
      );
    await issueCounter(state, {
      ...next,
      suggestedCounterPrice: next.suggestedCounterPrice ?? budget.toFixed(2),
      suggestedCounterDeadlineDays: fallbackCounterDeadlineDays,
    });
    return;
  }
  // Their bid is outside the effective cap. Before walking, raise a
  // near-miss so the buyer can stretch if the gap is small. Confirmed-topical
  // because the cascade already promoted this candidate as a real match.
  try {
    const raised = await maybeRaiseNearMiss({
      jobId: state.jobId,
      buyerAgent: state.buyer.address,
      sellerAgent: next.seller,
      deadlineUnix: state.context.deadlineUnix,
      buyerCeilingUsdc: effectiveCap,
      sellerFloorUsdc: nextPrice,
      confirmedTopical: true,
      bandPctOverride: nearMissBandFor(state.context),
      market: marketContextFor(state),
    });
    if (raised) {
      state.finalized = true;
      logger.info(
        { jobId: state.jobId, seller: next.seller, bidPrice: nextPrice, effectiveCap },
        'next candidate priced above cap; near-miss raised, awaiting human',
      );
      return;
    }
  } catch (err) {
    logger.warn(
      { jobId: state.jobId, err: (err as Error).message },
      'cascade near-miss raise failed; falling through to next candidate',
    );
  }
  logger.info(
    { jobId: state.jobId, seller: next.seller, bidPrice: nextPrice, effectiveCap },
    'next candidate priced above effective cap, skipping to next',
  );
  await tryNextCandidate(state, next.seller, 'price-above-cap');
}

async function issueCounter(state: JobState, bid: Bid) {
  const buyer = state.buyer;
  if (!bid.suggestedCounterPrice || !bid.suggestedCounterDeadlineDays) {
    logger.warn({ jobId: state.jobId }, 'bid missing counter suggestion');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.error',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: bid.seller,
        scope: 'issueCounter',
        message: 'top bid arrived without a counter price/deadline from the LLM',
      },
    });
    return;
  }

  const counterPrice = Number(bid.suggestedCounterPrice);
  const effectiveCap = computeBuyerEffectiveCap(state.context, buyer);
  if (counterPrice > effectiveCap) {
    // The best-ranked seller can't be countered within budget. Surface IT to the
    // buyer as a proceed/pass near-miss at the seller's price — it is the buyer's
    // best over-budget option — instead of silently abandoning it and walking to
    // a worse, pricier candidate. This was the dominance bug: an ELITE bid over
    // cap was dropped here while a pricier COLD seller got the near-miss and the
    // match. Only fall through to the next candidate when the gap is too wide to
    // be a near-miss at all (maybeRaiseNearMiss returns false on gap-too-wide).
    const sellerFloor = Number(bid.priceUsdc);
    try {
      const raised = await maybeRaiseNearMiss({
        jobId: state.jobId,
        buyerAgent: state.buyer.address,
        sellerAgent: bid.seller,
        deadlineUnix: state.context.deadlineUnix,
        buyerCeilingUsdc: effectiveCap,
        sellerFloorUsdc: Number.isFinite(sellerFloor) ? sellerFloor : counterPrice,
        confirmedTopical: true,
        bandPctOverride: nearMissBandFor(state.context),
        market: marketContextFor(state),
      });
      if (raised) {
        state.finalized = true;
        logger.info(
          { jobId: state.jobId, seller: bid.seller, sellerFloor, effectiveCap },
          'best bid over cap: raised near-miss on the best seller instead of walking to a worse one',
        );
        return;
      }
    } catch (err) {
      logger.warn(
        { jobId: state.jobId, err: (err as Error).message },
        'over-cap near-miss raise failed; falling through to next candidate',
      );
    }
    logger.warn(
      { jobId: state.jobId, counterPrice, effectiveCap },
      'LLM counter exceeds cap and gap too wide for a near-miss, trying next candidate',
    );
    await tryNextCandidate(state, bid.seller, 'llm-counter-over-budget');
    return;
  }

  // The buyer's posted budget is their committed valuation and the floor of the
  // negotiation: never counter below it. The buyer holds at budget and concedes
  // only upward toward the tolerance cap, mirroring the seller pushing up. This
  // is what keeps a settlement inside [budget, cap] instead of below budget.
  const briefBudget = Number(state.context.budgetUsdc);
  const counterUsdc = Math.max(
    Number.isFinite(briefBudget) ? briefBudget : counterPrice,
    counterPrice,
  ).toFixed(2);

  const counterDeadlineUnix =
    Math.floor(Date.now() / 1000) + bid.suggestedCounterDeadlineDays * 86_400;
  const counterPriceWei = parseUnits(counterUsdc, USDC_DECIMALS);

  // Keep the brief's working deadline in step with the negotiation. A counter
  // routinely proposes a later delivery date than the original (often short)
  // brief deadline; without this the jobExpiryWatcher reaps an in-flight
  // negotiation at the original clock. Extend only, never shorten.
  extendWorkingDeadline(state, counterDeadlineUnix);

  state.lastCounterPriceBySeller.set(bid.seller, counterUsdc);
  state.counterRoundsBySeller.set(
    bid.seller,
    (state.counterRoundsBySeller.get(bid.seller) ?? 0) + 1,
  );

  const result = await executeContractCall(
    {
      walletId: buyer.walletId,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'counterOffer(bytes32,address,uint256,uint64)',
      abiParameters: [
        state.jobId,
        bid.seller,
        counterPriceWei.toString(),
        counterDeadlineUnix.toString(),
      ],
    },
    `counterOffer(${state.jobId})`,
  );

  logger.info({ jobId: state.jobId, seller: bid.seller, ...result }, 'counter issued');
  bus.emitEvent({
    type: 'counter.issued',
    jobId: state.jobId,
    actor: 'buyer',
    payload: {
      seller: bid.seller,
      counterPriceUsdc: counterUsdc,
      counterDeadlineDays: bid.suggestedCounterDeadlineDays,
      txHash: result.txHash,
    },
  });

  // Arm the stall watchdog. The seller now owes us an on-chain CounterResponse;
  // if none lands before the timeout (it declined off-chain, the WS event was
  // dropped, or the seller crashed mid-round) we cascade to the next candidate
  // instead of waiting forever. handleCounterResponse clears this on a reply.
  clearCounterWatchdog(state);
  const watchedSeller = bid.seller;
  state.counterWatchdog = setTimeout(() => {
    state.counterWatchdog = null;
    if (state.finalized || state.expired) return;
    if (state.triedSellers.has(watchedSeller)) return;
    logger.warn(
      { jobId: state.jobId, seller: watchedSeller, timeoutMs: COUNTER_RESPONSE_TIMEOUT_MS },
      'no counter response within watchdog window, cascading to next candidate',
    );
    safe('counterWatchdog', () =>
      tryNextCandidate(state, watchedSeller, 'no-response-timeout'),
    );
  }, COUNTER_RESPONSE_TIMEOUT_MS);
}

async function handleCounterResponse(log: Log) {
  const dedupeKey = logDedupeKey('CounterResponse', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: CounterResponseArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state || state.finalized || state.expired) return;
  // A late response from a seller we already cascaded past (watchdog fired or
  // they declined off-chain first) must not reopen a closed negotiation.
  if (state.triedSellers.has(args.seller)) return;
  // The seller replied in time; cancel the stall watchdog.
  clearCounterWatchdog(state);
  const buyer = state.buyer;

  if (args.accepted) {
    const agreedPriceUsdc = state.lastCounterPriceBySeller.get(args.seller) ?? '0';
    const originatingBid = state.bids.get(args.seller);
    await proposeMatch(state, args.seller, agreedPriceUsdc, originatingBid?.pattern);
    return;
  }

  const sellerCounterPrice = formatUnits(args.newPrice, USDC_DECIMALS);
  const sellerCounterDeadlineUnix = Number(args.newDeadline);
  // Record the seller's most recent counter so the walk-end near-miss path
  // can surface the best last price across all tried candidates when the
  // negotiation exhausts without convergence.
  state.lastSellerCounterBySeller.set(args.seller, sellerCounterPrice);
  // The seller's counter can carry a later delivery date too; keep the working
  // deadline aligned so the expiry watcher doesn't cut the round short.
  extendWorkingDeadline(state, sellerCounterDeadlineUnix);
  const buyerLastCounter = state.lastCounterPriceBySeller.get(args.seller) ?? '0';
  const effectiveMaxAcceptable = computeBuyerEffectiveCap(state.context, buyer);

  // Strategy module computes a deterministic next-counter price for the
  // prompt. Concession decay + tier elasticity + urgency, all deterministic
  // so the LLM has a defensible target to ratify or refine.
  const currentRound = state.counterRoundsBySeller.get(args.seller) ?? 0;
  const bidForSeller = state.bids.get(args.seller);
  const sellerTier = (bidForSeller?.sellerTier ?? 'established') as Tier;
  const priorCleanDeals = bidForSeller?.priorCleanDealsWithBuyer ?? 0;
  const daysToDeadline = Math.max(
    1,
    Math.floor((state.context.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
  );
  const buyerLastNumeric = Number(buyerLastCounter || state.context.budgetUsdc);
  // The buyer never re-counters below their posted budget (their committed
  // valuation). Floor the deterministic suggestion and the LLM range at it so
  // the seller's steering floor (also the budget now) is never tripped.
  const briefBudget = Number(state.context.budgetUsdc);
  const buyerFloor = Number.isFinite(briefBudget) ? briefBudget : 0;
  const suggestedCounter = nextCounterPrice({
    role: 'buyer',
    mine: buyerLastNumeric,
    theirs: Number(sellerCounterPrice),
    round: currentRound,
    floor: buyerFloor,
    ceiling: effectiveMaxAcceptable,
    tier: sellerTier,
    daysToDeadline,
    // Goodwill: concede a touch faster toward a familiar seller, still clamped
    // to effectiveMaxAcceptable so it never pays above the buyer's cap.
    relationshipCleanDeals: priorCleanDeals,
  });

  let decision: CounterEvaluation;
  try {
    const result = await withLlmRetry(`counterEvaluation(${state.jobId})`, () =>
      generateObject({
        model: negotiationModel,
        schema: counterEvaluationSchema,
        prompt: buildCounterEvaluationPrompt(
          state.context,
          {
            side: 'buyer',
            minAcceptablePriceUsdc: buyerFloor,
            maxAcceptablePriceUsdc: effectiveMaxAcceptable,
            minDeadlineDays: buyer.minDeadlineDays,
            maxDeadlineDays: buyer.maxDeadlineDays,
          },
          buyerLastCounter,
          sellerCounterPrice,
          sellerCounterDeadlineUnix,
          {
            round: currentRound,
            maxRounds: buyer.maxCounterRounds,
            counterpartyTier: sellerTier,
            suggestedCounterPrice: suggestedCounter,
            // Per-category settlement median (this brief's skills), falling back
            // to the global ring when the category is thin.
            marketMedianPrice: (categoryPriceSnapshot(state.context.keywords ?? []) ?? priceHistorySnapshot())?.median,
            marketSampleCount: (categoryPriceSnapshot(state.context.keywords ?? []) ?? priceHistorySnapshot())?.sampleCount,
            // Live demand from the agent's paid research tilts the concession
            // WITHIN the buyer's cap (hot: pay nearer the cap; soft: hold near
            // budget). The cap above is hard; out-of-cap still routes to human.
            marketHeat: state.marketRead ? researchHeatFromRead(state.marketRead) : undefined,
            ...(state.marketRead
              ? {
                  fairPriceUsdc: state.marketRead.fairPriceUsdc,
                  priceConfidence: state.marketRead.priceConfidence,
                  researchSummary: state.marketRead.summary?.slice(0, 300),
                }
              : {}),
            trustedMatch: state.context.trustedMatch === true,
            priorCleanDeals,
          },
        ),
      }),
    );
    decision = result.object;
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: state.jobId, err: message },
      'counter eval LLM failed, falling back to heuristic',
    );
    // Don't strand the deal in a finalized-without-decision state. Use the
    // deterministic strategy module: accept the seller's counter if it's at
    // or under the buyer's effective cap, otherwise decline.
    const fallback = heuristicCounterDecision({
      role: 'buyer',
      theirOffer: Number(sellerCounterPrice),
      floor: 0,
      ceiling: effectiveMaxAcceptable,
    });
    bus.emitEvent({
      type: 'agent.fallback',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: args.seller,
        scope: 'counterEvaluation',
        message,
        decision: fallback.decision,
        reasoning: fallback.reasoning,
      },
    });
    // confidence 0.95: the heuristic is deterministic and bypasses the
    // LLM-confidence threshold so the fallback decision is honoured.
    decision = {
      decision: fallback.decision,
      confidence: 0.95,
      reasoning: fallback.reasoning,
    };
  }

  logger.info({ jobId: state.jobId, seller: args.seller, decision }, 'counter-response evaluated');

  if (decision.confidence < buyer.confidenceThreshold) {
    const sellerOfferLowConf = Number(sellerCounterPrice);
    if (
      Number.isFinite(sellerOfferLowConf) &&
      sellerOfferLowConf > 0 &&
      sellerOfferLowConf <= effectiveMaxAcceptable
    ) {
      logger.info(
        { jobId: state.jobId, seller: args.seller, sellerOffer: sellerOfferLowConf, ceiling: effectiveMaxAcceptable },
        'tolerance override: low LLM confidence but seller offer is within ceiling, accepting',
      );
      const originatingBid = state.bids.get(args.seller);
      await proposeMatch(state, args.seller, sellerCounterPrice, originatingBid?.pattern);
      return;
    }
    /// Ask-mode safety net: if the brief was posted with no tolerance ("no
    /// ceiling, ask me"), a low-confidence LLM call on an above-budget
    /// counter used to silently skip the seller. The buyer never heard
    /// about a price they likely would have approved. Raise the near-miss
    /// instead, with the wider ask-mode band. If the gap is genuinely
    /// outrageous (past the band), the near-miss falls through and we
    /// continue the original skip behaviour.
    if (isAskMode(state.context) && Number.isFinite(sellerOfferLowConf) && sellerOfferLowConf > 0) {
      try {
        const raised = await maybeRaiseNearMiss({
          jobId: state.jobId,
          buyerAgent: state.buyer.address,
          sellerAgent: args.seller,
          deadlineUnix: state.context.deadlineUnix,
          buyerCeilingUsdc: effectiveMaxAcceptable,
          sellerFloorUsdc: sellerOfferLowConf,
          confirmedTopical: true,
          bandPctOverride: nearMissBandFor(state.context),
          market: marketContextFor(state),
        });
        if (raised) {
          state.finalized = true;
          logger.info(
            { jobId: state.jobId, seller: args.seller, sellerOffer: sellerOfferLowConf, ceiling: effectiveMaxAcceptable },
            'ask-mode: low LLM confidence + above-ceiling seller, near-miss raised',
          );
          return;
        }
      } catch (err) {
        logger.warn(
          { jobId: state.jobId, err: (err as Error).message },
          'ask-mode low-confidence near-miss raise failed; falling through to next candidate',
        );
      }
    }
    logger.info({ jobId: state.jobId }, 'low confidence, trying next candidate');
    await tryNextCandidate(state, args.seller, 'low-confidence');
    return;
  }

  if (decision.decision === 'accept') {
    const originatingBid = state.bids.get(args.seller);
    await proposeMatch(state, args.seller, sellerCounterPrice, originatingBid?.pattern);
    return;
  }

  const sellerOfferN = Number(sellerCounterPrice);
  const rounds = state.counterRoundsBySeller.get(args.seller) ?? 0;
  // Tolerance is authoritative. The buyer explicitly signed up to pay up to
  // effectiveMaxAcceptable; the LLM picks tone within that band but cannot
  // walk away inside it. Catches LLM-decline AND max-counter-rounds, both
  // of which used to lose deals like 51.21 vs a 55 ceiling.
  const inToleranceBand =
    Number.isFinite(sellerOfferN) &&
    sellerOfferN <= effectiveMaxAcceptable &&
    sellerOfferN > 0;

  if (decision.decision === 'decline') {
    if (inToleranceBand) {
      logger.info(
        { jobId: state.jobId, seller: args.seller, sellerOffer: sellerOfferN, ceiling: effectiveMaxAcceptable },
        'tolerance override: LLM declined but seller offer is within ceiling, accepting',
      );
      const originatingBid = state.bids.get(args.seller);
      await proposeMatch(state, args.seller, sellerCounterPrice, originatingBid?.pattern);
      return;
    }
    // Seller's counter is ABOVE ceiling but the gap may still be a near-miss.
    // Raise it to the human before walking. Confirmed-topical because we
    // already engaged with rounds of negotiation against this seller.
    try {
      const raised = await maybeRaiseNearMiss({
        jobId: state.jobId,
        buyerAgent: state.buyer.address,
        sellerAgent: args.seller,
        deadlineUnix: state.context.deadlineUnix,
        buyerCeilingUsdc: effectiveMaxAcceptable,
        sellerFloorUsdc: sellerOfferN,
        confirmedTopical: true,
        bandPctOverride: nearMissBandFor(state.context),
        market: marketContextFor(state),
      });
      if (raised) {
        state.finalized = true;
        logger.info(
          { jobId: state.jobId, seller: args.seller, sellerOffer: sellerOfferN, ceiling: effectiveMaxAcceptable },
          'LLM declined and seller offer above ceiling; near-miss raised, awaiting human',
        );
        return;
      }
    } catch (err) {
      logger.warn(
        { jobId: state.jobId, err: (err as Error).message },
        'mid-walk near-miss raise failed; falling through to decline',
      );
    }
    logger.info({ jobId: state.jobId }, 'declined seller counter, trying next candidate');
    await tryNextCandidate(state, args.seller, 'llm-decline');
    return;
  }

  // Final-round acceptance: if the buyer is about to hit the round cap AND
  // the seller's offer is inside the effective ceiling, accept rather than
  // walk away over a single round. Mirrors how a human in the last seat at
  // the negotiating table would close instead of restart.
  if (rounds >= buyer.maxCounterRounds - 1) {
    if (
      shouldAcceptOnFinalRound({
        role: 'buyer',
        currentRound: rounds,
        maxRounds: buyer.maxCounterRounds,
        theirOffer: sellerOfferN,
        myCeiling: effectiveMaxAcceptable,
        myFloor: 0,
      })
    ) {
      logger.info(
        { jobId: state.jobId, rounds, sellerOffer: sellerOfferN, ceiling: effectiveMaxAcceptable },
        'final round, seller offer inside cap, accepting instead of declining',
      );
      const originatingBid = state.bids.get(args.seller);
      await proposeMatch(state, args.seller, sellerCounterPrice, originatingBid?.pattern);
      return;
    }
  }
  if (rounds >= buyer.maxCounterRounds) {
    if (inToleranceBand) {
      logger.info(
        { jobId: state.jobId, rounds, sellerOffer: sellerOfferN, ceiling: effectiveMaxAcceptable },
        'tolerance override: rounds exhausted but seller offer is within ceiling, accepting',
      );
      const originatingBid = state.bids.get(args.seller);
      await proposeMatch(state, args.seller, sellerCounterPrice, originatingBid?.pattern);
      return;
    }
    logger.info({ jobId: state.jobId, rounds }, 'max counter rounds reached, trying next candidate');
    await tryNextCandidate(state, args.seller, 'max-counter-rounds');
    return;
  }

  // The LLM picked "counter" but Gemini Flash Lite intermittently drops the
  // price/deadline fields. Don't strand the deal: fall back to the deterministic
  // suggestion the strategy module already produced above, keeping the seller's
  // proposed timing clamped to the buyer's window. issueCounter still enforces
  // the effective cap, so this can never counter above budget.
  const finalCounterPrice = decision.counterPrice ?? suggestedCounter.toFixed(2);
  const finalCounterDeadlineDays =
    decision.counterDeadlineDays ??
    Math.max(
      1,
      Math.min(
        buyer.maxDeadlineDays,
        Math.ceil((sellerCounterDeadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
      ),
    );
  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn(
      { jobId: state.jobId, finalCounterPrice, finalCounterDeadlineDays },
      'LLM counter missing price/deadline, using deterministic suggestion',
    );
    bus.emitEvent({
      type: 'agent.fallback',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: args.seller,
        scope: 'counterEvaluation',
        message: 'LLM omitted the counter price or deadline; used the deterministic suggestion',
        counterPrice: finalCounterPrice,
        counterDeadlineDays: finalCounterDeadlineDays,
      },
    });
  }

  await issueCounter(state, {
    seller: args.seller,
    priceUsdc: sellerCounterPrice,
    priceWei: args.newPrice,
    deadlineUnix: sellerCounterDeadlineUnix,
    suggestedCounterPrice: finalCounterPrice,
    suggestedCounterDeadlineDays: finalCounterDeadlineDays,
  });
}

/// Classifies an agent chain failure into a structured event. INSUFFICIENT
/// balance/gas surfaces as `deal.fund.insufficient` so the buyer sees the same
/// banner + Telegram alert as the direct-deal flow; everything else falls
/// through as `agent.error` for the activity feed.
/// Maps the deterministic pattern from agents/signals.ts to a MatchProposal
/// risk flag + a one-sentence note the MatchBanner renders for the seller.
/// Returns null when the pattern is normal/safe, no warning gets attached.
function riskAnnotationFor(
  pattern: ReturnType<typeof classifyBid> | undefined,
  agreedPriceUsdc: string,
  budgetUsdc: string,
  sellerHumanReview: boolean,
): { flag: 'honey-trap' | 'lowball' | 'spammy' | 'new-buyer'; note: string } | null {
  // Seller-side human-review intent wins over pattern-based flags: the
  // seller already decided "this buyer is unproven, surface it" via the
  // tier adjustment in seller.ts:adjustBidByTier (§6 NEW-buyer rule).
  if (sellerHumanReview) {
    return {
      flag: 'new-buyer',
      note: `Buyer is new to the network. The agent already padded the price for unproven counterparty risk. Take a closer look before approving.`,
    };
  }
  if (!pattern) return null;
  const price = Number(agreedPriceUsdc);
  const budget = Number(budgetUsdc);
  if (pattern === 'honey-trap') {
    return {
      flag: 'honey-trap',
      note: `Buyer is offering ${price} USDC against a brief of ${budget} USDC, but their reputation is new or cold. Could be an urgent legitimate need, could be bait. Your call.`,
    };
  }
  if (pattern === 'lowball') {
    return {
      flag: 'lowball',
      note: `Bid is well below the brief budget and rep is unproven. Likely probe pricing. Decline unless you know the buyer.`,
    };
  }
  if (pattern === 'spammy') {
    return {
      flag: 'spammy',
      note: `Counterparty has placed unusually many actions in the last 24h. Could be a bot. Verify before accepting.`,
    };
  }
  return null;
}

function emitAgentChainError(
  state: JobState,
  seller: `0x${string}`,
  scope: string,
  err: unknown,
) {
  const info = classifyAgentError(err);
  if (info.code === 'INSUFFICIENT_AGENT_BALANCE' || info.code === 'INSUFFICIENT_AGENT_GAS') {
    bus.emitEvent({
      type: 'deal.fund.insufficient',
      jobId: state.jobId,
      actor: 'platform',
      payload: {
        buyer: state.buyer.address,
        buyerAgent: state.buyer.address,
        seller,
        code: info.code,
        scope,
      },
    });
    return;
  }
  bus.emitEvent({
    type: 'agent.error',
    jobId: state.jobId,
    actor: 'buyer',
    payload: { seller, scope, message: info.message, raw: info.raw },
  });
}

/// Re-exported from `db/matchProposals.ts`. The type lives there now so the
/// persistence layer owns the schema; buyer.ts keeps the name for back-compat
/// with everyone already importing `MatchProposal` from this module.
export type MatchProposal = DbMatchProposal;

export function getMatchProposal(jobId: string): Promise<MatchProposal | null> {
  return dbGetMatchProposal(jobId);
}

export function listMatchProposalsForUser(userAddress: string): Promise<MatchProposal[]> {
  return dbListMatchProposalsForUser(userAddress);
}

export function listAllMatchProposals(): Promise<MatchProposal[]> {
  return dbListAllMatchProposals();
}

/// The agent has reached agreement with a seller. It does NOT touch the chain
/// here. It records a match proposal and notifies both parties. The buyer
/// human approves separately, which triggers acceptBid + fundEscrow.
///
/// `pattern` is the risk classification from agents/signals.ts (or undefined
/// when the path didn't compute one, e.g. listing-driven matches). When it's
/// "risky" (honey-trap, lowball, spammy) we attach a riskFlag + riskNote so
/// the MatchBanner shows the seller a warning rather than the agent silently
/// auto-accepting. The human stays the decision-maker per the karwan-agent-
/// risk-principle memory note.
async function proposeMatch(
  state: JobState,
  seller: `0x${string}`,
  agreedPriceUsdc: string,
  pattern?: ReturnType<typeof classifyBid>,
  opts?: { allowSupersede?: boolean },
) {
  // A crossable deal is closing: drop any "no match at your budget" marker so a
  // stale out-of-reach state can't linger on the job page after a real match.
  clearOutOfReach(state.jobId);
  // Re-rank the full pool before committing. A stronger bid that landed after
  // the collection window closed (a late ELITE while the agent negotiated a
  // COLD seller) supersedes the about-to-propose seller when it's acceptable at
  // its own price. Skipped for explicit human-chosen commits (near-miss resume).
  if (opts?.allowSupersede !== false && !state.finalized) {
    const better = pickSupersedingBid(state, seller);
    if (better && better.seller.toLowerCase() !== seller.toLowerCase()) {
      logger.info(
        {
          jobId: state.jobId,
          supersededSeller: seller,
          supersededPrice: agreedPriceUsdc,
          winner: better.seller,
          winnerPrice: better.priceUsdc,
          winnerTier: better.sellerTier,
          winnerMatch: better.topicalMatch,
        },
        'late higher-ranked bid superseded the about-to-propose seller',
      );
      bus.emitEvent({
        type: 'agent.decision',
        jobId: state.jobId,
        actor: 'buyer',
        payload: {
          scope: 'late-supersede',
          seller: better.seller,
          priceUsdc: better.priceUsdc,
          tier: better.sellerTier,
          reasoning:
            'A stronger bid arrived after the auction window closed and is accepted directly instead of the seller in negotiation.',
        },
      });
      seller = better.seller;
      agreedPriceUsdc = better.priceUsdc;
      pattern = better.pattern;
    }
  }

  state.finalized = true;
  clearCounterWatchdog(state);
  try {
    const buyerWallets = await findAgentWalletByAgentAddress(state.buyer.address);
    const sellerWallets = await findAgentWalletByAgentAddress(seller);
    if (!buyerWallets || !sellerWallets) {
      logger.warn(
        { jobId: state.jobId, buyerAgent: state.buyer.address, sellerAgent: seller },
        'match not proposed: missing wallet binding',
      );
      bus.emitEvent({
        type: 'agent.error',
        jobId: state.jobId,
        actor: 'buyer',
        payload: {
          seller,
          scope: 'proposeMatch',
          message: 'could not resolve user wallets behind agent addresses',
        },
      });
      return;
    }

    // Pick up the seller-side human-review flag (set by adjustBidByTier when
    // the buyer is NEW-tier per §6). Null if there's no seller-side bid entry
    // (e.g. listing-driven path); treated as humanReview=false.
    const sellerFlags = getSellerBidFlags(state.jobId, seller);
    const risk = riskAnnotationFor(
      pattern,
      agreedPriceUsdc,
      state.context.budgetUsdc,
      sellerFlags?.humanReview === true,
    );
    // Carry the paid x402 signals (if the bid-time calls succeeded) onto
    // the proposal so the approval banner can prove them.
    const winningBid = [...state.bids.entries()].find(
      ([k]) => k.toLowerCase() === seller.toLowerCase(),
    )?.[1];
    const paidBid = winningBid?.paidSignal;
    // Compact verified-business snapshot for the match badge. Only the seller's
    // owner profile is read; the full company detail stays on the profile so
    // the deal page renders a chip, not a dossier.
    const sellerOwnerProfile = await getProfile(sellerWallets.userAddress).catch(() => null);
    const counterpartyBusiness =
      sellerOwnerProfile?.accountType === 'business'
        ? {
            accountType: 'business' as const,
            companyName: sellerOwnerProfile.smeProfile?.companyName,
            sector: sellerOwnerProfile.smeProfile?.sector,
            region: sellerOwnerProfile.smeProfile?.region,
          }
        : undefined;
    // The market read the agent researched when the auction opened (gated on
    // the buyer's agent-research activation, metered, keyword-cached). Reused
    // here for the proposal display; the heat already tuned the negotiation.
    // Backstop: research once now if the window opened before activation.
    if (!state.marketRead) await maybeResearchMarket(state);
    const marketRead = state.marketRead;
    const proposal: MatchProposal = {
      jobId: state.jobId,
      buyerUser: buyerWallets.userAddress,
      buyerAgent: buyerWallets.buyerAddress,
      sellerUser: sellerWallets.userAddress,
      sellerAgent: sellerWallets.sellerAddress,
      agreedPriceUsdc,
      deadlineUnix: state.context.deadlineUnix,
      termsHash: state.context.termsHash,
      proposedAt: Date.now(),
      ...(risk ? { riskFlag: risk.flag, riskNote: risk.note } : {}),
      ...(paidBid
        ? {
            paidSignal: {
              tier: paidBid.tier,
              score: paidBid.score,
              amountUsd: paidBid.amountUsd,
              transaction: paidBid.transaction,
              paidAt: paidBid.paidAt,
            },
          }
        : {}),
      ...(marketRead
        ? {
            marketRead: {
              keywords: marketRead.keywords,
              summary: marketRead.summary,
              demand: marketRead.demand,
              priceNote: marketRead.priceNote,
              fairPriceUsdc: marketRead.fairPriceUsdc,
              highlights: marketRead.highlights,
              sources: marketRead.sources,
              amountUsd: marketRead.paidUsd,
              txHash: marketRead.txHash,
              payer: marketRead.payer,
              researchedAt: marketRead.researchedAt,
            },
          }
        : {}),
      ...(counterpartyBusiness ? { counterpartyBusiness } : {}),
    };

    // Balance awareness at the commit point. Negotiation already roamed freely
    // up to the buyer's authorized ceiling; here the agent reads its own USDC
    // and flags whether it can fund the agreed price now, so the approval banner
    // shows any top-up upfront instead of failing at approve. Never blocks or
    // auto-declines the match. the human (who set the ceiling) tops up. Non-fatal.
    try {
      const [agentBal, feeBps] = await Promise.all([
        readUsdcBalance(buyerWallets.buyerAddress),
        getEscrowFeeBps(),
      ]);
      const priceWei = parseUnits(agreedPriceUsdc, USDC_DECIMALS);
      const { fundedAmount } = computeFunding(priceWei, feeBps);
      const fundable = agentBal >= fundedAmount;
      proposal.fundable = fundable;
      proposal.agentBalanceUsdc = formatUnits(agentBal, USDC_DECIMALS);
      proposal.fundedAmountUsdc = formatUnits(fundedAmount, USDC_DECIMALS);
      proposal.topUpNeededUsdc = formatUnits(fundable ? 0n : fundedAmount - agentBal, USDC_DECIMALS);
    } catch (err) {
      logger.warn(
        { jobId: state.jobId, err: (err as Error).message },
        'proposeMatch: fundability check failed (non-fatal)',
      );
    }

    await dbUpsertMatchProposal(proposal);

    logger.info(
      {
        jobId: state.jobId,
        buyerUser: proposal.buyerUser,
        sellerUser: proposal.sellerUser,
        agreedPriceUsdc,
      },
      'agent reached agreement, match proposed for human approval',
    );

    bus.emitEvent({
      type: 'deal.matched',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        buyer: proposal.buyerUser,
        seller: proposal.sellerUser,
        sellerAgent: proposal.sellerAgent,
        agreedPriceUsdc,
        deadlineUnix: proposal.deadlineUnix,
        fundable: proposal.fundable,
        topUpNeededUsdc: proposal.topUpNeededUsdc,
        fundedAmountUsdc: proposal.fundedAmountUsdc,
      },
    });
  } catch (err) {
    logger.error(
      { jobId: state.jobId, err: (err as Error).message },
      'proposeMatch failed',
    );
    bus.emitEvent({
      type: 'agent.error',
      jobId: state.jobId,
      actor: 'buyer',
      payload: { seller, scope: 'proposeMatch', message: (err as Error).message },
    });
  }
}

/// Trigger the on-chain acceptBid + fundEscrow that proposeMatch deferred.
/// Called from the approve-match endpoint when the human accepts the proposal.
export async function approveAgentMatch(
  jobId: string,
): Promise<{ ok: true; txHash: string } | { ok: false; code: string; message: string }> {
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return { ok: false, code: 'NO_PROPOSAL', message: 'no match proposal for this job' };
  if (proposal.approvedAt) {
    return { ok: false, code: 'ALREADY_APPROVED', message: 'match already approved' };
  }
  if (proposal.declinedAt) {
    return { ok: false, code: 'DECLINED', message: 'match was declined' };
  }
  const state = jobs.get(jobId as `0x${string}`);
  if (!state) return { ok: false, code: 'NO_JOB_STATE', message: 'job state not in memory' };

  const seller = proposal.sellerAgent as `0x${string}`;
  let acceptResult;
  try {
    acceptResult = await executeContractCall(
      {
        walletId: state.buyer.walletId,
        contractAddress: jobBoard.address,
        abiFunctionSignature: 'acceptBid(bytes32,address)',
        abiParameters: [state.jobId, seller],
      },
      `acceptBid(${state.jobId})`,
    );
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'acceptBid (post-approval) failed');
    emitAgentChainError(state, seller, 'acceptBid', err);
    const info = classifyAgentError(err);
    return { ok: false, code: info.code, message: info.message };
  }
  logger.info({ jobId, seller, ...acceptResult }, 'bid accepted on chain (human-approved)');
  bus.emitEvent({
    type: 'bid.accepted',
    jobId,
    actor: 'buyer',
    payload: { seller, agreedPriceUsdc: proposal.agreedPriceUsdc, txHash: acceptResult.txHash },
  });

  const priceWei = parseUnits(proposal.agreedPriceUsdc, USDC_DECIMALS);
  const fundRes = await fundEscrow(state, seller, priceWei);
  if (!fundRes.ok) {
    // Funding did not confirm on chain. Do NOT persist the deal or mark the
    // proposal approved, otherwise we'd create an "accepted" deal sitting on an
    // empty escrow (the recurring "escrow got 0" bug). Surface a clear error so
    // the buyer tops up the agent and re-approves.
    logger.error({ jobId, reason: fundRes.reason }, 'approveAgentMatch: escrow funding not confirmed');
    return {
      ok: false,
      code: fundRes.reason ?? 'FUND_FAILED',
      message:
        'Escrow funding did not confirm. The buyer agent is likely short on USDC for the negotiated amount plus the platform fee. Top up the buyer agent and approve again.',
    };
  }

  // Persist a deal row so the post-funding flow (seller marks delivered, buyer
  // releases, dispute, auto-release) reuses the direct-deal mechanics.
  await persistApprovedMatch(proposal, state, acceptResult.txHash);

  proposal.approvedAt = Date.now();
  await dbUpsertMatchProposal(proposal);

  bus.emitEvent({
    type: 'deal.match.approved',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: proposal.buyerUser,
      seller: proposal.sellerUser,
      agreedPriceUsdc: proposal.agreedPriceUsdc,
      txHash: acceptResult.txHash,
    },
  });
  return { ok: true, txHash: acceptResult.txHash };
}

/// Resume a near-miss the asked party approved. The agreed price is anchored at
/// the OTHER party's boundary, so that party is already within their own
/// authorization and a single "proceed" closes the deal. We place a standing bid
/// at the agreed price, propose the match, and fund it through the exact path a
/// seller-approved match takes (acceptBid + fundEscrow). No second human gate,
/// because the asked party just consented and the counterparty is in range.
export async function proceedAgentNearMiss(
  jobId: string,
  sellerAgentAddress: string,
  proceedPriceUsdc: string,
): Promise<{ ok: true; txHash: string } | { ok: false; code: string; message: string }> {
  const state = jobs.get(jobId as `0x${string}`);
  if (!state) {
    return {
      ok: false,
      code: 'NO_JOB_STATE',
      message: 'This negotiation is no longer active. Repost the request to try again.',
    };
  }
  if (state.escrowFunded) {
    return { ok: false, code: 'ALREADY_FUNDED', message: 'This deal has already funded.' };
  }
  const existing = await dbGetMatchProposal(jobId);
  if (existing?.approvedAt) {
    return { ok: false, code: 'ALREADY_APPROVED', message: 'This job already matched.' };
  }

  const seller = await resolveSellerProfile(sellerAgentAddress);
  if (!seller) {
    return { ok: false, code: 'NO_SELLER', message: 'Could not resolve the seller agent.' };
  }

  // Lock the job to this resume before the bid lands. handleBidSubmitted bails on
  // a finalized job, so this stops the normal bid-collection path from racing the
  // match we are about to propose. clearCounterWatchdog stops any pending stall
  // timer from cascading us elsewhere mid-resume.
  state.finalized = true;
  clearCounterWatchdog(state);

  // Place a standing bid at the agreed price from the seller wallet so the buyer
  // has something to accept on chain. A bid left from an earlier round is fine to
  // reuse (already-bid is not an error here).
  const bidRes = await submitListingBid(state.context, seller, {
    askingPriceUsdc: Number(proceedPriceUsdc),
    floorUsdc: Number(proceedPriceUsdc),
    description: '',
  });
  if (!bidRes.ok && bidRes.reason !== 'already-bid') {
    return { ok: false, code: 'BID_FAILED', message: bidRes.reason };
  }

  // Human explicitly chose to proceed with this near-miss seller; never let a
  // late bid supersede that decision.
  await proposeMatch(state, sellerAgentAddress as `0x${string}`, proceedPriceUsdc, undefined, {
    allowSupersede: false,
  });
  return approveAgentMatch(jobId);
}

/// Seller raises the agreed price at the approval gate. The agent settled within
/// the buyer's authorized range, but the seller wants more, so instead of just
/// accept/decline they name a higher number. This does no on-chain work: it
/// flips the approval gate to the BUYER, who then approves (funds at the raised
/// price through proceedAgentNearMiss, the same path a near-miss proceed takes)
/// or declines. raiseOverCap is informational so the buyer knows when the raise
/// sits above the tolerance they set; their explicit approval is the consent.
export async function raiseMatchOffer(
  jobId: string,
  raisedPriceUsdc: string,
): Promise<{ ok: true; raiseOverCap: boolean } | { ok: false; code: string; message: string }> {
  const proposal = await dbGetMatchProposal(jobId);
  if (!proposal) return { ok: false, code: 'NO_PROPOSAL', message: 'no match proposal for this job' };
  if (proposal.approvedAt) return { ok: false, code: 'ALREADY_APPROVED', message: 'match already approved' };
  if (proposal.declinedAt) return { ok: false, code: 'DECLINED', message: 'match was declined' };
  if (proposal.awaitingParty === 'buyer') {
    return { ok: false, code: 'RAISE_PENDING', message: 'a raised price is already awaiting the buyer' };
  }
  const current = Number(proposal.raisedPriceUsdc ?? proposal.agreedPriceUsdc);
  const raised = Number(raisedPriceUsdc);
  if (!Number.isFinite(raised) || raised <= current) {
    return {
      ok: false,
      code: 'NOT_HIGHER',
      message: 'the raised price must be higher than the price the agent agreed',
    };
  }
  // Cap is informational. Compute it when the live job context is still in
  // memory; if the backend restarted and lost it, default to not-over-cap.
  let raiseOverCap = false;
  const state = jobs.get(jobId as `0x${string}`);
  if (state) {
    const cap = computeBuyerEffectiveCap(state.context, state.buyer);
    raiseOverCap = raised > cap;
  }
  proposal.originalPriceUsdc = proposal.originalPriceUsdc ?? proposal.agreedPriceUsdc;
  proposal.raisedPriceUsdc = raisedPriceUsdc;
  proposal.raisedAt = Date.now();
  proposal.raiseOverCap = raiseOverCap;
  proposal.awaitingParty = 'buyer';
  await dbUpsertMatchProposal(proposal);
  bus.emitEvent({
    type: 'deal.match.raised',
    jobId,
    actor: 'seller',
    payload: {
      buyer: proposal.buyerUser,
      seller: proposal.sellerUser,
      originalPriceUsdc: proposal.originalPriceUsdc,
      raisedPriceUsdc,
      overCap: raiseOverCap,
    },
  });
  logger.info(
    { jobId, raisedPriceUsdc, raiseOverCap },
    'seller raised the match price, approval gate flipped to the buyer',
  );
  return { ok: true, raiseOverCap };
}

async function persistApprovedMatch(
  proposal: MatchProposal,
  state: JobState,
  fundTxHash: string,
) {
  try {
    if (await getDeal(proposal.jobId)) return;
    const buyerWallets = await findAgentWalletByAgentAddress(proposal.buyerAgent);
    const sellerWallets = await findAgentWalletByAgentAddress(proposal.sellerAgent);
    if (!buyerWallets || !sellerWallets) return;
    // Mirror the split the escrow was actually funded with (a stated per-brief
    // split overrides the profile default), so the persisted deal's milestones
    // match the on-chain escrow. The full N-part array is persisted; firstReleasePct
    // tracks milestonePcts[0] for back-compat readers.
    const milestonePcts = effectiveMilestonePcts(state);
    const firstReleasePct = milestonePcts[0];
    if (firstReleasePct == null) return;

    const now = Date.now();
    // Re-anchor the delivery deadline to ACCEPTANCE time, not brief-posting
    // time. The auction may have taken hours or days; without this the seller
    // wins the bid but inherits a clock that's been ticking since the brief
    // went live. Use the same "window from brief.createdAt" derivation as
    // the direct-deal re-anchors so behaviour stays consistent across flows.
    const brief = getBrief(proposal.jobId);
    let dealDeadlineUnix = proposal.deadlineUnix;
    if (brief) {
      const briefCreatedSeconds = Math.floor(brief.createdAt / 1000);
      const negotiatedWindowSeconds = proposal.deadlineUnix - briefCreatedSeconds;
      if (negotiatedWindowSeconds > 0) {
        dealDeadlineUnix = Math.floor(now / 1000) + negotiatedWindowSeconds;
      }
    }
    await createDeal({
      jobId: proposal.jobId,
      buyer: buyerWallets.userAddress,
      seller: sellerWallets.userAddress,
      buyerAgentWalletId: buyerWallets.buyerWalletId,
      buyerAgentAddress: buyerWallets.buyerAddress,
      sellerAgentWalletId: sellerWallets.sellerWalletId,
      sellerAgentAddress: sellerWallets.sellerAddress,
      dealAmountUsdc: proposal.agreedPriceUsdc,
      firstReleasePct,
      milestonePcts,
      deadlineUnix: dealDeadlineUnix,
      // The human request text, NOT the on-chain termsHash. `terms` is what the
      // deal page renders as "the agreement" AND what the security agent reads as
      // the requirement to check the delivery against. Persisting the hash here
      // made the security agent report "the buyer requested a hexadecimal string"
      // and showed a hash as the agreement. Fall back to the hash only if the
      // brief is somehow gone.
      terms: brief?.briefText?.trim() || proposal.termsHash,
      acceptedAt: now,
      fundTxHash,
      origin: 'agent',
      ...(proposal.marketRead ? { marketRead: proposal.marketRead } : {}),
    });
    logger.info(
      { jobId: proposal.jobId, buyer: proposal.buyerUser, seller: proposal.sellerUser },
      'approved match persisted as deal row',
    );

    // Feed the matched price into the category price history, so future deals in
    // the same skill bucket negotiate against a real, current median. Best-effort.
    recordDealPrice({
      jobId: proposal.jobId,
      keywords: brief?.keywords ?? proposal.marketRead?.keywords ?? [],
      priceUsdc: Number(proposal.agreedPriceUsdc),
      ts: now,
    });

    // Security match gate: a deterministic screen over the match, consuming the
    // paid evidence both agents already gathered + free risk signals. It runs
    // AFTER escrow funded (money is safe) and only surfaces risk — 'flag' shows a
    // banner, 'hold' marks the deal for review. Never blocks or confiscates; the
    // human already approved and remains the judge. Best-effort, flag-gated.
    if (config.SECURITY_MATCH_GATE_ENABLED) {
      try {
        const verdict = await evaluateMatch(proposal);
        if (verdict.decision !== 'pass') {
          await patchDeal(proposal.jobId, {
            matchRisk: {
              decision: verdict.decision,
              flags: verdict.flags,
              reason: verdict.reason,
              reasons: verdict.reasons,
              paidConsulted: verdict.paidConsulted,
              evaluatedAt: verdict.evaluatedAt,
            },
          });
        }
        bus.emitEvent({
          type: 'security.match.evaluated',
          jobId: proposal.jobId,
          actor: 'platform',
          payload: {
            decision: verdict.decision,
            flags: verdict.flags,
            reason: verdict.reason,
            paidConsulted: verdict.paidConsulted,
          },
        });
      } catch (err) {
        logger.warn(
          { jobId: proposal.jobId, err: (err as Error).message },
          'match gate evaluation failed (non-fatal, deal proceeds)',
        );
      }
    }

    // Settle the research cost on the MATCHED pair only. The SecurityAgent
    // fronted the call at post for the whole auction; here we draw it down from
    // the two accounts that actually transacted, out of their 1.5 USDC research
    // credit. The buyer also bears the internal counterparty pull it ran.
    // Best-effort and a no-op for an account with no credit.
    const externalUsd = proposal.marketRead?.amountUsd ?? 0;
    const internalPullUsd = proposal.paidSignal?.amountUsd ?? 0;
    await Promise.allSettled([
      chargeResearch(buyerWallets.userAddress, externalUsd + internalPullUsd),
      chargeResearch(sellerWallets.userAddress, externalUsd),
    ]);
  } catch (err) {
    logger.warn(
      { jobId: proposal.jobId, err: (err as Error).message },
      'persist approved match failed; direct-deal flow may be unavailable',
    );
  }
}

/// Decline the proposal. The job returns to its bidding state with the
/// previously matched seller skipped (caller intent is "not this seller"). For
/// v1 we just mark it declined; re-running the auction is a follow-up.
export async function declineAgentMatch(
  jobId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return { ok: false, code: 'NO_PROPOSAL', message: 'no match proposal for this job' };
  if (proposal.approvedAt) return { ok: false, code: 'ALREADY_APPROVED', message: 'match already approved' };
  if (proposal.declinedAt) return { ok: false, code: 'ALREADY_DECLINED', message: 'match already declined' };

  proposal.declinedAt = Date.now();
  await dbUpsertMatchProposal(proposal);
  bus.emitEvent({
    type: 'deal.match.declined',
    jobId,
    actor: 'buyer',
    payload: { buyer: proposal.buyerUser, seller: proposal.sellerUser, reason },
  });
  return { ok: true };
}

/// Default reservationBps on agent-flow trusted-match deals. The buyer brief
/// doesn't carry a stake-pct slider today; trustedMatch is a single bool. Map
/// it to 50% (the form default) on chain. Casual briefs pass 0.
const AGENT_FLOW_TRUSTED_BPS = 5000;

/// The milestone split to fund this deal with. A buyer who stated a split in
/// the request ("I pay 40%, 30%, then 30%") overrides their profile default, as
/// long as it's a valid N-part split: 2 to 5 integer parts, each 1-99, summing
/// to 100. The on-chain escrow funds and releases any such split. Anything else
/// (absent or malformed) falls back to the profile default.
function effectiveMilestonePcts(state: JobState): number[] {
  const stated = state.context.milestonePcts;
  if (
    Array.isArray(stated) &&
    stated.length >= 2 &&
    stated.length <= 5 &&
    stated.every((n) => Number.isInteger(n) && n >= 1 && n <= 99) &&
    stated.reduce((sum, n) => sum + n, 0) === 100
  ) {
    return stated;
  }
  return state.buyer.milestonePcts;
}

async function fundEscrow(
  state: JobState,
  seller: `0x${string}`,
  priceWei: bigint,
): Promise<{ ok: boolean; reason?: string }> {
  if (state.escrowFunded) return { ok: true };
  const buyer = state.buyer;
  const milestonePcts = effectiveMilestonePcts(state);

  // The escrow pulls dealAmount + the buyer's half of the platform fee, so the
  // approval must cover the full funded amount, not just the deal price.
  const feeBps = await getEscrowFeeBps();
  const { fundedAmount } = computeFunding(priceWei, feeBps);

  let approveResult;
  try {
    approveResult = await executeContractCall(
      {
        walletId: buyer.walletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [escrow.address, fundedAmount.toString()],
      },
      `usdc.approve(escrow, ${state.jobId})`,
    );
  } catch (err) {
    logger.error({ jobId: state.jobId, err: (err as Error).message }, 'usdc approve failed');
    emitAgentChainError(state, seller, 'usdc.approve', err);
    return { ok: false, reason: 'APPROVE_FAILED' };
  }
  logger.info({ jobId: state.jobId, ...approveResult }, 'usdc approved for escrow');
  bus.emitEvent({
    type: 'escrow.approved',
    jobId: state.jobId,
    actor: 'buyer',
    payload: { amountWei: fundedAmount.toString(), txHash: approveResult.txHash },
  });

  // Trusted-match briefs gate the seller on stake; casual briefs don't.
  // Pull the flag off the JobState (carried over from the BuyerJob brief).
  const reservationBps = state.context.trustedMatch === true ? AGENT_FLOW_TRUSTED_BPS : 0;

  let fundResult;
  try {
    fundResult = await executeContractCall(
      buildFundEscrowCall(
        buyer.walletId,
        escrow.address,
        state.jobId,
        seller,
        priceWei,
        milestonePcts,
        reservationBps,
        state.context.deadlineUnix,
      ),
      `fundEscrow(${state.jobId})`,
    );
  } catch (err) {
    logger.error({ jobId: state.jobId, err: (err as Error).message }, 'fundEscrow failed');
    emitAgentChainError(state, seller, 'fundEscrow', err);
    return { ok: false, reason: 'FUND_FAILED' };
  }

  // ERC-4337: the handleOps tx can report success even when the inner fundEscrow
  // userOp reverts (e.g. the buyer agent is short on USDC for amount + fee), so
  // the txHash is not proof of funding. Read the escrow and require Funded
  // before we treat the deal as accepted. This is what stops an "accepted" deal
  // from being persisted on an empty escrow.
  invalidateEscrowCache(state.jobId);
  const fundedAccount = await readEscrow(state.jobId);
  if (fundedAccount.state !== ESCROW_FUNDED) {
    logger.error(
      { jobId: state.jobId, escrowState: fundedAccount.state, fundTxHash: fundResult.txHash },
      'fundEscrow tx landed but escrow not Funded; buyer agent likely short on USDC',
    );
    emitAgentChainError(
      state,
      seller,
      'fundEscrow',
      new Error(
        'escrow not Funded after fundEscrow; buyer agent likely short on USDC for the negotiated amount plus fee',
      ),
    );
    return { ok: false, reason: 'FUND_NOT_CONFIRMED' };
  }

  state.escrowFunded = true;
  logger.info(
    {
      jobId: state.jobId,
      seller,
      dealAmountWei: priceWei.toString(),
      fundedAmountWei: fundedAmount.toString(),
      milestonePcts,
      ...fundResult,
    },
    'escrow funded',
  );
  bus.emitEvent({
    type: 'escrow.funded',
    jobId: state.jobId,
    actor: 'buyer',
    payload: {
      seller,
      amountWei: priceWei.toString(),
      milestonePcts,
      txHash: fundResult.txHash,
    },
  });
  return { ok: true };
}

export interface BuyerJobSnapshot {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  finalized: boolean;
  escrowFunded: boolean;
  cancelledAt?: number;
  expiredAt?: number;
  bids: Array<{
    seller: string;
    priceUsdc: string;
    deadlineUnix: number;
    score: number | null;
    suggestedCounterPrice: string | null;
    suggestedCounterDeadlineDays: number | null;
    /// Composite-engine tier of the seller at bid time. Lets the UI show a
    /// tier dot on each bid card so the user can read the reputation context
    /// of every offer at a glance.
    sellerTier: RepTier | null;
    /// Owner address behind the seller agent. The bid card peek opens a
    /// profile by user address (profiles are keyed by user, not agent).
    sellerUserAddress: string | null;
    /// Profile display name for the seller, if set. Bid card shows this
    /// inline; falls back to the masked address when null.
    sellerDisplayName: string | null;
    /// Topical-match percentage (0-100), how well the seller's profile
    /// keywords cover the brief's. This is the FIRST sort key in
    /// finalizeBidCollection (match band → deterministic score →
    /// reputation), so a higher topicalMatch beats a higher LLM score
    /// every time. Surfaced to the UI so the bid card can show why one
    /// seller leads over another without lying with a score-only sort.
    topicalMatch: number | null;
  }>;
  lastCounterPriceBySeller: Record<string, string>;
  counterRoundsBySeller: Record<string, number>;
}

/// Snapshot of tracked managed jobs. Pass a buyer agent address to scope it to
/// the jobs that agent posted. Cancelled jobs older than the grace window are
/// dropped so the Managed Deals table doesn't keep showing terminal rows.
export interface MarketplaceBrief {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  briefText: string;
  bidsCount: number;
  postedAt: number;
  /// Match lane + poster account type, so a business-account market view can
  /// filter to business-linked cards without a second lookup. Absent reads as
  /// service / person to keep legacy briefs in the open P2P pool.
  tradeLane?: 'service' | 'finance';
  partyKind?: 'person' | 'business';
}

/// Open buyer briefs, packaged for the public marketplace surface. Strips
/// internal state, agent-private fields, and anything past its terminal
/// stage (escrow-funded, finalized via accept, cancelled, expired). Buyer
/// address is returned full; consumer masks for display.
export function getMarketplaceBriefs(): MarketplaceBrief[] {
  return [...jobs.values()]
    .filter((s) => !s.finalized && !s.escrowFunded && !s.cancelledAt && !s.expired)
    .map((s) => {
      const brief = getBrief(s.jobId);
      return {
        jobId: s.jobId,
        buyer: s.context.buyer,
        budgetUsdc: s.context.budgetUsdc,
        deadlineUnix: s.context.deadlineUnix,
        briefText: brief?.briefText ?? '',
        bidsCount: s.bids.size,
        postedAt: brief?.createdAt ?? Date.now(),
        tradeLane: brief?.tradeLane ?? 'service',
        partyKind: brief?.partyKind ?? 'person',
      };
    })
    .sort((a, b) => b.postedAt - a.postedAt);
}

export function getBuyerSnapshot(filterBuyerAddress?: string): { jobs: BuyerJobSnapshot[] } {
  const f = filterBuyerAddress?.toLowerCase();
  const now = Date.now();
  return {
    jobs: [...jobs.values()]
      .filter((s) => !f || s.context.buyer.toLowerCase() === f)
      .filter((s) => !s.cancelledAt || now - s.cancelledAt < MANAGED_CANCELLED_GRACE_MS)
      .map((s) => ({
      jobId: s.jobId,
      buyer: s.context.buyer,
      budgetUsdc: s.context.budgetUsdc,
      deadlineUnix: s.context.deadlineUnix,
      termsHash: s.context.termsHash,
      finalized: s.finalized,
      escrowFunded: s.escrowFunded,
      cancelledAt: s.cancelledAt,
      expiredAt: s.expiredAt,
      bids: [...s.bids.values()].map((b) => ({
        seller: b.seller,
        priceUsdc: b.priceUsdc,
        deadlineUnix: b.deadlineUnix,
        score: b.score ?? null,
        suggestedCounterPrice: b.suggestedCounterPrice ?? null,
        suggestedCounterDeadlineDays: b.suggestedCounterDeadlineDays ?? null,
        sellerTier: b.sellerTier ?? null,
        sellerUserAddress: b.sellerUserAddress ?? null,
        sellerDisplayName: b.sellerDisplayName ?? null,
        topicalMatch: b.topicalMatch ?? null,
      })),
      lastCounterPriceBySeller: Object.fromEntries(s.lastCounterPriceBySeller),
      counterRoundsBySeller: Object.fromEntries(s.counterRoundsBySeller),
    })),
  };
}

/// Drops every in-memory job state where `buyerAddressLower` owns the brief.
/// Used by the admin reset-history endpoint to clear test pollution from the
/// agent loop's working set without rebooting the backend. Returns the
/// number of states removed.
export function deleteBuyerJobsForBuyer(buyerAddressLower: string): number {
  const target = buyerAddressLower.toLowerCase();
  let removed = 0;
  for (const [k, v] of jobs.entries()) {
    if (v.context.buyer.toLowerCase() === target) {
      jobs.delete(k);
      removed += 1;
    }
  }
  return removed;
}

export function getBuyerJob(jobId: string): BuyerJobSnapshot | null {
  const s = jobs.get(jobId as `0x${string}`);
  if (!s) return null;
  return getBuyerSnapshot().jobs.find((j) => j.jobId === jobId) ?? null;
}

/// Re-open a finalized auction so it keeps collecting NEW bids until the
/// deadline instead of dead-ending. Used when a near-miss is passed: the request
/// stays live, and the next fresh seller's bid re-arms the collection window and
/// negotiation. Already-tried sellers stay in triedSellers, and
/// finalizeBidCollection now ranks only untried bids, so the same exhausted pool
/// can't loop. Returns false when there's no live state to re-open.
export function reopenForNewBids(jobId: string): boolean {
  const state = jobs.get(jobId as `0x${string}`);
  if (!state) return false;
  clearCounterWatchdog(state);
  if (state.collectionTimer) {
    clearTimeout(state.collectionTimer);
    state.collectionTimer = null;
  }
  // Remember who was exhausted at the pass so the next near-miss only fires for
  // genuinely new bidders, and clear the resolved near-miss so a fresh one is
  // not blocked as "already-resolved".
  state.sellersAtLastPass = new Set(state.triedSellers);
  clearNearMiss(state.jobId);
  state.finalized = false;
  state.collectionFired = false;
  state.collectionStartedAt = undefined;
  bus.emitEvent({
    type: 'negotiation.reopened',
    jobId: state.jobId,
    actor: 'buyer',
    payload: { reason: 'near-miss-passed' },
  });
  logger.info({ jobId: state.jobId }, 'auction re-opened for new bids after near-miss pass');
  return true;
}

/// Patches the cached negotiation context for a tracked job. Used by the brief
/// edit route so the next bid evaluation picks up the new tolerance and
/// trustedMatch flag without the buyer having to repost. No-op when the job
/// isn't currently tracked (a brief can outlive its in-memory state across a
/// backend restart; the next reseed reads the fresh brief anyway).
export function patchTrackedJobContext(
  jobId: string,
  patch: { negotiationMaxIncreasePct?: number; trustedMatch?: boolean },
): void {
  const s = jobs.get(jobId as `0x${string}`);
  if (!s) return;
  if (patch.negotiationMaxIncreasePct !== undefined) {
    s.context.negotiationMaxIncreasePct = patch.negotiationMaxIncreasePct;
  }
  if (patch.trustedMatch !== undefined) {
    s.context.trustedMatch = patch.trustedMatch;
  }
}

/// Returns the JobContext of every open (not finalized, not escrow-funded,
/// not expired) job. Used by listings cross-matching to scan briefs that a
/// new listing could fill.
export function listOpenJobContexts(): JobContext[] {
  return [...jobs.values()]
    .filter((s) => !s.finalized && !s.escrowFunded && !s.expired)
    .map((s) => ({ ...s.context }));
}

export interface ExpirableJob {
  jobId: `0x${string}`;
  buyer: `0x${string}`;
  deadlineUnix: number;
  bidsCount: number;
  hasMatchProposal: boolean;
}

/// Snapshot of jobs that could be expired by the watcher. Excludes anything
/// already finalized, escrow-funded, or expired. Carries the deadline and a
/// flag for whether a MatchProposal is awaiting human approval. The watcher
/// uses that to leave human-gated proposals alone (the human is the decision,
/// not the deadline).
export async function listExpirableJobs(): Promise<ExpirableJob[]> {
  const candidates = [...jobs.values()].filter(
    (s) => !s.finalized && !s.escrowFunded && !s.expired,
  );
  // Resolve the proposal-presence flag per candidate via the persisted
  // proposal store. We parallelise the lookups; the candidate set is small
  // (open managed jobs, typically <100) so the fan-out is cheap.
  const flags = await Promise.all(
    candidates.map((s) => dbHasPendingProposal(s.jobId)),
  );
  return candidates.map((s, i) => ({
    jobId: s.jobId,
    buyer: s.context.buyer as `0x${string}`,
    deadlineUnix: s.context.deadlineUnix,
    bidsCount: s.bids.size,
    hasMatchProposal: flags[i] ?? false,
  }));
}

/// Marks a job expired. Clears its bid-collection timer, flags the JobState,
/// patches the brief on disk, and emits `job.expired`. Idempotent, so a second
/// call on an already-expired job is a no-op.
export function expireJob(jobId: `0x${string}`): boolean {
  const state = jobs.get(jobId);
  if (!state) return false;
  if (state.expired || state.finalized || state.escrowFunded) return false;
  if (state.collectionTimer) {
    clearTimeout(state.collectionTimer);
    state.collectionTimer = null;
  }
  clearCounterWatchdog(state);
  state.expired = true;
  state.expiredAt = Date.now();
  patchBrief(jobId, { expiredAt: state.expiredAt });
  bus.emitEvent({
    type: 'job.expired',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: state.context.buyer,
      deadlineUnix: state.context.deadlineUnix,
      bidsCount: state.bids.size,
    },
  });
  logger.info(
    { jobId, deadlineUnix: state.context.deadlineUnix, bidsCount: state.bids.size },
    'job expired',
  );
  return true;
}

/// Buyer-initiated cancel of a managed brief BEFORE a match. The on-chain
/// JobBoard contract doesn't carry a cancel function, so we mark the brief
/// expired off-chain (same terminal state as the deadline watcher uses) and
/// stop the agent from accepting any further bid or proposing a match. After
/// a match is approved + escrow funded the cancel path lives on /deals/[id]
/// (mutual cancel + refund); this only covers the pre-match window.
///
/// Returns ok=true on success; ok=false with a code when the brief is in a
/// state where cancellation is no longer the user's gate (already finalized,
/// escrow funded, or expired).
export function cancelBriefByBuyer(
  jobId: `0x${string}`,
  caller: string,
): { ok: true } | { ok: false; code: string; message: string } {
  const state = jobs.get(jobId);
  if (!state) return { ok: false, code: 'NO_JOB', message: 'no tracked brief for this job id' };
  if (state.context.buyer.toLowerCase() !== caller.toLowerCase()) {
    return { ok: false, code: 'NOT_BUYER', message: 'only the buyer can cancel this brief' };
  }
  if (state.escrowFunded) {
    return {
      ok: false,
      code: 'ESCROW_FUNDED',
      message: 'this brief already matched and escrow is funded; cancel on the deal page',
    };
  }
  if (state.finalized) {
    return {
      ok: false,
      code: 'ALREADY_MATCHED',
      message: 'this brief has a pending match; decline it on the deal page instead',
    };
  }
  if (state.expired) {
    return { ok: false, code: 'ALREADY_TERMINAL', message: 'this brief is already terminal' };
  }
  // Re-use the expired terminal state so every scanner that already filters
  // on `expired` honours this without a new field. The brief metadata gets
  // the same marker so a restart treats it consistently.
  if (state.collectionTimer) {
    clearTimeout(state.collectionTimer);
    state.collectionTimer = null;
  }
  state.expired = true;
  state.expiredAt = Date.now();
  patchBrief(jobId, { expiredAt: state.expiredAt });
  bus.emitEvent({
    type: 'brief.cancelled',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: state.context.buyer,
      budgetUsdc: state.context.budgetUsdc,
      bidsCount: state.bids.size,
    },
  });
  logger.info({ jobId, buyer: state.context.buyer }, 'brief cancelled by buyer');
  return { ok: true };
}

/// Replays recent JobPosted logs through the live handler, so a freshly started
/// agent picks up jobs posted while it was down.
export async function backfillRecentJobs(fromBlock?: bigint) {
  const latest = await publicClient.getBlockNumber();
  const from = fromBlock ?? (latest > 10_000n ? latest - 10_000n : 0n);
  const logs = await publicClient.getLogs({
    address: jobBoard.address,
    event: jobBoardAbi.find((x) => x.type === 'event' && x.name === 'JobPosted')! as never,
    fromBlock: from,
    toBlock: latest,
  });
  logger.info({ count: logs.length }, 'buyer backfilling jobs');
  for (const log of logs) await handleJobPosted(log as unknown as Log, { silent: true });
}

/// Restores a single job's in-memory state by reading it directly from the
/// JobBoard contract. Cheap O(1) call, no log scanning. Used by the API
/// route to recover from a backend restart that wiped the in-memory `jobs`
/// map. Returns true when the state was successfully restored.
export async function reseedJobFromChain(jobId: string): Promise<boolean> {
  if (jobs.has(jobId as `0x${string}`)) return true;
  try {
    const result = (await publicClient.readContract({
      address: jobBoard.address,
      abi: jobBoardAbi,
      functionName: 'jobs',
      args: [jobId as `0x${string}`],
    })) as readonly [
      `0x${string}`, // buyer
      bigint, // budget
      bigint, // deadline (uint64)
      string, // termsHash
      number, // state (uint8 enum)
      `0x${string}`, // acceptedSeller
      bigint, // acceptedPrice
      bigint, // acceptedDeadline (uint64)
    ];
    const buyerAddr = result[0];
    if (buyerAddr === '0x0000000000000000000000000000000000000000') return false;
    const syntheticLog = {
      transactionHash: `0x${jobId.slice(2)}` as `0x${string}`,
      logIndex: 0,
      args: {
        jobId: jobId as `0x${string}`,
        buyer: buyerAddr,
        budget: result[1],
        deadline: result[2],
        termsHash: result[3],
      },
    } as unknown as Log;
    await handleJobPosted(syntheticLog, { silent: true });
    return jobs.has(jobId as `0x${string}`);
  } catch (err) {
    logger.warn({ err: (err as Error).message, jobId }, 'reseedJobFromChain failed');
    return false;
  }
}

interface JobPostedArgs {
  jobId: `0x${string}`;
  buyer: `0x${string}`;
  budget: bigint;
  deadline: bigint;
  termsHash: string;
}

interface BidSubmittedArgs {
  jobId: `0x${string}`;
  seller: `0x${string}`;
  price: bigint;
  deadline: bigint;
}

interface CounterResponseArgs {
  jobId: `0x${string}`;
  seller: `0x${string}`;
  accepted: boolean;
  newPrice: bigint;
  newDeadline: bigint;
}
