import { config } from '../config.js';
import type { OutMessage } from '../channels/render.js';
import type { ChatAccount } from '../channels/types.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// One WhatsApp number's state. The number itself is never stored in the
/// clear: `numberHash` is the lookup key, `to` is kept only to message back.
export interface WhatsappAccount extends ChatAccount {
  /// Messages held until the 24 hour service window opens again.
  queue: OutMessage[];
  worldIdNullifier?: string;
  emailRecovery?: string;
}

const seenInMemory = new Set<string>();
const accountsInMemory = new Map<string, WhatsappAccount>();
const dailyInMemory = new Set<string>();

/// True the first time a WhatsApp message id is seen. Meta redelivers
/// webhooks, so every message is handled at most once.
export async function markProcessed(messageId: string): Promise<boolean> {
  if (!pgEnabled) {
    if (seenInMemory.has(messageId)) return false;
    seenInMemory.add(messageId);
    return true;
  }
  const r = await postgresExecutor().query(
    `INSERT INTO whatsapp_processed (message_id, ts) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING message_id`,
    [messageId, Date.now()],
  );
  return r.rows.length === 1;
}

export async function getWhatsappAccount(numberHash: string): Promise<WhatsappAccount | null> {
  if (!pgEnabled) return accountsInMemory.get(numberHash) ?? null;
  const r = await postgresExecutor().query<{ data: WhatsappAccount }>(
    `SELECT data FROM whatsapp_accounts WHERE number_hash = $1`,
    [numberHash],
  );
  return r.rows[0]?.data ?? null;
}

export async function findWhatsappAccountByAddress(address: string): Promise<WhatsappAccount | null> {
  const key = address.toLowerCase();
  if (!pgEnabled) return [...accountsInMemory.values()].find((a) => a.address === key) ?? null;
  const r = await postgresExecutor().query<{ data: WhatsappAccount }>(
    `SELECT data FROM whatsapp_accounts WHERE address = $1`,
    [key],
  );
  return r.rows[0]?.data ?? null;
}

export async function findWhatsappAccountByNullifier(nullifier: string): Promise<WhatsappAccount | null> {
  if (!pgEnabled) return [...accountsInMemory.values()].find((a) => a.worldIdNullifier === nullifier) ?? null;
  const r = await postgresExecutor().query<{ data: WhatsappAccount }>(
    `SELECT data FROM whatsapp_accounts WHERE data->>'worldIdNullifier' = $1`,
    [nullifier],
  );
  return r.rows[0]?.data ?? null;
}

export async function saveWhatsappAccount(account: WhatsappAccount): Promise<WhatsappAccount> {
  const record = { ...account, address: account.address?.toLowerCase() ?? null };
  if (!pgEnabled) {
    accountsInMemory.set(record.numberHash, record);
    return record;
  }
  await postgresExecutor().query(
    `INSERT INTO whatsapp_accounts (number_hash, address, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (number_hash) DO UPDATE SET address = EXCLUDED.address, data = EXCLUDED.data`,
    [record.numberHash, record.address, JSON.stringify(record)],
  );
  return record;
}

/// Deletes the chat account at this address and its daily counts, when the
/// account is deleted.
export async function deleteWhatsappAccountByAddress(address: string): Promise<void> {
  const key = address.toLowerCase();
  if (!pgEnabled) {
    for (const [hash, a] of accountsInMemory) {
      if (a.address !== key) continue;
      accountsInMemory.delete(hash);
      for (const d of dailyInMemory) if (d.endsWith(`:${hash}`)) dailyInMemory.delete(d);
    }
    return;
  }
  await postgresExecutor().query(
    `DELETE FROM whatsapp_daily WHERE number_hash IN (SELECT number_hash FROM whatsapp_accounts WHERE address = $1)`,
    [key],
  );
  await postgresExecutor().query(`DELETE FROM whatsapp_accounts WHERE address = $1`, [key]);
}

/// Counts a number against Meta's daily limit for messages outside the
/// service window. A number already counted today is free; a new one is
/// allowed only while the day is under the limit.
export async function claimDailySlot(numberHash: string, day: string): Promise<boolean> {
  const limit = config.WHATSAPP_DAILY_LIMIT;
  if (!pgEnabled) {
    const key = `${day}:${numberHash}`;
    if (dailyInMemory.has(key)) return true;
    const today = [...dailyInMemory].filter((k) => k.startsWith(`${day}:`)).length;
    if (today >= limit) return false;
    dailyInMemory.add(key);
    return true;
  }
  const r = await postgresExecutor().query(
    `INSERT INTO whatsapp_daily (day, number_hash)
     SELECT $1, $2
     WHERE EXISTS (SELECT 1 FROM whatsapp_daily WHERE day = $1 AND number_hash = $2)
        OR (SELECT count(*) FROM whatsapp_daily WHERE day = $1) < $3
     ON CONFLICT DO NOTHING
     RETURNING number_hash`,
    [day, numberHash, limit],
  );
  if (r.rows.length === 1) return true;
  const already = await postgresExecutor().query(
    `SELECT 1 FROM whatsapp_daily WHERE day = $1 AND number_hash = $2`,
    [day, numberHash],
  );
  return already.rows.length === 1;
}
