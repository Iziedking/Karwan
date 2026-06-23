import { bus } from '../events.js';
import { logger } from '../logger.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import {
  getPendingNearMiss,
  getNearMiss,
  upsertNearMiss,
  isPending,
  type NearMissApproval,
} from '../db/nearMiss.js';
import { markPassed, noteFarFloor, clearOutOfReach, getOutOfReach } from '../db/outOfReach.js';

/// How far beyond a party's limit still counts as a near-miss worth surfacing
/// for a FUZZY (profile / no-overlap) match. A real near-miss, not a wild
/// mismatch. Tunable; bumped 2026-05-29 from 25 → 40 so the agent surfaces a
/// 50 USDC vs 70 USDC ask (40% gap) to the human instead of declining
/// silently. The buyer authorised their tolerance band; a one-stretch nudge
/// inside this wider window matches "ask the human" behaviour better.
const MAX_GAP_PCT = numEnv('NEAR_MISS_MAX_GAP_PCT', 40);
/// Wider band for a CONFIRMED market match: the agent already verified the
/// listing is the exact thing the buyer asked for, it is just over budget. When
/// the right product is sitting in the market, the buyer should hear about it
/// even at a bigger stretch than a fuzzy profile guess would justify. Defaults
/// to 100% (up to twice the budget); above that it is a different purchase, not
/// a near-miss.
const LISTING_MAX_GAP_PCT = numEnv('NEAR_MISS_LISTING_MAX_GAP_PCT', 100);
/// Band when paid market analysis backs the over-cap price. If the agent
/// researched the deal and demand is real (not soft), a price above the buyer's
/// budget is the market talking, not a bad match — widen the band so the buyer
/// hears "market says this is worth more, proceed or pass?" instead of a silent
/// skip. Defaults to 100% (up to 2x budget).
const MARKET_MAX_GAP_PCT = numEnv('NEAR_MISS_MARKET_GAP_PCT', 100);
/// Consent window. After this the near-miss lapses and nothing funds. Capped by
/// the brief's own deadline so we never ask past the point a deal could deliver.
const WINDOW_MS = numEnv('NEAR_MISS_WINDOW_MS', 60 * 60 * 1000);

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): string {
  return n.toFixed(2);
}

function windowExpiry(deadlineUnix: number, now = Date.now()): number {
  const deadlineMs = deadlineUnix * 1000;
  const fromWindow = now + WINDOW_MS;
  return deadlineMs > now ? Math.min(fromWindow, deadlineMs) : fromWindow;
}

interface NearMissInput {
  jobId: string;
  /// The buyer's on-chain agent address (job.buyer).
  buyerAgent: string;
  /// The seller's on-chain agent address. Both user addresses are resolved from
  /// the agent addresses so callers pass only what the chain hands them.
  sellerAgent: string;
  deadlineUnix: number;
  buyerCeilingUsdc: number;
  sellerFloorUsdc: number;
  /// True when the match is an LLM-confirmed market listing (the exact product),
  /// not a fuzzy profile guess. Widens the gap band so a confirmed-but-pricey
  /// market offer still reaches the buyer.
  confirmedTopical?: boolean;
  /// Optional override for the gap-band cap percentage. When set, replaces
  /// the default MAX_GAP_PCT / LISTING_MAX_GAP_PCT for this call. The buyer
  /// agent uses this to widen the band when the brief was posted with no
  /// tolerance set (ask-mode): "no ceiling" briefs surface stretches up to
  /// the override (default 200% above budget = 3x budget) and only decline
  /// silently when the seller's price is genuinely outrageous.
  bandPctOverride?: number;
  /// Paid market analysis for the deal, when the buyer agent has research
  /// active. When demand is real it both widens the gap band and is carried
  /// into the alert so the buyer sees the market justification for the price.
  market?: { demand: 'hot' | 'steady' | 'soft'; note: string; fairPriceUsdc?: number };
}

