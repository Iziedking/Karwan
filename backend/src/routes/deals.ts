import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { parseUnits, formatUnits } from 'viem';
import { config } from '../config.js';
import {
  escrow,
  usdc as usdcAddress,
  readEscrow,
  readLegacyEscrow,
  legacyEscrow,
  ESCROW_STATE,
  LEGACY_ESCROW_STATE,
  invalidateEscrowCache,
  readUsdcBalance,
  getEscrowFeeBps,
  computeFunding,
} from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import {
  releaseMilestone,
  finalizeIfSettled,
  acceptEscrow as acceptEscrowOnChain,
  recordReputation,
  ESCROW_FUNDED,
  ESCROW_ACCEPTED,
  ESCROW_DISPUTED,
  OUTCOME_FAILED,
  OUTCOME_DISPUTE_RESOLVED,
} from '../chain/settlement.js';
import { vault, getReservationBps } from '../chain/contracts.js';
import {
  createDeal,
  getDeal,
  patchDeal,
  listDealsForAddress,
  listAllDeals,
  type DirectDeal,
} from '../db/deals.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getBrief } from '../db/briefs.js';
import { provisionUserAgentWallets } from '../circle/wallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { classifyAgentError } from '../chain/errors.js';
import { sessionMismatchesClaim, viewerAddress } from '../auth/session.js';

// ERC-20 USDC on Arc uses 6 decimals for escrow accounting.
const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const createSchema = z
  .object({
    buyerAddress: addrSchema,
    sellerAddress: addrSchema,
    dealAmountUsdc: z.number().positive(),
    // Either deadlineDays alone OR deadlineDays + deadlineHours. Hours add
    // sub-day granularity for tight deadlines (eg "deliver in 6 hours") and
    // for verification windows on hour-sized work. Total must land between
    // 1 hour and 180 days.
    deadlineDays: z.number().int().min(0).max(180),
    deadlineHours: z.number().int().min(0).max(23).optional().default(0),
    terms: z.string().min(1).max(600),
    firstReleasePct: z.number().int().min(1).max(99),
  })
  .refine(
    (b) => b.deadlineDays * 24 + (b.deadlineHours ?? 0) >= 1,
    { message: 'deadline must be at least 1 hour', path: ['deadlineHours'] },
  );

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

/// Create a direct deal. The escrow is not funded here: the deal sits in
/// awaiting-seller until the named seller accepts. The buyer must have activated
/// their agent wallets; the seller activates lazily on accept.
dealsRoutes.post('/direct', async (c) => {
  let body;
  try {
    body = createSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (body.buyerAddress.toLowerCase() === body.sellerAddress.toLowerCase()) {
    return c.json({ error: 'buyer and seller must be different wallets' }, 400);
  }
  // Only the buyer can open a deal as themselves.
  if (sessionMismatchesClaim(c, body.buyerAddress)) {
    return c.json({ error: 'You can only open a deal as your own wallet.', code: 'forbidden' }, 403);
  }

  // The buyer agent funds the escrow when the seller accepts, so the buyer must
  // be activated now. The seller is not required to be activated yet.
  const buyerAgents = await getAgentWallets(body.buyerAddress);
  if (!buyerAgents) {
    return c.json({ error: 'activate your agent wallets before opening a deal' }, 409);
  }

  const jobId = `0x${randomBytes(32).toString('hex')}`;
  const dealAmountWei = parseUnits(body.dealAmountUsdc.toString(), USDC_DECIMALS);
  const feeBps = await getEscrowFeeBps();
  const { fundedAmount, sellerNet, feeTotal } = computeFunding(dealAmountWei, feeBps);

  const totalSeconds = body.deadlineDays * 86400 + (body.deadlineHours ?? 0) * 3600;
  const deadlineUnix = Math.floor(Date.now() / 1000) + totalSeconds;
  const deal = await createDeal({
    jobId,
    buyer: body.buyerAddress,
    seller: body.sellerAddress,
    buyerAgentWalletId: buyerAgents.buyerWalletId,
    buyerAgentAddress: buyerAgents.buyerAddress,
    dealAmountUsdc: body.dealAmountUsdc.toString(),
    firstReleasePct: body.firstReleasePct,
    deadlineUnix,
    terms: body.terms,
    origin: 'direct',
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
    },
  });

  logger.info(
    { jobId, buyer: body.buyerAddress, seller: body.sellerAddress },
    'direct deal created, awaiting seller',
  );
  return c.json(
    {
      deal,
      funding: {
        dealAmountUsdc: body.dealAmountUsdc.toString(),
        fundedAmountUsdc: formatUnits(fundedAmount, USDC_DECIMALS),
        sellerNetUsdc: formatUnits(sellerNet, USDC_DECIMALS),
        feeTotalUsdc: formatUnits(feeTotal, USDC_DECIMALS),
      },
    },
    200,
  );
});

