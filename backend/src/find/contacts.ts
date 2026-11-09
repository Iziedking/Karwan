import { pgEnabled, withPostgresTransaction, postgresExecutor } from '../db/client.js';
import { blockedEitherWay } from './blocks.js';
import { allowedToContact, DAY_MS, type ContactCounts, type LimitReason } from './limits.js';

/// Who was contacted from a find (view 72): a deal alert to a seller, or a
/// pitch to a buyer. Rows, not timers: each carries when it is next due, and a
/// sweep claims due rows with one conditional write, so a restart or a second
/// server neither loses nor repeats a reminder (spec S4).

export type ContactKind = 'alert' | 'pitch';
export type ContactAnswer = 'interested' | 'not_now' | 'no';

export interface Contact {
  id: string;
  findId: string;
  /// The person whose agent sent it, and the person it went to.
  from: string;
  to: string;
  kind: ContactKind;
  needId: string | null;
  sentAt: number;
  /// False while it waits for a seller whose day of alerts is full.
  delivered: boolean;
  /// When the sweep next acts on it; null when nothing is due.
  nextAt: number | null;
  reminders: number;
  answer: ContactAnswer | null;
  answeredAt: number | null;
  /// The find matched or ended, or the last reminder passed.
  closedAt: number | null;
}

export type CreateResult = { ok: true; contact: Contact } | { ok: false; reason: LimitReason };

export interface NewContact {
  id: string;
  findId: string;
  from: string;
  to: string;
  kind: ContactKind;
  needId: string | null;
}

const lower = (s: string) => s.toLowerCase();
const mem = new Map<string, Contact>();

/// Memory store (tests, no database): one write at a time, like the locks in Postgres.
let chain: Promise<unknown> = Promise.resolve();
async function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}

function countsFrom(rows: Contact[], c: NewContact, now: number, blocked: boolean): ContactCounts {
  const day = now - DAY_MS;
  const from = lower(c.from), to = lower(c.to);
  const same = (r: Contact) => r.kind === 'pitch' && r.from === from && r.to === to && r.needId === c.needId;
  const lastPitch = rows.filter((r) => same(r) && (r.answer === 'no' || r.answer === 'not_now')).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))[0];
  return {
    blocked,
    alreadyContacted: c.kind === 'alert'
      ? rows.some((r) => r.kind === 'alert' && r.findId === c.findId && r.to === to)
      : rows.some((r) => same(r) && (r.answer === null || r.answer === 'interested')),
    openOnFind: rows.filter((r) => r.kind === 'alert' && r.findId === c.findId && r.answer === null && r.closedAt === null).length,
    sentByBuyerToday: rows.filter((r) => r.kind === 'alert' && r.from === from && r.sentAt > day).length,
    receivedBySellerToday: rows.filter((r) => r.kind === 'alert' && r.to === to && r.sentAt > day).length,
    pitchesToNeedToday: rows.filter((r) => r.kind === 'pitch' && r.needId === c.needId && r.sentAt > day).length,
    pitchesBySellerToday: rows.filter((r) => r.kind === 'pitch' && r.from === from && r.sentAt > day).length,
    lastPitchAnswer: lastPitch ? { answer: lastPitch.answer as 'no' | 'not_now', at: lastPitch.answeredAt ?? 0 } : null,
  };
}

function rowOf(r: { data: unknown }): Contact {
  return r.data as Contact;
}

