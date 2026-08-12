import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { parseUnits, formatUnits, type Address, type Hex } from 'viem';
import { readSession } from '../auth/session.js';
import { getProfile } from '../db/profiles.js';
import { appendActivity } from '../db/activityLog.js';
import { isApprovedFinancier, financierSafeDeal } from '../profile/financier.js';
import {
  createPOLine,
  getPOLine,
  getPOLineForInvoice,
  listLinesByFinancier,
  listLinesBySeller,
  listOpenLines,
  patchPOLine,
} from '../db/poFinancing.js';
import { getDeal, listAllDeals, patchDeal } from '../db/deals.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { getUserByAddress } from '../db/users.js';
import { executeContractCall } from '../chain/txs.js';
import { vault } from '../chain/contracts.js';
import { publicClient } from '../chain/client.js';
import { poFinancingV2Abi } from '../chain/abis/poFinancingV2.js';
import { assertPoFunded, assertPoTerminal, type PoChainLine } from '../chain/poIntegrity.js';
import { actorSignalsFor, type RepTier } from '../agents/signals.js';
import { suggestPOStake } from '../profile/poStakePolicy.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldHoldPOFunding } from '../security/sa-stub.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;

/// Purchase-order financing routes. Single-funder per invoice: the financier's
/// principal goes straight to the seller inside KarwanPOFinancing.fund(), in
/// the same transaction that assigns the deal's receivable to the financier.
/// The escrow then pays the financier ahead of the seller at settlement, and
/// claimRepayment only collects a shortfall.
///
/// There is no release step. The custody-and-proof-of-delivery rail this
/// replaced could not release on the ordinary settlement path, which stranded
/// sellers' advances; see contracts/test/KarwanPOCustodyAttack.t.sol.
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

/// Matches KarwanPOFinancing.MIN_REPAYMENT_WINDOW / MAX_REPAYMENT_WINDOW. The
/// floor is not cosmetic: repayment arrives through the escrow settlement, so a
/// window shorter than the buyer's own release timing would let a financier
/// default a seller who did nothing wrong.
const MIN_REPAYMENT_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const MAX_REPAYMENT_WINDOW_SECONDS = 5 * 365 * 24 * 60 * 60;

const repaymentWindowSchema = z
  .number()
  .int()
  .min(MIN_REPAYMENT_WINDOW_SECONDS)
  .max(MAX_REPAYMENT_WINDOW_SECONDS);

const fundBodySchema = z.object({
  invoiceId: hashSchema,
  principalUsdc: usdcAmountSchema,
  repayUsdc: usdcAmountSchema,
  repaymentWindowSeconds: repaymentWindowSchema,
  requiredStakeUsdc: usdcAmountSchema,
  fundTxHash: hashSchema,
});

const claimBodySchema = z.object({
  lineId: z.string().uuid(),
  repayTxHash: hashSchema,
});

const defaultBodySchema = z.object({
  lineId: z.string().uuid(),
  defaultTxHash: hashSchema,
});

export const poFinancingRoutes = new Hono();

function minimumRepaymentWindowSeconds(deal: { deadlineUnix?: number }): number {
  const deliveryDelay = deal.deadlineUnix ? Math.max(0, deal.deadlineUnix - Math.floor(Date.now() / 1000)) : 0;
  return Math.max(7 * 86_400, deliveryDelay + 7 * 86_400);
}

const poRequestBodySchema = z.object({
  invoiceId: hashSchema,
  requestedAdvanceUsdc: usdcAmountSchema,
});

poFinancingRoutes.post('/request', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  let body: z.infer<typeof poRequestBodySchema>;
  try {
    body = poRequestBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown purchase order' }, 404);
  if (session.address.toLowerCase() !== deal.seller.toLowerCase()) return c.json({ error: 'only the seller can request fulfilment capital' }, 403);
  if (deal.tradeLane !== 'finance' || !deal.acceptedAt || deal.delivered || deal.settledAt || deal.cancelledAt || deal.disputed) return c.json({ error: 'deal not eligible for PO financing' }, 409);
  if (deal.factoringRequestedAt || deal.factoringOfferId || deal.poFinancingRequestedAt || deal.poFinancingId) return c.json({ error: 'deal already selected a financing rail' }, 409);
  if (Number(body.requestedAdvanceUsdc) > Number(deal.dealAmountUsdc)) return c.json({ error: 'requested advance cannot exceed the purchase-order value' }, 400);
  const updated = await patchDeal(deal.jobId, { poFinancingRequestedAt: Date.now(), poFinancingRequestedAdvanceUsdc: body.requestedAdvanceUsdc });
  return c.json({ deal: updated ? financierSafeDeal(updated) : null });
});

