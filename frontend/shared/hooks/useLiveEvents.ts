'use client';
import { useEffect, useState } from 'react';
import { api, type ChainEvent } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

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

export type LiveEventsStatus = 'loading' | 'ready' | 'error';

export interface LiveEventsState {
  events: ChainEvent[];
  status: LiveEventsStatus;
}

export function useLiveEventsState(
  filterJobId?: string,
  max = 100,
  caller?: string,
  retryKey = 0,
): LiveEventsState {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [status, setStatus] = useState<LiveEventsStatus>('loading');
  const callerLower = caller?.toLowerCase();

  useEffect(() => {
    setStatus('loading');
    api
      .activity(max, filterJobId, caller)
      .then(({ events: raw }) => {
        setEvents(raw.filter(isTimelineEvent));
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [filterJobId, max, caller, retryKey]);

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
      setEvents((prev) => [parsed, ...prev].slice(0, max));
    });
  }, [filterJobId, max, callerLower]);

  return { events, status };
}

export function useLiveEvents(filterJobId?: string, max = 100, caller?: string) {
  const { events } = useLiveEventsState(filterJobId, max, caller);
  return events;
}
