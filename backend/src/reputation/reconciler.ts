/// Reputation chain-mirror reconciler. The settle-side recordReputation
/// call is best-effort: a Circle DCW failure, a redeployed contract, or a
/// settled deal that never had a buyerAgentWalletId can all leave the DB's
/// settledAt advanced while KarwanReputation.recorded[jobId] stays false.
/// The engine treats that gap as "no chain credit" (signals.ts), so a real
/// success history can read as zero on the credit passport.
///
/// This module closes the gap two ways:
///   1) reconcileReputationOnce: one pass over DB-settled deals, replays any
///      that the chain doesn't already know about. Called by the admin
///      backfill endpoint and by the periodic loop below.
///   2) startReputationReconciler: periodic timer wrapping (1) so future
///      silent failures self-heal without operator intervention.
///
/// Per-jobId attempt tracking lives in memory; a jobId that fails repeatedly
/// gets backed off so a single broken record can't stall the loop or burn
/// gas on every tick.

import { listAllDeals } from '../db/deals.js';
import { reputation } from '../chain/contracts.js';
import {
  recordReputation,
  OUTCOME_SUCCESS,
  type ReputationOutcome,
} from '../chain/settlement.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';

export interface ReconcileResult {
  candidates: number;
  /// JobIds the call recorded (or, in dry-run, would record).
  recorded: string[];
  /// JobIds the chain already knew about; no tx sent.
  alreadyOnChain: string[];
  /// JobIds we skipped for a missing precondition (no walletId, etc.).
  skipped: { jobId: string; reason: string }[];
  /// JobIds the recordCompletion attempt didn't successfully verify on chain.
  failed: { jobId: string; reason: string }[];
}

export interface ReconcileOptions {
  /// Limit to deals where this address is buyer or seller. lower-cased.
  addressFilter?: string | null;
  /// Don't send any chain transactions; just report what would happen.
  dryRun?: boolean;
}

/// Per-jobId attempt counter + cool-down. The reconciler hits the same DB
/// every tick, so a jobId that keeps failing would otherwise burn gas every
/// 10 minutes forever. After MAX_ATTEMPTS within the window we skip the
/// jobId until BACKOFF_MS has elapsed; the next attempt resets the counter.
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = 6 * 60 * 60 * 1000; // 6h
interface AttemptRecord {
  attempts: number;
  lastAttemptAt: number;
}
const attempts = new Map<string, AttemptRecord>();

function isBackedOff(jobId: string): boolean {
  const rec = attempts.get(jobId);
  if (!rec) return false;
  if (rec.attempts < MAX_ATTEMPTS) return false;
  return Date.now() - rec.lastAttemptAt < BACKOFF_MS;
}

function noteAttempt(jobId: string): void {
  const rec = attempts.get(jobId);
  const now = Date.now();
  if (!rec || now - rec.lastAttemptAt >= BACKOFF_MS) {
    attempts.set(jobId, { attempts: 1, lastAttemptAt: now });
  } else {
    attempts.set(jobId, { attempts: rec.attempts + 1, lastAttemptAt: now });
  }
}

function clearAttempts(jobId: string): void {
  attempts.delete(jobId);
}

