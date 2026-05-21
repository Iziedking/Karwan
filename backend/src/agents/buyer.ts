import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import {
  jobBoard,
  escrow,
  usdc as usdcAddress,
  getEscrowFeeBps,
  computeFunding,
  readEscrow,
  invalidateEscrowCache,
  readUsdcBalance,
} from '../chain/contracts.js';
import { ESCROW_FUNDED } from '../chain/settlement.js';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { executeContractCall } from '../chain/txs.js';
import { llmModel } from '../llm/client.js';
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
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';
import { bus } from '../events.js';
import type { BuyerProfile } from './buyer-profile.js';
import { resolveBuyerProfile } from './agent-registry.js';
import {
  heuristicCounterDecision,
  nextCounterPrice,
  scoreBidDeterministic,
  shouldAcceptOnFinalRound,
  type Tier,
} from './strategy.js';

/// Hard cap on how many seller candidates the buyer agent will attempt
/// sequentially on a single brief. Without this, a 10-bid auction could
/// spawn 10 sequential negotiations. Three is the sweet spot for
/// community testing: enough to recover from a stubborn top seller,
/// few enough to keep total negotiation time bounded.
const MAX_CANDIDATES = 3;
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { createDeal, getDeal } from '../db/deals.js';
import { getBrief, patchBrief } from '../db/briefs.js';
import {
  getMatchProposal as dbGetMatchProposal,
  upsertMatchProposal as dbUpsertMatchProposal,
  listMatchProposalsForUser as dbListMatchProposalsForUser,
  listAllMatchProposals as dbListAllMatchProposals,
  hasPendingProposal as dbHasPendingProposal,
  type MatchProposal as DbMatchProposal,
} from '../db/matchProposals.js';
import { getSellerBidFlags } from './seller.js';
import { withLlmTimeout } from './llm-utils.js';
import {
  actorSignalsFor,
  priceAnomalyScore,
  priceHistorySnapshot,
  classifyBid,
  type BidSignals,
  type RepTier,
} from './signals.js';
import { classifyAgentError } from '../chain/errors.js';

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
}

/// Score difference under which two bids are "tied" for the purposes of the
/// reputation tiebreaker. LLM scoring is noisy at the unit level, so 3 points
/// on a 0-100 scale is well inside the noise floor.
const REPUTATION_TIEBREAK_EPSILON = 3;

interface JobState {
  jobId: `0x${string}`;
  // The buyer profile of the user whose buyer agent posted this job. Carried on
  // the state so bid/counter handlers do not have to re-resolve it per event.
  buyer: BuyerProfile;
  context: JobContext;
  bids: Map<`0x${string}`, Bid>;
  collectionTimer: NodeJS.Timeout | null;
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

/// The cap the buyer agent will accept counters up to. Per-brief tolerance
/// raises the cap above the budget; the user's profile maxBudgetUsdc remains
/// an absolute ceiling regardless of brief tolerance.
function computeBuyerEffectiveCap(
  context: { budgetUsdc: string; negotiationMaxIncreasePct?: number },
  buyer: BuyerProfile,
): number {
  const base = Number(context.budgetUsdc);
  const tolerance = context.negotiationMaxIncreasePct ?? 0;
  const fromTolerance = base * (1 + tolerance / 100);
  return Math.min(fromTolerance, buyer.maxBudgetUsdc);
}

function logDedupeKey(label: string, log: Log): string {
  const tx = (log as unknown as { transactionHash?: string }).transactionHash ?? '';
  const idx = (log as unknown as { logIndex?: number }).logIndex ?? '';
  return `${label}:${tx}:${idx}`;
}

/// Starts the multi-tenant buyer agent. One set of watchers serves every user:
/// each posted job is matched to the buyer profile of whoever's buyer agent
/// posted it, and that profile drives the auction.
export function startBuyerAgents() {
  logger.info(
    { jobBoard: jobBoard.address, escrow: escrow.address },
    'buyer agent starting (multi-tenant)',
  );

  const unwatchPosted = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: (logs) => {
      for (const log of logs) safe('JobPosted', () => handleJobPosted(log));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchBid = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'BidSubmitted',
    onLogs: (logs) => {
      for (const log of logs) safe('BidSubmitted', () => handleBidSubmitted(log));
    },
    onError: (err) => logger.error({ err: err.message }, 'BidSubmitted watch error'),
  });

