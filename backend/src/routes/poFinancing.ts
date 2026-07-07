import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { parseUnits } from 'viem';
import { readSession } from '../auth/session.js';
import { getProfile } from '../db/profiles.js';
import { isApprovedFinancier } from '../profile/financier.js';
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
import { getUserByAddress } from '../db/users.js';
import { executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldHoldPOFunding } from '../security/sa-stub.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;

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

/// GET /api/po-financing/available: deals open to PO financing.
/// Accepted invoices without an existing PO line and not yet delivered.
poFinancingRoutes.get('/available', async (c) => {
  const sector = c.req.query('sector');
  const region = c.req.query('region');
  const deals = await listAllDeals();
  const available = deals.filter(
    (d) =>
      // PO financing is a finance-lane (SME trade-finance) product only, same
      // as factoring. A finance lane arises only from a verified-business
      // creator (see deriveLane), so this keeps individual P2P deals out of the
      // financier desk.
      d.tradeLane === 'finance' &&
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

/// POST /api/po-financing/fund: financier records that they funded a
/// PO line on chain. The contract tx already confirmed; we mirror state.
poFinancingRoutes.post('/fund', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }

  let body;
  try {
    body = fundBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  if (deal.tradeLane !== 'finance') {
    return c.json({ error: 'PO financing is for SME finance-lane deals only' }, 409);
  }
  if (!deal.acceptedAt || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for PO financing' }, 409);
  }

  const existing = await getPOLineForInvoice(body.invoiceId);
  if (existing) {
    return c.json({ error: 'po line already opened on this invoice', line: existing }, 409);
  }

  const financier = session.address.toLowerCase();
  // A financier must be a third party to the deal, on neither side.
  if (financier === deal.seller) {
    return c.json({ error: 'seller cannot fund their own PO' }, 403);
  }
  if (financier === deal.buyer.toLowerCase()) {
    return c.json({ error: 'buyer cannot fund their own PO' }, 403);
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

const fundCircleBodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x address'),
  invoiceId: hashSchema,
  principalUsdc: usdcAmountSchema,
  repayUsdc: usdcAmountSchema,
  releaseTimeoutSeconds: z.number().int().min(60).max(5 * 365 * 24 * 60 * 60),
});

/// POST /api/po-financing/fund-circle: Circle DCW-only sister route.
/// Backend signs USDC.approve(financing, principal) then
/// KarwanPOFinancing.fund(invoiceId, principal, repay, releaseTimeoutSeconds)
/// via the caller's identity wallet, mirrors the line + emits po.funded
/// with the real chain hash. Web3 callers stay on POST /fund.
poFinancingRoutes.post('/fund-circle', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }

  let body;
  try {
    body = fundCircleBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const caller = body.address.toLowerCase();
  if (caller !== session.address.toLowerCase()) {
    return c.json({ error: 'address must match session' }, 403);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  if (deal.tradeLane !== 'finance') {
    return c.json({ error: 'PO financing is for SME finance-lane deals only' }, 409);
  }
  if (!deal.acceptedAt || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for PO financing' }, 409);
  }
  if (caller === deal.seller) {
    return c.json({ error: 'seller cannot fund their own PO' }, 403);
  }

  const existing = await getPOLineForInvoice(body.invoiceId);
  if (existing) {
    return c.json({ error: 'po line already opened on this invoice', line: existing }, 409);
  }
  if (Number(body.repayUsdc) <= Number(body.principalUsdc)) {
    return c.json({ error: 'repay must exceed principal' }, 400);
  }

  const hold = await shouldHoldPOFunding(body.invoiceId);
  if (hold) {
    return c.json({ error: 'held for review', verdict: hold }, 409);
  }

  const user = getUserByAddress(caller);
  if (!user?.circleIdentityWalletId) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'fund-circle is for Circle users; web3 users sign locally and POST /fund.',
      },
      409,
    );
  }

  const financingAddr = config.KARWAN_PO_FINANCING_ADDR;
  const usdcAddr = config.USDC_ADDR;
  if (!usdcAddr) {
    return c.json({ error: 'USDC_ADDR not configured' }, 503);
  }

  const principalWei = parseUnits(body.principalUsdc, USDC_DECIMALS);
  const repayWei = parseUnits(body.repayUsdc, USDC_DECIMALS);

  try {
    const approveResult = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: usdcAddr,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [financingAddr, principalWei.toString()],
      },
      `usdc.approve(${caller}, poFinancing)`,
    );

    const fundResult = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: financingAddr,
        abiFunctionSignature: 'fund(bytes32,uint128,uint128,uint64)',
        abiParameters: [
          body.invoiceId,
          principalWei.toString(),
          repayWei.toString(),
          body.releaseTimeoutSeconds.toString(),
        ],
      },
      `poFinancing.fund(${body.invoiceId})`,
    );

    const now = Date.now();
    const line = await createPOLine({
      id: randomUUID(),
      invoiceId: body.invoiceId,
      financier: caller,
      seller: deal.seller,
      buyer: deal.buyer,
      principalUsdc: body.principalUsdc,
      repayUsdc: body.repayUsdc,
      state: 'funded',
      fundedAt: now,
      releaseTimeoutAt: now + body.releaseTimeoutSeconds * 1000,
      txHashes: { fund: fundResult.txHash },
    });

    bus.emitEvent({
      type: 'po.funded',
      jobId: body.invoiceId,
      actor: 'platform',
      payload: {
        lineId: line.id,
        financier: caller,
        seller: deal.seller,
        principalUsdc: body.principalUsdc,
        repayUsdc: body.repayUsdc,
      },
    });

    logger.info(
      {
        lineId: line.id,
        invoiceId: body.invoiceId,
        financier: caller,
        approveTxHash: approveResult.txHash,
        fundTxHash: fundResult.txHash,
      },
      'po-financing: funded via Circle DCW',
    );

    return c.json({
      line,
      approveTxHash: approveResult.txHash,
      fundTxHash: fundResult.txHash,
    });
  } catch (err) {
    logger.error(
      { invoiceId: body.invoiceId, err: (err as Error).message },
      'po-financing: fund-circle failed',
    );
    return c.json({ error: 'fund failed', detail: (err as Error).message }, 502);
  }
});