/// Public feed of SETTLED deals only, newest first, enriched + redacted (masked
/// addresses, no party-authored text). In-flight deals are private to their two
/// parties, so the public network feed shows only completed ones as proof of
/// activity. Aggregate counts live on /stats so the home numbers stay accurate
/// without exposing in-flight deals.
dealsRoutes.get('/feed', async (c) => {
  const deals = (await listAllDeals()).filter((d) => d.settledAt != null);
  const enriched = await Promise.all(deals.slice(0, 60).map((d) => enrich(d)));
  return c.json({ deals: enriched.map(redactDeal) });
});

/// Aggregate network stats. Counts and total volume only. no per-deal rows, no
/// addresses. Safe to serve publicly: it reveals nothing about any single deal.
dealsRoutes.get('/stats', async (c) => {
  const deals = await listAllDeals();
  const total = deals.length;
  const settled = deals.filter((d) => d.settledAt != null).length;
  const volumeUsdc = deals.reduce((s, d) => s + (Number(d.dealAmountUsdc) || 0), 0);
  // Split direct vs agent. New rows carry an explicit origin; legacy rows fall
  // back to the brief store, since every agent deal has a brief and a direct
  // deal never does.
  const agent = deals.filter(
    (d) => (d.origin ?? (getBrief(d.jobId) ? 'agent' : 'direct')) === 'agent',
  ).length;
  const direct = total - agent;
  return c.json({ total, direct, agent, settled, volumeUsdc });
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
  // Legacy deals live on the dedicated /legacy recovery page; filtering
  // them here kills the false "release first" buttons on activity / buyer
  // / seller dashboards that otherwise show pre-v2.D escrow state.
  return c.json({ deals: enriched.filter((d) => !d.legacyEscrow) });
});

dealsRoutes.get('/direct/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  // A direct deal is private to its two parties. Identity comes from the signed
  // session, not a param. Non-parties get 403 with a clear, non-leaking reason.
  const caller = viewerAddress(c);
  const isParty =
    !!caller &&
    (caller === deal.buyer.toLowerCase() || caller === deal.seller.toLowerCase());
  if (!isParty) {
    return c.json({ error: 'This deal is private to its buyer and seller.', code: 'private' }, 403);
  }
  return c.json({ deal: await enrich(deal) });
});

