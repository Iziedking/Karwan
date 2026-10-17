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
  /// The person's current Telegram username, lowercased, without the @.
  tgUsername?: string | null;
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

/// The account a Telegram username belongs to now. Only accounts that have a
/// Karwan address are returned.
export async function findTelegramAccountByUsername(username: string): Promise<TelegramAccount | null> {
  const key = username.replace(/^@/, '').trim().toLowerCase();
  if (!key) return null;
  if (!pgEnabled) return [...accountsInMemory.values()].find((a) => a.tgUsername === key && a.address) ?? null;
  const r = await postgresExecutor().query<{ data: TelegramAccount }>(
    `SELECT data FROM telegram_accounts WHERE data->>'tgUsername' = $1 AND address IS NOT NULL LIMIT 1`,
    [key],
  );
  return r.rows[0]?.data ?? null;
}

/// Telegram usernames are unique at any one time, so the account that showed
/// a username last owns it: every other account loses it. Without this a
/// renamed seller's old name, taken by someone else, would still find them.
export async function claimTelegramUsername(numberHash: string, username: string): Promise<void> {
  const key = username.replace(/^@/, '').trim().toLowerCase();
  if (!key) return;
  if (!pgEnabled) {
    for (const [hash, a] of accountsInMemory) {
      if (hash !== numberHash && a.tgUsername === key) accountsInMemory.set(hash, { ...a, tgUsername: null });
    }
    return;
  }
  await postgresExecutor().query(
    `UPDATE telegram_accounts SET data = jsonb_set(data, '{tgUsername}', 'null'::jsonb)
     WHERE data->>'tgUsername' = $1 AND user_hash <> $2`,
    [key, numberHash],
  );
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
