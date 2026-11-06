import { randomBytes } from 'node:crypto';
import type { SqlExecutor } from '../db/migrations.js';

/// A record for every sign-in (view 65). The cookie carries the record's id and
/// every request checks it against the closed list this process keeps in memory,
/// refreshed from the database every minute.

export interface SessionRecord {
  sid: string;
  address: string;
  method: 'web3' | 'circle';
  /// A plain device name read from the browser, such as "Chrome on Windows".
  device: string;
  via?: 'open_link';
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  closedAt?: number;
}

export interface SessionRecordStore {
  insert(r: SessionRecord): Promise<void>;
  openFor(address: string, now: number): Promise<SessionRecord[]>;
  get(sid: string): Promise<SessionRecord | null>;
  close(sid: string, at: number): Promise<boolean>;
  closeAllFor(address: string, at: number): Promise<string[]>;
  touch(sid: string, at: number): Promise<void>;
  closedSince(now: number): Promise<string[]>;
}

export function newSid(): string {
  return randomBytes(18).toString('base64url');
}

export function memorySessionRecordStore(): SessionRecordStore {
  const rows = new Map<string, SessionRecord>();
  return {
    async insert(r) {
      rows.set(r.sid, { ...r });
    },
    async openFor(address, now) {
      return [...rows.values()].filter((r) => r.address === address && !r.closedAt && r.expiresAt > now).map((r) => ({ ...r }));
    },
    async get(sid) {
      const r = rows.get(sid);
      return r ? { ...r } : null;
    },
    async close(sid, at) {
      const r = rows.get(sid);
      if (!r || r.closedAt) return false;
      r.closedAt = at;
      return true;
    },
    async closeAllFor(address, at) {
      const out: string[] = [];
      for (const r of rows.values()) if (r.address === address && !r.closedAt) ((r.closedAt = at), out.push(r.sid));
      return out;
    },
    async touch(sid, at) {
      const r = rows.get(sid);
      if (r) r.lastSeenAt = at;
    },
    async closedSince(now) {
      return [...rows.values()].filter((r) => r.closedAt && r.expiresAt > now).map((r) => r.sid);
    },
  };
}

export function postgresSessionRecordStore(executor: SqlExecutor): SessionRecordStore {
  const of = (rows: unknown[]) => (rows as Array<{ data: SessionRecord }>).map((x) => x.data);
  return {
    async insert(r) {
      await executor.query(
        `INSERT INTO user_sessions_v1 (sid, address, expires_at, closed_at, data) VALUES ($1, $2, $3, NULL, $4) ON CONFLICT (sid) DO NOTHING`,
        [r.sid, r.address, r.expiresAt, JSON.stringify(r)],
      );
    },
    async openFor(address, now) {
      const q = await executor.query(`SELECT data FROM user_sessions_v1 WHERE address = $1 AND closed_at IS NULL AND expires_at > $2`, [address, now]);
      return of(q.rows);
    },
    async get(sid) {
      const q = await executor.query(`SELECT data FROM user_sessions_v1 WHERE sid = $1`, [sid]);
      return of(q.rows)[0] ?? null;
    },
    async close(sid, at) {
      const q = await executor.query(
        `UPDATE user_sessions_v1 SET closed_at = $2, data = jsonb_set(data, '{closedAt}', to_jsonb($2::bigint)) WHERE sid = $1 AND closed_at IS NULL RETURNING sid`,
        [sid, at],
      );
      return q.rows.length === 1;
    },
    async closeAllFor(address, at) {
      const q = await executor.query(
        `UPDATE user_sessions_v1 SET closed_at = $2, data = jsonb_set(data, '{closedAt}', to_jsonb($2::bigint)) WHERE address = $1 AND closed_at IS NULL RETURNING sid`,
        [address, at],
      );
      return (q.rows as Array<{ sid: string }>).map((r) => r.sid);
    },
    async touch(sid, at) {
      await executor.query(`UPDATE user_sessions_v1 SET data = jsonb_set(data, '{lastSeenAt}', to_jsonb($2::bigint)) WHERE sid = $1`, [sid, at]);
    },
    async closedSince(now) {
      const q = await executor.query(`SELECT sid FROM user_sessions_v1 WHERE closed_at IS NOT NULL AND expires_at > $1`, [now]);
      return (q.rows as Array<{ sid: string }>).map((r) => r.sid);
    },
  };
}

/// "Chrome on Windows", "Safari on iPhone". Coarse on purpose: enough for a
/// person to recognise a device, nothing that identifies them.
export function deviceName(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'an unknown system';
  return `${browser} on ${os}`;
}

/// The closed ids this process knows, refreshed every minute. A sign-out on
/// this process is added at once; one on another process arrives on refresh.
export function createClosedList(load: () => Promise<string[]>) {
  let closed = new Set<string>();
  // Closed here since the last refresh started, kept until the database shows them.
  let recent = new Set<string>();
  return {
    has: (sid: string) => closed.has(sid) || recent.has(sid),
    add: (sids: string[]) => {
      for (const s of sids) recent.add(s);
    },
    async refresh(): Promise<void> {
      const carried = recent;
      recent = new Set();
      try {
        const next = new Set(await load());
        for (const s of carried) next.add(s);
        closed = next;
      } catch (err) {
        for (const s of carried) recent.add(s);
        throw err;
      }
    },
  };
}
