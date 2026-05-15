import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import {
  jobBoard,
  escrow,
  reputation,
  usdc as usdcAddress,
  getEscrowFeeBps,
  computeFunding,
} from '../chain/contracts.js';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { executeContractCall } from '../chain/txs.js';
import { llmModel } from '../llm/client.js';
import { bidScoreSchema, counterEvaluationSchema } from '../llm/schemas.js';
import {
  buildBidRankingPrompt,
  buildCounterEvaluationPrompt,
  type BidContext,
  type JobContext,
} from '../llm/prompts.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import type { BuyerProfile } from './buyer-profile.js';
import { resolveBuyerProfile } from './agent-registry.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { createDeal, getDeal } from '../db/deals.js';
import { getBrief } from '../db/briefs.js';
import { withLlmTimeout } from './llm-utils.js';
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
}

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
  finalized: boolean;
  escrowFunded: boolean;
}

const jobs = new Map<`0x${string}`, JobState>();
const handledEvents = new Set<string>();

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

  return () => {
    unwatchPosted();
    unwatchBid();
    unwatchCounter();
    for (const state of jobs.values()) {
      if (state.collectionTimer) clearTimeout(state.collectionTimer);
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

async function handleJobPosted(log: Log) {
  const dedupeKey = logDedupeKey('JobPosted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: JobPostedArgs }).args;
  if (jobs.has(args.jobId)) return;

  // Only manage jobs posted by one of our users' buyer agents.
  const buyer = await resolveBuyerProfile(args.buyer);
  if (!buyer) return;

  const brief = getBrief(args.jobId);
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
    finalized: false,
    escrowFunded: false,
  };
  jobs.set(args.jobId, state);
  logger.info(
    { jobId: args.jobId, budget: state.context.budgetUsdc, buyer: buyer.displayName },
    'tracking job',
  );
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
  try {
    sellerReputationBps = Number(await reputation.read.getReputationScore([args.seller]));
  } catch {
    /* keep neutral */
  }

  const priceUsdc = formatUnits(args.price, USDC_DECIMALS);
  const bid: Bid = {
    seller: args.seller,
    priceUsdc,
    priceWei: args.price,
    deadlineUnix: Number(args.deadline),
  };

  const bidContext: BidContext = {
    seller: args.seller,
    priceUsdc,
    deadlineUnix: bid.deadlineUnix,
    sellerReputationBps,
  };

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
    logger.info({ jobId: state.jobId, seller: args.seller, score }, 'bid scored');
    bus.emitEvent({
      type: 'bid.scored',
      jobId: state.jobId,
      actor: 'buyer',
      payload: { seller: args.seller, priceUsdc, ...score },
    });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn(
      { jobId: state.jobId, seller: args.seller, err: message },
      'bid scoring failed',
    );
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

  const ranked = [...state.bids.values()]
    .filter((b) => typeof b.score === 'number')
    .sort((a, b) => b.score! - a.score!);

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

  const top = ranked[0]!;
  logger.info(
    { jobId: state.jobId, seller: top.seller, score: top.score, bids: ranked.length },
    'top bid picked, issuing counter',
  );

  await issueCounter(state, top);
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
      'LLM counter exceeds brief effective cap, skipping',
    );
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: bid.seller,
        reason: 'llm-counter-over-budget',
        detail: `${counterPrice} USDC exceeds the brief's ${effectiveCap} USDC effective cap`,
        counterPrice,
        effectiveCap,
      },
    });
    return;
  }

  const counterDeadlineUnix =
    Math.floor(Date.now() / 1000) + bid.suggestedCounterDeadlineDays * 86_400;
  const counterPriceWei = parseUnits(bid.suggestedCounterPrice, USDC_DECIMALS);

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
}

async function handleCounterResponse(log: Log) {
  const dedupeKey = logDedupeKey('CounterResponse', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: CounterResponseArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state || state.finalized) return;
  const buyer = state.buyer;

  if (args.accepted) {
    const agreedPriceUsdc = state.lastCounterPriceBySeller.get(args.seller) ?? '0';
    await proposeMatch(state, args.seller, agreedPriceUsdc);
    return;
  }

  const sellerCounterPrice = formatUnits(args.newPrice, USDC_DECIMALS);
  const sellerCounterDeadlineUnix = Number(args.newDeadline);
  const buyerLastCounter = state.lastCounterPriceBySeller.get(args.seller) ?? '0';
  const effectiveMaxAcceptable = computeBuyerEffectiveCap(state.context, buyer);

  let decision;
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
        ),
      }),
    );
    decision = result.object;
  } catch (err) {
    const message = (err as Error).message;
    logger.warn({ jobId: state.jobId, err: message }, 'counter eval failed');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.error',
      jobId: state.jobId,
      actor: 'buyer',
      payload: { seller: args.seller, scope: 'counterEvaluation', message },
    });
    return;
  }

  logger.info({ jobId: state.jobId, seller: args.seller, decision }, 'counter-response evaluated');

  if (decision.confidence < buyer.confidenceThreshold) {
    logger.info({ jobId: state.jobId }, 'low confidence, declining');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: args.seller,
        reason: 'low-confidence',
        detail: `confidence ${decision.confidence} is below the buyer's ${buyer.confidenceThreshold} threshold`,
        decision,
      },
    });
    return;
  }

  if (decision.decision === 'accept') {
    await proposeMatch(state, args.seller, sellerCounterPrice);
    return;
  }

  if (decision.decision === 'decline') {
    logger.info({ jobId: state.jobId }, 'declined seller counter');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: { seller: args.seller, reason: 'llm-decline', decision },
    });
    return;
  }

  const rounds = state.counterRoundsBySeller.get(args.seller) ?? 0;
  if (rounds >= buyer.maxCounterRounds) {
    logger.info({ jobId: state.jobId, rounds }, 'max counter rounds reached, declining');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.declined',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: args.seller,
        reason: 'max-counter-rounds',
        detail: `buyer hit the ${buyer.maxCounterRounds}-round counter cap`,
        rounds,
      },
    });
    return;
  }

  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn({ jobId: state.jobId }, 'counter requested without price/deadline');
    state.finalized = true;
    bus.emitEvent({
      type: 'agent.error',
      jobId: state.jobId,
      actor: 'buyer',
      payload: {
        seller: args.seller,
        scope: 'counterEvaluation',
        message: 'LLM asked for a counter but produced no counterPrice/counterDeadlineDays',
      },
    });
    return;
  }

  await issueCounter(state, {
    seller: args.seller,
    priceUsdc: sellerCounterPrice,
    priceWei: args.newPrice,
    deadlineUnix: sellerCounterDeadlineUnix,
    suggestedCounterPrice: decision.counterPrice,
    suggestedCounterDeadlineDays: decision.counterDeadlineDays,
  });
}

