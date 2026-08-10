import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readSession } from '../auth/session.js';
import { getProfile } from '../db/profiles.js';
import { isApprovedFinancier, financierSafeDeal } from '../profile/financier.js';
import {
  createFactoringOffer,
  getFactoringOffer,
  listOffersForInvoice,
  listOffersByFinancier,
  listOffersBySeller,
  listOpenOffers,
  patchFactoringOffer,
  patchFactoringOfferIfStatus,
} from '../db/factoring.js';
import { getDeal, patchDeal, listAllDeals } from '../db/deals.js';
import { listAllLines as listAllPOLines } from '../db/poFinancing.js';
import { getUserByAddress } from '../db/users.js';
import { deterministicIdempotencyKey, executeContractCall } from '../chain/txs.js';
import {
  verifyTransferAuthorization,
  splitSignature,
  signTransferAuthorizationWithCircle,
} from '../chain/usdc3009.js';
import { vault, readEscrow } from '../chain/contracts.js';
import { claimableUsdc, claimableForDeals } from '../deals/claimable.js';
import { actorSignalsFor, type RepTier } from '../agents/signals.js';
import { parseUnits, formatUnits } from 'viem';
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldHoldFactoring } from '../security/sa-stub.js';
import { logger } from '../logger.js';

/// Invoice factoring routes.
///
///   - ADVANCE (financier -> seller): the financier signs a USDC EIP-3009
///     authorization at OFFER time. A web3 financier signs in the browser; a
///     Circle one has it signed from their identity wallet here. Either way an
///     offer carries a signature, because acceptance cannot proceed without one.
///
///   - ACCEPT: the seller calls KarwanInvoiceRegistry.assignReceivable, which
///     relays that authorization to pay them AND records the receivable
///     assignment on the escrow, in one transaction. The call is seller-gated
///     on chain, so a web3 seller signs it and returns the hash while a Circle
///     seller has it signed from their identity wallet.
///
///   - REPAYMENT: there isn't one. The escrow pays the financier out of the
///     settlement, ahead of the seller. Nothing is pulled from the seller's
///     wallet afterwards, so there is nothing for a seller to spend first and
///     no watcher race to lose.

const USDC_DECIMALS = 6;
/// A web3 seller's repayment authorization must outlive the deal. 60 days
/// is the floor; the frontend signs 180.
const MIN_REPAY_VALIDITY_DAYS = 60;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'expected 0x-prefixed 32-byte hex hash');
const usdcAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'expected decimal USDC string')
  .refine((v) => Number(v) > 0, { message: 'must be positive' });

const authorizationSchema = z.object({
  from: addrSchema,
  to: addrSchema,
  value: z.string().regex(/^\d+$/, 'expected atomic USDC integer string'),
  validAfter: z.string().regex(/^\d+$/),
  validBefore: z.string().regex(/^\d+$/),
  nonce: hashSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'expected 65-byte signature'),
});

const offerBodySchema = z.object({
  invoiceId: hashSchema,
  offeredAdvanceUsdc: usdcAmountSchema,
  expectedReturnUsdc: usdcAmountSchema,
  expiresInHours: z.number().int().min(1).max(168).default(24),
  advanceAuthorization: authorizationSchema.optional(),
});

const acceptBodySchema = z.object({
  offerId: z.string().uuid(),
  setPayeeTxHash: hashSchema.optional(),
  /// Web3 sellers sign registry.assignReceivable themselves, since the call is
  /// seller-gated on chain, and hand back the hash. Circle sellers omit it and
  /// the backend signs from their identity wallet.
  assignTxHash: hashSchema.optional(),
  /// Retained for offers accepted before receivable assignment shipped. The
  /// escrow now pays the financier directly, so no repayment instrument is
  /// collected for new offers.
  repayAuthorization: authorizationSchema.optional(),
});

function atomicUsdc(decimal: string): string {
  return parseUnits(decimal, USDC_DECIMALS).toString();
}

/// Per-invoice accept lock. The advance transfer takes seconds; without
/// this, two accepts racing on different offers against the same invoice
/// could both pass the factoringOfferId check and both pay an advance.
const acceptingInvoices = new Set<string>();