  const unwatchCounter = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterResponse',
    onLogs: (logs) => {
      for (const log of logs) safe('CounterResponse', () => handleCounterResponse(log));
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
    },
    bids: new Map(),
    collectionTimer: null,
    collectionFired: false,
    counterRoundsBySeller: new Map(),
    lastCounterPriceBySeller: new Map(),
    candidateQueue: [],
    triedSellers: new Set(),
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
    /* non-fatal — worst case the row lingers until the bus fires again */
  }
  // Don't broadcast tracked-events during boot backfill — the JobPosted log is
  // historical, and emitting it now would surface every old job in the activity
  // feed as if it had just been posted (timestamp comes from Date.now()).
  if (opts?.silent) return;
  bus.emitEvent({
    type: 'job.tracked',
    jobId: args.jobId,
    actor: 'buyer',
    payload: { budgetUsdc: state.context.budgetUsdc, deadlineUnix: state.context.deadlineUnix },
  });
}

async function handleBidSubmitted(log: Log) {
  const dedupeKey = logDedupeKey('BidSubmitted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: BidSubmittedArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state || state.finalized) return;
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

  const priceUsdc = formatUnits(args.price, USDC_DECIMALS);
  const briefBudget = Number(state.context.budgetUsdc);
  const priceMultiple = briefBudget > 0 ? Number(priceUsdc) / briefBudget : 1;
  const anomaly = priceAnomalyScore(Number(priceUsdc));
  const bid: Bid = {
    seller: args.seller,
    priceUsdc,
    priceWei: args.price,
    deadlineUnix: Number(args.deadline),
    sellerReputationBps,
    sellerTier: sellerRepTier,
    completionRate: sellerCompletionRate,
    velocity24h: sellerVelocity24h,
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
    const { object: score } = await withLlmTimeout(
      `bidScore(${state.jobId})`,
      generateObject({
        model: llmModel,
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
      // tier is surfaced so the timeline shows the agent scored this bid with the
      // seller's reputation in hand, not just the price.
      payload: { seller: args.seller, priceUsdc, pattern, tier: sellerRepTier, ...score },
    });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: state.jobId, seller: args.seller, err: message },
      'bid scoring failed',
    );
    reportError('agents.buyer.bidScore', err, {
      jobId: state.jobId,
      seller: args.seller,
    });
    bus.emitEvent({
      type: 'agent.error',
      jobId: state.jobId,
      actor: 'buyer',
      payload: { seller: args.seller, scope: 'bidScore', message },
    });
  }

  state.bids.set(args.seller, bid);

  if (!state.collectionTimer && !state.collectionFired) {
    state.collectionTimer = setTimeout(
      () => finalizeBidCollection(state),
      buyer.bidCollectionSeconds * 1000,
    );
    logger.info(
      { jobId: state.jobId, waitSec: buyer.bidCollectionSeconds },
      'first bid received, starting collection window',
    );
  }
}

