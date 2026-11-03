import { READ_DETAIL_TTL_MS, keptReadFor, type RecordReadReceipt } from '../db/recordReads.js';
import { listDealsForAddress } from '../db/deals.js';
import { bus, type KarwanEvent } from '../events.js';
import { countsFor, type RecordCounts } from '../reputation/recordRead.js';
import type { SignedRecordRead } from '../verification/recordReadSignature.js';
import { paidRecordRead, type PaidRecordRead } from './buyerClient.js';
import type { ReadPurpose } from './recordReadGate.js';

/// One gate for every paid record read (view 48, decision 6). The same reader,
/// subject and request pay once while the signed read is kept, unless the
/// record changed since; checks running at the same time share one payment.
/// After a payment the owner, and only the owner, is told what their agent paid.

export interface RecordReadRequest {
  payerAgent: string;
  subject: string;
  purpose: ReadPurpose;
  ref: string;
  forAccount: string;
}

export interface GatedRecordRead {
  read: SignedRecordRead;
  reused: boolean;
  /// What this call paid: 0 when the read was used again.
  amountUsd: number;
  transaction: string | null;
  /// The payment behind the read, the earlier one when it was used again.
  receipt: { amountUsd: number; transaction: string | null };
  payer?: string;
  depositTxHash?: string;
  gatewayBalanceAfter?: number;
}

export type PaidEvent = Omit<KarwanEvent, 'ts'>;

export interface DataGateDeps {
  kept(reader: string, subject: string, ref: string, sinceMs: number): Promise<RecordReadReceipt | null>;
  countsNow(subject: string): Promise<RecordCounts>;
  pay(req: RecordReadRequest): Promise<PaidRecordRead>;
  emit(e: PaidEvent): void;
  now(): number;
}

const inFlight = new Map<string, Promise<GatedRecordRead>>();
const keyOf = (r: RecordReadRequest) => `${r.forAccount.toLowerCase()}|${r.subject.toLowerCase()}|${r.ref.toLowerCase()}`;

/// The counts that change a record: a deal finished, a dispute decided, a deal cancelled.
function sameRecord(a: RecordCounts, b: RecordCounts): boolean {
  return a.completed === b.completed && a.disputesWon === b.disputesWon && a.disputesLost === b.disputesLost && a.cancelled === b.cancelled;
}

async function reusable(req: RecordReadRequest, deps: DataGateDeps): Promise<{ read: SignedRecordRead; kept: RecordReadReceipt } | null> {
  const kept = await deps.kept(req.forAccount, req.subject, req.ref, deps.now() - READ_DETAIL_TTL_MS).catch(() => null);
  const read = kept?.detail as SignedRecordRead | null | undefined;
  if (!kept || !read?.counts) return null;
  const now = await deps.countsNow(req.subject).catch(() => null);
  return !now || sameRecord(read.counts, now) ? { read, kept } : null;
}

async function acquire(req: RecordReadRequest, deps: DataGateDeps): Promise<GatedRecordRead> {
  const kept = await reusable(req, deps);
  if (kept) {
    return { read: kept.read, reused: true, amountUsd: 0, transaction: null, receipt: { amountUsd: kept.kept.priceUsdc, transaction: kept.kept.paymentTx } };
  }
  const r = await deps.pay(req);
  deps.emit({
    type: 'agent.paid',
    // A question from the assistant is asked through the person's buying agent.
    actor: req.purpose === 'bid' ? 'seller' : 'buyer',
    // No jobId and no subject: agent.paid is not an auction-internal type, so a
    // jobId would show every seller on the request who the buyer checked.
    payload: {
      rail: 'arc',
      kind: 'record',
      purpose: req.purpose,
      ref: req.ref,
      user: req.forAccount,
      amountUsd: r.amountUsd,
      txHash: r.transaction,
      payer: r.payer,
    },
  });
  return {
    read: r.read,
    reused: false,
    amountUsd: r.amountUsd,
    transaction: r.transaction || null,
    receipt: { amountUsd: r.amountUsd, transaction: r.transaction || null },
    payer: r.payer,
    ...(r.depositTxHash ? { depositTxHash: r.depositTxHash } : {}),
    ...(r.gatewayBalanceAfter !== undefined ? { gatewayBalanceAfter: r.gatewayBalanceAfter } : {}),
  };
}

export async function acquireRecordRead(req: RecordReadRequest, deps: DataGateDeps = liveDeps): Promise<GatedRecordRead> {
  const key = keyOf(req);
  const running = inFlight.get(key);
  if (running) {
    const shared = await running;
    return { read: shared.read, reused: true, amountUsd: 0, transaction: null, receipt: shared.receipt };
  }
  const work = acquire(req, deps);
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

export const liveDeps: DataGateDeps = {
  kept: keptReadFor,
  countsNow: async (subject) => countsFor(await listDealsForAddress(subject), subject),
  pay: (r) => paidRecordRead(r.payerAgent, r.subject, { purpose: r.purpose, ref: r.ref, forAccount: r.forAccount }),
  emit: (e) => bus.emitEvent(e),
  now: () => Date.now(),
};