async function readPoChainLine(invoiceId: string): Promise<PoChainLine> {
  const raw = (await publicClient.readContract({
    address: config.KARWAN_PO_FINANCING_ADDR as Address,
    abi: poFinancingV2Abi,
    functionName: 'lines',
    args: [invoiceId as Hex],
  })) as readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, number, bigint];
  return {
    financier: raw[0],
    seller: raw[1],
    principalUsdc: raw[2],
    repayUsdc: raw[3],
    requiredStakeUsdc: raw[8],
    state: raw[7],
  };
}

async function verifyPoFund(
  txHash: string,
  financier: string,
  seller: string,
  invoiceId: string,
  principalUsdc: bigint,
  repayUsdc: bigint,
  requiredStakeUsdc: bigint,
): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
  const line = await readPoChainLine(invoiceId);
  assertPoFunded(receipt.status, receipt.from, line, {
    financier,
    seller,
    principalUsdc,
    repayUsdc,
    requiredStakeUsdc,
  });
}

async function verifyPoTerminal(
  txHash: string,
  invoiceId: string,
  expectedState: 2 | 3,
): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
  const line = await readPoChainLine(invoiceId);
  assertPoTerminal(receipt.status, line.state, expectedState);
}

/// GET /api/po-financing/available: deals open to PO financing.
/// Accepted invoices without an existing PO line and not yet delivered.
poFinancingRoutes.get('/available', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }
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
      !d.factoringRequestedAt &&
      !d.factoringOfferId &&
      d.poFinancingRequestedAt &&
      d.poFinancingRequestedAdvanceUsdc &&
      !d.poFinancingId,
  );
  const filtered = available.filter((d) => {
    if (sector && d.counterpartyCompany?.sector !== sector) return false;
    if (region && d.counterpartyCompany?.region !== region) return false;
    return true;
  });
  return c.json({ deals: filtered.map(financierSafeDeal) });
});

