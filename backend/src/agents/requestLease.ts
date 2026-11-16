import { randomUUID } from 'node:crypto';
import { requestLeaseStore, type RequestLeaseStore } from '../db/requestLeases.js';
import { logger } from '../logger.js';

/// One server works a request at a time (view 48, step 8d; view 87). The
/// buying mode takes the request's lease before it counters, proposes, accepts
/// or funds, and keeps it while the request is live. A server that cannot
/// renew stops acting before its time runs out in the store, so the next
/// server never overlaps it.

export const LEASE_MS = 90_000;
export const RENEW_EVERY_MS = 30_000;
/// This server stops acting this long before the store lets another one in.
export const STOP_EARLY_MS = 15_000;

export class RequestLeaseLostError extends Error {
  constructor(readonly jobId: string) {
    super(`another server is working this request: ${jobId}`);
    this.name = 'RequestLeaseLostError';
  }
}

export interface RequestLeases {
  /// Takes the lease, or says another server holds it.
  claim(jobId: string): Promise<boolean>;
  /// Resolves when this server holds the request; takes the lease if it is
  /// free. Throws RequestLeaseLostError when another server holds it.
  ensureHeld(jobId: string): Promise<void>;
  /// Renews every lease this server holds and returns the requests it lost.
  renew(): Promise<string[]>;
  release(jobId: string): Promise<void>;
  held(): string[];
}

export function createRequestLeases(deps: {
  store: () => RequestLeaseStore;
  owner: string;
  now?: () => number;
  leaseMs?: number;
}): RequestLeases {
  const now = deps.now ?? Date.now;
  const leaseMs = deps.leaseMs ?? LEASE_MS;
  /// Until when this server may act on each request, by its own clock.
  const actUntil = new Map<string, number>();
  const key = (jobId: string) => jobId.toLowerCase();

  async function claim(jobId: string): Promise<boolean> {
    const at = now();
    const won = await deps.store().claim(jobId, deps.owner, at, leaseMs);
    if (won) actUntil.set(key(jobId), at + leaseMs - STOP_EARLY_MS);
    else actUntil.delete(key(jobId));
    return won;
  }

  return {
    claim,
    async ensureHeld(jobId) {
      const until = actUntil.get(key(jobId));
      if (until !== undefined && until > now()) return;
      if (!(await claim(jobId))) throw new RequestLeaseLostError(jobId);
    },
    async renew() {
      const lost: string[] = [];
      for (const jobId of [...actUntil.keys()]) {
        try {
          if (!(await claim(jobId))) lost.push(jobId);
        } catch (err) {
          // The store could not be reached: the lease is not renewed, and this
          // server stops acting on the request when its own time is up.
          logger.warn({ jobId, err: (err as Error).message }, 'request lease renew failed');
        }
      }
      return lost;
    },
    async release(jobId) {
      if (!actUntil.delete(key(jobId))) return;
      await deps.store().release(jobId, deps.owner);
    },
    held: () => [...actUntil.keys()],
  };
}

export const buyerLeases = createRequestLeases({
  store: requestLeaseStore,
  owner: `karwan-buyer-${process.pid}-${randomUUID()}`,
});