/// Classifies an agent chain failure into a structured event. INSUFFICIENT
/// balance/gas surfaces as `deal.fund.insufficient` so the buyer sees the same
/// banner + Telegram alert as the direct-deal flow; everything else falls
/// through as `agent.error` for the activity feed.
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

export interface MatchProposal {
  jobId: string;
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  agreedPriceUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  proposedAt: number;
  approvedAt?: number;
  declinedAt?: number;
}

const matchProposals = new Map<string, MatchProposal>();

export function getMatchProposal(jobId: string): MatchProposal | null {
  return matchProposals.get(jobId.toLowerCase()) ?? null;
}

export function listMatchProposalsForUser(userAddress: string): MatchProposal[] {
  const a = userAddress.toLowerCase();
  return [...matchProposals.values()].filter(
    (p) => p.buyerUser === a || p.sellerUser === a,
  );
}

export function listAllMatchProposals(): MatchProposal[] {
  return [...matchProposals.values()].sort((a, b) => b.proposedAt - a.proposedAt);
}

/// The agent has reached agreement with a seller. It does NOT touch the chain
/// here — it records a match proposal and notifies both parties. The buyer
/// human approves separately, which triggers acceptBid + fundEscrow.
async function proposeMatch(
  state: JobState,
  seller: `0x${string}`,
  agreedPriceUsdc: string,
) {
  state.finalized = true;
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
    };
    matchProposals.set(state.jobId.toLowerCase(), proposal);

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
  const proposal = getMatchProposal(jobId);
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
  await fundEscrow(state, seller, priceWei);

  // Persist a deal row so the post-funding flow (seller marks delivered, buyer
  // releases, dispute, auto-release) reuses the direct-deal mechanics.
  await persistApprovedMatch(proposal, state, acceptResult.txHash);

  proposal.approvedAt = Date.now();
  matchProposals.set(jobId.toLowerCase(), proposal);

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
export function declineAgentMatch(
  jobId: string,
  reason?: string,
): { ok: true } | { ok: false; code: string; message: string } {
  const proposal = getMatchProposal(jobId);
  if (!proposal) return { ok: false, code: 'NO_PROPOSAL', message: 'no match proposal for this job' };
  if (proposal.approvedAt) return { ok: false, code: 'ALREADY_APPROVED', message: 'match already approved' };
  if (proposal.declinedAt) return { ok: false, code: 'ALREADY_DECLINED', message: 'match already declined' };

  proposal.declinedAt = Date.now();
  matchProposals.set(jobId.toLowerCase(), proposal);
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
) {
  if (state.escrowFunded) return;
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
    return;
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
    return;
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
}

export interface BuyerJobSnapshot {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  finalized: boolean;
  escrowFunded: boolean;
  bids: Array<{
    seller: string;
    priceUsdc: string;
    deadlineUnix: number;
    score: number | null;
    suggestedCounterPrice: string | null;
    suggestedCounterDeadlineDays: number | null;
  }>;
  lastCounterPriceBySeller: Record<string, string>;
  counterRoundsBySeller: Record<string, number>;
}

/// Snapshot of tracked managed jobs. Pass a buyer agent address to scope it to
/// the jobs that agent posted.
export function getBuyerSnapshot(filterBuyerAddress?: string): { jobs: BuyerJobSnapshot[] } {
  const f = filterBuyerAddress?.toLowerCase();
  return {
    jobs: [...jobs.values()]
      .filter((s) => !f || s.context.buyer.toLowerCase() === f)
      .map((s) => ({
      jobId: s.jobId,
      buyer: s.context.buyer,
      budgetUsdc: s.context.budgetUsdc,
      deadlineUnix: s.context.deadlineUnix,
      termsHash: s.context.termsHash,
      finalized: s.finalized,
      escrowFunded: s.escrowFunded,
      bids: [...s.bids.values()].map((b) => ({
        seller: b.seller,
        priceUsdc: b.priceUsdc,
        deadlineUnix: b.deadlineUnix,
        score: b.score ?? null,
        suggestedCounterPrice: b.suggestedCounterPrice ?? null,
        suggestedCounterDeadlineDays: b.suggestedCounterDeadlineDays ?? null,
      })),
      lastCounterPriceBySeller: Object.fromEntries(s.lastCounterPriceBySeller),
      counterRoundsBySeller: Object.fromEntries(s.counterRoundsBySeller),
    })),
  };
}

export function getBuyerJob(jobId: string): BuyerJobSnapshot | null {
  const s = jobs.get(jobId as `0x${string}`);
  if (!s) return null;
  return getBuyerSnapshot().jobs.find((j) => j.jobId === jobId) ?? null;
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
  for (const log of logs) await handleJobPosted(log as unknown as Log);
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
