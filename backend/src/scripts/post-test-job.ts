import { keccak256, parseUnits, toBytes } from 'viem';
import { config } from '../config.js';
import { jobBoard } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { logger } from '../logger.js';

// ERC-20 USDC on Arc uses 6 decimals.
const USDC_DECIMALS = 6;

async function main() {
  if (!config.BUYER_AGENT_WALLET_ID) throw new Error('BUYER_AGENT_WALLET_ID required');

  const brief = process.env.JOB_BRIEF ?? `Need a Next.js landing page for a UAE SaaS. ${Date.now()}`;
  const budget = process.env.JOB_BUDGET_USDC ?? '500';
  const daysToDeadline = Number(process.env.JOB_DEADLINE_DAYS ?? '14');

  const jobId = keccak256(toBytes(`${brief}|${Date.now()}`));
  const budgetWei = parseUnits(budget, USDC_DECIMALS);
  const deadlineUnix = Math.floor(Date.now() / 1000) + daysToDeadline * 86_400;
  const termsHash = keccak256(toBytes(brief));

  logger.info(
    { jobId, brief, budget, deadlineUnix, termsHash, jobBoard: jobBoard.address },
    'posting job',
  );

  const result = await executeContractCall(
    {
      walletId: config.BUYER_AGENT_WALLET_ID,
      contractAddress: jobBoard.address,
      abiFunctionSignature: 'postJob(bytes32,uint256,uint64,string)',
      abiParameters: [jobId, budgetWei.toString(), deadlineUnix.toString(), termsHash],
    },
    `postJob(${jobId})`,
  );

  logger.info({ jobId, ...result }, 'job posted');
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'post-test-job failed');
  process.exit(1);
});