/// Detection + creation. Called from a give-up point where the agents found a
/// topical match but the seller's floor sits above the buyer's ceiling (no
/// overlap). When the gap is within the band, ask the BLOCKED side instead of
/// skipping: the buyer goes first, at the seller's floor (one yes closes it,
/// since the seller is already at their floor). Returns true when a near-miss was
/// raised, so the caller suppresses its normal "uncrossable, skipping" path.
export async function maybeRaiseNearMiss(input: NearMissInput): Promise<boolean> {
  const { jobId, buyerCeilingUsdc, sellerFloorUsdc } = input;
  const gap = sellerFloorUsdc - buyerCeilingUsdc;
  if (gap <= 0) return false; // ranges overlap, not a near-miss
  if (buyerCeilingUsdc <= 0) {
    emitSkipped(jobId, 'invalid-buyer-ceiling', { buyerCeilingUsdc, sellerFloorUsdc });
    return false;
  }
  const relGap = gap / buyerCeilingUsdc;
  const defaultCap = input.confirmedTopical ? LISTING_MAX_GAP_PCT : MAX_GAP_PCT;
  let cap = input.bandPctOverride ?? defaultCap;
  // Market analysis legitimises an over-budget price. If the agent paid to
  // research the deal and demand is real, the seller pricing above the buyer's
  // cap is the market — widen the band so it surfaces as proceed-or-pass.
  const marketBacked = input.market != null && input.market.demand !== 'soft';
  if (marketBacked) cap = Math.max(cap, MARKET_MAX_GAP_PCT);
  if (relGap > cap / 100) {
    emitSkipped(jobId, 'gap-too-wide', {
      buyerCeilingUsdc: round2(buyerCeilingUsdc),
      sellerFloorUsdc: round2(sellerFloorUsdc),
      gapUsdc: round2(gap),
      relGapPct: Math.round(relGap * 100),
      capPct: cap,
      confirmedTopical: input.confirmedTopical === true,
      bandPctOverride: input.bandPctOverride,
      marketBacked,
    });
    // A confirmed-topical match priced far past the ceiling, after the buyer
    // already passed the best real price, means the deal can never settle at
    // this budget. The near-miss record is deleted on re-open, so the durable
    // "passed" marker (set in endNearMissOnDecline) is what we check. When it's
    // set, record this far floor and emit a durable out-of-reach signal so the
    // job page stops the "negotiating" spinner and explains the gap, rather than
    // churning this same skip every reconcile tick. Re-emitting on each tick is
    // harmless: it's idempotent and off the public feed, and keeps a fresh
    // signal in the ring for a reload. The request stays open; a genuinely
    // cheaper seller clears the marker and supersedes this on the page.
    if (input.confirmedTopical) {
      const marked = noteFarFloor(jobId, sellerFloorUsdc);
      if (marked) {
        bus.emitEvent({
          type: 'negotiation.out-of-reach',
          jobId,
          actor: 'platform',
          payload: {
            closestFloorUsdc: round2(marked.closestFloorUsdc ?? sellerFloorUsdc),
            ceilingUsdc: round2(marked.ceilingUsdc),
            // The best real price the buyer passed, so the advisory can offer to
            // reconsider it when nothing cheaper turned up.
            passedPriceUsdc: marked.passed.proceedPriceUsdc,
          },
        });
      }
    }
    return false;
  }

  // Don't stack near-misses on the same job. An existing pending one already
  // asked someone; a resolved one means the human already had their say.
  const existing = getNearMiss(jobId);
  if (existing && (isPending(existing) || existing.proceededAt || existing.declinedAt)) {
    if (!isPending(existing)) {
      emitSkipped(jobId, 'already-resolved', {
        proceededAt: existing.proceededAt,
        declinedAt: existing.declinedAt,
      });
    }
    return existing != null && isPending(existing);
  }

  const [buyerWallets, sellerWallets] = await Promise.all([
    findAgentWalletByAgentAddress(input.buyerAgent),
    findAgentWalletByAgentAddress(input.sellerAgent),
  ]);
  if (!buyerWallets || !sellerWallets) {
    logger.warn(
      {
        jobId,
        buyerAgent: input.buyerAgent,
        sellerAgent: input.sellerAgent,
        buyerResolved: buyerWallets !== null,
        sellerResolved: sellerWallets !== null,
      },
      'near-miss: could not resolve both wallets, skipping',
    );
    emitSkipped(jobId, 'wallets-unresolved', {
      buyerAgent: input.buyerAgent,
      sellerAgent: input.sellerAgent,
      buyerResolved: buyerWallets !== null,
      sellerResolved: sellerWallets !== null,
    });
    return false;
  }

  const proceedPriceUsdc = round2(sellerFloorUsdc); // buyer stretches up to the floor
  const now = Date.now();
  const record: NearMissApproval = {
    jobId,
    buyerUser: buyerWallets.userAddress,
    buyerAgent: buyerWallets.buyerAddress,
    sellerUser: sellerWallets.userAddress,
    sellerAgent: sellerWallets.sellerAddress,
    askedSide: 'buyer',
    askedUser: buyerWallets.userAddress,
    proceedPriceUsdc,
    limitUsdc: round2(buyerCeilingUsdc),
    gapUsdc: round2(gap),
    buyerCeilingUsdc: round2(buyerCeilingUsdc),
    sellerFloorUsdc: round2(sellerFloorUsdc),
    createdAt: now,
    expiresAt: windowExpiry(input.deadlineUnix, now),
    marketDemand: input.market?.demand,
    marketNote: input.market?.note,
    marketFairPriceUsdc: input.market?.fairPriceUsdc,
    // carried so the resume path can rebuild context without the in-memory job
    // state if needed; budget/terms ride the job state today.
  };
  upsertNearMiss(record);
  // A fresh crossable ask supersedes any earlier out-of-reach state: a real
  // near-match is back on the table, so drop the "no match at your budget"
  // marker (a cheaper seller showed up after the pass).
  clearOutOfReach(jobId);
  emitNearMiss(record);
  logger.info(
    { jobId, askedSide: 'buyer', proceedPriceUsdc, gapUsdc: record.gapUsdc },
    'near-miss raised: asking buyer to stretch to seller floor',
  );
  return true;
}

