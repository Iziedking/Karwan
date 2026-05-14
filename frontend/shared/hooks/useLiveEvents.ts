'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type ChainEvent } from '@/core/api';

const TRACKED_TYPES = [
  'job.posted',
  'job.tracked',
  'bid.scored',
  'bid.submitted',
  'counter.issued',
  'counter.response.submitted',
  'bid.accepted',
  'escrow.approved',
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
  'bridge.burned',
  'bridge.attested',
  'bridge.minted',
  'bridge.error',
  'reputation.recorded',
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'deal.review.started',
  'deal.review.heartbeat',
  'deal.auto_released',
  'deal.disputed',
  'deal.cancelled',
  'agent.skipped',
  'agent.declined',
  'agent.error',
];

export function useLiveEvents(filterJobId?: string, max = 100) {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    api.activity(max, filterJobId).then(({ events }) => setEvents(events)).catch(() => {});
  }, [filterJobId, max]);

  useEffect(() => {
    const es = new EventSource(api.eventsUrl());
    esRef.current = es;

    const onMsg = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as ChainEvent;
        if (filterJobId && parsed.jobId !== filterJobId) return;
        setEvents((prev) => [parsed, ...prev].slice(0, max));
      } catch {
        /* ignore */
      }
    };
    for (const t of TRACKED_TYPES) es.addEventListener(t, onMsg);
    return () => {
      for (const t of TRACKED_TYPES) es.removeEventListener(t, onMsg);
      es.close();
    };
  }, [filterJobId, max]);

  return events;
}
