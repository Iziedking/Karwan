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
  /// Delivery deadline (unix seconds). Optional on direct deals so the buyer
  /// can leave it open-ended ("deliver when you can"). When unset, the seller
  /// has no time pressure and the buyer can't unilateral-cancel for late
  /// delivery — only mutual cancel or appeal. When set, the existing
  /// post-deadline buyer cancel + reputation slash path stays.
  deadlineUnix?: number;
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
  /// - 'mutual'              — counterparty agreed to a proposed cancel pre-dispute; rep-neutral.
  /// - 'platform-attributed' — agent misroute, both parties agreed; rep-neutral.
  /// - 'refund-from-dispute' — counterparty accepted a refund proposal raised on a
  ///                           Disputed deal; seller's reputation takes the hit.
  ///                           Contract path is dispute()+refund(); when a
  ///                           reservation existed the chain auto-records Failed.
  /// - 'release-from-dispute'— counterparty accepted a release proposal raised on a
  ///                           Disputed deal; buyer's reputation takes the hit.
  ///                           Contract path is releaseFromDispute().
  /// - 'unilateral'          — buyer cancel after deadline passed without delivery;
  ///                           rep against the seller (the existing /cancel path).
  /// - 'pre-accept'          — buyer withdrew before the seller accepted; no escrow, no rep.
  cancelKind?:
    | 'mutual'
    | 'platform-attributed'
    | 'refund-from-dispute'
    | 'release-from-dispute'
    | 'unilateral'
    | 'pre-accept';
  /// Free-text reason captured at cancellation. Optional for unilateral and
  /// pre-accept (we synthesize a default); required for mutual / platform-attributed.
  cancelReason?: string;
  /// Set when a Disputed-state proposal was accepted. Identifies which party
  /// conceded the dispute so the off-chain reputation signal can apply the
  /// loss. 'seller' on refund-from-dispute, 'buyer' on release-from-dispute.
  disputeLoser?: 'buyer' | 'seller';
  /// Pending cancellation / dispute-resolution proposal. Cleared on accept
  /// (deal becomes cancelled) or decline (deal continues). Only one proposal
  /// at a time; a second propose call overwrites the first if it's from the
  /// same party, otherwise rejects.
  cancellationProposal?: {
    proposedBy: 'buyer' | 'seller';
    kind:
      | 'mutual'
      | 'platform-attributed'
      | 'refund-from-dispute'
      | 'release-from-dispute';
    reason: string;
    proposedAt: number;
  };
  /// Pending delivery-deadline extension request, raised by the seller while
  /// awaiting-delivery. Buyer sees a banner + Approve / Decline. Approve adds
  /// `additionalSeconds` to `deadlineUnix` and clears the request; Decline
  /// just clears it. Resolved requests stay on the deal under a separate log
  /// (`extensionHistory`) so the dispute path can reference them later.
  extensionRequest?: {
    requestedBy: 'seller';
    requestedAt: number;
    additionalSeconds: number;
    reason?: string;
  };
  /// Settled extension activity for audit. Each entry captures who asked,
  /// for how much, the buyer's decision, and the resulting deadline.
  extensionHistory?: {
    requestedBy: 'seller';
    requestedAt: number;
    additionalSeconds: number;
    reason?: string;
    decidedAt: number;
    decision: 'approved' | 'declined';
    /// The new deadline written to the deal after an approve, in unix seconds.
    /// Absent on declines.
    newDeadlineUnix?: number;
  }[];
  /// Acceptance window cutoff. Unix seconds. Deals that pass this point with
  /// no seller acceptance are expired by dealWatcher and marked cancelled
  /// (kind 'pre-accept'). Required on every new direct deal so a request never
  /// sits in limbo indefinitely; the buyer can re-shop the work elsewhere.
  acceptanceDeadlineUnix?: number;
  /// Set when the counterparty was invited by email and has not yet claimed
  /// the link. The corresponding address field (seller for outbound deals,
  /// buyer for inbound) stays at a placeholder until claim binds it to the
  /// recipient's real identity wallet. Funding never moves before claim, so
  /// the buyer is not on the hook for anything during the wait.
  pendingCounterparty?: {
    email: string;
    role: 'buyer' | 'seller';
    inviteToken: string;
  };
  // Agent auto-released the final milestone after the window expired silently.
  autoReleasedAt?: number;
  /// Delay-appeal flow. After the first milestone is released, the seller can
  /// raise this if the buyer is sitting on the final release without
  /// responding. Sets a buyer response window; if the buyer doesn't reply with
  /// a reason in time, the final milestone auto-releases. Protects sellers
  /// from indefinite buyer silence while keeping the buyer's manual-release
  /// gate intact during normal flow.
  delayAppealRaisedAt?: number;
  delayAppealRespondedAt?: number;
  delayAppealResponse?: string;
  delayAppealCount?: number;
  settledAt?: number;
  fundTxHash?: string;
  /// How this deal originated:
  /// - 'direct' — opened straight from /buyer "I have a seller", no auction.
  /// - 'agent'  — settled out of the managed auction and negotiation flow.
  /// Absent on rows created before this field existed; /stats infers those
  /// from the brief store (agent deals always have a brief, direct never do).
  origin?: 'direct' | 'agent';
  createdAt: number;
  updatedAt: number;
  /// True when the on-chain escrow for this jobId lives on the pre-v2.D
  /// KarwanEscrow address. Set by the boot-time sweep that scans every deal
  /// whose new-escrow state is None against the legacy escrow. Drives the
  /// /legacy recovery surface and excludes the deal from regular feeds.
  legacyEscrow?: boolean;
  /// Cached terminal-state snapshot from the legacy escrow. Helps the /legacy
  /// page render past deals (Settled/Refunded) alongside open ones (Funded)
  /// without re-querying the chain. Pre-v2.D state enum:
  /// None=0, Funded=1, Settled=2, Disputed=3, Refunded=4.
  legacyState?: number;
  /// Trusted-match flag chosen by the buyer at create time. When true, the
  /// seller's accept panel surfaces a "you must stake X USDC" requirement and
  /// the seller is expected to back the deal with slashable insurance. When
  /// false or undefined, the deal is casual: no stake messaging and no
  /// vault.reserve call on accept (on v2.E+ escrows).
  requireStake?: boolean;
  /// Per-deal stake percentage when requireStake is true. 50..100 in 5%
  /// steps from the buyer's slider. Translates to on-chain reservationBps:
  ///   requireStakePct * 100, e.g. 75 → 7500.
  /// Unset when requireStake is false; default 50 when requireStake is true
  /// and the slider was not surfaced (older clients).
  requireStakePct?: number;
  // --- SME trade-finance fields (Phase 2 Track 2) -----------------------
  /// Whether the deal moves goods, services, or both. Drives the milestone
  /// vocabulary (dispatched / in transit / customs cleared / delivered /
  /// accepted vs the simpler service mode), the Incoterms picker visibility,
  /// and the SME passport surfacing. Absent on rows created before this
  /// landed; backend treats absent as 'service' to preserve old UI.
  tradeType?: 'service' | 'goods' | 'mixed';
  /// Incoterms 2020 set. Only the subset relevant to SME cross-border deals
  /// per sme-research.md §2: FOB, CIF, DAP, EXW, FCA, DDP.
  incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
  /// When the buyer pays. Default for legacy deals is 'immediate' (the
  /// existing escrow-release model). Net terms route settlement on a delay
  /// after delivery; factoring lets the seller cash out before net expiry.
  paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
  /// Snapshot of the counterparty's SME profile at deal-creation time.
  /// Frozen here so the deal detail always shows what the parties agreed
  /// to, even if the live profile changes later.
  counterpartyCompany?: {
    name?: string;
    sector?: string;
    region?: string;
  };
  /// Document hashes anchored on KarwanInvoiceRegistry. Mirror of on-chain
  /// state for fast UI render; chain is the source of truth on tie.
  documentRefs?: Array<{
    hash: string;
    kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
    label?: string;
    anchoredAt?: number;
    txHash?: string;
  }>;
  /// Active factoring offer accepted by the seller. References
  /// FactoringOffer.id; null/absent means no factoring on this deal.
  factoringOfferId?: string;
  /// Active PO financing line opened by a financier. References
  /// POFinancingLine.id; null/absent means no PO financing on this deal.
  poFinancingId?: string;
  /// x402-paid signal receipts captured during agent negotiation. Stored as
  /// digests (not raw results) so the deal row never leaks paid content.
  paidSignalsLog?: Array<{
    signal: 'market-median' | 'news-mention' | 'credit-check' | 'wallet-risk' | 'business-registry' | 'other';
    costUsdc: string;
    resultDigest: string;
    calledAt: number;
    callerRole: 'buyer-agent' | 'seller-agent' | 'security-agent';
  }>;
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
