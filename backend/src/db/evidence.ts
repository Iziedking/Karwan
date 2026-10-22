import { pgEnabled, postgresExecutor } from './client.js';

/// Verification records, one table for the few kinds there are:
///   facts      key = address    the person's verified facts
///   fp         key = fingerprint which account an invoice backs
///   nullifier  key = nullifier  which account a World ID belongs to
///   confirm    key = request id a past client's confirmation request
///   cac        key = request id a business registration waiting for review
///   rc         key = RC or BN   which account a business registration backs
///   delivery-q key = address    countries a seller's agent will ask about
///   dm-history key = address    who someone messaged first by tag, and who replied
///   ratings-asked key = deal id who was asked to rate a deal, reminded, and told of the reveal
///   suggested  key = owner|request  "ask me first" already told this owner about this request
export type RecordKind = 'facts' | 'fp' | 'nullifier' | 'confirm' | 'cac' | 'rc' | 'delivery-q' | 'dm-history' | 'ratings-asked' | 'suggested';
type UniqueKind = 'fp' | 'nullifier' | 'rc';

const memory = new Map<string, unknown>();
const memKey = (kind: RecordKind, key: string) => `${kind}:${key}`;

export async function getRecord<T>(kind: RecordKind, key: string): Promise<T | null> {
  if (!pgEnabled) return (memory.get(memKey(kind, key)) as T | undefined) ?? null;
  const r = await postgresExecutor().query<{ data: T }>(
    `SELECT data FROM verification_records WHERE kind = $1 AND key = $2`,
    [kind, key],
  );
  return r.rows[0]?.data ?? null;
}

export async function putRecord<T>(kind: RecordKind, key: string, data: T): Promise<void> {
  if (!pgEnabled) {
    memory.set(memKey(kind, key), data);
    return;
  }
  await postgresExecutor().query(
    `INSERT INTO verification_records (kind, key, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (kind, key) DO UPDATE SET data = EXCLUDED.data`,
    [kind, key, JSON.stringify(data)],
  );
}

export async function listRecords<T>(kind: RecordKind): Promise<{ key: string; data: T }[]> {
  if (!pgEnabled) {
    const prefix = `${kind}:`;
    return [...memory.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, data]) => ({ key: k.slice(prefix.length), data: data as T }));
  }
  const r = await postgresExecutor().query<{ key: string; data: T }>(
    `SELECT key, data FROM verification_records WHERE kind = $1`,
    [kind],
  );
  return r.rows;
}

export async function deleteRecord(kind: RecordKind, key: string): Promise<void> {
  if (!pgEnabled) {
    memory.delete(memKey(kind, key));
    return;
  }
  await postgresExecutor().query(`DELETE FROM verification_records WHERE kind = $1 AND key = $2`, [kind, key]);
}

/// Every key of a unique kind that one account holds.
export async function keysHeldBy(kind: UniqueKind, owner: string): Promise<string[]> {
  const who = owner.toLowerCase();
  if (!pgEnabled) {
    const prefix = `${kind}:`;
    return [...memory.entries()]
      .filter(([k, v]) => k.startsWith(prefix) && (v as { owner?: string }).owner === who)
      .map(([k]) => k.slice(prefix.length));
  }
  const r = await postgresExecutor().query<{ key: string }>(
    `SELECT key FROM verification_records WHERE kind = $1 AND data->>'owner' = $2`,
    [kind, who],
  );
  return r.rows.map((row) => row.key);
}

/// Ties a key (an invoice fingerprint, a World ID nullifier) to one owner.
/// True when the key is new or already this owner's.
export async function claimUnique(kind: UniqueKind, key: string, owner: string): Promise<boolean> {
  const who = owner.toLowerCase();
  if (!pgEnabled) {
    const held = memory.get(memKey(kind, key)) as { owner: string } | undefined;
    if (held) return held.owner === who;
    memory.set(memKey(kind, key), { owner: who });
    return true;
  }
  await postgresExecutor().query(
    `INSERT INTO verification_records (kind, key, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING`,
    [kind, key, JSON.stringify({ owner: who })],
  );
  const held = await getRecord<{ owner: string }>(kind, key);
  return held?.owner === who;
}

/// The account a unique key belongs to, or null when it is free.
export async function holderOf(kind: UniqueKind, key: string): Promise<string | null> {
  const held = pgEnabled
    ? await getRecord<{ owner: string }>(kind, key)
    : ((memory.get(memKey(kind, key)) as { owner: string } | undefined) ?? null);
  return held?.owner ?? null;
}

/// Frees a unique key, only when this owner holds it.
export async function releaseUnique(kind: UniqueKind, key: string, owner: string): Promise<void> {
  const who = owner.toLowerCase();
  if (!pgEnabled) {
    const held = memory.get(memKey(kind, key)) as { owner: string } | undefined;
    if (held?.owner === who) memory.delete(memKey(kind, key));
    return;
  }
  await postgresExecutor().query(
    `DELETE FROM verification_records WHERE kind = $1 AND key = $2 AND data->>'owner' = $3`,
    [kind, key, who],
  );
}
