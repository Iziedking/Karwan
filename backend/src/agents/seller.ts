import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import { jobBoard, reputation } from '../chain/contracts.js';
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
import type { SellerProfile } from './seller-profile.js';

const USDC_DECIMALS = 18;

interface ActiveBid {
  jobContext: JobContext;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
}

const activeBids = new Map<`0x${string}`, ActiveBid>();
const seenJobs = new Set<string>();

export function startSellerAgent(seller: SellerProfile) {
  logger.info(
    { seller: seller.displayName, address: seller.address, jobBoard: jobBoard.address },
    'seller agent starting',
  );

  const unwatchPosted = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: async (logs) => {
      await Promise.all(logs.map((log) => handleJobPosted(seller, log)));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchCounter = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterOfferIssued',
    onLogs: async (logs) => {
      await Promise.all(logs.map((log) => handleCounterOffer(seller, log)));
    },
    onError: (err) => logger.error({ err: err.message }, 'CounterOfferIssued watch error'),
  });

  return () => {
    unwatchPosted();
    unwatchCounter();
    logger.info('seller agent stopped');
  };
}

async function handleJobPosted(seller: SellerProfile, log: Log) {
  const args = (log as unknown as { args: JobPostedArgs }).args;
  const jobId = args.jobId;
  if (seenJobs.has(jobId)) return;
  seenJobs.add(jobId);

  const job: JobContext = {
    jobId,
    buyer: args.buyer,
    budgetUsdc: formatUnits(args.budget, USDC_DECIMALS),
    deadlineUnix: Number(args.deadline),
    termsHash: args.termsHash,
    buyerReputationBps: 5000,
  };

  if (!matchesProfile(seller, job)) {
    logger.info({ jobId, reason: 'profile-mismatch' }, 'skipping job');
    return;
  }

  try {
    job.buyerReputationBps = Number(
      await reputation.read.getReputationScore([args.buyer as `0x${string}`]),
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'reputation lookup failed, using neutral');
  }

  if (job.buyerReputationBps < 3000) {
    logger.info({ jobId, score: job.buyerReputationBps }, 'skipping: buyer reputation too low');
    return;
  }

  let decision;
  try {
    const result = await generateObject({
      model: llmModel,
      schema: bidDecisionSchema,
      prompt: buildBidEvaluationPrompt(job, seller),
    });
    decision = result.object;
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'llm output did not match schema');
    return;
  }

  logger.info({ jobId, decision }, 'llm decision');

  if (decision.decision === 'skip' || decision.confidence < seller.confidenceThreshold) {
    logger.info({ jobId, confidence: decision.confidence }, 'skipping: low confidence');
    return;
  }

  const priceUsdc = Number(decision.suggestedPrice);
  if (priceUsdc < seller.minBudgetUsdc || priceUsdc > seller.maxBudgetUsdc) {
    logger.warn({ jobId, priceUsdc }, 'skipping: LLM price outside seller range');
    return;
  }

  const proposedDeadline =
    Math.floor(Date.now() / 1000) + decision.suggestedDeadlineDays * 86_400;
  const deadlineUnix = Math.min(proposedDeadline, job.deadlineUnix);
  const priceWei = parseUnits(decision.suggestedPrice, USDC_DECIMALS);

  const txResult = await executeContractCall(
    {
      walletId: seller.walletId,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'submitBid(bytes32,uint256,uint64)',
      abiParameters: [jobId, priceWei.toString(), deadlineUnix.toString()],
    },
    `submitBid(${jobId})`,
  );

  activeBids.set(jobId, {
    jobContext: job,
    lastBidPrice: decision.suggestedPrice,
    counterRounds: 0,
    finalized: false,
  });

  logger.info({ jobId, ...txResult }, 'bid submitted');
}

async function handleCounterOffer(seller: SellerProfile, log: Log) {
  const args = (log as unknown as { args: CounterOfferIssuedArgs }).args;
  if (args.seller.toLowerCase() !== seller.address.toLowerCase()) return;

  const active = activeBids.get(args.jobId);
  if (!active || active.finalized) return;

  const buyerCounterPrice = formatUnits(args.newPrice, USDC_DECIMALS);
  const buyerCounterDeadlineUnix = Number(args.newDeadline);

  let decision;
  try {
    const result = await generateObject({
      model: llmModel,
      schema: counterEvaluationSchema,
      prompt: buildCounterEvaluationPrompt(
        active.jobContext,
        {
          side: 'seller',
          maxBudgetUsdc: seller.maxBudgetUsdc,
          minDeadlineDays: seller.minDeadlineDays,
          maxDeadlineDays: seller.maxDeadlineDays,
        },
        active.lastBidPrice,
        buyerCounterPrice,
        buyerCounterDeadlineUnix,
      ),
    });
    decision = result.object;
  } catch (err) {
    logger.warn(
      { jobId: args.jobId, err: (err as Error).message },
      'counter evaluation failed, declining via no-op',
    );
    active.finalized = true;
    return;
  }

  logger.info({ jobId: args.jobId, decision }, 'counter-offer evaluated');

  if (decision.decision === 'accept') {
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
    return;
  }

  if (decision.decision === 'decline') {
    logger.info({ jobId: args.jobId }, 'declined buyer counter');
    active.finalized = true;
    return;
  }

  active.counterRounds += 1;
  if (active.counterRounds > 2) {
    logger.info({ jobId: args.jobId }, 'too many counter rounds, declining');
    active.finalized = true;
    return;
  }

  if (!decision.counterPrice || !decision.counterDeadlineDays) {
    logger.warn({ jobId: args.jobId }, 'counter requested without price/deadline');
    active.finalized = true;
    return;
  }

  const counterPriceUsdc = Number(decision.counterPrice);
  if (counterPriceUsdc < seller.minBudgetUsdc || counterPriceUsdc > seller.maxBudgetUsdc) {
    logger.warn(
      { jobId: args.jobId, counterPriceUsdc },
      'LLM counter outside seller range, declining',
    );
    active.finalized = true;
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
}

function matchesProfile(seller: SellerProfile, job: JobContext): boolean {
  const budget = Number(job.budgetUsdc);
  if (budget < seller.minBudgetUsdc || budget > seller.maxBudgetUsdc) return false;
  const daysToDeadline = (job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400;
  if (daysToDeadline < seller.minDeadlineDays || daysToDeadline > seller.maxDeadlineDays) {
    return false;
  }
  return true;
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

export async function backfillRecentJobs(seller: SellerProfile, fromBlock?: bigint) {
  const latest = await publicClient.getBlockNumber();
  const from = fromBlock ?? (latest > 10_000n ? latest - 10_000n : 0n);
  const logs = await publicClient.getLogs({
    address: jobBoard.address,
    event: jobBoardAbi.find((x) => x.type === 'event' && x.name === 'JobPosted')! as never,
    fromBlock: from,
    toBlock: latest,
  });
  logger.info({ count: logs.length, fromBlock: from.toString() }, 'backfilling jobs');
  for (const log of logs) await handleJobPosted(seller, log as unknown as Log);
}
