import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient } from '../chain/client.js';
import { jobBoard, vault, getReservationBps } from '../chain/contracts.js';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { executeContractCall } from '../chain/txs.js';
import { llmModel } from '../llm/client.js';
import {
  bidDecisionSchema,
  counterEvaluationSchema,
  type CounterEvaluation,
} from '../llm/schemas.js';
import {
  buildBidEvaluationPrompt,
  buildCounterEvaluationPrompt,
  type JobContext,
} from '../llm/prompts.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';
import { bus } from '../events.js';
import type { SellerProfile } from './seller-profile.js';
import {
  MAX_COUNTER_ROUNDS,
  resolveAllSellerProfiles,
  resolveSellerProfile,
  siblingSellerAddress,
} from './agent-registry.js';
import { withLlmRetry } from './llm-utils.js';
import {
  heuristicCounterDecision,
  nextCounterPrice,
  type Tier,
} from './strategy.js';
import { getBrief } from '../db/briefs.js';
import { actorSignalsFor, priceHistorySnapshot } from './signals.js';
import { marketHeat, setResearchHeat } from './marketDemand.js';
import { maybeRaiseNearMiss } from './nearMiss.js';
import { topicalOverlap, extractKeywords, judgeRelevance } from '../llm/keywords.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { accountTypeOf } from '../profile/accountType.js';
import { researchMarket } from '../x402/externalClient.js';
import { getResearchState, chargeResearch } from '../x402/researchAccount.js';
import { config } from '../config.js';

// ERC-20 USDC on Arc uses 6 decimals (native gas interface uses 18). Bid amounts
// ride the ERC-20 rail because escrow.transferFrom is ERC-20.
const USDC_DECIMALS = 6;

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
}

/// How far below the original bid the seller agent will steer on a profile-
/// matched (non-listing) bid. 15% is a reasonable concession band, enough to
/// move on a real negotiation, not enough to capitulate to a lowball.
const PROFILE_MAX_DECREASE_PCT = 15;

