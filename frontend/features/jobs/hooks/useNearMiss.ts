'use client';
import { useEffect, useState } from 'react';
import { api, type NearMissApproval } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

const REFRESH_TRIGGERS = new Set([
  'negotiation.near-miss',
  'negotiation.near-miss.proceeded',
  'negotiation.near-miss.declined',
  'deal.matched',
  'deal.match.approved',
  'escrow.funded',
]);

export function useNearMiss(jobId: string) {
  const { address } = useAuth();
  const [nearMiss, setNearMiss] = useState<NearMissApproval | null>(null);
  const events = useLiveEvents(jobId, 30);

  const fetchOne = () =>
    api
      .nearMiss(jobId, address)
      .then((r) => setNearMiss(r.nearMiss))
      .catch(() => {});

  useEffect(() => {
    let cancelled = false;
    api
      .nearMiss(jobId, address)
      .then((r) => {
        if (!cancelled) setNearMiss(r.nearMiss);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId, address]);

  useEffect(() => {
    const latest = events[0];
    if (!latest || !REFRESH_TRIGGERS.has(latest.type)) return;
    const t = setTimeout(fetchOne, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, jobId, address]);

  return { nearMiss, refresh: fetchOne };
}
