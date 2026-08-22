import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { parseUnits, formatUnits, keccak256, toBytes } from 'viem';
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
  readUsdcAllowance,
  getEscrowFeeBps,
  computeFunding,
} from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import {
  releaseMilestone,
  finalizeIfSettled,
  acceptEscrow as acceptEscrowOnChain,
  claimMilestone as claimMilestoneOnChain,
  markDeliveredOnChain,
  guardianHold,
  guardianReleaseHold,
  guardianAttestDelivery,
  disputeEscrow,
  refundEscrow,
  reclaimAfterDeadline,
  extendDeadlineOnChain,
  buildFundEscrowCall,
  releaseFromDispute as releaseFromDisputeOnChain,
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
  dealMilestonePcts,
  type DirectDeal,
} from '../db/deals.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { appendActivity } from '../db/activityLog.js';
import {
  getMoneyMovementByOperationKey,
  listMoneyMovementsForAddress,
  listMoneyMovementsForJobParty,
} from '../db/moneyMovements.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  ensureMoneyMovement,
  markMoneyMovementNeedsAttention,
  markMoneyMovementVerifying,
  prepareMoneyMovementContractLeg,
  verifyConfirmedMoneyMovementLegByKey,
  verifyMoneyMovementLeg,
  type MoneyMovement,
} from '../money/service.js';
import { formatUsdcMicros } from '../money/model.js';
import {
  ensureEscrowRefundMovement,
  executeEscrowRefundMovement,
  remainingEscrowMicros,
} from '../money/escrowRefund.js';
import { executeEscrowMutualCancelMovement } from '../money/escrowMutualCancel.js';
import {
  expectedMilestonePayout,
  findAdvancedUnfinishedPayout,
  fundingEscrowMatches,
} from '../money/escrowProjection.js';
import { buildWorkRecord } from '../agents/workRecord.js';
import { accountTypeOf, deriveJobLane } from '../profile/accountType.js';
import { resolvePaytag } from '../paytag/resolve.js';
import { getBrief } from '../db/briefs.js';
import { createInvite, getInvite, getInviteByJob, markInviteUsed } from '../db/dealInvites.js';
import { provisionUserAgentWallets } from '../circle/wallets.js';
import { seedAgentFromOperator } from '../chain/agentSeed.js';
import { bus, recentEventsByType } from '../events.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { settleFactoringForDeal } from '../agents/factoringWatcher.js';
import { settlePOFinancingForDeal } from '../agents/poWatcher.js';
import { sendTelegramMessage, supportOperatorChatId } from '../telegram/bot.js';
import { findCarrier, trackingUrlFor, carrierOptions } from '../deals/carriers.js';
import { invalidBodyMessage } from './invalidBody.js';
import {
  releaseEligibleAt,
  termsFloorMs,
  buildPairHistory,
  pairKey,
} from '../deals/releaseWindow.js';
import { logger } from '../logger.js';
import { classifyAgentError } from '../chain/errors.js';
import { isSessionSelf, viewerAddress, readSession } from '../auth/session.js';
import { sendDealInviteEmail, formatExpiresLabel, formatWindowLabel } from '../emails/dealInvite.js';
import { sendDealUpdateEmail } from '../emails/dealUpdate.js';
import { sendDealCancelledEmail } from '../emails/dealCancelled.js';
import { scanDelivery } from '../security/sa-stub.js';
import { verifyDeliverable } from '../security/requirementCheck.js';
import { recordLinkOffense } from '../security/linkOffenses.js';
import { extractUrls } from '../security/extractUrls.js';
import { unresolvableHosts } from '../security/hostCheck.js';
import {
  buildDirectDealFundingQuote,
  fundingAuthorizationMatches,
} from '../deals/fundingQuote.js';

// ERC-20 USDC on Arc uses 6 decimals for escrow accounting.
const USDC_DECIMALS = 6;

const fundingMovementKey = (jobId: string) => `escrow_funding:${jobId.toLowerCase()}`;
const payoutMovementKey = (jobId: string, milestoneIndex: number) =>
  `escrow_release:${jobId.toLowerCase()}:${milestoneIndex}`;
const refundMovementKey = (jobId: string) => `escrow_refund:${jobId.toLowerCase()}`;
const mutualCancelMovementKey = (jobId: string) => `escrow_mutual_cancel:${jobId.toLowerCase()}`;