// Keyed by `${jobId}:${sellerAgentAddress}` since many sellers can bid on one job.
const activeBids = new Map<string, ActiveBid>();
const handledEvents = new Set<string>();

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
): Promise<{ ok: true; txHash: string } | { ok: false; reason: string }> {
  const key = bidKey(job.jobId, seller.address);
  if (activeBids.has(key)) return { ok: false, reason: 'already-bid' };

  // The on-chain bid deadline is the OFFER's acceptance validity (acceptBid
  // reverts BidExpired once it passes), not the delivery deadline (the brief's,
  // carried on the off-chain deal row). Keep the offer acceptable for the whole
  // job window so a seller approving the match minutes or hours later still funds.
  const deadlineUnix = job.deadlineUnix;
  const priceUsdc = listing.askingPriceUsdc.toString();
  const priceWei = parseUnits(priceUsdc, USDC_DECIMALS);

  try {
    const txResult = await executeContractCall(
      {
        walletId: seller.walletId,
        contractAddress: jobBoard.address,
        abiFunctionSignature: 'submitBid(bytes32,uint256,uint64)',
        abiParameters: [job.jobId, priceWei.toString(), deadlineUnix.toString()],
      },
      `submitBid(listing-driven ${job.jobId})`,
    );

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
    });

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
      },
    });
    logger.info(
      { jobId: job.jobId, seller: seller.address, priceUsdc, floor: listing.floorUsdc, ...txResult },
      'listing-driven bid submitted',
    );
    return { ok: true, txHash: txResult.txHash };
  } catch (err) {
    logger.error(
      { jobId: job.jobId, seller: seller.address, err: (err as Error).message },
      'listing-driven submitBid failed',
    );
    return { ok: false, reason: (err as Error).message };
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
/// Event-watch poll cadence. Arc blocks are ~0.5s, so a 4s poll picks up a new
/// JobPosted / counter within a few seconds while keeping getLogs load light.
const WATCH_POLL_MS = 4_000;

export function startSellerAgents() {
  logger.info({ jobBoard: jobBoard.address }, 'seller agent starting (multi-tenant)');

  // HTTP polling, not a websocket subscription. Arc testnet's wss drops at boot
  // and viem's ws watcher never recovered, silently killing every event the
  // agents depend on. watchContractEvent over the HTTP client polls getLogs on
  // an interval, so an RPC blip just delays a poll instead of taking the loop
  // down. The reconciler below is the additional backstop.
  const unwatchPosted = publicClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    poll: true,
    pollingInterval: WATCH_POLL_MS,
    onLogs: (logs) => {
      for (const log of logs) safe('JobPosted', () => handleJobPosted(log));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchCounter = publicClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterOfferIssued',
    poll: true,
    pollingInterval: WATCH_POLL_MS,
    onLogs: (logs) => {
      for (const log of logs) safe('CounterOfferIssued', () => handleCounterOffer(log));
    },
    onError: (err) => logger.error({ err: err.message }, 'CounterOfferIssued watch error'),
  });

  // Periodic safety net for missed websocket JobPosted events.
  const stopReconciler = startSellerReconciler();

  return () => {
    unwatchPosted();
    unwatchCounter();
    stopReconciler();
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

  const sellers = await resolveAllSellerProfiles();
  if (sellers.length === 0) return;

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
  const baseJob: JobContext = {
    jobId,
    buyer: args.buyer,
    budgetUsdc: formatUnits(args.budget, USDC_DECIMALS),
    deadlineUnix: Number(args.deadline),
    termsHash: args.termsHash,
    buyerReputationBps: 5000,
    briefText: brief?.briefText,
    negotiationMaxIncreasePct: brief?.negotiationMaxIncreasePct,
    keywords: briefKeywords,
    trustedMatch: brief?.trustedMatch === true,
    tradeLane: brief?.tradeLane ?? 'service',
  };

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

  for (const seller of sellers) {
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
    await evaluateAndBid(seller, { ...baseJob });
    evaluated.add(sellerLower);
  }

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
    const wallet = await findAgentWalletByAgentAddress(seller.address);
    const owner = wallet?.userAddress;
    if (!owner) return;
    const rs = await getResearchState(owner);
    if (!rs.active) return;
    const read = await researchMarket(keywords);
    setResearchHeat(keywords, read.demand);
    if (!read.cached) {
      await chargeResearch(owner, read.paidUsd);
      bus.emitEvent({
        type: 'agent.paid',
        jobId,
        actor: 'seller',
        payload: {
          rail: 'base',
          kind: 'research',
          agent: 'seller',
          seller: seller.address,
          amountUsd: read.paidUsd,
          txHash: read.txHash,
          payer: read.payer,
          demand: read.demand,
          keywords,
        },
      });
    }
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

async function evaluateAndBid(seller: SellerProfile, job: JobContext) {
  const mismatch = profileMismatchReason(seller, job);
  if (mismatch) {
    logger.info({ jobId: job.jobId, seller: seller.address, reason: mismatch.reason }, 'skipping job');
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: mismatch,
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

  // Trusted Match: filter sellers whose stake can't cover the worst-case
  // reservation. freeStakeOf reads against the identity wallet (where stake
  // lives), not the seller agent.
  if (job.trustedMatch) {
    try {
      const reservationBps = await getReservationBps();
      const tolerance = job.negotiationMaxIncreasePct ?? 0;
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
        model: llmModel,
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
  await maybeSellerResearch(seller, dealKeywords, job.jobId);
  const heat = await marketHeat(dealKeywords, seller.address);
  const opening = sellerOpeningBid(seller, job, buyerTier, heat);
  if (opening === null) {
    // Seller floor sits above the buyer's ceiling, so no price clears both
    // ranges. When the gap is small, ask the blocked side to stretch instead of
    // walking away silently (a near-miss). The guard inside maybeRaiseNearMiss
    // only fires when the seller floor genuinely exceeds the buyer ceiling.
    const tol = job.negotiationMaxIncreasePct ?? 0;
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
    logger.info(
      { jobId: job.jobId, seller: seller.address, minBudget: seller.minBudgetUsdc },
      'skipping: seller floor above the buyer budget cap',
    );
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        reason: 'budget-below-seller-floor',
        detail: `seller floor ${seller.minBudgetUsdc} USDC is above the buyer's budget cap`,
      },
    });
    return;
  }
  const finalPrice = opening.toFixed(2);
  // NEW buyers still raise a human-review flag so the seller can eyeball a fresh
  // counterparty before any eventual match is approved.
  const humanReview = buyerTier === 'new';

  // The on-chain bid deadline is the offer's acceptance validity (acceptBid
  // reverts BidExpired past it), not the delivery deadline (the brief's, kept on
  // the off-chain deal row). A short LLM-suggested delivery used to make the
  // offer expire in minutes, so a late match approval hit BidExpired. Keep the
  // offer acceptable for the whole job window.
  const deadlineUnix = job.deadlineUnix;
  const priceWei = parseUnits(finalPrice, USDC_DECIMALS);

  const txResult = await executeContractCall(
    {
      walletId: seller.walletId,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'submitBid(bytes32,uint256,uint64)',
      abiParameters: [job.jobId, priceWei.toString(), deadlineUnix.toString()],
    },
    `submitBid(${job.jobId})`,
  );

  activeBids.set(bidKey(job.jobId, seller.address), {
    seller,
    jobContext: job,
    lastBidPrice: finalPrice,
    originalBidPriceUsdc: finalPrice,
    counterRounds: 0,
    finalized: false,
    responding: false,
    humanReview,
  });

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
    },
  });
}

