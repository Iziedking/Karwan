import { runUsycWrap } from '../chain/usycOrchestrator.js';
import { logger } from '../logger.js';

/// USYC wrap CLI. Thin wrapper over the shared orchestrator (also called by the
/// admin route). Two legs per run: vault rebalance (wrap excess into USYC) and
/// treasury sweep (subscribe idle treasury USDC into USYC). Operator-signed with
/// USYC_OPERATOR_PRIVATE_KEY; on testnet that is the deployer EOA (whitelisted,
/// vault operator + treasury keeper).
///
///   npm run usyc:wrap                 (execute)
///   npm run usyc:wrap -- --dry-run    (preview, no transactions)
///   npm run usyc:cron                 (alias, for the scheduled run)

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');

async function main() {
  const result = await runUsycWrap({ dryRun });
  const head = dryRun
    ? 'usyc-cron: dry-run summary (no transactions sent)'
    : 'usyc-cron: done';
  console.log(`\n${head}  operator=${result.operator}`);
  for (const s of result.steps) {
    const tag = s.skipped ? 'skip' : s.txHash ? `tx ${s.txHash.slice(0, 10)}…` : 'ok';
    console.log(`  - [${tag}] ${s.action}: ${s.detail}`);
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: (err as Error).message }, 'usyc-cron: fatal');
    process.exit(1);
  });