/// GET /api/po-financing/stake-policy: the collateral this desk suggests for one
/// advance, so the fund modal can prefill it instead of making the financier
/// guess. Returns the seller's tier, the suggested bps and USDC figure, and
/// their free stake so the caller can cap the suggestion at what actually
/// exists. Financier-only, matching every other read on this desk.
///
/// A suggestion, not a gate. The financier may raise it, and the only hard floor
/// is minStakeBps on the contract. freeStakeUsdc is null when the chain read
/// failed, which the caller should treat as "unknown", not as zero.
poFinancingRoutes.get('/stake-policy', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }

  const invoiceId = c.req.query('invoiceId');
  const principalRaw = c.req.query('principalUsdc');
  if (!invoiceId || !/^0x[a-fA-F0-9]{64}$/.test(invoiceId)) {
    return c.json({ error: 'invoiceId required' }, 400);
  }
  const principalUsdc = Number(principalRaw);
  if (!Number.isFinite(principalUsdc) || principalUsdc <= 0) {
    return c.json({ error: 'principalUsdc must be a positive number' }, 400);
  }

  const deal = await getDeal(invoiceId);
  if (!deal) return c.json({ error: 'unknown deal' }, 404);

  // An unreadable tier must not quietly suggest zero collateral, so it falls
  // back to 'new', the most conservative rung.
  let tier: RepTier = 'new';
  try {
    tier = (await actorSignalsFor(deal.seller)).repTier;
  } catch {
    tier = 'new';
  }

  let freeStakeUsdc: string | null = null;
  try {
    const freeWei = (await vault.read.freeStakeOf([deal.seller as `0x${string}`])) as bigint;
    freeStakeUsdc = formatUnits(freeWei, USDC_DECIMALS);
  } catch {
    freeStakeUsdc = null;
  }

  const suggestion = suggestPOStake(tier, principalUsdc);

  // The contract enforces its own minStakeBps floor and reverts StakeBelowFloor
  // under it. Suggesting a number below that floor would hand the financier a
  // prefilled value that burns gas on the approve and then reverts at fund.
  //
  // The two are set independently, by an operator on chain and by env off it,
  // so they WILL drift. When they do, the on-chain floor wins here and the
  // response says so, rather than the desk quietly proposing a losing tx.
  let onChainFloorUsdc: string | null = null;
  try {
    const floorWei = (await publicClient.readContract({
      address: config.KARWAN_PO_FINANCING_ADDR as `0x${string}`,
      abi: poFinancingV2Abi,
      functionName: 'stakeFloorFor',
      args: [parseUnits(principalUsdc.toFixed(6), USDC_DECIMALS)],
    })) as bigint;
    onChainFloorUsdc = formatUnits(floorWei, USDC_DECIMALS);
  } catch (err) {
    logger.warn(
      { invoiceId, err: (err as Error).message },
      'po stake policy: on-chain floor read failed; suggesting the tier figure alone',
    );
  }

  const raisedByContractFloor =
    onChainFloorUsdc !== null && Number(onChainFloorUsdc) > Number(suggestion.suggestedStakeUsdc);
  const suggestedStakeUsdc = raisedByContractFloor
    ? Number(onChainFloorUsdc).toFixed(2)
    : suggestion.suggestedStakeUsdc;

  return c.json({
    ...suggestion,
    suggestedStakeUsdc,
    onChainFloorUsdc,
    raisedByContractFloor,
    freeStakeUsdc,
  });
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
  if (!deal.acceptedAt || deal.delivered || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for PO financing' }, 409);
  }
  if (deal.factoringRequestedAt || deal.factoringOfferId) {
    return c.json({ error: 'deal is already open on the invoice-factoring rail' }, 409);
  }
  if (!deal.poFinancingRequestedAt || !deal.poFinancingRequestedAdvanceUsdc) return c.json({ error: 'seller has not requested PO financing' }, 409);
  if (Number(body.principalUsdc) > Number(deal.poFinancingRequestedAdvanceUsdc)) return c.json({ error: 'principal exceeds the seller requested amount' }, 400);
  if (body.repaymentWindowSeconds < minimumRepaymentWindowSeconds(deal)) return c.json({ error: 'repayment window must extend beyond delivery and the buyer release buffer' }, 400);

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
  try {
    await verifyPoFund(
      body.fundTxHash,
      financier,
      deal.seller,
      body.invoiceId,
      parseUnits(body.principalUsdc, USDC_DECIMALS),
      parseUnits(body.repayUsdc, USDC_DECIMALS),
      parseUnits(body.requiredStakeUsdc, USDC_DECIMALS),
    );
  } catch (err) {
    logger.warn(
      { invoiceId: body.invoiceId, fundTxHash: body.fundTxHash, err: (err as Error).message },
      'po-financing: submitted fund transaction failed verification',
    );
    return c.json(
      { error: 'po funding was not confirmed on chain', detail: (err as Error).message },
      502,
    );
  }
  const line = await createPOLine({
    id: randomUUID(),
    invoiceId: body.invoiceId,
    financier,
    seller: deal.seller,
    buyer: deal.buyer,
    principalUsdc: body.principalUsdc,
    repayUsdc: body.repayUsdc,
    state: 'outstanding',
    fundedAt: now,
    repaymentTimeoutAt: now + body.repaymentWindowSeconds * 1000,
    requiredStakeUsdc: body.requiredStakeUsdc,
    txHashes: { fund: body.fundTxHash },
  });
  await patchDeal(body.invoiceId, { poFinancingId: line.id });
  await addSystemMessage({ jobId: body.invoiceId, channel: 'financing', channelKey: line.id, financingKind: 'po', financingId: line.id, eventType: 'po.funded', occurrenceKey: body.fundTxHash, body: 'The purchase-order financing line was funded and is now active.', ts: now });

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
  // The advance leaving the financier and landing with the seller. One row per
  // party: PO financing wrote nothing to either ledger before this.
  void appendActivity({
    address: financier,
    kind: 'financing_funded',
    summary: `Funded a ${body.principalUsdc} USDC purchase-order advance on ${body.invoiceId}`,
    params: { t: 'advanceFunded', amount: String(body.principalUsdc), job: String(body.invoiceId) },
    amountUsdc: body.principalUsdc,
    txHash: body.fundTxHash,
    jobId: body.invoiceId,
    counterparty: deal.seller?.toLowerCase(),
  });
  if (deal.seller) {
    void appendActivity({
      address: deal.seller,
      kind: 'financing_received',
      summary: `Received a ${body.principalUsdc} USDC purchase-order advance on ${body.invoiceId}`,
      params: { t: 'advanceReceived', amount: String(body.principalUsdc), job: String(body.invoiceId) },
      amountUsdc: body.principalUsdc,
      txHash: body.fundTxHash,
      jobId: body.invoiceId,
      counterparty: financier?.toLowerCase(),
    });
  }

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
  repaymentWindowSeconds: repaymentWindowSchema,
  /// Seller stake to reserve against this line, slashed to the financier up to
  /// the shortfall if the settlement does not cover the repay amount. Omitted
  /// means an unsecured line, which keeps older clients working. The contract
  /// enforces its own minStakeBps floor and the vault reverts if the seller's
  /// free stake is below this, so the caller is expected to have checked
  /// freeStakeOf first.
  requiredStakeUsdc: usdcAmountSchema,
});

