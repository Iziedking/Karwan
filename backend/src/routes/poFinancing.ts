import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readSession } from '../auth/session.js';
import {
  createPOLine,
  getPOLine,
  getPOLineForInvoice,
  listLinesByFinancier,
  listLinesBySeller,
  listOpenLines,
  patchPOLine,
} from '../db/poFinancing.js';
import { getDeal, listAllDeals } from '../db/deals.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldHoldPOFunding } from '../security/sa-stub.js';
import { logger } from '../logger.js';

/// Purchase-order financing routes. Single-funder per invoice: financier
/// deposits principal into KarwanPOFinancing, contract releases to seller
/// on PoD anchor, financier reclaims repayUsdc from seller's settlement
/// via the contract's pull-based ERC20 approval pattern.
///
/// All on-chain interactions are signed by the user's wallet. Routes
/// here record the off-chain mirror and provide list / get views.

const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'expected 0x-prefixed 32-byte hex hash');
const usdcAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'expected decimal USDC string')
  .refine((v) => Number(v) > 0, { message: 'must be positive' });

const fundBodySchema = z.object({
  invoiceId: hashSchema,
  principalUsdc: usdcAmountSchema,
  repayUsdc: usdcAmountSchema,
  releaseTimeoutSeconds: z.number().int().min(60).max(5 * 365 * 24 * 60 * 60),
  fundTxHash: hashSchema,
});

const releaseBodySchema = z.object({
  lineId: z.string().uuid(),
  releaseTxHash: hashSchema,
  podHash: hashSchema.optional(),
});

const claimBodySchema = z.object({
  lineId: z.string().uuid(),
  repayTxHash: hashSchema,
});

const reclaimBodySchema = z.object({
  lineId: z.string().uuid(),
  reclaimTxHash: hashSchema,
});

const defaultBodySchema = z.object({
  lineId: z.string().uuid(),
  defaultTxHash: hashSchema,
});

export const poFinancingRoutes = new Hono();

/// GET /api/po-financing/available — deals open to PO financing.
/// Accepted invoices without an existing PO line and not yet delivered.
poFinancingRoutes.get('/available', async (c) => {
  const sector = c.req.query('sector');
  const region = c.req.query('region');
  const deals = await listAllDeals();
  const available = deals.filter(
    (d) =>
      d.acceptedAt &&
      !d.delivered &&
      !d.settledAt &&
      !d.cancelledAt &&
      !d.disputed &&
      !d.poFinancingId,
  );
  const filtered = available.filter((d) => {
    if (sector && d.counterpartyCompany?.sector !== sector) return false;
    if (region && d.counterpartyCompany?.region !== region) return false;
    return true;
  });
  return c.json({ deals: filtered });
});

/// POST /api/po-financing/fund — financier records that they funded a
/// PO line on chain. The contract tx already confirmed; we mirror state.
poFinancingRoutes.post('/fund', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = fundBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  if (!deal.acceptedAt || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for PO financing' }, 409);
  }

  const existing = await getPOLineForInvoice(body.invoiceId);
  if (existing) {
    return c.json({ error: 'po line already opened on this invoice', line: existing }, 409);
  }

  const financier = session.address.toLowerCase();
  if (financier === deal.seller) {
    return c.json({ error: 'seller cannot fund their own PO' }, 403);
  }
  if (Number(body.repayUsdc) <= Number(body.principalUsdc)) {
    return c.json({ error: 'repay must exceed principal' }, 400);
  }

  const hold = await shouldHoldPOFunding(body.invoiceId);
  if (hold) {
    return c.json({ error: 'held for review', verdict: hold }, 409);
  }

  const now = Date.now();
  const line = await createPOLine({
    id: randomUUID(),
    invoiceId: body.invoiceId,
    financier,
    seller: deal.seller,
    buyer: deal.buyer,
    principalUsdc: body.principalUsdc,
    repayUsdc: body.repayUsdc,
    state: 'funded',
    fundedAt: now,
    releaseTimeoutAt: now + body.releaseTimeoutSeconds * 1000,
    txHashes: { fund: body.fundTxHash },
  });

  bus.emitEvent({
    type: 'po.funded',
    jobId: body.invoiceId,
    actor: 'platform',
    payload: {
      lineId: line.id,
      financier,
      seller: deal.seller,
      principalUsdc: body.principalUsdc,
      repayUsdc: body.repayUsdc,
    },
  });

  logger.info(
    {
      lineId: line.id,
      invoiceId: body.invoiceId,
      financier,
      principalUsdc: body.principalUsdc,
    },
    'po-financing: funded',
  );
  return c.json({ line });
});

