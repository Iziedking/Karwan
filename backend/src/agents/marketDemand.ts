import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveAllSellerProfiles } from './agent-registry.js';
import { listAllBriefs } from '../db/briefs.js';
import { researchModel } from '../llm/client.js';
import { withLlmRetry } from './llm-utils.js';
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

// Off-platform demand estimate, cached per skill set. The LLM scores how hot a
// skill is in the wider freelance/services market right now, grounding the agent
// in more than just on-platform supply. It reuses the existing LLM (no new key)
// and is NON-BLOCKING: a cache miss returns null this call and refreshes in the
// background, so the per-bid path never waits on the model. Swap or augment with
// a hard-data provider (Google Trends / freelance-rate API) behind its own key
// inside refreshExternalHeat when you want real-time numbers.
const heatCache = new Map<string, { heat: number; ts: number }>();
const HEAT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const heatInflight = new Set<string>();

const heatSchema = z.object({
  heat: z.number().min(0).max(1),
  note: z.string().max(200).optional(),
});

async function externalMarketHeat(keywords: string[]): Promise<number | null> {
  const kw = normKeywords(keywords);
  if (kw.length === 0) return null;
  const key = [...kw].sort().join('|');
  const cached = heatCache.get(key);
  if (cached && Date.now() - cached.ts < HEAT_TTL_MS) return cached.heat;
  if (!heatInflight.has(key)) {
    heatInflight.add(key);
    void refreshExternalHeat(key, kw).finally(() => heatInflight.delete(key));
  }
  return null; // first look uses the internal signal; later bids blend the cached estimate
}

async function refreshExternalHeat(key: string, kw: string[]): Promise<void> {
  try {
    const res = await withLlmRetry(`marketHeat(${key})`, () =>
      generateObject({
        model: researchModel,
        schema: heatSchema,
        prompt: [
          'Estimate current global freelance/services market demand for these skills.',
          `Skills: ${kw.join(', ')}`,
          'Return heat as 0..1: 1 = very hot / scarce / high demand right now, 0.5 = average,',
          '0 = cold / oversupplied. Base it on current tech and freelance market trends.',
          'Add one short note on why.',
        ].join('\n'),
      }),
    );
    heatCache.set(key, { heat: clamp(res.object.heat, 0, 1), ts: Date.now() });
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, 'external market heat estimate failed');
  }
}

/// Map a paid-research demand verdict to a 0..1 heat. hot = sellers have
/// leverage (hold near the ceiling), soft = oversupply (price down).
export function demandToHeat(demand: 'hot' | 'steady' | 'soft'): number {
  return demand === 'hot' ? 0.85 : demand === 'soft' ? 0.2 : 0.5;
}

/// Override the external-heat cache with a REAL market read (from the paid x402
/// research). Once an active account's agent researches a keyword set, every
/// agent negotiating those keywords reads this heat for the TTL instead of the
/// LLM estimate, so the finding tunes negotiation. Keyword-scoped, never tied
/// to a counterparty.
export function setResearchHeat(keywords: string[], demand: 'hot' | 'steady' | 'soft'): void {
  const kw = normKeywords(keywords);
  if (kw.length === 0) return;
  const key = [...kw].sort().join('|');
  heatCache.set(key, { heat: demandToHeat(demand), ts: Date.now() });
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
  const external = await externalMarketHeat(keywords);
  if (external == null) return onPlatform;
  return clamp(0.5 * onPlatform + 0.5 * external, 0, 1);
}
