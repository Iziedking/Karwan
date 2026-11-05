import { pgEnabled, postgresExecutor } from './client.js';
import type { SqlExecutor } from './migrations.js';

/// What a person's agent told them (view 52, step 4), one row per person, local
/// day, kind and key. The row is written before the message goes out and marked
/// sent after: inserting it is the claim, so two servers or a restart never
/// send the same brief twice. Kept 30 days.

export type ProgressKind = 'brief' | 'insight' | 'note';
export type ProgressState = 'planned' | 'sent';

export interface ProgressRow {
  owner: string;
  day: string;
  kind: ProgressKind | string;
  key: string;
  at: number;
  state: ProgressState;
  data: Record<string, unknown>;
}

export interface ProgressStore {
  /// True when this call wrote the row; false when it was already there.
  claim(owner: string, day: string, kind: string, key: string, data: Record<string, unknown>, now: number): Promise<boolean>;
  markSent(owner: string, day: string, kind: string, key: string, now: number): Promise<void>;
  /// Everything told since a time, newest first.
  toldSince(owner: string, since: number): Promise<ProgressRow[]>;
  /// Insights sent on the person's local day, in the brief or a live note.
  insightsToday(owner: string, day: string): Promise<number>;
  /// Drops rows older than the time; returns how many.
  prune(before: number): Promise<number>;
}

function parts(at: number, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '0';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/// The calendar day where the person is, as YYYY-MM-DD.
export const localDay = (at: number, timeZone: string) => parts(at, timeZone).day;
export const localHour = (at: number, timeZone: string) => parts(at, timeZone).hour;

export function memoryProgressStore(): ProgressStore & { clear(): void } {
  const mem = new Map<string, ProgressRow>();
  const id = (owner: string, day: string, kind: string, key: string) => `${owner}|${day}|${kind}|${key}`;
  return {
    clear: () => mem.clear(),
    async claim(owner, day, kind, key, data, now) {
      const k = id(owner.toLowerCase(), day, kind, key);
      if (mem.has(k)) return false;
      mem.set(k, { owner: owner.toLowerCase(), day, kind, key, at: now, state: 'planned', data });
      return true;
    },
    async markSent(owner, day, kind, key, now) {
      const k = id(owner.toLowerCase(), day, kind, key);
      const row = mem.get(k);
      if (row) mem.set(k, { ...row, state: 'sent', at: Math.max(row.at, now) });
    },
    async toldSince(owner, since) {
      const o = owner.toLowerCase();
      return [...mem.values()].filter((r) => r.owner === o && r.at >= since).sort((a, b) => b.at - a.at);
    },
    async insightsToday(owner, day) {
      const o = owner.toLowerCase();
      return [...mem.values()].filter((r) => r.owner === o && r.day === day && r.kind === 'insight').length;
    },
    async prune(before) {
      let n = 0;
      for (const [k, r] of mem) if (r.at < before) { mem.delete(k); n += 1; }
      return n;
    },
  };
}

export function postgresProgressStore(db: SqlExecutor): ProgressStore {
  return {
    async claim(owner, day, kind, key, data, now) {
      const res = await db.query(
        `INSERT INTO agent_progress_v1 (owner, day, kind, key, at, state, data) VALUES ($1, $2, $3, $4, $5, 'planned', $6)
         ON CONFLICT (owner, day, kind, key) DO NOTHING RETURNING key`,
        [owner.toLowerCase(), day, kind, key, now, JSON.stringify(data)],
      );
      return res.rows.length > 0;
    },
    async markSent(owner, day, kind, key, now) {
      await db.query(
        `UPDATE agent_progress_v1 SET state = 'sent', at = GREATEST(at, $5) WHERE owner = $1 AND day = $2 AND kind = $3 AND key = $4`,
        [owner.toLowerCase(), day, kind, key, now],
      );
    },
    async toldSince(owner, since) {
      const res = await db.query(
        'SELECT owner, day, kind, key, at, state, data FROM agent_progress_v1 WHERE owner = $1 AND at >= $2 ORDER BY at DESC LIMIT 200',
        [owner.toLowerCase(), since],
      );
      return (res.rows as unknown as Array<Omit<ProgressRow, 'at'> & { at: string | number }>).map((r) => ({ ...r, at: Number(r.at) }));
    },
    async insightsToday(owner, day) {
      const res = await db.query(`SELECT count(*)::int AS n FROM agent_progress_v1 WHERE owner = $1 AND day = $2 AND kind = 'insight'`, [owner.toLowerCase(), day]);
      return Number((res.rows[0] as { n?: number } | undefined)?.n ?? 0);
    },
    async prune(before) {
      const res = await db.query('DELETE FROM agent_progress_v1 WHERE at < $1 RETURNING key', [before]);
      return res.rows.length;
    },
  };
}

const memory = memoryProgressStore();
let store: ProgressStore | null = null;
/// The live store: Postgres when it is on, else memory.
export function progressStore(): ProgressStore {
  store ??= pgEnabled ? postgresProgressStore(postgresExecutor()) : memory;
  return store;
}
