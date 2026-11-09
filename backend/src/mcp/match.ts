import type { DeliveryKind } from '../location/rules.js';
import { FIND_MAX, rankForFind, type FindCandidate } from '../find/rank.js';

/// find_counterparty for an agent outside Karwan (view 15): the same ranking
/// the assistant uses to find people (view 72), over the people who chose to
/// be found and let outside agents find them. Sealed rows only: never a score,
/// a count, an outcome or where anyone is (D23).

export { FIND_MAX };

export interface FindDeps {
  candidates(need: { keywords: string[]; text: string; kind: DeliveryKind }): Promise<FindCandidate[]>;
  cleanRecordCounts: boolean;
  requireVerified: boolean;
}

export interface FoundSeller {
  tag: string;
  name: string;
  verified: boolean;
  tier: string;
  rating: string;
  reasons: string[];
  priceUsdc: string;
  days: number;
  recommended: boolean;
}

const words = (need: string) => need.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

export async function findForAgent(input: { need: string; budgetUsdc: number; deadlineDays: number; agentAddress: string }, deps: FindDeps): Promise<FoundSeller[]> {
  const keywords = words(input.need);
  // An outside agent names no place, so only work that can be done online.
  const kind: DeliveryKind = 'remote';
  const all = await deps.candidates({ keywords, text: input.need, kind });
  // Nor one who cannot deliver inside the deadline.
  const open = all.filter((c) => c.outsideAgents && !!c.tag && (c.days?.min ?? 1) <= input.deadlineDays);
  const rows = rankForFind(
    open,
    { text: input.need, keywords, budgetUsdc: input.budgetUsdc, kind, where: { scope: 'anywhere' }, buyer: input.agentAddress, buyerLocation: null, buyerVerified: false },
    { requireVerified: deps.requireVerified, blocked: new Set(), cleanRecordCounts: deps.cleanRecordCounts },
  );
  return rows.map((r) => ({
    tag: `@${r.tag}`,
    name: r.name,
    verified: r.verified,
    tier: r.tier,
    rating: r.rating,
    reasons: [...r.reasons],
    priceUsdc: r.priceUsdc ?? String(input.budgetUsdc),
    days: Math.min(r.days ?? input.deadlineDays, input.deadlineDays),
    recommended: r.recommended,
  }));
}
