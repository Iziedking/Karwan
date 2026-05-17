import { reputation } from '../chain/contracts.js';
import { reputationAbi } from '../chain/abis/reputation.js';
import { publicClient } from '../chain/client.js';
import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';
import { compute } from '../reputation/engine.js';
import { loadInputs } from '../reputation/signals.js';
import type { Tier } from '../reputation/config.js';

// Deterministic decision signals computed before the LLM ever sees a bid.
// Naming the features explicitly lets the LLM reason about the *pattern* (low
// rep + high price = honey trap) without having to derive the components.
//
// All four signals are bounded and cheap to compute. priceAnomaly is the
// only one that needs a sample of the marketplace; the rest read on-chain
// reputation + the local bus history.

// Lowercased mirror of the engine's `Tier` enum. The agent layer uses
// lowercase for historical reasons (prompts, MatchProposal fields). The
// composite engine returns uppercase, we normalise here.
export type RepTier = 'new' | 'cold' | 'established' | 'strong' | 'elite';

export interface ActorSignals {
  /// 0..10000 bps from the ERC-8004-style reputation registry. 5000 = neutral.
  reputationBps: number;
  /// Bucketed view of `reputationBps` mixed with total deal count, so a wallet
  /// with one lucky settlement doesn't read as Strong.
  repTier: RepTier;
  /// settled / total. NaN-safe: 1 when zero deals (so a brand-new actor isn't
  /// punished as "low completion").
  completionRate: number;
  /// Bids + listings + cancels in the last 24h on this actor. Spammy actors
  /// rack this up fast; legitimate ones rarely cross 5.
  velocity24h: number;
}

export interface BidSignals {
  /// How far the bid price is from the brief's posted budget, as a multiple.
  /// 1.0 = exactly at budget. 1.5 = 50% over (windfall when from a real buyer).
  /// 0.5 = half the budget (lowball if not from a strong rep).
  priceMultiple: number;
  /// Standard-deviations away from the rolling median of bids on this kind of
  /// brief. Null when the sample is too small to be meaningful.
  priceAnomaly: number | null;
  actor: ActorSignals;
}

// ---------- Reputation tier ----------

// Reads `scores(address)` directly so we can derive completionRate without a
// second on-chain round-trip. The view returns the three counts as a tuple.
async function readScoreCounts(addr: string): Promise<{
  successCount: bigint;
  disputedCount: bigint;
  failedCount: bigint;
}> {
  const tuple = (await publicClient.readContract({
    address: reputation.address,
    abi: reputationAbi,
    functionName: 'scores',
    args: [addr as `0x${string}`],
  })) as readonly [bigint, bigint, bigint];
  return {
    successCount: tuple[0],
    disputedCount: tuple[1],
    failedCount: tuple[2],
  };
}

async function readReputationBps(addr: string): Promise<number> {
  try {
    return Number(await reputation.read.getReputationScore([addr as `0x${string}`]));
  } catch {
    return 5000;
  }
}

function tierFor(bps: number, totalDeals: bigint): RepTier {
  // A wallet with zero deals reads neutral on `bps` but we still want to call
  // it New — the registry can't distinguish "trusted but quiet" from "brand
  // new" purely on the composite score.
  if (totalDeals === 0n) return 'new';
  if (totalDeals < 3n) return bps >= 4500 ? 'cold' : 'new';
  if (bps >= 7500) return 'strong';
  if (bps >= 5000) return 'established';
  if (bps >= 3500) return 'cold';
  return 'new';
}

export async function actorSignalsFor(addr: string): Promise<ActorSignals> {
  let counts: Awaited<ReturnType<typeof readScoreCounts>>;
  try {
    counts = await readScoreCounts(addr);
  } catch (err) {
    logger.warn({ err: (err as Error).message, addr }, 'scores read failed, using neutral');
    counts = { successCount: 0n, disputedCount: 0n, failedCount: 0n };
  }
  const reputationBps = await readReputationBps(addr);
  const total = counts.successCount + counts.disputedCount + counts.failedCount;
  const completionRate =
    total === 0n ? 1 : Number(counts.successCount) / Number(total);
  const velocity24h = countRecentActorEvents(addr.toLowerCase());
  return {
    reputationBps,
    repTier: tierFor(reputationBps, total),
    completionRate,
    velocity24h,
  };
}

