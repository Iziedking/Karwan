import { randomUUID } from 'node:crypto';
import { pgEnabled, postgresExecutor } from './client.js';
import { RECOVERY_WAIT_MS, type RecoveryRequest } from '../recovery/rules.js';

/// Passkey recovery storage: the sealed backup per wallet, the recovery
/// requests (at most one live per wallet, enforced by a partial unique index)
/// and the password attempts behind the lockout. Postgres in production, maps
/// in memory for local runs without a database.

export interface RecoveryBackup {
  walletAddress: string;
  emailHash: string;
  recoveryAddress: string;
  kdf: { alg: 'argon2id'; m: number; t: number; p: number; salt: string };
  iv: string;
  sealedBlob: Uint8Array;
  sealedVerifier: Uint8Array;
  createdAt: number;
  registeredAt: number | null;
}

const lc = (a: string) => a.toLowerCase();
const backups = new Map<string, RecoveryBackup>();
const requests = new Map<string, RecoveryRequest & { cancelTokenHash: string | null }>();
const attempts: Array<{ wallet: string; at: number; ok: boolean }> = [];
const LIVE = new Set(['waiting', 'released']);

interface ReqRow extends Record<string, unknown> {
  id: string;
  wallet_address: string;
  state: RecoveryRequest['state'];
  created_at: string;
  releasable_at: string;
  released_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  reminder_sent_at: string | null;
}

interface BackupRow extends Record<string, unknown> {
  wallet_address: string;
  email_hash: string;
  recovery_address: string;
  kdf: RecoveryBackup['kdf'];
  iv: string;
  sealed_blob: Buffer;
  sealed_verifier: Buffer;
  created_at: string;
  registered_at: string | null;
}

const num = (v: string | null) => (v === null ? null : Number(v));
const toReq = (r: ReqRow): RecoveryRequest => ({
  id: r.id,
  walletAddress: r.wallet_address,
  state: r.state,
  createdAt: Number(r.created_at),
  releasableAt: Number(r.releasable_at),
  releasedAt: num(r.released_at),
  completedAt: num(r.completed_at),
  cancelledAt: num(r.cancelled_at),
  reminderSentAt: num(r.reminder_sent_at),
});

export async function saveBackup(b: RecoveryBackup): Promise<'created' | 'exists'> {
  const w = lc(b.walletAddress);
  if (!pgEnabled) {
    if (backups.has(w)) return 'exists';
    backups.set(w, { ...b, walletAddress: w, recoveryAddress: lc(b.recoveryAddress) });
    return 'created';
  }
  const res = await postgresExecutor().query(
    `INSERT INTO recovery_backups_v1
       (wallet_address, email_hash, recovery_address, kdf, iv, sealed_blob, sealed_verifier, created_at, registered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
     ON CONFLICT (wallet_address) DO NOTHING RETURNING wallet_address`,
    [w, b.emailHash, lc(b.recoveryAddress), JSON.stringify(b.kdf), b.iv, Buffer.from(b.sealedBlob), Buffer.from(b.sealedVerifier), b.createdAt],
  );
  return res.rows.length === 1 ? 'created' : 'exists';
}

export async function getBackup(wallet: string): Promise<RecoveryBackup | null> {
  const w = lc(wallet);
  if (!pgEnabled) return backups.get(w) ?? null;
  const { rows } = await postgresExecutor().query<BackupRow>('SELECT * FROM recovery_backups_v1 WHERE wallet_address = $1', [w]);
  const r = rows[0];
  if (!r) return null;
  return {
    walletAddress: r.wallet_address,
    emailHash: r.email_hash,
    recoveryAddress: r.recovery_address,
    kdf: r.kdf,
    iv: r.iv,
    sealedBlob: new Uint8Array(r.sealed_blob),
    sealedVerifier: new Uint8Array(r.sealed_verifier),
    createdAt: Number(r.created_at),
    registeredAt: num(r.registered_at),
  };
}

/// Records the first on-chain registration only; later calls keep that time.
export async function markRegistered(wallet: string, at: number): Promise<void> {
  const w = lc(wallet);
  if (!pgEnabled) {
    const b = backups.get(w);
    if (b && b.registeredAt === null) b.registeredAt = at;
    return;
  }
  await postgresExecutor().query(
    'UPDATE recovery_backups_v1 SET registered_at = $2 WHERE wallet_address = $1 AND registered_at IS NULL',
    [w, at],
  );
}

