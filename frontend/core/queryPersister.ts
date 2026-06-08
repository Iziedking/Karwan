import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';

/// localStorage-backed cache persister. A hard refresh used to blank every
/// surface for a full network round-trip; with this in place the persisted
/// snapshot rehydrates the QueryClient on mount, so the first paint shows
/// last-known data and a fresh fetch reconciles in the background.
///
/// The buster is bumped manually whenever the wire shape of a cached value
/// changes; a mismatch wipes the entire cache rather than handing a stale
/// shape to a new code path. Tied to the deploy tag so a redeploy with a
/// schema change automatically discards old blobs.
const BUSTER = 'rq-v3-2026-06-08-yield-out';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'karwan:rq-cache';

/// Only stable, non-state-machine queries are safe to persist. Volatile
/// queries (deal lifecycle, job auction state, notifications) get re-fetched
/// fresh on every mount so the user never sees a stale snapshot of a deal
/// that has since moved on. The "old deals flash on home / profile" bug
/// was the deal-list cache being rehydrated with snapshots from before the
/// deals settled or cancelled.
///
/// `yield` was previously persisted but caused a documented flash on
/// /stake: a 4.90 USDC persisted snapshot painted first, then a fresh
/// fetch reconciled to 2.80 because a daily distribution / claim had
/// landed between sessions. Yield numbers represent real money owed to the
/// user — they must be accurate or absent, never wrong-and-then-correct.
/// Now refetched fresh on every mount; first paint shows the existing
/// loading state (driven by query.isPending) instead of a stale value.
const PERSISTABLE_PREFIXES = new Set([
  'reputation',
  'profile',
  'wallet-overview',
  'balances',
  'vault',
  'api', // status + dealsStats: network-wide counters, fine to seed
  'terms',
  'activation',
]);

function isPersistable(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === 'string' && PERSISTABLE_PREFIXES.has(root);
}

export function makeQueryPersister(): Persister | null {
  if (typeof window === 'undefined') return null;
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: STORAGE_KEY,
    throttleTime: 500,
  }) as Persister;
}

export const persistOptions = {
  buster: BUSTER,
  maxAge: MAX_AGE_MS,
  dehydrateOptions: {
    /// Filter at dehydrate time so the persisted blob never carries deal
    /// or job snapshots; rehydration can't paint stale lifecycle data
    /// even if a malformed entry sneaks into storage.
    shouldDehydrateQuery: isPersistable,
  },
};