/// POST /api/po-financing/release — anyone records that releaseToSeller
/// fired on chain after PoD anchored. Updates state to Released.
poFinancingRoutes.post('/release', async (c) => {
  let body;
  try {
    body = releaseBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const line = await getPOLine(body.lineId);
  if (!line) return c.json({ error: 'unknown line' }, 404);
  if (line.state !== 'funded') {
    return c.json({ error: `cannot release line in state ${line.state}` }, 409);
  }

  const now = Date.now();
  const updated = await patchPOLine(line.id, {
    state: 'released',
    releasedAt: now,
    repaymentTimeoutAt: now + 7 * 24 * 60 * 60 * 1000,
    podHash: body.podHash,
    txHashes: { ...line.txHashes, release: body.releaseTxHash },
  });

  bus.emitEvent({
    type: 'po.released',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: { lineId: line.id, seller: line.seller, principalUsdc: line.principalUsdc },
  });
  return c.json({ line: updated });
});

/// POST /api/po-financing/claim — financier or seller records that
/// claimRepayment fired on chain. Updates state to Settled.
poFinancingRoutes.post('/claim', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = claimBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const line = await getPOLine(body.lineId);
  if (!line) return c.json({ error: 'unknown line' }, 404);
  if (line.state !== 'released') {
    return c.json({ error: `cannot claim line in state ${line.state}` }, 409);
  }

  const caller = session.address.toLowerCase();
  if (caller !== line.financier && caller !== line.seller) {
    return c.json({ error: 'caller is not a party to this line' }, 403);
  }

  const updated = await patchPOLine(line.id, {
    state: 'repaid',
    repaidAt: Date.now(),
    txHashes: { ...line.txHashes, repay: body.repayTxHash },
  });

  bus.emitEvent({
    type: 'po.repaid',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: { lineId: line.id, financier: line.financier, repayUsdc: line.repayUsdc },
  });
  return c.json({ line: updated });
});

/// POST /api/po-financing/reclaim — financier reclaimed principal after
/// the release timeout passed with no PoD. State -> Reclaimed.
poFinancingRoutes.post('/reclaim', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = reclaimBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const line = await getPOLine(body.lineId);
  if (!line) return c.json({ error: 'unknown line' }, 404);
  if (line.state !== 'funded') {
    return c.json({ error: `cannot reclaim line in state ${line.state}` }, 409);
  }
  if (session.address.toLowerCase() !== line.financier) {
    return c.json({ error: 'only financier can reclaim' }, 403);
  }

  const updated = await patchPOLine(line.id, {
    state: 'reclaimed',
    txHashes: { ...line.txHashes, reclaim: body.reclaimTxHash },
  });

  bus.emitEvent({
    type: 'po.reclaimed',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: { lineId: line.id, financier: line.financier, principalUsdc: line.principalUsdc },
  });
  return c.json({ line: updated });
});

/// POST /api/po-financing/default — financier writes off the line after
/// the repayment window expired. State -> Defaulted.
poFinancingRoutes.post('/default', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = defaultBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const line = await getPOLine(body.lineId);
  if (!line) return c.json({ error: 'unknown line' }, 404);
  if (line.state !== 'released') {
    return c.json({ error: `cannot default line in state ${line.state}` }, 409);
  }
  if (session.address.toLowerCase() !== line.financier) {
    return c.json({ error: 'only financier can mark default' }, 403);
  }

  const updated = await patchPOLine(line.id, {
    state: 'defaulted',
    txHashes: { ...line.txHashes, default: body.defaultTxHash },
  });

  bus.emitEvent({
    type: 'po.defaulted',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: { lineId: line.id, financier: line.financier, seller: line.seller },
  });
  return c.json({ line: updated });
});

/// GET /api/po-financing/mine — lines belonging to the signed-in user as
/// financier OR seller.
poFinancingRoutes.get('/mine', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const address = session.address.toLowerCase();
  const [asFinancier, asSeller] = await Promise.all([
    listLinesByFinancier(address),
    listLinesBySeller(address),
  ]);
  return c.json({ asFinancier, asSeller });
});

/// GET /api/po-financing/open — lines in non-terminal state. Used by the
/// timeout watcher.
poFinancingRoutes.get('/open', async (c) => {
  const lines = await listOpenLines();
  return c.json({ lines });
});

/// GET /api/po-financing/line/:id — fetch a single line.
poFinancingRoutes.get('/line/:id', async (c) => {
  const line = await getPOLine(c.req.param('id'));
  if (!line) return c.json({ error: 'unknown line' }, 404);
  return c.json({ line });
});