function publicMoneyMovement(movement: MoneyMovement) {
  return {
    reference: movement.reference,
    kind: movement.kind,
    state: movement.state,
    currency: movement.currency,
    amountUsdc: formatUsdcMicros(movement.amountMicros),
    summary: movement.summary,
    nextActor: movement.nextActor,
    expectedArrivalAt: movement.expectedArrivalAt,
    jobId: movement.jobId,
    milestoneIndex: movement.milestoneIndex,
    failureCode: movement.failureCode,
    createdAt: movement.createdAt,
    updatedAt: movement.updatedAt,
    completedAt: movement.completedAt,
    legs: movement.legs.map((leg) => ({
      key: leg.key,
      label: leg.label,
      rail: leg.rail,
      state: leg.state,
      providerId: leg.providerId,
      txHash: leg.txHash,
      explorerUrl: leg.explorerUrl,
      submittedAt: leg.submittedAt,
      confirmedAt: leg.confirmedAt,
      verifiedAt: leg.verifiedAt,
    })),
  };
}

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
    /// Paytag handle (P2P only). Resolved to an address here, at creation, and
    /// that address is what the deal settles against forever. Handles are
    /// transferable ERC-721s, so a lazily-resolved handle would let the
    /// counterparty redirect the money mid-deal.
    sellerPaytag: z
      .string()
      .trim()
      .regex(/^@?[a-zA-Z0-9_-]{1,32}$/, 'expected a paytag handle like @sarah')
      .optional(),
    dealAmountUsdc: z.number().positive(),
    // Optional delivery deadline. When omitted (or both fields = 0) the deal
    // is open-ended, the seller has no time pressure and the buyer can't
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
    /// On v2.E+ escrows pass reservationBps=0 to fundEscrow, the vault is
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
    /// SME trade-finance fields (Phase 2 Track 2). All optional; service-flow
    /// direct deals continue to post without them.
    tradeType: z.enum(['service', 'goods', 'mixed']).optional(),
    incoterms: z.enum(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']).optional(),
    paymentTerms: z.enum(['immediate', 'net30', 'net60', 'net90']).optional(),
    counterpartyCompany: z
      .object({
        name: z.string().max(120).optional(),
        sector: z.string().max(40).optional(),
        region: z.string().max(80).optional(),
      })
      .optional(),
    documentRefs: z
      .array(
        z.object({
          hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
          kind: z.enum(['invoice', 'po', 'bol', 'coo', 'pod', 'other']),
          label: z.string().max(120).optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine(
    (b) =>
      // Either both zero (open-ended) or at least 1 hour total.
      (b.deadlineDays === 0 && (b.deadlineHours ?? 0) === 0) ||
      b.deadlineDays * 24 + (b.deadlineHours ?? 0) >= 1,
    { message: 'when set, deadline must be at least 1 hour', path: ['deadlineHours'] },
  )
  .refine(
    (b) => [b.sellerAddress, b.sellerEmail, b.sellerPaytag].filter(Boolean).length === 1,
    {
      message: 'provide exactly one of sellerAddress, sellerEmail or sellerPaytag',
      path: ['sellerAddress'],
    },
  );

/// Pre-accept edit. Mirrors the create schema but every field is optional and
/// the counterparty (sellerAddress / sellerEmail) cannot move. A patch with no
/// changes is rejected so the audit trail stays meaningful. Editing
/// acceptanceWindowHours or the delivery deadline reanchors the clock from
/// now, since both are forward-looking durations and a stale anchor would feel
/// like the seller's window quietly shrank.
const editSchema = z
  .object({
    caller: addrSchema,
    dealAmountUsdc: z.number().positive().optional(),
    deadlineDays: z.number().int().min(0).max(180).optional(),
    deadlineHours: z.number().int().min(0).max(23).optional(),
    acceptanceWindowHours: z.number().int().min(1).max(720).optional(),
    terms: z.string().min(1).max(600).optional(),
    firstReleasePct: z.number().int().min(1).max(99).optional(),
    requireStake: z.boolean().optional(),
    requireStakePct: z
      .number()
      .int()
      .min(50)
      .max(100)
      .optional()
      .refine((v) => v === undefined || v % 5 === 0, {
        message: 'requireStakePct must be a multiple of 5',
      }),
  })
  .refine(
    (b) => {
      const dd = b.deadlineDays;
      const dh = b.deadlineHours;
      if (dd === undefined && dh === undefined) return true;
      const days = dd ?? 0;
      const hours = dh ?? 0;
      return (days === 0 && hours === 0) || days * 24 + hours >= 1;
    },
    { message: 'when set, deadline must be at least 1 hour', path: ['deadlineHours'] },
  );

const callerSchema = z.object({ caller: addrSchema });
const fundSchema = z.object({
  caller: addrSchema,
  expectedFeeBps: z.number().int().min(0).max(10_000),
  maxFundedAmountUsdc: z
    .string()
    .regex(/^\d+(?:\.\d{1,6})?$/, 'expected a positive USDC amount with at most 6 decimals'),
  quoteFingerprint: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});
const deliveredSchema = z.object({
  caller: addrSchema,
  deliveryProof: z.string().min(1).max(600).optional(),
  /// Required on a GOODS deal. Services deliver a link; goods deliver a
  /// shipment reference the buyer can open.
  shipment: z
    .object({
      carrier: z.string().min(1).max(40),
      trackingNumber: z.string().min(3).max(60),
      /// Only for carriers with no known tracking page.
      trackingUrl: z.string().max(400).optional(),
    })
    .optional(),
});
const appealSchema = z.object({
  caller: addrSchema,
  reason: z.string().min(1).max(400).optional(),
});

const inFlight = new Set<string>();

export const dealsRoutes = new Hono();

/// Create a direct deal. The escrow is not funded here: the deal sits in
/// awaiting-seller until the named seller agrees. The buyer must have activated
/// their agent wallets; the seller activates lazily on agreement.
dealsRoutes.post('/direct', async (c) => {
  let body;
  try {
    body = createSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (
    body.sellerAddress &&
    body.buyerAddress.toLowerCase() === body.sellerAddress.toLowerCase()
  ) {
    return c.json({ error: 'buyer and seller must be different wallets' }, 400);
  }
  // Only the buyer can open a deal as themselves.
  if (!isSessionSelf(c, body.buyerAddress)) {
    return c.json({ error: 'You can only open a deal as your own wallet.', code: 'forbidden' }, 403);
  }

  // The buyer agent funds escrow only after the seller agrees and the buyer
  // confirms a live quote, so it must exist now. The seller activates lazily.
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

  // Paytag mode: resolve the handle NOW and pin the address onto the deal. From
  // here on the deal is an address deal that happens to remember a label. The
  // handle is never resolved again, because it is a transferable ERC-721 and a
  // late resolve would let the seller move it and redirect the payout.
  let sellerPaytag: string | undefined;
  let resolvedPaytagAddress: string | undefined;
  if (body.sellerPaytag) {
    if (!config.PAYTAG_ENABLED) {
      return c.json({ error: 'paytag counterparties are not enabled', code: 'paytag_disabled' }, 409);
    }
    const hit = await resolvePaytag(body.sellerPaytag);
    if (!hit) {
      return c.json(
        {
          error: 'that paytag could not be found',
          detail: 'Check the handle with your counterparty, or name them by wallet address instead.',
          code: 'paytag_unresolved',
        },
        404,
      );
    }
    if (hit.address.toLowerCase() === body.buyerAddress.toLowerCase()) {
      return c.json({ error: 'buyer and seller must be different wallets' }, 400);
    }
    sellerPaytag = hit.handle;
    resolvedPaytagAddress = hit.address;
  }

  const sellerAddress = resolvedPaytagAddress ?? body.sellerAddress ?? PENDING_COUNTERPARTY_ADDRESS;

  // Stamp the match lane from the creator's account type plus the trade nature.
  // A finance-lane direct deal (SME/B2B) is between verified businesses on both
  // sides: a known counterparty is checked now, a pending invited one at accept.
  const creatorAccountType = await accountTypeOf(body.buyerAddress);
  const tradeLane = deriveJobLane(creatorAccountType, body.tradeType);

  // P2P only, for now. A handle is a nickname, not a verification: anyone can
  // claim any unclaimed name. The finance lane moves real credit against a
  // verified business, so it keeps demanding one and will not take a handle.
  if (tradeLane === 'finance' && sellerPaytag) {
    return c.json(
      {
        error: 'finance-lane deals cannot name the counterparty by paytag',
        detail:
          'SME trade-finance deals are between verified businesses. Name the counterparty by wallet address.',
        code: 'paytag_not_in_finance_lane',
      },
      409,
    );
  }

  if (tradeLane === 'finance' && body.sellerAddress) {
    const sellerType = await accountTypeOf(body.sellerAddress);
    if (sellerType !== 'business') {
      return c.json(
        {
          error: 'finance-lane deals require a verified business counterparty',
          detail:
            'SME trade-finance deals are between verified businesses. The named counterparty is not verified.',
        },
        409,
      );
    }
  }

  const deal = await createDeal({
    jobId,
    buyer: body.buyerAddress,
    seller: sellerAddress,
    sellerPaytag,
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
    tradeLane,
    partyKind: creatorAccountType,
    tradeType: body.tradeType,
    incoterms: body.incoterms,
    paymentTerms: body.paymentTerms,
    counterpartyCompany: body.counterpartyCompany,
    documentRefs: body.documentRefs,
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
        /// Two-deadline block on the email: how long they have to ACCEPT
        /// the deal, and how long the SELLER then has to DELIVER.
        acceptanceLabel: formatWindowLabel({ hours: body.acceptanceWindowHours }),
        deliveryLabel: formatWindowLabel({
          days: body.deadlineDays,
          hours: body.deadlineHours,
        }),
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
    'direct deal created, awaiting seller agreement',
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

/// Buyer-side pre-funding edit. Lets the buyer rework deal terms while no money
/// has moved. Refused after deal.acceptedAt because at that point the
/// escrow is funded on chain and dealAmountUsdc / firstReleasePct are locked in
/// the milestone array. Counterparty is intentionally not editable: changing
/// who the deal is for is a different deal. When the buyer touches
/// acceptanceWindowHours or the delivery deadline, the clock reanchors from
/// now so the seller's window matches the new terms.
dealsRoutes.post('/direct/:jobId/edit', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = editSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can edit this deal' }, 403);
  }
  if (deal.acceptedAt) {
    return c.json(
      { error: 'this deal has already accepted; terms are locked', code: 'ACCEPTED' },
      409,
    );
  }
  if (deal.cancelledAt) {
    return c.json({ error: 'this deal is cancelled', code: 'CANCELLED' }, 409);
  }

  const patch: Partial<DirectDeal> = {};
  if (body.dealAmountUsdc !== undefined) {
    patch.dealAmountUsdc = body.dealAmountUsdc.toString();
  }
  if (body.terms !== undefined) {
    patch.terms = body.terms;
  }
  if (body.firstReleasePct !== undefined) {
    patch.firstReleasePct = body.firstReleasePct;
  }
  if (body.deadlineDays !== undefined || body.deadlineHours !== undefined) {
    const days = body.deadlineDays ?? 0;
    const hours = body.deadlineHours ?? 0;
    const totalSeconds = days * 86400 + hours * 3600;
    const nowSeconds = Math.floor(Date.now() / 1000);
    patch.deadlineUnix = totalSeconds > 0 ? nowSeconds + totalSeconds : undefined;
  }
  if (body.acceptanceWindowHours !== undefined) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    patch.acceptanceDeadlineUnix = nowSeconds + body.acceptanceWindowHours * 3600;
  }
  if (body.requireStake !== undefined) {
    patch.requireStake = body.requireStake;
    if (body.requireStake) {
      patch.requireStakePct = body.requireStakePct ?? deal.requireStakePct ?? 50;
    } else {
      patch.requireStakePct = undefined;
    }
  } else if (body.requireStakePct !== undefined && deal.requireStake) {
    patch.requireStakePct = body.requireStakePct;
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'no changes provided' }, 400);
  }

  // Agreement applies to one exact version of the commercial terms. Any
  // buyer edit before funding sends the revised deal back to seller review.
  if (deal.sellerApprovedAt) {
    patch.sellerApprovedAt = undefined;
  }

  const updated = await patchDeal(jobId, patch);
  /// Human-readable change labels for the email body + the Telegram message
  /// the notifier will render off the bus event. Built from `patch` so the
  /// list only names fields that actually moved.
  const changedLabels: string[] = [];
  if (patch.dealAmountUsdc !== undefined) {
    changedLabels.push(`Amount is now ${patch.dealAmountUsdc} USDC`);
  }
  if (patch.firstReleasePct !== undefined) {
    changedLabels.push(
      `Milestone split: ${patch.firstReleasePct}% on delivery / ${100 - patch.firstReleasePct}% on verification`,
    );
  }
  if (patch.deadlineUnix !== undefined) {
    changedLabels.push(
      patch.deadlineUnix
        ? `Delivery window updated to ${formatWindowLabel({ days: body.deadlineDays, hours: body.deadlineHours })}`
        : 'Delivery deadline removed (open-ended)',
    );
  }
  if (patch.acceptanceDeadlineUnix !== undefined) {
    changedLabels.push(
      `Acceptance window updated to ${formatWindowLabel({ hours: body.acceptanceWindowHours })}`,
    );
  }
  if (patch.terms !== undefined) {
    changedLabels.push('Work description updated');
  }
  if (patch.requireStake !== undefined) {
    changedLabels.push(
      patch.requireStake
        ? `Trusted-match enabled (${patch.requireStakePct ?? deal.requireStakePct ?? 50}% stake)`
        : 'Trusted-match disabled',
    );
  } else if (patch.requireStakePct !== undefined && deal.requireStake) {
    changedLabels.push(`Stake requirement updated to ${patch.requireStakePct}%`);
  }

  bus.emitEvent({
    type: 'deal.direct.edited',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      fields: Object.keys(patch),
      changedLabels,
    },
  });
  /// Pending-invite recipients haven't signed in yet, so the Telegram path
  /// can't reach them. Send a branded update email to the address on the
  /// invite record. Fire-and-forget so a transient send failure never blocks
  /// the edit response, the buyer still gets a 200 either way.
  const pendingEmail = updated?.pendingCounterparty?.email ?? null;
  const pendingInvite = pendingEmail ? getInviteByJob(jobId) : null;
  if (updated && pendingInvite && pendingEmail) {
    const base = (config.FRONTEND_BASE_URL ?? '').replace(/\/$/, '');
    const claimUrl = `${base}/invite/${pendingInvite.token}`;
    const maskedInviter = `${deal.buyer.slice(0, 6)}…${deal.buyer.slice(-4)}`;
    /// Only include the deadline block when the edit actually touched a
    /// timing field. A pure amount or terms edit shouldn't re-anchor the
    /// recipient on numbers that didn't change.
    const includeWindow =
      patch.acceptanceDeadlineUnix !== undefined ||
      patch.deadlineUnix !== undefined;
    void sendDealUpdateEmail({
      to: pendingEmail,
      claimUrl,
      dealAmountUsdc: updated.dealAmountUsdc,
      inviterMasked: maskedInviter,
      changedLabels,
      ...(includeWindow && body.acceptanceWindowHours !== undefined
        ? { acceptanceLabel: formatWindowLabel({ hours: body.acceptanceWindowHours }) }
        : {}),
      ...(includeWindow && (body.deadlineDays !== undefined || body.deadlineHours !== undefined)
        ? {
            deliveryLabel: formatWindowLabel({
              days: body.deadlineDays,
              hours: body.deadlineHours,
            }),
          }
        : {}),
    }).catch((err) => {
      logger.warn(
        { err: (err as Error).message, jobId, to: pendingEmail },
        'deal update email send threw',
      );
    });
  }
  return c.json({ accepted: true, jobId, deal: updated }, 200);
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
  // and a 24h acceptance window has both windows pinned to deal creation.
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
      /// Surface the amount on the event so the bell + Telegram message
      /// can read it inline, same shape deal.direct.created already uses.
      /// Without this the post-claim notification reads "deal bound" with
      /// no number, which is the user-facing point of the new ping.
      dealAmountUsdc: deal.dealAmountUsdc,
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
/// Carriers the goods-delivery form offers. Public: it is a static list, and
/// the seller needs it before they are anywhere near a signed action.
dealsRoutes.get('/carriers', (c) => c.json({ carriers: carrierOptions() }));

dealsRoutes.get('/direct', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  // A deal list is private to its party (amounts, counterparties, escrow
  // state). The query param names whose list to read; the session must BE
  // that party, matching the detail route's gate.
  if (!isSessionSelf(c, parsed.data)) {
    return c.json({ error: 'sign in as this address to read these deals' }, 403);
  }

  const deals = await listDealsForAddress(parsed.data);
  // Read the party-scoped movement index once, then join by job id. The deal
  // list is a read path and must not turn into one database query per row.
  const partyMovements = await listMoneyMovementsForAddress(parsed.data, 200).catch(() => []);
  const referencesByJob = new Map<string, string[]>();
  for (const movement of partyMovements) {
    if (!movement.jobId) continue;
    const key = movement.jobId.toLowerCase();
    const refs = referencesByJob.get(key) ?? [];
    if (!refs.includes(movement.reference)) refs.push(movement.reference);
    referencesByJob.set(key, refs);
  }
  const enriched = await Promise.all(
    deals.map(async (d) => {
      const deal = await enrich(d);
      // Attach only the signed-in party's durable movement references. The
      // deal list must never fall back to wallet addresses or raw tx hashes.
      const receiptReferences = referencesByJob.get(d.jobId.toLowerCase()) ?? [];
      return receiptReferences.length ? { ...deal, receiptReferences } : deal;
    }),
  );
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
  // Private per-party payload: keep it out of shared caches and the mobile
  // bfcache so the next viewer on the device never sees a stale render.
  c.header('Cache-Control', 'no-store');
  const enriched = await enrich(deal);
  // Hold a suspicious/malicious delivery link back from the BUYER until it's
  // cleared. The seller (who submitted it) always sees their own proof. The
  // status + reasons still ride along so the UI can explain the hold.
  const viewerIsBuyer = caller === deal.buyer.toLowerCase();
  const held =
    enriched.verificationStatus === 'suspicious' || enriched.verificationStatus === 'malicious';
  // The delivery requirement review (deliveryMatch) is the BUYER's private
  // judgment of the seller's work — it must never reach the seller. The client
  // also gates it; this strip is the authoritative defense.
  const shaped = viewerIsBuyer ? enriched : { ...enriched, deliveryMatch: undefined };
  if (viewerIsBuyer && held && enriched.deliveryProof) {
    return c.json({ deal: { ...shaped, deliveryProof: undefined } });
  }
  return c.json({ deal: shaped });
});

/// Party-scoped settlement records. Internal wallet ids, idempotency keys,
/// contract addresses, and participant indexes never leave the backend.
dealsRoutes.get('/direct/:jobId/movements', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  const caller = viewerAddress(c);
  const isParty =
    !!caller &&
    (caller === deal.buyer.toLowerCase() || caller === deal.seller.toLowerCase());
  if (!caller || !isParty) {
    return c.json({ error: 'This deal is private to its buyer and seller.', code: 'private' }, 403);
  }
  c.header('Cache-Control', 'no-store');
  const movements = await listMoneyMovementsForJobParty(jobId, caller);
  return c.json({ movements: movements.map(publicMoneyMovement) });
});

/// The counterparty's real work record: the granular, DB-private view a buyer
/// pays the internal pull to see, not the aggregate tier on the public passport.
/// Party-gated. Unlocked when agent research was paid for this deal (the same
/// signal behind the AGENT RESEARCH card); otherwise returns a locked stub. The
/// record never leaks the counterparty's PAST counterparties or exact terms.
dealsRoutes.get('/direct/:jobId/counterparty-report', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  const caller = viewerAddress(c);
  const isParty =
    !!caller &&
    (caller === deal.buyer.toLowerCase() || caller === deal.seller.toLowerCase());
  if (!isParty) {
    return c.json({ error: 'This deal is private to its buyer and seller.', code: 'private' }, 403);
  }
  // Report on the caller's counterparty, and gate on the SAME paid pull whose
  // receipt we show: the buyer paid to read the seller, the seller paid to read
  // the buyer. Unlocking the granular record on the payment that bought it (not
  // the unrelated market read) keeps the story coherent: the record is visible
  // exactly when, and because, its own credit-passport pull was paid.
  const callerIsBuyer = caller === deal.buyer.toLowerCase();
  const subject = callerIsBuyer ? deal.seller : deal.buyer;

  // The subject's side on THIS deal decides which record renders: the buyer
  // vets the seller's delivered work, the seller vets the buyer's funded deals.
  const subjectRole: 'seller' | 'buyer' = callerIsBuyer ? 'seller' : 'buyer';

  // Newer deals carry the durable pull; read the one for this subject.
  if (deal.passportPulls) {
    const pull = callerIsBuyer ? deal.passportPulls.seller : deal.passportPulls.buyer;
    if (!pull) return c.json({ locked: true, subject });
    const record = await buildWorkRecord(subject, Date.now(), subjectRole);
    const payment = {
      amountUsd: pull.amountUsd,
      txHash: pull.txHash,
      payer: pull.payer,
      depositTxHash: pull.depositTxHash,
    };
    return c.json({ locked: false, subject, record, payment });
  }

  // Legacy deals (created before passportPulls): fall back to the old gate on
  // the market read, with the receipt recovered from the agent.paid event log.
  if (!deal.marketRead) {
    return c.json({ locked: true, subject });
  }
  const record = await buildWorkRecord(subject, Date.now(), subjectRole);
  const payment = await paidPullReceipt(jobId);
  return c.json({ locked: false, subject, record, payment });
});

/// Legacy receipt path for deals created before the pull was persisted on the
/// deal: recover the credit-passport pull from the agent.paid event on the Arc
/// rail. Returns the amount + tx, or null when there was no paid pull
/// (unactivated agent, capped, cache hit) or it aged out of the event log. The
/// Arc settlement rides Circle Gateway batching, so txHash may be a batch
/// reference or empty; the UI only links it when it looks like a real hash.
async function paidPullReceipt(
  jobId: string,
): Promise<{ amountUsd: number; txHash?: string } | null> {
  const events = await recentEventsByType(['agent.paid'], 20, jobId);
  const arcPull = events.find(
    (e) => e.payload?.rail === 'arc' && e.payload?.kind === 'reputation',
  );
  if (!arcPull) return null;
  const amountUsd = Number(arcPull.payload?.amountUsd);
  const txHash = typeof arcPull.payload?.txHash === 'string' ? arcPull.payload.txHash : undefined;
  return { amountUsd: Number.isFinite(amountUsd) ? amountUsd : 0, txHash };
}

/// Exact, read-only escrow quote for the current deal and contract fee. The
/// buyer must echo the economic terms back to the fund endpoint, which prevents
/// an owner-settable fee from changing silently between review and execution.
dealsRoutes.get('/direct/:jobId/funding-quote', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  const caller = c.req.query('caller');
  if (!caller || !addrSchema.safeParse(caller).success || !isSessionSelf(c, caller)) {
    return c.json({ error: 'You can only view a funding quote as yourself.', code: 'forbidden' }, 403);
  }
  const normalizedCaller = caller.toLowerCase();
  if (normalizedCaller !== deal.buyer && normalizedCaller !== deal.seller) {
    return c.json({ error: 'only a party to this deal can view its funding quote' }, 403);
  }
  if (deal.cancelledAt) {
    return c.json({ error: 'this deal was cancelled', code: 'CANCELLED' }, 409);
  }
  if (deal.acceptedAt) {
    return c.json({ error: 'this deal is already funded', code: 'ALREADY_FUNDED' }, 409);
  }
  if (!deal.sellerApprovedAt) {
    return c.json(
      { error: 'the seller must agree to the terms before funding', code: 'SELLER_APPROVAL_REQUIRED' },
      409,
    );
  }

  const feeBps = await getEscrowFeeBps({ fresh: true });
  return c.json({
    quote: buildDirectDealFundingQuote({ jobId, dealAmountUsdc: deal.dealAmountUsdc, feeBps }),
  });
});

/// Seller agrees to the current commercial terms. This may provision their
/// agent identity, but it never approves, transfers, or locks the buyer's USDC.
/// The buyer performs the separate, exact-amount funding authorization below.
dealsRoutes.post('/direct/:jobId/accept', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can agree to this deal' }, 403);
  }
  if (deal.tradeLane === 'finance') {
    const sellerType = await accountTypeOf(deal.seller);
    if (sellerType !== 'business') {
      return c.json(
        {
          error: 'finance-lane deals require a verified business',
          detail: 'This is an SME trade-finance deal. Only a verified business can agree to it.',
        },
        403,
      );
    }
  }
  if (deal.acceptedAt) {
    return c.json({ accepted: true, jobId, status: 'funded' as const }, 200);
  }
  if (deal.cancelledAt) {
    return c.json({ error: 'this deal was cancelled' }, 409);
  }
  if (deal.acceptanceDeadlineUnix && deal.acceptanceDeadlineUnix < Math.floor(Date.now() / 1000)) {
    return c.json(
      { error: 'the acceptance window has ended', code: 'ACCEPTANCE_EXPIRED' },
      409,
    );
  }
  if (deal.sellerApprovedAt) {
    return c.json({ accepted: true, jobId, status: 'seller-approved' as const }, 200);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  inFlight.add(jobId);
  try {
    let sellerAgents = await getAgentWallets(deal.seller);
    if (!sellerAgents) {
      const provisioned = await provisionUserAgentWallets(deal.seller);
      sellerAgents = await saveAgentWallets({ userAddress: deal.seller, ...provisioned });
      void seedAgentFromOperator(sellerAgents.buyerAddress, {
        owner: sellerAgents.userAddress,
        agent: 'buyer',
      });
      void seedAgentFromOperator(sellerAgents.sellerAddress, {
        owner: sellerAgents.userAddress,
        agent: 'seller',
      });
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

    const sellerApprovedAt = Date.now();
    await patchDeal(jobId, {
      sellerApprovedAt,
      sellerAgentWalletId: sellerAgents.sellerWalletId,
      sellerAgentAddress: sellerAgents.sellerAddress,
    });
    bus.emitEvent({
      type: 'deal.seller-approved',
      jobId,
      actor: 'seller',
      payload: {
        seller: deal.seller,
        buyer: deal.buyer,
        dealAmountUsdc: deal.dealAmountUsdc,
      },
    });
    logger.info({ jobId, seller: deal.seller }, 'seller agreed to direct deal terms');
    return c.json({ accepted: true, jobId, status: 'seller-approved' as const, sellerApprovedAt }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'seller approval failed');
    return c.json({ error: 'approval failed', code: info.code }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer authorizes the exact current total and funds the escrow. The existing
/// chain verification and retry logic stays here so acceptedAt continues to
/// mean the escrow is funded and Accepted onchain.
dealsRoutes.post('/direct/:jobId/fund', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = fundSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can fund this deal' }, 403);
  }
  // Finance-lane (SME/B2B) deals require the accepting seller to be a verified
  // business. Catches the pending-invite case where the counterparty wasn't
  // known at create time.
  if (deal.tradeLane === 'finance') {
    const sellerType = await accountTypeOf(deal.seller);
    if (sellerType !== 'business') {
      return c.json(
        {
          error: 'finance-lane deals require a verified business',
          detail: 'This is an SME trade-finance deal. Only a verified business can accept it.',
        },
        403,
      );
    }
  }
  if (deal.acceptedAt) {
    return c.json({ accepted: true, jobId, status: 'funded' as const }, 200);
  }
  if (deal.cancelledAt) {
    return c.json({ error: 'this deal was cancelled' }, 409);
  }
  if (!deal.buyerAgentWalletId || !deal.buyerAgentAddress) {
    return c.json({ error: 'this deal has no buyer agent wallet on record' }, 409);
  }
  if (!deal.sellerApprovedAt) {
    return c.json(
      { error: 'the seller must agree to the terms before funding', code: 'SELLER_APPROVAL_REQUIRED' },
      409,
    );
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  inFlight.add(jobId);
  let movementReference: string | undefined;
  try {
    // Lazily provision the seller's agent wallets on first accept.
    let sellerAgents = await getAgentWallets(deal.seller);
    if (!sellerAgents) {
      const provisioned = await provisionUserAgentWallets(deal.seller);
      sellerAgents = await saveAgentWallets({ userAddress: deal.seller, ...provisioned });
      // Seed the freshly-provisioned agents with the operator gas float so they
      // can act on this deal. Best-effort + idempotent, same as activation.
      void seedAgentFromOperator(sellerAgents.buyerAddress, { owner: sellerAgents.userAddress, agent: 'buyer' });
      void seedAgentFromOperator(sellerAgents.sellerAddress, { owner: sellerAgents.userAddress, agent: 'seller' });
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

    const milestonePcts = dealMilestonePcts(deal);
    const dealAmountWei = parseUnits(deal.dealAmountUsdc, USDC_DECIMALS);
    const operationKey = fundingMovementKey(jobId);
    const existingMovement = await getMoneyMovementByOperationKey(operationKey);
    movementReference = existingMovement?.reference;

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
      if (
        !fundingEscrowMatches(preEscrow, {
          buyerAgent: deal.buyerAgentAddress,
          sellerAgent: sellerAgents.sellerAddress,
          dealAmount: dealAmountWei,
          milestonePcts,
        })
      ) {
        logger.error({ jobId, escrowState: preEscrow.state }, 'existing escrow does not match deal');
        return c.json(
          { error: 'the protected funds do not match this deal', code: 'ESCROW_MISMATCH' },
          409,
        );
      }

      if (movementReference) {
        await verifyConfirmedMoneyMovementLegByKey(movementReference, 'approve');
        await verifyConfirmedMoneyMovementLegByKey(movementReference, 'fund');
      }

      if (preEscrow.state === ESCROW_FUNDED) {
        try {
          if (movementReference) {
            const activation = await prepareMoneyMovementContractLeg(movementReference, {
              key: 'activate',
              label: 'Activate escrow protection',
              rail: 'circle_wallets',
              walletId: sellerAgents.sellerWalletId,
              signerAddress: sellerAgents.sellerAddress,
              contractAddress: escrow.address,
            });
            await acceptEscrowOnChain(jobId, sellerAgents.sellerWalletId, {
              idempotencyKey: activation.idempotencyKey,
              lifecycle: activation.lifecycle,
            });
            await verifyMoneyMovementLeg(movementReference, activation.leg.id);
          } else {
            await acceptEscrowOnChain(jobId, sellerAgents.sellerWalletId);
          }
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
            : 'Escrow activation did not complete. Retry is safe because Karwan checks the existing escrow before another transfer.';
          logger.error({ jobId, err: message, code }, 'escrow activation recovery failed');
          if (movementReference) {
            await markMoneyMovementNeedsAttention(
              movementReference,
              code,
              isInsufficientStake ? 'seller' : 'karwan',
            ).catch(() => undefined);
          }
          return c.json({ error: detail, code }, 502);
        }
      }

      invalidateEscrowCache(jobId);
      const recoveredAccount = await readEscrow(jobId);
      if (
        recoveredAccount.state !== ESCROW_ACCEPTED ||
        !fundingEscrowMatches(recoveredAccount, {
          buyerAgent: deal.buyerAgentAddress,
          sellerAgent: sellerAgents.sellerAddress,
          dealAmount: dealAmountWei,
          milestonePcts,
        })
      ) {
        if (movementReference) {
          await markMoneyMovementNeedsAttention(
            movementReference,
            'ACCEPT_NOT_CONFIRMED',
            'karwan',
          ).catch(() => undefined);
        }
        return c.json(
          { error: 'escrow activation is still being verified', code: 'ACCEPT_NOT_CONFIRMED' },
          502,
        );
      }

      if (movementReference) {
        await verifyConfirmedMoneyMovementLegByKey(movementReference, 'activate');
        await markMoneyMovementVerifying(movementReference);
      }
      const recoveredProof = movementReference
        ? await currentMoneyMovement(movementReference)
        : null;
      const recoveredFundHash = recoveredProof?.legs.find(
        (leg) => leg.key === 'fund' && leg.txHash,
      )?.txHash;
      await patchDeal(jobId, {
        acceptedAt: deal.acceptedAt ?? Date.now(),
        sellerAgentWalletId: sellerAgents.sellerWalletId,
        sellerAgentAddress: sellerAgents.sellerAddress,
        ...(recoveredFundHash && !deal.fundTxHash ? { fundTxHash: recoveredFundHash } : {}),
      });
      let receiptPending = false;
      if (movementReference) {
        try {
          await completeMoneyMovement(movementReference, {
            amountMicros: recoveredProof?.amountMicros ?? '0',
            summary: 'Escrow funded and protection activated',
          });
        } catch (err) {
          receiptPending = true;
          logger.warn(
            { jobId, reference: movementReference, err: (err as Error).message },
            'escrow recovered but movement proof remains incomplete',
          );
          await markMoneyMovementNeedsAttention(
            movementReference,
            'RECEIPT_RECONCILIATION_REQUIRED',
            'karwan',
          ).catch(() => undefined);
        }
      }
      bus.emitEvent({
        type: 'deal.accepted',
        jobId,
        actor: 'buyer',
        payload: { seller: deal.seller, buyer: deal.buyer },
      });
      logger.info(
        { jobId, escrowState: preEscrow.state },
        'escrow already past Funded; marked accepted (idempotent recovery)',
      );
      return c.json(
        {
          accepted: true,
          jobId,
          status: 'funded' as const,
          recovered: true,
          ...(movementReference ? { reference: movementReference, receiptPending } : {}),
        },
        200,
      );
    }

    // Fund the escrow now: the buyer agent approves, then funds it naming the
    // seller agent as the on-chain seller. A managed deal may carry a stored
    // N-part split; direct deals resolve to the two-part shape.
    const feeBps = await getEscrowFeeBps({ fresh: true });
    const { fundedAmount } = computeFunding(dealAmountWei, feeBps);
    const currentQuote = buildDirectDealFundingQuote({
      jobId,
      dealAmountUsdc: deal.dealAmountUsdc,
      feeBps,
    });
    if (!fundingAuthorizationMatches(currentQuote, body)) {
      return c.json(
        {
          error: 'the funding total changed before confirmation',
          code: 'QUOTE_CHANGED',
          quote: currentQuote,
        },
        409,
      );
    }

    // Trusted deals reserve seller stake during acceptEscrow. Check it before
    // any buyer approval or transfer so a known seller shortfall cannot strand
    // buyer USDC in the intermediate Funded state. The contract still enforces
    // this again, covering state changes after the preflight.
    const reservationBps = deal.requireStake
      ? Math.round((deal.requireStakePct ?? 50) * 100)
      : 0;
    if (reservationBps > 0) {
      try {
        const reservationWei = (dealAmountWei * BigInt(reservationBps)) / 10000n;
        const sellerFreeWei = (await vault.read.freeStakeOf([
          deal.seller as `0x${string}`,
        ])) as bigint;
        if (sellerFreeWei < reservationWei) {
          const reservationUsdc = formatUnits(reservationWei, USDC_DECIMALS);
          const freeUsdc = formatUnits(sellerFreeWei, USDC_DECIMALS);
          const message = `Seller needs ${reservationUsdc} USDC available in stake for this deal and currently has ${freeUsdc} USDC. No buyer funds moved.`;
          bus.emitEvent({
            type: 'agent.error',
            jobId,
            actor: 'seller',
            payload: { scope: 'acceptEscrow.preflight', message, code: 'INSUFFICIENT_STAKE' },
          });
          return c.json({ error: message, code: 'INSUFFICIENT_STAKE' }, 409);
        }
      } catch (err) {
        // A read failure is not proof of a shortfall. The contract remains the
        // authority and the idempotent recovery path handles an intermediate
        // Funded state if stake changes before acceptEscrow executes.
        logger.warn(
          { jobId, err: (err as Error).message },
          'seller stake preflight unavailable; proceeding with contract enforcement',
        );
      }
    }

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

    const ensuredMovement = await ensureMoneyMovement({
      operationKey,
      kind: 'escrow_funding',
      amountMicros: fundedAmount,
      initiatedBy: deal.buyer,
      participants: [
        { address: deal.buyer, role: 'buyer' },
        { address: deal.seller, role: 'seller' },
      ],
      summary: 'Fund escrow and activate protection',
      nextActor: 'karwan',
      jobId,
    });
    movementReference = ensuredMovement.movement.reference;
    if (
      ensuredMovement.movement.kind !== 'escrow_funding' ||
      BigInt(ensuredMovement.movement.amountMicros) !== fundedAmount
    ) {
      await markMoneyMovementNeedsAttention(
        movementReference,
        'FUNDING_TERMS_CHANGED',
        'buyer',
      ).catch(() => undefined);
      return c.json(
        { error: 'the funding terms changed before submission', code: 'QUOTE_CHANGED' },
        409,
      );
    }

    const approval = await prepareMoneyMovementContractLeg(movementReference, {
      key: 'approve',
      label: 'Authorize the exact escrow total',
      rail: 'circle_wallets',
      walletId: deal.buyerAgentWalletId,
      signerAddress: deal.buyerAgentAddress,
      sourceAddress: deal.buyerAgentAddress,
      destinationAddress: escrow.address,
      contractAddress: usdcAddress,
      amountMicros: fundedAmount,
    });
    await executeContractCall(
      {
        walletId: deal.buyerAgentWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [escrow.address, fundedAmount.toString()],
        idempotencyKey: approval.idempotencyKey,
        lifecycle: approval.lifecycle,
      },
      `usdc.approve(escrow, direct ${jobId})`,
    );
    const allowance = await readUsdcAllowance(deal.buyerAgentAddress, escrow.address);
    if (allowance < fundedAmount) {
      await markMoneyMovementNeedsAttention(
        movementReference,
        'APPROVAL_NOT_CONFIRMED',
        'karwan',
      );
      return c.json(
        {
          error: 'the escrow authorization did not confirm. Retry is safe.',
          code: 'APPROVAL_NOT_CONFIRMED',
          reference: movementReference,
        },
        409,
      );
    }
    await verifyMoneyMovementLeg(movementReference, approval.leg.id);

    const funding = await prepareMoneyMovementContractLeg(movementReference, {
      key: 'fund',
      label: 'Protect funds in escrow',
      rail: 'circle_wallets',
      walletId: deal.buyerAgentWalletId,
      signerAddress: deal.buyerAgentAddress,
      sourceAddress: deal.buyerAgentAddress,
      destinationAddress: escrow.address,
      contractAddress: escrow.address,
      amountMicros: fundedAmount,
    });
    const fundResult = await executeContractCall(
      {
        ...buildFundEscrowCall(
          deal.buyerAgentWalletId,
          escrow.address,
          jobId,
          sellerAgents.sellerAddress,
          dealAmountWei,
          milestonePcts,
          reservationBps,
          deal.deadlineUnix,
        ),
        idempotencyKey: funding.idempotencyKey,
        lifecycle: funding.lifecycle,
      },
      `fundEscrow(direct ${jobId})`,
    );

    // Verify the escrow is ACTUALLY Funded before marking the deal accepted. The
    // fund tx above can land as a successful ERC-4337 handleOps even when the
    // inner fundEscrow userOp reverted, so the txHash alone is not proof. This
    // guard is what stops an "accepted" deal from sitting on an empty escrow.
    invalidateEscrowCache(jobId);
    const fundedAccount = await readEscrow(jobId);
    if (
      fundedAccount.state !== ESCROW_FUNDED ||
      !fundingEscrowMatches(fundedAccount, {
        buyerAgent: deal.buyerAgentAddress,
        sellerAgent: sellerAgents.sellerAddress,
        dealAmount: dealAmountWei,
        milestonePcts,
      })
    ) {
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
      await markMoneyMovementNeedsAttention(
        movementReference,
        'FUND_NOT_CONFIRMED',
        'karwan',
      );
      return c.json(
        {
          error:
            'escrow funding did not confirm on chain. The buyer agent may be short on USDC for this amount plus fee. Top it up and retry.',
          code: 'FUND_NOT_CONFIRMED',
          reference: movementReference,
        },
        409,
      );
    }
    await verifyMoneyMovementLeg(movementReference, funding.leg.id);

    // v2.D: the seller agent signs acceptEscrow which transitions the
    // escrow from Funded to Accepted and locks an insurance reservation
    // on the vault (dealAmount * reservationBps / 10000). Without this
    // the buyer can never release milestones. Failure modes are surfaced
    // back to the seller as actionable errors, most commonly
    // "insufficient stake" if the seller agent hasn't deposited enough.
    try {
      const activation = await prepareMoneyMovementContractLeg(movementReference, {
        key: 'activate',
        label: 'Activate escrow protection',
        rail: 'circle_wallets',
        walletId: sellerAgents.sellerWalletId,
        signerAddress: sellerAgents.sellerAddress,
        contractAddress: escrow.address,
      });
      const acceptTx = await acceptEscrowOnChain(jobId, sellerAgents.sellerWalletId, {
        idempotencyKey: activation.idempotencyKey,
        lifecycle: activation.lifecycle,
      });
      logger.info({ jobId, acceptTx }, 'seller accepted escrow on chain (v2.E)');
      // ERC-4337 inner-revert guard: handleOps can land as a successful tx
      // even when the inner acceptEscrow userOp reverted (eg vault.reserve
      // fails because the seller's stake check on chain disagrees with our
      // off-chain pre-flight, race condition or stale vault read). Without
      // this verify step, off-chain acceptedAt would be set even though
      // on-chain state is still Funded, exactly the bug that made the
      // seller see "tx FAILED" later on Mark Delivered.
      invalidateEscrowCache(jobId);
      const acceptedAccount = await readEscrow(jobId);
      if (
        acceptedAccount.state !== ESCROW_ACCEPTED ||
        !fundingEscrowMatches(acceptedAccount, {
          buyerAgent: deal.buyerAgentAddress,
          sellerAgent: sellerAgents.sellerAddress,
          dealAmount: dealAmountWei,
          milestonePcts,
        })
      ) {
        const reservationUsdc = formatUnits(
          (dealAmountWei * BigInt(reservationBps)) / 10000n,
          USDC_DECIMALS,
        );
        const message =
          reservationBps > 0
            ? `Escrow activation did not complete. You need ${reservationUsdc} USDC available in stake. Top up at /stake and retry.`
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
        await markMoneyMovementNeedsAttention(
          movementReference,
          'ACCEPT_NOT_CONFIRMED',
          'karwan',
        );
        return c.json(
          { error: message, code: 'ACCEPT_NOT_CONFIRMED', reference: movementReference },
          502,
        );
      }
      await verifyMoneyMovementLeg(movementReference, activation.leg.id);
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
        : 'Escrow activation did not complete. Retry is safe because Karwan checks the existing escrow before another transfer.';
      logger.error({ jobId, err: message, code }, 'acceptEscrow on chain failed');
      bus.emitEvent({
        type: 'agent.error',
        jobId,
        actor: 'seller',
        payload: { scope: 'acceptEscrow', message, code },
      });
      await markMoneyMovementNeedsAttention(
        movementReference,
        code,
        isInsufficientStake ? 'seller' : 'karwan',
      ).catch(() => undefined);
      // The escrow stays in Funded state on chain, the buyer's USDC is
      // locked there. The buyer can dispute + refund to recover (which
      // skips slash since reservedAmount is still 0). We return the error
      // so the seller knows; off-chain state stays clean (no acceptedAt
      // set, no deal.accepted event).
      return c.json({ error: detail, code, reference: movementReference }, 502);
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
    await completeMoneyMovement(movementReference, {
      amountMicros: fundedAmount,
      summary: 'Escrow funded and protection activated',
    });
    bus.emitEvent({
      type: 'deal.accepted',
      jobId,
      actor: 'buyer',
      payload: { seller: deal.seller, buyer: deal.buyer },
    });
    bus.emitEvent({
      type: 'escrow.funded',
      jobId,
      actor: 'buyer',
      payload: { seller: sellerAgents.sellerAddress, txHash: fundResult.txHash },
    });
    logger.info({ jobId, ...fundResult }, 'direct deal funded and accepted onchain');
    return c.json(
      {
        accepted: true,
        jobId,
        status: 'funded' as const,
        txHash: fundResult.txHash,
        reference: movementReference,
        quote: currentQuote,
      },
      200,
    );
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'direct deal funding failed');
    if (movementReference) {
      const nextActor =
        info.code === 'INSUFFICIENT_AGENT_BALANCE' || info.code === 'INSUFFICIENT_AGENT_GAS'
          ? 'buyer'
          : 'karwan';
      await markMoneyMovementNeedsAttention(
        movementReference,
        info.code,
        nextActor,
      ).catch((movementError) => {
        logger.error(
          {
            jobId,
            reference: movementReference,
            err: (movementError as Error).message,
          },
          'failed to persist funding movement recovery state',
        );
      });
    }
    // Emit a notification event so the buyer sees this in the bell. They need
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
    return c.json(
      {
        error: 'funding failed',
        code: info.code,
        ...(movementReference ? { reference: movementReference } : {}),
      },
      status,
    );
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the named seller can mark this deal delivered' }, 403);
  }
  if (!deal.acceptedAt) {
    return c.json({ error: 'accept the deal terms before marking it delivered' }, 409);
  }
  // A held (flagged) delivery can be re-submitted with a corrected link to
  // clear the hold; that is the primary resolution path. A normal, cleared
  // delivery is final and can't be re-marked.
  const wasHeld =
    deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious';
  if (deal.delivered && !wasHeld) {
    return c.json({ error: 'deal already marked delivered' }, 409);
  }
  // Goods deliver a shipment reference; everything else delivers a link.
  //
  // Goods used to be exempt from BOTH, which meant a seller could mark a
  // container delivered with an empty string and the buyer had nothing to check
  // and nothing to dispute against. This does not verify the shipment with the
  // carrier, it requires the seller to state who is carrying it and under what
  // reference, resolving to a page the buyer can open.
  let shipment: DirectDeal['shipment'] | undefined;
  const includesGoods = deal.tradeType === 'goods' || deal.tradeType === 'mixed';
  const includesService = deal.tradeType !== 'goods';
  if (includesGoods) {
    if (!body.shipment) {
      return c.json(
        {
          error: 'Add the carrier and tracking number so the buyer can follow the shipment.',
          code: 'shipment-required',
        },
        400,
      );
    }
    const carrier = findCarrier(body.shipment.carrier);
    if (!carrier) {
      return c.json({ error: 'Unknown carrier.', code: 'unknown-carrier' }, 400);
    }
    const trackingNumber = body.shipment.trackingNumber.trim();
    if (!carrier.pattern.test(trackingNumber)) {
      return c.json(
        {
          error: `That does not look like a ${carrier.name} tracking number. Check it and submit again.`,
          code: 'tracking-format',
        },
        400,
      );
    }
    const url = trackingUrlFor(carrier, trackingNumber, body.shipment.trackingUrl);
    if (!url) {
      return c.json(
        {
          error: 'Add the tracking page URL for this carrier.',
          code: 'tracking-url-required',
        },
        400,
      );
    }
    // A seller-supplied URL is held to the SAME standard as a services
    // delivery. Without this, picking "other" and inventing a domain would be
    // the hole the whole check leaks through.
    if (!carrier.trackingUrl) {
      const urls = extractUrls(url);
      if (urls.length === 0) {
        return c.json({ error: 'That is not a valid URL.', code: 'tracking-url-invalid' }, 400);
      }
      const dead = await unresolvableHosts(urls.map((u) => u.host));
      if (dead.length === urls.length) {
        return c.json(
          {
            error: `That tracking link does not point at a real site (${dead[0]}).`,
            code: 'link-unresolvable',
          },
          400,
        );
      }
    }
    shipment = {
      carrier: carrier.slug,
      carrierName: carrier.name,
      trackingNumber,
      trackingUrl: url,
      dispatchedAt: Date.now(),
    };
  }
  if (includesService) {
    const proofUrls = extractUrls(body.deliveryProof ?? '');
    if (proofUrls.length === 0) {
      return c.json(
        {
          error:
            'Submit your work as a link the buyer can open (e.g. a Google Drive or repo URL). Files must be shared via a link.',
          code: 'link-required',
        },
        400,
      );
    }
    // Carrying the https scheme proved nothing: an invented domain passed every
    // check. Require the host to exist in DNS so a made-up address cannot
    // satisfy a delivery. A real domain that is briefly down still passes,
    // because this asks whether the name exists, not whether it responds.
    const dead = await unresolvableHosts(proofUrls.map((u) => u.host));
    if (dead.length === proofUrls.length) {
      return c.json(
        {
          error: `That link does not point at a real site (${dead[0]}). Check the address and submit again.`,
          code: 'link-unresolvable',
        },
        400,
      );
    }
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

  // Security Agent: scan the delivery proof's links before the buyer is shown
  // them. A clean (or link-free) proof is stored and shown normally; a
  // suspicious or malicious verdict is recorded so the GET route holds the link
  // back from the buyer pending review. The proof is still persisted for audit
  // and the seller's own view; only the buyer's view is gated.
  let verificationStatus: NonNullable<typeof deal.verificationStatus> | undefined;
  let verificationReasons: string[] | undefined;
  if (body.deliveryProof) {
    try {
      const scan = await scanDelivery(body.deliveryProof);
      verificationStatus = scan.verdict; // 'clean' | 'suspicious' | 'malicious'
      if (scan.reasons.length) verificationReasons = scan.reasons;
      if (scan.hold) {
        logger.warn(
          { jobId, verdict: scan.verdict, reasons: scan.reasons },
          'security: delivery proof held from buyer view',
        );
        // A flagged delivery link is a trust breach: record it against the
        // seller so the reputation engine drops their score hard.
        recordLinkOffense({
          address: deal.seller,
          jobId,
          surface: 'delivery',
          verdict: scan.verdict === 'malicious' ? 'malicious' : 'suspicious',
          reasons: scan.reasons,
        });
        // v2b: bind the hold ON CHAIN too, so a flagged delivery can't be
        // claimed by calling the escrow directly. Fire-and-forget; inert until
        // the guardian wallet + v2 escrow are live. reasonHash anchors the
        // verdict without leaking the URL.
        void guardianHold(
          jobId,
          keccak256(toBytes(`${scan.verdict}|${scan.reasons.join(',')}|${Date.now()}`)),
        );
      }
    } catch (err) {
      // A scan failure must not block the seller from delivering; mark the
      // proof unverifiable so the buyer is warned rather than falsely assured.
      logger.warn({ jobId, err: (err as Error).message }, 'security: delivery scan failed');
      verificationStatus = 'unverifiable';
    }
  }

  // Security Agent: does the delivery meet the buyer's request? Separate from
  // link safety. Reasons over the proof vs the agreed terms and flags an
  // off-topic or empty deliverable so the buyer reviews before releasing. Never
  // withholds the proof and never blocks the seller; a mismatch just pauses
  // auto-release (see dealWatcher) so money never moves on a bad delivery
  // without the buyer's explicit look. Skipped for physical-goods deals, which
  // deliver against a proof-of-delivery, not a described deliverable.
  let deliveryMatch: NonNullable<typeof deal.deliveryMatch> | undefined;
  if (body.deliveryProof && deal.tradeType !== 'goods' && deal.terms) {
    try {
      const check = await verifyDeliverable({
        requirement: deal.terms,
        deliveryProof: body.deliveryProof,
      });
      deliveryMatch = check;
      if (check.verdict === 'mismatch' || check.verdict === 'partial') {
        logger.info(
          { jobId, verdict: check.verdict, reason: check.reason },
          'security: delivery may not meet the request',
        );
      }
    } catch (err) {
      logger.warn({ jobId, err: (err as Error).message }, 'security: requirement check failed');
    }
  }

  const nowHeld = verificationStatus === 'suspicious' || verificationStatus === 'malicious';
  const isRedelivery = deal.delivered === true;

  // v2b: mark the delivery ON CHAIN so the review window opens (deliveredAt),
  // which is what the seller claim path and the reclaim DeliveryPending guard
  // depend on. Best-effort: the buyer can still release without it, so a
  // failure logs and the off-chain record still updates (the seller re-marks
  // to retry). If the delivery is flagged, guardianHold (fired in the scan
  // above / below) freezes the seller-paying paths regardless. Skips goods
  // deals with no proof and pre-flag holds handled by the guardian.
  if (config.ESCROW_V2B_ENABLED && deal.sellerAgentWalletId) {
    const proofHash = keccak256(toBytes(body.deliveryProof ?? `delivered:${jobId}`));
    try {
      await markDeliveredOnChain(jobId, proofHash, deal.sellerAgentWalletId);
      // R3: a clean scan is an agent-verified good delivery. Attest pass=true
      // so the review window collapses toward attestedWindowSecs and the seller
      // settles sooner — the on-chain half of the agent-verified-delivery story.
      // Best-effort; the guardian wrapper is inert without the guardian wallet.
      if (verificationStatus === 'clean' || verificationStatus === undefined) {
        void guardianAttestDelivery(jobId, account.milestonesReleased, true, proofHash);
      }
    } catch (err) {
      logger.error(
        { jobId, err: (err as Error).message },
        'on-chain markDelivered failed (non-fatal; buyer can still release, seller can re-mark)',
      );
    }
  }

  await patchDeal(jobId, {
    delivered: true,
    ...(deliveryMatch ? { deliveryMatch } : {}),
    // Reset the review clock to now on every (re)delivery. While a link is held
    // the auto-release is paused anyway, so a corrected clean link gives the
    // buyer a fresh, full window to review what they can finally see.
    deliveredAt: Date.now(),
    ...(body.deliveryProof ? { deliveryProof: body.deliveryProof } : {}),
    ...(shipment ? { shipment } : {}),
    // Always overwrite the verdict + reasons so a corrected link clears the old
    // flag (reasons explicitly emptied when the new link is clean).
    ...(verificationStatus ? { verificationStatus } : {}),
    verificationReasons: verificationReasons ?? [],
  });

  // First delivery announces "delivered"; a re-delivery doesn't re-announce it.
  if (!isRedelivery) {
    await addSystemMessage({ jobId, channel: 'trade', channelKey: jobId, eventType: 'deal.delivered', occurrenceKey: String(Date.now()), body: body.deliveryProof ? 'The seller submitted delivery proof and marked the deal delivered.' : 'The seller marked the deal delivered.' });
    bus.emitEvent({
      type: 'deal.delivered',
      jobId,
      actor: 'seller',
      payload: {
        seller: deal.seller,
        firstReleasePct: deal.firstReleasePct,
        verificationStatus,
        ...(deliveryMatch && deliveryMatch.verdict !== 'aligned'
          ? { deliveryMatch: deliveryMatch.verdict }
          : {}),
      },
    });
  }
  // Notify BOTH parties when a link is flagged, and again when a corrected link
  // clears the hold, so the seller knows to fix it and the buyer knows the
  // release is paused / resumed.
  if (nowHeld) {
    bus.emitEvent({
      type: 'deal.delivery.flagged',
      jobId,
      actor: 'seller',
      payload: {
        buyer: deal.buyer,
        seller: deal.seller,
        verificationStatus,
        reasons: verificationReasons ?? [],
      },
    });
  } else if (wasHeld) {
    // The corrected delivery cleared the scan: lift the on-chain hold too so the
    // seller-paying paths unfreeze (inert until the guardian + v2 escrow live).
    void guardianReleaseHold(jobId);
    bus.emitEvent({
      type: 'deal.delivery.cleared',
      jobId,
      actor: 'seller',
      payload: { buyer: deal.buyer, seller: deal.seller, firstReleasePct: deal.firstReleasePct },
    });
  }
  return c.json({ accepted: true, jobId, verificationStatus }, 200);
});

/// Buyer confirms the goods physically arrived.
///
/// Deliberately NOT a release. Arrival is a fact about the shipment; release is
/// a decision about the money. Conflating them is how a buyer ends up paying
/// for a container the moment it lands, before opening it.
///
/// What it does change is the clock. Auto-release on a goods deal is floored by
/// the transit window precisely because "delivered" means dispatched and the
/// buyer has nothing to inspect. Once the buyer says it is here, that reason is
/// gone and the ordinary review ladder resumes. Net terms still apply: those
/// are a commercial agreement, not a statement about where the container is.
dealsRoutes.post('/direct/:jobId/arrived', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'unknown deal' }, 404);
  if (body.caller.toLowerCase() !== deal.buyer.toLowerCase()) {
    return c.json({ error: 'only the buyer can confirm arrival' }, 403);
  }
  if (!deal.shipment) {
    return c.json({ error: 'no shipment on this deal', code: 'no-shipment' }, 409);
  }
  if (deal.shipment.arrivedAt) {
    return c.json({ error: 'arrival already confirmed' }, 409);
  }
  if (deal.settledAt || deal.cancelledAt) {
    return c.json({ error: 'deal is closed' }, 409);
  }

  const arrivedAt = Date.now();
  await patchDeal(jobId, { shipment: { ...deal.shipment, arrivedAt } });
  bus.emitEvent({
    type: 'deal.goods.arrived',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      carrier: deal.shipment.carrierName,
      trackingNumber: deal.shipment.trackingNumber,
    },
  });
  logger.info({ jobId, carrier: deal.shipment.carrier }, 'buyer confirmed goods arrival');
  return c.json({ ok: true, arrivedAt });
});

/// Buyer releases the next milestone. After the seller marks delivered, the
/// buyer calls this twice: first to release the on-delivery slice, then again
/// to verify and release the remainder, which settles the deal.
/// v2b seller claim: after the buyer's review window elapses on a marked
/// delivery with no buyer release or dispute, the seller forces the next
/// milestone payout. The contract enforces the window (ReviewWindowOpen) and a
/// security hold (Frozen); this route just checks the off-chain preconditions
/// and signs with the seller agent. Available only on the v2 escrow.
dealsRoutes.post('/direct/:jobId/claim', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  if (!config.ESCROW_V2B_ENABLED) {
    return c.json({ error: 'seller claim is available on the v2 escrow only', code: 'not-available' }, 409);
  }

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.seller) {
    return c.json({ error: 'only the seller can claim this deal' }, 403);
  }
  if (!deal.delivered) {
    return c.json({ error: 'mark the work delivered first', code: 'not-delivered' }, 409);
  }
  if (!deal.sellerAgentWalletId) {
    return c.json({ error: 'this deal has no seller agent wallet on record' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  // The claim has to respect the SAME window the unattended path does.
  //
  // The contract enforces its own review window, which is a per-deal snapshot
  // and knows nothing about payment terms or whether a container is still at
  // sea. So a Net 30 goods deal held off auto-release for thirty days while the
  // seller could force the payout on day one by pressing Claim. The buyer's
  // protection was one button wide. The floor is the buyer's, not the timer's.
  {
    const account0 = await readEscrow(jobId);
    const index = account0.milestonesReleased;
    const pairHistory = buildPairHistory(await listAllDeals());
    const eligibleAt = releaseEligibleAt(
      deal,
      index,
      pairHistory.get(pairKey(deal.buyer, deal.seller)) ?? 0,
    );
    if (eligibleAt !== null && Date.now() < eligibleAt) {
      const floor = termsFloorMs(deal);
      return c.json(
        {
          error:
            floor > 0 && deal.paymentTerms && deal.paymentTerms !== 'immediate'
              ? `This deal is on ${deal.paymentTerms.toUpperCase()} terms. The buyer's window runs until then.`
              : floor > 0
                ? 'The goods are still in transit. The window opens once the buyer confirms they arrived.'
                : 'The review window has not passed yet.',
          code: 'window-open',
          eligibleAt,
        },
        409,
      );
    }
  }

  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_ACCEPTED) {
    return c.json({ error: `escrow is not claimable (state ${account.state})` }, 409);
  }

  inFlight.add(jobId);
  try {
    const index = account.milestonesReleased;
    const txHash = await claimMilestoneOnChain(jobId, index, deal.sellerAgentWalletId);
    await finalizeIfSettled(jobId);
    return c.json({ accepted: true, jobId, milestoneIndex: index, txHash }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'seller claim failed');
    return c.json({ error: 'claim failed', code: info.code, detail: info.message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

async function projectMilestonePayout(input: {
  deal: DirectDeal;
  milestoneIndex: number;
  amountMicros: bigint | string;
  reference: string;
  txHash?: string;
  settledInMs?: number;
  confirmedAt?: number;
}): Promise<boolean> {
  const { deal, milestoneIndex, reference, txHash } = input;
  const paidAt = input.confirmedAt ?? Date.now();
  const settled = await finalizeIfSettled(deal.jobId);
  if (settled) {
    await patchDeal(deal.jobId, {
      settledAt: deal.settledAt ?? paidAt,
      lastReleaseAt: paidAt,
      ...(input.settledInMs != null ? { lastSettleMs: input.settledInMs } : {}),
    });
    void settleFactoringForDeal(deal.jobId);
    void settlePOFinancingForDeal(deal.jobId);
  } else if (milestoneIndex === 0) {
    const startedAt = deal.reviewWindowStartedAt ?? paidAt;
    await patchDeal(deal.jobId, {
      reviewWindowStartedAt: startedAt,
      lastReleaseAt: paidAt,
      ...(input.settledInMs != null ? { lastSettleMs: input.settledInMs } : {}),
    });
    if (!deal.reviewWindowStartedAt) {
      bus.emitEvent({
        type: 'deal.review.started',
        jobId: deal.jobId,
        actor: 'buyer',
        payload: {
          buyer: deal.buyer,
          seller: deal.seller,
          windowMs: config.DEAL_REVIEW_WINDOW_MS,
          startedAt,
        },
      });
    }
  } else {
    await patchDeal(deal.jobId, {
      lastReleaseAt: paidAt,
      ...(input.settledInMs != null ? { lastSettleMs: input.settledInMs } : {}),
    });
  }

  const amountUsdc = formatUsdcMicros(input.amountMicros);
  void appendActivity({
    id: `${reference}:buyer`,
    address: deal.buyer,
    kind: 'release',
    summary: `Released milestone ${milestoneIndex + 1} on deal ${deal.jobId} to the seller${settled ? ' (final release, deal settled)' : ''}`,
    params: {
      t: settled ? 'milestoneReleaseFinal' : 'milestoneRelease',
      n: String(milestoneIndex + 1),
      job: String(deal.jobId),
    },
    amountUsdc,
    jobId: deal.jobId,
    txHash,
    refId: reference,
    counterparty: deal.seller,
  });
  if (deal.seller) {
    void appendActivity({
      id: `${reference}:seller`,
      address: deal.seller,
      kind: 'payout',
      summary: `Received payment for milestone ${milestoneIndex + 1} on deal ${deal.jobId}${settled ? ' (final release, deal settled)' : ''}`,
      params: {
        t: settled ? 'dealPayoutFinal' : 'dealPayout',
        n: String(milestoneIndex + 1),
        job: String(deal.jobId),
      },
      amountUsdc,
      jobId: deal.jobId,
      txHash,
      refId: reference,
      counterparty: deal.buyer.toLowerCase(),
    });
  }
  return settled;
}

dealsRoutes.post('/direct/:jobId/release', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);

  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== deal.buyer) {
    return c.json({ error: 'only the buyer can release this deal' }, 403);
  }
  if (!deal.delivered) {
    return c.json({ error: 'seller has not marked the work delivered yet' }, 409);
  }
  // Security Agent hold: the delivery link was flagged and withheld from the
  // buyer. Block release (the buyer hasn't actually seen the deliverable) until
  // the link clears. Mirrors the auto-release pause in dealWatcher.
  if (deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious') {
    return c.json(
      {
        error:
          'Karwan flagged the delivery link and is holding it for review. Release is paused until it clears.',
        code: 'delivery-held',
      },
      409,
    );
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
        // Vault read failed. Don't block here. Fall through to the chain
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
      // recovery path that doesn't depend on the seller, disputing and
      // refunding still works from Funded, and doesn't touch stake reservations.
      const detail = isInsufficientStake
        ? `The seller's free stake won't cover this deal. Ask them to top up at /stake, or call the deal off via Propose Cancellation or Appeal This Deal to refund.`
        : `Couldn't accept the escrow on chain. The seller may be short on stake or gas. If retrying doesn't help, refund via Propose Cancellation or Appeal This Deal. (chain error: ${message})`;
      logger.error({ jobId, err: message, code }, 'release self-heal acceptEscrow failed');
      return c.json({ error: detail, code, detail: message }, 502);
    }
  }

  // If a prior request advanced the contract but crashed before updating the
  // deal projection, reconcile that exact movement first. Never infer that a
  // second click means "release the next milestone" while an earlier payout
  // still lacks a completed receipt.
  const unfinishedPayout = findAdvancedUnfinishedPayout(
    await listMoneyMovementsForJobParty(jobId, deal.buyer),
    account.milestonesReleased,
  );

  if (unfinishedPayout?.milestoneIndex != null) {
    const payoutLegBefore = unfinishedPayout.legs.find(
      (leg) => leg.attempt === unfinishedPayout.attempt && leg.key === 'release',
    );
    await verifyConfirmedMoneyMovementLegByKey(
      unfinishedPayout.reference,
      'release',
      { amountMicros: unfinishedPayout.amountMicros },
    );
    await markMoneyMovementVerifying(unfinishedPayout.reference);
    const payoutProof = await currentMoneyMovement(unfinishedPayout.reference);
    const payoutLeg = payoutProof.legs.find(
      (leg) => leg.attempt === payoutProof.attempt && leg.key === 'release',
    ) ?? payoutLegBefore;
    const settled = await projectMilestonePayout({
      deal,
      milestoneIndex: unfinishedPayout.milestoneIndex,
      amountMicros: unfinishedPayout.amountMicros,
      reference: unfinishedPayout.reference,
      txHash: payoutLeg?.txHash,
      confirmedAt: payoutLeg?.confirmedAt,
    });
    let receiptPending = false;
    try {
      await completeMoneyMovement(unfinishedPayout.reference, {
        amountMicros: unfinishedPayout.amountMicros,
        summary: `Milestone ${unfinishedPayout.milestoneIndex + 1} paid`,
      });
    } catch (err) {
      receiptPending = true;
      logger.warn(
        {
          jobId,
          reference: unfinishedPayout.reference,
          err: (err as Error).message,
        },
        'payout reached escrow state but provider proof remains incomplete',
      );
      await markMoneyMovementNeedsAttention(
        unfinishedPayout.reference,
        'RECEIPT_RECONCILIATION_REQUIRED',
        'karwan',
      ).catch(() => undefined);
    }
    return c.json(
      {
        accepted: true,
        jobId,
        recovered: true,
        settled,
        reference: unfinishedPayout.reference,
        amountUsdc: formatUsdcMicros(unfinishedPayout.amountMicros),
        receiptPending,
        ...(payoutLeg?.txHash ? { txHash: payoutLeg.txHash } : {}),
      },
      200,
    );
  }

  if (account.state !== ESCROW_ACCEPTED) {
    return c.json(
      { error: `escrow state must be Accepted(2), got ${account.state}. Releases run after the seller accepts the escrow.` },
      409,
    );
  }

  inFlight.add(jobId);
  let movementReference: string | undefined;
  try {
    const releasedIndex = account.milestonesReleased;
    const expectedAmount = expectedMilestonePayout(account, releasedIndex);
    const ensuredMovement = await ensureMoneyMovement({
      operationKey: payoutMovementKey(jobId, releasedIndex),
      kind: 'milestone_payout',
      amountMicros: expectedAmount,
      initiatedBy: deal.buyer,
      participants: [
        { address: deal.buyer, role: 'buyer' },
        { address: deal.seller, role: 'recipient' },
      ],
      summary: `Pay milestone ${releasedIndex + 1}`,
      nextActor: 'karwan',
      jobId,
      milestoneIndex: releasedIndex,
    });
    movementReference = ensuredMovement.movement.reference;
    if (
      ensuredMovement.movement.kind !== 'milestone_payout' ||
      ensuredMovement.movement.milestoneIndex !== releasedIndex ||
      BigInt(ensuredMovement.movement.amountMicros) !== expectedAmount
    ) {
      await markMoneyMovementNeedsAttention(
        movementReference,
        'PAYOUT_TERMS_CHANGED',
        'karwan',
      ).catch(() => undefined);
      return c.json(
        {
          error: 'the milestone amount changed before submission',
          code: 'PAYOUT_TERMS_CHANGED',
          reference: movementReference,
        },
        409,
      );
    }

    const payout = await prepareMoneyMovementContractLeg(movementReference, {
      key: 'release',
      label: `Pay milestone ${releasedIndex + 1}`,
      rail: 'circle_wallets',
      walletId: deal.buyerAgentWalletId,
      sourceAddress: escrow.address,
      contractAddress: escrow.address,
      amountMicros: expectedAmount,
    });
    // Approval-to-verified duration. releaseMilestone re-reads escrow state
    // after the tx lands, so the stamp means "money verifiably moved on Arc",
    // not "request submitted". Persisted per deal and returned to the client:
    // seconds, where marketplaces hold cleared funds for days.
    const releaseStartedAt = Date.now();
    const txHash = await releaseMilestone(
      jobId,
      releasedIndex,
      deal.buyerAgentWalletId,
      { idempotencyKey: payout.idempotencyKey, lifecycle: payout.lifecycle },
    );
    const settledInMs = Date.now() - releaseStartedAt;
    invalidateEscrowCache(jobId);
    const afterRelease = await readEscrow(jobId);
    const actualAmount = afterRelease.released - account.released;
    if (
      afterRelease.milestonesReleased <= releasedIndex ||
      actualAmount <= 0n ||
      actualAmount !== expectedAmount
    ) {
      await markMoneyMovementNeedsAttention(
        movementReference,
        'PAYOUT_NOT_CONFIRMED',
        'karwan',
      );
      return c.json(
        {
          error: 'the milestone payment is still being verified',
          code: 'PAYOUT_NOT_CONFIRMED',
          reference: movementReference,
        },
        502,
      );
    }
    await verifyMoneyMovementLeg(movementReference, payout.leg.id, {
      amountMicros: actualAmount,
    });
    const settled = await projectMilestonePayout({
      deal,
      milestoneIndex: releasedIndex,
      amountMicros: actualAmount,
      reference: movementReference,
      txHash,
      settledInMs,
    });
    await completeMoneyMovement(movementReference, {
      amountMicros: actualAmount,
      summary: `Milestone ${releasedIndex + 1} paid`,
    });
    return c.json(
      {
        accepted: true,
        jobId,
        txHash,
        settled,
        settledInMs,
        reference: movementReference,
        amountUsdc: formatUsdcMicros(actualAmount),
      },
      200,
    );
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'release failed');
    if (movementReference) {
      await markMoneyMovementNeedsAttention(
        movementReference,
        info.code,
        info.code === 'INSUFFICIENT_AGENT_GAS' ? 'buyer' : 'karwan',
      ).catch((movementError) => {
        logger.error(
          {
            jobId,
            reference: movementReference,
            err: (movementError as Error).message,
          },
          'failed to persist payout movement recovery state',
        );
      });
    }
    return c.json(
      {
        error: 'release failed',
        code: info.code,
        detail: info.message,
        ...(movementReference ? { reference: movementReference } : {}),
      },
      502,
    );
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    // v2b: push the new deadline on chain first so the on-chain reclaim clock
    // tracks the agreed extension. Buyer-only on chain, signed by the buyer
    // agent. Do this BEFORE the off-chain patch so a chain revert (e.g. the
    // deal was funded open-ended) doesn't leave the two clocks disagreeing.
    if (config.ESCROW_V2B_ENABLED && deal.buyerAgentWalletId) {
      try {
        await extendDeadlineOnChain(jobId, deal.buyerAgentWalletId, newDeadline);
      } catch (err) {
        logger.error({ jobId, err: (err as Error).message }, 'on-chain extendDeadline failed');
        return c.json(
          { error: 'could not extend the deadline on chain', code: 'extend-failed' },
          502,
        );
      }
    }
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
/// release without acting. Off-chain only, the on-chain escrow stays
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
  // Grace runs from the most recent release, not from the first one. On a 3+
  // part deal the buyer gets a fresh grace period per tranche they are sitting
  // on, rather than one that expired back at milestone one.
  const graceFrom = deal.lastReleaseAt ?? deal.reviewWindowStartedAt;
  if (now < graceFrom + config.DEAL_DELAY_APPEAL_GRACE_MS) {
    const remaining = graceFrom + config.DEAL_DELAY_APPEAL_GRACE_MS - now;
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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

/// Push a raised dispute at the operator team. Fire-and-forget on purpose: the
/// dispute is already on chain and recorded by the time this runs, so a
/// Telegram outage must not turn a successful appeal into a 502 for the party
/// who raised it.
///
/// A dispute is the one deal state no automation clears. Resolution needs two
/// of three arbiter Safe owners to sign, so it sits frozen until a human looks.
/// Waiting for someone to notice the admin tile is how a frozen escrow becomes
/// a week-old frozen escrow.
function notifyOperatorOfDispute(
  jobId: string,
  deal: { buyer: string; seller: string; dealAmountUsdc: string },
  raisedBy: 'buyer' | 'seller',
): void {
  const opChat = supportOperatorChatId();
  if (opChat === null) return;
  const base = config.FRONTEND_BASE_URL?.replace(/\/$/, '');
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  void sendTelegramMessage(
    opChat,
    `*Deal disputed*\nRaised by the ${raisedBy}\n` +
      `Amount: ${deal.dealAmountUsdc} USDC\n` +
      `Buyer: \`${short(deal.buyer)}\`\nSeller: \`${short(deal.seller)}\`\n` +
      `Job: \`${jobId.slice(0, 10)}…\`\n\n` +
      `Escrow is frozen until two arbiter owners sign a ruling.`,
    base ? [{ text: 'Open disputes', url: `${base}/admin/disputes` }] : undefined,
  );
}

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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    /// disputeEscrow re-reads escrow state after the COMPLETE and throws if the
    /// inner userOp reverted, so the off-chain `disputed=true` patch below only
    /// runs when the chain actually moved to Disputed.
    const disputeTxHash = await disputeEscrow(jobId, signerWalletId, reasonHash);
    await patchDeal(jobId, { disputed: true, disputedAt: Date.now(), disputedBy: callerRole });
    bus.emitEvent({
      type: 'deal.disputed',
      jobId,
      actor: callerRole,
      payload: { seller: deal.seller, buyer: deal.buyer, reason: reasonHash, txHash: disputeTxHash },
    });
    // A dispute is a neutral marker on the record until it is resolved.
    await recordReputation(jobId, deal.buyerAgentWalletId, OUTCOME_DISPUTE_RESOLVED);
    // A disputed escrow needs two of three Safe owners to sign before anything
    // moves, so nobody's money is going anywhere until a human acts. Push it
    // rather than waiting for someone to notice the admin tile. Best-effort: a
    // Telegram failure must never fail the dispute the parties just raised.
    notifyOperatorOfDispute(jobId, deal, callerRole);
    return c.json({ accepted: true, jobId, txHash: disputeTxHash }, 200);
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'appeal failed');
    return c.json({ error: 'appeal failed', code: info.code, detail: info.message }, 502);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer cancels the deal. Before escrow is funded, this is a plain state
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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

  // Before the buyer funds escrow, no on-chain deal exists yet, so cancel is a
  // plain state change even if the seller already agreed to the terms.
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
    const reason = 'buyer withdrew before escrow was funded';
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
    /// Close the loop with email-mode recipients. The original invite email
    /// teased a deal; without this follow-up they would return days later
    /// and find an expired-looking link with no explanation. Wallet-mode
    /// counterparties hear about the cancel through the bus → Telegram
    /// notifier path, which routes off deal.seller; this path covers the
    /// email branch where deal.seller is still the placeholder.
    const pendingEmail = deal.pendingCounterparty?.email;
    if (pendingEmail) {
      const maskedInviter = `${deal.buyer.slice(0, 6)}…${deal.buyer.slice(-4)}`;
      void sendDealCancelledEmail({
        to: pendingEmail,
        dealAmountUsdc: deal.dealAmountUsdc,
        inviterMasked: maskedInviter,
        reason,
      }).catch((err) => {
        logger.warn(
          { err: (err as Error).message, jobId, to: pendingEmail },
          'deal cancel email send threw',
        );
      });
    }
    return c.json({ accepted: true, jobId }, 200);
  }

  // Once accepted and funded, unilateral cancel is gated on a delivery
  // deadline passing without delivery. Open-ended deals (no deadline set)
  // have no unilateral cancel path, only mutual cancel or appeal.
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
  const agentWallets = await getAgentWallets(deal.buyer);
  const buyerAgentAddress = deal.buyerAgentAddress ?? agentWallets?.buyerAddress;
  if (!buyerAgentAddress) {
    return c.json({ error: 'this deal has no buyer agent address on record' }, 409);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this deal' }, 409);
  }

  const account = await readEscrow(jobId);
  const existingRefund = await getMoneyMovementByOperationKey(refundMovementKey(jobId));
  const refundRecovery = existingRefund && existingRefund.state !== 'cancelled';
  if (
    account.state !== ESCROW_FUNDED &&
    account.state !== ESCROW_ACCEPTED &&
    !(account.state === ESCROW_DISPUTED && refundRecovery)
  ) {
    return c.json({ error: `escrow is not in a cancellable state (${account.state})` }, 409);
  }
  let refundMicros: bigint;
  try {
    refundMicros = remainingEscrowMicros(account.dealAmount, account.released);
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'escrow refund amount is invalid');
    return c.json({ error: 'escrow accounting is inconsistent', code: 'ESCROW_ACCOUNTING_INVALID' }, 502);
  }
  if (refundMicros <= 0n) {
    return c.json({ error: 'there is no remaining escrow to refund', code: 'ESCROW_EMPTY' }, 409);
  }
  const refundAmountUsdc = formatUsdcMicros(refundMicros);
  const refundSummary = `Reclaimed ${refundAmountUsdc} USDC from the deal the seller did not deliver`;
  const refundInput = {
    operationKey: refundMovementKey(jobId),
    amountUsdc: refundAmountUsdc,
    initiatedBy: deal.buyer,
    buyerAgentAddress,
    sellerAddress: deal.seller,
    jobId,
    summary: refundSummary,
    escrowAddress: escrow.address,
    buyerAgentWalletId: deal.buyerAgentWalletId,
  };

  inFlight.add(jobId);
  let refundReference: string | undefined;
  try {
    const reason = 'buyer cancel: seller did not deliver by deadline';
    const ensuredRefund = await ensureEscrowRefundMovement(refundInput);
    refundReference = ensuredRefund.movement.reference;
    let refundResult;
    if (config.ESCROW_V2B_ENABLED && account.state === ESCROW_ACCEPTED) {
      // v2b post-accept: the same trustless reclaim the watcher uses. It
      // enforces deadline + grace and the "nothing pending review" rule on
      // chain, and records Failed atomically. Pre-check the grace so the buyer
      // gets a clean 409 instead of an on-chain DeadlineNotPassed revert; the
      // on-chain grace matches DEAL_DEADLINE_RECLAIM_GRACE_MS threaded at fund.
      if (Date.now() < deal.deadlineUnix * 1000 + config.DEAL_DEADLINE_RECLAIM_GRACE_MS) {
        inFlight.delete(jobId);
        return c.json(
          { error: 'the reclaim grace window has not passed yet', code: 'GRACE_OPEN' },
          409,
        );
      }
      refundResult = await executeEscrowRefundMovement(refundInput, (options) =>
        reclaimAfterDeadline(jobId, deal.buyerAgentWalletId!, options),
      );
    } else {
      /// Pre-accept (Funded) on any version, or the v2.E accepted path: two SCA
      /// calls in sequence. Both go through the inner-revert guard in
      /// settlement.ts, so a stuck Disputed or Disputed-but-not-Refunded state
      /// throws here before any off-chain `cancelledAt` write, never marking a
      /// deal cancelled in DB while the buyer's USDC is still escrowed.
      if (account.state !== ESCROW_DISPUTED) {
        await disputeEscrow(jobId, deal.buyerAgentWalletId, reason);
      }
      refundResult = await executeEscrowRefundMovement(refundInput, (options) =>
        refundEscrow(jobId, deal.buyerAgentWalletId!, options),
      );
    }
    const refundTxHash = refundResult.txHash;
    await patchDeal(jobId, {
      cancelledAt: Date.now(),
      cancelKind: 'unilateral',
      cancelReason: reason,
      refundTxHash,
    });
    void appendActivity({
      address: deal.buyer,
      kind: 'refund',
      id: `escrow-refund:${jobId}`,
      refId: refundResult.movement.reference,
      summary: refundSummary,
      params: {t: 'deadlineReclaim', amount: refundAmountUsdc, reference: refundResult.movement.reference},
      amountUsdc: refundAmountUsdc,
      txHash: refundTxHash,
      jobId,
      counterparty: deal.seller?.toLowerCase(),
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
        txHash: refundTxHash,
        reference: refundResult.movement.reference,
      },
    });
    // The seller never delivered by the deadline: record a failure against
    // them. v2b's reclaimAfterDeadline already recorded Failed on chain, so
    // only the pre-accept / v2.E path needs the explicit off-chain write.
    if (!(config.ESCROW_V2B_ENABLED && account.state === ESCROW_ACCEPTED)) {
      await recordReputation(jobId, deal.buyerAgentWalletId, OUTCOME_FAILED);
    }
    return c.json(
      {
        accepted: true,
        alreadyRecorded: refundResult.alreadyRecorded,
        jobId,
        txHash: refundTxHash,
        reference: refundResult.movement.reference,
        movementState: refundResult.movement.state,
      },
      200,
    );
  } catch (err) {
    const info = classifyAgentError(err);
    logger.error({ jobId, code: info.code, err: info.raw }, 'cancel failed');
    const attentionReference =
      (err as Error).message.match(/^ESCROW_REFUND_NEEDS_ATTENTION:(KWN-[A-Z0-9-]+)$/)?.[1] ??
      refundReference;
    return c.json(
      {
        error: 'cancel failed',
        code: info.code,
        detail: info.message,
        reference: attentionReference,
        movementState: 'needs_attention',
      },
      502,
    );
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    // appealed (Disputed state), in which case skip dispute() to avoid
    // InvalidState.
    if (account.state !== ESCROW_DISPUTED && isReleaseFromDispute) {
      return c.json(
        { error: 'release-from-dispute requires the escrow to be in Disputed state' },
        409,
      );
    }

    /// 'release-from-dispute' → releaseFromDispute(jobId); seller is paid in
    /// full and the chain records DisputeResolved (when reservation existed).
    /// Everything else → the buyer is made whole and the seller concedes.
    ///
    /// v2b: post-accept refund is gone (it was the H-1 clawback), so a
    /// consented non-release exit runs the mutual-cancel handshake with
    /// sellerBps=0 (full buyer refund, reservation released no-fault). Both
    /// off-chain parties have already agreed via the propose/accept flow, so
    /// the backend drives both on-chain legs. Works from Accepted or Disputed,
    /// so no pre-dispute step is needed.
    ///
    /// v2.E: drive the escrow to Disputed (if not already) then refund(jobId).
    /// Every wrapper verifies its expected post-state before returning, so the
    /// off-chain patchDeal below only runs when the chain actually moved.
    let finalTxHash: string;
    let finalMovement: Awaited<ReturnType<typeof executeEscrowMutualCancelMovement>> | undefined;
    let settlementAmountUsdc = deal.dealAmountUsdc;
    if (isReleaseFromDispute) {
      finalTxHash = await releaseFromDisputeOnChain(jobId, deal.buyerAgentWalletId);
    } else if (config.ESCROW_V2B_ENABLED && account.state !== ESCROW_FUNDED) {
      // v2b Accepted/Disputed: consented mutual cancel (sellerBps=0). The
      // handshake requires wasAccepted, so a FUNDED (never-accepted) deal must
      // NOT come here — it falls through to the refund path below (R6). refund
      // is still allowed pre-accept on v2b, so a never-accepted deal settles
      // there cleanly.
      if (!deal.sellerAgentWalletId) {
        return c.json({ error: 'this deal has no seller agent wallet on record' }, 409);
      }
      const agentWallets = await getAgentWallets(deal.buyer);
      const sellerWallets = await getAgentWallets(deal.seller);
      const buyerAgentAddress = deal.buyerAgentAddress ?? agentWallets?.buyerAddress;
      const sellerAgentAddress = deal.sellerAgentAddress ?? sellerWallets?.sellerAddress;
      if (!buyerAgentAddress || !sellerAgentAddress) {
        return c.json({ error: 'this deal has no agent addresses on record' }, 409);
      }
      let remainingMicros: bigint;
      try {
        remainingMicros = remainingEscrowMicros(account.dealAmount, account.released);
      } catch (err) {
        logger.error({ jobId, err: (err as Error).message }, 'mutual cancel amount is invalid');
        return c.json({ error: 'escrow accounting is inconsistent', code: 'ESCROW_ACCOUNTING_INVALID' }, 502);
      }
      if (remainingMicros <= 0n) {
        return c.json({ error: 'there is no remaining escrow to cancel', code: 'ESCROW_EMPTY' }, 409);
      }
      settlementAmountUsdc = formatUsdcMicros(remainingMicros);
      finalMovement = await executeEscrowMutualCancelMovement({
        operationKey: mutualCancelMovementKey(jobId),
        amountUsdc: settlementAmountUsdc,
        initiatedBy: deal.buyer,
        buyerAddress: deal.buyer,
        sellerAddress: deal.seller,
        buyerAgentAddress,
        sellerAgentAddress,
        buyerAgentWalletId: deal.buyerAgentWalletId,
        sellerAgentWalletId: deal.sellerAgentWalletId,
        sellerBps: 0,
        jobId,
        summary: `Mutual cancellation returned ${settlementAmountUsdc} USDC to the buyer`,
        escrowAddress: escrow.address,
      });
      finalTxHash = finalMovement.acceptTxHash ?? '';
      if (!finalTxHash) throw new Error('MUTUAL_CANCEL_ACCEPT_PROOF_MISSING');
    } else {
      // v2.E, OR v2b pre-accept (FUNDED): dispute (if needed) then refund.
      if (account.state !== ESCROW_DISPUTED) {
        /// Inner-revert guarded; throws if escrow didn't actually move to Disputed.
        await disputeEscrow(jobId, deal.buyerAgentWalletId, chainReason);
      }
      finalTxHash = await refundEscrow(jobId, deal.buyerAgentWalletId);
    }

    /// Identify the loser for the off-chain reputation signal. On a refund
    /// the seller concedes; on a release the buyer concedes. Pre-dispute
    /// kinds stay rep-neutral.
    const disputeLoser: 'buyer' | 'seller' | undefined = isReleaseFromDispute
      ? 'buyer'
      : isRefundFromDispute
        ? 'seller'
        : undefined;

    /// release-from-dispute lands the seller in Settled on chain. Mirror
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
      // A release pays the seller and belongs on the settlement hash; anything
      // else returned the buyer's money and belongs on the refund hash.
      ...(isReleaseFromDispute ? {} : { refundTxHash: finalTxHash }),
    });
    // Whoever received the money gets the row. Both sides can already see the
    // deal page; this is the entry in their own ledger.
    void appendActivity({
      ...(finalMovement ? { id: `escrow-mutual-cancel:${jobId}` } : {}),
      address: isReleaseFromDispute ? deal.seller : deal.buyer,
      kind: isReleaseFromDispute ? 'release' : 'refund',
      summary: isReleaseFromDispute
        ? `Received ${settlementAmountUsdc} USDC from a resolved dispute`
        : finalMovement
          ? `Mutual cancellation returned ${settlementAmountUsdc} USDC to the buyer`
          : `Refunded ${settlementAmountUsdc} USDC from a cancelled deal`,
      ...(finalMovement ? { refId: finalMovement.movement.reference } : {}),
      params: {
        t: isReleaseFromDispute ? 'disputeReceived' : 'cancelRefund',
        amount: settlementAmountUsdc,
        ...(finalMovement ? { reference: finalMovement.movement.reference } : {}),
      },
      amountUsdc: settlementAmountUsdc,
      txHash: finalTxHash,
      jobId,
      counterparty: (isReleaseFromDispute ? deal.buyer : deal.seller)?.toLowerCase(),
    });
    // A dispute that resolved in the seller's favour also lands funds in their
    // wallet, so drive the financing repayment now. A refund resolution leaves
    // the deal cancelled-not-settled, which the watchers read as a default.
    if (isReleaseFromDispute) {
      void settleFactoringForDeal(jobId);
      void settlePOFinancingForDeal(jobId);
    }
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
        txHash: finalTxHash,
      },
    });
    // 'mutual' and 'platform-attributed' stay rep-neutral. Dispute-state
    // resolutions carry a reputation hit applied off-chain via signals.ts
    // reading disputeLoser; on-chain rep for trusted (reservation > 0) deals
    // is already recorded by the escrow contract.
    return c.json(
      {
        accepted: true,
        jobId,
        txHash: finalTxHash,
        ...(finalMovement
          ? {
              reference: finalMovement.movement.reference,
              movementState: finalMovement.movement.state,
              alreadyRecorded: finalMovement.alreadyRecorded,
              proposeTxHash: finalMovement.proposeTxHash,
              acceptTxHash: finalMovement.acceptTxHash,
            }
          : {}),
        ...(isDisputeResolution ? { disputeLoser } : {}),
      },
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
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
    /// How long the payment terms or a shipment in transit hold the money,
    /// independent of the review ladder. Zero on an ordinary service deal.
    termsFloorMs: termsFloorMs(deal),
    delayAppealResponseWindowMs: config.DEAL_DELAY_APPEAL_RESPONSE_MS,
    delayAppealGraceMs: config.DEAL_DELAY_APPEAL_GRACE_MS,
  };
  // No escrow exists on chain until the seller agrees and the buyer funds.
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
    // The ONE authoritative moment the next payout can happen.
    //
    // Three answers to this used to disagree. The UI counted down the contract's
    // review window, the claim button gated on the same, and the watcher used
    // the terms-aware window. On a Net 30 goods deal the seller was told "window
    // passed, the agent will release shortly" while the agent was thirty days
    // away, and Claim was the only thing that worked. Every surface counts down
    // to this instant now.
    let releaseEligibleAtMs: number | null = null;
    if (deal.delivered) {
      try {
        const pairHistory = buildPairHistory(await listAllDeals());
        releaseEligibleAtMs = releaseEligibleAt(
          deal,
          account.milestonesReleased,
          pairHistory.get(pairKey(deal.buyer, deal.seller)) ?? 0,
        );
      } catch {
        releaseEligibleAtMs = null;
      }
    }

    return {
      ...base,
      releaseEligibleAtMs,
      onChain: {
        state: account.state,
        milestonePcts: account.milestonePcts,
        milestonesReleased: account.milestonesReleased,
        dealAmountWei: account.dealAmount.toString(),
        sellerNetWei: account.sellerNet.toString(),
        feeTotalWei: account.feeTotal.toString(),
        releasedWei: account.released.toString(),
        // v2b on-chain clock (null on the v2.E ABI / pre-cutover). Milliseconds
        // so the UI compares against Date.now() directly. R4: the seller claim
        // button gates on THIS, not the off-chain window, so a click at the
        // off-chain expiry can't revert on ReviewWindowOpen.
        deliveredAtMs: account.deliveredAt ? Number(account.deliveredAt) * 1000 : null,
        claimDeadlineMs: account.claimDeadline ? Number(account.claimDeadline) * 1000 : null,
      },
    };
  } catch {
    return { ...base, onChain: null };
  }
}
