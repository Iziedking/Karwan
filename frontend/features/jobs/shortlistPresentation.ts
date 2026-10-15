import type { ShortlistEntry } from '@/core/api';
import type { ShortlistCopy } from '@/shared/i18n/messages/shortlist';
import { fill } from '@/features/deals/workspace/presentation';

/// One shortlist row in words. The backend ranks; this only words what it sent.
export interface ShortlistRowView {
  levelLine: string;
  offerLine: string;
  askedLine: string | null;
  numbersLine: string;
  reasonLine: string | null;
  profileHref: string | null;
  choosable: boolean;
}

export function shortlistRowView(e: ShortlistEntry, copy: ShortlistCopy): ShortlistRowView {
  const level = e.verified ? copy.verified : copy.notVerified;
  const tier = copy.tiers[e.tier as keyof ShortlistCopy['tiers']] ?? e.tier;
  const days = e.deliveryDays === 1 ? copy.dayOne : fill(copy.days, { n: e.deliveryDays });
  const { completed, onTimeRate, disputesLost } = e.counts;
  const numbers =
    completed === 0
      ? copy.noDeals
      : [
          completed === 1 ? copy.completedOne : fill(copy.completedMany, { n: completed }),
          onTimeRate !== null ? fill(copy.onTime, { n: onTimeRate }) : null,
          disputesLost === 1 ? copy.disputesLostOne : fill(copy.disputesLostMany, { n: disputesLost }),
        ]
          .filter(Boolean)
          .join(' · ');
  return {
    levelLine: `${level} · ${tier} · ${e.score}`,
    offerLine: e.offer ? `${e.offer} · ${days}` : days,
    askedLine: e.askedUsdc !== null ? fill(copy.asked, { amount: e.askedUsdc }) : null,
    numbersLine: e.recordChecked ? `${numbers} · ${copy.recordChecked}` : numbers,
    reasonLine: e.recommended && e.reasons.length ? e.reasons.map((r) => copy.reasons[r]).join(' · ') : null,
    profileHref: e.tag ? `/r/${e.tag}` : null,
    choosable: e.state !== 'unavailable',
  };
}

/// The one line above the list, when there is something to explain.
export function shortlistNotice(entries: readonly ShortlistEntry[], copy: ShortlistCopy): string | null {
  if (entries.length === 0) return copy.noneYet;
  if (entries.some((e) => e.recommended)) return null;
  return entries.some((e) => e.verified) ? copy.noneInBudget : copy.noneVerified;
}
