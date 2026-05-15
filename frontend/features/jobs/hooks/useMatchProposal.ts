'use client';
import { useEffect, useState } from 'react';
import { api, type MatchProposal } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

const REFRESH_TRIGGERS = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'escrow.funded',
]);

export function useMatchProposal(jobId: string) {
  const [proposal, setProposal] = useState<MatchProposal | null>(null);
  const events = useLiveEvents(jobId, 30);

  useEffect(() => {
    let cancelled = false;
    api
      .matchProposal(jobId)
      .then((r) => {
        if (!cancelled) setProposal(r.proposal);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    const latest = events[0];
    if (!latest || !REFRESH_TRIGGERS.has(latest.type)) return;
    const t = setTimeout(() => {
      api.matchProposal(jobId).then((r) => setProposal(r.proposal)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [events, jobId]);

  return { proposal, refresh: () => api.matchProposal(jobId).then((r) => setProposal(r.proposal)) };
}
