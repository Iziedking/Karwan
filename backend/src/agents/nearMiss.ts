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
  const cap = input.confirmedTopical ? LISTING_MAX_GAP_PCT : MAX_GAP_PCT;
  if (relGap > cap / 100) {
    emitSkipped(jobId, 'gap-too-wide', {
      buyerCeilingUsdc: round2(buyerCeilingUsdc),
      sellerFloorUsdc: round2(sellerFloorUsdc),
      gapUsdc: round2(gap),
      relGapPct: Math.round(relGap * 100),
      capPct: cap,
      confirmedTopical: input.confirmedTopical === true,
    });
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
    // carried so the resume path can rebuild context without the in-memory job
    // state if needed; budget/terms ride the job state today.
  };
  upsertNearMiss(record);
  emitNearMiss(record);
  logger.info(
    { jobId, askedSide: 'buyer', proceedPriceUsdc, gapUsdc: record.gapUsdc },
    'near-miss raised: asking buyer to stretch to seller floor',
  );
  return true;
}

/// The asked party declined. If it was the buyer's turn, flip the ask to the
/// seller at the buyer's ceiling (the buyer is now within range, so one seller
/// yes closes it). If it was the seller's turn, the near-miss ends.
export function flipOrEndOnDecline(jobId: string): { flipped: boolean } {
  const n = getPendingNearMiss(jobId);
  if (!n) return { flipped: false };

  if (n.askedSide === 'buyer' && !n.buyerAsked) {
    const now = Date.now();
    const flipped: NearMissApproval = {
      ...n,
      askedSide: 'seller',
      askedUser: n.sellerUser,
      proceedPriceUsdc: n.buyerCeilingUsdc, // seller stretches down to the buyer's cap
      limitUsdc: n.sellerFloorUsdc,
      gapUsdc: round2(Number(n.sellerFloorUsdc) - Number(n.buyerCeilingUsdc)),
      buyerAsked: true,
      createdAt: now,
      expiresAt: windowExpiry(0, now),
      declinedAt: undefined,
    };
    upsertNearMiss(flipped);
    emitNearMiss(flipped);
    logger.info(
      { jobId, proceedPriceUsdc: flipped.proceedPriceUsdc },
      'near-miss: buyer passed, asking seller to meet the buyer ceiling',
    );
    return { flipped: true };
  }

  const ended: NearMissApproval = { ...n, declinedAt: Date.now() };
  upsertNearMiss(ended);
  bus.emitEvent({
    type: 'negotiation.near-miss.declined',
    jobId,
    actor: 'platform',
    payload: { buyer: ended.buyerUser, sellerUser: ended.sellerUser, askedSide: n.askedSide },
  });
  return { flipped: false };
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
    },
  });
}
