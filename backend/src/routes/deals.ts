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
import { vault } from '../chain/contracts.js';
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
import { createInvite, getInvite, markInviteUsed } from '../db/dealInvites.js';
import { provisionUserAgentWallets } from '../circle/wallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { classifyAgentError } from '../chain/errors.js';
import { sessionMismatchesClaim, viewerAddress, readSession } from '../auth/session.js';
import { sendDealInviteEmail, formatExpiresLabel } from '../emails/dealInvite.js';

// ERC-20 USDC on Arc uses 6 decimals for escrow accounting.
const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

/// Sentinel address recorded in `deal.seller` when the counterparty was
/// invited by email and has not yet claimed the link. The real address replaces
/// this on claim. Any route that acts on the seller must check
/// `pendingCounterparty` first and refuse to act while it is set.
const PENDING_COUNTERPARTY_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const createSchema = z
  .object({
    buyerAddress: addrSchema,
    /// Either a wallet address (existing flow) OR an email (new share-link
    /// flow). Exactly one. Email mode creates a pending invite and returns a
    /// shareable URL; no escrow funding happens before the recipient claims.
    sellerAddress: addrSchema.optional(),
    sellerEmail: z.string().email().toLowerCase().optional(),
    dealAmountUsdc: z.number().positive(),
    // Optional delivery deadline. When omitted (or both fields = 0) the deal
    // is open-ended — the seller has no time pressure and the buyer can't
    // unilateral-cancel for late delivery. When set, total must land between
    // 1 hour and 180 days.
    deadlineDays: z.number().int().min(0).max(180).optional().default(0),
    deadlineHours: z.number().int().min(0).max(23).optional().default(0),
    // Acceptance window in hours. How long the seller has to accept this deal
    // before it auto-expires and the buyer is freed up to re-shop. Default 24h
    // matches what a human asking "can you take this?" would realistically wait.
    acceptanceWindowHours: z.number().int().min(1).max(720).optional().default(24),
    terms: z.string().min(1).max(600),
    firstReleasePct: z.number().int().min(1).max(99),
    /// Trusted-match flag. When true, this deal is high-trust: the seller
    /// must hold enough free stake to cover the per-deal reservation, which
    /// gets slashed if they lose a dispute. When false, the deal is casual
    /// — v2.E+ escrows pass reservationBps=0 to fundEscrow, the vault is
    /// never touched, and the seller can accept without any stake.
    requireStake: z.boolean().optional().default(false),
    /// Stake percentage chosen by the buyer when requireStake is true. The
    /// frontend slider runs 50..100 in 5% steps. Coerced to a multiple of 5,
    /// floored at 50, capped at 100. Ignored when requireStake is false.
    requireStakePct: z
      .number()
      .int()
      .min(50)
      .max(100)
      .optional()
      .default(50)
      .refine((v) => v % 5 === 0, { message: 'requireStakePct must be a multiple of 5' }),
  })
  .refine(
    (b) =>
      // Either both zero (open-ended) or at least 1 hour total.
      (b.deadlineDays === 0 && (b.deadlineHours ?? 0) === 0) ||
      b.deadlineDays * 24 + (b.deadlineHours ?? 0) >= 1,
    { message: 'when set, deadline must be at least 1 hour', path: ['deadlineHours'] },
  )
  .refine(
    (b) => !!b.sellerAddress !== !!b.sellerEmail,
    { message: 'provide exactly one of sellerAddress or sellerEmail', path: ['sellerAddress'] },
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
  if (
    body.sellerAddress &&
    body.buyerAddress.toLowerCase() === body.sellerAddress.toLowerCase()
  ) {
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
  const nowSeconds = Math.floor(Date.now() / 1000);
  const deadlineUnix = totalSeconds > 0 ? nowSeconds + totalSeconds : undefined;
  const acceptanceDeadlineUnix = nowSeconds + body.acceptanceWindowHours * 3600;

  // Email mode: mint a single-use invite token. The deal records the sentinel
  // pending address; the recipient binds the real one when they claim. Funding
  // and on-chain escrow never move before the bind, so the buyer isn't on the
  // hook during the wait.
  let inviteUrl: string | undefined;
  let pendingCounterparty: DirectDeal['pendingCounterparty'] | undefined;
  let inviteExpiresAt: number | undefined;
  if (body.sellerEmail) {
    const token = randomBytes(32).toString('hex');
    inviteExpiresAt = Date.now() + config.DEAL_INVITE_TTL_MS;
    createInvite({
      token,
      jobId,
      role: 'seller',
      email: body.sellerEmail,
      expiresAt: inviteExpiresAt,
    });
    pendingCounterparty = {
      email: body.sellerEmail,
      role: 'seller',
      inviteToken: token,
    };
    const base = (config.FRONTEND_BASE_URL ?? '').replace(/\/$/, '');
    inviteUrl = `${base}/invite/${token}`;
  }

  const sellerAddress = body.sellerAddress ?? PENDING_COUNTERPARTY_ADDRESS;
  const deal = await createDeal({
    jobId,
    buyer: body.buyerAddress,
    seller: sellerAddress,
    buyerAgentWalletId: buyerAgents.buyerWalletId,
    buyerAgentAddress: buyerAgents.buyerAddress,
    dealAmountUsdc: body.dealAmountUsdc.toString(),
    firstReleasePct: body.firstReleasePct,
    deadlineUnix,
    acceptanceDeadlineUnix,
    terms: body.terms,
    origin: 'direct',
    pendingCounterparty,
    requireStake: body.requireStake,
    requireStakePct: body.requireStake ? body.requireStakePct : undefined,
  });

  bus.emitEvent({
    type: 'deal.direct.created',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: body.buyerAddress,
      seller: sellerAddress,
      dealAmountUsdc: body.dealAmountUsdc.toString(),
      firstReleasePct: body.firstReleasePct,
      ...(pendingCounterparty ? { invitedEmail: pendingCounterparty.email } : {}),
    },
  });
  if (pendingCounterparty) {
    bus.emitEvent({
      type: 'deal.invite.created',
      jobId,
      actor: 'buyer',
      payload: {
        buyer: body.buyerAddress,
        invitedEmail: pendingCounterparty.email,
        expiresAt: inviteExpiresAt ?? Date.now() + config.DEAL_INVITE_TTL_MS,
      },
    });
    // Notify the recipient over Resend. Fire-and-forget so a transient mail
    // failure never blocks the deal-creation HTTP response; the buyer still
    // gets the inviteUrl in the response body and can share it manually.
    if (inviteUrl && inviteExpiresAt) {
      const maskedInviter = `${body.buyerAddress.slice(0, 6)}…${body.buyerAddress.slice(-4)}`;
      void sendDealInviteEmail({
        to: pendingCounterparty.email,
        claimUrl: inviteUrl,
        dealAmountUsdc: body.dealAmountUsdc.toString(),
        inviterMasked: maskedInviter,
        expiresLabel: formatExpiresLabel(inviteExpiresAt),
      }).catch((err) => {
        logger.warn(
          { err: (err as Error).message, to: pendingCounterparty?.email, jobId },
          'deal invite email send threw',
        );
      });
    }
  }

  logger.info(
    { jobId, buyer: body.buyerAddress, seller: sellerAddress, invited: !!body.sellerEmail },
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
      ...(inviteUrl ? { invite: { url: inviteUrl, email: body.sellerEmail } } : {}),
    },
    200,
  );
});