/// Seller accepts the deal terms. This lazily provisions the seller's agent
/// wallets if they have not activated, then the buyer agent funds the escrow
/// naming the seller agent. The deal moves to awaiting-delivery.
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
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can accept this deal' }, 403);
  }
  if (deal.acceptedAt) {
    return c.json({ error: 'deal already accepted' }, 409);
  }
  if (deal.cancelledAt) {
    return c.json({ error: 'this deal was cancelled' }, 409);
  }
  if (!deal.buyerAgentWalletId || !deal.buyerAgentAddress) {
    return c.json({ error: 'this deal has no buyer agent wallet on record' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  inFlight.add(jobId);
  try {
    // Lazily provision the seller's agent wallets on first accept.
    let sellerAgents = await getAgentWallets(deal.seller);
    if (!sellerAgents) {
      const provisioned = await provisionUserAgentWallets(deal.seller);
      sellerAgents = await saveAgentWallets({ userAddress: deal.seller, ...provisioned });
      bus.emitEvent({
        type: 'agent.activated',
        actor: 'platform',
        payload: {
          user: deal.seller,
          buyer: sellerAgents.buyerAddress,
          seller: sellerAgents.sellerAddress,
        },
      });
    }

    // Recovery / idempotency: if a prior attempt already funded the escrow on
    // chain but failed to record acceptedAt (a crash or transient read between
    // the fund tx and the DB write), the agent's USDC is ALREADY locked in
    // escrow. Re-funding would revert and the balance preflight below would
    // wrongly block, stranding the funds. Detect the funded escrow and just mark
    // the deal accepted so the normal delivery + refund paths apply.
    invalidateEscrowCache(jobId);
    const preEscrow = await readEscrow(jobId);
    // v2.D-aware idempotent recovery. Two on-chain states count as "already
    // partway through accept":
    //   - Funded: buyer funded, seller hasn't called acceptEscrow yet. We
    //     skip fundEscrow but still need to call acceptEscrow.
    //   - Accepted: seller already accepted; just record acceptedAt.
    if (preEscrow.state === ESCROW_FUNDED || preEscrow.state === ESCROW_ACCEPTED) {
      if (preEscrow.state === ESCROW_FUNDED) {
        try {
          await acceptEscrowOnChain(jobId, sellerAgents.sellerWalletId);
          invalidateEscrowCache(jobId);
        } catch (err) {
          const message = (err as Error).message;
          const lower = message.toLowerCase();
          const isInsufficientStake =
            lower.includes('insufficientstake') ||
            lower.includes('insufficientfreestake');
          const code = isInsufficientStake
            ? 'INSUFFICIENT_STAKE'
            : 'ACCEPT_ESCROW_FAILED';
          const detail = isInsufficientStake
            ? `Your seller agent needs more stake to backstop this deal. Stake more in /stake and retry.`
            : `acceptEscrow reverted: ${message}`;
          return c.json({ error: detail, code, detail: message }, 502);
        }
      }
      await patchDeal(jobId, {
        acceptedAt: deal.acceptedAt ?? Date.now(),
        sellerAgentWalletId: sellerAgents.sellerWalletId,
        sellerAgentAddress: sellerAgents.sellerAddress,
      });
      bus.emitEvent({
        type: 'deal.accepted',
        jobId,
        actor: 'seller',
        payload: { seller: deal.seller, buyer: deal.buyer },
      });
      logger.info(
        { jobId, escrowState: preEscrow.state },
        'escrow already past Funded; marked accepted (idempotent recovery)',
      );
      return c.json({ accepted: true, jobId, recovered: true }, 200);
    }

    // Fund the escrow now: the buyer agent approves, then funds it naming the
    // seller agent as the on-chain seller.
    const milestonePcts = [deal.firstReleasePct, 100 - deal.firstReleasePct];
    const dealAmountWei = parseUnits(deal.dealAmountUsdc, USDC_DECIMALS);
    const feeBps = await getEscrowFeeBps();
    const { fundedAmount } = computeFunding(dealAmountWei, feeBps);

    // Preflight the buyer agent's USDC. A Circle wallet is an ERC-4337 SCA, so a
    // fundEscrow whose inner transferFrom reverts for insufficient USDC still
    // lands as a SUCCESSFUL handleOps tx (Circle reports COMPLETE), which would
    // otherwise be recorded as a funded, accepted deal sitting on an empty
    // escrow. Catch the shortfall up front with the exact numbers.
    const agentBal = await readUsdcBalance(deal.buyerAgentAddress);
    if (agentBal < fundedAmount) {
      bus.emitEvent({
        type: 'deal.fund.insufficient',
        jobId,
        actor: 'platform',
        payload: {
          buyer: deal.buyer,
          seller: deal.seller,
          buyerAgent: deal.buyerAgentAddress,
          dealAmountUsdc: deal.dealAmountUsdc,
          code: 'INSUFFICIENT_AGENT_BALANCE',
        },
      });
      return c.json(
        {
          error: `buyer agent is short on USDC: has ${formatUnits(agentBal, USDC_DECIMALS)}, needs ${formatUnits(fundedAmount, USDC_DECIMALS)} (deal + fee). Top up the agent and retry.`,
          code: 'INSUFFICIENT_AGENT_BALANCE',
        },
        409,
      );
    }

    await executeContractCall(
      {
        walletId: deal.buyerAgentWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [escrow.address, fundedAmount.toString()],
      },
      `usdc.approve(escrow, direct ${jobId})`,
    );
    const fundResult = await executeContractCall(
      {
        walletId: deal.buyerAgentWalletId,
        contractAddress: escrow.address,
        abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[])',
        abiParameters: [
          jobId,
          sellerAgents.sellerAddress,
          dealAmountWei.toString(),
          milestonePcts,
        ],
      },
      `fundEscrow(direct ${jobId})`,
    );

    // Verify the escrow is ACTUALLY Funded before marking the deal accepted. The
    // fund tx above can land as a successful ERC-4337 handleOps even when the
    // inner fundEscrow userOp reverted, so the txHash alone is not proof. This
    // guard is what stops an "accepted" deal from sitting on an empty escrow.
    invalidateEscrowCache(jobId);
    const fundedAccount = await readEscrow(jobId);
    if (fundedAccount.state !== ESCROW_FUNDED) {
      logger.error(
        { jobId, escrowState: fundedAccount.state, fundTxHash: fundResult.txHash },
        'fundEscrow tx landed but escrow is not Funded (inner userOp likely reverted)',
      );
      bus.emitEvent({
        type: 'deal.fund.insufficient',
        jobId,
        actor: 'platform',
        payload: {
          buyer: deal.buyer,
          seller: deal.seller,
          buyerAgent: deal.buyerAgentAddress,
          dealAmountUsdc: deal.dealAmountUsdc,
          code: 'FUND_NOT_CONFIRMED',
        },
      });
      return c.json(
        {
          error:
            'escrow funding did not confirm on chain. The buyer agent may be short on USDC for this amount plus fee. Top it up and retry.',
          code: 'FUND_NOT_CONFIRMED',
        },
        409,
      );
    }

    // v2.D: pre-flight the seller agent's free stake on the vault. The
    // reservation amount = dealAmount * reservationBps / 10000 must be
    // covered by the seller agent's `freeStakeOf` (active stake minus any
    // existing reservations). Catching the shortfall here lets us give
    // the user a clean message rather than a raw chain revert. The
    // contract still gates with the same check (defence in depth).
    try {
      const reservationBps = await getReservationBps();
      const reservationWei =
        (dealAmountWei * BigInt(reservationBps)) / 10000n;
      const sellerFreeWei = (await vault.read.freeStakeOf([
        sellerAgents.sellerAddress as `0x${string}`,
      ])) as bigint;
      if (sellerFreeWei < reservationWei) {
        const reservationUsdc = formatUnits(reservationWei, USDC_DECIMALS);
        const freeUsdc = formatUnits(sellerFreeWei, USDC_DECIMALS);
        const message = `Your seller agent has ${freeUsdc} USDC free stake but this deal needs ${reservationUsdc} USDC reserved (${reservationBps / 100}% of ${deal.dealAmountUsdc}). Stake more in /stake before accepting.`;
        bus.emitEvent({
          type: 'agent.error',
          jobId,
          actor: 'seller',
          payload: { scope: 'acceptEscrow.preflight', message, code: 'INSUFFICIENT_STAKE' },
        });
        return c.json({ error: message, code: 'INSUFFICIENT_STAKE' }, 409);
      }
    } catch (err) {
      // Read failure on the vault is not blocking — fall through to the
      // chain call which will revert with the same constraint if needed.
      logger.warn(
        { jobId, err: (err as Error).message },
        'freeStake preflight read failed; proceeding to acceptEscrow',
      );
    }

    // v2.D: the seller agent signs acceptEscrow which transitions the
    // escrow from Funded to Accepted and locks an insurance reservation
    // on the vault (dealAmount * reservationBps / 10000). Without this
    // the buyer can never release milestones. Failure modes are surfaced
    // back to the seller as actionable errors — most commonly
    // "insufficient stake" if the seller agent hasn't deposited enough.
    try {
      const acceptTx = await acceptEscrowOnChain(jobId, sellerAgents.sellerWalletId);
      logger.info({ jobId, acceptTx }, 'seller accepted escrow on chain (v2.D)');
    } catch (err) {
      const message = (err as Error).message;
      const lower = message.toLowerCase();
      // Map well-known revert reasons to actionable user errors. The vault
      // surfaces InsufficientStake when the seller agent doesn't have
      // enough free stake to cover the reservation.
      const isInsufficientStake =
        lower.includes('insufficientstake') ||
        lower.includes('insufficientfreestake');
      const code = isInsufficientStake
        ? 'INSUFFICIENT_STAKE'
        : 'ACCEPT_ESCROW_FAILED';
      const detail = isInsufficientStake
        ? `Your seller agent needs more stake to backstop a deal of ${deal.dealAmountUsdc} USDC. Stake more in /stake and retry.`
        : `acceptEscrow reverted: ${message}`;
      logger.error({ jobId, err: message, code }, 'acceptEscrow on chain failed');
      bus.emitEvent({
        type: 'agent.error',
        jobId,
        actor: 'seller',
        payload: { scope: 'acceptEscrow', message, code },
      });
      // The escrow stays in Funded state on chain — the buyer's USDC is
      // locked there. The buyer can dispute + refund to recover (which
      // skips slash since reservedAmount is still 0). We return the error
      // so the seller knows; off-chain state stays clean (no acceptedAt
      // set, no deal.accepted event).
      return c.json({ error: detail, code, detail: message }, 502);
    }
    invalidateEscrowCache(jobId);

    await patchDeal(jobId, {
      acceptedAt: Date.now(),
      sellerAgentWalletId: sellerAgents.sellerWalletId,
      sellerAgentAddress: sellerAgents.sellerAddress,
      fundTxHash: fundResult.txHash,
    });
    bus.emitEvent({
      type: 'deal.accepted',
      jobId,
      actor: 'seller',
      payload: { seller: deal.seller, buyer: deal.buyer },
    });
    bus.emitEvent({
      type: 'escrow.funded',
      jobId,
      actor: 'buyer',
      payload: { seller: sellerAgents.sellerAddress, txHash: fundResult.txHash },
    });
    logger.info({ jobId, ...fundResult }, 'direct deal accepted and escrow funded');
    return c.json({ accepted: true, jobId, txHash: fundResult.txHash }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'direct deal accept failed');
    // Emit a notification event so the buyer sees this in the bell — they need
    // to top the buyer agent up before the seller can accept.
    if (info.code === 'INSUFFICIENT_AGENT_BALANCE' || info.code === 'INSUFFICIENT_AGENT_GAS') {
      bus.emitEvent({
        type: 'deal.fund.insufficient',
        jobId,
        actor: 'platform',
        payload: {
          buyer: deal.buyer,
          seller: deal.seller,
          buyerAgent: deal.buyerAgentAddress,
          dealAmountUsdc: deal.dealAmountUsdc,
          code: info.code,
        },
      });
    }
    const status = info.code === 'INSUFFICIENT_AGENT_BALANCE' ? 409 : 502;
    return c.json({ error: 'accept failed', code: info.code, detail: info.message }, status);
  } finally {
    inFlight.delete(jobId);
  }
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
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
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
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can release this deal' }, 403);
  }
  if (!deal.delivered) {
    return c.json({ error: 'seller has not marked the work delivered yet' }, 409);
  }
  if (!deal.buyerAgentWalletId) {
    return c.json({ error: 'this deal has no buyer agent wallet on record' }, 409);
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
    const txHash = await releaseMilestone(jobId, releasedIndex, deal.buyerAgentWalletId);
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
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'release failed');
    return c.json({ error: 'release failed', code: info.code, detail: info.message }, 502);
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
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
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

/// Either party appeals: moves the on-chain escrow to Disputed and freezes
/// movement until both sides reach consensus (via the mutual-cancel propose
/// flow). The contract's dispute() accepts either buyer or seller as caller,
/// so we sign with the appealing party's agent wallet.
///
/// Both sides should be able to appeal because both have legitimate scenarios:
/// - Seller: buyer is stalling on the final release after the window passed.
/// - Buyer: seller marked delivered with substandard work and buyer wants to
///   formally freeze the escrow before being pushed into auto-release.
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
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const caller = body.caller.toLowerCase();
  const callerRole: 'buyer' | 'seller' | null =
    caller === deal.buyer ? 'buyer' : caller === deal.seller ? 'seller' : null;
  if (!callerRole) {
    return c.json({ error: 'only the buyer or seller of this deal can appeal' }, 403);
  }
  if (deal.disputed) {
    return c.json({ error: 'deal is already in dispute' }, 409);
  }
  if (!deal.acceptedAt) {
    return c.json({ error: 'cannot appeal before the seller accepts' }, 409);
  }
  if (!deal.sellerAgentWalletId || !deal.buyerAgentWalletId) {
    return c.json({ error: 'this deal has no agent wallets on record' }, 409);
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
    const defaultReason =
      callerRole === 'seller'
        ? 'seller appeal: final release overdue'
        : 'buyer appeal: delivery disputed';
    const reasonHash = body.reason ?? defaultReason;
    // Sign with the appealing party's own agent wallet. The contract requires
    // msg.sender to be either e.buyer or e.seller, and our agent wallets are
    // the on-chain parties to the escrow.
    const signerWalletId =
      callerRole === 'seller' ? deal.sellerAgentWalletId : deal.buyerAgentWalletId;
    const result = await executeContractCall(
      {
        walletId: signerWalletId,
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
      actor: callerRole,
      payload: { seller: deal.seller, buyer: deal.buyer, reason: reasonHash, txHash: result.txHash },
    });
    // A dispute is a neutral marker on the record until it is resolved.
    await recordReputation(jobId, deal.buyerAgentWalletId, OUTCOME_DISPUTE_RESOLVED);
    return c.json({ accepted: true, jobId, txHash: result.txHash }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'appeal failed');
    return c.json({ error: 'appeal failed', code: info.code, detail: info.message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer cancels the deal. Before the seller accepts, this is a plain state
/// change with no escrow to unwind. After acceptance, once the deadline passes
/// without delivery, it moves the escrow Disputed then Refunded on chain via the
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
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
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

  // Before the seller accepts, no escrow exists yet, so cancel is a plain state
  // change with nothing to refund on chain.
  if (!deal.acceptedAt) {
    // Defensive: the escrow could be funded on chain even with acceptedAt unset
    // (a fund that landed but wasn't recorded). A plain pre-accept cancel would
    // ignore those locked funds. If money is in escrow, refuse the no-op cancel
    // and route the user to re-accept (idempotent recovery) then the standard or
    // mutual cancel, which actually refunds on chain.
    invalidateEscrowCache(jobId);
    const acct = await readEscrow(jobId);
    if (acct.state === ESCROW_FUNDED) {
      return c.json(
        {
          error:
            'this deal is funded on chain. Have the seller re-accept to sync it, then cancel through the standard or mutual path to refund.',
          code: 'FUNDED_NOT_RECORDED',
        },
        409,
      );
    }
    const reason = 'buyer withdrew before the seller accepted';
    await patchDeal(jobId, {
      cancelledAt: Date.now(),
      cancelKind: 'pre-accept',
      cancelReason: reason,
    });
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId,
      actor: 'buyer',
      payload: { buyer: deal.buyer, seller: deal.seller, kind: 'pre-accept', reason },
    });
    return c.json({ accepted: true, jobId }, 200);
  }

  // Once accepted and funded, cancel is gated on the deadline passing without
  // delivery, and reclaims the escrow on chain.
  if (Date.now() < deal.deadlineUnix * 1000) {
    return c.json({ error: 'the deadline has not passed yet' }, 409);
  }
  if (!deal.buyerAgentWalletId) {
    return c.json({ error: 'this deal has no buyer agent wallet on record' }, 409);
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
        walletId: deal.buyerAgentWalletId,
        contractAddress: escrow.address,
        abiFunctionSignature: 'dispute(bytes32,string)',
        abiParameters: [jobId, reason],
      },
      `dispute(cancel ${jobId})`,
    );
    const refundResult = await executeContractCall(
      {
        walletId: deal.buyerAgentWalletId,
        contractAddress: escrow.address,
        abiFunctionSignature: 'refund(bytes32)',
        abiParameters: [jobId],
      },
      `refund(${jobId})`,
    );
    await patchDeal(jobId, {
      cancelledAt: Date.now(),
      cancelKind: 'unilateral',
      cancelReason: reason,
    });
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId,
      actor: 'buyer',
      payload: {
        buyer: deal.buyer,
        seller: deal.seller,
        kind: 'unilateral',
        reason,
        txHash: refundResult.txHash,
      },
    });
    // The seller never delivered by the deadline: record a failure against them.
    await recordReputation(jobId, deal.buyerAgentWalletId, OUTCOME_FAILED);
    return c.json({ accepted: true, jobId, txHash: refundResult.txHash }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'cancel failed');
    return c.json({ error: 'cancel failed', code: info.code, detail: info.message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

const cancelProposeSchema = z.object({
  caller: addrSchema,
  reason: z.string().min(3).max(400),
  kind: z.enum(['mutual', 'platform-attributed']).default('mutual'),
});

/// Mutual / platform-attributed cancel proposal flow.
///
/// Either party proposes with a reason and a kind. The counterparty can accept
/// (refunds escrow if funded, marks the deal cancelled with the proposed kind,
/// no reputation impact) or decline (clears the proposal, deal continues
/// normally). A second propose call from the same party overwrites the prior
/// proposal; a propose call from the opposite side while one is pending is
/// treated as an accept (both want out).
dealsRoutes.post('/direct/:jobId/cancel/propose', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = cancelProposeSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }

  const callerLower = body.caller.toLowerCase();
  const callerRole: 'buyer' | 'seller' | null =
    callerLower === deal.buyer ? 'buyer' : callerLower === deal.seller ? 'seller' : null;
  if (!callerRole) {
    return c.json({ error: 'caller is not a party to this deal' }, 403);
  }
  if (deal.cancelledAt || deal.settledAt) {
    return c.json({ error: 'this deal is no longer in a proposable state' }, 409);
  }
  // A pending dispute (seller appeal) is NOT terminal. Either party may still
  // propose a mutual / platform-attributed cancel; if the counterparty accepts,
  // the escrow refunds and the deal closes with no reputation hit.

  const reason = body.reason.trim();
  const proposal = {
    proposedBy: callerRole,
    kind: body.kind,
    reason,
    proposedAt: Date.now(),
  } as const;

  await patchDeal(jobId, { cancellationProposal: proposal });
  bus.emitEvent({
    type: 'deal.cancel.proposed',
    jobId,
    actor: callerRole,
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      proposedBy: callerRole,
      kind: body.kind,
      reason,
    },
  });
  return c.json({ accepted: true, jobId, proposal }, 200);
});

