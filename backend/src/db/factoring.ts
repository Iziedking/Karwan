import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, and, desc } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { factoringOffers } from './schema.js';
import type { UsdcTransferAuthorization } from '../chain/usdc3009.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'factoring-offers.json');

export type FactoringOfferStatus =
  | 'offered'      // financier proposed terms; seller hasn't acted
  | 'accepted'     // seller accepted; payee redirect lands on chain
  | 'rejected'     // seller declined
  | 'expired'      // 24h window passed with no decision
  | 'superseded'   // the same financier re-priced; this offer was replaced
  | 'settled'      // buyer's settlement landed, financier repaid
  | 'defaulted';   // settlement happened but financier never received repay

export interface FactoringOffer {
  id: string;
  /// The deal's jobId in the escrow; matches DirectDeal.jobId.
  invoiceId: string;
  financier: string;
  seller: string;
  faceValueUsdc: string;
  offeredAdvanceUsdc: string;
  expectedReturnUsdc: string;
  /// Computed at offer time: (faceValue - advance) / faceValue * 10000.
  discountBps: number;
  status: FactoringOfferStatus;
  offeredAt: number;
  /// Default 24h after offeredAt; configurable per offer.
  expiresAt: number;
  acceptedAt?: number;
  rejectedAt?: number;
  settledAt?: number;
  /// On accept, the on-chain registry.setPayee tx that swapped the payee
  /// from seller to financier. Empty until the tx confirms.
  setPayeeTxHash?: string;
  /// On accept, the on-chain transfer that paid the advance from financier
  /// to seller. Empty until the tx confirms.
  advanceTxHash?: string;
  /// USDC EIP-3009 signed by a WEB3 financier at offer time, authorizing
  /// the advance (financier -> seller). Submitted by the platform relay
  /// the moment the seller accepts. Absent for Circle-auth financiers:
  /// the backend transfers from their identity wallet directly.
  advanceAuthorization?: UsdcTransferAuthorization;
  /// USDC EIP-3009 signed by a WEB3 seller at accept time, authorizing
  /// the repayment (seller -> financier) once the escrow settles. The
  /// settlement watcher submits it via the relay. Absent for Circle-auth
  /// sellers: the backend transfers from their identity wallet at settle
  /// time, no pre-authorization needed.
  repayAuthorization?: UsdcTransferAuthorization;
  /// On-chain tx of the repayment leg, written by the settlement watcher
  /// when the transfer confirms. The offer flips to 'settled' only after
  /// this exists.
  settleTxHash?: string;
  /// Settlement retry bookkeeping. The watcher keeps the offer in
  /// 'accepted' and retries on each tick; after MAX attempts it flips to
  /// 'defaulted' and alerts the operator.
  settleAttempts?: number;
  lastSettleError?: string;
  createdAt: number;
  updatedAt: number;
}

// Repository API

