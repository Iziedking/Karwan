import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import { jobBoard } from '../chain/contracts.js';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { executeContractCall } from '../chain/txs.js';
import { llmModel } from '../llm/client.js';
import { bidDecisionSchema, counterEvaluationSchema } from '../llm/schemas.js';
import {
  buildBidEvaluationPrompt,
  buildCounterEvaluationPrompt,
  type JobContext,
} from '../llm/prompts.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import type { SellerProfile } from './seller-profile.js';
import { resolveAllSellerProfiles, resolveSellerProfile, siblingSellerAddress } from './agent-registry.js';
import { withLlmTimeout } from './llm-utils.js';
import { getBrief } from '../db/briefs.js';
import { actorSignalsFor } from './signals.js';

// ERC-20 USDC on Arc uses 6 decimals (native gas interface uses 18). Bid amounts
// ride the ERC-20 rail because escrow.transferFrom is ERC-20.
const USDC_DECIMALS = 6;

interface ActiveBid {
  // The seller profile of the user whose seller agent placed this bid.
  seller: SellerProfile;
  jobContext: JobContext;
  lastBidPrice: string;
  /** The seller's opening price on this auction. Anchors the counter-evaluation
   *  floor for profile-driven bids — the agent won't drop the price more than
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
/// matched (non-listing) bid. 15% is a reasonable concession band — enough to
/// move on a real negotiation, not enough to capitulate to a lowball.
const PROFILE_MAX_DECREASE_PCT = 15;

// Keyed by `${jobId}:${sellerAgentAddress}` since many sellers can bid on one job.
const activeBids = new Map<string, ActiveBid>();
const handledEvents = new Set<string>();

/// Submit a bid on an open buyer brief on behalf of a seller listing. Bypasses
/// the seller agent's LLM bid decision because the listing IS the decision —
/// the seller has pre-committed to this price and tolerance. From here the bid
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

  const proposedDays = listing.deadlineDays ?? seller.maxDeadlineDays;
  const proposedDeadline = Math.floor(Date.now() / 1000) + proposedDays * 86_400;
  const deadlineUnix = Math.min(proposedDeadline, job.deadlineUnix);
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
export function startSellerAgents() {
  logger.info({ jobBoard: jobBoard.address }, 'seller agent starting (multi-tenant)');

  const unwatchPosted = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: (logs) => {
      for (const log of logs) safe('JobPosted', () => handleJobPosted(log));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchCounter = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterOfferIssued',
    onLogs: (logs) => {
      for (const log of logs) safe('CounterOfferIssued', () => handleCounterOffer(log));
    },
    onError: (err) => logger.error({ err: err.message }, 'CounterOfferIssued watch error'),
  });

  return () => {
    unwatchPosted();
    unwatchCounter();
    logger.info('seller agent stopped');
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
        actor: 'seller',
        payload: { scope: label, message },
      });
    });
}

async function handleJobPosted(log: Log) {
  const dedupeKey = logDedupeKey('JobPosted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: JobPostedArgs }).args;
  const jobId = args.jobId;

  const sellers = await resolveAllSellerProfiles();
  if (sellers.length === 0) return;

  // Keep a user's own seller agent out of their own auction.
  const excludeSeller = (await siblingSellerAddress(args.buyer))?.toLowerCase();

  // Pull off-chain brief metadata if the buyer posted via our API. Lets the
  // LLM bid decision evaluate topical match against the seller's profile.
  const brief = getBrief(jobId);
  const baseJob: JobContext = {
    jobId,
    buyer: args.buyer,
    budgetUsdc: formatUnits(args.budget, USDC_DECIMALS),
    deadlineUnix: Number(args.deadline),
    termsHash: args.termsHash,
    buyerReputationBps: 5000,
    briefText: brief?.briefText,
    negotiationMaxIncreasePct: brief?.negotiationMaxIncreasePct,
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
    if (seller.address.toLowerCase() === excludeSeller) continue;
    if (activeBids.has(bidKey(jobId, seller.address))) continue;
    await evaluateAndBid(seller, { ...baseJob });
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

  let decision;
  try {
    const result = await withLlmTimeout(
      `bidDecision(${job.jobId})`,
      generateObject({
        model: llmModel,
        schema: bidDecisionSchema,
        prompt: buildBidEvaluationPrompt(job, seller),
      }),
    );
    decision = result.object;
  } catch (err) {
    const message = (err as Error).message;
    logger.warn({ jobId: job.jobId, err: message }, 'bid LLM call failed');
    bus.emitEvent({
      type: 'agent.error',
      jobId: job.jobId,
      actor: 'seller',
      payload: { seller: seller.address, scope: 'bidDecision', message },
    });
    return;
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

  const llmPrice = Number(decision.suggestedPrice);
  if (llmPrice < seller.minBudgetUsdc || llmPrice > seller.maxBudgetUsdc) {
    logger.warn({ jobId: job.jobId, priceUsdc: llmPrice }, 'skipping: LLM price outside seller range');
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        reason: 'llm-price-out-of-range',
        detail: `${llmPrice} USDC is outside the seller's ${seller.minBudgetUsdc}-${seller.maxBudgetUsdc} USDC range`,
        priceUsdc: llmPrice,
      },
    });
    return;
  }

  // Apply tier-aware pricing adjustments per reputation-model.md §6.
  // ELITE buyers earn first-look discounts; COLD/NEW buyers pay a premium
  // because they're statistically more likely to abandon or dispute. NEW
  // also raises a humanReview flag so the seller can eyeball it before any
  // eventual match is approved.
  const buyerTier = job.buyerRepTier ?? 'established';
  const adjusted = adjustBidByTier(llmPrice, buyerTier, seller);
  const priceUsdc = adjusted.priceUsdc;
  const finalPrice = priceUsdc.toFixed(2);
  if (adjusted.adjustment !== 'standard') {
    logger.info(
      {
        jobId: job.jobId,
        seller: seller.address,
        llmPrice,
        finalPrice,
        buyerTier,
        adjustment: adjusted.adjustment,
      },
      'bid price adjusted for buyer tier (§6)',
    );
  }

  const proposedDeadline =
    Math.floor(Date.now() / 1000) + decision.suggestedDeadlineDays * 86_400;
  const deadlineUnix = Math.min(proposedDeadline, job.deadlineUnix);
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
    humanReview: adjusted.humanReview,
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
      tierAdjustment: adjusted.adjustment,
      humanReview: adjusted.humanReview,
    },
  });
}

/// Adjusts the LLM's suggested price based on the buyer's reputation tier
/// per docs/reputation-model.md §6. Clamps to the seller's profile range so
/// the adjusted price never violates the seller's own bounds. `humanReview`
/// surfaces on the bid.submitted event so the seller's UI can flag NEW
/// buyers before the human signs off on the eventual match.
function adjustBidByTier(
  llmPrice: number,
  tier: 'new' | 'cold' | 'established' | 'strong' | 'elite',
  seller: SellerProfile,
): {
  priceUsdc: number;
  adjustment: 'standard' | 'elite-floor' | 'cold-premium' | 'new-premium';
  humanReview: boolean;
} {
  const clamp = (n: number): number =>
    Math.max(seller.minBudgetUsdc, Math.min(seller.maxBudgetUsdc, n));
  if (tier === 'elite') {
    // Top-tier clients earn first-look pricing. Bid at the seller's floor.
    return {
      priceUsdc: clamp(seller.minBudgetUsdc),
      adjustment: 'elite-floor',
      humanReview: false,
    };
  }
  if (tier === 'cold') {
    return {
      priceUsdc: clamp(llmPrice * 1.10),
      adjustment: 'cold-premium',
      humanReview: false,
    };
  }
  if (tier === 'new') {
    return {
      priceUsdc: clamp(llmPrice * 1.15),
      adjustment: 'new-premium',
      humanReview: true,
    };
  }
  // established + strong: LLM price stands.
  return { priceUsdc: llmPrice, adjustment: 'standard', humanReview: false };
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

  // Counter steering — pick a floor and ceiling for the LLM's negotiation range:
  //  * Listing-driven bids: floor = listing's floor, ceiling = listing's asking
  //    price (set at listing time, overrides profile-wide range).
  //  * Profile-driven bids: floor = max(profile minimum, original bid * (1 -
  //    PROFILE_MAX_DECREASE_PCT/100)). This anchors counters to the seller's
  //    opening on this specific job, so the agent doesn't capitulate to the
  //    profile-wide minimum just because the buyer pushed hard. Ceiling stays
  //    at the seller's profile-wide maximum.
  const originalBid = Number(active.originalBidPriceUsdc);
  const profileFloor = active.listingFloorUsdc
    ? active.listingFloorUsdc
    : Math.max(
        seller.minBudgetUsdc,
        Number((originalBid * (1 - PROFILE_MAX_DECREASE_PCT / 100)).toFixed(2)),
      );
  const minAcceptable = profileFloor;
  const maxAcceptable = active.listingAskingPriceUsdc ?? seller.maxBudgetUsdc;

  let decision;
  try {
    const result = await withLlmTimeout(
      `counterEvaluation(${args.jobId})`,
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
        ),
      }),
    );
    decision = result.object;
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: args.jobId, err: message },
      'counter evaluation failed, declining via no-op',
    );
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.error',
      jobId: args.jobId,
      actor: 'seller',
      payload: { seller: seller.address, scope: 'counterEvaluation', message },
    });
    return;
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

  active.counterRounds += 1;
  if (active.counterRounds > 2) {
    logger.info({ jobId: args.jobId }, 'too many counter rounds, declining');
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: args.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        reason: 'max-counter-rounds',
        detail: `seller hit the 2-round counter cap on this auction`,
        rounds: active.counterRounds,
      },
    });
    return;
  }

  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn({ jobId: args.jobId }, 'counter requested without price/deadline');
    active.finalized = true;
    bus.emitEvent({
      type: 'agent.error',
      jobId: args.jobId,
      actor: 'seller',
      payload: {
        seller: seller.address,
        scope: 'counterEvaluation',
        message: 'LLM asked for a counter but produced no counterPrice/counterDeadlineDays',
      },
    });
    return;
  }

  const counterPriceUsdc = Number(decision.counterPrice);
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
    Math.floor(Date.now() / 1000) + decision.counterDeadlineDays * 86_400;
  const counterPriceWei = parseUnits(decision.counterPrice, USDC_DECIMALS);

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
  active.lastBidPrice = decision.counterPrice;
  logger.info({ jobId: args.jobId, ...result }, 'counter back submitted');
  bus.emitEvent({
    type: 'counter.response.submitted',
    jobId: args.jobId,
    actor: 'seller',
    payload: {
      accepted: false,
      counterPrice: decision.counterPrice,
      counterDeadlineDays: decision.counterDeadlineDays,
      txHash: result.txHash,
    },
  });
}

function profileMismatchReason(
  seller: SellerProfile,
  job: JobContext,
): { reason: string; budgetUsdc?: string; daysToDeadline?: number } | null {
  const budget = Number(job.budgetUsdc);
  if (budget < seller.minBudgetUsdc) {
    return {
      reason: `budget ${budget} USDC below seller minimum of ${seller.minBudgetUsdc} USDC`,
      budgetUsdc: job.budgetUsdc,
    };
  }
  if (budget > seller.maxBudgetUsdc) {
    return {
      reason: `budget ${budget} USDC above seller maximum of ${seller.maxBudgetUsdc} USDC`,
      budgetUsdc: job.budgetUsdc,
    };
  }
  // Round up so that "24h from now" counts as 1 day even if processing latency
  // makes the raw float < 1.
  const rawDays = (job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400;
  const daysToDeadline = Math.ceil(rawDays);
  if (daysToDeadline < seller.minDeadlineDays) {
    return {
      reason: `deadline ${daysToDeadline}d sooner than seller minimum of ${seller.minDeadlineDays}d`,
      daysToDeadline,
    };
  }
  if (daysToDeadline > seller.maxDeadlineDays) {
    return {
      reason: `deadline ${daysToDeadline}d longer than seller maximum of ${seller.maxDeadlineDays}d`,
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
  logger.info({ count: logs.length, fromBlock: from.toString() }, 'seller backfilling jobs');
  for (const log of logs) await handleJobPosted(log as unknown as Log);
}