/// One reconciliation pass. Walks every DB-settled deal that has a buyer
/// agent wallet to sign with, asks the chain whether it's already recorded,
/// and (when not in dry-run) calls recordReputation for any that aren't.
/// Verifies each write by re-reading recorded[jobId] before counting it as
/// success, since recordReputation swallows its own errors, so a returned promise
/// resolving is not proof the tx landed.
export async function reconcileReputationOnce(
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const { addressFilter = null, dryRun = false } = opts;

  const all = await listAllDeals();
  const candidates = all.filter((d) => {
    if (!d.settledAt) return false;
    if (d.cancelledAt) return false;
    if (!d.buyerAgentWalletId) return false;
    if (addressFilter) {
      const buyer = d.buyer?.toLowerCase();
      const seller = d.seller?.toLowerCase();
      if (buyer !== addressFilter && seller !== addressFilter) return false;
    }
    return true;
  });

  const result: ReconcileResult = {
    candidates: candidates.length,
    recorded: [],
    alreadyOnChain: [],
    skipped: [],
    failed: [],
  };

  for (const deal of candidates) {
    if (isBackedOff(deal.jobId)) {
      result.skipped.push({
        jobId: deal.jobId,
        reason: `backed off after ${MAX_ATTEMPTS} attempts; will retry after cool-down`,
      });
      continue;
    }

    let isRecorded: boolean;
    try {
      isRecorded = (await reputation.read.recorded([
        deal.jobId as `0x${string}`,
      ])) as boolean;
    } catch (err) {
      result.failed.push({
        jobId: deal.jobId,
        reason: `recorded() read failed: ${(err as Error).message}`,
      });
      continue;
    }
    if (isRecorded) {
      result.alreadyOnChain.push(deal.jobId);
      clearAttempts(deal.jobId);
      continue;
    }

    if (dryRun) {
      result.recorded.push(deal.jobId);
      continue;
    }

    // Settled deals are Success outcomes by definition (signals.ts treats
    // settledAt as the success marker, and Disputed/Failed paths advance
    // disputedAt/cancelledAt instead). recordReputation's own catch swallows
    // errors and only logs, so the verify re-read below is the proof of
    // landing, not the absence of an exception.
    const outcome: ReputationOutcome = OUTCOME_SUCCESS;
    noteAttempt(deal.jobId);

    try {
      await recordReputation(deal.jobId, deal.buyerAgentWalletId!, outcome);
    } catch (err) {
      // recordReputation itself doesn't throw. This is purely defensive in
      // case a future change reintroduces a throw path. Record + continue.
      result.failed.push({
        jobId: deal.jobId,
        reason: `recordReputation threw: ${(err as Error).message}`,
      });
      continue;
    }

    try {
      const verify = (await reputation.read.recorded([
        deal.jobId as `0x${string}`,
      ])) as boolean;
      if (verify) {
        result.recorded.push(deal.jobId);
        clearAttempts(deal.jobId);
      } else {
        result.failed.push({
          jobId: deal.jobId,
          reason: 'recordCompletion submitted but recorded[jobId] still false',
        });
      }
    } catch (err) {
      result.failed.push({
        jobId: deal.jobId,
        reason: `recorded() verify failed: ${(err as Error).message}`,
      });
    }
  }

  return result;
}

/// Periodic loop. Runs the reconciler at a fixed interval so silent
/// recordReputation failures self-heal, no operator curl required. Cheap to
/// run because the common case is "all candidates already recorded" and the
/// loop just reads `recorded` 0-15 times then exits.
///
/// First tick fires after one INTERVAL_MS rather than at boot to let other
/// chain readers warm up. Boot recovery (one-shot pass at start) is left to
/// the admin endpoint so a fresh deploy isn't burning gas before the
/// operator has had a chance to look at what's pending.
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function startReputationReconciler(): () => void {
  let inFlight = false;

  const id = setInterval(async () => {
    recordHeartbeat('reputationReconciler');
    if (inFlight) {
      logger.warn(
        'reputation reconciler: previous tick still running, skipping this tick',
      );
      return;
    }
    inFlight = true;
    try {
      const result = await reconcileReputationOnce();
      if (
        result.recorded.length > 0 ||
        result.failed.length > 0
      ) {
        logger.info(
          {
            candidates: result.candidates,
            recorded: result.recorded.length,
            alreadyOnChain: result.alreadyOnChain.length,
            failed: result.failed.length,
            skipped: result.skipped.length,
          },
          'reputation reconciler: tick complete',
        );
      }
    } catch (err) {
      logger.error(
        { err: (err as Error).message },
        'reputation reconciler: tick threw',
      );
    } finally {
      inFlight = false;
    }
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS }, 'reputation reconciler started');
  return () => clearInterval(id);
}