/// The asked party passed. End this near-miss cleanly. We no longer flip the ask
/// to the other side: an agent counterparty does not sit and answer a flipped
/// prompt, so the deal just hung "waiting on them" until the window lapsed. The
/// caller re-opens the auction instead (reopenForNewBids), keeping the request
/// live for fresh sellers rather than dead-ending.
export function endNearMissOnDecline(jobId: string): { ended: boolean } {
  const n = getPendingNearMiss(jobId);
  if (!n) return { ended: false };
  const ended: NearMissApproval = { ...n, declinedAt: Date.now() };
  upsertNearMiss(ended);
  // Durable trace that the buyer saw the best real price and passed. The
  // near-miss record gets deleted when the auction re-opens, so this marker is
  // what later out-of-reach skips check against, and it snapshots the offer so
  // the advisory can re-raise it if nothing cheaper turns up.
  markPassed(jobId, n);
  bus.emitEvent({
    type: 'negotiation.near-miss.declined',
    jobId,
    actor: 'platform',
    payload: { buyer: ended.buyerUser, sellerUser: ended.sellerUser, askedSide: n.askedSide },
  });
  return { ended: true };
}

/// Re-raise the offer the buyer passed, from the durable out-of-reach snapshot.
/// Powers the advisory's "reconsider" action: when no cheaper seller turned up,
/// the buyer can bring back the exact ask they declined and proceed. The seller
/// already offered this floor, so the price is within their authorization and no
/// second gate is needed. Returns the re-raised record, or null when there's no
/// passed offer to bring back (already resolved, or never had one).
export function reRaiseNearMissFromPassed(
  jobId: string,
  deadlineUnix: number,
): NearMissApproval | null {
  const rec = getOutOfReach(jobId);
  if (!rec?.passed) return null;
  // Don't stomp a live near-miss (a fresh seller may already be on the table).
  if (getPendingNearMiss(jobId)) return null;
  const p = rec.passed;
  const now = Date.now();
  const record: NearMissApproval = {
    jobId: jobId.toLowerCase(),
    buyerUser: p.buyerUser,
    buyerAgent: p.buyerAgent,
    sellerUser: p.sellerUser,
    sellerAgent: p.sellerAgent,
    askedSide: 'buyer',
    askedUser: p.buyerUser,
    proceedPriceUsdc: p.proceedPriceUsdc,
    limitUsdc: p.limitUsdc,
    gapUsdc: round2(Math.max(0, Number(p.sellerFloorUsdc) - Number(p.buyerCeilingUsdc))),
    buyerCeilingUsdc: p.buyerCeilingUsdc,
    sellerFloorUsdc: p.sellerFloorUsdc,
    createdAt: now,
    expiresAt: windowExpiry(deadlineUnix, now),
  };
  upsertNearMiss(record);
  // The buyer chose to reconsider: the deal is actionable again, so leave the
  // out-of-reach state behind and surface the proceed/pass card.
  clearOutOfReach(jobId);
  emitNearMiss(record);
  logger.info(
    { jobId, proceedPriceUsdc: record.proceedPriceUsdc },
    'near-miss re-raised from passed offer: buyer reconsidered',
  );
  return record;
}

/// Emit a structured "near-miss skipped" event for every silent-false return.
/// Without this, a real match that the gap-band or wallet-resolution gate
/// rejected leaves nothing in the activity feed and the operator has to read
/// logs to find it. Payload carries the reason and enough context to act on.
function emitSkipped(jobId: string, reason: string, payload: Record<string, unknown>) {
  bus.emitEvent({
    type: 'negotiation.near-miss.skipped',
    jobId,
    actor: 'platform',
    payload: { reason, ...payload },
  });
}

function emitNearMiss(n: NearMissApproval) {
  bus.emitEvent({
    type: 'negotiation.near-miss',
    jobId: n.jobId,
    actor: 'platform',
    payload: {
      // buyer + sellerUser let the notifier and bell resolve the viewer's role.
      buyer: n.buyerUser,
      sellerUser: n.sellerUser,
      askedSide: n.askedSide,
      askedUser: n.askedUser,
      proceedPriceUsdc: n.proceedPriceUsdc,
      limitUsdc: n.limitUsdc,
      gapUsdc: n.gapUsdc,
      expiresAt: n.expiresAt,
      marketDemand: n.marketDemand,
      marketNote: n.marketNote,
      marketFairPriceUsdc: n.marketFairPriceUsdc,
    },
  });
}