/// Public summary of a pending invite. Returns the deal terms in a form safe
/// to show a logged-out recipient (amount, terms, deadline, the invited email,
/// the inviter's masked address). The recipient uses this to decide whether
/// to claim. Returns 404 for unknown tokens, 410 for expired invites, and a
/// "ready to claim" payload otherwise.
dealsRoutes.get('/invite/:token', async (c) => {
  const token = c.req.param('token');
  const invite = getInvite(token);
  if (!invite) return c.json({ error: 'invite not found' }, 404);
  if (invite.usedAt) {
    return c.json(
      { error: 'invite already claimed', code: 'CLAIMED', jobId: invite.jobId },
      410,
    );
  }
  if (invite.expiresAt < Date.now()) {
    return c.json({ error: 'invite expired', code: 'EXPIRED' }, 410);
  }
  const deal = await getDeal(invite.jobId);
  if (!deal) return c.json({ error: 'underlying deal vanished' }, 404);

  const maskedInviter = `${deal.buyer.slice(0, 6)}…${deal.buyer.slice(-4)}`;
  return c.json({
    invite: {
      token: invite.token,
      jobId: invite.jobId,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
    deal: {
      jobId: deal.jobId,
      dealAmountUsdc: deal.dealAmountUsdc,
      firstReleasePct: deal.firstReleasePct,
      terms: deal.terms,
      deadlineUnix: deal.deadlineUnix,
      acceptanceDeadlineUnix: deal.acceptanceDeadlineUnix,
      inviterMasked: maskedInviter,
    },
  });
});

/// Recipient claims the invite. Requires an authenticated session whose email
/// matches the invite (the recipient ran the standard /api/auth/otp flow on
/// the invited address right before this). On success the deal's seller (or
/// buyer for inbound invites) is bound to the session's identity wallet and
/// the rest of the flow continues normally on /deals/[jobId].
dealsRoutes.post('/invite/:token/claim', async (c) => {
  const token = c.req.param('token');
  const invite = getInvite(token);
  if (!invite) return c.json({ error: 'invite not found' }, 404);
  if (invite.usedAt) {
    return c.json(
      { error: 'invite already claimed', code: 'CLAIMED', jobId: invite.jobId },
      410,
    );
  }
  if (invite.expiresAt < Date.now()) {
    return c.json({ error: 'invite expired', code: 'EXPIRED' }, 410);
  }
  const session = readSession(c);
  if (!session) {
    return c.json(
      { error: 'sign in with the invited email before claiming', code: 'NO_SESSION' },
      401,
    );
  }
  if (!session.email || session.email.toLowerCase() !== invite.email) {
    return c.json(
      { error: 'session email does not match the invited address', code: 'EMAIL_MISMATCH' },
      403,
    );
  }
  const deal = await getDeal(invite.jobId);
  if (!deal) return c.json({ error: 'underlying deal vanished' }, 404);
  if (session.address.toLowerCase() === deal.buyer) {
    return c.json({ error: 'inviter cannot also be the counterparty' }, 409);
  }

  const patch: Partial<DirectDeal> = invite.role === 'seller'
    ? { seller: session.address.toLowerCase() }
    : { buyer: session.address.toLowerCase() };

  // Re-anchor both deadlines so they start counting from CLAIM time, not
  // creation time. Without this, a buyer who sets a 24h delivery deadline
  // and a 24h acceptance window has both windows pinned to deal creation —
  // by the time the recipient claims 5 days later, both have long expired.
  //
  // We don't store the configured deltas, but they're recoverable: the
  // gap between createdAt and the absolute deadlines IS the configured
  // window. Re-add that same gap to now.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const createdSeconds = Math.floor(deal.createdAt / 1000);
  const reanchor: Partial<DirectDeal> = {};
  if (deal.acceptanceDeadlineUnix != null) {
    const acceptanceWindowSeconds =
      deal.acceptanceDeadlineUnix - createdSeconds;
    if (acceptanceWindowSeconds > 0) {
      reanchor.acceptanceDeadlineUnix = nowSeconds + acceptanceWindowSeconds;
    }
  }
  if (deal.deadlineUnix != null) {
    const deliveryWindowSeconds = deal.deadlineUnix - createdSeconds;
    if (deliveryWindowSeconds > 0) {
      reanchor.deadlineUnix = nowSeconds + deliveryWindowSeconds;
    }
  }

  // Clear pendingCounterparty by patching to undefined; the persistence layer
  // strips undefined values so the field drops out cleanly.
  await patchDeal(invite.jobId, {
    ...patch,
    ...reanchor,
    pendingCounterparty: undefined,
  });
  markInviteUsed(token, session.address);
  bus.emitEvent({
    type: 'deal.invite.claimed',
    jobId: invite.jobId,
    actor: invite.role,
    payload: {
      buyer: deal.buyer,
      seller: invite.role === 'seller' ? session.address.toLowerCase() : deal.seller,
      claimerEmail: invite.email,
      claimerAddress: session.address.toLowerCase(),
    },
  });
  logger.info(
    { jobId: invite.jobId, email: invite.email, address: session.address },
    'invite claimed, deal counterparty bound',
  );
  return c.json({ ok: true, jobId: invite.jobId, redirectTo: `/deals/${invite.jobId}` });
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
    // Per-deal reservationBps. Casual deals (default) pass 0 so the v2.E
    // escrow's acceptEscrow skips vault.reserve entirely. Trusted-match
    // deals translate the buyer's slider pct to bps (50% = 5000, 100% =
    // 10000). The contract enforces the [5000, 10000] band on values > 0.
    const reservationBps = deal.requireStake
      ? Math.round((deal.requireStakePct ?? 50) * 100)
      : 0;
    const fundResult = await executeContractCall(
      {
        walletId: deal.buyerAgentWalletId,
        contractAddress: escrow.address,
        abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[],uint16)',
        abiParameters: [
          jobId,
          sellerAgents.sellerAddress,
          dealAmountWei.toString(),
          milestonePcts,
          reservationBps,
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

    // Pre-flight the seller's free stake on the vault. v2.E: the bps in
    // scope above (set at fundEscrow time) is the per-deal value that the
    // contract will enforce on acceptEscrow. Casual deals (bps=0) skip
    // vault.reserve entirely so no stake is required.
    if (reservationBps > 0) {
      try {
        const reservationWei =
          (dealAmountWei * BigInt(reservationBps)) / 10000n;
        // deal.seller is the identity wallet; stake lives there, not on the agent.
        const sellerFreeWei = (await vault.read.freeStakeOf([
          deal.seller as `0x${string}`,
        ])) as bigint;
        if (sellerFreeWei < reservationWei) {
          const reservationUsdc = formatUnits(reservationWei, USDC_DECIMALS);
          const freeUsdc = formatUnits(sellerFreeWei, USDC_DECIMALS);
          const message = `You need ${reservationUsdc} USDC staked to accept this deal (${reservationBps / 100}% of ${deal.dealAmountUsdc}). You currently have ${freeUsdc} USDC free. Top up at /stake and retry.`;
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
    }

    // v2.D: the seller agent signs acceptEscrow which transitions the
    // escrow from Funded to Accepted and locks an insurance reservation
    // on the vault (dealAmount * reservationBps / 10000). Without this
    // the buyer can never release milestones. Failure modes are surfaced
    // back to the seller as actionable errors — most commonly
    // "insufficient stake" if the seller agent hasn't deposited enough.
    try {
      const acceptTx = await acceptEscrowOnChain(jobId, sellerAgents.sellerWalletId);
      logger.info({ jobId, acceptTx }, 'seller accepted escrow on chain (v2.E)');
      // ERC-4337 inner-revert guard: handleOps can land as a successful tx
      // even when the inner acceptEscrow userOp reverted (eg vault.reserve
      // fails because the seller's stake check on chain disagrees with our
      // off-chain pre-flight — race condition or stale vault read). Without
      // this verify step, off-chain acceptedAt would be set even though
      // on-chain state is still Funded — exactly the bug that made the
      // seller see "tx FAILED" later on Mark Delivered.
      invalidateEscrowCache(jobId);
      const acceptedAccount = await readEscrow(jobId);
      if (acceptedAccount.state !== ESCROW_ACCEPTED) {
        const reservationUsdc = formatUnits(
          (dealAmountWei * BigInt(reservationBps)) / 10000n,
          USDC_DECIMALS,
        );
        const message =
          reservationBps > 0
            ? `Accept didn't land on chain. This usually means your stake check failed — you need ${reservationUsdc} USDC free in your stake. Top up at /stake and retry.`
            : `Accept didn't land on chain. Retry; if the second attempt also fails, ask the buyer to refund via Propose Cancellation.`;
        bus.emitEvent({
          type: 'agent.error',
          jobId,
          actor: 'seller',
          payload: {
            scope: 'acceptEscrow.verify',
            message,
            code: 'ACCEPT_NOT_CONFIRMED',
            chainState: acceptedAccount.state,
          },
        });
        return c.json(
          { error: message, code: 'ACCEPT_NOT_CONFIRMED' },
          502,
        );
      }
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

    // Re-anchor the delivery deadline so the seller's window starts NOW,
    // not when the buyer originally opened the deal. The configured window
    // is recoverable from (deadlineUnix - createdAt) on the existing record.
    // Same logic as the invite-claim re-anchor (deals.ts ~line 350).
    const nowMs = Date.now();
    const nowSeconds = Math.floor(nowMs / 1000);
    const createdSeconds = Math.floor(deal.createdAt / 1000);
    const reanchor: Partial<DirectDeal> = {};
    if (deal.deadlineUnix != null) {
      const deliveryWindowSeconds = deal.deadlineUnix - createdSeconds;
      if (deliveryWindowSeconds > 0) {
        reanchor.deadlineUnix = nowSeconds + deliveryWindowSeconds;
      }
    }

    await patchDeal(jobId, {
      acceptedAt: nowMs,
      sellerAgentWalletId: sellerAgents.sellerWalletId,
      sellerAgentAddress: sellerAgents.sellerAddress,
      fundTxHash: fundResult.txHash,
      ...reanchor,
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

  let account = await readEscrow(jobId);

  // v2.D self-heal: if the seller's acceptEscrow never landed (stuck in
  // Funded), fire it now using the seller's own wallet id. Their off-chain
  // acceptedAt is already set, so this catches the chain up to the agreed
  // state. Insufficient stake surfaces a clean error.
  if (account.state === ESCROW_FUNDED && deal.sellerAgentWalletId) {
    // Pre-flight the seller's free stake. acceptEscrow → vault.reserve()
    // reverts with InsufficientStake when freeStake < dealAmount × reservationBps,
    // but the Circle SDK collapses that revert into a bare "tx FAILED" message
    // so the catch-block string match below never recognises it. Reading the
    // numbers off chain lets us short-circuit with a clean INSUFFICIENT_STAKE
    // 409 that points the seller to /stake.
    //
    // v2.E: reservationBps is now PER-DEAL on the EscrowAccount. Casual deals
    // (bps=0) skip vault.reserve entirely, so the pre-flight is a no-op too.
    try {
      const reservationBps = account.reservationBps;
      if (reservationBps > 0) {
        const requiredWei =
          (account.dealAmount * BigInt(reservationBps)) / 10000n;
        const sellerFreeWei = (await vault.read.freeStakeOf([
          deal.seller as `0x${string}`,
        ])) as bigint;
        if (sellerFreeWei < requiredWei) {
          const requiredUsdc = formatUnits(requiredWei, USDC_DECIMALS);
          const freeUsdc = formatUnits(sellerFreeWei, USDC_DECIMALS);
          logger.warn(
            { jobId, requiredUsdc, freeUsdc },
            'deliver self-heal blocked: seller free stake below reservation',
          );
          return c.json(
            {
              error: `Your free stake is ${freeUsdc} USDC but this deal needs ${requiredUsdc} USDC reserved as insurance. Top up at /stake and retry, or ask the buyer to refund via Propose Cancellation.`,
              code: 'INSUFFICIENT_STAKE',
              detail: { requiredUsdc, freeUsdc, reservationBps },
            },
            409,
          );
        }
      }
    } catch (err) {
      // Vault read failed (not the stake check itself). Fall through to the
      // chain call so the contract revert is still the source of truth.
      logger.warn(
        { jobId, err: (err as Error).message },
        'deliver self-heal: free stake pre-check failed, proceeding to chain',
      );
    }

    try {
      await acceptEscrowOnChain(jobId, deal.sellerAgentWalletId);
      invalidateEscrowCache(jobId);
      account = await readEscrow(jobId);
      logger.info({ jobId }, 'deliver self-healed Funded -> Accepted via acceptEscrow');
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
        ? `Your seller agent needs more free stake to backstop this deal. Top up at /stake and retry marking delivery.`
        : `acceptEscrow reverted: ${message}. Most often this is stake or gas — top up at /stake and retry, or ask the buyer to refund via Propose Cancellation.`;
      logger.error({ jobId, err: message, code }, 'deliver self-heal acceptEscrow failed');
      return c.json({ error: detail, code, detail: message }, 502);
    }
  }

  if (account.state !== ESCROW_ACCEPTED) {
    return c.json(
      { error: `escrow state must be Accepted(2), got ${account.state}. The seller must accept the escrow before marking delivery.` },
      409,
    );
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

  let account = await readEscrow(jobId);

  // v2.D self-heal: deals funded under pre-v2.D code paths can sit in Funded
  // state forever because acceptEscrow never fired. The off-chain deal row
  // has acceptedAt set (implicit seller consent at accept time), so catch
  // the chain up by firing acceptEscrow with the seller's stored wallet id
  // before releasing. If the seller's free stake is short, surface a clean
  // error pointing them at /stake; the buyer's release call doesn't proceed
  // until the chain matches.
  if (account.state === ESCROW_FUNDED) {
    if (!deal.sellerAgentWalletId) {
      return c.json(
        {
          error:
            'this deal is funded but the seller agent never accepted on chain, and no seller wallet is on record. Ask the seller to re-accept from their deal page.',
          code: 'NO_SELLER_WALLET',
        },
        409,
      );
    }

    // Pre-flight the seller's free stake. The on-chain revert reason is a
    // custom error and the Circle SDK surfaces it as bare "tx FAILED", so a
    // shortfall here would otherwise read as a mystery to the buyer. Reading
    // freeStake + reservationBps off chain lets us return INSUFFICIENT_STAKE
    // with the exact numbers, including a hint to use the dispute/refund path
    // when the seller's stake can't be made whole.
    if (deal.sellerAgentAddress) {
      try {
        // v2.E: per-deal reservationBps from the on-chain account.
        // Casual deals (bps=0) skip vault.reserve so no pre-flight needed.
        const reservationBps = account.reservationBps;
        if (reservationBps > 0) {
          const requiredWei =
            (account.dealAmount * BigInt(reservationBps)) / 10000n;
          // Stake lives on the identity wallet (deal.seller), not the agent.
          const sellerFreeWei = (await vault.read.freeStakeOf([
            deal.seller as `0x${string}`,
          ])) as bigint;
          if (sellerFreeWei < requiredWei) {
            const requiredUsdc = formatUnits(requiredWei, USDC_DECIMALS);
            const freeUsdc = formatUnits(sellerFreeWei, USDC_DECIMALS);
            logger.warn(
              { jobId, requiredUsdc, freeUsdc },
              'release self-heal blocked: seller free stake below reservation',
            );
            return c.json(
              {
                error: `Can't release yet. The seller's free stake is ${freeUsdc} USDC but this deal needs ${requiredUsdc} USDC reserved as insurance. Ask the seller to top up at /stake, or call the deal off via Propose Cancellation or Appeal This Deal to refund your USDC now.`,
                code: 'INSUFFICIENT_STAKE',
                detail: { requiredUsdc, freeUsdc, reservationBps },
              },
              409,
            );
          }
        }
      } catch (err) {
        // Vault read failed. Don't block here — fall through to the chain
        // call and let the contract revert do the gating. The catch below
        // surfaces the chain error to the user.
        logger.warn(
          { jobId, err: (err as Error).message },
          'release self-heal: free stake pre-check failed, proceeding to chain',
        );
      }
    }

    try {
      await acceptEscrowOnChain(jobId, deal.sellerAgentWalletId);
      invalidateEscrowCache(jobId);
      account = await readEscrow(jobId);
      logger.info({ jobId }, 'release self-healed Funded -> Accepted via acceptEscrow');
    } catch (err) {
      const message = (err as Error).message;
      const lower = message.toLowerCase();
      const isInsufficientStake =
        lower.includes('insufficientstake') ||
        lower.includes('insufficientfreestake');
      const code = isInsufficientStake
        ? 'INSUFFICIENT_STAKE'
        : 'ACCEPT_ESCROW_FAILED';
      // When the on-chain revert reason isn't recognisable, the buyer needs a
      // recovery path that doesn't depend on the seller — disputing and
      // refunding still works from Funded, and doesn't touch stake reservations.
      const detail = isInsufficientStake
        ? `The seller's free stake won't cover this deal. Ask them to top up at /stake, or call the deal off via Propose Cancellation or Appeal This Deal to refund.`
        : `Couldn't accept the escrow on chain. The seller may be short on stake or gas. If retrying doesn't help, refund via Propose Cancellation or Appeal This Deal. (chain error: ${message})`;
      logger.error({ jobId, err: message, code }, 'release self-heal acceptEscrow failed');
      return c.json({ error: detail, code, detail: message }, 502);
    }
  }

  if (account.state !== ESCROW_ACCEPTED) {
    return c.json(
      { error: `escrow state must be Accepted(2), got ${account.state}. Releases run after the seller accepts the escrow.` },
      409,
    );
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

/// Seller asks the buyer for more delivery time. Off-chain only: the on-chain
/// escrow doesn't track deadlines, so this is a structured handshake stored
/// on the deal. Buyer responds via the matching /extension/respond route.
/// One pending request at a time; a second call replaces the first.
const extensionRequestSchema = z.object({
  caller: addrSchema,
  additionalSeconds: z.number().int().positive().max(30 * 86400),
  reason: z.string().trim().max(280).optional(),
});

dealsRoutes.post('/direct/:jobId/extension/request', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = extensionRequestSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the seller can request an extension' }, 403);
  }
  if (!deal.acceptedAt) {
    return c.json({ error: 'deal not accepted yet' }, 409);
  }
  if (deal.delivered) {
    return c.json({ error: 'already delivered' }, 409);
  }
  if (deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal is closed' }, 409);
  }
  if (deal.deadlineUnix == null) {
    return c.json(
      { error: 'this deal has no delivery deadline, so nothing to extend' },
      409,
    );
  }

  const requestedAt = Date.now();
  await patchDeal(jobId, {
    extensionRequest: {
      requestedBy: 'seller',
      requestedAt,
      additionalSeconds: body.additionalSeconds,
      ...(body.reason ? { reason: body.reason } : {}),
    },
  });
  bus.emitEvent({
    type: 'deal.extension.requested',
    jobId,
    actor: 'seller',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      additionalSeconds: body.additionalSeconds,
      reason: body.reason ?? null,
      currentDeadlineUnix: deal.deadlineUnix,
    },
  });
  logger.info(
    { jobId, additionalSeconds: body.additionalSeconds },
    'extension requested by seller',
  );
  return c.json({ accepted: true, jobId, requestedAt }, 200);
});

const extensionRespondSchema = z.object({
  caller: addrSchema,
  decision: z.enum(['approved', 'declined']),
});

dealsRoutes.post('/direct/:jobId/extension/respond', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = extensionRespondSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can respond to an extension request' }, 403);
  }
  const req = deal.extensionRequest;
  if (!req) {
    return c.json({ error: 'no extension request pending' }, 409);
  }
  if (deal.deadlineUnix == null) {
    // Edge case: the deal lost its deadline between request and respond.
    return c.json({ error: 'deal no longer has a deadline' }, 409);
  }

  const decidedAt = Date.now();
  const historyEntry: NonNullable<DirectDeal['extensionHistory']>[number] = {
    requestedBy: req.requestedBy,
    requestedAt: req.requestedAt,
    additionalSeconds: req.additionalSeconds,
    ...(req.reason ? { reason: req.reason } : {}),
    decidedAt,
    decision: body.decision,
  };

  const patch: Partial<DirectDeal> = {
    extensionRequest: undefined,
    extensionHistory: [...(deal.extensionHistory ?? []), historyEntry],
  };

  if (body.decision === 'approved') {
    const newDeadline = deal.deadlineUnix + req.additionalSeconds;
    patch.deadlineUnix = newDeadline;
    historyEntry.newDeadlineUnix = newDeadline;
  }

  await patchDeal(jobId, patch);
  bus.emitEvent({
    type: body.decision === 'approved' ? 'deal.extension.approved' : 'deal.extension.declined',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      additionalSeconds: req.additionalSeconds,
      ...(body.decision === 'approved' ? { newDeadlineUnix: patch.deadlineUnix } : {}),
    },
  });
  logger.info(
    { jobId, decision: body.decision, additionalSeconds: req.additionalSeconds },
    'extension response recorded',
  );
  return c.json(
    {
      accepted: true,
      jobId,
      decision: body.decision,
      ...(body.decision === 'approved'
        ? { newDeadlineUnix: patch.deadlineUnix }
        : {}),
    },
    200,
  );
});

/// Seller raises a delay appeal when the buyer is sitting on the final
/// release without acting. Off-chain only — the on-chain escrow stays
/// Accepted. The buyer has DEAL_DELAY_APPEAL_RESPONSE_MS to click respond,
/// otherwise the watcher auto-releases the final milestone.
dealsRoutes.post('/direct/:jobId/delay-appeal', async (c) => {
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
    return c.json({ error: 'only the seller can raise a delay appeal' }, 403);
  }
  if (!deal.reviewWindowStartedAt) {
    return c.json({ error: 'first milestone has not been released yet; nothing to appeal' }, 409);
  }
  if (deal.settledAt) {
    return c.json({ error: 'deal already settled' }, 409);
  }
  if (deal.disputed || deal.cancelledAt) {
    return c.json({ error: 'deal is disputed or cancelled' }, 409);
  }
  // Outstanding (un-responded) appeal already raised: refuse so the seller
  // can't spam the buyer's response window.
  const lastRaised = deal.delayAppealRaisedAt ?? 0;
  const lastResponded = deal.delayAppealRespondedAt ?? 0;
  if (lastRaised > lastResponded) {
    return c.json({ error: 'a delay appeal is already open; wait for the buyer to respond' }, 409);
  }
  const now = Date.now();
  if (now < deal.reviewWindowStartedAt + config.DEAL_DELAY_APPEAL_GRACE_MS) {
    const remaining = deal.reviewWindowStartedAt + config.DEAL_DELAY_APPEAL_GRACE_MS - now;
    return c.json(
      {
        error: 'too early to raise a delay appeal; give the buyer the grace period first',
        code: 'GRACE_PERIOD',
        msUntilEligible: remaining,
      },
      409,
    );
  }

  await patchDeal(jobId, {
    delayAppealRaisedAt: now,
    delayAppealCount: (deal.delayAppealCount ?? 0) + 1,
  });
  bus.emitEvent({
    type: 'deal.delay.appealed',
    jobId,
    actor: 'seller',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      responseWindowMs: config.DEAL_DELAY_APPEAL_RESPONSE_MS,
      raisedAt: now,
    },
  });
  return c.json({ accepted: true, jobId, raisedAt: now, responseWindowMs: config.DEAL_DELAY_APPEAL_RESPONSE_MS }, 200);
});

/// Buyer responds to the seller's delay appeal with a reason. Closes the
/// pending response window; the buyer keeps the manual-release gate. Seller
/// can raise another appeal later if the buyer still doesn't release.
dealsRoutes.post('/direct/:jobId/delay-appeal-respond', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = z
      .object({
        caller: addrSchema,
        reason: z.string().trim().min(1).max(600),
      })
      .parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can respond to a delay appeal' }, 403);
  }
  const lastRaised = deal.delayAppealRaisedAt ?? 0;
  const lastResponded = deal.delayAppealRespondedAt ?? 0;
  if (lastRaised <= lastResponded) {
    return c.json({ error: 'no open delay appeal to respond to' }, 409);
  }
  const now = Date.now();
  if (now > lastRaised + config.DEAL_DELAY_APPEAL_RESPONSE_MS) {
    return c.json(
      { error: 'response window already passed; the agent has likely auto-released by now', code: 'WINDOW_PASSED' },
      409,
    );
  }

  await patchDeal(jobId, {
    delayAppealRespondedAt: now,
    delayAppealResponse: body.reason,
  });
  bus.emitEvent({
    type: 'deal.delay.responded',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      respondedAt: now,
      reason: body.reason,
    },
  });
  return c.json({ accepted: true, jobId, respondedAt: now }, 200);
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
  if (account.state !== ESCROW_FUNDED && account.state !== ESCROW_ACCEPTED) {
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
    if (acct.state === ESCROW_FUNDED || acct.state === ESCROW_ACCEPTED) {
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

  // Once accepted and funded, unilateral cancel is gated on a delivery
  // deadline passing without delivery. Open-ended deals (no deadline set)
  // have no unilateral cancel path — only mutual cancel or appeal.
  if (!deal.deadlineUnix) {
    return c.json(
      {
        error:
          'this deal has no delivery deadline, so unilateral cancel is not available. Propose a mutual cancellation or open a dispute appeal instead.',
        code: 'NO_DEADLINE',
      },
      409,
    );
  }
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
  if (account.state !== ESCROW_FUNDED && account.state !== ESCROW_ACCEPTED) {
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
  /// 'mutual' / 'platform-attributed' are pre-dispute, rep-neutral resolutions.
  /// 'refund-from-dispute' / 'release-from-dispute' are Disputed-state
  /// resolutions; whichever party concedes takes a reputation hit on accept.
  kind: z
    .enum(['mutual', 'platform-attributed', 'refund-from-dispute', 'release-from-dispute'])
    .default('mutual'),
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
  if (
    account.state !== ESCROW_FUNDED &&
    account.state !== ESCROW_ACCEPTED &&
    account.state !== ESCROW_DISPUTED
  ) {
    return c.json({ error: `escrow is not in a cancellable state (${account.state})` }, 409);
  }

  inFlight.add(jobId);
  try {
    const isReleaseFromDispute = proposal.kind === 'release-from-dispute';
    const isRefundFromDispute = proposal.kind === 'refund-from-dispute';
    const isDisputeResolution = isReleaseFromDispute || isRefundFromDispute;

    const chainReason = isReleaseFromDispute
      ? `release from dispute: ${proposal.reason}`
      : isRefundFromDispute
        ? `refund from dispute: ${proposal.reason}`
        : `${proposal.kind === 'platform-attributed' ? 'platform' : 'mutual'} cancel: ${proposal.reason}`;

    // Disputed-state resolutions must already have the escrow in Disputed;
    // 'release-from-dispute' would not be a sensible request otherwise.
    // Pre-dispute proposals (mutual / platform-attributed) drive the escrow
    // through dispute() first so refund() can run, unless the seller already
    // appealed (Disputed state) — in which case skip dispute() to avoid
    // InvalidState.
    if (account.state !== ESCROW_DISPUTED) {
      if (isReleaseFromDispute) {
        return c.json(
          { error: 'release-from-dispute requires the escrow to be in Disputed state' },
          409,
        );
      }
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

    /// 'release-from-dispute' → releaseFromDispute(jobId); seller is paid in
    /// full and the chain records DisputeResolved (when reservation existed).
    /// Everything else → refund(jobId); buyer is refunded and the chain
    /// records Failed against the seller (when reservation existed).
    /// Both contract paths are buyer-only, so the buyer agent must sign.
    const txResult = isReleaseFromDispute
      ? await executeContractCall(
          {
            walletId: deal.buyerAgentWalletId,
            contractAddress: escrow.address,
            abiFunctionSignature: 'releaseFromDispute(bytes32)',
            abiParameters: [jobId],
          },
          `releaseFromDispute(${jobId})`,
        )
      : await executeContractCall(
          {
            walletId: deal.buyerAgentWalletId,
            contractAddress: escrow.address,
            abiFunctionSignature: 'refund(bytes32)',
            abiParameters: [jobId],
          },
          `refund(${jobId})`,
        );

    /// Identify the loser for the off-chain reputation signal. On a refund
    /// the seller concedes; on a release the buyer concedes. Pre-dispute
    /// kinds stay rep-neutral.
    const disputeLoser: 'buyer' | 'seller' | undefined = isReleaseFromDispute
      ? 'buyer'
      : isRefundFromDispute
        ? 'seller'
        : undefined;

    /// release-from-dispute lands the seller in Settled on chain — mirror
    /// that off-chain by setting settledAt (NOT cancelledAt) so the deal card
    /// reads "settled via dispute resolution". cancelKind still carries the
    /// resolution kind so the UI body can be honest about how it ended.
    /// All other resolutions are cancellations (refund flow).
    const now = Date.now();
    await patchDeal(jobId, {
      ...(isReleaseFromDispute ? { settledAt: now } : { cancelledAt: now }),
      cancelKind: proposal.kind,
      cancelReason: proposal.reason,
      cancellationProposal: undefined,
      ...(disputeLoser ? { disputeLoser } : {}),
    });
    bus.emitEvent({
      type: isReleaseFromDispute ? 'escrow.settled' : 'deal.cancelled',
      jobId,
      actor: callerRole,
      payload: {
        buyer: deal.buyer,
        seller: deal.seller,
        kind: proposal.kind,
        reason: proposal.reason,
        proposedBy: proposal.proposedBy,
        acceptedBy: callerRole,
        ...(disputeLoser ? { disputeLoser } : {}),
        txHash: txResult.txHash,
      },
    });
    // 'mutual' and 'platform-attributed' stay rep-neutral. Dispute-state
    // resolutions carry a reputation hit applied off-chain via signals.ts
    // reading disputeLoser; on-chain rep for trusted (reservation > 0) deals
    // is already recorded by the escrow contract.
    return c.json(
      { accepted: true, jobId, txHash: txResult.txHash, ...(isDisputeResolution ? { disputeLoser } : {}) },
      200,
    );
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
  const base = {
    ...deal,
    reviewWindowMs: config.DEAL_REVIEW_WINDOW_MS,
    delayAppealResponseWindowMs: config.DEAL_DELAY_APPEAL_RESPONSE_MS,
    delayAppealGraceMs: config.DEAL_DELAY_APPEAL_GRACE_MS,
  };
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