/// Demand-scaled opening headroom above the buyer's budget. The seller's open
/// reaches `HEADROOM_BASE_PCT + heat * HEADROOM_DEMAND_SPAN_PCT` percent above
/// the budget, so a cold/oversupplied skill (heat -> 0) opens near the buyer's
/// price with little to negotiate, while a scarce, in-demand skill (heat -> 1)
/// opens well above it with a real walk down. `heat` is the live marketHeat
/// signal (Karwan internal supply scarcity blended with external demand
/// findings). The buyer's own tolerance still floors the headroom, and the
/// buyer's acceptance cap is unchanged, so this only shapes the opening ask,
/// never what the buyer ultimately pays.
const HEADROOM_BASE_PCT = 5;
const HEADROOM_DEMAND_SPAN_PCT = 45;

/// Per-seller opening bid, demand-driven, with bounded jitter so it doesn't
/// fall into a fixed pattern.
///
/// Economic model: a buyer who posts a brief has committed to that budget as
/// their valuation, so it is the FLOOR of the negotiation. The seller never
/// bids below it. How far ABOVE it the seller opens is demand-scaled: the
/// opening ceiling is budget x (1 + headroom%), where headroom grows with
/// marketHeat (scarce / in-demand skill) and shrinks toward the budget as
/// demand drops. The buyer's own tolerance floors the headroom. So a hot skill
/// opens high with a real walk down; a common one opens near the buyer's price.
///
/// Within that band the opening biases toward the ceiling, lifted again by
/// market demand and softened for trusted buyers (an elite/repeat buyer is
/// quoted nearer the floor). A per-seller address seed keeps a multi-seller
/// auction spread out instead of every seller converging on one number. Returns
/// null when no point in [budget, ceiling] is reachable for
/// this seller (their max is below the buyer's budget, or their min above the
/// ceiling), i.e. no possible deal, so skip.
function sellerOpeningBid(
  seller: SellerProfile,
  job: JobContext,
  buyerTier: Tier,
  heat: number,
): number | null {
  const budget = Number(job.budgetUsdc);
  const tol = job.negotiationMaxIncreasePct ?? 0;
  const h = Number.isFinite(heat) ? Math.max(0, Math.min(1, heat)) : 0.5;
  // Sellers open ABOVE the budget and get negotiated down toward it (never
  // below). How far above scales with DEMAND: the opening headroom grows as
  // marketHeat rises (scarce / in-demand skill, Karwan supply + external
  // findings) and shrinks toward the budget as demand drops, so a hot skill
  // opens with room to negotiate while a common one opens near the buyer's
  // price. The buyer's own tolerance is a floor on the headroom (they
  // explicitly allowed that much). The buyer agent counters anything above its
  // actual cap (budget x (1+tol)) back down, so a high open only means a longer
  // walk to the buyer's price, never a worse deal.
  const demandHeadroomPct = HEADROOM_BASE_PCT + h * HEADROOM_DEMAND_SPAN_PCT;
  const openHeadroomPct = Math.max(tol, demandHeadroomPct);
  const openCeiling = budget * (1 + openHeadroomPct / 100);
  // Floor = the buyer's posted budget, never below it. (The seller's own
  // minimum still applies if it is higher; that seller wants more than offered.)
  const floor = Math.max(seller.minBudgetUsdc, budget);
  const ceiling = Math.min(seller.maxBudgetUsdc, openCeiling);
  if (!Number.isFinite(ceiling) || ceiling < floor) return null;
  if (ceiling === floor) return Number(floor.toFixed(2));

  // Higher bias = nearer the ceiling (seller earns more). NEW/COLD buyers pay
  // toward the top of the band; ELITE/STRONG repeat buyers are quoted nearer
  // the floor. Market heat lifts everyone toward the ceiling for scarce skills.
  const TIER_BIAS: Record<Tier, number> = {
    elite: 0.15,
    strong: 0.35,
    established: 0.5,
    cold: 0.7,
    new: 0.8,
  };
  // Market heat is the heaviest input, so a hot skill genuinely holds nearer the
  // ceiling and a common one prices down. The open tracks live demand, not a
  // fixed formula. A per-bid jitter keeps the same seller from opening at the
  // identical point each time (less robotic, harder to game); the address seed
  // still spreads a multi-seller auction. All clamped within [floor, ceiling].
  const jitter = Math.random();
  let frac = Math.max(
    0,
    Math.min(
      1,
      0.15 * addrFrac(seller.address) + 0.3 * TIER_BIAS[buyerTier] + 0.4 * h + 0.15 * jitter,
    ),
  );
  // Trusted Match restraint: when the buyer chose reputation over price, the
  // seller anchors lower in the band rather than reaching for the ceiling.
  // Multiplicative (0.7×) plus an absolute cap at 0.55 so opens cluster around
  // the middle of [floor, ceiling] regardless of buyer tier or skill heat.
  // The premium the seller gives up here is the price of being chosen as a
  // trusted counterparty; the negotiation prompt's restraint rule completes
  // the picture by accepting in-range counters early.
  if (job.trustedMatch) {
    frac = Math.min(frac * 0.7, 0.55);
  }
  return Number((floor + (ceiling - floor) * frac).toFixed(2));
}

