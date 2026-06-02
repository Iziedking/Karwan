'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type BuyerJob } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

const REFRESH_TRIGGERS = new Set([
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
]);

export function useJobSnapshot(initial: BuyerJob) {
  const [job, setJob] = useState<BuyerJob>(initial);
  const events = useLiveEvents(initial.jobId, 80);
  const lastFetchedTsRef = useRef(0);

  useEffect(() => {
    const latest = events[0];
    if (!latest || !REFRESH_TRIGGERS.has(latest.type)) return;
    if (latest.ts <= lastFetchedTsRef.current) return;
    lastFetchedTsRef.current = latest.ts;
    const t = setTimeout(() => {
      api.job(initial.jobId).then(setJob).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [events, initial.jobId]);

  /// Force a fresh fetch from the backend. Caller-triggered (eg after the
  /// buyer edits the brief text, since the edit does not fire one of the
  /// REFRESH_TRIGGERS events).
  async function refresh(): Promise<void> {
    try {
      const next = await api.job(initial.jobId);
      setJob(next);
    } catch {
      // Stay on the last good snapshot if the fetch fails.
    }
  }

  return { job, events, refresh };
}
