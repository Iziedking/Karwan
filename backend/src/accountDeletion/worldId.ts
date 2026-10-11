import type { SqlExecutor } from '../db/migrations.js';

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;

/// The World ID session bound to an account and its pending checks. The
/// checks made for deals stay with the deals.
export async function forgetWorldIdSessions(transaction: Transaction, wallet: string): Promise<void> {
  await transaction(async (tx) => {
    const key = wallet.toLowerCase();
    await tx.query('DELETE FROM world_id_sessions_v1 WHERE wallet = $1', [key]);
    await tx.query('DELETE FROM world_id_account_checks_v1 WHERE wallet = $1', [key]);
  });
}

/// Frees a person's World ID hashes for the person-check action, so the same
/// person can verify a new account. Hashes that are not numbers were never
/// written to the replay table.
export async function releasePersonCheckNullifiers(transaction: Transaction, nullifiers: string[], action: string): Promise<void> {
  const numeric = nullifiers.flatMap((n) => {
    try {
      return [BigInt(n).toString()];
    } catch {
      return [];
    }
  });
  if (numeric.length === 0) return;
  await transaction(async (tx) => {
    await tx.query('DELETE FROM world_id_nullifiers_v1 WHERE action = $2 AND nullifier = ANY($1::numeric[])', [numeric, action]);
  });
}
