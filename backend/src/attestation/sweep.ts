/// Turning settled deals into issued attestations.
///
/// A sweep rather than a hook on the settlement path, for the same reason the
/// reputation reconciler is one: settlement is stamped in three places in
/// dealWatcher plus the release routes, and a fourth caller added later would
/// silently not attest. A sweep that re-reads every settled deal cannot be
/// forgotten by a new code path, and it backfills history the first time it runs.
///
/// Idempotency is the id, not the loop. `attestationId` is derived from the deal
/// and the role, so re-issuing is a primary-key collision that the store absorbs.
/// The sweep can therefore be run as often as we like, from a timer or by hand,
/// without producing a second statement about one event.

import { listAllDeals, type DirectDeal } from '../db/deals.js';
import { saveAttestation } from '../db/attestations.js';
import { arcTestnet } from '../chain/client.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import { issueDealSettled, issuanceEnabled } from './issuer.js';

export interface SweepResult {
  /// Deals that reached settlement and are eligible to be attested.
  candidates: number;
  /// Attestation ids created by this pass.
  issued: string[];
  /// Ids that already existed, so nothing was signed.
  alreadyIssued: string[];
  skipped: { jobId: string; reason: string }[];
  failed: { jobId: string; reason: string }[];
}

export interface SweepOptions {
  /// Limit to deals where this address is the buyer or the seller. Lower-cased.
  addressFilter?: string | null;
  /// Report what would be issued without signing or storing anything.
  dryRun?: boolean;
  /// Cap the number of NEW attestations one pass will sign. The first run on a
  /// production history issues two documents per settled deal in one tick; a cap
  /// lets an operator walk that in reviewable batches instead of publishing the
  /// whole back catalogue on a single boot.
  limit?: number;
}

const ZERO = '0x0000000000000000000000000000000000000000';

function isRealAddress(value: string | undefined): value is string {
  if (!value) return false;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return false;
  return value.toLowerCase() !== ZERO;
}

/// Whether a deal is a settlement we are willing to attest to.
///
/// `settledAt` alone is not the test. A deal cancelled after settlement, or one
/// whose counterparty was invited by email and never claimed the link, carries a
/// settledAt next to an address that belongs to nobody, and an attestation about
/// a placeholder is a false statement with our signature on it.
export function attestable(deal: DirectDeal): { ok: true } | { ok: false; reason: string } {
  if (!deal.settledAt) return { ok: false, reason: 'not settled' };
  if (deal.cancelledAt) return { ok: false, reason: 'cancelled' };
  if (deal.pendingCounterparty) {
    return { ok: false, reason: 'counterparty invite unclaimed, address is a placeholder' };
  }
  if (!isRealAddress(deal.buyer) || !isRealAddress(deal.seller)) {
    return { ok: false, reason: 'buyer or seller is not a usable address' };
  }
  const amount = Number(deal.dealAmountUsdc);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: `unusable deal amount ${String(deal.dealAmountUsdc)}` };
  }
  return { ok: true };
}

/// Whether settlement was reached through the dispute machinery. Part of the
/// observation: a consumer reading a run of clean settlements should be able to
/// tell them from contested ones, and we are not the party who gets to decide
/// what that difference is worth.
export function settledViaDispute(deal: DirectDeal): boolean {
  return Boolean(deal.disputed || deal.disputedAt || deal.cancelKind === 'resolved');
}

/// One pass. Walks settled deals and issues the two attestations each one owes,
/// one to the buyer and one to the seller, skipping any that already exist.
export async function issueSettledOnce(opts: SweepOptions = {}): Promise<SweepResult> {
  const { addressFilter = null, dryRun = false, limit } = opts;

  const result: SweepResult = {
    candidates: 0,
    issued: [],
    alreadyIssued: [],
    skipped: [],
    failed: [],
  };

  if (!issuanceEnabled()) {
    result.skipped.push({ jobId: '*', reason: 'no issuer key configured' });
    return result;
  }

  const all = await listAllDeals();
  const candidates: DirectDeal[] = [];
  for (const deal of all) {
    if (addressFilter) {
      const buyer = deal.buyer?.toLowerCase();
      const seller = deal.seller?.toLowerCase();
      if (buyer !== addressFilter && seller !== addressFilter) continue;
    }
    const verdict = attestable(deal);
    if (!verdict.ok) {
      // Only worth reporting for deals that got as far as settlement. Every open
      // deal on the platform is "not settled", and listing them would bury the
      // three that are genuinely stuck.
      if (deal.settledAt) result.skipped.push({ jobId: deal.jobId, reason: verdict.reason });
      continue;
    }
    candidates.push(deal);
  }
  result.candidates = candidates.length;

  const chainId = arcTestnet.id;

  for (const deal of candidates) {
    if (limit !== undefined && result.issued.length >= limit) break;

    const amount = Number(deal.dealAmountUsdc);
    const viaDispute = settledViaDispute(deal);

    for (const [role, subject] of [
      ['buyer', deal.buyer],
      ['seller', deal.seller],
    ] as const) {
      if (limit !== undefined && result.issued.length >= limit) break;

      try {
        const issued = await issueDealSettled({
          jobId: deal.jobId,
          subject,
          role,
          settledAt: deal.settledAt!,
          amountUsdc: amount,
          viaDispute,
          chainId,
        });
        if (!issued) {
          result.failed.push({ jobId: deal.jobId, reason: 'issuer key went away mid-sweep' });
          continue;
        }

        if (dryRun) {
          result.issued.push(issued.id);
          continue;
        }

        const { created } = await saveAttestation({
          id: issued.id,
          subject: subject.toLowerCase(),
          dealRef: issued.dealRef,
          jobId: deal.jobId,
          role,
          issuedAt: Date.parse(issued.document.issuedAt),
          document: issued.document,
        });
        if (created) result.issued.push(issued.id);
        else result.alreadyIssued.push(issued.id);
      } catch (err) {
        result.failed.push({
          jobId: deal.jobId,
          reason: `${role}: ${(err as Error).message}`,
        });
      }
    }
  }

  return result;
}

/// Periodic sweep. Hourly rather than the reconciler's ten minutes: nothing
/// downstream is waiting on an attestation the way the credit passport waits on
/// chain reputation, and an issuer that publishes an hour after settlement is
/// still publishing about a finished event.
const INTERVAL_MS = 60 * 60 * 1000;

export function startAttestationSweep(): () => void {
  let inFlight = false;

  const id = setInterval(async () => {
    recordHeartbeat('attestationSweep');
    if (inFlight) {
      logger.warn('attestation sweep: previous tick still running, skipping this tick');
      return;
    }
    inFlight = true;
    try {
      const result = await issueSettledOnce();
      if (result.issued.length > 0 || result.failed.length > 0) {
        logger.info(
          {
            candidates: result.candidates,
            issued: result.issued.length,
            alreadyIssued: result.alreadyIssued.length,
            skipped: result.skipped.length,
            failed: result.failed.length,
          },
          'attestation sweep: tick complete',
        );
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'attestation sweep: tick threw');
    } finally {
      inFlight = false;
    }
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS }, 'attestation sweep started');
  return () => clearInterval(id);
}