/// Stable address -> [0,1) fraction so each seller's opening bid lands at a
/// different point in its range. Pure string hash, deterministic.
function addrFrac(addr: string): number {
  let h = 0;
  const s = addr.toLowerCase();
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
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
  // Brief-flow floor includes the buyer's posted budget: the seller negotiates
  // upward from what the buyer offered and never concedes below it. (Listing
  // flow keeps the listing's own floor. That's the seller-initiated flow where
  // the buyer is the one pricing down toward their budget.)
  const briefBudget = Number(active.jobContext.budgetUsdc);
  const profileFloor = active.listingFloorUsdc
    ? active.listingFloorUsdc
    : Math.max(
        seller.minBudgetUsdc,
        Number.isFinite(briefBudget) ? briefBudget : 0,
        Number((originalBid * (1 - PROFILE_MAX_DECREASE_PCT / 100)).toFixed(2)),
      );
  const minAcceptable = profileFloor;
  const maxAcceptable = active.listingAskingPriceUsdc ?? seller.maxBudgetUsdc;

  // Strategy module computes a deterministic counter price for this round.
  // Tier elasticity + urgency lean the move in the right direction; the LLM
  // ratifies (and writes the reasoning trace).
  const buyerTier = (active.jobContext.buyerRepTier ?? 'established') as Tier;
  const dealKeywords =
    (active.jobContext.keywords ?? []).length > 0
      ? active.jobContext.keywords!
      : [...(seller.keywords ?? []), ...(seller.skills ?? [])];
  await maybeSellerResearch(seller, dealKeywords, active.jobContext.jobId);
  const heat = await marketHeat(dealKeywords, seller.address);
  const sellerDaysToDeadline = Math.max(
    1,
    Math.floor(
      (active.jobContext.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400,
    ),
  );
  const suggestedCounter = nextCounterPrice({
    role: 'seller',
    mine: Number(active.lastBidPrice),
    theirs: Number(buyerCounterPrice),
    round: active.counterRounds,
    floor: minAcceptable,
    ceiling: maxAcceptable,
    tier: buyerTier,
    daysToDeadline: sellerDaysToDeadline,
  });

  let decision: CounterEvaluation;
  try {
    const result = await withLlmRetry(`counterEvaluation(${args.jobId})`, () =>
      generateObject({
        model: llmModel,
        schema: counterEvaluationSchema,
        prompt: buildCounterEvaluationPrompt(
          active.jobContext,
          {
            side: 'seller',
            minAcceptablePriceUsdc: minAcceptable,
            maxAcceptablePriceUsdc: maxAcceptable,
            minDeadlineDays: seller.minDeadlineDays,
            maxDeadlineDays: seller.maxDeadlineDays,
          },
          active.lastBidPrice,
          buyerCounterPrice,
          buyerCounterDeadlineUnix,
          {
            round: active.counterRounds,
            maxRounds: MAX_COUNTER_ROUNDS,
            counterpartyTier: buyerTier,
            suggestedCounterPrice: suggestedCounter,
            marketMedianPrice: priceHistorySnapshot()?.median,
            marketSampleCount: priceHistorySnapshot()?.sampleCount,
            marketHeat: heat,
            trustedMatch: active.jobContext.trustedMatch === true,
          },
        ),
      }),
    );
    decision = result.object;
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: args.jobId, err: message },
      'counter evaluation LLM failed, falling back to heuristic',
    );
    reportError('agents.seller.counterEvaluation', err, {
      jobId: args.jobId,
      seller: seller.address,
    });
    // Don't strand the job. Use the deterministic strategy module to
    // accept-or-decline based on the buyer's counter vs the seller's floor.
    // The agent.fallback event tells the timeline that the LLM was bypassed.
    const fallback = heuristicCounterDecision({
      role: 'seller',
      theirOffer: Number(buyerCounterPrice),
      floor: minAcceptable,
      ceiling: maxAcceptable,
    });
    bus.emitEvent({
      type: 'agent.fallback',
      jobId: args.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
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

  logger.info({ jobId: args.jobId, seller: seller.address, decision }, 'counter-offer evaluated');

  if (decision.decision === 'accept') {
    // Hard steering guard: even if the LLM said accept, refuse when the buyer's
    // counter is below the steering floor. Protects against LLM drift that
    // forgets the floor we passed in the prompt.
    if (Number(buyerCounterPrice) < minAcceptable) {
      logger.info(
        { jobId: args.jobId, buyerCounterPrice, minAcceptable },
        'LLM accept overridden — buyer counter below steering floor',
      );
      active.finalized = true;
      bus.emitEvent({
        type: 'agent.declined',
        jobId: args.jobId,
        actor: 'seller',
        payload: {
          seller: seller.address,
          reason: 'counter-below-steering-floor',
          detail: `${buyerCounterPrice} USDC is below the per-job steering floor of ${minAcceptable} USDC`,
          buyerCounterPrice,
          minAcceptable,
        },
      });
      return;
    }
    const result = await executeContractCall(
      {
        walletId: seller.walletId,
        contractAddress: jobBoard.address,
        abiFunctionSignature: 'respondToCounter(bytes32,bool,uint256,uint64)',
        abiParameters: [args.jobId, true, '0', '0'],
      },
      `respondToCounter.accept(${args.jobId})`,
    );
    active.finalized = true;
    logger.info({ jobId: args.jobId, ...result }, 'counter accepted');
    bus.emitEvent({
      type: 'counter.response.submitted',
      jobId: args.jobId,
      actor: 'seller',
      payload: { accepted: true, txHash: result.txHash },
    });
    return;
  }

  if (decision.decision === 'decline') {
    logger.info({ jobId: args.jobId }, 'declined buyer counter');
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: args.jobId,
      actor: 'seller',
      payload: { seller: seller.address, reason: 'llm-decline', decision },
    });
    return;
  }

  // Validate the LLM's counter BEFORE burning a round. Previously we
  // incremented `counterRounds` first, so a malformed counter (missing
  // price/deadline OR price outside the steering range) would waste a round
  // and trip the cap one offer early.
  if (active.counterRounds >= MAX_COUNTER_ROUNDS) {
    logger.info({ jobId: args.jobId }, 'too many counter rounds, declining');
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: args.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        reason: 'max-counter-rounds',
        detail: `seller hit the ${MAX_COUNTER_ROUNDS}-round counter cap on this auction`,
        rounds: active.counterRounds,
      },
    });
    return;
  }

  // The LLM picked "counter" but Gemini Flash Lite intermittently drops the
  // price/deadline. Fall back to the deterministic suggestion (already inside
  // the seller's [min,max] steering range) instead of stranding the job, keeping
  // the buyer's proposed timing clamped to the seller's window.
  const finalCounterPrice = decision.counterPrice ?? suggestedCounter.toFixed(2);
  const finalCounterDeadlineDays =
    decision.counterDeadlineDays ??
    Math.max(
      seller.minDeadlineDays,
      Math.min(
        seller.maxDeadlineDays,
        Math.ceil((buyerCounterDeadlineUnix - Math.floor(Date.now() / 1000)) / 86_400),
      ),
    );
  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn(
      { jobId: args.jobId, finalCounterPrice, finalCounterDeadlineDays },
      'LLM counter missing price/deadline, using deterministic suggestion',
    );
    bus.emitEvent({
      type: 'agent.fallback',
      jobId: args.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        scope: 'counterEvaluation',
        message: 'LLM omitted the counter price or deadline; used the deterministic suggestion',
        counterPrice: finalCounterPrice,
        counterDeadlineDays: finalCounterDeadlineDays,
      },
    });
  }

  const counterPriceUsdc = Number(finalCounterPrice);
  if (counterPriceUsdc < minAcceptable || counterPriceUsdc > maxAcceptable) {
    logger.warn(
      { jobId: args.jobId, counterPriceUsdc, minAcceptable, maxAcceptable },
      'LLM counter outside steering range, declining',
    );
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: args.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        reason: 'llm-counter-out-of-range',
        detail: `${counterPriceUsdc} USDC is outside the per-job steering range ${minAcceptable}-${maxAcceptable} USDC`,
        counterPriceUsdc,
        minAcceptable,
        maxAcceptable,
      },
    });
    return;
  }

  const counterDeadlineUnix =
    Math.floor(Date.now() / 1000) + finalCounterDeadlineDays * 86_400;
  const counterPriceWei = parseUnits(finalCounterPrice, USDC_DECIMALS);

  // Commit to the round count only now that we know we have a valid counter
  // to submit on chain.
  active.counterRounds += 1;
  const result = await executeContractCall(
    {
      walletId: seller.walletId,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'respondToCounter(bytes32,bool,uint256,uint64)',
      abiParameters: [
        args.jobId,
        false,
        counterPriceWei.toString(),
        counterDeadlineUnix.toString(),
      ],
    },
    `respondToCounter.counter(${args.jobId})`,
  );
  active.lastBidPrice = finalCounterPrice;
  logger.info({ jobId: args.jobId, ...result }, 'counter back submitted');
  bus.emitEvent({
    type: 'counter.response.submitted',
    jobId: args.jobId,
    actor: 'seller',
    payload: {
      accepted: false,
      counterPrice: finalCounterPrice,
      counterDeadlineDays: finalCounterDeadlineDays,
      txHash: result.txHash,
    },
  });
}

