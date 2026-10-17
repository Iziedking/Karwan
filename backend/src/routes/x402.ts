import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { requirePayment, type X402Payment } from '../x402/sellerFacilitator.js';
import { countPaidRead, type PaidReadEndpoint } from '../db/paidReads.js';
import { loadInputs } from '../reputation/signals.js';
import { compute } from '../reputation/engine.js';
import { getProfile } from '../db/profiles.js';
import { mayReadOutside } from '../reputation/consent.js';
import { listDealsForAddress } from '../db/deals.js';
import { listAnchorsForInvoice } from '../db/documentAnchors.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { computeRepaymentBehavior } from './sme.js';
import { skillDemand } from '../agents/marketDemand.js';
import { logger } from '../logger.js';
import { ARC } from '../chain/client.js';
import { config } from '../config.js';
import { findProfileByHandle } from '../db/profiles.js';
import { getBrief } from '../db/briefs.js';
import { getListing } from '../db/listings.js';
import { saveRecordRead } from '../db/recordReads.js';
import { getBuyerJob } from '../agents/buyer.js';
import { issuerAddress } from '../attestation/issuer.js';
import { buildRecordRead } from '../reputation/recordRead.js';
import { signRecordRead } from '../verification/recordReadSignature.js';
import { levelOf } from '../verification/live.js';
import { inMarketReader, isPartyToRequest, paymentFromReader, recordReadGate, type RequestFacts } from '../x402/recordReadGate.js';

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
  skillDemand: 0.005,
  record: 0.01,
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

/// Charge for one read and, once the payment settled, count it. The count is
/// what /api/network/reads reports, so every paid endpoint goes through here.
async function chargeRead(
  c: Context,
  endpoint: PaidReadEndpoint,
  priceUsd: number,
  description: string,
): Promise<X402Payment | Response> {
  const payment = await requirePayment(c, priceUsd, description);
  if (payment instanceof Response) return payment;
  await countPaidRead(endpoint, Date.now()).catch((err: Error) =>
    logger.warn({ err: err.message, endpoint }, 'x402: paid read not counted'),
  );
  return payment;
}

export const x402Routes = new Hono();

/// GET /api/x402: free directory of the paid endpoints.
x402Routes.get('/', (c) => {
  return c.json({
    name: 'Karwan paid data endpoints',
    protocol: 'x402 (Circle Gateway batched settlement)',
    network: `${ARC.caip2} (${ARC.label})`,
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
      {
        path: '/api/x402/skill-demand/:keywords',
        priceUsd: PRICES.skillDemand,
        returns:
          'On-platform demand for a skill: count of recent open briefs requesting it (comma-separated keywords) and a 0-1 demand heat. Lets a seller agent price up when a skill is hot.',
      },
    ],
  });
});

