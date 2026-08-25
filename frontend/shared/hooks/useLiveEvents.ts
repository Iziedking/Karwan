'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type ChainEvent } from '@/core/api';
import { subscribeLiveEvents, subscribeLiveStatus } from '@/shared/utils/liveEventBus';

/// Did the server hand this event over in full, or as a pulse?
///
/// The live stream is projected per session by `projectFor` in
/// backend/src/routes/events.ts: full detail for what it proved the caller
/// owns, and `{ type, actor, ts, payload: {} }` for everything else. A pulse
/// carries no jobId and no payload, so detail present IS the server's answer
/// and there is nothing for the browser to decide.
///
/// This replaced a client-side rescan of buyer/seller/postedBy payload keys.
/// That scan was a second, narrower guess at a question the server had already
/// answered, and it had no key at all for money that moves outside a deal (a
/// bridge, a top up, a stake, a yield claim), so those were dropped here after
/// the backend had granted them. They appeared on refresh, from the backfill,
/// and never live.
function hasServerDetail(event: ChainEvent): boolean {
  return !!event.jobId || Object.keys(event.payload ?? {}).length > 0;
}

/// Event types that are plumbing, not history, and never belong on a timeline.
///
/// These are recorded on purpose (an inbound Circle webhook, a crashed handler,
/// a support reply, a chat message) and the assistant and admin surfaces read
/// them. What they are not is a thing that happened to the user's deal, so a row
/// reading "Circle webhook" or "System error" between two settlement steps only
/// makes the timeline harder to trust. The label fallback renders them
/// faithfully, which is precisely the problem: the fix is not nicer copy.
///
/// Filtered HERE rather than in EventList because callers count and paginate
/// before rendering. Dropping rows at render time would leave "1-20 of 200"
/// disagreeing with the twenty rows actually on screen.
///
/// Nothing is lost: the global /activity feed already omits these server-side
/// (they are absent from PUBLIC_EVENT_TYPES in routes/activity.ts), so this
/// closes the party-scoped path that still let them through.
const HIDDEN_FROM_TIMELINE = new Set<string>([
  'circle.webhook',
  'system.error',
  'chat.message',
  'support.reply',
]);

function isTimelineEvent(event: ChainEvent): boolean {
  return !HIDDEN_FROM_TIMELINE.has(event.type);
}

function eventIdentity(event: ChainEvent): string {
  return event.eventId ?? `${event.type}|${event.jobId ?? ''}|${event.actor}|${event.ts}`;
}

function preferDetailedEvent(a: ChainEvent, b: ChainEvent): ChainEvent {
  if (hasServerDetail(a) === hasServerDetail(b)) return a;
  return hasServerDetail(a) ? a : b;
}

export function mergeLiveEvents(
  current: readonly ChainEvent[],
  incoming: readonly ChainEvent[],
  max = 100,
): ChainEvent[] {
  const byId = new Map<string, ChainEvent>();
  for (const event of [...incoming, ...current]) {
    const key = eventIdentity(event);
    const prior = byId.get(key);
    byId.set(key, prior ? preferDetailedEvent(prior, event) : event);
  }
  return [...byId.values()]
    .sort((a, b) => {
      if (
        a.dealRoomId &&
        a.dealRoomId === b.dealRoomId &&
        a.sequence != null &&
        b.sequence != null
      ) {
        return b.sequence - a.sequence;
      }
      return b.ts - a.ts;
    })
    .slice(0, Math.max(1, max));
}

export type LiveEventsStatus = 'loading' | 'ready' | 'error';

export interface LiveEventsState {
  events: ChainEvent[];
  status: LiveEventsStatus;
}

interface ReplayPage {
  currentSequence: number;
  events: ChainEvent[];
}

