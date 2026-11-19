import { randomBytes } from 'node:crypto';
import type { DealRecordProof } from '../attestation/dealRecordProof.js';
import type { DealRecord } from '../deals/dealRecord.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// Deal records and their share links (view 94). A record is written once, at
/// the end of a deal, and never changed: the signature covers what was stored.
/// Each side of a deal has at most one live link; taking it back ends it for
/// good, and the next link is a new one.

export interface StoredDealRecord {
  jobId: string;
  record: DealRecord;
  digest: string;
  writtenAt: number;
  proof: DealRecordProof;
}

export type Side = 'buyer' | 'seller';

interface Share {
  token: string;
  jobId: string;
  side: Side;
  createdAt: number;
  revokedAt: number | null;
}

const records = new Map<string, StoredDealRecord>();
const shares = new Map<string, Share>();

export function resetDealRecordsForTests(): void {
  records.clear();
  shares.clear();
}

const key = (jobId: string) => jobId.toLowerCase();

/// Insert if absent. True when this call wrote it; false when a record was
/// already there, which then stays as it was.
export async function saveDealRecordOnce(row: StoredDealRecord): Promise<boolean> {
  const id = key(row.jobId);
  if (!pgEnabled) {
    if (records.has(id)) return false;
    records.set(id, { ...row, jobId: id });
    return true;
  }
  const r = await postgresExecutor().query(
    `INSERT INTO deal_records_v1 (job_id, record, digest, proof, written_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id) DO NOTHING RETURNING job_id`,
    [id, row.record, row.digest, row.proof, row.writtenAt],
  );
  return r.rows.length === 1;
}

type Row = { job_id: string; record: DealRecord; digest: string; proof: DealRecordProof; written_at: string | number };
const fromRow = (r: Row): StoredDealRecord => ({ jobId: r.job_id, record: r.record, digest: r.digest, proof: r.proof, writtenAt: Number(r.written_at) });

export async function getDealRecord(jobId: string): Promise<StoredDealRecord | null> {
  const id = key(jobId);
  if (!pgEnabled) return records.get(id) ?? null;
  const r = await postgresExecutor().query<Row>(`SELECT * FROM deal_records_v1 WHERE job_id = $1`, [id]);
  return r.rows[0] ? fromRow(r.rows[0]) : null;
}

/// Which of these deals already have a record, lower case.
export async function recordedAmong(jobIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(jobIds.map(key))];
  if (ids.length === 0) return new Set();
  if (!pgEnabled) return new Set(ids.filter((id) => records.has(id)));
  const r = await postgresExecutor().query<{ job_id: string }>(`SELECT job_id FROM deal_records_v1 WHERE job_id = ANY($1)`, [ids]);
  return new Set(r.rows.map((x) => x.job_id));
}

/// This side's live link, if it has one.
export async function shareFor(jobId: string, side: Side): Promise<string | null> {
  const id = key(jobId);
  if (!pgEnabled) return [...shares.values()].find((s) => s.jobId === id && s.side === side && s.revokedAt === null)?.token ?? null;
  const r = await postgresExecutor().query<{ token: string }>(
    `SELECT token FROM deal_record_shares_v1 WHERE job_id = $1 AND side = $2 AND revoked_at IS NULL`,
    [id, side],
  );
  return r.rows[0]?.token ?? null;
}

/// This side's live link, made when it has none. Two calls at once end with
/// the same link: the database keeps one live link per side.
export async function makeShare(jobId: string, side: Side, now = Date.now()): Promise<string> {
  const id = key(jobId);
  const live = await shareFor(id, side);
  if (live) return live;
  const token = randomBytes(32).toString('base64url');
  if (!pgEnabled) {
    shares.set(token, { token, jobId: id, side, createdAt: now, revokedAt: null });
    return token;
  }
  await postgresExecutor().query(
    `INSERT INTO deal_record_shares_v1 (token, job_id, side, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [token, id, side, now],
  );
  return (await shareFor(id, side)) ?? token;
}

/// Ends this side's live link. False when there was none.
export async function revokeShare(jobId: string, side: Side, now = Date.now()): Promise<boolean> {
  const id = key(jobId);
  if (!pgEnabled) {
    const live = [...shares.values()].find((s) => s.jobId === id && s.side === side && s.revokedAt === null);
    if (!live) return false;
    live.revokedAt = now;
    return true;
  }
  const r = await postgresExecutor().query(
    `UPDATE deal_record_shares_v1 SET revoked_at = $3 WHERE job_id = $1 AND side = $2 AND revoked_at IS NULL RETURNING token`,
    [id, side, now],
  );
  return r.rows.length > 0;
}

/// The record a live link opens, and which side shared it. Null for a link
/// taken back or never made.
export async function recordByToken(token: string): Promise<{ stored: StoredDealRecord; side: Side } | null> {
  let share: { jobId: string; side: Side } | null = null;
  if (!pgEnabled) {
    const s = shares.get(token);
    share = s && s.revokedAt === null ? { jobId: s.jobId, side: s.side } : null;
  } else {
    const r = await postgresExecutor().query<{ job_id: string; side: Side }>(
      `SELECT job_id, side FROM deal_record_shares_v1 WHERE token = $1 AND revoked_at IS NULL`,
      [token],
    );
    share = r.rows[0] ? { jobId: r.rows[0].job_id, side: r.rows[0].side } : null;
  }
  if (!share) return null;
  const stored = await getDealRecord(share.jobId);
  return stored ? { stored, side: share.side } : null;
}
