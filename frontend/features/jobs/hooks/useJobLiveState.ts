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

export function useJobLiveState(initial: BuyerJob, caller?: string): {
  events: ChainEvent[];
  active: StepKey;
  completed: StepKey[];
  declined: boolean;
  /// Terminal non-success state for the flow stepper. 'declined' when the
  /// negotiation ended without agreement (agent declined, all candidates
  /// exhausted); 'expired' when the brief deadline lapsed with no match;
  /// 'out-of-reach' when the only topical match is priced far past the buyer's
  /// ceiling (no crossable seller) so the deal can never settle at this budget.
  /// null while the auction is still live or once escrow funded. Keeps the
  /// stepper from blinking forever on NEGOTIATING after the agent has stopped.
  ended: 'declined' | 'expired' | 'out-of-reach' | null;
  /// Numbers behind an 'out-of-reach' end: the closest seller's floor, the
  /// buyer's effective ceiling, and the best real price the buyer passed (when
  /// known, so the advisory can offer to reconsider it). Powers the "no match at
  /// your budget" advisory. null unless ended === 'out-of-reach'.
  outOfReach: {
    closestFloorUsdc: number;
    ceilingUsdc: number;
    passedPriceUsdc: number | null;
  } | null;
} {
  // Pass the viewer as caller so the seed uses the party feed (a superset of
  // the public feed): it carries the negotiation internals the public feed
  // strips (near-miss skips, counters, agent.declined) that the terminal-state
  // detection below needs on a reload, not only live over SSE.
  const events = useLiveEvents(initial.jobId, 200, caller);

  return useMemo(() => {
    const seen = new Set<StepKey>();
    let highest: StepKey = computeInitialStage(initial);
    let declined = false;
    // A reload of an already-expired brief carries expiredAt on the snapshot,
    // so seed the terminal state from it before any live event arrives.
    let expiredEnded = !!initial.expiredAt && !initial.escrowFunded;
    // Out-of-reach tracking: the lowest confirmed-topical seller floor that the
    // near-miss skipped as gap-too-wide, the buyer ceiling it was measured
    // against, whether the buyer has passed a near-miss, and whether anything
    // live/resolved happened after (which cancels the terminal).
    let wideFloor: number | null = null;
    let wideCeiling: number | null = null;
    let passedPrice: number | null = null;
    let nearMissPassed = false;
    let supersededByLive = false;
    if (initial.bids.length > 0) seen.add('bidding');
    if (initial.escrowFunded) {
      seen.add('escrow');
      seen.add('accepted');
    }

    for (const e of [...events].reverse()) {
      if (
        e.type === 'agent.declined' ||
        e.type === 'deal.match.declined' ||
        e.type === 'negotiation.exhausted'
      ) {
        declined = true;
        continue;
      }
      if (e.type === 'job.expired') {
        expiredEnded = true;
        continue;
      }
      // The buyer saw the best real price and passed. A new chapter begins:
      // anything that follows decides whether a cheaper seller showed up.
      if (e.type === 'negotiation.near-miss.declined') {
        nearMissPassed = true;
        supersededByLive = false;
        continue;
      }
      // A confirmed-topical match the near-miss refused as too far over budget.
      // Keep the lowest floor seen, measured against the buyer's ceiling.
      if (e.type === 'negotiation.near-miss.skipped') {
        const p = e.payload as Record<string, unknown> | undefined;
        if (p?.reason === 'gap-too-wide' && p.confirmedTopical === true) {
          const floor = Number(p.sellerFloorUsdc);
          const ceiling = Number(p.buyerCeilingUsdc);
          if (Number.isFinite(floor) && Number.isFinite(ceiling)) {
            wideFloor = wideFloor == null ? floor : Math.min(wideFloor, floor);
            wideCeiling = ceiling;
            supersededByLive = false;
          }
        }
        continue;
      }
      // Authoritative out-of-reach signal from the backend: a confirmed-topical
      // match stayed far past the ceiling after the buyer passed. Trust it
      // directly rather than reconstructing the same conclusion from the skip.
      if (e.type === 'negotiation.out-of-reach') {
        const p = e.payload as Record<string, unknown> | undefined;
        const floor = Number(p?.closestFloorUsdc);
        const ceiling = Number(p?.ceilingUsdc);
        if (Number.isFinite(floor) && Number.isFinite(ceiling)) {
          wideFloor = wideFloor == null ? floor : Math.min(wideFloor, floor);
          wideCeiling = ceiling;
          const passed = Number(p?.passedPriceUsdc);
          if (Number.isFinite(passed)) passedPrice = passed;
          nearMissPassed = true;
          supersededByLive = false;
        }
        continue;
      }
      // A pending near-miss (the asked party still has the call) or any resolved
      // outcome means the deal is not a dead end: let those surfaces own the UI.
      if (e.type === 'negotiation.near-miss' || e.type === 'bid.accepted') {
        supersededByLive = true;
      }
      const s = stageMap[e.type];
      if (!s) continue;
      seen.add(s);
      if (order.indexOf(s) >= order.indexOf(highest)) highest = s;
    }

    // Out-of-reach: a confirmed-topical seller exists but sits far past the
    // ceiling, and nothing crossable came after. Either the buyer already
    // passed the best real price (post-pass churn) or no seller ever bid (the
    // lone match was uncrossable from the start). Stays open for a cheaper
    // future seller; this only stops the spinner and explains the gap.
    const outOfReachActive =
      !initial.escrowFunded &&
      !supersededByLive &&
      wideFloor != null &&
      wideCeiling != null &&
      (nearMissPassed || initial.bids.length === 0);

    // escrow funding always wins: a funded deal is never "ended".
    const ended: 'declined' | 'expired' | 'out-of-reach' | null = initial.escrowFunded
      ? null
      : expiredEnded
        ? 'expired'
        : outOfReachActive
          ? 'out-of-reach'
          : declined
            ? 'declined'
            : null;

    // A declined or out-of-reach end caps progression at the negotiating step
    // (finalized=true alone is NOT enough to advance to 'accepted'; the agent
    // finalizes on both accept and decline paths). Expiry leaves `highest`
    // where the auction actually got to.
    if ((declined || outOfReachActive) && order.indexOf(highest) < order.indexOf('escrow')) {
      highest = 'counter';
    }

    const outOfReach =
      outOfReachActive && wideFloor != null && wideCeiling != null
        ? { closestFloorUsdc: wideFloor, ceilingUsdc: wideCeiling, passedPriceUsdc: passedPrice }
        : null;

    const activeIndex = order.indexOf(highest);
    const completed = order.slice(0, activeIndex).filter((k) => seen.has(k) || order.indexOf(k) < activeIndex);

    return { events, active: highest, completed, declined, ended, outOfReach };
  }, [events, initial]);
}

function computeInitialStage(j: BuyerJob): StepKey {
  if (j.escrowFunded) return 'escrow';
  // finalized without escrowFunded could be either accept-pending-approval or
  // decline. we stay at 'counter' until events tell us which.
  if (j.bids.length > 0) return Object.keys(j.lastCounterPriceBySeller).length > 0 ? 'counter' : 'bidding';
  return 'posted';
}
