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
  recordReputation,
  ESCROW_FUNDED,
  OUTCOME_FAILED,
  OUTCOME_DISPUTE_RESOLVED,
} from '../chain/settlement.js';
import {
  createDeal,
  getDeal,
  patchDeal,
  listDealsForAddress,
  type DirectDeal,
} from '../db/deals.js';
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
const deliveredSchema = z.object({
  caller: addrSchema,
  deliveryProof: z.string().min(1).max(600).optional(),
});
const appealSchema = z.object({
  caller: addrSchema,
  reason: z.string().min(1).max(400).optional(),
});

const inFlight = new Set<string>();

export const dealsRoutes = new Hono();

/// Create and fund a direct deal. The buyer agent funds the escrow naming the
/// seller wallet directly, no auction, no bidding.
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
    const deal = await createDeal({
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

  const deals = await listDealsForAddress(parsed.data);
  const enriched = await Promise.all(deals.map((d) => enrich(d)));
  return c.json({ deals: enriched });
});

dealsRoutes.get('/direct/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  return c.json({ deal: await enrich(deal) });
});

/// Seller confirms they agree to the deal terms. A deal cannot be marked
/// delivered until it has been accepted.
dealsRoutes.post('/direct/:jobId/accept', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can accept this deal' }, 403);
  }
  if (deal.acceptedAt) {
    return c.json({ error: 'deal already accepted' }, 409);
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow state must be Funded(1), got ${account.state}` }, 409);
  }

  await patchDeal(jobId, { acceptedAt: Date.now() });
  bus.emitEvent({
    type: 'deal.accepted',
    jobId,
    actor: 'seller',
    payload: { seller: deal.seller, buyer: deal.buyer },
  });
  return c.json({ accepted: true, jobId }, 200);
});

/// Seller marks the work delivered, optionally with a deliverable reference.
/// This only gates the buyer's releases; it does not move funds.
dealsRoutes.post('/direct/:jobId/delivered', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = deliveredSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can mark this deal delivered' }, 403);
  }
  if (!deal.acceptedAt) {
    return c.json({ error: 'accept the deal terms before marking it delivered' }, 409);
  }
  if (deal.delivered) {
    return c.json({ error: 'deal already marked delivered' }, 409);
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow state must be Funded(1), got ${account.state}` }, 409);
  }

  await patchDeal(jobId, {
    delivered: true,
    deliveredAt: Date.now(),
    ...(body.deliveryProof ? { deliveryProof: body.deliveryProof } : {}),
  });
  bus.emitEvent({
    type: 'deal.delivered',
    jobId,
    actor: 'seller',
    payload: { seller: deal.seller, firstReleasePct: deal.firstReleasePct },
  });
  return c.json({ accepted: true, jobId }, 200);
});

/// Buyer releases the next milestone. After the seller marks delivered, the
/// buyer calls this twice: first to release the on-delivery slice, then again
/// to verify and release the remainder, which settles the deal.
dealsRoutes.post('/direct/:jobId/release', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
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
    const releasedIndex = account.milestonesReleased;
    const txHash = await releaseMilestone(jobId, releasedIndex);
    const settled = await finalizeIfSettled(jobId);
    if (settled) {
      await patchDeal(jobId, { settledAt: Date.now() });
    } else if (releasedIndex === 0) {
      // First milestone is out. Open the buyer's review window for the rest.
      const startedAt = Date.now();
      await patchDeal(jobId, { reviewWindowStartedAt: startedAt });
      bus.emitEvent({
        type: 'deal.review.started',
        jobId,
        actor: 'buyer',
        payload: {
          buyer: deal.buyer,
          seller: deal.seller,
          windowMs: config.DEAL_REVIEW_WINDOW_MS,
          startedAt,
        },
      });
    }
    return c.json({ accepted: true, jobId, txHash, settled }, 200);
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'release failed');
    return c.json({ error: 'release failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer tips that they are still reviewing the work. Each tip adds a fixed
/// extension to the final-release window rather than pausing the timer, capped
/// at DEAL_MAX_REVIEW_EXTENSIONS.
dealsRoutes.post('/direct/:jobId/still-reviewing', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can extend the review window' }, 403);
  }
  if (!deal.reviewWindowStartedAt) {
    return c.json({ error: 'review window has not started' }, 409);
  }
  const extensionCount = deal.reviewExtensionCount ?? 0;
  if (extensionCount >= config.DEAL_MAX_REVIEW_EXTENSIONS) {
    return c.json(
      { error: `the review window can be extended at most ${config.DEAL_MAX_REVIEW_EXTENSIONS} times` },
      409,
    );
  }

  const reviewExtensionMs = (deal.reviewExtensionMs ?? 0) + config.DEAL_REVIEW_EXTENSION_MS;
  await patchDeal(jobId, { reviewExtensionMs, reviewExtensionCount: extensionCount + 1 });
  bus.emitEvent({
    type: 'deal.review.heartbeat',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      extendedByMs: config.DEAL_REVIEW_EXTENSION_MS,
      totalExtensionMs: reviewExtensionMs,
    },
  });
  return c.json({ accepted: true, jobId, reviewExtensionMs }, 200);
});

