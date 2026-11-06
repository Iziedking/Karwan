import type { DirectDeal } from '@/core/api';
import { dealSteps, type DealStep } from './workspace/dealSteps';

/// The deal's route (view 48). A deal still moving shows its stops from the
/// step model; one that has stopped moving forward shows a status line instead,
/// so a disputed or refunded deal never looks like it is on its way.

export type RouteStatus = 'disputed' | 'cancelled' | 'refunding' | 'refunded' | 'paidToSeller' | 'split';
export type DealRouteView = { kind: 'route'; stops: DealStep[] } | { kind: 'status'; status: RouteStatus };

const paidInOf = (deal: DirectDeal) => !!deal.acceptedAt || !!deal.fundTxHash;

export function dealRoute(deal: DirectDeal): DealRouteView {
  if (deal.cancelKind === 'resolved') return { kind: 'status', status: 'split' };
  if (deal.cancelledAt || deal.onChain?.state === 5) {
    if (deal.cancelKind === 'release-from-dispute') return { kind: 'status', status: 'paidToSeller' };
    if (!paidInOf(deal)) return { kind: 'status', status: 'cancelled' };
    return { kind: 'status', status: deal.onChain?.state === 5 ? 'refunded' : 'refunding' };
  }
  if (!deal.settledAt && (deal.dispute?.open || deal.disputed)) return { kind: 'status', status: 'disputed' };
  return { kind: 'route', stops: dealSteps(deal) };
}

export type RouteMark = 'passed' | 'here' | 'next';
export type RouteLine = 'travelled' | 'ahead';
export interface RouteTrackStop {
  mark: RouteMark;
  lineBefore: RouteLine | null;
  lineAfter: RouteLine | null;
  align: 'start' | 'center' | 'end';
}

/// How each stop is drawn. A reached stop's incoming line is travelled; the
/// current stop is a ring; a finished route ends on a ring at its last stop.
export function routeTrack<T extends { state: 'done' | 'current' | 'upcoming' }>(
  steps: ReadonlyArray<T>,
  { finished = steps.length > 0 && steps.every((s) => s.state === 'done') }: { finished?: boolean } = {},
): RouteTrackStop[] {
  const reached = (i: number) => steps[i]?.state !== 'upcoming';
  const last = steps.length - 1;
  return steps.map((step, i) => ({
    mark: step.state === 'current' || (finished && i === last) ? 'here' : step.state === 'done' ? 'passed' : 'next',
    lineBefore: i === 0 ? null : reached(i) ? 'travelled' : 'ahead',
    lineAfter: i === last ? null : reached(i + 1) ? 'travelled' : 'ahead',
    align: i === 0 ? 'start' : i === last ? 'end' : 'center',
  }));
}