async function finalizeBidCollection(state: JobState) {
  if (state.collectionFired || state.finalized) return;
  state.collectionFired = true;
  state.collectionTimer = null;

  // Primary sort uses the deterministic bid score (price + reputation +
  // completion + age + velocity), keyed off the same signals the LLM had.
  // The LLM's score still gets recorded on the bid for narrative, but
  // ranking comes from the deterministic function so two evaluations of
  // the same bid pool can't disagree. Reputation breaks near-ties.
  const budget = Number(state.context.budgetUsdc);
  const effectiveCap = computeBuyerEffectiveCap(state.context, state.buyer);
  const scoredBids = [...state.bids.values()]
    .filter((b) => typeof b.score === 'number')
    .map((b) => {
      const det = scoreBidDeterministic({
        bidPriceUsdc: Number(b.priceUsdc),
        briefBudgetUsdc: budget,
        effectiveCapUsdc: effectiveCap,
        sellerTier: (b.sellerTier ?? 'established') as Tier,
        sellerCompletionRate: b.completionRate,
        sellerVelocity24h: b.velocity24h,
      });
      return { bid: b, deterministicScore: det.score, breakdown: det.breakdown };
    });
  const ranked = scoredBids
    .sort((a, b) => {
      const scoreDelta = b.deterministicScore - a.deterministicScore;
      if (Math.abs(scoreDelta) < REPUTATION_TIEBREAK_EPSILON) {
        const repA = a.bid.sellerReputationBps ?? 5000;
        const repB = b.bid.sellerReputationBps ?? 5000;
        if (repA !== repB) return repB - repA;
      }
      return scoreDelta;
    })
    .map((entry) => entry.bid);

  if (ranked.length > 1 && typeof ranked[0]!.score === 'number' && typeof ranked[1]!.score === 'number') {
    const top = ranked[0]!;
    const second = ranked[1]!;
    const scoreDelta = (second.score ?? 0) - (top.score ?? 0);
    const repTop = top.sellerReputationBps ?? 5000;
    const repSecond = second.sellerReputationBps ?? 5000;
    // Log when reputation overrode the LLM. Useful for tuning the epsilon and
    // for narrating "we picked the more reputable seller" in audit traces.
    if (Math.abs(scoreDelta) < REPUTATION_TIEBREAK_EPSILON && repTop > repSecond && (top.score ?? 0) < (second.score ?? 0)) {
      logger.info(
        {
          jobId: state.jobId,
          chosen: top.seller,
          chosenScore: top.score,
          chosenRepBps: repTop,
          runnerUp: second.seller,
          runnerUpScore: second.score,
          runnerUpRepBps: repSecond,
        },
        'reputation broke a near-tie in bid ranking',
      );
    }
  }

  if (ranked.length === 0) {
    logger.warn({ jobId: state.jobId }, 'no scored bids, nothing to counter');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        reason: 'no-bids',
        detail: `bid collection window closed with no scored bids from any seller`,
        receivedBids: state.bids.size,
      },
    });
    return;
  }

  // Build the candidate queue: top-MAX_CANDIDATES bids by deterministic
  // score. When the head's negotiation fails, the buyer agent moves to the
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

  await issueCounter(state, top);
}

