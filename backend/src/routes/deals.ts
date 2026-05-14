import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { parseUnits, formatUnits } from 'viem';
import { config } from '../config.js';
import {
  escrow,
  usdc as usdcAddress,
  readEscrow,
  getEscrowFeeBps,
  computeFunding,
} from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import {
  releaseMilestone,
  finalizeIfSettled,
  ESCROW_FUNDED,
} from '../chain/settlement.js';
import { createDeal, getDeal, patchDeal, listDealsForAddress } from '../db/deals.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

// ERC-20 USDC on Arc uses 6 decimals for escrow accounting.
const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const createSchema = z.object({
  buyerAddress: addrSchema,
  sellerAddress: addrSchema,
  dealAmountUsdc: z.number().positive(),
  deadlineDays: z.number().int().min(1).max(180),
  terms: z.string().min(1).max(600),
  firstReleasePct: z.number().int().min(1).max(99),
});

const callerSchema = z.object({ caller: addrSchema });

const inFlight = new Set<string>();

export const dealsRoutes = new Hono();

/// Create and fund a direct deal. The buyer agent funds the escrow naming the
/// seller wallet directly — no auction, no bidding.
dealsRoutes.post('/direct', async (c) => {
  if (!config.BUYER_AGENT_WALLET_ID) {
    return c.json({ error: 'BUYER_AGENT_WALLET_ID not configured' }, 500);
  }

  let body;
  try {
    body = createSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.buyerAddress.toLowerCase() === body.sellerAddress.toLowerCase()) {
    return c.json({ error: 'buyer and seller must be different wallets' }, 400);
  }

  const jobId = `0x${randomBytes(32).toString('hex')}`;
  const milestonePcts = [body.firstReleasePct, 100 - body.firstReleasePct];
  const dealAmountWei = parseUnits(body.dealAmountUsdc.toString(), USDC_DECIMALS);
  const feeBps = await getEscrowFeeBps();
  const { fundedAmount, sellerNet, feeTotal } = computeFunding(dealAmountWei, feeBps);

  try {
    // The escrow pulls dealAmount + the buyer's fee half on fundEscrow.
    await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [escrow.address, fundedAmount.toString()],
      },
      `usdc.approve(escrow, direct ${jobId})`,
    );
    const fundResult = await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID,
        contractAddress: escrow.address,
        abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[])',
        abiParameters: [
          jobId,
          body.sellerAddress,
          dealAmountWei.toString(),
          milestonePcts,
        ],
      },
      `fundEscrow(direct ${jobId})`,
    );

    const deadlineUnix = Math.floor(Date.now() / 1000) + body.deadlineDays * 86400;
    const deal = createDeal({
      jobId,
      buyer: body.buyerAddress,
      seller: body.sellerAddress,
      dealAmountUsdc: body.dealAmountUsdc.toString(),
      firstReleasePct: body.firstReleasePct,
      deadlineUnix,
      terms: body.terms,
      fundTxHash: fundResult.txHash,
    });

    bus.emitEvent({
      type: 'deal.direct.created',
      jobId,
      actor: 'buyer',
      payload: {
        buyer: body.buyerAddress,
        seller: body.sellerAddress,
        dealAmountUsdc: body.dealAmountUsdc.toString(),
        firstReleasePct: body.firstReleasePct,
        txHash: fundResult.txHash,
      },
    });

    logger.info({ jobId, ...fundResult }, 'direct deal funded');
    return c.json(
      {
        deal,
        funding: {
          dealAmountUsdc: body.dealAmountUsdc.toString(),
          fundedAmountUsdc: formatUnits(fundedAmount, USDC_DECIMALS),
          sellerNetUsdc: formatUnits(sellerNet, USDC_DECIMALS),
          feeTotalUsdc: formatUnits(feeTotal, USDC_DECIMALS),
        },
        txHash: fundResult.txHash,
      },
      200,
    );
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'direct deal funding failed');
    return c.json({ error: 'funding failed', detail: (err as Error).message }, 502);
  }
});

/// List direct deals where the address is buyer or seller, enriched with the
/// current on-chain escrow state.
dealsRoutes.get('/direct', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);

  const deals = listDealsForAddress(parsed.data);
  const enriched = await Promise.all(deals.map((d) => enrich(d)));
  return c.json({ deals: enriched });
});

dealsRoutes.get('/direct/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  return c.json({ deal: await enrich(deal) });
});

/// Seller marks the work delivered. Releases the first milestone to the seller.
dealsRoutes.post('/direct/:jobId/delivered', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can mark this deal delivered' }, 403);
  }
  if (deal.delivered) {
    return c.json({ error: 'deal already marked delivered' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'a release is already in progress for this deal' }, 409);
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow state must be Funded(1), got ${account.state}` }, 409);
  }

  inFlight.add(jobId);
  try {
    const txHash = await releaseMilestone(jobId, 0);
    patchDeal(jobId, { delivered: true, deliveredAt: Date.now() });
    bus.emitEvent({
      type: 'deal.delivered',
      jobId,
      actor: 'seller',
      payload: { seller: deal.seller, firstReleasePct: deal.firstReleasePct, txHash },
    });
    return c.json({ accepted: true, jobId, txHash }, 200);
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'mark delivered failed');
    return c.json({ error: 'release failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer verifies the work and releases the final milestone, settling the deal.
dealsRoutes.post('/direct/:jobId/release', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can release this deal' }, 403);
  }
  if (!deal.delivered) {
    return c.json({ error: 'seller has not marked the work delivered yet' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'a release is already in progress for this deal' }, 409);
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow state must be Funded(1), got ${account.state}` }, 409);
  }

  inFlight.add(jobId);
  try {
    const txHash = await releaseMilestone(jobId, account.milestonesReleased);
    await finalizeIfSettled(jobId);
    patchDeal(jobId, { settledAt: Date.now() });
    return c.json({ accepted: true, jobId, txHash }, 200);
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'release failed');
    return c.json({ error: 'release failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

async function enrich(deal: ReturnType<typeof getDeal> & object) {
  try {
    const account = await readEscrow(deal.jobId);
    return {
      ...deal,
      onChain: {
        state: account.state,
        milestonesReleased: account.milestonesReleased,
        dealAmountWei: account.dealAmount.toString(),
        sellerNetWei: account.sellerNet.toString(),
        feeTotalWei: account.feeTotal.toString(),
        releasedWei: account.released.toString(),
      },
    };
  } catch {
    return { ...deal, onChain: null };
  }
}
