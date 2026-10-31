import type { DirectDeal } from '@/core/api';
import { stageOf, type DealStage } from './components/DirectDealList';
import { directDealNeedsViewer } from '@/features/notifications/openDealsModel';

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

/// The top of the Deals list for Home: up to two that need you, else the next
/// active one, else nothing at all.
export function homeDealsPreview<T>(groups: DealsGroups<T>): { title: 'needsYou' | 'active' | null; items: T[] } {
  if (groups.needsYou.length > 0) return { title: 'needsYou', items: groups.needsYou.slice(0, 2) };
  if (groups.active.length > 0) return { title: 'active', items: groups.active.slice(0, 1) };
  return { title: null, items: [] };
}
