import { createHmac, randomInt } from 'node:crypto';
import { config } from '../config.js';

/// A goods deal that ends with two people and the item (view 33): the buyer
/// shows a six-digit code only once they hold the item, the seller enters it,
/// and that is the buyer's word that it arrived. Only a keyed hash is kept and
/// it never leaves the server: six digits are guessed from a plain hash at once.
export const HANDOVER_TRIES = 5;
export const HANDOVER_LOCK_MS = 15 * 60_000;

export interface HandoverRecord {
  codeHash: string;
  issuedAt: number;
  attempts: number;
  lockedUntil?: number;
  usedAt?: number;
}

export type HandoverCheck =
  | { ok: true; record: HandoverRecord }
  | { ok: false; reason: 'no-code' | 'used' | 'locked' | 'wrong'; record?: HandoverRecord; lockedUntil?: number };

const hashOf = (jobId: string, code: string) =>
  createHmac('sha256', config.SESSION_SECRET ?? 'karwan-handover').update(`${jobId.toLowerCase()}:${code}`).digest('hex');

/// A fresh code for the deal. Showing the code again issues a new one, so an
/// old code someone saw earlier stops working.
export function issueHandoverCode(jobId: string, now: number, draw: () => number = () => randomInt(0, 1_000_000)): { code: string; record: HandoverRecord } {
  const code = String(draw()).padStart(6, '0');
  return { code, record: { codeHash: hashOf(jobId, code), issuedAt: now, attempts: 0 } };
}

/// The seller's entry against the buyer's code. Five wrong tries lock the code
/// for 15 minutes; a right one uses it up.
export function checkHandoverCode(record: HandoverRecord | undefined, jobId: string, entered: string, now: number): HandoverCheck {
  if (!record) return { ok: false, reason: 'no-code' };
  if (record.usedAt) return { ok: false, reason: 'used', record };
  if (record.lockedUntil && now < record.lockedUntil) return { ok: false, reason: 'locked', record, lockedUntil: record.lockedUntil };
  const fresh = record.lockedUntil && now >= record.lockedUntil ? { ...record, attempts: 0, lockedUntil: undefined } : record;
  if (hashOf(jobId, entered.trim()) === fresh.codeHash) return { ok: true, record: { ...fresh, usedAt: now } };
  const attempts = fresh.attempts + 1;
  const lockedUntil = attempts >= HANDOVER_TRIES ? now + HANDOVER_LOCK_MS : undefined;
  return { ok: false, reason: lockedUntil ? 'locked' : 'wrong', record: { ...fresh, attempts, ...(lockedUntil ? { lockedUntil } : {}) }, ...(lockedUntil ? { lockedUntil } : {}) };
}
