import { generateObject } from 'ai';
import { formatUnits, parseUnits, type Log } from 'viem';
import { publicClient, wsClient } from '../chain/client.js';
import { jobBoard, reputation } from '../chain/contracts.js';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { executeContractCall } from '../chain/txs.js';
import { llmModel } from '../llm/client.js';
import { bidDecisionSchema } from '../llm/schemas.js';
import { buildBidEvaluationPrompt, type JobContext } from '../llm/prompts.js';
import { logger } from '../logger.js';
import type { SellerProfile } from './seller-profile.js';

const USDC_DECIMALS = 18;
const seen = new Set<string>();

export function startSellerAgent(seller: SellerProfile) {
  logger.info(
    { seller: seller.displayName, address: seller.address, jobBoard: jobBoard.address },
    'seller agent starting',
  );

  const unwatch = wsClient.watchContractEvent({
    address: jobBoard.address,
    abi: jobBoardAbi,
    eventName: 'JobPosted',
    onLogs: async (logs) => {
      await Promise.all(logs.map((log) => handleJobPosted(seller, log)));
    },
    onError: (err) => logger.error({ err: err.message }, 'watchContractEvent error'),
  });

  return () => {
    unwatch();
    logger.info('seller agent stopped');
  };
}

async function handleJobPosted(seller: SellerProfile, log: Log) {
  // viem decodes JobPosted into log.args when we use watchContractEvent with the typed ABI
  const args = (log as unknown as { args: JobPostedArgs }).args;
  const jobId = args.jobId;
  if (seen.has(jobId)) return;
  seen.add(jobId);

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

  const prompt = buildBidEvaluationPrompt(job, seller);
  let decision;
  try {
    const result = await generateObject({
      model: llmModel,
      schema: bidDecisionSchema,
      prompt,
    });
    decision = result.object;
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'llm output did not match schema, skipping');
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

  logger.info({ jobId, ...txResult }, 'bid submitted');
}

function matchesProfile(seller: SellerProfile, job: JobContext): boolean {
  const budget = Number(job.budgetUsdc);
  if (budget < seller.minBudgetUsdc || budget > seller.maxBudgetUsdc) return false;
  const daysToDeadline = (job.deadlineUnix - Math.floor(Date.now() / 1000)) / 86_400;
  if (daysToDeadline < seller.minDeadlineDays || daysToDeadline > seller.maxDeadlineDays) {
    return false;
  }
  // skills are matched semantically by the LLM, not by string compare
  return true;
}

interface JobPostedArgs {
  jobId: `0x${string}`;
  buyer: `0x${string}`;
  budget: bigint;
  deadline: bigint;
  termsHash: string;
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
  for (const log of logs) {
    await handleJobPosted(seller, log as unknown as Log);
  }
}