/// Stake a seller must hold to take a factoring advance, as basis points of the
/// advance, by reputation tier. The financier's loss on a default (buyer refunds
/// after the advance is paid) is the advance, so a proven elite is waived and a
/// new wallet must fully collateralize. Reputation buys the collateral down:
/// stake is the skin in the game a thin track record has not yet earned.
const FACTORING_STAKE_BPS: Record<RepTier, number> = {
  elite: 0,
  strong: 2_000,
  established: 5_000,
  cold: 8_000,
  new: 10_000,
};

const rejectBodySchema = z.object({
  offerId: z.string().uuid(),
});

export const factoringRoutes = new Hono();

const requestBodySchema = z.object({
  invoiceId: hashSchema,
  /// Optional floor the seller will consider. Financiers see it; a bid below it
  /// is refused rather than shown.
  minAdvanceUsdc: usdcAmountSchema.optional(),
});

const withdrawRequestBodySchema = z.object({
  invoiceId: hashSchema,
});

/// POST /api/factoring/request: the SELLER asks to be paid early on this
/// invoice. Until they do, the invoice is invisible to financiers.
///
/// This is the opt-in that factoring used to lack. Every accepted finance-lane
/// deal was listed to every approved financier automatically, which published a
/// seller's counterparty, amount and timing on the strength of them having
/// opened a deal. Financing is a thing a seller asks for, not a thing that
/// happens to their invoice.
factoringRoutes.post('/request', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = requestBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);

  const caller = session.address.toLowerCase();
  if (caller !== deal.seller.toLowerCase()) {
    return c.json({ error: 'only the seller can request early payout' }, 403);
  }
  if (deal.tradeLane !== 'finance') {
    return c.json({ error: 'factoring is only available on trade-finance deals' }, 409);
  }
  if (!deal.acceptedAt || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for factoring' }, 409);
  }
  if (deal.factoringOfferId) {
    return c.json({ error: 'deal already has an accepted factoring offer' }, 409);
  }
  if (body.minAdvanceUsdc && Number(body.minAdvanceUsdc) >= Number(deal.dealAmountUsdc)) {
    return c.json({ error: 'minimum advance must be below the invoice face value' }, 400);
  }

  const updated = await patchDeal(deal.jobId, {
    factoringRequestedAt: Date.now(),
    factoringMinAdvanceUsdc: body.minAdvanceUsdc,
  });

  logger.info(
    { invoiceId: deal.jobId, seller: caller, minAdvanceUsdc: body.minAdvanceUsdc },
    'factoring: seller requested early payout',
  );
  return c.json({ deal: updated ? financierSafeDeal(updated) : null });
});

/// POST /api/factoring/withdraw-request: seller changes their mind and pulls the
/// invoice back off the desk. Offers already made are left alone rather than
/// force-rejected: a financier who priced one deserves the seller's explicit
/// answer, and the seller can still reject them one by one.
factoringRoutes.post('/withdraw-request', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = withdrawRequestBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  if (session.address.toLowerCase() !== deal.seller.toLowerCase()) {
    return c.json({ error: 'only the seller can withdraw the request' }, 403);
  }
  if (deal.factoringOfferId) {
    return c.json({ error: 'an offer was already accepted on this invoice' }, 409);
  }

  const updated = await patchDeal(deal.jobId, {
    factoringRequestedAt: undefined,
    factoringMinAdvanceUsdc: undefined,
  });

  logger.info(
    { invoiceId: deal.jobId, seller: deal.seller },
    'factoring: seller withdrew the early-payout request',
  );
  return c.json({ deal: updated ? financierSafeDeal(updated) : null });
});