/// GET /api/x402/skill-demand/:keywords: $0.005. Comma-separated keywords.
/// On-platform demand signal: how many recent open briefs want this skill, so
/// a seller agent can hold a higher price when demand is high.
x402Routes.get('/skill-demand/:keywords', async (c) => {
  const raw = c.req.param('keywords');
  const keywords = decodeURIComponent(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (keywords.length === 0) return c.json({ error: 'no keywords' }, 400);

  const payment = await chargeRead(
    c,
    'skill-demand',
    PRICES.skillDemand,
    'Karwan skill demand: open-brief demand for a skill',
  );
  if (payment instanceof Response) return payment;

  return c.json(skillDemand(keywords));
});

/// GET /api/x402/credit-passport/:address: $0.01.
x402Routes.get('/credit-passport/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const subject = await resolveSubject(parsed.data);
  if (await passportHidden(subject)) return c.json({ error: 'passport not public' }, 404);
  if (!(await passportReadAllowed(c, subject))) {
    return c.json({ error: 'This person has not allowed reads from outside Karwan.' }, 403);
  }

  const payment = await chargeRead(
    c,
    'credit-passport',
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

const purposeSchema = z.enum(['shortlist', 'bid', 'question']);

/// The facts isPartyToRequest decides on. `ref` is a request id for shortlist
/// and bid reads, and a listing id for a question.
/// Passport, repayment and concentration reads are not tied to a request by
/// default, so they count as outside reads and need the person's switch (O2).
/// A Karwan agent that names its own wallet and a request both people are on
/// reads in-market instead (O1), as the match-time checks do.
async function passportReadAllowed(c: Context, subject: string): Promise<boolean> {
  if (mayReadOutside(await getProfile(subject).catch(() => null))) return true;
  const ref = c.req.query('ref') ?? '';
  const payerAgent = (c.req.header('x-karwan-payer-agent') ?? '').toLowerCase();
  if (!ref || !payerAgent) return false;
  const record = await findAgentWalletByAgentAddress(payerAgent).catch(() => null);
  if (!record) return false;
  const signature = c.req.header('payment-signature');
  if (signature && !paymentFromReader(signature, record.x402Wallet?.address)) return false;
  return inMarketReader({ readerAccount: record.userAddress.toLowerCase(), payerIsReadersAgent: true, subject }, requestFacts(ref, subject));
}

function requestFacts(ref: string, subject: string): RequestFacts {
  const brief = getBrief(ref);
  const job = brief ? getBuyerJob(ref) : null;
  const listing = brief ? null : getListing(ref);
  return {
    briefPoster: brief?.postedBy ?? null,
    subjectBid: !!job?.bids.some((b) => (b.sellerUserAddress ?? '').toLowerCase() === subject.toLowerCase()),
    listingSeller: listing?.sellerUser ?? null,
    briefOpen: !!job && !job.expiredAt && !job.escrowFunded,
    listingLive: !!listing && listing.expiresAt > Date.now(),
  };
}

/// GET /api/x402/record/:subject: $0.01. A signed karwan-record-v1 read for an
/// agent acting for a named account on a named request, only with the
/// subject's consent. Every refusal happens before the payment gate.
x402Routes.get('/record/:subject', async (c) => {
  const pepper = config.RECORD_COUNTERPARTY_PEPPER;
  if (!config.RECORD_READS_ENABLED || !pepper) return c.json({ error: 'not available' }, 404);
  const raw = c.req.param('subject');
  const purpose = purposeSchema.safeParse(c.req.query('purpose'));
  const ref = c.req.query('ref') ?? '';
  const forAccount = (c.req.query('for') ?? '').toLowerCase();
  const payerAgent = (c.req.header('x-karwan-payer-agent') ?? '').toLowerCase();
  if (!purpose.success || !ref || !addrSchema.safeParse(forAccount).success) {
    return c.json({ error: 'purpose, ref and for are required' }, 400);
  }

  const subject = addrSchema.safeParse(raw).success
    ? await resolveSubject(raw)
    : ((await findProfileByHandle(raw.replace(/^@/, '').toLowerCase()))?.address?.toLowerCase() ?? null);
  const [subjectProfile, payerRecord] = await Promise.all([
    subject ? getProfile(subject).catch(() => null) : Promise.resolve(null),
    payerAgent ? findAgentWalletByAgentAddress(payerAgent).catch(() => null) : Promise.resolve(null),
  ]);
  const gate = recordReadGate({
    subjectExists: !!subject && !!subjectProfile,
    readerAccount: forAccount,
    payerIsReadersAgent: payerRecord?.userAddress.toLowerCase() === forAccount,
    readerIsPartyToRef: !!subject && isPartyToRequest({ purpose: purpose.data, reader: forAccount, subject }, requestFacts(ref, subject)),
  });
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);
  if (!paymentFromReader(c.req.header('payment-signature'), payerRecord?.x402Wallet?.address)) {
    return c.json({ error: "The payment must come from the named account's own agent." }, 403);
  }

  // Build and sign before charging, so a failure here never costs the reader.
  let signed: Awaited<ReturnType<typeof signRecordRead>>;
  let level: Awaited<ReturnType<typeof levelOf>>;
  const now = Date.now();
  try {
    const issuer = issuerAddress();
    if (!issuer) return c.json({ error: 'signing unavailable' }, 503);
    const [inputs, deals, lvl] = await Promise.all([loadInputs(subject!), listDealsForAddress(subject!), levelOf(subject!)]);
    level = lvl;
    const result = compute(inputs);
    signed = await signRecordRead(
      buildRecordRead({
        issuer,
        subject: subject!,
        tag: subjectProfile?.handle ?? null,
        level,
        engineScore: result.score,
        tier: result.tier,
        deals,
        pepper,
        now,
      }),
      ARC.chainId,
    );
  } catch (err) {
    return c.json({ error: 'record read failed', detail: (err as Error).message }, 502);
  }
  if (!signed) return c.json({ error: 'signing unavailable' }, 503);

  const payment = await chargeRead(c, 'record', PRICES.record, 'Karwan record read: signed work history for one request');
  if (payment instanceof Response) return payment;

  await saveRecordRead({
    id: `${payment.transaction || now}-${subject}`,
    reader: forAccount,
    subject: subject!,
    purpose: purpose.data,
    ref,
    priceUsdc: PRICES.record,
    paymentTx: payment.transaction || null,
    scoreAtRead: signed.score,
    levelAtRead: level,
    detail: signed,
    createdAt: now,
  }).catch((err: Error) => logger.warn({ err: err.message, subject }, 'x402: record read receipt not saved'));
  logger.info({ subject, reader: forAccount, purpose: purpose.data, payer: payment.payer }, 'x402: record read served');
  return c.json(signed);
});

/// GET /api/x402/repayment-behavior/:address: $0.005.
x402Routes.get('/repayment-behavior/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const subject = await resolveSubject(parsed.data);
  if (await passportHidden(subject)) return c.json({ error: 'passport not public' }, 404);
  if (!(await passportReadAllowed(c, subject))) {
    return c.json({ error: 'This person has not allowed reads from outside Karwan.' }, 403);
  }

  const payment = await chargeRead(
    c,
    'repayment-behavior',
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
  if (!(await passportReadAllowed(c, subject))) {
    return c.json({ error: 'This person has not allowed reads from outside Karwan.' }, 403);
  }

  const payment = await chargeRead(
    c,
    'concentration',
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

  const payment = await chargeRead(
    c,
    'document-anchors',
    PRICES.documentAnchors,
    'Karwan document anchors: on-chain anchored hashes for an invoice',
  );
  if (payment instanceof Response) return payment;

  return c.json({ invoiceId: parsed.data, anchors });
});