dealsRoutes.post('/direct/:jobId/cancel/accept', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }

  const proposal = deal.cancellationProposal;
  if (!proposal) {
    return c.json({ error: 'no cancellation is pending' }, 409);
  }
  const callerLower = body.caller.toLowerCase();
  const callerRole: 'buyer' | 'seller' | null =
    callerLower === deal.buyer ? 'buyer' : callerLower === deal.seller ? 'seller' : null;
  if (!callerRole) {
    return c.json({ error: 'caller is not a party to this deal' }, 403);
  }
  if (callerRole === proposal.proposedBy) {
    return c.json({ error: 'the proposer cannot accept their own proposal' }, 409);
  }
  if (deal.cancelledAt || deal.settledAt) {
    return c.json({ error: 'this deal is no longer cancellable' }, 409);
  }
  // disputed=true is NOT terminal here. If the escrow is in Disputed state,
  // we skip the redundant on-chain dispute() call and go straight to refund().
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  // Pre-accept: no escrow exists, plain state change.
  if (!deal.acceptedAt) {
    await patchDeal(jobId, {
      cancelledAt: Date.now(),
      cancelKind: proposal.kind,
      cancelReason: proposal.reason,
      cancellationProposal: undefined,
    });
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId,
      actor: callerRole,
      payload: {
        buyer: deal.buyer,
        seller: deal.seller,
        kind: proposal.kind,
        reason: proposal.reason,
        proposedBy: proposal.proposedBy,
        acceptedBy: callerRole,
      },
    });
    return c.json({ accepted: true, jobId }, 200);
  }

  // Post-accept: dispute + refund on chain. If already disputed, skip dispute.
  if (!deal.buyerAgentWalletId) {
    return c.json({ error: 'this deal has no buyer agent wallet on record' }, 409);
  }
  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_FUNDED && account.state !== ESCROW_DISPUTED) {
    return c.json({ error: `escrow is not in a cancellable state (${account.state})` }, 409);
  }

  inFlight.add(jobId);
  try {
    const chainReason = `${proposal.kind === 'platform-attributed' ? 'platform' : 'mutual'} cancel: ${proposal.reason}`;
    // Skip the dispute() call if the escrow is already in Disputed state
    // (eg. seller previously appealed). The contract reverts InvalidState
    // when dispute() is called from Disputed, so re-firing would block the
    // refund path that the parties have now agreed to.
    if (account.state === ESCROW_FUNDED) {
      await executeContractCall(
        {
          walletId: deal.buyerAgentWalletId,
          contractAddress: escrow.address,
          abiFunctionSignature: 'dispute(bytes32,string)',
          abiParameters: [jobId, chainReason],
        },
        `dispute(${proposal.kind}-cancel ${jobId})`,
      );
    }
    const refundResult = await executeContractCall(
      {
        walletId: deal.buyerAgentWalletId,
        contractAddress: escrow.address,
        abiFunctionSignature: 'refund(bytes32)',
        abiParameters: [jobId],
      },
      `refund(${jobId})`,
    );
    await patchDeal(jobId, {
      cancelledAt: Date.now(),
      cancelKind: proposal.kind,
      cancelReason: proposal.reason,
      cancellationProposal: undefined,
    });
    bus.emitEvent({
      type: 'deal.cancelled',
      jobId,
      actor: callerRole,
      payload: {
        buyer: deal.buyer,
        seller: deal.seller,
        kind: proposal.kind,
        reason: proposal.reason,
        proposedBy: proposal.proposedBy,
        acceptedBy: callerRole,
        txHash: refundResult.txHash,
      },
    });
    // Both 'mutual' and 'platform-attributed' are reputation-neutral by design.
    // No recordReputation() call here.
    return c.json({ accepted: true, jobId, txHash: refundResult.txHash }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'cancel-accept failed');
    return c.json({ error: 'cancel failed', code: info.code, detail: info.message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

dealsRoutes.post('/direct/:jobId/cancel/decline', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }

  const proposal = deal.cancellationProposal;
  if (!proposal) {
    return c.json({ error: 'no cancellation is pending' }, 409);
  }
  const callerLower = body.caller.toLowerCase();
  const callerRole: 'buyer' | 'seller' | null =
    callerLower === deal.buyer ? 'buyer' : callerLower === deal.seller ? 'seller' : null;
  if (!callerRole) {
    return c.json({ error: 'caller is not a party to this deal' }, 403);
  }
  if (callerRole === proposal.proposedBy) {
    return c.json({ error: 'the proposer cannot decline their own proposal' }, 409);
  }

  await patchDeal(jobId, { cancellationProposal: undefined });
  bus.emitEvent({
    type: 'deal.cancel.declined',
    jobId,
    actor: callerRole,
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      proposedBy: proposal.proposedBy,
      declinedBy: callerRole,
      kind: proposal.kind,
      reason: proposal.reason,
    },
  });
  return c.json({ accepted: true, jobId }, 200);
});

