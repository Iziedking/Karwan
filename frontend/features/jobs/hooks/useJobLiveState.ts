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
  declined: boolean;
} {
  const events = useLiveEvents(initial.jobId, 200);

  return useMemo(() => {
    const seen = new Set<StepKey>();
    let highest: StepKey = computeInitialStage(initial);
    let declined = false;
    if (initial.bids.length > 0) seen.add('bidding');
    if (initial.escrowFunded) {
      seen.add('escrow');
      seen.add('accepted');
    }

    for (const e of [...events].reverse()) {
      if (e.type === 'agent.declined' || e.type === 'deal.match.declined') {
        declined = true;
        continue;
      }
      const s = stageMap[e.type];
      if (!s) continue;
      seen.add(s);
      if (order.indexOf(s) >= order.indexOf(highest)) highest = s;
    }

    // If the agent declined and we haven't reached escrow, cap progression at
    // the negotiating step. finalized=true alone is NOT enough to advance to
    // 'accepted' — the agent finalizes on both accept and decline paths.
    if (declined && order.indexOf(highest) < order.indexOf('escrow')) {
      highest = 'counter';
    }

    const activeIndex = order.indexOf(highest);
    const completed = order.slice(0, activeIndex).filter((k) => seen.has(k) || order.indexOf(k) < activeIndex);

    return { events, active: highest, completed, declined };
  }, [events, initial]);
}

function computeInitialStage(j: BuyerJob): StepKey {
  if (j.escrowFunded) return 'escrow';
  // finalized without escrowFunded could be either accept-pending-approval or
  // decline — we stay at 'counter' until events tell us which.
  if (j.bids.length > 0) return Object.keys(j.lastCounterPriceBySeller).length > 0 ? 'counter' : 'bidding';
  return 'posted';
}
