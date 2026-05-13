import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import { jobBoard, reputation } from '../chain/contracts.js';
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
import type { BuyerProfile } from './buyer-profile.js';

const USDC_DECIMALS = 18;

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
}

const jobs = new Map<`0x${string}`, JobState>();

export function startBuyerAgent(buyer: BuyerProfile) {
  logger.info(
    { buyer: buyer.displayName, address: buyer.address, jobBoard: jobBoard.address },
    'buyer agent starting',
  );

  const unwatchPosted = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: (logs) => {
      for (const log of logs) handleJobPosted(buyer, log);
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchBid = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'BidSubmitted',
    onLogs: async (logs) => {
      await Promise.all(logs.map((log) => handleBidSubmitted(buyer, log)));
    },
    onError: (err) => logger.error({ err: err.message }, 'BidSubmitted watch error'),
  });

  const unwatchCounter = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterResponse',
    onLogs: async (logs) => {
      await Promise.all(logs.map((log) => handleCounterResponse(buyer, log)));
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

function handleJobPosted(buyer: BuyerProfile, log: Log) {
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
  };
  jobs.set(args.jobId, state);
  logger.info({ jobId: args.jobId, budget: state.context.budgetUsdc }, 'tracking own job');
}

async function handleBidSubmitted(buyer: BuyerProfile, log: Log) {
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
  } catch (err) {
    logger.warn(
      { jobId: state.jobId, seller: args.seller, err: (err as Error).message },
      'bid scoring failed, keeping with no score',
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
    .sort((a, b) => (b.score! - a.score!));

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
    logger.warn(
      { jobId: state.jobId, counterPrice },
      'LLM counter exceeds buyer max budget, skipping',
    );
    return;
  }

  const counterDeadlineUnix =
    Math.floor(Date.now() / 1000) + bid.suggestedCounterDeadlineDays * 86_400;
  const counterPriceWei = parseUnits(bid.suggestedCounterPrice, USDC_DECIMALS);

  state.lastCounterPriceBySeller.set(bid.seller, bid.suggestedCounterPrice);
  state.counterRoundsBySeller.set(bid.seller, (state.counterRoundsBySeller.get(bid.seller) ?? 0) + 1);

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
}

async function handleCounterResponse(buyer: BuyerProfile, log: Log) {
  const args = (log as unknown as { args: CounterResponseArgs }).args;
  const state = jobs.get(args.jobId);
  if (!state || state.finalized) return;

  if (args.accepted) {
    await acceptBid(buyer, state, args.seller);
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
          maxBudgetUsdc: buyer.maxBudgetUsdc,
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
    logger.warn(
      { jobId: state.jobId, err: (err as Error).message },
      'counter evaluation LLM failed, declining',
    );
    state.finalized = true;
    return;
  }

  logger.info({ jobId: state.jobId, seller: args.seller, decision }, 'counter-response evaluated');

  if (decision.confidence < buyer.confidenceThreshold) {
    logger.info({ jobId: state.jobId, confidence: decision.confidence }, 'low confidence, declining');
    state.finalized = true;
    return;
  }

  if (decision.decision === 'accept') {
    await acceptBid(buyer, state, args.seller);
    return;
  }

  if (decision.decision === 'decline') {
    logger.info({ jobId: state.jobId, seller: args.seller }, 'declined seller counter');
    state.finalized = true;
    return;
  }

  // decision === 'counter'
  const rounds = state.counterRoundsBySeller.get(args.seller) ?? 0;
  if (rounds >= buyer.maxCounterRounds) {
    logger.info({ jobId: state.jobId, rounds }, 'max counter rounds reached, declining');
    state.finalized = true;
    return;
  }

  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn({ jobId: state.jobId }, 'counter requested without price/deadline, declining');
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

async function acceptBid(buyer: BuyerProfile, state: JobState, seller: `0x${string}`) {
  state.finalized = true;
  const result = await executeContractCall(
    {
      walletId: buyer.walletId,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'acceptBid(bytes32,address)',
      abiParameters: [state.jobId, seller],
    },
    `acceptBid(${state.jobId})`,
  );
  logger.info({ jobId: state.jobId, seller, ...result }, 'bid accepted on chain');
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
