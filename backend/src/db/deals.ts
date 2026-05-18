import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, or, desc } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { directDeals } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'direct-deals.json');

export interface DirectDeal {
  jobId: string;
  // The user wallet that created the deal. The on-chain escrow buyer is the
  // buyer agent; this is who the deal belongs to for dashboards and auth checks.
  buyer: string;
  seller: string;
  // Per-user agent wallets bound to this deal at creation. The buyer agent funds
  // the escrow and signs releases; the seller agent is named as the on-chain
  // seller and receives payouts, and signs a seller appeal. Optional so deals
  // created before per-user wallets still load; routes guard on their presence.
  buyerAgentWalletId?: string;
  buyerAgentAddress?: string;
  sellerAgentWalletId?: string;
  sellerAgentAddress?: string;
  dealAmountUsdc: string;
  firstReleasePct: number;
  deadlineUnix: number;
  terms: string;
  // The seller has confirmed they agree to the deal terms. A deal cannot be
  // marked delivered until it is accepted.
  acceptedAt?: number;
  delivered: boolean;
  deliveredAt?: number;
  // Optional deliverable reference the seller submits on mark-delivered.
  deliveryProof?: string;
  // Set when the first milestone is released (by the buyer or by the auto
  // first-release). Starts the final-release window during which the buyer
  // must release the final milestone, else the agent auto-releases.
  reviewWindowStartedAt?: number;
  // Total time the buyer has added to the final-release window by tipping
  // "still reviewing", and how many times they have done so.
  reviewExtensionMs?: number;
  reviewExtensionCount?: number;
  // True once the first milestone was auto-released because the buyer stalled.
  firstAutoReleased?: boolean;
  // Seller filed an appeal; escrow is moved to Disputed on chain.
  disputed?: boolean;
  disputedAt?: number;
  // Buyer reclaimed funds because the seller never delivered by the deadline.
  // The escrow is moved Disputed then Refunded on chain.
  cancelledAt?: number;
  /// How the cancellation happened. Drives reputation:
  /// - 'mutual'             — counterparty agreed to a proposed cancel; rep-neutral.
  /// - 'platform-attributed'— agent misroute, both parties agreed; rep-neutral.
  /// - 'unilateral'         — buyer cancel after deadline passed without delivery;
  ///                          rep against the seller (the existing /cancel path).
  /// - 'pre-accept'         — buyer withdrew before the seller accepted; no escrow, no rep.
  cancelKind?: 'mutual' | 'platform-attributed' | 'unilateral' | 'pre-accept';
  /// Free-text reason captured at cancellation. Optional for unilateral and
  /// pre-accept (we synthesize a default); required for mutual / platform-attributed.
  cancelReason?: string;
  /// Pending mutual / platform-attributed cancellation proposal. Cleared on
  /// accept (deal becomes cancelled) or decline (deal continues). Only one
  /// proposal at a time; a second propose call overwrites the first if it's
  /// from the same party, otherwise rejects.
  cancellationProposal?: {
    proposedBy: 'buyer' | 'seller';
    kind: 'mutual' | 'platform-attributed';
    reason: string;
    proposedAt: number;
  };
  // Agent auto-released the final milestone after the window expired silently.
  autoReleasedAt?: number;
  settledAt?: number;
  fundTxHash?: string;
  createdAt: number;
  updatedAt: number;
}

// --- public API: same names as before, now async, Postgres-backed when
// DATABASE_URL is set and flat-file otherwise ---

export async function getDeal(jobId: string): Promise<DirectDeal | null> {
  const key = jobId.toLowerCase();
  if (pgEnabled) {
    const rows = await db().select().from(directDeals).where(eq(directDeals.jobId, key));
    return rows[0]?.data ?? null;
  }
  return loadFile()[key] ?? null;
}

export async function createDeal(
  input: Omit<DirectDeal, 'delivered' | 'createdAt' | 'updatedAt'>,
): Promise<DirectDeal> {
  const now = Date.now();
  const deal: DirectDeal = {
    ...input,
    buyer: input.buyer.toLowerCase(),
    seller: input.seller.toLowerCase(),
    delivered: false,
    createdAt: now,
    updatedAt: now,
  };
  const key = input.jobId.toLowerCase();
  if (pgEnabled) {
    await db().insert(directDeals).values({
      jobId: key,
      buyer: deal.buyer,
      seller: deal.seller,
      createdAt: deal.createdAt,
      data: deal,
    });
    return deal;
  }
  const store = loadFile();
  store[key] = deal;
  saveFile(store);
  return deal;
}

export async function patchDeal(
  jobId: string,
  patch: Partial<DirectDeal>,
): Promise<DirectDeal | null> {
  const key = jobId.toLowerCase();
  const existing = await getDeal(key);
  if (!existing) return null;
  const next: DirectDeal = { ...existing, ...patch, updatedAt: Date.now() };
  if (pgEnabled) {
    await db()
      .update(directDeals)
      .set({ buyer: next.buyer, seller: next.seller, data: next })
      .where(eq(directDeals.jobId, key));
    return next;
  }
  const store = loadFile();
  store[key] = next;
  saveFile(store);
  return next;
}

/// Deals where the address is either the buyer (creator) or the seller.
export async function listDealsForAddress(address: string): Promise<DirectDeal[]> {
  const a = address.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(directDeals)
      .where(or(eq(directDeals.buyer, a), eq(directDeals.seller, a)))
      .orderBy(desc(directDeals.createdAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((d) => d.buyer === a || d.seller === a)
    .sort((x, y) => y.createdAt - x.createdAt);
}

/// All deals, newest first. Used by the auto-release watcher.
export async function listAllDeals(): Promise<DirectDeal[]> {
  if (pgEnabled) {
    const rows = await db().select().from(directDeals).orderBy(desc(directDeals.createdAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile()).sort((x, y) => y.createdAt - x.createdAt);
}

/// Removes every deal where the address is on either side of the deal. Used
/// by the admin reset-history endpoint for test cleanup. Returns the number
/// of rows removed.
export async function deleteDealsInvolvingAddress(addressLower: string): Promise<number> {
  const target = addressLower.toLowerCase();
  if (pgEnabled) {
    const rows = await db().select().from(directDeals);
    let removed = 0;
    for (const r of rows) {
      const d = r.data;
      if (d.buyer.toLowerCase() === target || d.seller.toLowerCase() === target) {
        await db().delete(directDeals).where(eq(directDeals.jobId, d.jobId));
        removed += 1;
      }
    }
    return removed;
  }
  const store = loadFile();
  let removed = 0;
  for (const [k, v] of Object.entries(store)) {
    if (v.buyer.toLowerCase() === target || v.seller.toLowerCase() === target) {
      delete store[k];
      removed += 1;
    }
  }
  if (removed > 0) saveFile(store);
  return removed;
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, DirectDeal> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, DirectDeal>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, DirectDeal>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
