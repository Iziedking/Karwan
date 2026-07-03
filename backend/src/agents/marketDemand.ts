import { resolveAllSellerProfiles } from './agent-registry.js';
import { listAllBriefs } from '../db/briefs.js';
import { logger } from '../logger.js';

/// Market-demand signal for the negotiation agents.
///
/// A seller agent should hold nearer the buyer's tolerance ceiling when its
/// skill is in demand, and price nearer the buyer's posted budget when the
/// skill is common. This module turns a skill set into a 0..1 "heat".
///
/// v1 uses an on-platform supply-scarcity signal (how many other sellers list
/// the same skills) which is real, synchronous, and needs no external key.
/// `externalMarketHeat` is the documented plug point for an off-platform "what's
/// hot" provider (Google Trends, a freelance-rate API, or an LLM web check).
/// Wire it behind its own API key and it gets blended in automatically.

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normKeywords(arr: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      arr
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/// On-platform supply scarcity for a skill set. Fewer competing sellers listing
/// these skills => scarcer => hotter. 0.85 (no competition) down to 0.2
/// (saturated supply). Neutral 0.5 when there is no signal.
async function internalScarcityHeat(keywords: string[], selfAddress?: string): Promise<number> {
  const kw = normKeywords(keywords);
  if (kw.length === 0) return 0.5;
  let competing = 0;
  try {
    const sellers = await resolveAllSellerProfiles();
    const self = selfAddress?.toLowerCase();
    for (const s of sellers) {
      if (self && s.address.toLowerCase() === self) continue;
      const sk = normKeywords([...(s.skills ?? []), ...(s.keywords ?? [])]);
      if (sk.some((k) => kw.includes(k))) competing += 1;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'market scarcity read failed, neutral heat');
    return 0.5;
  }
  // 0 competitors -> 0.85, ~3 -> ~0.5, 5+ -> floor 0.2.
  return clamp(0.85 - competing * 0.12, 0.2, 0.85);
}

/// How many recent, still-open briefs on Karwan ask for a skill — the DEMAND
/// side. Price works on demand AND supply: many buyers wanting a skill lets a
/// seller hold a higher price. Counts non-expired briefs in the window whose
/// keywords overlap. 0 briefs reads slightly soft (0.4); ramps to 0.9 as
/// demand stacks up.
const DEMAND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SkillDemand {
  keywords: string[];
  /// Open briefs in the window asking for these skills.
  briefCount: number;
  /// 0..1 demand heat derived from the count.
  heat: number;
  windowDays: number;
}

function demandBriefCount(kw: string[]): number {
  const cutoff = Date.now() - DEMAND_WINDOW_MS;
  let matching = 0;
  for (const b of listAllBriefs()) {
    if (b.expiredAt || b.createdAt < cutoff) continue;
    const bk = normKeywords(b.keywords ?? []);
    if (bk.some((k) => kw.includes(k))) matching += 1;
  }
  return matching;
}

function internalDemandHeat(keywords: string[]): number {
  const kw = normKeywords(keywords);
  if (kw.length === 0) return 0.5;
  return clamp(0.4 + demandBriefCount(kw) * 0.1, 0.4, 0.9);
}

/// On-platform skill-demand snapshot for the paid x402 endpoint and the agents.
/// Pure on-platform data (no external call), so it is cheap and synchronous.
export function skillDemand(keywords: string[]): SkillDemand {
  const kw = normKeywords(keywords);
  const briefCount = kw.length === 0 ? 0 : demandBriefCount(kw);
  return {
    keywords: kw,
    briefCount,
    heat: internalDemandHeat(keywords),
    windowDays: Math.round(DEMAND_WINDOW_MS / 86_400_000),
  };
}

// Off-platform demand heat, keyed per skill set. Populated ONLY by a REAL paid
// market read (setResearchHeat, from the x402 Exa research) — never by an
// ungrounded model guess. The prior version asked the LLM to "estimate current
// global freelance market demand" with zero grounding and blended that fiction
// into every negotiation (audit/AGENTIC_WORKFLOW_REVIEW.md #2); that is gone. A
// cache miss now means "no paid read for these keywords yet", and the composite
// falls back to the on-platform signal alone. Values expire after the TTL so a
// stale read stops tilting negotiation.
const heatCache = new Map<string, { heat: number; ts: number }>();
const HEAT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function externalMarketHeat(keywords: string[]): number | null {
  const kw = normKeywords(keywords);
  if (kw.length === 0) return null;
  const key = [...kw].sort().join('|');
  const cached = heatCache.get(key);
  if (cached && Date.now() - cached.ts < HEAT_TTL_MS) return cached.heat;
  return null; // no paid read for these keywords -> on-platform signal only
}

/// A minimal view of a paid market read — the fields heat derives from. Kept
/// structural (not the full MarketRead) so this module has no dependency on the
/// x402 client.
export interface ResearchHeatInput {
  demand: 'hot' | 'steady' | 'soft';
  priceConfidence?: 'grounded' | 'rough' | 'none';
  sources?: { title: string; url: string }[];
}

/// Continuous 0..1 heat derived from a REAL paid market read. The demand label
/// sets the direction (hot pushes up, soft pushes down); the strength of that
/// push is the read's EVIDENCE — a low-confidence or thin-sourced read is pulled
/// back toward neutral (0.5) so it never anchors negotiation as hard as a
/// well-sourced grounded read. This replaces the old 3-constant quantizer
/// (hot=0.85 / steady=0.5 / soft=0.2), which gave a 1-source 'rough' read the
/// exact same weight as a 4-source 'grounded' one (review #5).
export function researchHeatFromRead(read: ResearchHeatInput): number {
  const direction = read.demand === 'hot' ? 0.8 : read.demand === 'soft' ? 0.25 : 0.5;
  const confidenceWeight =
    read.priceConfidence === 'grounded' ? 1 : read.priceConfidence === 'rough' ? 0.6 : 0.4;
  const sourceWeight = clamp((read.sources?.length ?? 0) / 4, 0.25, 1);
  const strength = confidenceWeight * sourceWeight; // 0..1 evidence weight
  return clamp(0.5 + (direction - 0.5) * strength, 0, 1);
}

/// Write a REAL market read's evidence-weighted heat into the shared cache. Once
/// an order is researched, every agent negotiating those keywords reads this
/// heat for the TTL. Keyword-scoped, never tied to a counterparty.
export function setResearchHeat(keywords: string[], read: ResearchHeatInput): void {
  const kw = normKeywords(keywords);
  if (kw.length === 0) return;
  const key = [...kw].sort().join('|');
  heatCache.set(key, { heat: researchHeatFromRead(read), ts: Date.now() });
}

/// How far the buyer's budget must sit above the grounded market price before
/// the buyer agent raises an overpay advisory. Below this, the buyer is just
/// willing to pay a bit more than market and the deal proceeds; only a real
/// overshoot is worth interrupting. Fixed 40% per the design.
export const MARKET_OVERPAY_ALERT_PCT = Number(process.env.MARKET_OVERPAY_ALERT_PCT ?? 40);

export type MarketVerdict = 'overpriced' | 'underpriced' | 'fair' | 'unknown';

/// One-time read of the buyer's budget against the grounded market price.
/// `fairPriceUsdc` is only set when the research was confident, so an absent
/// price yields 'unknown' and the agents behave as if there were no market
/// reference (the guard against acting on a guess). Evaluated once per deal so
/// the agent commits to a stance instead of oscillating round to round.
export function classifyVsMarket(
  budgetUsdc: number,
  fairPriceUsdc?: number,
): { verdict: MarketVerdict; overPct: number; fairPriceUsdc?: number } {
  if (!fairPriceUsdc || fairPriceUsdc <= 0 || budgetUsdc <= 0) {
    return { verdict: 'unknown', overPct: 0 };
  }
  const overPct = Math.round(((budgetUsdc - fairPriceUsdc) / fairPriceUsdc) * 100);
  if (budgetUsdc >= fairPriceUsdc * (1 + MARKET_OVERPAY_ALERT_PCT / 100)) {
    return { verdict: 'overpriced', overPct, fairPriceUsdc };
  }
  if (budgetUsdc < fairPriceUsdc) return { verdict: 'underpriced', overPct, fairPriceUsdc };
  return { verdict: 'fair', overPct, fairPriceUsdc };
}

/// Composite 0..1 market heat for a skill set. The seller agent uses it to
/// decide WHERE in [buyer budget, tolerance ceiling] to anchor its bid: a hot
/// skill holds near the ceiling, a common skill prices nearer the buyer's offer.
export async function marketHeat(keywords: string[], selfAddress?: string): Promise<number> {
  // On-platform price pressure = demand x supply: scarce sellers (supply) AND
  // many open briefs wanting the skill (demand) both push heat up.
  const supply = await internalScarcityHeat(keywords, selfAddress);
  const demand = internalDemandHeat(keywords);
  const onPlatform = clamp(0.5 * supply + 0.5 * demand, 0, 1);
  const external = externalMarketHeat(keywords);
  if (external == null) return onPlatform;
  return clamp(0.5 * onPlatform + 0.5 * external, 0, 1);
}