/// POST /api/po-financing/fund-circle: Circle DCW-only sister route.
/// Backend signs USDC.approve(financing, principal) then
/// KarwanPOFinancing.fund(invoiceId, principal, repay, repaymentWindowSeconds,
/// requiredStake) via the caller's identity wallet, mirrors the line + emits
/// po.funded with the real chain hash. Web3 callers stay on POST /fund.
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
  if (!deal.acceptedAt || deal.delivered || deal.settledAt || deal.cancelledAt || deal.disputed) {
    return c.json({ error: 'deal not eligible for PO financing' }, 409);
  }
  if (deal.factoringRequestedAt || deal.factoringOfferId) {
    return c.json({ error: 'deal is already open on the invoice-factoring rail' }, 409);
  }
  if (!deal.poFinancingRequestedAt || !deal.poFinancingRequestedAdvanceUsdc) return c.json({ error: 'seller has not requested PO financing' }, 409);
  if (Number(body.principalUsdc) > Number(deal.poFinancingRequestedAdvanceUsdc)) return c.json({ error: 'principal exceeds the seller requested amount' }, 400);
  if (body.repaymentWindowSeconds < minimumRepaymentWindowSeconds(deal)) return c.json({ error: 'repayment window must extend beyond delivery and the buyer release buffer' }, 400);
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
  const stakeWei = parseUnits(body.requiredStakeUsdc, USDC_DECIMALS);

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
        // The v2 contract takes a fifth argument, requiredStakeUsdc. Sending
        // the four-arg form is a DIFFERENT SELECTOR: on a Circle SCA the call
        // fails as an inner revert inside a successful handleOps, so the tx
        // hash looks fine and the line is never funded.
        //
        abiFunctionSignature: 'fund(bytes32,uint128,uint128,uint64,uint128)',
        abiParameters: [
          body.invoiceId,
          principalWei.toString(),
          repayWei.toString(),
          body.repaymentWindowSeconds.toString(),
          stakeWei.toString(),
        ],
      },
      `poFinancing.fund(${body.invoiceId})`,
    );

    await verifyPoFund(
      fundResult.txHash,
      caller,
      deal.seller,
      body.invoiceId,
      principalWei,
      repayWei,
      stakeWei,
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
      state: 'outstanding',
      fundedAt: now,
      repaymentTimeoutAt: now + body.repaymentWindowSeconds * 1000,
      requiredStakeUsdc: body.requiredStakeUsdc,
      txHashes: { fund: fundResult.txHash },
    });
    await patchDeal(body.invoiceId, { poFinancingId: line.id });

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
    // The advance leaving the financier and landing with the seller. One row per
    // party: PO financing wrote nothing to either ledger before this.
    void appendActivity({
      address: caller,
      kind: 'financing_funded',
      summary: `Funded a ${body.principalUsdc} USDC purchase-order advance on ${body.invoiceId}`,
      params: { t: 'advanceFunded', amount: String(body.principalUsdc), job: String(body.invoiceId) },
      amountUsdc: body.principalUsdc,
      txHash: fundResult.txHash,
      jobId: body.invoiceId,
      counterparty: deal.seller?.toLowerCase(),
    });
    if (deal.seller) {
      void appendActivity({
        address: deal.seller,
        kind: 'financing_received',
        summary: `Received a ${body.principalUsdc} USDC purchase-order advance on ${body.invoiceId}`,
        params: { t: 'advanceReceived', amount: String(body.principalUsdc), job: String(body.invoiceId) },
        amountUsdc: body.principalUsdc,
        txHash: fundResult.txHash,
        jobId: body.invoiceId,
        counterparty: caller?.toLowerCase(),
      });
    }

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

/// POST /api/po-financing/archive: a party dismisses a dead legacy line.
///
/// Strictly limited to lines in a custody-rail state. Those sit on the retired
/// contract, which holds no USDC and has had its escrow assigner revoked, so
/// they cannot move and nothing will drive them. Without this they read as
/// "funded, awaiting delivery" forever.
///
/// A line on the CURRENT rail can never be archived. Hiding a live line would
/// hide real exposure, which is the opposite of the point, so the state check
/// here is the whole safety of this route.
const archiveBodySchema = z.object({ lineId: z.string().uuid() });