// ---------- Velocity ----------

// Reads the bus's last-500 ring buffer for events naming this actor in the
// usual party-key slots. Cheap because the ring is in memory; no DB hop.
const VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTOR_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy'] as const;
function countRecentActorEvents(addrLower: string): number {
  const recent = bus.recent(500);
  const cutoff = Date.now() - VELOCITY_WINDOW_MS;
  let n = 0;
  for (const e of recent) {
    if (e.ts < cutoff) continue;
    const p = e.payload as Record<string, unknown> | undefined;
    if (!p) continue;
    for (const k of ACTOR_KEYS) {
      const v = p[k];
      if (typeof v === 'string' && v.toLowerCase() === addrLower) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

// ---------- Price anomaly ----------

// Rolling median + median-absolute-deviation over the last N bid prices.
// We use MAD instead of stddev so a single 10× outlier doesn't poison the
// scale and tag everything else as "normal".
const PRICE_HISTORY_SIZE = 200;
const priceHistory: number[] = [];

export function recordPriceObservation(priceUsdc: number) {
  if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) return;
  priceHistory.push(priceUsdc);
  if (priceHistory.length > PRICE_HISTORY_SIZE) priceHistory.shift();
}

// Subscribe once on module load so every bid.submitted feeds the history.
bus.subscribe((e: KarwanEvent) => {
  if (e.type !== 'bid.submitted') return;
  const p = e.payload?.priceUsdc;
  if (typeof p === 'string') recordPriceObservation(Number(p));
});

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function priceAnomalyScore(price: number): number | null {
  if (priceHistory.length < 8) return null;
  const m = median(priceHistory);
  const deviations = priceHistory.map((x) => Math.abs(x - m));
  const mad = median(deviations);
  if (mad === 0) return null;
  // ~1.4826 converts MAD to a stddev-equivalent under a normal distribution.
  return (price - m) / (1.4826 * mad);
}

// ---------- Bid signals ----------

export async function bidSignalsFor(input: {
  actorAddress: string;
  bidPriceUsdc: number;
  briefBudgetUsdc: number;
}): Promise<BidSignals> {
  const actor = await actorSignalsFor(input.actorAddress);
  const priceMultiple =
    input.briefBudgetUsdc > 0 ? input.bidPriceUsdc / input.briefBudgetUsdc : 1;
  const priceAnomaly = priceAnomalyScore(input.bidPriceUsdc);
  return {
    priceMultiple,
    priceAnomaly,
    actor,
  };
}

// ---------- Pattern recognition ----------

export type RiskPattern =
  | 'windfall'
  | 'honey-trap'
  | 'reliable-deal'
  | 'lowball'
  | 'spammy'
  | 'normal';

/// Pattern-matches a bid against the four named rules from the agent design.
/// `normal` means "no strong signal; let the LLM decide." All other patterns
/// trigger deterministic handling upstream (auto-accept, route to human,
/// auto-decline).
export function classifyBid(s: BidSignals): RiskPattern {
  // Velocity spike: too many actions in 24h, likely a bot or sybil ring.
  if (s.actor.velocity24h >= 20) return 'spammy';

  const tier = s.actor.repTier;
  const windfallish = s.priceMultiple >= 1.5;
  const aroundBudget = s.priceMultiple >= 0.9 && s.priceMultiple <= 1.1;
  const lowballish = s.priceMultiple <= 0.7;
  const strongRep = tier === 'established' || tier === 'strong';
  const weakRep = tier === 'new' || tier === 'cold';

  if (windfallish && strongRep) return 'windfall';
  if (windfallish && weakRep) return 'honey-trap';
  if (aroundBudget && strongRep && s.actor.completionRate > 0.8) return 'reliable-deal';
  if (lowballish && weakRep) return 'lowball';
  return 'normal';
}
