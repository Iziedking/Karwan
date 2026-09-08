'use client';
import type { GroupCounts, EventGroup } from '../types';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function ActivityStats({
  counts,
  activeGroups,
  onToggleGroup,
  /// How many events these counters were computed from. They count a sliding
  /// WINDOW of recent network events, not all-time totals, so the split moves
  /// as new events arrive and older ones fall out of the window. Stating the
  /// window is what makes a number that changes an honest number rather than a
  /// total that appears to wobble.
  windowSize,
}: {
  counts: GroupCounts;
  activeGroups: Set<EventGroup>;
  onToggleGroup: (g: EventGroup) => void;
  windowSize: number;
}) {
  const t = useTranslations().activity.stats;
  const groups: EventGroup[] = ['jobs', 'negotiation', 'settlement', 'bridge'];
  return (
    <section className="space-y-3" data-guide="activity-stats">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-[var(--lp-text-sub)]">
          Recent Karwan activity
        </span>
        <span className="text-[12px] tabular-nums text-[var(--lp-text-muted)]">
          {t.window.replace('{n}', String(windowSize))}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {groups.map((g) => {
        const active = activeGroups.has(g);
        return (
          <button
            key={g}
            type="button"
            onClick={() => onToggleGroup(g)}
            aria-pressed={active}
            className="group min-h-[76px] rounded-[14px] border p-3.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
            style={{
              background: active ? 'var(--lp-control-active-bg)' : 'var(--lp-card)',
              color: active ? 'var(--lp-control-active-ink)' : 'var(--lp-dark)',
              borderColor: active ? 'var(--lp-control-active-border)' : 'var(--lp-border-light)',
            }}
          >
            <p className="text-[12px] font-semibold text-[var(--lp-text-sub)]">{t.groups[g]}</p>
            <p className="mt-2 text-[26px] font-extrabold tabular-nums leading-none tracking-[-0.03em]">
              {counts[g]}
            </p>
          </button>
        );
      })}
      </div>
    </section>
  );
}
