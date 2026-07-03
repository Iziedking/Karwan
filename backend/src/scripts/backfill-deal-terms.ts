import { listAllDeals, patchDeal } from '../db/deals.js';
import { getBrief } from '../db/briefs.js';
import { logger } from '../logger.js';

/// One-off backfill for the deal-terms bug: persistApprovedMatch (agents/buyer.ts)
/// used to write the on-chain termsHash into a matched deal's `terms` field
/// instead of the buyer's human request. That field is what the deal page renders
/// as "the agreement" AND what the security agent checks the delivery against, so
/// old matched deals show a hash and the security agent reports "the buyer
/// requested a hexadecimal string". This restores `terms` from the brief's
/// briefText wherever the brief still exists (briefs are kept after match, only
/// flagged expired, so most are recoverable).
///
/// Run once after deploying the fix, inside the api container:
///   node dist/scripts/backfill-deal-terms.js          (apply)
///   DRY_RUN=1 node dist/scripts/backfill-deal-terms.js (preview, writes nothing)
///
/// Only rewrites deals whose terms is a bare 32-byte hash; human-text terms are
/// left untouched. Deals whose brief is gone are reported and skipped (their
/// request text is unrecoverable, and they are almost always already settled).

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

async function main() {
  const deals = await listAllDeals();
  let hashTerms = 0;
  let fixed = 0;
  let noBrief = 0;

  for (const deal of deals) {
    if (!deal.terms || !HASH_RE.test(deal.terms.trim())) continue;
    hashTerms += 1;

    const text = getBrief(deal.jobId)?.briefText?.trim();
    if (!text) {
      noBrief += 1;
      logger.warn(
        { jobId: deal.jobId },
        'backfill: terms is a hash but the brief text is gone; skipped',
      );
      continue;
    }

    if (dryRun) {
      logger.info(
        { jobId: deal.jobId, wouldSet: text.slice(0, 80) },
        'backfill: would rewrite terms (dry run)',
      );
      fixed += 1;
      continue;
    }

    await patchDeal(deal.jobId, { terms: text });
    fixed += 1;
    logger.info({ jobId: deal.jobId }, 'backfill: rewrote terms from brief text');
  }

  logger.info(
    { totalDeals: deals.length, hashTerms, rewritten: fixed, unrecoverable: noBrief, dryRun },
    'deal-terms backfill complete',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: (err as Error).message }, 'deal-terms backfill failed');
    process.exit(1);
  });