/// GET /api/factoring/available: invoices the SELLER has opened to offers:
/// accepted deals with a live early-payout request, no accepted offer yet, and
/// delivery still pending. The /financier dashboard pulls from here.
factoringRoutes.get('/available', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }
  const sector = c.req.query('sector');
  const region = c.req.query('region');
  const deals = await listAllDeals();
  // A deal that already carries a PO line cannot be funded again:
  // KarwanPOFinancing.fund() reverts with AlreadyFunded for any state other
  // than None. Leaving those in the list offered a Fund line button that could
  // only ever revert, and read as though the line were still open.
  let financedInvoiceIds = new Set<string>();
  try {
    financedInvoiceIds = new Set(
      (await listAllPOLines()).map((l) => l.invoiceId.toLowerCase()),
    );
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'po line lookup failed; funded lines may still show as available',
    );
  }
  const available = deals.filter(
    (d) =>
      // Factoring is a finance-lane (trade-finance) product only. P2P
      // service deals are private to their two persons, who never opted into
      // a financier seeing or fronting them. Without this, the financier
      // marketplace leaked every accepted P2P deal.
      d.tradeLane === 'finance' &&
      // The seller asked to be paid early. Without this the desk listed every
      // accepted finance-lane deal, exposing counterparty, amount and timing to
      // every approved financier without the seller ever asking for an advance.
      d.factoringRequestedAt &&
      d.acceptedAt &&
      !d.settledAt &&
      !d.cancelledAt &&
      !d.disputed &&
      !d.factoringOfferId &&
      !financedInvoiceIds.has(d.jobId.toLowerCase()),
  );
  const filtered = available.filter((d) => {
    if (sector && d.counterpartyCompany?.sector !== sector) return false;
    if (region && d.counterpartyCompany?.region !== region) return false;
    return true;
  });
  // Quote what is still CLAIMABLE, not just the invoice face. An invoice that
  // has already released a tranche can still be financed, but only against what
  // is left, and a financier pricing off face would offer more than the escrow
  // can ever repay.
  //
  // A deal whose escrow could not be read is dropped from the listing rather
  // than shown at face. Better a shorter desk than a price nobody can stand
  // behind. Same for one with nothing left to claim.
  const claimableMap = await claimableForDeals(filtered.map((d) => d.jobId));

  // Stamp each deal with the seller's reputation tier so the financier can price
  // risk at a glance (tier drives both the discount floor and the stake the
  // seller must post to take the advance).
  const withTier = await Promise.all(
    filtered
      .filter((d) => {
        const claimable = claimableMap.get(d.jobId);
        return claimable !== undefined && Number(claimable) > 0;
      })
      .map(async (d) => {
        let sellerTier: RepTier = 'new';
        try {
          sellerTier = (await actorSignalsFor(d.seller)).repTier;
        } catch {
          sellerTier = 'new';
        }
        return {
          ...financierSafeDeal(d),
          sellerTier,
          claimableUsdc: claimableMap.get(d.jobId)!,
        };
      }),
  );
  return c.json({ deals: withTier });
});

/// GET /api/factoring/my-qualification: the signed-in seller's factoring stake
/// status, so the offer UI can show the requirement BEFORE they accept. Returns
/// their reputation tier, the bps of the advance their tier must back, and their
/// current free stake. The frontend computes the per-offer requirement from the
/// advance. freeStakeUsdc is null when the on-chain read failed.
factoringRoutes.get('/my-qualification', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const seller = session.address.toLowerCase();
  let tier: RepTier = 'new';
  try {
    tier = (await actorSignalsFor(seller)).repTier;
  } catch {
    tier = 'new';
  }
  let freeStakeUsdc: string | null = null;
  try {
    const freeWei = (await vault.read.freeStakeOf([seller as `0x${string}`])) as bigint;
    freeStakeUsdc = formatUnits(freeWei, 6);
  } catch {
    freeStakeUsdc = null;
  }
  return c.json({ tier, requiredBps: FACTORING_STAKE_BPS[tier], freeStakeUsdc });
});