/// Seller appeals: the buyer has not released the final milestone and the
/// review window has passed with the buyer still reviewing. Moves the escrow to
/// Disputed on chain via the buyer agent as relayer.
dealsRoutes.post('/direct/:jobId/appeal', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = appealSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can appeal this deal' }, 403);
  }
  if (deal.disputed) {
    return c.json({ error: 'deal is already in dispute' }, 409);
  }
  if (!deal.reviewWindowStartedAt) {
    return c.json({ error: 'the buyer has not started releasing yet' }, 409);
  }
  const windowPassed =
    Date.now() - deal.reviewWindowStartedAt > config.DEAL_REVIEW_WINDOW_MS;
  if (!windowPassed) {
    return c.json({ error: 'the buyer review window is still open' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow is not in a disputable state (${account.state})` }, 409);
  }

  inFlight.add(jobId);
  try {
    const reasonHash = body.reason ?? 'seller appeal: final release overdue';
    const result = await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID!,
        contractAddress: escrow.address,
        abiFunctionSignature: 'dispute(bytes32,string)',
        abiParameters: [jobId, reasonHash],
      },
      `dispute(${jobId})`,
    );
    await patchDeal(jobId, { disputed: true, disputedAt: Date.now() });
    bus.emitEvent({
      type: 'deal.disputed',
      jobId,
      actor: 'seller',
      payload: { seller: deal.seller, buyer: deal.buyer, reason: reasonHash, txHash: result.txHash },
    });
    // A dispute is a neutral marker on the record until it is resolved.
    await recordReputation(jobId, OUTCOME_DISPUTE_RESOLVED);
    return c.json({ accepted: true, jobId, txHash: result.txHash }, 200);
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'appeal failed');
    return c.json({ error: 'appeal failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer reclaims funds when the seller never marked the work delivered and the
/// deadline has passed. Moves the escrow Disputed then Refunded on chain via the
/// buyer agent, returning the full escrow balance to the buyer.
dealsRoutes.post('/direct/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can cancel this deal' }, 403);
  }
  if (deal.delivered) {
    return c.json({ error: 'the seller already marked the work delivered' }, 409);
  }
  if (deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'this deal is no longer cancellable' }, 409);
  }
  // While the seller has not accepted, the buyer can back out anytime. Once
  // accepted, cancel is gated on the deadline passing without delivery.
  if (deal.acceptedAt && Date.now() < deal.deadlineUnix * 1000) {
    return c.json({ error: 'the deadline has not passed yet' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow is not in a cancellable state (${account.state})` }, 409);
  }

  inFlight.add(jobId);
  try {
    const reason = 'buyer cancel: seller did not deliver by deadline';
    await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID!,
        contractAddress: escrow.address,
        abiFunctionSignature: 'dispute(bytes32,string)',
        abiParameters: [jobId, reason],
      },
      `dispute(cancel ${jobId})`,
    );
    const refundResult = await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID!,
        contractAddress: escrow.address,
        abiFunctionSignature: 'refund(bytes32)',
        abiParameters: [jobId],
      },
      `refund(${jobId})`,
    );
    await patchDeal(jobId, { cancelledAt: Date.now() });
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId,
      actor: 'buyer',
      payload: { buyer: deal.buyer, seller: deal.seller, reason, txHash: refundResult.txHash },
    });
    // The seller never delivered by the deadline: record a failure against them.
    await recordReputation(jobId, OUTCOME_FAILED);
    return c.json({ accepted: true, jobId, txHash: refundResult.txHash }, 200);
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'cancel failed');
    return c.json({ error: 'cancel failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

async function enrich(deal: DirectDeal) {
  const base = { ...deal, reviewWindowMs: config.DEAL_REVIEW_WINDOW_MS };
  try {
    const account = await readEscrow(deal.jobId);
    return {
      ...base,
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
    return { ...base, onChain: null };
  }
}
