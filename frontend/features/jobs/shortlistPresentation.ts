import type { AgentWorldCheckView, ShortlistEntry } from '@/core/api';
import type { ShortlistCopy } from '@/shared/i18n/messages/shortlist';
import { fill } from '@/features/deals/workspace/presentation';

/// One shortlist row in words. The backend ranks; this only words what it sent.
export interface ShortlistRowView {
  levelLine: string;
  offerLine: string;
  askedLine: string | null;
  numbersLine: string | null;
  reasonLine: string | null;
  profileHref: string | null;
  /// Why the row stands apart: above the budget, or the agent not linked yet.
  markLine: string | null;
  choosable: boolean;
}

export interface ShortlistState {
  entries: ShortlistEntry[];
  closed: boolean;
  worldCheck?: AgentWorldCheckView | null;
  recordChecks?: { count: number; usdc: number };
}

/// The shortlist reply as state, or null when it carries no entries list, so
/// the job page falls back to the plain offers list instead of crashing.
export function shortlistState(reply: ShortlistState | null | undefined): ShortlistState | null {
  return reply && Array.isArray(reply.entries) ? reply : null;
}

export function shortlistRowView(e: ShortlistEntry, copy: ShortlistCopy): ShortlistRowView {
  const level = e.verified ? copy.verified : copy.notVerified;
  const tier = copy.tiers[e.tier as keyof ShortlistCopy['tiers']] ?? e.tier;
  const days = e.deliveryDays === 1 ? copy.dayOne : fill(copy.days, { n: e.deliveryDays });
  const numbers = e.counts ? countsLine(e.counts, copy) : null;
  return {
    // People see tier and reasons; a score is for agents (D30).
    levelLine: `${level} · ${tier}`,
    offerLine: e.offer ? `${e.offer} · ${days}` : days,
    askedLine: e.askedUsdc !== null ? fill(copy.asked, { amount: e.askedUsdc }) : null,
    numbersLine: [numbers, e.recordChecked ? copy.recordChecked : null].filter(Boolean).join(' · ') || null,
    reasonLine: e.reasons.length ? e.reasons.map((r) => copy.reasons[r]).join(' · ') : null,
    profileHref: e.tag ? `/r/${e.tag}` : null,
    markLine: e.mustLink
      ? copy.mustLink
      : e.extraDays
        ? e.extraDays === 1
          ? copy.longerOne
          : fill(copy.longerMany, { n: e.extraDays })
        : e.outsideRequest
          ? copy.outsideRequest
          : null,
    choosable: e.state !== 'unavailable' && !e.mustLink,
  };
}

function countsLine(counts: NonNullable<ShortlistEntry['counts']>, copy: ShortlistCopy): string {
  const { completed, onTimeRate, disputesLost } = counts;
  if (completed === 0) return copy.noDeals;
  return [
    completed === 1 ? copy.completedOne : fill(copy.completedMany, { n: completed }),
    onTimeRate !== null ? fill(copy.onTime, { n: onTimeRate }) : null,
    disputesLost === 1 ? copy.disputesLostOne : fill(copy.disputesLostMany, { n: disputesLost }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/// What the agent spent checking records for this request, once, under the note.
export function shortlistCostLine(checks: { count: number; usdc: number } | undefined, copy: ShortlistCopy): string | null {
  if (!checks || checks.count === 0) return null;
  return fill(checks.count === 1 ? copy.checkedCostOne : copy.checkedCost, { count: checks.count, amount: checks.usdc.toFixed(2) });
}

/// The one line above the list, when there is something to explain.
export function shortlistNotice(entries: readonly ShortlistEntry[], copy: ShortlistCopy): string | null {
  if (entries.length === 0) return copy.noneYet;
  if (entries.some((e) => e.recommended)) return null;
  return entries.some((e) => e.verified) ? copy.noneInBudget : copy.noneVerified;
}