/// POST /api/factoring/offer: financier proposes an offer on a seller's
/// accepted invoice. Stored in 'offered' status until seller decides.
factoringRoutes.post('/offer', async (c) => {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    return c.json({ error: 'invoice registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }

  let body;
  try {
    body = offerBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  // Finance-lane only. A P2P service deal between two persons is private and
  // never factorable; the lane separation must hold at the write path too.
  if (deal.tradeLane !== 'finance') {
    return c.json({ error: 'factoring is only available on trade-finance deals' }, 409);
  }
  if (!deal.acceptedAt || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for factoring' }, 409);
  }
  if (deal.factoringOfferId) {
    return c.json({ error: 'deal already has an accepted factoring offer' }, 409);
  }
  // Consent is enforced at the write path too, not just by leaving the invoice
  // out of /available. A financier who kept a jobId from an earlier listing, or
  // guessed one, must not be able to put an offer in front of a seller who has
  // withdrawn or never asked.
  if (!deal.factoringRequestedAt) {
    return c.json(
      { error: 'the seller has not asked for early payout on this invoice', code: 'not_requested' },
      409,
    );
  }

  const financier = session.address.toLowerCase();
  // A financier must be a third party. Block both sides of the deal so the
  // seller can't discount their own invoice to themselves and the buyer can't
  // front their own settlement (no real capital changes hands either way).
  if (financier === deal.seller) {
    return c.json({ error: 'seller cannot fund their own invoice' }, 403);
  }
  if (financier === deal.buyer.toLowerCase()) {
    return c.json({ error: 'buyer cannot fund their own deal' }, 403);
  }

  // Price against what is CLAIMABLE, not against invoice face.
  //
  // Face includes the platform fee and every tranche already released to the
  // seller. The assignment can only pay out of what is left on the seller side,
  // so an offer priced against face on a part-released invoice is an offer the
  // escrow cannot honour. A 500 invoice with 50% already released can support a
  // 250 claim, not a 430 one.
  //
  // This also keeps a partly-released invoice FINANCEABLE, which blocking it
  // outright did not. The seller factors what remains, at a number that is true.
  const claimable = await claimableUsdc(deal.jobId);
  if (claimable === null) {
    return c.json(
      { error: 'could not read the escrow balance, try again shortly', code: 'escrow-unreadable' },
      503,
    );
  }

  const faceValueUsdc = deal.dealAmountUsdc;
  const advance = Number(body.offeredAdvanceUsdc);
  const expected = Number(body.expectedReturnUsdc);
  const claimableNum = Number(claimable);

  if (claimableNum <= 0) {
    return c.json(
      { error: 'this invoice has already paid out in full', code: 'nothing-claimable' },
      409,
    );
  }
  if (advance >= claimableNum) {
    return c.json(
      {
        error: `advance must be below the ${claimableNum.toFixed(2)} USDC still claimable on this invoice`,
        code: 'above-claimable',
        claimableUsdc: claimable,
      },
      400,
    );
  }
  // The seller named a floor when they asked. Refusing a lower bid here beats
  // showing them one they have already said they will not take.
  if (deal.factoringMinAdvanceUsdc && advance < Number(deal.factoringMinAdvanceUsdc)) {
    return c.json(
      {
        error: `the seller will not consider less than ${deal.factoringMinAdvanceUsdc} USDC`,
        code: 'below_seller_minimum',
        minAdvanceUsdc: deal.factoringMinAdvanceUsdc,
      },
      409,
    );
  }
  // The expected return is capped by what the escrow can actually pay. Anything
  // above the claimable balance is a number the assignment can never reach, and
  // the financier would discover that only at settlement.
  if (expected <= advance || expected > claimableNum) {
    return c.json(
      {
        error: `expected return must be above the advance and at most the ${claimableNum.toFixed(2)} USDC still claimable`,
        code: 'above-claimable',
        claimableUsdc: claimable,
      },
      400,
    );
  }

  // Discount is measured against the claimable balance, because that is what is
  // being bought. Measuring against face would understate the discount on a
  // part-released invoice and misprice the risk for both sides.
  const discountBps = Math.round(((claimableNum - advance) / claimableNum) * 10_000);
  const now = Date.now();
  const expiresAt = now + body.expiresInHours * 60 * 60 * 1000;

  // The advance leg needs a settlement instrument before the offer is
  // worth anything. Circle financiers: backend signs from their identity
  // wallet at accept time, nothing to capture. Web3 financiers: an
  // EIP-3009 authorization signed now, valid past the offer expiry, so
  // the seller's accept can move the advance without the financier
  // being online.
  const financierUser = getUserByAddress(financier);
  if (!financierUser && !body.advanceAuthorization) {
    return c.json(
      { error: 'advance authorization required: sign the USDC transfer authorization for the advance' },
      400,
    );
  }
  if (body.advanceAuthorization) {
    const problem = await verifyTransferAuthorization(body.advanceAuthorization, {
      from: financier,
      to: deal.seller,
      valueAtomic: atomicUsdc(body.offeredAdvanceUsdc),
      // Must cover the accept window plus an hour of margin.
      validUntil: Math.floor(expiresAt / 1000) + 3600,
    });
    if (problem) {
      return c.json({ error: 'invalid advance authorization', detail: problem }, 400);
    }
  }

  // Circle financiers do not sign in a browser, but the registry needs an
  // authorization to relay: assignReceivable pays the seller and records the
  // assignment from that one signature. Producing it here from their identity
  // wallet keeps both wallet types on the same on-chain path, rather than
  // leaving Circle-funded offers on an unprotected rail.
  let advanceAuthorization = body.advanceAuthorization;
  if (!advanceAuthorization && financierUser) {
    try {
      advanceAuthorization = await signTransferAuthorizationWithCircle(
        financierUser.circleIdentityWalletId,
        financier,
        deal.seller,
        atomicUsdc(body.offeredAdvanceUsdc),
        // Outlive the offer with an hour of margin, matching the validity the
        // web3 path is checked against just above.
        Math.floor((expiresAt - Date.now()) / 1000) + 3600,
      );
    } catch (err) {
      logger.warn(
        { financier, err: (err as Error).message },
        'factoring: could not sign the advance from the Circle wallet',
      );
      return c.json(
        { error: 'could not sign the advance authorization', detail: (err as Error).message },
        502,
      );
    }
  }

  // A financier gets ONE live offer per invoice. Re-pricing supersedes the
  // previous one instead of stacking a second offer against the same seller,
  // who would otherwise see two live quotes from one counterparty and have to
  // guess which is current.
  const mine = (await listOffersForInvoice(body.invoiceId)).find(
    (o) => o.financier.toLowerCase() === financier && o.status === 'offered',
  );
  if (mine) {
    await patchFactoringOffer(mine.id, { status: 'superseded' });
    logger.info(
      { offerId: mine.id, invoiceId: body.invoiceId, financier },
      'factoring: superseded the financier\'s previous open offer',
    );
  }

  const offer = await createFactoringOffer({
    id: randomUUID(),
    invoiceId: body.invoiceId,
    financier,
    seller: deal.seller,
    faceValueUsdc,
    claimableAtOfferUsdc: claimable,
    offeredAdvanceUsdc: body.offeredAdvanceUsdc,
    expectedReturnUsdc: body.expectedReturnUsdc,
    discountBps,
    status: 'offered',
    offeredAt: now,
    expiresAt,
    advanceAuthorization,
  });

  bus.emitEvent({
    type: 'factoring.offered',
    jobId: body.invoiceId,
    actor: 'platform',
    payload: {
      offerId: offer.id,
      financier,
      // The seller is the recipient of this offer; naming them routes the
      // in-app notification + Telegram alert to the right party.
      seller: deal.seller,
      discountBps,
      advance: body.offeredAdvanceUsdc,
    },
  });

  logger.info(
    { offerId: offer.id, invoiceId: body.invoiceId, financier, discountBps },
    'factoring: offer created',
  );
  return c.json({ offer });
});

/// GET /api/factoring/offers/:invoiceId: all offers (any status) on a
/// specific invoice. Seller's deal page pulls from here.
factoringRoutes.get('/offers/:invoiceId', async (c) => {
  const parsed = hashSchema.safeParse(c.req.param('invoiceId'));
  if (!parsed.success) return c.json({ error: 'invalid invoiceId' }, 400);
  // Offers carry pricing terms between two named parties. Scope the read to
  // the session's own side: the invoice's seller sees every offer made to
  // them, a financier sees only their own. Anonymous callers see nothing.
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const me = session.address.toLowerCase();
  const offers = (await listOffersForInvoice(parsed.data)).filter(
    (o) => o.seller.toLowerCase() === me || o.financier.toLowerCase() === me,
  );
  return c.json({ offers });
});

/// GET /api/factoring/mine: offers belonging to the signed-in user as
/// financier OR seller. Used by both dashboards.
factoringRoutes.get('/mine', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const address = session.address.toLowerCase();
  const [asFinancier, asSeller] = await Promise.all([
    listOffersByFinancier(address),
    listOffersBySeller(address),
  ]);
  return c.json({ asFinancier, asSeller });
});

/// GET /api/factoring/open: every open offer on the platform. Internal
/// helper for the expiry watcher and operator dashboards. Session-gated:
/// the full offer book (every financier's terms against every invoice) is
/// not a public dataset.
factoringRoutes.get('/open', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }
  const offers = await listOpenOffers();
  return c.json({ offers });
});