poFinancingRoutes.post('/archive', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = archiveBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const line = await getPOLine(body.lineId);
  if (!line) return c.json({ error: 'unknown line' }, 404);

  const LEGACY_STATES = ['funded', 'released', 'reclaimed'];
  if (!LEGACY_STATES.includes(line.state)) {
    return c.json(
      {
        error:
          'only lines from the retired custody rail can be dismissed. A live line stays on the desk until it settles.',
        code: 'not-legacy',
      },
      409,
    );
  }

  const caller = session.address.toLowerCase();
  if (caller !== line.financier && caller !== line.seller) {
    return c.json({ error: 'caller is not a party to this line' }, 403);
  }
  if (line.archivedAt) return c.json({ line });

  const updated = await patchPOLine(line.id, { archivedAt: Date.now(), archivedBy: caller });
  logger.info({ lineId: line.id, by: caller, state: line.state }, 'po: legacy line dismissed');
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
  if (line.state !== 'outstanding') {
    return c.json({ error: `cannot claim line in state ${line.state}` }, 409);
  }

  const caller = session.address.toLowerCase();
  if (caller !== line.financier && caller !== line.seller) {
    return c.json({ error: 'caller is not a party to this line' }, 403);
  }

  try {
    await verifyPoTerminal(body.repayTxHash, line.invoiceId, 2);
  } catch (err) {
    return c.json(
      { error: 'repayment was not confirmed on chain', detail: (err as Error).message },
      502,
    );
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
    payload: {
      lineId: line.id,
      financier: line.financier,
      seller: line.seller,
      repayUsdc: line.repayUsdc,
    },
  });
  // The financier's principal plus spread coming back.
  void appendActivity({
    address: line.financier,
    kind: 'financing_repaid',
    summary: `Repaid ${line.repayUsdc} USDC on purchase-order financing ${line.invoiceId}`,
    params: { t: 'financingRepaid', amount: String(line.repayUsdc), job: String(line.invoiceId) },
    amountUsdc: line.repayUsdc,
    txHash: body.repayTxHash,
    jobId: line.invoiceId,
    counterparty: line.seller?.toLowerCase(),
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
  if (line.state !== 'outstanding') {
    return c.json({ error: `cannot default line in state ${line.state}` }, 409);
  }
  if (session.address.toLowerCase() !== line.financier) {
    return c.json({ error: 'only financier can mark default' }, 403);
  }

  try {
    await verifyPoTerminal(body.defaultTxHash, line.invoiceId, 3);
  } catch (err) {
    return c.json(
      { error: 'default was not confirmed on chain', detail: (err as Error).message },
      502,
    );
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
  const [allFinancier, allSeller] = await Promise.all([
    listLinesByFinancier(address),
    listLinesBySeller(address),
  ]);
  // A dismissed line is gone from the desk but not from the record. Anyone
  // needing the history reads the store or the chain.
  const live = (l: { archivedAt?: number }) => !l.archivedAt;
  return c.json({ asFinancier: allFinancier.filter(live), asSeller: allSeller.filter(live) });
});

poFinancingRoutes.get('/line/:lineId', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const line = await getPOLine(c.req.param('lineId'));
  if (!line) return c.json({ error: 'unknown po financing line' }, 404);
  const caller = session.address.toLowerCase();
  if (caller !== line.financier && caller !== line.seller) {
    return c.json({ error: 'caller is not a party to this line' }, 403);
  }
  const deal = await getDeal(line.invoiceId);
  let chainLine: PoChainLine | null = null;
  try {
    chainLine = await readPoChainLine(line.invoiceId);
  } catch {
    chainLine = null;
  }
  return c.json({
    line,
    deal,
    chainLine: chainLine
      ? {
          ...chainLine,
          principalUsdc: chainLine.principalUsdc.toString(),
          repayUsdc: chainLine.repayUsdc.toString(),
        }
      : null,
  });
});

/// GET /api/po-financing/open: lines in non-terminal state. The timeout watcher
/// reads listOpenLines() in-process, so this HTTP surface is only the financier
/// desk's view of the live book and is gated as such.
poFinancingRoutes.get('/open', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if (!isApprovedFinancier(await getProfile(session.address))) {
    return c.json({ error: 'Apply to become a financier first.', code: 'financier_required' }, 403);
  }
  const lines = await listOpenLines();
  return c.json({ lines });
});

/// GET /api/po-financing/line/:id: fetch a single line. Party-scoped: a line
/// carries both wallets and the private financing terms, so only its financier
/// or seller may read it.
poFinancingRoutes.get('/line/:id', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const line = await getPOLine(c.req.param('id'));
  if (!line) return c.json({ error: 'unknown line' }, 404);
  const caller = session.address.toLowerCase();
  if (caller !== line.financier && caller !== line.seller) {
    return c.json({ error: 'caller is not a party to this line' }, 403);
  }
  return c.json({ line });
});
