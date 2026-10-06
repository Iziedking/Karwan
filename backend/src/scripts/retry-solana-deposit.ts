/// Moves a Solana deposit to Arc again after it failed for want of SOL. Tops
/// the source wallet up from the testnet faucet first, then runs the same App
/// Kit move the deposit router runs. Only a failed Solana deposit row is
/// touched, so a bridge id typed wrong cannot move anything else.
///
///   docker exec karwan-api node dist/scripts/retry-solana-deposit.js deposit-<txId> [deposit-<txId> ...]

import { getBridge, patchBridge } from '../db/bridges.js';
import { ensureSolanaGas } from '../circle/solanaGas.js';
import { bridgeInToArcViaAppKit } from '../circle/bridge-kit.js';

async function retry(bridgeId: string): Promise<void> {
  const row = await getBridge(bridgeId);
  if (!row) return console.log(`${bridgeId}: not found`);
  if (row.sourceChainKey !== 'solanaDevnet' || !row.appKit) return console.log(`${bridgeId}: not a Solana deposit, skipped`);
  if (row.status !== 'error') return console.log(`${bridgeId}: status is ${row.status}, only a failed move is retried`);
  if (!row.bridgeWalletAddress) return console.log(`${bridgeId}: no source wallet on record`);
  if (!(await ensureSolanaGas(row.bridgeWalletAddress))) return console.log(`${bridgeId}: the wallet still has no SOL, try again later`);
  await patchBridge(bridgeId, { status: 'approving', error: undefined });
  await bridgeInToArcViaAppKit({
    bridgeId,
    sourceChainKey: 'solanaDevnet',
    bridgeWalletAddress: row.bridgeWalletAddress,
    amountUsdc: row.amountUsdc,
    mintRecipient: row.mintRecipient,
  });
  const after = await getBridge(bridgeId);
  console.log(`${bridgeId}: ${after?.status}${after?.error ? ` (${after.error})` : ''}`);
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('usage: retry-solana-deposit.js <bridgeId> [...]');
  process.exit(1);
}
for (const id of ids) await retry(id);
process.exit(0);
