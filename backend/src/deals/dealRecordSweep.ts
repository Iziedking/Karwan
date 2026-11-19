import { signDealRecord, type DealRecordProof } from '../attestation/dealRecordProof.js';
import { arcChain } from '../chain/client.js';
import { recordedAmong, saveDealRecordOnce, type StoredDealRecord } from '../db/dealRecords.js';
import { listAllDeals, type DirectDeal } from '../db/deals.js';
import { listMoneyMovementsForJob } from '../db/moneyMovements.js';
import { adminQueryEvents } from '../events.js';
import { logger } from '../logger.js';
import type { MoneyMovement } from '../money/model.js';
import { buildDealRecord, type DealEvent, type DealRecord } from './dealRecord.js';

/// Every ended deal gets its record (view 94). A sweep, like the attestation
/// sweep, so no settlement path can forget it, and the same pass covers deals
/// that ended before records existed. A record is written once: the primary
/// key absorbs a second write, and recorded deals are skipped before any read.

/// The events a record reads. Anything else in a deal's history is noise here.
const RECORD_EVENTS = [
  'escrow.funded',
  'escrow.milestone.released',
  'deal.milestone.auto_released',
  'escrow.resolved',
  'deal.dispute.auto_resolved',
];

export interface DealRecordSweepDeps {
  deals: () => Promise<DirectDeal[]>;
  recorded: (jobIds: string[]) => Promise<Set<string>>;
  movements: (jobId: string) => Promise<MoneyMovement[]>;
  events: (jobId: string) => Promise<DealEvent[]>;
  sign: (record: DealRecord, writtenAt: number) => Promise<{ digest: `0x${string}`; proof: DealRecordProof } | null>;
  save: (row: StoredDealRecord) => Promise<boolean>;
  now: () => number;
  log: (msg: string, detail?: Record<string, unknown>) => void;
}

export function liveDealRecordDeps(): DealRecordSweepDeps {
  return {
    deals: listAllDeals,
    recorded: recordedAmong,
    movements: (jobId) => listMoneyMovementsForJob(jobId, 200),
    events: async (jobId) =>
      (await adminQueryEvents({ jobId, types: RECORD_EVENTS, limit: 500 })).map((row) => ({
        type: row.type,
        ts: row.ts,
        actor: row.data.actor,
        payload: row.data.payload,
      })),
    sign: (record, writtenAt) => signDealRecord(record, writtenAt, arcChain.id),
    save: saveDealRecordOnce,
    now: Date.now,
    log: (msg, detail) => logger.warn(detail ?? {}, msg),
  };
}

const ended = (deal: DirectDeal) => Boolean(deal.settledAt || deal.cancelledAt);

/// One pass. Skipped counts ended deals that got no record this pass: an
/// unclaimed invite (the other side is a placeholder) or a failed read.
export async function writeDealRecords(deps: DealRecordSweepDeps = liveDealRecordDeps()): Promise<{ written: number; skipped: number }> {
  const result = { written: 0, skipped: 0 };
  const candidates = (await deps.deals()).filter(ended);
  if (candidates.length === 0) return result;
  const done = await deps.recorded(candidates.map((d) => d.jobId));

  for (const deal of candidates) {
    if (done.has(deal.jobId.toLowerCase())) continue;
    if (deal.pendingCounterparty) {
      result.skipped += 1;
      continue;
    }
    try {
      const [movements, events] = await Promise.all([deps.movements(deal.jobId), deps.events(deal.jobId)]);
      const record = buildDealRecord(deal, movements, events);
      if (!record) continue;
      const writtenAt = deps.now();
      const signed = await deps.sign(record, writtenAt);
      if (!signed) {
        deps.log('deal records: no issuer key, nothing written');
        return result;
      }
      if (await deps.save({ jobId: deal.jobId, record, digest: signed.digest, writtenAt, proof: signed.proof })) result.written += 1;
    } catch (err) {
      result.skipped += 1;
      deps.log('deal records: one deal failed', { jobId: deal.jobId, err: (err as Error).message });
    }
  }
  return result;
}