/// GET /api/factoring/offers/:offerId/assignment: the exact arguments a web3
/// seller needs to call registry.assignReceivable themselves.
///
/// The call is seller-gated on chain, so the backend cannot make it for them,
/// and it carries the financier's signed authorization. Returning those
/// arguments here rather than widening the offer payload keeps the signature
/// out of every listing and scoped to the one party entitled to submit it.
factoringRoutes.get('/offers/:offerId/assignment', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  const offer = await getFactoringOffer(c.req.param('offerId'));
  if (!offer) return c.json({ error: 'offer not found' }, 404);
  if (offer.seller.toLowerCase() !== session.address.toLowerCase()) {
    return c.json({ error: 'not your offer' }, 403);
  }
  if (offer.status !== 'offered') {
    return c.json({ error: 'offer is no longer open' }, 409);
  }
  if (!offer.advanceAuthorization) {
    return c.json({ error: 'offer has no advance instrument' }, 409);
  }
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    return c.json({ error: 'invoice registry not configured' }, 503);
  }

  const auth = offer.advanceAuthorization;
  const { v, r, s } = splitSignature(auth.signature);
  return c.json({
    registry: config.KARWAN_INVOICE_REGISTRY_ADDR,
    invoiceId: offer.invoiceId,
    financier: offer.financier,
    repayUsdc: atomicUsdc(offer.expectedReturnUsdc),
    advanceUsdc: auth.value,
    validAfter: auth.validAfter,
    validBefore: auth.validBefore,
    nonce: auth.nonce,
    v,
    r,
    s,
  });
});