/// Checks every limit and creates the contact in one locked write. `firstDue`
/// says when the sweep first acts on it once delivered (its first reminder).
export async function createContact(c: NewContact, now: number, firstDue: (sentAt: number) => Promise<number | null>): Promise<CreateResult> {
  const from = lower(c.from), to = lower(c.to);
  const make = async (deliverAt: number): Promise<Contact> => {
    const delivered = deliverAt <= now;
    return {
      id: c.id, findId: c.findId, from, to, kind: c.kind, needId: c.needId, sentAt: deliverAt, delivered,
      nextAt: delivered ? await firstDue(deliverAt) : deliverAt, reminders: 0, answer: null, answeredAt: null, closedAt: null,
    };
  };
  if (!pgEnabled) {
    return serial(async () => {
      const counts = countsFrom([...mem.values()], c, now, await blockedEitherWay(from, to));
      const allowed = allowedToContact(counts, { kind: c.kind, from, to, now });
      if (!allowed.ok) return allowed;
      const contact = await make(allowed.deliverAt);
      mem.set(contact.id, contact);
      return { ok: true as const, contact };
    });
  }
  const blocked = await blockedEitherWay(from, to);
  return withPostgresTransaction(async (tx) => {
    for (const k of [from, to].sort()) await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`find-contact:${k}`]);
    const r = await tx.query<{ data: unknown }>(
      `SELECT data FROM find_contacts_v1 WHERE from_addr IN ($1, $2) OR to_addr IN ($1, $2) OR find_id = $3 OR need_id = $4`,
      [from, to, c.findId, c.needId],
    );
    const allowed = allowedToContact(countsFrom(r.rows.map(rowOf), c, now, blocked), { kind: c.kind, from, to, now });
    if (!allowed.ok) return allowed;
    const contact = await make(allowed.deliverAt);
    await tx.query(
      `INSERT INTO find_contacts_v1 (id, find_id, from_addr, to_addr, kind, need_id, sent_at, next_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [contact.id, contact.findId, from, to, contact.kind, contact.needId, contact.sentAt, contact.nextAt, contact],
    );
    return { ok: true as const, contact };
  });
}

async function update(id: string, change: (c: Contact) => Contact | null): Promise<Contact | null> {
  if (!pgEnabled) {
    const cur = mem.get(id);
    const next = cur ? change(cur) : null;
    if (next) mem.set(id, next);
    return next;
  }
  return withPostgresTransaction(async (tx) => {
    const r = await tx.query<{ data: unknown }>(`SELECT data FROM find_contacts_v1 WHERE id = $1 FOR UPDATE`, [id]);
    const cur = r.rows[0] ? rowOf(r.rows[0]) : null;
    const next = cur ? change(cur) : null;
    if (next) await tx.query(`UPDATE find_contacts_v1 SET next_at = $2, data = $3 WHERE id = $1`, [id, next.nextAt, next]);
    return next;
  });
}

/// Only the person contacted answers, once. A second answer changes nothing.
export async function answerContact(id: string, by: string, answer: ContactAnswer, now: number): Promise<Contact | null> {
  return update(id, (c) => (c.to !== lower(by) || c.answer !== null ? null : { ...c, answer, answeredAt: now, nextAt: null }));
}

/// The find matched or ended: nothing more goes out for it.
export async function closeContactsOfFind(findId: string, now: number): Promise<void> {
  for (const c of await contactsOfFind(findId)) {
    if (c.closedAt === null) await update(c.id, (x) => ({ ...x, closedAt: now, nextAt: null }));
  }
}

export async function contactsOfFind(findId: string): Promise<Contact[]> {
  if (!pgEnabled) return [...mem.values()].filter((c) => c.findId === findId).sort((a, b) => a.sentAt - b.sentAt);
  const r = await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM find_contacts_v1 WHERE find_id = $1 ORDER BY sent_at`, [findId]);
  return r.rows.map(rowOf);
}

export async function contactOf(id: string): Promise<Contact | null> {
  if (!pgEnabled) return mem.get(id) ?? null;
  const r = await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM find_contacts_v1 WHERE id = $1`, [id]);
  return r.rows[0] ? rowOf(r.rows[0]) : null;
}

export type Claimed = { contact: Contact; step: 'deliver' | 'remind' };

/// Claims what is due now. Each row is taken by one sweep only: the write
/// succeeds only while the row still holds the time that was read.
export async function claimDue(now: number, nextAfter: (c: Contact) => Promise<number | null>, limit = 100): Promise<Claimed[]> {
  const due = !pgEnabled
    ? [...mem.values()].filter((c) => c.nextAt !== null && c.nextAt <= now && c.answer === null && c.closedAt === null).slice(0, limit)
    : (await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM find_contacts_v1 WHERE next_at IS NOT NULL AND next_at <= $1 ORDER BY next_at LIMIT $2`, [now, limit])).rows.map(rowOf);
  const out: Claimed[] = [];
  for (const c of due) {
    const step: Claimed['step'] = c.delivered ? 'remind' : 'deliver';
    const moved: Contact = step === 'deliver' ? { ...c, delivered: true } : { ...c, reminders: c.reminders + 1 };
    const nextAt = await nextAfter(moved);
    const next: Contact = { ...moved, nextAt, closedAt: nextAt === null && step === 'remind' ? now : moved.closedAt };
    let won = false;
    if (!pgEnabled) {
      const cur = mem.get(c.id);
      if (cur && cur.nextAt === c.nextAt && cur.answer === null && cur.closedAt === null) {
        mem.set(c.id, next);
        won = true;
      }
    } else {
      const r = await postgresExecutor().query(
        `UPDATE find_contacts_v1 SET next_at = $3, data = $4 WHERE id = $1 AND next_at = $2 AND data->>'answer' IS NULL AND data->>'closedAt' IS NULL RETURNING id`,
        [c.id, c.nextAt, next.nextAt, next],
      );
      won = r.rows.length === 1;
    }
    if (won) out.push({ contact: next, step });
  }
  return out;
}

export async function deleteContactsOf(person: string): Promise<void> {
  const p = lower(person);
  if (!pgEnabled) {
    for (const [id, c] of mem) if (c.from === p || c.to === p) mem.delete(id);
    return;
  }
  await postgresExecutor().query(`DELETE FROM find_contacts_v1 WHERE from_addr = $1 OR to_addr = $1`, [p]);
}

/// For tests only.
export function resetContactsForTests(): void {
  mem.clear();
  chain = Promise.resolve();
}
