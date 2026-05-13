'use client';
import { useMemo } from 'react';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import type { BuyerJob, ChainEvent } from '@/core/api';
import type { StepKey } from '../components/FlowStepper';

const stageMap: Record<string, StepKey> = {
  'job.tracked': 'posted',
  'job.posted': 'posted',
  'bid.scored': 'bidding',
  'bid.submitted': 'bidding',
  'counter.issued': 'counter',
  'counter.response.submitted': 'counter',
  'bid.accepted': 'accepted',
  'escrow.approved': 'escrow',
  'escrow.funded': 'escrow',
  'escrow.milestone.released': 'milestones',
  'escrow.settled': 'settled',
};

const order: StepKey[] = ['posted', 'bidding', 'counter', 'accepted', 'escrow', 'milestones', 'settled'];

export function useJobLiveState(initial: BuyerJob): {
  events: ChainEvent[];
  active: StepKey;
  completed: StepKey[];
} {
  const events = useLiveEvents(initial.jobId, 200);

  return useMemo(() => {
    const seen = new Set<StepKey>();
    let highest: StepKey = computeInitialStage(initial);
    if (initial.bids.length > 0) seen.add('bidding');
    if (initial.finalized) {
      seen.add('accepted');
      seen.add('counter');
    }
    if (initial.escrowFunded) seen.add('escrow');

    for (const e of [...events].reverse()) {
      const s = stageMap[e.type];
      if (!s) continue;
      seen.add(s);
      if (order.indexOf(s) >= order.indexOf(highest)) highest = s;
    }

    const activeIndex = order.indexOf(highest);
    const completed = order.slice(0, activeIndex).filter((k) => seen.has(k) || order.indexOf(k) < activeIndex);

    return { events, active: highest, completed };
  }, [events, initial]);
}

function computeInitialStage(j: BuyerJob): StepKey {
  if (j.escrowFunded) return 'escrow';
  if (j.finalized) return 'accepted';
  if (j.bids.length > 0) return Object.keys(j.lastCounterPriceBySeller).length > 0 ? 'counter' : 'bidding';
  return 'posted';
}
