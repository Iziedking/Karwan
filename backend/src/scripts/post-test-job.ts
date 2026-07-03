import { encodeAbiParameters, keccak256, parseUnits, toBytes, type Address } from 'viem';
import { config } from '../config.js';
import { jobBoard } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { logger } from '../logger.js';

// ERC-20 USDC on Arc uses 6 decimals.
const USDC_DECIMALS = 6;

async function main() {
  if (!config.BUYER_AGENT_WALLET_ID) throw new Error('BUYER_AGENT_WALLET_ID required');
  if (!config.BUYER_AGENT_ADDRESS) throw new Error('BUYER_AGENT_ADDRESS required (jobId derivation)');

  const brief = process.env.JOB_BRIEF ?? `Need a Next.js landing page for a UAE SaaS. ${Date.now()}`;
  const budget = process.env.JOB_BUDGET_USDC ?? '500';
  const daysToDeadline = Number(process.env.JOB_DEADLINE_DAYS ?? '14');

  // L-1: the JobBoard derives jobId = keccak256(msg.sender, salt). Pass a salt;
  // derive the same id off-chain from the signer (buyer agent) address.
  const salt = keccak256(toBytes(`${brief}|${Date.now()}`));
  const jobId = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [config.BUYER_AGENT_ADDRESS as Address, salt],
    ),
  );
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
      abiParameters: [salt, budgetWei.toString(), deadlineUnix.toString(), termsHash],
    },
    `postJob(${jobId})`,
  );

  logger.info({ jobId, ...result }, 'job posted');
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'post-test-job failed');
  process.exit(1);
});