/// `reason` is a stable code the timeline maps to a short label; `detail` is the
/// human sentence shown as the row's subtitle. Both ride on the agent.skipped
/// payload so the seller's owner can always read why their agent stood down.
function profileMismatchReason(
  seller: SellerProfile,
  job: JobContext,
): { reason: string; detail: string; budgetUsdc?: string; daysToDeadline?: number } | null {
  const budget = Number(job.budgetUsdc);
  if (budget < seller.minBudgetUsdc) {
    return {
      reason: 'budget-out-of-range',
      detail: `Budget ${budget} USDC is below your ${seller.minBudgetUsdc} USDC minimum.`,
      budgetUsdc: job.budgetUsdc,
    };
  }
  if (budget > seller.maxBudgetUsdc) {
    return {
      reason: 'budget-out-of-range',
      detail: `Budget ${budget} USDC is above your ${seller.maxBudgetUsdc} USDC maximum.`,
      budgetUsdc: job.budgetUsdc,
    };
  }
  // Round up so that "24h from now" counts as 1 day even if processing latency
  // makes the raw float < 1.
  const rawDays = (job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400;
  const daysToDeadline = Math.ceil(rawDays);
  if (daysToDeadline < seller.minDeadlineDays) {
    return {
      reason: 'deadline-out-of-range',
      detail: `Deadline ${daysToDeadline}d is sooner than your ${seller.minDeadlineDays}d minimum.`,
      daysToDeadline,
    };
  }
  if (daysToDeadline > seller.maxDeadlineDays) {
    return {
      reason: 'deadline-out-of-range',
      detail: `Deadline ${daysToDeadline}d is longer than your ${seller.maxDeadlineDays}d maximum.`,
      daysToDeadline,
    };
  }
  return null;
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
    })),
  };
}