/// Pop the next candidate off the queue and start a fresh negotiation with
/// them. Called from any terminal-failure path on the current candidate
/// (LLM decline, counter-out-of-range, max-counter-rounds). Marks the
/// previous seller as tried so we don't loop. When the queue is empty,
/// emits `negotiation.exhausted` and finalizes the job.
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
      'candidate queue exhausted, finalizing as declined',
    );
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
    await issueCounter(state, next);
    return;
  }
  // Their bid is outside the effective cap. Skip and try the next.
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
    logger.warn(
      { jobId: state.jobId, counterPrice, effectiveCap },
      'LLM counter exceeds brief effective cap, trying next candidate',
    );
    await tryNextCandidate(state, bid.seller, 'llm-counter-over-budget');
    return;
  }

  const counterDeadlineUnix =
    Math.floor(Date.now() / 1000) + bid.suggestedCounterDeadlineDays * 86_400;
  const counterPriceWei = parseUnits(bid.suggestedCounterPrice, USDC_DECIMALS);

  // Keep the brief's working deadline in step with the negotiation. A counter
  // routinely proposes a later delivery date than the original (often short)
  // brief deadline; without this the jobExpiryWatcher reaps an in-flight
  // negotiation at the original clock. Extend only, never shorten.
  extendWorkingDeadline(state, counterDeadlineUnix);

  state.lastCounterPriceBySeller.set(bid.seller, bid.suggestedCounterPrice);
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
      counterPriceUsdc: bid.suggestedCounterPrice,
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
  // The seller's counter can carry a later delivery date too; keep the working
  // deadline aligned so the expiry watcher doesn't cut the round short.
  extendWorkingDeadline(state, sellerCounterDeadlineUnix);
  const buyerLastCounter = state.lastCounterPriceBySeller.get(args.seller) ?? '0';
  const effectiveMaxAcceptable = computeBuyerEffectiveCap(state.context, buyer);

  // Strategy module computes a deterministic next-counter price for the
  // prompt. Concession decay + tier elasticity + urgency, all deterministic
  // so the LLM has a defensible target to ratify or refine.
  const currentRound = state.counterRoundsBySeller.get(args.seller) ?? 0;
  const sellerTier = (state.bids.get(args.seller)?.sellerTier ?? 'established') as Tier;
  const daysToDeadline = Math.max(
    1,
    Math.floor((state.context.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
  );
  const buyerLastNumeric = Number(buyerLastCounter || state.context.budgetUsdc);
  const suggestedCounter = nextCounterPrice({
    role: 'buyer',
    mine: buyerLastNumeric,
    theirs: Number(sellerCounterPrice),
    round: currentRound,
    floor: 0,
    ceiling: effectiveMaxAcceptable,
    tier: sellerTier,
    daysToDeadline,
  });

  let decision: CounterEvaluation;
  try {
    const result = await withLlmTimeout(
      `counterEvaluation(${state.jobId})`,
      generateObject({
        model: llmModel,
        schema: counterEvaluationSchema,
        prompt: buildCounterEvaluationPrompt(
          state.context,
          {
            side: 'buyer',
            minAcceptablePriceUsdc: 0,
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
            marketMedianPrice: priceHistorySnapshot()?.median,
            marketSampleCount: priceHistorySnapshot()?.sampleCount,
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
    logger.info({ jobId: state.jobId }, 'low confidence, trying next candidate');
    await tryNextCandidate(state, args.seller, 'low-confidence');
    return;
  }

  if (decision.decision === 'accept') {
    const originatingBid = state.bids.get(args.seller);
    await proposeMatch(state, args.seller, sellerCounterPrice, originatingBid?.pattern);
    return;
  }

  if (decision.decision === 'decline') {
    logger.info({ jobId: state.jobId }, 'declined seller counter, trying next candidate');
    await tryNextCandidate(state, args.seller, 'llm-decline');
    return;
  }

  const rounds = state.counterRoundsBySeller.get(args.seller) ?? 0;
  // Final-round acceptance: if the buyer is about to hit the round cap AND
  // the seller's offer is inside the effective ceiling, accept rather than
  // walk away over a single round. Mirrors how a human in the last seat at
  // the negotiating table would close instead of restart.
  if (rounds >= buyer.maxCounterRounds - 1) {
    const sellerOfferN = Number(sellerCounterPrice);
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
/// Returns null when the pattern is normal/safe — no warning gets attached.
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
/// here — it records a match proposal and notifies both parties. The buyer
/// human approves separately, which triggers acceptBid + fundEscrow.
///
/// `pattern` is the risk classification from agents/signals.ts (or undefined
/// when the path didn't compute one, e.g. listing-driven matches). When it's
/// "risky" (honey-trap, lowball, spammy) we attach a riskFlag + riskNote so
/// the MatchBanner shows the seller a warning rather than the agent silently
/// auto-accepting — the human stays the decision-maker per the karwan-agent-
/// risk-principle memory note.
async function proposeMatch(
  state: JobState,
  seller: `0x${string}`,
  agreedPriceUsdc: string,
  pattern?: ReturnType<typeof classifyBid>,
) {
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
    const firstReleasePct = state.buyer.milestonePcts[0];
    if (firstReleasePct == null) return;
    if (state.buyer.milestonePcts.length !== 2) return;

    const now = Date.now();
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
      deadlineUnix: proposal.deadlineUnix,
      terms: proposal.termsHash,
      acceptedAt: now,
      fundTxHash,
    });
    logger.info(
      { jobId: proposal.jobId, buyer: proposal.buyerUser, seller: proposal.sellerUser },
      'approved match persisted as deal row',
    );
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

async function fundEscrow(
  state: JobState,
  seller: `0x${string}`,
  priceWei: bigint,
): Promise<{ ok: boolean; reason?: string }> {
  if (state.escrowFunded) return { ok: true };
  const buyer = state.buyer;

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

  let fundResult;
  try {
    fundResult = await executeContractCall(
      {
        walletId: buyer.walletId,
        contractAddress: escrow.address,
        abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[])',
        abiParameters: [state.jobId, seller, priceWei.toString(), buyer.milestonePcts],
      },
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
      milestonePcts: buyer.milestonePcts,
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
      milestonePcts: buyer.milestonePcts,
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
/// flag for whether a MatchProposal is awaiting human approval — the watcher
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
/// patches the brief on disk, and emits `job.expired`. Idempotent — a second
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
