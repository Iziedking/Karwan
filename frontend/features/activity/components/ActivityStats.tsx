'use client';
import type { GroupCounts, EventGroup } from '../types';
import { GROUP_LABELS } from '../types';

const GROUP_ACCENTS: Record<EventGroup, string> = {
  jobs:        'var(--color-ink)',
  negotiation: 'var(--color-accent)',
  settlement:  'var(--color-positive)',
  bridge:      '#0E5E3E',
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
    <div className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden">
      {groups.map((g, i) => {
        const active = activeGroups.has(g);
        return (
          <button
            key={g}
            type="button"
            onClick={() => onToggleGroup(g)}
            className={`relative text-left px-5 py-4 transition-all ${
              i < groups.length - 1 ? 'md:border-r border-[var(--color-line)]' : ''
            } ${i < 2 ? 'border-b md:border-b-0 border-[var(--color-line)]' : ''} ${
              active
                ? 'bg-[var(--color-surface-2)]'
                : 'hover:bg-[var(--color-surface-2)]/60'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">{GROUP_LABELS[g]}</p>
              <span
                className="inline-flex w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: GROUP_ACCENTS[g], opacity: active ? 1 : 0.4 }}
              />
            </div>
            <p
              className="text-[34px] font-medium tabular-nums tracking-tight leading-none mt-2"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {counts[g]}
            </p>
            <p className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] mt-1.5">
              {active ? 'filtering' : 'events'}
            </p>
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-5 bottom-0 h-[2px] rounded-full"
                style={{ background: GROUP_ACCENTS[g] }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
