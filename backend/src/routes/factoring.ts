import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readSession } from '../auth/session.js';
import {
  createFactoringOffer,
  getFactoringOffer,
  listOffersForInvoice,
  listOffersByFinancier,
  listOffersBySeller,
  listOpenOffers,
  patchFactoringOffer,
} from '../db/factoring.js';
import { getDeal, patchDeal, listAllDeals } from '../db/deals.js';
import { getUserByAddress } from '../db/users.js';
import {
  verifyTransferAuthorization,
  submitTransferWithAuthorization,
  transferFromCircleWallet,
} from '../chain/usdc3009.js';
import { parseUnits } from 'viem';
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldHoldFactoring } from '../security/sa-stub.js';
import { logger } from '../logger.js';

/// Invoice factoring routes. Both money legs ride native USDC EIP-3009 on
/// Arc (or a direct backend transfer for Circle-auth parties):
///   - ADVANCE (financier -> seller): a web3 financier signs the
///     authorization at OFFER time; the relay submits it the moment the
///     seller accepts. Circle financiers skip the signature; the backend
///     transfers from their identity wallet at accept.
///   - REPAYMENT (seller -> financier): a web3 seller signs at ACCEPT
///     time (zero balance needed); the settlement watcher submits it when
///     the escrow settles. Circle sellers skip it; the backend transfers
///     from their identity wallet at settle time.

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
  repayAuthorization: authorizationSchema.optional(),
});

function atomicUsdc(decimal: string): string {
  return parseUnits(decimal, USDC_DECIMALS).toString();
}

/// Per-invoice accept lock. The advance transfer takes seconds; without
/// this, two accepts racing on different offers against the same invoice
/// could both pass the factoringOfferId check and both pay an advance.
const acceptingInvoices = new Set<string>();

const rejectBodySchema = z.object({
  offerId: z.string().uuid(),
});

export const factoringRoutes = new Hono();

/// GET /api/factoring/available: invoices open to factoring offers:
/// accepted deals where the seller has not yet accepted a factoring offer
/// and where delivery is still pending. The /financier dashboard pulls
/// from here.
factoringRoutes.get('/available', async (c) => {
  const sector = c.req.query('sector');
  const region = c.req.query('region');
  const deals = await listAllDeals();
  const available = deals.filter(
    (d) =>
      d.acceptedAt &&
      !d.settledAt &&
      !d.cancelledAt &&
      !d.disputed &&
      !d.factoringOfferId,
  );
  const filtered = available.filter((d) => {
    if (sector && d.counterpartyCompany?.sector !== sector) return false;
    if (region && d.counterpartyCompany?.region !== region) return false;
    return true;
  });
  return c.json({ deals: filtered });
});

/// POST /api/factoring/offer: financier proposes an offer on a seller's
/// accepted invoice. Stored in 'offered' status until seller decides.
factoringRoutes.post('/offer', async (c) => {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    return c.json({ error: 'invoice registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = offerBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  if (!deal.acceptedAt || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for factoring' }, 409);
  }
  if (deal.factoringOfferId) {
    return c.json({ error: 'deal already has an accepted factoring offer' }, 409);
  }

  const financier = session.address.toLowerCase();
  if (financier === deal.seller) {
    return c.json({ error: 'seller cannot fund their own invoice' }, 403);
  }

  const faceValueUsdc = deal.dealAmountUsdc;
  const advance = Number(body.offeredAdvanceUsdc);
  const expected = Number(body.expectedReturnUsdc);
  const face = Number(faceValueUsdc);
  if (advance >= face) {
    return c.json({ error: 'advance must be below face value' }, 400);
  }
  if (expected <= advance || expected > face) {
    return c.json({ error: 'expected return must be above advance and at most face value' }, 400);
  }

  const discountBps = Math.round(((face - advance) / face) * 10_000);
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

  const offer = await createFactoringOffer({
    id: randomUUID(),
    invoiceId: body.invoiceId,
    financier,
    seller: deal.seller,
    faceValueUsdc,
    offeredAdvanceUsdc: body.offeredAdvanceUsdc,
    expectedReturnUsdc: body.expectedReturnUsdc,
    discountBps,
    status: 'offered',
    offeredAt: now,
    expiresAt,
    advanceAuthorization: body.advanceAuthorization,
  });

  bus.emitEvent({
    type: 'factoring.offered',
    jobId: body.invoiceId,
    actor: 'platform',
    payload: {
      offerId: offer.id,
      financier,
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
  const offers = await listOffersForInvoice(parsed.data);
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
/// helper for the expiry watcher and operator dashboards.
factoringRoutes.get('/open', async (c) => {
  const offers = await listOpenOffers();
  return c.json({ offers });
});

/// POST /api/factoring/accept: seller accepts a financier's offer.
/// Caller's wallet already did registry.setPayee + Circle Gateway
/// authorisations off-chain; this records the tx hashes and updates
/// state.
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
  if (acceptingInvoices.has(offer.invoiceId)) {
    return c.json({ error: 'another acceptance on this invoice is in progress' }, 409);
  }
  acceptingInvoices.add(offer.invoiceId);
  try {
    // Repayment instrument. Circle sellers: nothing to capture; the
    // settlement watcher transfers from their identity wallet when the
    // escrow settles. Web3 sellers: an EIP-3009 authorization signed now
    // (zero balance needed; the escrow payout funds it later), submitted
    // by the relay at settle time.
    const sellerUser = getUserByAddress(seller);
    if (!sellerUser && !body.repayAuthorization) {
      return c.json(
        { error: 'repayment authorization required: sign the USDC transfer authorization for the repayment' },
        400,
      );
    }
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

    // Move the advance BEFORE flipping state: an accepted offer means the
    // seller has been paid, not that paperwork happened. On failure the
    // offer stays 'offered' so the seller can retry.
    let advanceTxHash: string;
    try {
      if (offer.advanceAuthorization) {
        const r = await submitTransferWithAuthorization(
          offer.advanceAuthorization,
          `factoring.advance(${offer.id})`,
        );
        advanceTxHash = r.txHash;
      } else {
        const financierUser = getUserByAddress(offer.financier);
        if (!financierUser) {
          // Legacy offer from before the on-chain advance shipped: no
          // authorization stored and no Circle wallet to sign from.
          return c.json(
            { error: 'offer has no advance instrument; ask the financier to re-offer' },
            409,
          );
        }
        const r = await transferFromCircleWallet(
          financierUser.circleIdentityWalletId,
          seller,
          atomicUsdc(offer.offeredAdvanceUsdc),
          `factoring.advance(${offer.id})`,
          // Offer id doubles as the idempotency key so a retried accept
          // can't double-pay the advance.
          offer.id,
        );
        advanceTxHash = r.txHash;
      }
    } catch (err) {
      logger.warn(
        { offerId: offer.id, err: (err as Error).message },
        'factoring: advance transfer failed; offer stays open',
      );
      return c.json(
        { error: 'advance transfer failed', detail: (err as Error).message },
        502,
      );
    }

    const now = Date.now();
    const accepted = await patchFactoringOffer(offer.id, {
      status: 'accepted',
      acceptedAt: now,
      setPayeeTxHash: body.setPayeeTxHash,
      advanceTxHash,
      repayAuthorization: body.repayAuthorization,
    });
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
