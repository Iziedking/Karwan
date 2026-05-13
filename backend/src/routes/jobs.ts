import { Hono } from 'hono';
import { formatUnits, keccak256, parseUnits, toBytes, type Address } from 'viem';
import { z } from 'zod';
import { config } from '../config.js';
import { jobBoard } from '../chain/contracts.js';
import { publicClient, arcTestnet } from '../chain/client.js';
import { executeContractCall } from '../chain/txs.js';
import { getBuyerSnapshot, getBuyerJob } from '../agents/buyer.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = arcTestnet.nativeCurrency.decimals;

const postJobSchema = z.object({
  brief: z.string().min(5).max(500),
  budgetUsdc: z.number().positive().max(5_000_000),
  deadlineDays: z.number().int().min(1).max(90),
});

export const jobsRoutes = new Hono();

jobsRoutes.get('/', (c) => c.json(getBuyerSnapshot()));

jobsRoutes.get('/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = getBuyerJob(jobId);
  if (!job) return c.json({ error: 'not found' }, 404);
  return c.json(job);
});

jobsRoutes.post('/', async (c) => {
  if (!config.BUYER_AGENT_WALLET_ID) {
    return c.json({ error: 'BUYER_AGENT_WALLET_ID not configured' }, 500);
  }

  let body;
  try {
    body = postJobSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  if (config.BUYER_AGENT_ADDRESS) {
    try {
      const balanceWei = await publicClient.getBalance({
        address: config.BUYER_AGENT_ADDRESS as Address,
      });
      const balanceUsdc = Number(formatUnits(balanceWei, NATIVE_DECIMALS));
      const headroom = body.budgetUsdc + 0.5;
      if (balanceUsdc < headroom) {
        return c.json(
          {
            error: 'insufficient buyer balance',
            detail: `Buyer wallet has ${balanceUsdc.toFixed(2)} USDC, deal needs >= ${headroom.toFixed(2)} USDC (budget plus gas). Top up at https://faucet.circle.com.`,
            balanceUsdc,
            budgetUsdc: body.budgetUsdc,
          },
          409,
        );
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'balance precheck skipped');
    }
  }

  const jobId = keccak256(toBytes(`${body.brief}|${Date.now()}|${Math.random()}`));
  const budgetWei = parseUnits(body.budgetUsdc.toString(), USDC_DECIMALS);
  const deadlineUnix = Math.floor(Date.now() / 1000) + body.deadlineDays * 86_400;
  const termsHash = keccak256(toBytes(body.brief));

  try {
    const result = await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID,
        contractAddress: jobBoard.address,
        abiFunctionSignature: 'postJob(bytes32,uint256,uint64,string)',
        abiParameters: [jobId, budgetWei.toString(), deadlineUnix.toString(), termsHash],
      },
      `postJob(${jobId})`,
    );
    return c.json({ jobId, deadlineUnix, ...result });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'postJob failed');
    return c.json({ error: 'postJob failed', detail: (err as Error).message }, 502);
  }
});
