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
import { bus } from '../events.js';
import type { SellerProfile } from './seller-profile.js';

// ERC-20 USDC on Arc uses 6 decimals (native gas interface uses 18). Bid amounts
// ride the ERC-20 rail because escrow.transferFrom is ERC-20.
const USDC_DECIMALS = 6;

interface ActiveBid {
  jobContext: JobContext;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
  responding: boolean;
}

const activeBids = new Map<`0x${string}`, ActiveBid>();
const seenJobs = new Set<string>();
const handledEvents = new Set<string>();

function logDedupeKey(label: string, log: Log): string {
  const tx = (log as unknown as { transactionHash?: string }).transactionHash ?? '';
  const idx = (log as unknown as { logIndex?: number }).logIndex ?? '';
  return `${label}:${tx}:${idx}`;
}

export function startSellerAgent(seller: SellerProfile) {
  logger.info(
    { seller: seller.displayName, address: seller.address, jobBoard: jobBoard.address },
    'seller agent starting',
  );

  const unwatchPosted = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: (logs) => {
      for (const log of logs) safe('JobPosted', () => handleJobPosted(seller, log));
    },
    onError: (err) => logger.error({ err: err.message }, 'JobPosted watch error'),
  });

  const unwatchCounter = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'CounterOfferIssued',
    onLogs: (logs) => {
      for (const log of logs) safe('CounterOfferIssued', () => handleCounterOffer(seller, log));
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

async function handleJobPosted(seller: SellerProfile, log: Log) {
  const dedupeKey = logDedupeKey('JobPosted', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

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

  const mismatch = profileMismatchReason(seller, job);
  if (mismatch) {
    logger.info({ jobId, reason: mismatch.reason }, 'skipping job');
    bus.emitEvent({
      type: 'agent.skipped',
      jobId,
      actor: 'seller',
      payload: mismatch,
    });
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
    bus.emitEvent({
      type: 'agent.skipped',
      jobId,
      actor: 'seller',
      payload: { reason: 'low-confidence-or-skip', decision },
    });
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
    responding: false,
  });

  logger.info({ jobId, ...txResult }, 'bid submitted');
  bus.emitEvent({
    type: 'bid.submitted',
    jobId,
    actor: 'seller',
    payload: {
      priceUsdc: decision.suggestedPrice,
      deadlineUnix,
      txHash: txResult.txHash,
    },
  });
}

async function handleCounterOffer(seller: SellerProfile, log: Log) {
  const args = (log as unknown as { args: CounterOfferIssuedArgs }).args;
  if (args.seller.toLowerCase() !== seller.address.toLowerCase()) return;

  const dedupeKey = logDedupeKey('CounterOfferIssued', log);
  if (handledEvents.has(dedupeKey)) return;
  handledEvents.add(dedupeKey);

  const active = activeBids.get(args.jobId);
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

  let decision;
  try {
    const result = await generateObject({
      model: llmModel,
      schema: counterEvaluationSchema,
      prompt: buildCounterEvaluationPrompt(
        active.jobContext,
        {
          side: 'seller',
          minAcceptablePriceUsdc: seller.minBudgetUsdc,
          maxAcceptablePriceUsdc: seller.maxBudgetUsdc,
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
  jobBuyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
}

export function getSellerSnapshot(): { activeBids: SellerActiveBidSnapshot[] } {
  return {
    activeBids: [...activeBids.entries()].map(([jobId, b]) => ({
      jobId,
      jobBuyer: b.jobContext.buyer,
      budgetUsdc: b.jobContext.budgetUsdc,
      deadlineUnix: b.jobContext.deadlineUnix,
      lastBidPrice: b.lastBidPrice,
      counterRounds: b.counterRounds,
      finalized: b.finalized,
    })),
  };
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