function maskAddress(addr: string | undefined): string | undefined {
  if (!addr) return addr;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type EnrichedDeal = Awaited<ReturnType<typeof enrich>>;

/// Strips the public-feed payload of full addresses + party-authored text.
/// Buyer/seller drop to a short form; cancel reasons + delivery proofs go away
/// entirely. The feed is still useful as "what's flowing on Karwan" without
/// telling the world who exactly is doing what.
function redactDeal(d: EnrichedDeal): EnrichedDeal {
  const next = { ...d };
  next.buyer = maskAddress(d.buyer) ?? d.buyer;
  next.seller = maskAddress(d.seller) ?? d.seller;
  next.buyerAgentAddress = maskAddress(d.buyerAgentAddress);
  next.sellerAgentAddress = maskAddress(d.sellerAgentAddress);
  delete next.cancelReason;
  delete next.deliveryProof;
  if (next.cancellationProposal) {
    next.cancellationProposal = {
      proposedBy: next.cancellationProposal.proposedBy,
      kind: next.cancellationProposal.kind,
      proposedAt: next.cancellationProposal.proposedAt,
      reason: '',
    };
  }
  return next;
}

async function enrich(deal: DirectDeal) {
  const base = { ...deal, reviewWindowMs: config.DEAL_REVIEW_WINDOW_MS };
  // No escrow exists on chain until the seller accepts.
  if (!deal.acceptedAt) return { ...base, onChain: null };
  try {
    const account = await readEscrow(deal.jobId);
    // Legacy detection: state==None on the new escrow + a configured legacy
    // address = the funds are still on the pre-v2.D contract. Tag the deal
    // lazily so subsequent /direct calls can filter it out without re-
    // querying. Stays a deal record; the /legacy surface picks it up.
    if (account.state === ESCROW_STATE.None && legacyEscrow) {
      const legacy = await readLegacyEscrow(deal.jobId);
      if (legacy && legacy.state !== LEGACY_ESCROW_STATE.None) {
        if (!deal.legacyEscrow || deal.legacyState !== legacy.state) {
          await patchDeal(deal.jobId, {
            legacyEscrow: true,
            legacyState: legacy.state,
          }).catch(() => {});
        }
        return { ...base, legacyEscrow: true, legacyState: legacy.state, onChain: null };
      }
    }
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
