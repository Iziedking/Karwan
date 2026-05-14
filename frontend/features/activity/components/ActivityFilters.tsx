'use client';
import type { ActorFilter } from '../types';
import { ACTOR_LABELS } from '../types';

export function ActivityFilters({
  activeActors,
  onToggleActor,
  jobIdSearch,
  onJobIdSearch,
  onClear,
  hasAnyFilter,
}: {
  activeActors: Set<ActorFilter>;
  onToggleActor: (a: ActorFilter) => void;
  jobIdSearch: string;
  onJobIdSearch: (v: string) => void;
  onClear: () => void;
  hasAnyFilter: boolean;
}) {
  const actors: ActorFilter[] = ['buyer', 'seller', 'system'];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)]">
        {actors.map((a) => {
          const active = activeActors.has(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => onToggleActor(a)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-tight transition-all ${
                active
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-[0_1px_2px_rgba(12,14,16,0.06),0_1px_0_rgba(255,255,255,0.7)_inset] border border-[var(--color-line)]'
                  : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] font-medium border border-transparent'
              }`}
            >
              {active && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--color-accent)' }}
                />
              )}
              {ACTOR_LABELS[a]}
            </button>
          );
        })}
      </div>

      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={jobIdSearch}
          onChange={(e) => onJobIdSearch(e.target.value)}
          placeholder="Filter by job id…"
          className="w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] pl-7 pr-7 py-1.5 text-[11px] mono focus:outline-none focus:border-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] placeholder:normal-case"
        />
        {jobIdSearch && (
          <button
            type="button"
            onClick={() => onJobIdSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            aria-label="Clear"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {hasAnyFilter && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] underline decoration-dotted underline-offset-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
