import { config } from '../config.js';
import { parseEmailList } from '../profile/waitlistRules.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// The mainnet waitlist and the invite list that lets people past it.
/// Postgres in production; an in-memory map when there is no database (local
/// development only, so nothing here is lost that mattered).

export interface WaitlistEntry {
  email: string;
  locale: string;
  joinedAt: number;
}

export interface Invite {
  email: string;
  note: string | null;
  addedBy: string;
  addedAt: number;
  /// When the "you're in" email went out; null if it never did.
  emailedAt: number | null;
}

const waitMem = new Map<string, WaitlistEntry>();
const inviteMem = new Map<string, Invite>();

const norm = (email: string) => email.trim().toLowerCase();

/// Idempotent: joining twice keeps the first join time, so a person's place
/// never moves back. `created` says whether this call added them.
export async function joinWaitlist(email: string, locale: string): Promise<{ entry: WaitlistEntry; created: boolean }> {
  const e = norm(email);
  const now = Date.now();
  if (!pgEnabled) {
    const existing = waitMem.get(e);
    if (existing) return { entry: existing, created: false };
    const entry = { email: e, locale, joinedAt: now };
    waitMem.set(e, entry);
    return { entry, created: true };
  }
  const db = postgresExecutor();
  const inserted = await db.query<{ email: string; locale: string; joined_at: string }>(
    `INSERT INTO waitlist_v1 (email, locale, joined_at) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING email, locale, joined_at`,
    [e, locale, now],
  );
  const created = inserted.rows.length > 0;
  const row = created
    ? inserted.rows[0]!
    : (await db.query<{ email: string; locale: string; joined_at: string }>(
        'SELECT email, locale, joined_at FROM waitlist_v1 WHERE email = $1',
        [e],
      )).rows[0]!;
  return { entry: { email: row.email, locale: row.locale, joinedAt: Number(row.joined_at) }, created };
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  if (!pgEnabled) return [...waitMem.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const { rows } = await postgresExecutor().query<{ email: string; locale: string; joined_at: string }>(
    'SELECT email, locale, joined_at FROM waitlist_v1 ORDER BY joined_at ASC',
  );
  return rows.map((r) => ({ email: r.email, locale: r.locale, joinedAt: Number(r.joined_at) }));
}

/// Invites from the MAINNET_INVITES env variable.
export const ENV_INVITES: ReadonlySet<string> = new Set(parseEmailList(config.MAINNET_INVITES ?? '').valid);

export async function isInvited(email: string): Promise<boolean> {
  const e = norm(email);
  if (ENV_INVITES.has(e)) return true;
  if (!pgEnabled) return inviteMem.has(e);
  const { rows } = await postgresExecutor().query('SELECT 1 FROM mainnet_invites_v1 WHERE email = $1', [e]);
  return rows.length > 0;
}

export async function listInvites(): Promise<Invite[]> {
  if (!pgEnabled) return [...inviteMem.values()].sort((a, b) => a.addedAt - b.addedAt);
  const { rows } = await postgresExecutor().query<{ email: string; note: string | null; added_by: string; added_at: string; emailed_at: string | null }>(
    'SELECT email, note, added_by, added_at, emailed_at FROM mainnet_invites_v1 ORDER BY added_at ASC',
  );
  return rows.map((r) => ({
    email: r.email,
    note: r.note,
    addedBy: r.added_by,
    addedAt: Number(r.added_at),
    emailedAt: r.emailed_at == null ? null : Number(r.emailed_at),
  }));
}

/// Adds any email not already invited; returns how many were new.
export async function addInvites(emails: string[], addedBy: string, note: string | null): Promise<number> {
  const now = Date.now();
  let added = 0;
  for (const raw of emails) {
    const e = norm(raw);
    if (!pgEnabled) {
      if (!inviteMem.has(e)) {
        inviteMem.set(e, { email: e, note, addedBy, addedAt: now, emailedAt: null });
        added += 1;
      }
      continue;
    }
    const { rows } = await postgresExecutor().query(
      `INSERT INTO mainnet_invites_v1 (email, note, added_by, added_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING RETURNING email`,
      [e, note, addedBy, now],
    );
    added += rows.length;
  }
  return added;
}

export async function removeInvite(email: string): Promise<boolean> {
  const e = norm(email);
  if (!pgEnabled) return inviteMem.delete(e);
  const { rows } = await postgresExecutor().query('DELETE FROM mainnet_invites_v1 WHERE email = $1 RETURNING email', [e]);
  return rows.length > 0;
}

export async function markInviteEmailed(email: string): Promise<void> {
  const e = norm(email);
  const now = Date.now();
  if (!pgEnabled) {
    const invite = inviteMem.get(e);
    if (invite) invite.emailedAt = now;
    return;
  }
  await postgresExecutor().query('UPDATE mainnet_invites_v1 SET emailed_at = $2 WHERE email = $1', [e, now]);
}

/// 1-based place in line: how many joined at or before this person.
export async function waitlistPosition(email: string): Promise<number | null> {
  const e = norm(email);
  if (!pgEnabled) {
    const me = waitMem.get(e);
    if (!me) return null;
    return [...waitMem.values()].filter((w) => w.joinedAt <= me.joinedAt).length;
  }
  const { rows } = await postgresExecutor().query<{ n: string }>(
    `SELECT count(*) AS n FROM waitlist_v1
     WHERE joined_at <= (SELECT joined_at FROM waitlist_v1 WHERE email = $1)`,
    [e],
  );
  const n = Number(rows[0]?.n ?? 0);
  return n > 0 ? n : null;
}