/// Replays recent JobPosted logs through the handler. `rescan` re-enters the
/// scan for already-seen jobs (the per-seller guard keeps it idempotent); the
/// default (startup backfill) relies on the per-log dedupe.
async function replayRecentJobLogs(opts: { fromBlock?: bigint; rescan?: boolean }) {
  const latest = await publicClient.getBlockNumber();
  const from = opts.fromBlock ?? (latest > 10_000n ? latest - 10_000n : 0n);
  const logs = await publicClient.getLogs({
    address: jobBoard.address,
    event: jobBoardAbi.find((x) => x.type === 'event' && x.name === 'JobPosted')! as never,
    fromBlock: from,
    toBlock: latest,
  });
  for (const log of logs) await handleJobPosted(log as unknown as Log, { rescan: opts.rescan });
  return logs.length;
}

/// Replays recent JobPosted logs through the live handler, so a freshly started
/// agent picks up jobs posted while it was down.
export async function backfillRecentJobs(fromBlock?: bigint) {
  const count = await replayRecentJobLogs({ fromBlock });
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
export function startSellerReconciler(): () => void {
  const tick = () =>
    safe('reconcile', async () => {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > RECONCILE_LOOKBACK_BLOCKS ? latest - RECONCILE_LOOKBACK_BLOCKS : 0n;
      const count = await replayRecentJobLogs({ fromBlock, rescan: true });
      logger.debug({ count }, 'seller reconciler swept recent jobs');
    });
  const id = setInterval(tick, RECONCILE_INTERVAL_MS);
  logger.info({ everyMs: RECONCILE_INTERVAL_MS }, 'seller reconciler started');
  return () => clearInterval(id);
}
