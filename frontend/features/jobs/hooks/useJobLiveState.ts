'use client';
import { useMemo } from 'react';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import type { BuyerJob } from '@/core/api';
import { deriveJobLiveState } from './jobLiveStateProjection';

export function useJobLiveState(initial: BuyerJob, caller?: string) {
  // Pass the viewer as caller so the seed uses the party feed (a superset of
  // the public feed): it carries the negotiation internals the public feed
  // strips (near-miss skips, counters, agent.declined) that the terminal-state
  // detection below needs on a reload, not only live over SSE.
  const events = useLiveEvents(initial.jobId, 200, caller);

  return useMemo(() => deriveJobLiveState(initial, events), [events, initial]);
}
