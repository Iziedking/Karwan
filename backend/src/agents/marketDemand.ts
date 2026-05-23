import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveAllSellerProfiles } from './agent-registry.js';
import { llmModel } from '../llm/client.js';
import { withLlmTimeout } from './llm-utils.js';
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
/// hot" provider (Google Trends, a freelance-rate API, or an LLM web check) —
/// wire it behind its own API key and it gets blended in automatically.

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
    const res = await withLlmTimeout(
      `marketHeat(${key})`,
      generateObject({
        model: llmModel,
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

/// Composite 0..1 market heat for a skill set. The seller agent uses it to
/// decide WHERE in [buyer budget, tolerance ceiling] to anchor its bid: a hot
/// skill holds near the ceiling, a common skill prices nearer the buyer's offer.
export async function marketHeat(keywords: string[], selfAddress?: string): Promise<number> {
  const internal = await internalScarcityHeat(keywords, selfAddress);
  const external = await externalMarketHeat(keywords);
  if (external == null) return internal;
  return clamp(0.5 * internal + 0.5 * external, 0, 1);
}