/// POST /api/factoring/accept: seller accepts a financier's offer. The advance
/// and the receivable assignment happen in one on-chain call; this records the
/// result and flips state.
factoringRoutes.post('/accept', async (c) => {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    return c.json({ error: 'invoice registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = acceptBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const offer = await getFactoringOffer(body.offerId);
  if (!offer) return c.json({ error: 'unknown offer' }, 404);
  if (offer.status !== 'offered') {
    return c.json({ error: `cannot accept offer in status ${offer.status}` }, 409);
  }
  if (Date.now() > offer.expiresAt) {
    await patchFactoringOffer(offer.id, { status: 'expired' });
    return c.json({ error: 'offer expired' }, 410);
  }

  const seller = session.address.toLowerCase();
  if (seller !== offer.seller) {
    return c.json({ error: 'only seller can accept this offer' }, 403);
  }

  const hold = await shouldHoldFactoring(offer.id);
  if (hold) {
    return c.json({ error: 'held for review', verdict: hold }, 409);
  }

  // Check no other accepted offer raced in.
  const deal = await getDeal(offer.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  if (deal.factoringOfferId) {
    return c.json({ error: 'deal already has an accepted factoring offer' }, 409);
  }

  // The escrow must still hold enough to repay the financier.
  //
  // An offer is priced against the invoice FACE value at the moment it is made.
  // Milestones keep releasing while the offer sits open, and the assignment can
  // only ever pay out of what is left. So a seller could take a 50% release and
  // THEN accept a 430 advance against a 500 invoice: the financier pays 430 and
  // the escrow can return at most 250. That is a straight loss of 180 to the
  // financier, and nothing between the offer and the accept was checking it.
  //
  // Read the escrow at accept time, not at offer time, because the gap between
  // them is exactly where the money leaks.
  try {
    const account = await readEscrow(deal.jobId);
    // The assignee is paid out of the SELLER side, so what is still claimable is
    // sellerNet minus what has already been released. Face value is the wrong
    // number here: it includes the platform fee and every tranche already gone.
    const remainingWei = account.sellerNet - account.released;
    const remainingUsdc = Number(
      formatUnits(remainingWei > 0n ? remainingWei : 0n, USDC_DECIMALS),
    );
    const owed = Number(offer.expectedReturnUsdc);
    if (Number.isFinite(remainingUsdc) && remainingUsdc + 1e-6 < owed) {
      logger.warn(
        { offerId: offer.id, jobId: deal.jobId, remainingUsdc, owed },
        'factoring accept refused: escrow no longer covers the expected return',
      );
      return c.json(
        {
          error: `This invoice has already paid out. Only ${remainingUsdc.toFixed(2)} USDC is left in escrow, and the offer expects ${owed.toFixed(2)} back. Ask the financier to re-price.`,
          code: 'escrow-drained',
          remainingUsdc: remainingUsdc.toFixed(6),
          expectedReturnUsdc: offer.expectedReturnUsdc,
        },
        409,
      );
    }
  } catch (err) {
    // Fail CLOSED. An unreadable escrow means we cannot prove the financier is
    // covered, and this is the last gate before their money moves.
    logger.error(
      { offerId: offer.id, jobId: deal.jobId, err: (err as Error).message },
      'factoring accept refused: could not read the escrow',
    );
    return c.json(
      { error: 'could not verify the escrow balance, try again shortly', code: 'escrow-unreadable' },
      503,
    );
  }

  // Reputation + stake gate. The financier's downside on a default is the
  // advance, so the seller must hold free stake covering a tier-scaled fraction
  // of it: a proven elite is waived, a new wallet posts the full amount. The
  // existing default path slashes that stake to make the financier whole.
  let repTier: RepTier = 'new';
  try {
    repTier = (await actorSignalsFor(seller)).repTier;
  } catch {
    repTier = 'new'; // conservative on a read failure: never waive the collateral
  }
  const requiredBps = FACTORING_STAKE_BPS[repTier];
  if (requiredBps > 0) {
    const requiredAtomic = (parseUnits(offer.offeredAdvanceUsdc, 6) * BigInt(requiredBps)) / 10_000n;
    let freeWei: bigint;
    try {
      freeWei = (await vault.read.freeStakeOf([seller as `0x${string}`])) as bigint;
    } catch {
      return c.json(
        { error: 'could not read your stake balance, try again', code: 'STAKE_READ_FAILED' },
        503,
      );
    }
    if (freeWei < requiredAtomic) {
      const requiredUsdc = Number(formatUnits(requiredAtomic, 6)).toFixed(2);
      const freeStakeUsdc = Number(formatUnits(freeWei, 6)).toFixed(2);
      return c.json(
        {
          error: `You need ${requiredUsdc} USDC staked to take this advance at your ${repTier.toUpperCase()} tier (you have ${freeStakeUsdc}). Build reputation or stake to qualify.`,
          code: 'INSUFFICIENT_STAKE',
          tier: repTier,
          requiredBps,
          requiredUsdc,
          freeStakeUsdc,
        },
        409,
      );
    }
  }

  if (acceptingInvoices.has(offer.invoiceId)) {
    return c.json({ error: 'another acceptance on this invoice is in progress' }, 409);
  }
  acceptingInvoices.add(offer.invoiceId);
  try {
    // No repayment instrument is collected any more. The escrow pays the
    // financier out of the settlement itself, ahead of the seller, so there is
    // nothing left to pull and nothing for a seller to withhold. An
    // authorization is still verified when an older client sends one, rather
    // than silently storing something unchecked.
    if (body.repayAuthorization) {
      const problem = await verifyTransferAuthorization(body.repayAuthorization, {
        from: seller,
        to: offer.financier,
        valueAtomic: atomicUsdc(offer.expectedReturnUsdc),
        validUntil:
          Math.floor(Date.now() / 1000) + MIN_REPAY_VALIDITY_DAYS * 24 * 60 * 60,
      });
      if (problem) {
        return c.json({ error: 'invalid repayment authorization', detail: problem }, 400);
      }
    }

    // The advance and the receivable assignment are one call on the registry.
    // Splitting them would reopen the hole this replaced: assignment is
    // irrevocable in the escrow, so a seller who assigned before collecting
    // could be left with their receivable redirected to someone who never
    // paid. assignReceivable relays the financier's signed authorization and
    // records the redirect atomically, or does neither.
    //
    // It is seller-agent-gated on chain. The advance authorization still pays
    // the seller identity wallet, but the transaction itself must be sent by
    // the seller agent recorded in escrow. Using the Circle identity wallet
    // here causes the registry's NotParty check to reject every assignment.
    if (!offer.advanceAuthorization) {
      return c.json(
        { error: 'offer has no advance instrument; ask the financier to re-offer' },
        409,
      );
    }
    const registryAddr = config.KARWAN_INVOICE_REGISTRY_ADDR;
    if (!registryAddr) {
      return c.json({ error: 'invoice registry not configured' }, 503);
    }

    let advanceTxHash: string;
    if (body.assignTxHash) {
      // Web3 seller: they signed and sent it, we record it. The chain already
      // enforced the seller gate, the atomicity and the single-sale rule.
      advanceTxHash = body.assignTxHash;
    } else {
      if (!deal.sellerAgentWalletId || !deal.sellerAgentAddress) {
        return c.json(
          { error: 'seller agent wallet is not configured; sign the assignment from your wallet and resubmit with assignTxHash' },
          400,
        );
      }
      const auth = offer.advanceAuthorization;
      const { v, r: sigR, s: sigS } = splitSignature(auth.signature);
      try {
        const res = await executeContractCall(
          {
            walletId: deal.sellerAgentWalletId,
            contractAddress: registryAddr,
            abiFunctionSignature:
              'assignReceivable(bytes32,address,uint128,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)',
            abiParameters: [
              offer.invoiceId,
              offer.financier,
              atomicUsdc(offer.expectedReturnUsdc),
              auth.value,
              auth.validAfter,
              auth.validBefore,
              auth.nonce,
              String(v),
              sigR,
              sigS,
            ],
            idempotencyKey: deterministicIdempotencyKey(`factoring-assign:${offer.id}`),
          },
          `factoring.assignReceivable(${offer.id})`,
        );
        advanceTxHash = res.txHash;
      } catch (err) {
        logger.warn(
          { offerId: offer.id, err: (err as Error).message },
          'factoring: assignReceivable failed; offer stays open',
        );
        return c.json(
          { error: 'advance and assignment failed', detail: (err as Error).message },
          502,
        );
      }
    }

    const now = Date.now();
    // Compare-and-set: the flip only lands while the offer is still
    // 'offered', so a racing duplicate accept (multi-tab, replay, a second
    // instance) can't record twice. The advance transfer above is idempotent
    // (offer.id keys the Circle call; the EIP-3009 nonce is single-use on
    // chain), so losing the guard after paying means the OTHER accept won
    // with the same, single advance.
    const accepted = await patchFactoringOfferIfStatus(offer.id, 'offered', {
      status: 'accepted',
      acceptedAt: now,
      setPayeeTxHash: body.setPayeeTxHash,
      advanceTxHash,
      repayAuthorization: body.repayAuthorization,
    });
    if (!accepted) {
      return c.json(
        { error: 'offer is no longer open (accepted elsewhere or expired)' },
        409,
      );
    }
    await patchDeal(offer.invoiceId, { factoringOfferId: offer.id });

    bus.emitEvent({
      type: 'factoring.accepted',
      jobId: offer.invoiceId,
      actor: 'platform',
      payload: {
        offerId: offer.id,
        seller,
        financier: offer.financier,
        advanceUsdc: offer.offeredAdvanceUsdc,
        advanceTxHash,
      },
    });

    logger.info(
      {
        offerId: offer.id,
        invoiceId: offer.invoiceId,
        seller,
        financier: offer.financier,
        advanceTxHash,
      },
      'factoring: offer accepted, advance paid',
    );
    return c.json({ offer: accepted });
  } finally {
    acceptingInvoices.delete(offer.invoiceId);
  }
});

/// POST /api/factoring/reject: seller declines a financier's offer.
factoringRoutes.post('/reject', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = rejectBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const offer = await getFactoringOffer(body.offerId);
  if (!offer) return c.json({ error: 'unknown offer' }, 404);
  if (offer.status !== 'offered') {
    return c.json({ error: `cannot reject offer in status ${offer.status}` }, 409);
  }
  if (session.address.toLowerCase() !== offer.seller) {
    return c.json({ error: 'only seller can reject this offer' }, 403);
  }

  const rejected = await patchFactoringOffer(offer.id, {
    status: 'rejected',
    rejectedAt: Date.now(),
  });

  bus.emitEvent({
    type: 'factoring.rejected',
    jobId: offer.invoiceId,
    actor: 'platform',
    payload: { offerId: offer.id, seller: offer.seller, financier: offer.financier },
  });
  return c.json({ offer: rejected });
});
