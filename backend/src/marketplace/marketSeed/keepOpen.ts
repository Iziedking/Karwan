import { listAllListings, patchListing, type Listing } from '../../db/listings.js';
import { logger } from '../../logger.js';
import { isSeedKey } from './runner.js';

/// How long a renewed example stays open, the same window the seed gives it.
export const EXAMPLE_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 6 * 60 * 60 * 1000;

/// Example offers are Karwan's sample stock on the testnet market, marked
/// Example on every card and never matched. They lapsed after their 30 days and
/// the market emptied, because the seed skips an offer that already exists. An
/// example that has lapsed opens again for another window; one its seller
/// withdrew stays withdrawn.
export function lapsedExamples(listings: readonly Listing[], now: number): Listing[] {
  return listings.filter((l) => isSeedKey(l.seedKey) && !l.cancelledAt && l.expiresAt <= now);
}

export function reopenLapsedExamples(now = Date.now()): number {
  const lapsed = lapsedExamples(listAllListings(), now);
  for (const l of lapsed) patchListing(l.id, { expiresAt: now + EXAMPLE_TTL_DAYS * DAY_MS });
  return lapsed.length;
}

/// Reopens lapsed examples at start and every six hours.
export function startExampleKeeper(): () => void {
  const sweep = () => {
    try {
      const reopened = reopenLapsedExamples();
      if (reopened) logger.info({ reopened }, 'market examples reopened');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'market examples not reopened');
    }
  };
  sweep();
  const timer = setInterval(sweep, SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
