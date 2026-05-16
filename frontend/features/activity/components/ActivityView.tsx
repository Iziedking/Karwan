'use client';
import { useMemo, useState } from 'react';
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

export function ActivityView({ explorer }: { explorer: string }) {
  const auth = useAuth();
  const address = auth.address ?? undefined;
  const isAuthed = auth.isAuthenticated;
  // Scope to the signed-in identity. only events the user is a party to.
  const events = useLiveEvents(undefined, 200, address);

  // Hard gate: never render the activity stream when not signed in. there is
  // nothing to scope to and the global stream would leak other users' events.
  if (!isAuthed || !address) {
    return (
      <div className="py-12 text-center space-y-2.5 max-w-[48ch] mx-auto">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          NOT CONNECTED
        </p>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          Connect your wallet to see the events your deals have triggered. This stream is scoped
          to your wallet. you won&apos;t see other users&apos; activity.
        </p>
      </div>
    );
  }

  const [groups, setGroups] = useState<Set<EventGroup>>(new Set());
  const [actors, setActors] = useState<Set<ActorFilter>>(new Set());
  const [jobIdSearch, setJobIdSearch] = useState('');

  const filters: Filters = useMemo(
    () => ({ groups, actors, jobIdSearch }),
    [groups, actors, jobIdSearch],
  );
  const filtered = useMemo(() => applyFilters(events, filters), [events, filters]);
  const counts = useMemo(() => countByGroup(events), [events]);

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

      <div className="flex items-baseline justify-between gap-3 pt-2">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:EVENT STREAM:]
        </span>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {filtered.length} {filtered.length === 1 ? 'EVENT' : 'EVENTS'}
          {hasAnyFilter && events.length > filtered.length && (
            <span> · {events.length - filtered.length} HIDDEN</span>
          )}
        </p>
      </div>

      <EventList events={filtered} explorer={explorer} showJobId variant="card" />
    </div>
  );
}
