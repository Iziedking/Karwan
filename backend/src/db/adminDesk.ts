import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { SqlExecutor } from './migrations.js';

/// Member keys for scripts and the row every desk change leaves (view 64).

const scryptAsync = promisify(scrypt);

export interface DeskKey {
  id: string;
  memberId: string;
  label: string;
  keyHash: string;
  salt: string;
  /// The member's desk epoch when the key was made: a later revoke or a page
  /// taken away ends it.
  deskEpoch: number;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface DeskKeyView {
  id: string;
  memberId: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export function toKeyView(k: DeskKey): DeskKeyView {
  return { id: k.id, memberId: k.memberId, label: k.label, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt ?? null, revokedAt: k.revokedAt ?? null };
}

export type DeskVia = 'session' | 'key' | 'shared-token' | 'sign-in';

export interface DeskActionRow {
  id: string;
  at: number;
  memberId: string | null;
  memberEmail: string | null;
  via: DeskVia;
  method: string;
  path: string;
  outcome: 'done' | 'refused' | 'failed';
  status: number;
  /// The request as sent, with anything secret-looking removed.
  request: unknown;
  /// What the route answered.
  result: unknown;
}

export interface AdminDeskStore {
  insertKey(k: DeskKey): Promise<void>;
  getKey(id: string): Promise<DeskKey | null>;
  listKeys(memberId?: string): Promise<DeskKey[]>;
  revokeKey(id: string, at: number): Promise<DeskKey | null>;
  revokeKeysOf(memberId: string, at: number): Promise<number>;
  touchKey(id: string, at: number): Promise<void>;
  insertAction(row: DeskActionRow): Promise<void>;
  listActions(opts: { limit: number; before?: number }): Promise<DeskActionRow[]>;
}

export function memoryAdminDeskStore(): AdminDeskStore {
  const keys = new Map<string, DeskKey>();
  const actions: DeskActionRow[] = [];
  return {
    async insertKey(k) {
      keys.set(k.id, { ...k });
    },
    async getKey(id) {
      const k = keys.get(id);
      return k ? { ...k } : null;
    },
    async listKeys(memberId) {
      return [...keys.values()].filter((k) => !memberId || k.memberId === memberId).sort((a, b) => b.createdAt - a.createdAt).map((k) => ({ ...k }));
    },
    async revokeKey(id, at) {
      const k = keys.get(id);
      if (!k) return null;
      if (!k.revokedAt) k.revokedAt = at;
      return { ...k };
    },
    async revokeKeysOf(memberId, at) {
      let n = 0;
      for (const k of keys.values()) if (k.memberId === memberId && !k.revokedAt) ((k.revokedAt = at), n++);
      return n;
    },
    async touchKey(id, at) {
      const k = keys.get(id);
      if (k) k.lastUsedAt = at;
    },
    async insertAction(row) {
      actions.push(structuredClone(row));
    },
    async listActions({ limit, before }) {
      return actions.filter((a) => before === undefined || a.at < before).sort((a, b) => b.at - a.at).slice(0, limit).map((a) => structuredClone(a));
    },
  };
}

export function postgresAdminDeskStore(executor: SqlExecutor): AdminDeskStore {
  const keyOf = (row: { data: DeskKey }) => row.data;
  return {
    async insertKey(k) {
      await executor.query(`INSERT INTO admin_desk_keys_v1 (id, member_id, data) VALUES ($1, $2, $3)`, [k.id, k.memberId, JSON.stringify(k)]);
    },
    async getKey(id) {
      const r = await executor.query(`SELECT data FROM admin_desk_keys_v1 WHERE id = $1`, [id]);
      return r.rows[0] ? keyOf(r.rows[0] as { data: DeskKey }) : null;
    },
    async listKeys(memberId) {
      const r = memberId
        ? await executor.query(`SELECT data FROM admin_desk_keys_v1 WHERE member_id = $1`, [memberId])
        : await executor.query(`SELECT data FROM admin_desk_keys_v1`, []);
      return (r.rows as Array<{ data: DeskKey }>).map(keyOf).sort((a, b) => b.createdAt - a.createdAt);
    },
    async revokeKey(id, at) {
      const r = await executor.query(
        `UPDATE admin_desk_keys_v1
            SET data = CASE WHEN data ? 'revokedAt' THEN data ELSE jsonb_set(data, '{revokedAt}', to_jsonb($2::bigint)) END
          WHERE id = $1 RETURNING data`,
        [id, at],
      );
      return r.rows[0] ? keyOf(r.rows[0] as { data: DeskKey }) : null;
    },
    async revokeKeysOf(memberId, at) {
      const r = await executor.query(
        `UPDATE admin_desk_keys_v1 SET data = jsonb_set(data, '{revokedAt}', to_jsonb($2::bigint))
          WHERE member_id = $1 AND NOT (data ? 'revokedAt') RETURNING id`,
        [memberId, at],
      );
      return r.rows.length;
    },
    async touchKey(id, at) {
      await executor.query(`UPDATE admin_desk_keys_v1 SET data = jsonb_set(data, '{lastUsedAt}', to_jsonb($2::bigint)) WHERE id = $1`, [id, at]);
    },
    async insertAction(row) {
      await executor.query(
        `INSERT INTO admin_actions_v1 (id, at, member_id, method, path, outcome, data) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.at, row.memberId, row.method, row.path, row.outcome, JSON.stringify(row)],
      );
    },
    async listActions({ limit, before }) {
      const r = await executor.query(
        `SELECT data FROM admin_actions_v1 WHERE ($1::bigint IS NULL OR at < $1) ORDER BY at DESC LIMIT $2`,
        [before ?? null, limit],
      );
      return (r.rows as Array<{ data: DeskActionRow }>).map((x) => x.data);
    },
  };
}

// ---------------------------------------------------------------- key material

const KEY_PREFIX = 'karwandesk';

async function hash(secret: string, salt: string): Promise<string> {
  return ((await scryptAsync(secret, salt, 32)) as Buffer).toString('hex');
}

export async function makeDeskKey(input: { memberId: string; label: string; deskEpoch: number; now: number }): Promise<{ key: DeskKey; rawKey: string }> {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const key: DeskKey = { id, memberId: input.memberId, label: input.label, keyHash: await hash(secret, salt), salt, deskEpoch: input.deskEpoch, createdAt: input.now };
  return { key, rawKey: `${KEY_PREFIX}_${id}_${secret}` };
}

export function isDeskKey(raw: string): boolean {
  return raw.startsWith(`${KEY_PREFIX}_`);
}

/// The key named by a raw value, when its secret matches and it is not revoked.
/// A uuid has no underscore, so the id ends at the second one; the secret is
/// base64url and may itself contain underscores.
export async function checkDeskKey(store: AdminDeskStore, raw: string): Promise<DeskKey | null> {
  if (!isDeskKey(raw)) return null;
  const rest = raw.slice(KEY_PREFIX.length + 1);
  const cut = rest.indexOf('_');
  if (cut <= 0) return null;
  const key = await store.getKey(rest.slice(0, cut));
  if (!key || key.revokedAt) return null;
  const a = Buffer.from(await hash(rest.slice(cut + 1), key.salt), 'hex');
  const b = Buffer.from(key.keyHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? key : null;
}

const SECRET_FIELD = /pass|secret|token|key|otp|code/i;

/// The request body as it goes on a row: secret-looking fields dropped, long
/// text cut, so the log never becomes a place to find credentials.
export function redactForRow(value: unknown, depth = 0): unknown {
  if (depth > 4) return '…';
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactForRow(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_FIELD.test(k) ? '[removed]' : redactForRow(v, depth + 1);
    return out;
  }
  return value;
}
