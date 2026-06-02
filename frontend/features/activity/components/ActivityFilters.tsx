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
      <div
        className="inline-flex items-center gap-1 p-1"
        style={{
          background: 'var(--lp-light)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 9,
          borderTopRightRadius: 9,
          borderBottomLeftRadius: 9,
          borderBottomRightRadius: 2,
        }}
      >
        {actors.map((a) => {
          const active = activeActors.has(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => onToggleActor(a)}
              aria-pressed={active}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
              style={{
                background: active ? 'var(--lp-card)' : 'transparent',
                color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
                border: active ? '1px solid var(--lp-border-light)' : '1px solid transparent',
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                borderBottomLeftRadius: 7,
                borderBottomRightRadius: 2,
                boxShadow: active ? '0 1px 0 rgba(0,0,0,0.04)' : 'none',
              }}
            >
              {active && (
                <span
                  aria-hidden
                  className="inline-block w-[6px] h-[6px]"
                  style={{ background: 'var(--lp-accent)' }}
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
          className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--lp-text-muted)]"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={jobIdSearch}
          onChange={(e) => onJobIdSearch(e.target.value)}
          placeholder="Filter by job id…"
          className="activity-search w-full bg-[var(--lp-card)] ps-8 pe-8 py-2 text-[12px] mono tabular-nums focus:outline-none transition-shadow placeholder:text-[var(--lp-text-sub)] placeholder:normal-case text-[var(--lp-dark)]"
          style={{
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 9,
            borderTopRightRadius: 9,
            borderBottomLeftRadius: 9,
            borderBottomRightRadius: 2,
          }}
        />
        {jobIdSearch && (
          <button
            type="button"
            onClick={() => onJobIdSearch('')}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
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
        <style jsx>{`
          .activity-search:focus {
            border-color: var(--lp-dark);
            box-shadow: 0 0 0 3px rgba(175, 201, 91, 0.25);
          }
        `}</style>
      </div>

      {hasAnyFilter && (
        <button
          type="button"
          onClick={onClear}
          className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
