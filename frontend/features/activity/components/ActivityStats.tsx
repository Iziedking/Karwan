'use client';
import type { GroupCounts, EventGroup } from '../types';
import { cn } from '@/shared/utils/cn';
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
      {/* The counters lead the page, and the money ledger sits below them. The
          eyebrow is what stops them reading as a summary of that ledger: they
          count the network's events, never the user's own money. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:{t.eyebrow}:]
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--lp-text-muted)]">
          {t.window.replace('{n}', String(windowSize))}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {groups.map((g, i) => {
        const active = activeGroups.has(g);
        return (
          <button
            key={g}
            type="button"
            onClick={() => onToggleGroup(g)}
            aria-pressed={active}
            className={cn(
              'group relative overflow-hidden text-start p-5 transition-[transform,border-color,box-shadow] duration-300 ease-out',
              'hover:-translate-y-1 card-shimmer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-band-dark)] focus-visible:ring-offset-2',
              `fade-up fade-up-${i + 1}`,
            )}
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-band-dark)',
              border: active ? '1px solid rgba(14,14,14,0.62)' : '1px solid rgba(14,14,14,0.14)',
              boxShadow: active
                ? '0 0 0 1px rgba(14,14,14,0.62), 0 12px 32px -16px rgba(0,0,0,0.35)'
                : '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.18)',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 4,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 mono text-[9px] uppercase tracking-[0.12em] font-medium text-[var(--lp-band-dark)]/65 sm:text-[10px] sm:tracking-[0.18em]">
                {t.groups[g]}
              </p>
              <span
                aria-hidden
                data-instrument-blink={active || undefined}
                className="block w-[7px] h-[7px]"
                style={{
                  background: 'var(--lp-band-dark)',
                  opacity: active ? 1 : 0.42,
                  animation: active ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
                }}
              />
            </div>
            <p className="mt-4 font-sans text-[clamp(2.25rem,4vw,3rem)] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-[var(--lp-band-dark)]">
              {counts[g]}
            </p>
            <p className="mt-2 mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-band-dark)]/65">
              {active ? t.filtering : t.events}
            </p>
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ background: 'var(--lp-band-dark)' }}
              />
            )}
          </button>
        );
      })}
      </div>
    </section>
  );
}
