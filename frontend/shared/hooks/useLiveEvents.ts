'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type ChainEvent } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

// Identifying-party keys on the event payload. The client-side filter mirrors
// the server-side filter in routes/activity.ts so live SSE events for a job
// the caller is a party to also pass through, even if the event's payload
// itself doesn't restate buyer/seller (e.g. follow-up escrow.* events).
const PARTY_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy'];

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
      .then(({ events }) => {
        if (callerLower) {
          for (const e of events) {
            if (e.jobId && isPartyMatch(e, callerLower)) {
              callerJobsRef.current.add(e.jobId.toLowerCase());
            }
          }
        }
        setEvents(events);
      })
      .catch(() => {});
  }, [filterJobId, max, caller, callerLower]);

  useEffect(() => {
    return subscribeLiveEvents((parsed) => {
      if (filterJobId && parsed.jobId !== filterJobId) return;
      if (callerLower) {
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
