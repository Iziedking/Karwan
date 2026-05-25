'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { EventList } from '@/features/jobs/components/EventList';
import { ActivityStats } from './ActivityStats';
import { ActivityFilters } from './ActivityFilters';
import {
  applyFilters,
  countByGroup,
  type ActorFilter,
  type ActivityFilters as Filters,
  type EventGroup,
} from '../types';

const PAGE_SIZE = 20;

export function ActivityView({ explorer }: { explorer: string }) {
  const auth = useAuth();
  const address = auth.address ?? undefined;
  const isAuthed = auth.isAuthenticated;
  // Platform-wide stream: every deal moving across Karwan, not just the caller's.
  // Passing no caller returns the global feed (job IDs and prices intact, wallet
  // addresses masked). The page itself stays sign-in gated below.
  const events = useLiveEvents(undefined, 200);
  // All hooks must run unconditionally on every render. they're hoisted above
  // the not-signed-in early return so the hook order stays stable when the
  // user signs in.
  const [groups, setGroups] = useState<Set<EventGroup>>(new Set());
  const [actors, setActors] = useState<Set<ActorFilter>>(new Set());
  const [jobIdSearch, setJobIdSearch] = useState('');
  const filters: Filters = useMemo(
    () => ({ groups, actors, jobIdSearch }),
    [groups, actors, jobIdSearch],
  );
  const filtered = useMemo(() => applyFilters(events, filters), [events, filters]);
  const counts = useMemo(() => countByGroup(events), [events]);

  // Paginate so the stream doesn't grow into an endless scroll as new events
  // land. Newest first, so page 1 is always the latest activity.
  const [page, setPage] = useState(1);
  const streamTopRef = useRef<HTMLDivElement>(null);
  // Filtering changes the result set, so jump back to the first page.
  useEffect(() => {
    setPage(1);
  }, [groups, actors, jobIdSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEvents = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function goToPage(p: number) {
    setPage(p);
    // Bring the top of the stream into view so a new page starts at its head,
    // not wherever the previous page left the scroll position.
    streamTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Sign-in gate. The feed is platform-wide, but kept behind sign-in so the
  // full network log isn't exposed to anonymous crawlers.
  if (!isAuthed || !address) {
    return (
      <div className="py-12 text-center space-y-2.5 max-w-[48ch] mx-auto">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          NOT SIGNED IN
        </p>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          Sign in to watch every deal moving across Karwan. Search by job ID to follow a
          specific one.
        </p>
      </div>
    );
  }

  const hasAnyFilter = groups.size > 0 || actors.size > 0 || jobIdSearch.trim().length > 0;

  function toggleGroup(g: EventGroup) {
    setGroups((cur) => {
      const next = new Set(cur);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }
  function toggleActor(a: ActorFilter) {
    setActors((cur) => {
      const next = new Set(cur);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }
  function clearAll() {
    setGroups(new Set());
    setActors(new Set());
    setJobIdSearch('');
  }

  return (
    <div className="space-y-6">
      <ActivityStats counts={counts} activeGroups={groups} onToggleGroup={toggleGroup} />

      <ActivityFilters
        activeActors={actors}
        onToggleActor={toggleActor}
        jobIdSearch={jobIdSearch}
        onJobIdSearch={setJobIdSearch}
        onClear={clearAll}
        hasAnyFilter={hasAnyFilter}
      />

      <div
        ref={streamTopRef}
        className="flex items-baseline justify-between gap-3 pt-2 scroll-mt-24"
      >
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:EVENT STREAM:]
        </span>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {filtered.length === 0 ? (
            <>0 EVENTS</>
          ) : (
            <>
              {pageStart + 1}&ndash;{pageStart + pageEvents.length} OF {filtered.length}
            </>
          )}
          {hasAnyFilter && events.length > filtered.length && (
            <span> · {events.length - filtered.length} HIDDEN</span>
          )}
        </p>
      </div>

      <EventList events={pageEvents} explorer={explorer} showJobId variant="card" />

      <Pager page={safePage} totalPages={totalPages} onPage={goToPage} />
    </div>
  );
}

/// Numbered pager for the event stream. Windowed so a long history collapses to
/// "1 … 4 5 6 … 12" instead of a wall of numbers. Renders nothing for a single
/// page. Matches the page's mono + lime grammar.
function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const items: Array<number | 'gap'> = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
      items.push(p);
    } else if (items[items.length - 1] !== 'gap') {
      items.push('gap');
    }
  }

  const radius = {
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 2,
  } as const;

  return (
    <nav
      aria-label="Activity pages"
      className="flex flex-wrap items-center justify-center gap-1.5 pt-4"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="mono text-[11px] px-2.5 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--lp-light)]"
        style={{ borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }}
      >
        ←
      </button>

      {items.map((it, i) =>
        it === 'gap' ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="mono text-[11px] px-1 text-[var(--lp-text-muted)]"
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onPage(it)}
            aria-current={it === page ? 'page' : undefined}
            className="mono text-[11px] tabular-nums px-3 py-1.5 border transition-colors"
            style={
              it === page
                ? { background: 'var(--lp-accent)', borderColor: 'var(--lp-accent)', color: 'var(--lp-dark)', ...radius }
                : { borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }
            }
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="mono text-[11px] px-2.5 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--lp-light)]"
        style={{ borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }}
      >
        →
      </button>
    </nav>
  );
}