/// POST /api/po-financing/release: anyone records that releaseToSeller
/// fired on chain after PoD anchored. Updates state to Released. The PO
/// watcher drives this leg automatically; this route is the web3 manual
/// fallback and no-ops when the contract is not configured.
poFinancingRoutes.post('/release', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
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

/// POST /api/po-financing/claim: financier or seller records that
/// claimRepayment fired on chain. Updates state to Settled.
poFinancingRoutes.post('/claim', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
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

/// POST /api/po-financing/reclaim: financier reclaimed principal after
/// the release timeout passed with no PoD. State -> Reclaimed.
poFinancingRoutes.post('/reclaim', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
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

/// POST /api/po-financing/default: financier writes off the line after
/// the repayment window expired. State -> Defaulted.
poFinancingRoutes.post('/default', async (c) => {
  if (!config.KARWAN_PO_FINANCING_ADDR) {
    return c.json({ error: 'po financing contract not configured' }, 503);
  }
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

/// GET /api/po-financing/mine: lines belonging to the signed-in user as
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

/// GET /api/po-financing/open: lines in non-terminal state. Used by the
/// timeout watcher.
poFinancingRoutes.get('/open', async (c) => {
  const lines = await listOpenLines();
  return c.json({ lines });
});

/// GET /api/po-financing/line/:id: fetch a single line.
poFinancingRoutes.get('/line/:id', async (c) => {
  const line = await getPOLine(c.req.param('id'));
  if (!line) return c.json({ error: 'unknown line' }, 404);
  return c.json({ line });
});
