import { listSignals, type Signal } from '../db/signals.js';
import { lastCoveredAt, lastSentAt, sentInMonth } from '../db/newsletter.js';
import type { SectionKey } from '../db/newsletter.js';

/// What goes in an issue, and whether there should be one at all.
///
/// The second question is the one that matters. A newsletter that goes out on a
/// schedule regardless of whether anything happened teaches people to ignore it,
/// and the fix is not better writing, it is not sending. So the default answer
/// here is no, and something has to earn a yes.

/// One good thing Karwan shipped is enough on its own. Ecosystem news is not:
/// three links to other people's announcements with nothing of ours is a link
/// roundup, and there are plenty of those.
export const ENOUGH_SHIPPED = 1;
export const ENOUGH_ECOSYSTEM = 3;

/// The floor. If a calendar month is closing with nothing sent, a short month in
/// review goes out rather than letting the list go quiet.
export const MONTH_END_DAYS = 5;

export interface Cluster {
  key: SectionKey;
  heading: string;
  signals: Signal[];
}

/// Three sections, in the order they are read.
///
/// `learned` is last and is the one with editorial weight: it is where a take
/// that is not about a specific announcement goes. A signal with a take and no
/// url is almost always this.
export function cluster(signals: Signal[]): Cluster[] {
  const shipped: Signal[] = [];
  const ecosystem: Signal[] = [];
  const learned: Signal[] = [];

  for (const signal of signals) {
    if (signal.origin === 'karwan') {
      shipped.push(signal);
      continue;
    }
    if (signal.origin === 'arc' || signal.origin === 'circle') {
      ecosystem.push(signal);
      continue;
    }
    // A manual drop with a link is news somebody found. A manual drop with no
    // link is a thought, and thoughts belong in "what we learned".
    if (signal.url) ecosystem.push(signal);
    else learned.push(signal);
  }

  const byImportance = (a: Signal, b: Signal) => {
    const rank = { high: 0, normal: 1, low: 2 } as const;
    if (rank[a.importance] !== rank[b.importance]) return rank[a.importance] - rank[b.importance];
    return b.publishedAt - a.publishedAt;
  };

  return [
    { key: 'shipped' as const, heading: 'What we shipped', signals: shipped.sort(byImportance) },
    {
      key: 'ecosystem' as const,
      heading: 'What moved on Arc and Circle',
      signals: ecosystem.sort(byImportance),
    },
    { key: 'learned' as const, heading: 'What we learned', signals: learned.sort(byImportance) },
  ].filter((c) => c.signals.length > 0);
}

export interface Decision {
  /// Whether a draft should be written now.
  draft: boolean;
  /// Why, in words a human reads in the admin panel.
  reason: string;
  /// True when the monthly floor is what triggered this.
  monthInReview: boolean;
  signals: Signal[];
  clusters: Cluster[];
  from: number;
  to: number;
  /// Set when a guardrail says no regardless of how much news there is.
  blocked?: 'kill-switch' | 'daily-cap' | 'monthly-cap';
}

export interface DecideOptions {
  now?: Date;
  /// Set false by the kill switch env flag.
  enabled?: boolean;
  /// Ignore the caps and the thresholds. For a dry run, which renders without
  /// sending and so cannot spend anyone's attention.
  force?: boolean;
  maxPerMonth?: number;
  minHoursBetweenSends?: number;
}

function daysLeftInMonth(now: Date): number {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return (end - now.getTime()) / 86_400_000;
}

/// Should there be an issue, and what would go in it.
///
/// Ordering matters here. The hard guardrails are checked before the news
/// thresholds, so a cap that has been hit reports itself as a cap rather than
/// as a quiet week. Those two look identical in the admin panel otherwise, and
/// one of them is a bug and the other is not.
export async function decide(options: DecideOptions = {}): Promise<Decision> {
  const now = options.now ?? new Date();
  const to = now.getTime();
  const from = (await lastCoveredAt()) ?? 0;

  const signals = await listSignals({ since: from });
  const clusters = cluster(signals);
  const base = { signals, clusters, from, to, monthInReview: false };

  if (options.enabled === false) {
    return { ...base, draft: false, reason: 'The newsletter is switched off.', blocked: 'kill-switch' };
  }

  if (!options.force) {
    const minHours = options.minHoursBetweenSends ?? 24;
    const sentAt = await lastSentAt();
    if (sentAt && to - sentAt < minHours * 3_600_000) {
      const hours = Math.ceil((minHours * 3_600_000 - (to - sentAt)) / 3_600_000);
      return {
        ...base,
        draft: false,
        reason: `An issue went out in the last ${minHours} hours. Next one in about ${hours}h.`,
        blocked: 'daily-cap',
      };
    }

    const maxPerMonth = options.maxPerMonth ?? 2;
    const thisMonth = await sentInMonth(now);
    if (thisMonth.length >= maxPerMonth) {
      return {
        ...base,
        draft: false,
        reason: `${thisMonth.length} issues already went out this month, which is the cap.`,
        blocked: 'monthly-cap',
      };
    }
  }

  const shipped = clusters.find((c) => c.key === 'shipped')?.signals.length ?? 0;
  const ecosystem = clusters.find((c) => c.key === 'ecosystem')?.signals.length ?? 0;

  if (options.force) {
    return {
      ...base,
      draft: signals.length > 0,
      reason: signals.length > 0 ? 'Forced.' : 'Nothing in the pipeline to draft from.',
    };
  }

  if (shipped >= ENOUGH_SHIPPED) {
    return { ...base, draft: true, reason: `Karwan shipped ${shipped} thing(s) worth telling people about.` };
  }
  if (ecosystem >= ENOUGH_ECOSYSTEM) {
    return { ...base, draft: true, reason: `${ecosystem} things moved on Arc and Circle.` };
  }

  // The floor. Only near the end of a month, only if nothing went out, and only
  // if there is something to say at all. An empty month in review is worse than
  // silence.
  const monthEnding = daysLeftInMonth(now) <= MONTH_END_DAYS;
  const nothingSentThisMonth = (await sentInMonth(now)).length === 0;
  if (monthEnding && nothingSentThisMonth && signals.length > 0) {
    return {
      ...base,
      draft: true,
      monthInReview: true,
      reason: 'The month is closing with nothing sent, so this is a short month in review.',
    };
  }

  return {
    ...base,
    draft: false,
    reason:
      signals.length === 0
        ? 'Nothing new in the pipeline.'
        : `Only ${signals.length} signal(s), and none of them ours. Not enough for an issue.`,
  };
}
