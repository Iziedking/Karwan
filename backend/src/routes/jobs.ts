import { Hono } from 'hono';
import { formatUnits, keccak256, parseUnits, toBytes, type Address } from 'viem';
import { z } from 'zod';
import { jobBoard } from '../chain/contracts.js';
import { publicClient, arcTestnet } from '../chain/client.js';
import { executeContractCall } from '../chain/txs.js';
import { getBuyerSnapshot, getBuyerJob } from '../agents/buyer.js';
import { resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = arcTestnet.nativeCurrency.decimals;

const postJobSchema = z.object({
  posterAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address'),
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
  let body;
  try {
    body = postJobSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  // Managed jobs run on the poster's own buyer agent, so they must have
  // activated and filled a buyer profile.
  const buyerProfile = await resolveBuyerProfileForUser(body.posterAddress);
  if (!buyerProfile) {
    return c.json(
      {
        error: 'buyer profile required',
        detail:
          'Activate your agent wallets and set up a buyer profile before posting a managed job.',
      },
      409,
    );
  }

  try {
    const balanceWei = await publicClient.getBalance({
      address: buyerProfile.address as Address,
    });
    const balanceUsdc = Number(formatUnits(balanceWei, NATIVE_DECIMALS));
    const headroom = body.budgetUsdc + 0.5;
    if (balanceUsdc < headroom) {
      return c.json(
        {
          error: 'insufficient buyer balance',
          detail: `Your buyer agent has ${balanceUsdc.toFixed(2)} USDC, this deal needs >= ${headroom.toFixed(2)} USDC (budget plus gas). Fund it from your profile page.`,
          balanceUsdc,
          budgetUsdc: body.budgetUsdc,
        },
        409,
      );
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'balance precheck skipped');
  }

  const jobId = keccak256(toBytes(`${body.brief}|${Date.now()}|${Math.random()}`));
  const budgetWei = parseUnits(body.budgetUsdc.toString(), USDC_DECIMALS);
  const deadlineUnix = Math.floor(Date.now() / 1000) + body.deadlineDays * 86_400;
  const termsHash = keccak256(toBytes(body.brief));

  try {
    const result = await executeContractCall(
      {
        walletId: buyerProfile.walletId,
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