export async function liveRequest(wallet: string): Promise<RecoveryRequest | null> {
  const w = lc(wallet);
  if (!pgEnabled) {
    for (const r of requests.values()) if (r.walletAddress === w && LIVE.has(r.state)) return r;
    return null;
  }
  const { rows } = await postgresExecutor().query<ReqRow>(
    `SELECT * FROM recovery_requests_v1 WHERE wallet_address = $1 AND state IN ('waiting', 'released')`,
    [w],
  );
  return rows[0] ? toReq(rows[0]) : null;
}

/// Starting twice keeps the first request and its clock.
export async function openRequest(wallet: string, now: number): Promise<{ request: RecoveryRequest; created: boolean }> {
  const w = lc(wallet);
  const existing = await liveRequest(w);
  if (existing) return { request: existing, created: false };
  const request: RecoveryRequest = {
    id: randomUUID(),
    walletAddress: w,
    state: 'waiting',
    createdAt: now,
    releasableAt: now + RECOVERY_WAIT_MS,
    releasedAt: null,
    completedAt: null,
    cancelledAt: null,
    reminderSentAt: null,
  };
  if (!pgEnabled) {
    requests.set(request.id, { ...request, cancelTokenHash: null });
    return { request, created: true };
  }
  const inserted = await postgresExecutor().query(
    `INSERT INTO recovery_requests_v1 (id, wallet_address, state, created_at, releasable_at)
     VALUES ($1, $2, 'waiting', $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
    [request.id, w, now, request.releasableAt],
  );
  if (inserted.rows.length === 1) return { request, created: true };
  const raced = await liveRequest(w);
  if (!raced) throw new Error('could not open recovery request');
  return { request: raced, created: false };
}

const COLS: Partial<Record<keyof RecoveryRequest, string>> = {
  state: 'state',
  releasedAt: 'released_at',
  completedAt: 'completed_at',
  cancelledAt: 'cancelled_at',
  reminderSentAt: 'reminder_sent_at',
};

export async function setRequestState(id: string, patch: Partial<RecoveryRequest>): Promise<void> {
  if (!pgEnabled) {
    const r = requests.get(id);
    if (r) Object.assign(r, patch);
    return;
  }
  const keys = (Object.keys(patch) as Array<keyof RecoveryRequest>).filter((k) => COLS[k]);
  if (!keys.length) return;
  await postgresExecutor().query(
    `UPDATE recovery_requests_v1 SET ${keys.map((k, i) => `${COLS[k]} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [id, ...keys.map((k) => patch[k])],
  );
}

export async function listRequestsNeedingWork(): Promise<RecoveryRequest[]> {
  if (!pgEnabled) return [...requests.values()].filter((r) => LIVE.has(r.state));
  const { rows } = await postgresExecutor().query<ReqRow>(
    `SELECT * FROM recovery_requests_v1 WHERE state IN ('waiting', 'released')`,
  );
  return rows.map(toReq);
}

export async function saveCancelToken(requestId: string, tokenHash: string): Promise<void> {
  if (!pgEnabled) {
    const r = requests.get(requestId);
    if (r) r.cancelTokenHash = tokenHash;
    return;
  }
  await postgresExecutor().query('UPDATE recovery_requests_v1 SET cancel_token_hash = $2 WHERE id = $1', [requestId, tokenHash]);
}

export async function requestByCancelToken(tokenHash: string): Promise<RecoveryRequest | null> {
  if (!pgEnabled) {
    for (const r of requests.values()) if (r.cancelTokenHash === tokenHash) return r;
    return null;
  }
  const { rows } = await postgresExecutor().query<ReqRow>(
    'SELECT * FROM recovery_requests_v1 WHERE cancel_token_hash = $1',
    [tokenHash],
  );
  return rows[0] ? toReq(rows[0]) : null;
}

export async function recordAttempt(wallet: string, at: number, ok: boolean): Promise<void> {
  const w = lc(wallet);
  if (!pgEnabled) {
    attempts.push({ wallet: w, at, ok });
    return;
  }
  await postgresExecutor().query('INSERT INTO recovery_attempts_v1 (wallet_address, at, ok) VALUES ($1, $2, $3)', [w, at, ok]);
}

export async function failuresSince(wallet: string, since: number): Promise<number[]> {
  const w = lc(wallet);
  if (!pgEnabled) return attempts.filter((a) => a.wallet === w && !a.ok && a.at >= since).map((a) => a.at);
  const { rows } = await postgresExecutor().query<{ at: string }>(
    'SELECT at FROM recovery_attempts_v1 WHERE wallet_address = $1 AND ok = false AND at >= $2 ORDER BY at',
    [w, since],
  );
  return rows.map((r) => Number(r.at));
}
