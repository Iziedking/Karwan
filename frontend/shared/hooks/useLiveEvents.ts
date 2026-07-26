'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type ChainEvent } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

// Identifying-party keys on the event payload. The client-side filter mirrors
// the server-side filter in routes/activity.ts so live SSE events for a job
// the caller is a party to also pass through, even if the event's payload
// itself doesn't restate buyer/seller (e.g. follow-up escrow.* events).
const PARTY_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy'];

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

function isPartyMatch(event: ChainEvent, caller: string): boolean {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload) return false;
  for (const k of PARTY_KEYS) {
    const v = payload[k];
    if (typeof v === 'string' && v.toLowerCase() === caller) return true;
  }
  return false;
}

export function useLiveEvents(filterJobId?: string, max = 100, caller?: string) {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  // Track jobIds the caller is a party to (learned from backfill + live events),
  // so follow-up events on those jobs pass the client-side filter.
  const callerJobsRef = useRef<Set<string>>(new Set());
  const callerLower = caller?.toLowerCase();

  useEffect(() => {
    callerJobsRef.current = new Set();
    api
      .activity(max, filterJobId, caller)
      .then(({ events: raw }) => {
        // Party tracking still learns from the plumbing rows before they are
        // dropped: they carry jobIds the caller is genuinely a party to, and
        // discarding them first would narrow the live filter below.
        const events = raw.filter(isTimelineEvent);
        if (callerLower) {
          // The caller-scoped backfill is filtered server-side by the signed
          // session and returns only the caller's own events, so every jobId in
          // it is a job the caller is a party to. Payload matching alone would
          // miss auction events, which carry agent addresses.
          for (const e of raw) {
            if (e.jobId) callerJobsRef.current.add(e.jobId.toLowerCase());
          }
        }
        setEvents(events);
      })
      .catch(() => {});
  }, [filterJobId, max, caller, callerLower]);

  useEffect(() => {
    return subscribeLiveEvents((parsed) => {
      // Dropped before the party checks below so a webhook can never be the row
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
        const tracked = parsed.jobId
          ? callerJobsRef.current.has(parsed.jobId.toLowerCase())
          : false;
        const party = isPartyMatch(parsed, callerLower);
        if (!tracked && !party) return;
        if (party && parsed.jobId) {
          callerJobsRef.current.add(parsed.jobId.toLowerCase());
        }
      }
      setEvents((prev) => [parsed, ...prev].slice(0, max));
    });
  }, [filterJobId, max, callerLower]);

  return events;
}
