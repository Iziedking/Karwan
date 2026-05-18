'use client';
import type { GroupCounts, EventGroup } from '../types';
import { GROUP_LABELS } from '../types';
import { cn } from '@/shared/utils/cn';

const GROUP_TINT: Record<EventGroup, string> = {
  jobs: 'rgba(255,255,255,0.55)',
  negotiation: 'var(--lp-accent)',
  settlement: '#7fffb4',
  bridge: '#9ad7ff',
};

export function ActivityStats({
  counts,
  activeGroups,
  onToggleGroup,
}: {
  counts: GroupCounts;
  activeGroups: Set<EventGroup>;
  onToggleGroup: (g: EventGroup) => void;
}) {
  const groups: EventGroup[] = ['jobs', 'negotiation', 'settlement', 'bridge'];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {groups.map((g, i) => {
        const active = activeGroups.has(g);
        return (
          <button
            key={g}
            type="button"
            onClick={() => onToggleGroup(g)}
            className={cn(
              'group relative overflow-hidden text-left p-5 transition-[transform,border-color,box-shadow] duration-300 ease-out',
              'hover:-translate-y-1 card-shimmer',
              `fade-up fade-up-${i + 1}`,
            )}
            style={{
              background: 'var(--lp-band-dark)',
              color: 'white',
              border: active ? '1px solid var(--lp-accent)' : '1px solid rgba(255,255,255,0.08)',
              boxShadow: active
                ? '0 0 0 1px var(--lp-accent), 0 12px 32px -16px rgba(0,0,0,0.45)'
                : '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.18)',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 4,
            }}
          >
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-white/55">
                {GROUP_LABELS[g]}
              </p>
              <span
                aria-hidden
                data-instrument-blink={active || undefined}
                className="block w-[7px] h-[7px]"
                style={{
                  background: GROUP_TINT[g],
                  opacity: active ? 1 : 0.45,
                  animation: active ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
                }}
              />
            </div>
            <p className="mt-4 font-sans text-[clamp(2.25rem,4vw,3rem)] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-white">
              {counts[g]}
            </p>
            <p className="mt-2 mono text-[10px] uppercase tracking-[0.16em] text-white/55">
              {active ? '↳ filtering' : 'events'}
            </p>
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ background: 'var(--lp-accent)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