export async function getFactoringOffer(id: string): Promise<FactoringOffer | null> {
  if (pgEnabled) {
    const rows = await db().select().from(factoringOffers).where(eq(factoringOffers.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

export async function createFactoringOffer(
  input: Omit<FactoringOffer, 'createdAt' | 'updatedAt'>,
): Promise<FactoringOffer> {
  const now = Date.now();
  const offer: FactoringOffer = {
    ...input,
    financier: input.financier.toLowerCase(),
    seller: input.seller.toLowerCase(),
    invoiceId: input.invoiceId.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  };
  if (pgEnabled) {
    await db().insert(factoringOffers).values({
      id: offer.id,
      invoiceId: offer.invoiceId,
      financier: offer.financier,
      seller: offer.seller,
      status: offer.status,
      offeredAt: offer.offeredAt,
      data: offer,
    });
    return offer;
  }
  const store = loadFile();
  store[offer.id] = offer;
  saveFile(store);
  return offer;
}

export async function patchFactoringOffer(
  id: string,
  patch: Partial<FactoringOffer>,
): Promise<FactoringOffer | null> {
  const existing = await getFactoringOffer(id);
  if (!existing) return null;
  const next: FactoringOffer = { ...existing, ...patch, updatedAt: Date.now() };
  if (pgEnabled) {
    await db()
      .update(factoringOffers)
      .set({ status: next.status, data: next })
      .where(eq(factoringOffers.id, id));
    return next;
  }
  const store = loadFile();
  store[id] = next;
  saveFile(store);
  return next;
}

/// Compare-and-set patch: applies only while the offer is still in
/// `expectedStatus`, enforced in the UPDATE's WHERE clause so two racing
/// accepts (or an accept racing the expiry watcher) can never both win.
/// Returns null when the guard lost, the caller treats that as a conflict.
export async function patchFactoringOfferIfStatus(
  id: string,
  expectedStatus: FactoringOfferStatus,
  patch: Partial<FactoringOffer>,
): Promise<FactoringOffer | null> {
  const existing = await getFactoringOffer(id);
  if (!existing || existing.status !== expectedStatus) return null;
  const next: FactoringOffer = { ...existing, ...patch, updatedAt: Date.now() };
  if (pgEnabled) {
    const rows = await db()
      .update(factoringOffers)
      .set({ status: next.status, data: next })
      .where(and(eq(factoringOffers.id, id), eq(factoringOffers.status, expectedStatus)))
      .returning({ id: factoringOffers.id });
    return rows.length > 0 ? next : null;
  }
  // Flat-file fallback runs single-process, so the read-check above is the
  // whole race window.
  const store = loadFile();
  store[id] = next;
  saveFile(store);
  return next;
}

/// All offers on a single invoice, newest first. Used by the seller to
/// compare offers from competing financiers.
export async function listOffersForInvoice(invoiceId: string): Promise<FactoringOffer[]> {
  const key = invoiceId.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(factoringOffers)
      .where(eq(factoringOffers.invoiceId, key))
      .orderBy(desc(factoringOffers.offeredAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((o) => o.invoiceId === key)
    .sort((x, y) => y.offeredAt - x.offeredAt);
}

/// All open offers ('offered' status) on the platform. Used by the
/// expiry watcher to find offers past their expiresAt cutoff.
export async function listOpenOffers(): Promise<FactoringOffer[]> {
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(factoringOffers)
      .where(eq(factoringOffers.status, 'offered'))
      .orderBy(desc(factoringOffers.offeredAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((o) => o.status === 'offered')
    .sort((x, y) => y.offeredAt - x.offeredAt);
}

/// All accepted offers awaiting settlement. The settlement watcher walks
/// these each tick. (The old watcher iterated listOpenOffers, which only
/// returns 'offered' rows, then skipped everything not 'accepted'. This was a
/// dead loop that never settled anything.)
export async function listAcceptedOffers(): Promise<FactoringOffer[]> {
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(factoringOffers)
      .where(eq(factoringOffers.status, 'accepted'))
      .orderBy(desc(factoringOffers.offeredAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((o) => o.status === 'accepted')
    .sort((x, y) => y.offeredAt - x.offeredAt);
}

/// Offers visible to a financier on their dashboard: everything they
/// proposed, in any status, newest first.
export async function listOffersByFinancier(financier: string): Promise<FactoringOffer[]> {
  const key = financier.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(factoringOffers)
      .where(eq(factoringOffers.financier, key))
      .orderBy(desc(factoringOffers.offeredAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((o) => o.financier === key)
    .sort((x, y) => y.offeredAt - x.offeredAt);
}

/// Offers visible to a seller on their deal page: everything against
/// invoices they raised, in any status, newest first.
export async function listOffersBySeller(seller: string): Promise<FactoringOffer[]> {
  const key = seller.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(factoringOffers)
      .where(eq(factoringOffers.seller, key))
      .orderBy(desc(factoringOffers.offeredAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((o) => o.seller === key)
    .sort((x, y) => y.offeredAt - x.offeredAt);
}

/// The financier's accepted offer on a specific invoice, if any. Used by
/// the settlement watcher to compute repayment routing on a factored
/// deal.
export async function getAcceptedOfferForInvoice(invoiceId: string): Promise<FactoringOffer | null> {
  const key = invoiceId.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(factoringOffers)
      .where(and(eq(factoringOffers.invoiceId, key), eq(factoringOffers.status, 'accepted')));
    return rows[0]?.data ?? null;
  }
  return Object.values(loadFile()).find(
    (o) => o.invoiceId === key && o.status === 'accepted',
  ) ?? null;
}

// Flat-file

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, FactoringOffer> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, FactoringOffer>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, FactoringOffer>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
