/// Backfill settledAt on deals the seller finished with a claim.
///
/// Until 22 Oct 2026 the seller's claim route settled the escrow on chain but
/// never wrote settledAt on the deal record (the buyer-release path did). Those
/// deals read "settled" on their page, which looks at the chain, but every count
/// that reads the record missed them: rating prompts, the people you traded
/// with, the public feed and the stats. The route is fixed; this repairs the
/// deals already written.
///
/// The chain decides, nothing is guessed: a deal is marked settled only when
/// its escrow reads Settled. The date is when it was last paid out, else when
/// it was delivered, else the record's last update.
///
/// Run once after deploying the fix, inside the api container:
///   DRY_RUN=1 node dist/scripts/backfill-settled-deals.js   (preview)
///   node dist/scripts/backfill-settled-deals.js             (apply)

import { listAllDeals, patchDeal, type DirectDeal } from '../db/deals.js';
import { dealEscrowOps } from '../deals/dealEscrowOpsLive.js';
import { ESCROW_SETTLED } from '../chain/settlement.js';
import { logger } from '../logger.js';

const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

/// Funded, not closed on the record, so the chain may have settled it.
export function needsCheck(deal: DirectDeal): boolean {
  return !deal.settledAt && !deal.cancelledAt && !deal.legacyEscrow && Boolean(deal.acceptedAt) && Boolean(deal.delivered);
}

export function settledDate(deal: DirectDeal): number {
  return deal.lastReleaseAt ?? deal.deliveredAt ?? deal.updatedAt ?? Date.now();
}

async function main() {
  const candidates = (await listAllDeals()).filter(needsCheck);
  logger.info({ candidates: candidates.length, dryRun }, 'settled backfill: scanned');
  let fixed = 0;
  let open = 0;
  let unreadable = 0;
  for (const deal of candidates) {
    let state: number;
    try {
      state = (await dealEscrowOps.read(deal)).state;
    } catch (err) {
      unreadable += 1;
      logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'settled backfill: escrow unreadable, skipped');
      continue;
    }
    if (state !== ESCROW_SETTLED) {
      open += 1;
      continue;
    }
    const at = settledDate(deal);
    logger.info({ jobId: deal.jobId, settledAt: new Date(at).toISOString(), dryRun }, 'settled backfill: settled on chain, record missing it');
    if (!dryRun) await patchDeal(deal.jobId, { settledAt: at });
    fixed += 1;
  }
  logger.info({ fixed, stillOpen: open, unreadable, dryRun }, 'settled backfill: done');
}

if (process.argv[1]?.endsWith('backfill-settled-deals.js') || process.argv[1]?.endsWith('backfill-settled-deals.ts')) {
  main().then(() => process.exit(0), (err) => {
    logger.error({ err: (err as Error).message }, 'settled backfill failed');
    process.exit(1);
  });
}
