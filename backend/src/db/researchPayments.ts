import { and, desc, eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { researchPayments } from './schema.js';
import { logger } from '../logger.js';

export interface ResearchPaymentRecord {
  idempotencyKey: string;
  runId: string;
  jobId?: string;
  owner?: string;
  actor: 'buyer' | 'seller' | 'platform';
  angle: string;
  provider: string;
  amountUsd: number;
  payer?: string;
  txHash?: string;
  paidAt: number;
  /// Whether the row was written to Postgres or the process fallback. A
  /// fallback is still surfaced to operators so it can be reconciled later.
  storage?: 'postgres' | 'fallback';
}

const fallback = new Map<string, ResearchPaymentRecord>();

function micros(amountUsd: number): number {
  return Math.max(0, Math.round(amountUsd * 1_000_000));
}

export async function recordResearchPayment(
  input: Omit<ResearchPaymentRecord, 'storage'>,
): Promise<ResearchPaymentRecord> {
  const normalized: ResearchPaymentRecord = {
    ...input,
    amountUsd: Math.max(0, Number(input.amountUsd) || 0),
    ...(input.jobId ? { jobId: input.jobId.toLowerCase() } : {}),
    ...(input.owner ? { owner: input.owner.toLowerCase() } : {}),
    ...(input.payer ? { payer: input.payer.toLowerCase() } : {}),
  };
  const existing = fallback.get(normalized.idempotencyKey);
  if (existing) return existing;

  if (pgEnabled) {
    try {
      await db()
        .insert(researchPayments)
        .values({
          idempotencyKey: normalized.idempotencyKey,
          runId: normalized.runId,
          jobId: normalized.jobId,
          owner: normalized.owner,
          actor: normalized.actor,
          angle: normalized.angle,
          provider: normalized.provider,
          amountMicros: micros(normalized.amountUsd),
          payer: normalized.payer,
          txHash: normalized.txHash,
          paidAt: normalized.paidAt,
          data: normalized,
        })
        .onConflictDoNothing();
      const stored = { ...normalized, storage: 'postgres' as const };
      fallback.set(normalized.idempotencyKey, stored);
      return stored;
    } catch (err) {
      logger.error(
        { err: (err as Error).message, idempotencyKey: normalized.idempotencyKey },
        'research payment ledger write failed; retaining fallback row',
      );
    }
  }

  const stored = { ...normalized, storage: 'fallback' as const };
  fallback.set(normalized.idempotencyKey, stored);
  return stored;
}

export async function listResearchPayments(opts: {
  jobId?: string;
  runId?: string;
  limit?: number;
} = {}): Promise<ResearchPaymentRecord[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  if (pgEnabled) {
    try {
      const filters = [];
      if (opts.jobId) filters.push(eq(researchPayments.jobId, opts.jobId.toLowerCase()));
      if (opts.runId) filters.push(eq(researchPayments.runId, opts.runId));
      const rows = await db()
        .select()
        .from(researchPayments)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(researchPayments.paidAt))
        .limit(limit);
      return rows
        .map((row) => ({
          ...(row.data as ResearchPaymentRecord),
          // Keep the persistence boundary visible to operators. The JSONB
          // payload intentionally contains the business receipt only; the
          // storage marker is derived from the authoritative read path.
          storage: 'postgres' as const,
        }))
        .slice(0, limit);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'research payment ledger read failed');
    }
  }
  return [...fallback.values()]
    .filter((r) => (!opts.jobId || r.jobId === opts.jobId.toLowerCase()) && (!opts.runId || r.runId === opts.runId))
    .sort((a, b) => b.paidAt - a.paidAt)
    .slice(0, limit);
}
