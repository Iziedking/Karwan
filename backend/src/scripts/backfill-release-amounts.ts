/// Backfill the amount on milestone release and payout rows that were recorded
/// without one.
///
/// Managed releases (routes/milestones.ts) wrote both sides of every milestone
/// payment with no amountUsdc and no tx hash. In transaction history those rows
/// read "Released milestone 2 on deal 0x..." with a dash where the money should
/// be, and the receipt a user can export or share had nothing on it. The route
/// is fixed to read the payment off the contract; this repairs the rows already
/// written, which is every managed release on the account to date.
///
/// The amount is recomputed from the escrow, not guessed: the contract holds
/// sellerNet and the milestone percentages, and _payMilestone pays
/// sellerNet * pct / 100 for every milestone except the last, which sweeps the
/// remainder. That reproduces the exact figure the seller was paid.
///
/// Tx hashes are NOT backfilled. Recovering them means scanning ProgressReleased
/// logs across the escrow's whole life, and Arc's RPC caps getLogs windows hard
/// enough that the scan is its own job. The rows keep their Karwan reference and
/// gain the amount, which is what the receipt is missing.
///
/// Run once after deploying the fix, inside the api container:
///   DRY_RUN=1 node dist/scripts/backfill-release-amounts.js   (preview)
///   node dist/scripts/backfill-release-amounts.js             (apply)

import {
  fillActivityGaps,
  listActivityMissingAmount,
  type ActivityEntry,
} from '../db/activityLog.js';
import { readEscrow } from '../chain/contracts.js';
import { milestonePayoutSchedule } from '../money/escrowProjection.js';
import { formatUsdcMicros } from '../money/model.js';
import { logger } from '../logger.js';

const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

/// Which milestone the row is about, 1-based. `params.n` is authoritative;
/// the summary is the fallback for rows written before params existed.
function milestoneNumber(entry: ActivityEntry): number | null {
  const fromParams = Number(entry.params?.n);
  if (Number.isInteger(fromParams) && fromParams > 0) return fromParams;
  const match = /milestone (\d+)/i.exec(entry.summary);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function main() {
  const rows = await listActivityMissingAmount(['release', 'payout'], 2000);
  logger.info({ candidates: rows.length, dryRun }, 'release-amount backfill: scanned');

  // One escrow read per deal, not per row: a two-milestone deal writes four
  // rows and they all read the same account.
  const schedules = new Map<string, bigint[] | null>();
  let filled = 0;
  let noJob = 0;
  let noIndex = 0;
  let unreadable = 0;

  for (const row of rows) {
    if (!row.jobId) {
      noJob += 1;
      continue;
    }
    const number = milestoneNumber(row);
    if (number === null) {
      noIndex += 1;
      continue;
    }

    if (!schedules.has(row.jobId)) {
      try {
        const account = await readEscrow(row.jobId);
        schedules.set(row.jobId, milestonePayoutSchedule(account));
      } catch (err) {
        schedules.set(row.jobId, null);
        logger.warn(
          { jobId: row.jobId, err: (err as Error).message },
          'release-amount backfill: escrow unreadable, rows skipped',
        );
      }
    }
    const schedule = schedules.get(row.jobId);
    if (!schedule) {
      unreadable += 1;
      continue;
    }

    const micros = schedule[number - 1];
    if (micros === undefined || micros <= 0n) {
      // A milestone number outside the schedule means the row and the contract
      // disagree. Leave it alone rather than writing a number off the wrong row.
      logger.warn(
        { id: row.id, jobId: row.jobId, milestone: number, milestones: schedule.length },
        'release-amount backfill: milestone outside the escrow schedule, skipped',
      );
      continue;
    }

    const amountUsdc = formatUsdcMicros(micros);
    if (dryRun) {
      logger.info(
        { id: row.id, kind: row.kind, jobId: row.jobId, milestone: number, amountUsdc },
        'release-amount backfill: would set amount (dry run)',
      );
      filled += 1;
      continue;
    }
    if (await fillActivityGaps(row.id, { amountUsdc })) filled += 1;
  }

  logger.info(
    {
      candidates: rows.length,
      filled,
      skippedNoJobId: noJob,
      skippedNoMilestone: noIndex,
      skippedUnreadableEscrow: unreadable,
      dryRun,
    },
    'release-amount backfill: done',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: (err as Error).message }, 'release-amount backfill failed');
    process.exit(1);
  });
