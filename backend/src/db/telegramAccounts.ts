import type { ChatAccount } from '../channels/types.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// A chat account opened on Telegram. `numberHash` is the hashed Telegram
/// user id and `to` is the private chat id replies go to. Telegram has no
/// service window, so unlike WhatsApp nothing is queued.
export interface TelegramAccount extends ChatAccount {
  /// The chat belongs to a web account that linked Telegram from its profile.
  /// The agent runs as that account; Karwan does not hold its keys, so it is
  /// not a chat account for custody or the chat deal limits.
  linkedWebAccount?: boolean;
}

const seenInMemory = new Set<number>();
const accountsInMemory = new Map<string, TelegramAccount>();

/// Long polling can hand the same update back after a restart, so every
/// update is claimed before the agent runs a turn for it.
export async function markTelegramUpdateProcessed(updateId: number): Promise<boolean> {
  if (!pgEnabled) {
    if (seenInMemory.has(updateId)) return false;
    seenInMemory.add(updateId);
    return true;
  }
  const r = await postgresExecutor().query(
    `INSERT INTO telegram_processed (update_id, ts) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING update_id`,
    [String(updateId), Date.now()],
  );
  return r.rows.length === 1;
}

export async function getTelegramAccount(userHash: string): Promise<TelegramAccount | null> {
  if (!pgEnabled) return accountsInMemory.get(userHash) ?? null;
  const r = await postgresExecutor().query<{ data: TelegramAccount }>(
    `SELECT data FROM telegram_accounts WHERE user_hash = $1`,
    [userHash],
  );
  return r.rows[0]?.data ?? null;
}

export async function findTelegramAccountByAddress(address: string): Promise<TelegramAccount | null> {
  const key = address.toLowerCase();
  if (!pgEnabled) return [...accountsInMemory.values()].find((a) => a.address === key) ?? null;
  const r = await postgresExecutor().query<{ data: TelegramAccount }>(
    `SELECT data FROM telegram_accounts WHERE address = $1`,
    [key],
  );
  return r.rows[0]?.data ?? null;
}

/// Deletes the chat account at this address, when the account is deleted.
export async function deleteTelegramAccountByAddress(address: string): Promise<void> {
  const key = address.toLowerCase();
  if (!pgEnabled) {
    for (const [hash, a] of accountsInMemory) if (a.address === key) accountsInMemory.delete(hash);
    return;
  }
  await postgresExecutor().query(`DELETE FROM telegram_accounts WHERE address = $1`, [key]);
}

export async function saveTelegramAccount(account: TelegramAccount): Promise<TelegramAccount> {
  const record = { ...account, address: account.address?.toLowerCase() ?? null };
  if (!pgEnabled) {
    accountsInMemory.set(record.numberHash, record);
    return record;
  }
  await postgresExecutor().query(
    `INSERT INTO telegram_accounts (user_hash, address, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_hash) DO UPDATE SET address = EXCLUDED.address, data = EXCLUDED.data`,
    [record.numberHash, record.address, JSON.stringify(record)],
  );
  return record;
}