export async function collectReplayPages(
  afterSequence: number,
  loadPage: (cursor: number) => Promise<ReplayPage>,
  maxPages = 20,
): Promise<ChainEvent[]> {
  let cursor = Math.max(0, Math.floor(afterSequence) || 0);
  const collected: ChainEvent[] = [];
  for (let pageNumber = 0; pageNumber < Math.max(1, maxPages); pageNumber += 1) {
    const page = await loadPage(cursor);
    collected.push(...page.events);
    const nextCursor = page.events.reduce(
      (highest, event) => Math.max(highest, event.sequence ?? cursor),
      cursor,
    );
    if (nextCursor <= cursor || nextCursor >= page.currentSequence) break;
    cursor = nextCursor;
  }
  return collected;
}

export function useLiveEventsState(
  filterJobId?: string,
  max = 100,
  caller?: string,
  retryKey = 0,
): LiveEventsState {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const eventsRef = useRef<ChainEvent[]>([]);
  const [status, setStatus] = useState<LiveEventsStatus>('loading');
  const callerLower = caller?.toLowerCase();
  const scopeKey = `${filterJobId ?? '*'}|${callerLower ?? 'public'}`;
  const scopeRef = useRef(scopeKey);

  useEffect(() => {
    let active = true;
    if (scopeRef.current !== scopeKey) {
      scopeRef.current = scopeKey;
      eventsRef.current = [];
      setEvents([]);
    }
    setStatus('loading');
    api
      .activity(max, filterJobId, caller)
      .then(({ events: raw }) => {
        if (!active) return;
        setEvents((current) => {
          const next = mergeLiveEvents(current, raw.filter(isTimelineEvent), max);
          eventsRef.current = next;
          return next;
        });
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [filterJobId, max, caller, retryKey, scopeKey]);

  useEffect(() => {
    return subscribeLiveEvents((parsed) => {
      // Dropped before the scope checks below so a webhook can never be the row
      // that lands on a timeline mid-session.
      if (!isTimelineEvent(parsed)) return;
      if (filterJobId) {
        // Per-job pages trust the server-side session scoping: non-party events
        // arrive as pulses with NO jobId, so a jobId match here already means
        // the backend granted this caller full detail for this job. Re-checking
        // party keys client-side would drop live auction events, whose payloads
        // carry agent addresses rather than the signed-in identity.
        if (parsed.jobId !== filterJobId) return;
      } else if (callerLower) {
        // Personal feed: keep what the server projected in full, drop the
        // pulses it sent for everybody else's activity. Same trust as the
        // per-job branch above, and the only test that covers a deal event and
        // a bare money movement alike.
        if (!hasServerDetail(parsed)) return;
      }
      setEvents((current) => {
        const next = mergeLiveEvents(current, [parsed], max);
        eventsRef.current = next;
        return next;
      });
    });
  }, [filterJobId, max, callerLower]);

  useEffect(() => {
    if (!filterJobId) return;
    let prior: string | null = null;
    let generation = 0;
    let active = true;
    const unsubscribe = subscribeLiveStatus((nextStatus) => {
      const reconnecting = nextStatus === 'live' && prior !== 'live';
      prior = nextStatus;
      if (!reconnecting) return;
      const requestGeneration = ++generation;
      const afterSequence = eventsRef.current.reduce(
        (highest, event) => Math.max(highest, event.sequence ?? 0),
        0,
      );
      void collectReplayPages(
        afterSequence,
        (cursor) => api.replayJobEvents(filterJobId, cursor),
      )
        .then((missing) => {
          if (!active || requestGeneration !== generation) return;
          setEvents((current) => {
            const next = mergeLiveEvents(current, missing.filter(isTimelineEvent), max);
            eventsRef.current = next;
            return next;
          });
        })
        .catch(() => {
          // The current feed remains usable when V2 replay is unavailable.
        });
    });
    return () => {
      active = false;
      generation += 1;
      unsubscribe();
    };
  }, [filterJobId, max]);

  return { events, status };
}

export function useLiveEvents(filterJobId?: string, max = 100, caller?: string) {
  const { events } = useLiveEventsState(filterJobId, max, caller);
  return events;
}
