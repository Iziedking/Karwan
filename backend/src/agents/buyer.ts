import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import { jobBoard, escrow, reputation, usdc as usdcAddress } from '../chain/contracts.js';
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

function logDedupeKey(label: string, log: Log): string {
  const tx = (log as unknown as { transactionHash?: string }).transactionHash ?? '';
  const idx = (log as unknown as { logIndex?: number }).logIndex ?? '';
  return `${label}:${tx}:${idx}`;
}

export function startBuyerAgent(buyer: BuyerProfile) {
  validateMilestonePcts(buyer.milestonePcts);
  logger.info(
    {
      buyer: buyer.displayName,
      address: buyer.address,
      jobBoard: jobBoard.address,
      escrow: escrow.address,
      milestonePcts: buyer.milestonePcts,
    },
    'buyer agent starting',
  );

  const unwatchPosted = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: (logs) => {
      for (const log of logs) safe('JobPosted', () => Promise.resolve(handleJobPosted(buyer, log)));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchBid = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'BidSubmitted',
    onLogs: (logs) => {
      for (const log of logs) safe('BidSubmitted', () => handleBidSubmitted(buyer, log));
    },
    onError: (err) => logger.error({ err: err.message }, 'BidSubmitted watch error'),
  });

  const unwatchCounter = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterResponse',
    onLogs: (logs) => {
      for (const log of logs) safe('CounterResponse', () => handleCounterResponse(buyer, log));
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

function validateMilestonePcts(pcts: number[]) {
  if (pcts.length < 1 || pcts.length > 4) {
    throw new Error(`milestonePcts length must be 1..4, got ${pcts.length}`);
  }
  const sum = pcts.reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error(`milestonePcts must sum to 100, got ${sum}`);
}

function handleJobPosted(buyer: BuyerProfile, log: Log) {
  const dedupeKey = logDedupeKey('JobPosted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: JobPostedArgs }).args;
  if (args.buyer.toLowerCase() !== buyer.address.toLowerCase()) return;
  if (jobs.has(args.jobId)) return;

  const state: JobState = {
    jobId: args.jobId,
    context: {
      jobId: args.jobId,
      buyer: args.buyer,
      budgetUsdc: formatUnits(args.budget, USDC_DECIMALS),
      deadlineUnix: Number(args.deadline),
      termsHash: args.termsHash,
      buyerReputationBps: 5000,
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
  logger.info({ jobId: args.jobId, budget: state.context.budgetUsdc }, 'tracking own job');
  bus.emitEvent({
    type: 'job.tracked',
    jobId: args.jobId,
    actor: 'buyer',
    payload: { budgetUsdc: state.context.budgetUsdc, deadlineUnix: state.context.deadlineUnix },
  });
}

async function handleBidSubmitted(buyer: BuyerProfile, log: Log) {
  const dedupeKey = logDedupeKey('BidSubmitted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: BidSubmittedArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state || state.finalized) return;
  if (state.bids.has(args.seller)) return;

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
    const { object: score } = await generateObject({
      model: llmModel,
      schema: bidScoreSchema,
      prompt: buildBidRankingPrompt(state.context, bidContext, buyer),
    });
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
    logger.warn(
      { jobId: state.jobId, seller: args.seller, err: (err as Error).message },
      'bid scoring failed',
    );
  }

  state.bids.set(args.seller, bid);

  if (!state.collectionTimer && !state.collectionFired) {
    state.collectionTimer = setTimeout(
      () => finalizeBidCollection(buyer, state),
      buyer.bidCollectionSeconds * 1000,
    );
    logger.info(
      { jobId: state.jobId, waitSec: buyer.bidCollectionSeconds },
      'first bid received, starting collection window',
    );
  }
}

async function finalizeBidCollection(buyer: BuyerProfile, state: JobState) {
  if (state.collectionFired || state.finalized) return;
  state.collectionFired = true;
  state.collectionTimer = null;

  const ranked = [...state.bids.values()]
    .filter((b) => typeof b.score === 'number')
    .sort((a, b) => b.score! - a.score!);

  if (ranked.length === 0) {
    logger.warn({ jobId: state.jobId }, 'no scored bids — nothing to counter');
    return;
  }

  const top = ranked[0]!;
  logger.info(
    { jobId: state.jobId, seller: top.seller, score: top.score, bids: ranked.length },
    'top bid picked, issuing counter',
  );

  await issueCounter(buyer, state, top);
}

async function issueCounter(buyer: BuyerProfile, state: JobState, bid: Bid) {
  if (!bid.suggestedCounterPrice || !bid.suggestedCounterDeadlineDays) {
    logger.warn({ jobId: state.jobId }, 'bid missing counter suggestion');
    return;
  }

  const counterPrice = Number(bid.suggestedCounterPrice);
  if (counterPrice > buyer.maxBudgetUsdc) {
    logger.warn({ jobId: state.jobId, counterPrice }, 'LLM counter exceeds buyer max, skipping');
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

async function handleCounterResponse(buyer: BuyerProfile, log: Log) {
  const dedupeKey = logDedupeKey('CounterResponse', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const args = (log as unknown as { args: CounterResponseArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state || state.finalized) return;

  if (args.accepted) {
    const agreedPriceUsdc = state.lastCounterPriceBySeller.get(args.seller) ?? '0';
    await acceptAndFund(buyer, state, args.seller, agreedPriceUsdc);
    return;
  }

  const sellerCounterPrice = formatUnits(args.newPrice, USDC_DECIMALS);
  const sellerCounterDeadlineUnix = Number(args.newDeadline);
  const buyerLastCounter = state.lastCounterPriceBySeller.get(args.seller) ?? '0';

  let decision;
  try {
    const result = await generateObject({
      model: llmModel,
      schema: counterEvaluationSchema,
      prompt: buildCounterEvaluationPrompt(
        state.context,
        {
          side: 'buyer',
          minAcceptablePriceUsdc: 0,
          maxAcceptablePriceUsdc: buyer.maxBudgetUsdc,
          minDeadlineDays: buyer.minDeadlineDays,
          maxDeadlineDays: buyer.maxDeadlineDays,
        },
        buyerLastCounter,
        sellerCounterPrice,
        sellerCounterDeadlineUnix,
      ),
    });
    decision = result.object;
  } catch (err) {
    logger.warn({ jobId: state.jobId, err: (err as Error).message }, 'counter eval failed');
    state.finalized = true;
    return;
  }

  logger.info({ jobId: state.jobId, seller: args.seller, decision }, 'counter-response evaluated');

  if (decision.confidence < buyer.confidenceThreshold) {
    logger.info({ jobId: state.jobId }, 'low confidence, declining');
    state.finalized = true;
    return;
  }

  if (decision.decision === 'accept') {
    await acceptAndFund(buyer, state, args.seller, sellerCounterPrice);
    return;
  }

  if (decision.decision === 'decline') {
    logger.info({ jobId: state.jobId }, 'declined seller counter');
    state.finalized = true;
    return;
  }

  const rounds = state.counterRoundsBySeller.get(args.seller) ?? 0;
  if (rounds >= buyer.maxCounterRounds) {
    logger.info({ jobId: state.jobId, rounds }, 'max counter rounds reached, declining');
    state.finalized = true;
    return;
  }

  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn({ jobId: state.jobId }, 'counter requested without price/deadline');
    state.finalized = true;
    return;
  }

  await issueCounter(buyer, state, {
    seller: args.seller,
    priceUsdc: sellerCounterPrice,
    priceWei: args.newPrice,
    deadlineUnix: sellerCounterDeadlineUnix,
    suggestedCounterPrice: decision.counterPrice,
    suggestedCounterDeadlineDays: decision.counterDeadlineDays,
  });
}

async function acceptAndFund(
  buyer: BuyerProfile,
  state: JobState,
  seller: `0x${string}`,
  agreedPriceUsdc: string,
) {
  state.finalized = true;

  const acceptResult = await executeContractCall(
    {
      walletId: buyer.walletId,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'acceptBid(bytes32,address)',
      abiParameters: [state.jobId, seller],
    },
    `acceptBid(${state.jobId})`,
  );
  logger.info({ jobId: state.jobId, seller, ...acceptResult }, 'bid accepted on chain');
  bus.emitEvent({
    type: 'bid.accepted',
    jobId: state.jobId,
    actor: 'buyer',
    payload: { seller, agreedPriceUsdc, txHash: acceptResult.txHash },
  });

  const priceWei = parseUnits(agreedPriceUsdc, USDC_DECIMALS);
  await fundEscrow(buyer, state, seller, priceWei);
}

async function fundEscrow(
  buyer: BuyerProfile,
  state: JobState,
  seller: `0x${string}`,
  priceWei: bigint,
) {
  if (state.escrowFunded) return;

  const approveResult = await executeContractCall(
    {
      walletId: buyer.walletId,
      contractAddress: usdcAddress,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [escrow.address, priceWei.toString()],
    },
    `usdc.approve(escrow, ${state.jobId})`,
  );
  logger.info({ jobId: state.jobId, ...approveResult }, 'usdc approved for escrow');
  bus.emitEvent({
    type: 'escrow.approved',
    jobId: state.jobId,
    actor: 'buyer',
    payload: { amountWei: priceWei.toString(), txHash: approveResult.txHash },
  });

  const fundResult = await executeContractCall(
    {
      walletId: buyer.walletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[])',
      abiParameters: [state.jobId, seller, priceWei.toString(), buyer.milestonePcts],
    },
    `fundEscrow(${state.jobId})`,
  );
  state.escrowFunded = true;
  logger.info(
    {
      jobId: state.jobId,
      seller,
      amountWei: priceWei.toString(),
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

export function getBuyerSnapshot(): { jobs: BuyerJobSnapshot[] } {
  return {
    jobs: [...jobs.values()].map((s) => ({
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

export async function backfillRecentJobsForBuyer(buyer: BuyerProfile, fromBlock?: bigint) {
  const latest = await publicClient.getBlockNumber();
  const from = fromBlock ?? (latest > 10_000n ? latest - 10_000n : 0n);
  const logs = await publicClient.getLogs({
    address: jobBoard.address,
    event: jobBoardAbi.find((x) => x.type === 'event' && x.name === 'JobPosted')! as never,
    fromBlock: from,
    toBlock: latest,
  });
  logger.info({ count: logs.length }, 'buyer backfilling own jobs');
  for (const log of logs) handleJobPosted(buyer, log as unknown as Log);
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
