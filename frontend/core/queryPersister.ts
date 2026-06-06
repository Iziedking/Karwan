import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';

/// localStorage-backed cache persister. A hard refresh used to blank every
/// surface for a full network round-trip; with this in place the persisted
/// snapshot rehydrates the QueryClient on mount, so the first paint shows
/// last-known data and a fresh fetch reconciles in the background.
///
/// The buster is bumped manually whenever the wire shape of a cached value
/// changes; a mismatch wipes the entire cache rather than handing a stale
/// shape to a new code path. Tied to the deploy tag so a redeploy with a
/// schema change automatically discards old blobs.
const BUSTER = 'rq-v1-2026-06-06';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'karwan:rq-cache';

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
};
