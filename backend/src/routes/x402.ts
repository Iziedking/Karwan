import { Hono } from 'hono';
import { z } from 'zod';
import { requirePayment } from '../x402/sellerFacilitator.js';
import { loadInputs } from '../reputation/signals.js';
import { compute } from '../reputation/engine.js';
import { getProfile } from '../db/profiles.js';
import { listDealsForAddress } from '../db/deals.js';
import { listAnchorsForInvoice } from '../db/documentAnchors.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { computeRepaymentBehavior } from './sme.js';
import { logger } from '../logger.js';

/// Karwan's paid data endpoints. Financiers and external agents pay
/// per-call in USDC over x402 (Circle Gateway batched settlement on Arc
/// Testnet) for the same underwriting signals the platform computes for
/// itself: credit passport, repayment behaviour, counterparty
/// concentration, document anchors. GET /api/x402 is the free directory.
///
/// Privacy and existence checks run BEFORE the payment gate so a caller
/// is never charged for a 404.

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const invoiceIdSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'expected 0x-prefixed 32-byte hex id');

const PRICES = {
  creditPassport: 0.01,
  repaymentBehavior: 0.005,
  concentration: 0.005,
  documentAnchors: 0.005,
} as const;

/// Resolve an agent DCW to its owner so paid queries against either
/// address read the same passport, mirroring the free reputation route.
async function resolveSubject(address: string): Promise<string> {
  try {
    const owner = await findAgentWalletByAgentAddress(address);
    return owner?.userAddress ?? address;
  } catch {
    return address;
  }
}

/// Paid passport queries honor the same publicPassport setting as the
/// free /credit-passport page. Only an explicit opt-out hides the data.
async function passportHidden(address: string): Promise<boolean> {
  const profile = await getProfile(address).catch(() => null);
  return profile?.settings?.publicPassport === false;
}

export const x402Routes = new Hono();

/// GET /api/x402: free directory of the paid endpoints.
x402Routes.get('/', (c) => {
  return c.json({
    name: 'Karwan paid data endpoints',
    protocol: 'x402 (Circle Gateway batched settlement)',
    network: 'eip155:5042002 (Arc Testnet)',
    currency: 'USDC',
    howToPay:
      'Call any paid endpoint without a Payment-Signature header to receive a 402 with a PAYMENT-REQUIRED offer header. Sign the EIP-3009 authorization against your Arc Gateway deposit and retry with the Payment-Signature header. The @circle-fin/x402-batching GatewayClient handles the full round-trip.',
    endpoints: [
      {
        path: '/api/x402/credit-passport/:address',
        priceUsd: PRICES.creditPassport,
        returns:
          'Composite reputation snapshot: score (0-1000), tier, term breakdown, settled-deal counts, concentration flags.',
      },
      {
        path: '/api/x402/repayment-behavior/:address',
        priceUsd: PRICES.repaymentBehavior,
        returns:
          'Rolling 10-deal window: on-time rate, average days to settle, default count, last settlement.',
      },
      {
        path: '/api/x402/concentration/:address',
        priceUsd: PRICES.concentration,
        returns:
          'Counterparty concentration over the last 20 settled deals: ratio, soft/hard flags, per-counterparty histogram.',
      },
      {
        path: '/api/x402/document-anchors/:invoiceId',
        priceUsd: PRICES.documentAnchors,
        returns:
          'On-chain anchored document hashes for an invoice: kind, label, anchorer, tx hash.',
      },
    ],
  });
});

