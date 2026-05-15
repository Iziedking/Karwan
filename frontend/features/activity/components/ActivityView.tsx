'use client';
import { useMemo, useState } from 'react';
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
  const events = useLiveEvents(undefined, 200);

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
