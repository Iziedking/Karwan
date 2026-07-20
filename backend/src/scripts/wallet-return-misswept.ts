/// Returns USDC that the unification backfill's --sweep mis-delivered.
///
/// WHAT WENT WRONG: one user's OLD deposit address can be ANOTHER user's
/// identity address. The backfill swept accounts in sequence, so user A's funds
/// landed on A's unified address — which was user B's old deposit wallet — and
/// B's later sweep carried A's money onward to B. A cascade, one hop deep.
///
/// This moves a stated amount from the wallet that wrongly holds it back to the
/// rightful owner's address on the same chain. Both wallets are ours, so it is
/// a plain USDC transfer. It is DELIBERATELY not automatic: it takes the exact
/// from/to/amount on the command line so the operator states, and can check,
/// precisely what moves.
///
/// Dry run by default. Add --execute to send.
///
/// Run: npm run wallets:return -- --holder <0xUserWhoHasIt> --owner <0xRightfulOwner> \
///        --chain BASE-SEPOLIA --amount 24.946802 [--execute]

import { listAllAgentWallets } from '../db/agentWallets.js';
import { ensureSchema, pgEnabled } from '../db/client.js';
import { executeContractCall } from '../chain/txs.js';
import { readSourceUsdcBalance } from '../chain/cctpClients.js';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS, type CctpChainKey } from '../chain/cctpChains.js';
import { parseUnits } from 'viem';

const USDC_DECIMALS = 6;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const holder = arg('holder')?.toLowerCase();
  const owner = arg('owner')?.toLowerCase();
  const chain = arg('chain');
  const amount = arg('amount');
  const execute = process.argv.includes('--execute');

  if (!holder || !owner || !chain || !amount) {
    console.error(
      '\n  Usage: --holder <0x> --owner <0x> --chain <CIRCLE-CHAIN> --amount <usdc> [--execute]\n',
    );
    process.exit(2);
  }
  if (!pgEnabled) {
    console.error('\n  REFUSING TO RUN: DATABASE_URL is not set.\n');
    process.exit(2);
  }
  await ensureSchema().catch(() => {});
  const all = await listAllAgentWallets();

  const holderRec = all.find((r) => r.userAddress.toLowerCase() === holder);
  if (!holderRec) {
    console.error(`\n  No agent-wallet record for holder ${holder}.\n`);
    process.exit(2);
  }
  const wallet = holderRec.bridgeWallets?.[chain];
  if (!wallet) {
    console.error(`\n  Holder has no ${chain} deposit wallet.\n`);
    process.exit(2);
  }
  const key = CCTP_CHAIN_KEYS.find((k) => CCTP_CHAINS[k].circleBlockchain === chain) as
    | CctpChainKey
    | undefined;
  if (!key) {
    console.error(`\n  ${chain} is not a readable CCTP chain.\n`);
    process.exit(2);
  }

  const live = await readSourceUsdcBalance(key, wallet.address);
  console.log('\n=== RETURN MIS-SWEPT USDC ===\n');
  console.log(`  chain        ${chain}`);
  console.log(`  from wallet  ${wallet.address}  (held by ${holder})`);
  console.log(`  to           ${owner}  (rightful owner)`);
  console.log(`  amount       ${amount} USDC`);
  console.log(`  live balance ${live ?? 'unreadable'} USDC`);

  if (live === null) {
    console.error('\n  Balance unreadable; refusing to send blind.\n');
    process.exit(2);
  }
  if (Number(live) < Number(amount)) {
    console.error(
      `\n  Holder wallet only has ${live} USDC, less than the ${amount} requested. Refusing.\n`,
    );
    process.exit(2);
  }

  if (!execute) {
    console.log('\n  Dry run. Nothing sent. Re-run with --execute.\n');
    process.exit(0);
  }

  const res = await executeContractCall(
    {
      walletId: wallet.walletId,
      contractAddress: CCTP_CHAINS[key].usdc,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters: [owner, parseUnits(amount, USDC_DECIMALS).toString()],
      // The backfill's sweeps needed ~98s each; the 90s default reported
      // failures for transfers that actually confirmed. Wait properly here.
      pollAttempts: 120,
    },
    `return-misswept(${chain} ${wallet.address} -> ${owner})`,
  );
  console.log(`\n  sent. tx ${res.txHash}`);
  console.log('  Verify with the audit before considering this closed.\n');
}

main().catch((err) => {
  console.error('\nreturn failed:', (err as Error).message);
  process.exit(1);
});