/// GET /api/x402/credit-passport/:address: $0.01.
x402Routes.get('/credit-passport/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const subject = await resolveSubject(parsed.data);
  if (await passportHidden(subject)) return c.json({ error: 'passport not public' }, 404);

  const payment = await requirePayment(
    c,
    PRICES.creditPassport,
    'Karwan credit passport: composite reputation snapshot',
  );
  if (payment instanceof Response) return payment;

  try {
    const inputs = await loadInputs(subject);
    const result = compute(inputs);
    logger.info(
      { subject: result.address, payer: payment.payer },
      'x402: credit passport served',
    );
    return c.json({
      address: result.address,
      score: result.score,
      tier: result.tier,
      terms: result.terms,
      modelVersion: result.modelVersion,
      successCount: result.inputs.successCount,
      disputedCount: result.inputs.disputedCount,
      failedCount: result.inputs.failedCount,
      lifetimeVolumeUsdc: result.inputs.lifetimeVolumeUsdc,
      concentrationRatio: result.inputs.concentrationRatio,
      concentrationSoft: result.inputs.concentrationSoft,
      concentrationHard: result.inputs.concentrationHard,
      registeredAt: result.inputs.registeredAt,
    });
  } catch (err) {
    return c.json(
      { error: 'passport read failed', detail: (err as Error).message },
      502,
    );
  }
});

/// GET /api/x402/repayment-behavior/:address: $0.005.
x402Routes.get('/repayment-behavior/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const subject = await resolveSubject(parsed.data);
  if (await passportHidden(subject)) return c.json({ error: 'passport not public' }, 404);

  const payment = await requirePayment(
    c,
    PRICES.repaymentBehavior,
    'Karwan repayment behaviour: rolling settlement window',
  );
  if (payment instanceof Response) return payment;

  const repaymentBehavior = await computeRepaymentBehavior(subject);
  return c.json({ address: subject, repaymentBehavior });
});

/// GET /api/x402/concentration/:address: $0.005. Same windowing as the
/// reputation engine's concentration signal (last 20 settled deals, flags
/// at 60% / 80%), plus the per-counterparty histogram the engine keeps
/// internal.
x402Routes.get('/concentration/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const subject = await resolveSubject(parsed.data);
  if (await passportHidden(subject)) return c.json({ error: 'passport not public' }, 404);

  const payment = await requirePayment(
    c,
    PRICES.concentration,
    'Karwan counterparty concentration: ratio, flags, histogram',
  );
  if (payment instanceof Response) return payment;

  const address = subject.toLowerCase();
  const deals = await listDealsForAddress(address).catch(() => []);
  const settled = deals
    .filter((d) => !!d.settledAt)
    .sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0))
    .slice(-20);

  if (settled.length < 3) {
    return c.json({
      address,
      windowDealCount: settled.length,
      concentrationRatio: 0,
      concentrationSoft: false,
      concentrationHard: false,
      histogram: [],
    });
  }

  const counts = new Map<string, number>();
  for (const d of settled) {
    const cp =
      d.buyer.toLowerCase() === address ? d.seller.toLowerCase() : d.buyer.toLowerCase();
    counts.set(cp, (counts.get(cp) ?? 0) + 1);
  }
  const histogram = [...counts.entries()]
    .map(([counterparty, dealCount]) => ({ counterparty, dealCount }))
    .sort((a, b) => b.dealCount - a.dealCount);
  const ratio = (histogram[0]?.dealCount ?? 0) / settled.length;

  return c.json({
    address,
    windowDealCount: settled.length,
    concentrationRatio: ratio,
    concentrationSoft: ratio >= 0.6,
    concentrationHard: ratio >= 0.8,
    histogram,
  });
});

/// GET /api/x402/document-anchors/:invoiceId: $0.005.
x402Routes.get('/document-anchors/:invoiceId', async (c) => {
  const parsed = invoiceIdSchema.safeParse(c.req.param('invoiceId'));
  if (!parsed.success) return c.json({ error: 'invalid invoiceId' }, 400);

  const anchors = await listAnchorsForInvoice(parsed.data);
  if (anchors.length === 0) return c.json({ error: 'no anchors for this invoice' }, 404);

  const payment = await requirePayment(
    c,
    PRICES.documentAnchors,
    'Karwan document anchors: on-chain anchored hashes for an invoice',
  );
  if (payment instanceof Response) return payment;

  return c.json({ invoiceId: parsed.data, anchors });
});
