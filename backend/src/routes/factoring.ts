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
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldHoldFactoring } from '../security/sa-stub.js';
import { logger } from '../logger.js';

/// Invoice factoring routes. The financier funds the seller's invoice at
/// a discount and is repaid from the buyer's eventual settlement through
/// Circle Gateway (cascading EIP-3009 batch). The actual on-chain
/// registry.setPayee + Gateway batch are signed by the user's wallet;
/// the backend records the off-chain state.

const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'expected 0x-prefixed 32-byte hex hash');
const usdcAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'expected decimal USDC string')
  .refine((v) => Number(v) > 0, { message: 'must be positive' });

const offerBodySchema = z.object({
  invoiceId: hashSchema,
  offeredAdvanceUsdc: usdcAmountSchema,
  expectedReturnUsdc: usdcAmountSchema,
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

const acceptBodySchema = z.object({
  offerId: z.string().uuid(),
  setPayeeTxHash: hashSchema.optional(),
  advanceTxHash: hashSchema.optional(),
});

const rejectBodySchema = z.object({
  offerId: z.string().uuid(),
});

export const factoringRoutes = new Hono();

/// GET /api/factoring/available — invoices open to factoring offers:
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

/// POST /api/factoring/offer — financier proposes an offer on a seller's
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
    expiresAt: now + body.expiresInHours * 60 * 60 * 1000,
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

/// GET /api/factoring/offers/:invoiceId — all offers (any status) on a
/// specific invoice. Seller's deal page pulls from here.
factoringRoutes.get('/offers/:invoiceId', async (c) => {
  const parsed = hashSchema.safeParse(c.req.param('invoiceId'));
  if (!parsed.success) return c.json({ error: 'invalid invoiceId' }, 400);
  const offers = await listOffersForInvoice(parsed.data);
  return c.json({ offers });
});

/// GET /api/factoring/mine — offers belonging to the signed-in user as
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

/// GET /api/factoring/open — every open offer on the platform. Internal
/// helper for the expiry watcher and operator dashboards.
factoringRoutes.get('/open', async (c) => {
  const offers = await listOpenOffers();
  return c.json({ offers });
});

/// POST /api/factoring/accept — seller accepts a financier's offer.
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

  const now = Date.now();
  const accepted = await patchFactoringOffer(offer.id, {
    status: 'accepted',
    acceptedAt: now,
    setPayeeTxHash: body.setPayeeTxHash,
    advanceTxHash: body.advanceTxHash,
  });
  await patchDeal(offer.invoiceId, { factoringOfferId: offer.id });

  bus.emitEvent({
    type: 'factoring.accepted',
    jobId: offer.invoiceId,
    actor: 'platform',
    payload: { offerId: offer.id, seller, financier: offer.financier },
  });

  logger.info(
    { offerId: offer.id, invoiceId: offer.invoiceId, seller, financier: offer.financier },
    'factoring: offer accepted',
  );
  return c.json({ offer: accepted });
});

/// POST /api/factoring/reject — seller declines a financier's offer.
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
