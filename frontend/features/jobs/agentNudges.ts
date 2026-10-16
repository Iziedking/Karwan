import type { ChainEvent } from '@/core/api';
import type { AgentNudgesCopy } from '@/shared/i18n/messages/agentNudges';
import { fill } from '@/features/deals/workspace/presentation';

/// One agent move as a short note that pops up and fades. Built only from what
/// the viewer's own feed carries, so a viewer who gets an empty pulse sees
/// nothing.

export interface AgentNudge {
  key: string;
  text: string;
  side: 'mine' | 'theirs';
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null);

export function nudgeKey(e: ChainEvent): string {
  return e.eventId ?? `${e.type}:${e.ts}:${str(e.payload.seller) ?? ''}`;
}

export function agentNudgeFor(e: ChainEvent, copy: AgentNudgesCopy): Omit<AgentNudge, 'key'> | null {
  const p = e.payload ?? {};
  const mine = (text: string) => ({ text, side: 'mine' as const });
  const theirs = (text: string) => ({ text, side: 'theirs' as const });
  switch (e.type) {
    case 'bid.submitted': {
      const amount = str(p.priceUsdc);
      if (!amount) return null;
      return theirs(fill(p.buyerChecked === true ? copy.sellerOfferedChecked : copy.sellerOffered, { amount }));
    }
    case 'counter.response.submitted': {
      if (p.accepted === true) return theirs(copy.sellerAccepted);
      const amount = str(p.counterPrice);
      return amount ? theirs(fill(copy.sellerAnswered, { amount })) : null;
    }
    case 'agent.skipped':
      return e.actor === 'seller' && Object.keys(p).length > 0 ? theirs(copy.sellerPassed) : null;
    case 'bid.scored': {
      const amount = str(p.priceUsdc);
      return amount ? mine(fill(copy.scored, { amount })) : null;
    }
    case 'counter.issued': {
      const amount = str(p.counterPriceUsdc);
      return amount ? mine(fill(copy.countered, { amount })) : null;
    }
    case 'request.shortlist': {
      const entries = Array.isArray(p.entries) ? (p.entries as Array<{ recordChecked?: boolean }>) : [];
      const count = typeof p.count === 'number' ? p.count : entries.length;
      if (count === 0) return null;
      const checked = entries.filter((x) => x?.recordChecked === true).length;
      return mine(fill(copy.shortlist, { checked, count }));
    }
    case 'deal.matched':
      return mine(copy.matched);
    case 'market.scanned':
      return Object.keys(p).length > 0 ? mine(copy.scanned) : null;
    default:
      return null;
  }
}

/// The nudges for events not seen before, in arrival order. Marks every event
/// it looks at as seen, so a nudge never repeats.
export function newNudges(events: readonly ChainEvent[], seen: Set<string>, copy: AgentNudgesCopy): AgentNudge[] {
  const out: AgentNudge[] = [];
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    const key = nudgeKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    const n = agentNudgeFor(e, copy);
    if (n) out.push({ key, ...n });
  }
  return out;
}
