import type { DirectDeal } from '@/core/api';
import { stageOf, type DealStage } from './components/DirectDealList';
import { directDealNeedsViewer } from '@/features/notifications/openDealsModel';
import { dealRoute, type RouteStatus } from './dealRoute';

/// What the Deals list needs to place a row. Home and Deals both order through
/// orderDeals, so a deal sits in the same place on both.
export interface Orderable {
  yourMove: boolean;
  finished: boolean;
  dueUnix?: number | null;
  updatedAtMs: number;
}

export interface DealsGroups<T> {
  needsYou: T[];
  active: T[];
  finished: T[];
}

function byDueThenRecent(a: Orderable, b: Orderable): number {
  const da = a.dueUnix ?? Number.POSITIVE_INFINITY;
  const db = b.dueUnix ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da < db ? -1 : 1;
  return b.updatedAtMs - a.updatedAtMs;
}

export function orderDeals<T extends Orderable>(items: readonly T[]): DealsGroups<T> {
  const groups: DealsGroups<T> = { needsYou: [], active: [], finished: [] };
  for (const it of items) {
    if (it.finished) groups.finished.push(it);
    else if (it.yourMove) groups.needsYou.push(it);
    else groups.active.push(it);
  }
  groups.needsYou.sort(byDueThenRecent);
  groups.active.sort(byDueThenRecent);
  groups.finished.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return groups;
}

/// A disputed deal is active with its status line, never hidden.
export function classifyDirectDeal(
  deal: DirectDeal,
  me: string,
): { stage: DealStage; isBuyer: boolean; yourMove: boolean; finished: boolean } {
  const stage = stageOf(deal);
  const isBuyer = deal.buyer.toLowerCase() === me.toLowerCase();
  const finished = stage === 'settled' || stage === 'cancelled';
  return { stage, isBuyer, finished, yourMove: !finished && directDealNeedsViewer(stage, isBuyer) };
}

/// What Home shows of the Deals list (view 48): the first deal that needs you
/// as a card with its move, then up to three on the way, else nothing.
export function homeDealsPreview<T>(groups: DealsGroups<T>): { needsYou: T | null; needsYouCount: number; onTheWay: T[]; empty: boolean } {
  const needsYou = groups.needsYou[0] ?? null;
  const onTheWay = groups.active.slice(0, 3);
  return { needsYou, needsYouCount: groups.needsYou.length, onTheWay, empty: !needsYou && onTheWay.length === 0 };
}

export type RowMove = 'release' | 'approve' | 'pay' | 'deliver' | 'claim';

const ROW_MOVES: Partial<Record<string, RowMove>> = { release: 'release', accept: 'approve', fund: 'pay', deliver: 'deliver', claim: 'claim' };

/// The move a needs-you row carries on desktop (rule 8), in one word. A move
/// with no short name gives none, and the row still opens the deal.
export function rowMove(deal: DirectDeal): RowMove | null {
  const next = deal.view?.next;
  if (!next?.action || next.actor !== 'you') return null;
  return ROW_MOVES[next.action] ?? null;
}

export type DealState = 'yourMove' | 'active' | 'disputed' | 'paidOut' | 'cancelled' | 'refunding' | 'refunded' | 'split' | 'ended';

const ROUTE_STATE: Record<RouteStatus, DealState> = {
  disputed: 'disputed',
  cancelled: 'cancelled',
  refunding: 'refunding',
  refunded: 'refunded',
  paidToSeller: 'paidOut',
  split: 'split',
};

/// The pill on a deal in a list: where it stands at a glance. A dispute shows
/// over the move, and an ended deal says how it ended.
export function dealState({ yourMove, finished, deal }: { yourMove: boolean; finished: boolean; deal?: DirectDeal }): DealState {
  if (deal) {
    const route = dealRoute(deal);
    if (route.kind === 'status') return ROUTE_STATE[route.status];
    if (deal.settledAt || finished) return 'paidOut';
  } else if (finished) return 'ended';
  return yourMove ? 'yourMove' : 'active';
}

/// The amount is struck through when the money never moved or went back.
export function amountStruck(state: DealState): boolean {
  return state === 'cancelled' || state === 'refunding' || state === 'refunded';
}
