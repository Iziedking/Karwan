import { READ_DETAIL_TTL_MS, keptReadFor, readsForRef, type RecordReadReceipt } from '../db/recordReads.js';
import { listDealsForAddress } from '../db/deals.js';
import { getBrief } from '../db/briefs.js';
import { requestTitle } from '../agents/bidOutcome.js';
import { bus, type KarwanEvent } from '../events.js';
import { countsFor, type RecordCounts } from '../reputation/recordRead.js';
import type { SignedRecordRead } from '../verification/recordReadSignature.js';
import { paidRecordRead, paidResearch, READS_BALANCE_EMPTY, type PaidRecordRead } from './buyerClient.js';
import { cachedAnglesFor, type MarketRead } from './externalClient.js';
import { quoteResearch, type ResearchFocus, type ResearchQuote } from './researchPricing.js';
import { PAID_READS_PER_REQUEST, RECORD_READ_PRICE_USDC, type ReadPurpose } from './recordReadGate.js';
import { addSpend, budgetNoticeDue, canSpend, spentThisWeek, type SpendKind } from '../agents/agentRecord.js';
import { getAgentRecord, updateAgentRecord } from '../db/agentRecords.js';

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

/// The owner's weekly data budget (view 48, step 6). Absent in tests that do not need it.
export interface DataBudget {
  fits(owner: string, priceUsd: number): Promise<boolean>;
  spent(owner: string, usd: number, kind: SpendKind): Promise<void>;
  reached(owner: string): void;
}

export const BUDGET_REACHED = 'weekly data budget reached';
export const REQUEST_READS_USED = 'record checks for this request used';

async function withinBudget(budget: DataBudget | undefined, owner: string, priceUsd: number): Promise<void> {
  if (!budget || (await budget.fits(owner, priceUsd))) return;
  budget.reached(owner);
  throw new Error(`${BUDGET_REACHED}: nothing was paid`);
}

export interface DataGateDeps {
  kept(reader: string, subject: string, ref: string, sinceMs: number): Promise<RecordReadReceipt | null>;
  countsNow(subject: string): Promise<RecordCounts>;
  pay(req: RecordReadRequest): Promise<PaidRecordRead>;
  emit(e: PaidEvent): void;
  now(): number;
  budget?: DataBudget;
  /// Paid checks this account already made on this request.
  paidOnRequest?(forAccount: string, ref: string): Promise<number>;
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
  const limit = (PAID_READS_PER_REQUEST as Partial<Record<ReadPurpose, number>>)[req.purpose];
  if (limit !== undefined && deps.paidOnRequest && (await deps.paidOnRequest(req.forAccount, req.ref)) >= limit) {
    throw new Error(`${REQUEST_READS_USED}: nothing was paid`);
  }
  await withinBudget(deps.budget, req.forAccount, RECORD_READ_PRICE_USDC);
  const r = await deps.pay(req);
  await deps.budget?.spent(req.forAccount, r.amountUsd, 'record');
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

/// The live budget: the owner's agent record, and one notice in 7 days when an
/// agent stops paying for data because the budget is reached.
export const liveBudget: DataBudget = {
  fits: async (owner, priceUsd) => canSpend(await getAgentRecord(owner), priceUsd, Date.now()),
  spent: async (owner, usd, kind) => {
    await updateAgentRecord(owner, (r) => addSpend(r, usd, kind, Date.now()));
  },
  reached: (owner) => {
    const now = Date.now();
    void (async () => {
      const r = await getAgentRecord(owner);
      if (!budgetNoticeDue(r, now)) return;
      await updateAgentRecord(owner, (cur) => ({ ...cur, lastBudgetNoticeAt: now }));
      bus.emitEvent({
        type: 'agent.budget',
        actor: 'platform',
        payload: { user: r.owner, sellerUser: r.owner, budgetUsdc: r.weeklyBudgetUsdc, spentUsdc: spentThisWeek(r, now) },
      });
    })().catch(() => undefined);
  },
};

export const liveDeps: DataGateDeps = {
  kept: keptReadFor,
  paidOnRequest: async (forAccount, ref) => (await readsForRef(ref, forAccount)).count,
  countsNow: async (subject) => countsFor(await listDealsForAddress(subject), subject),
  pay: (r) => paidRecordRead(r.payerAgent, r.subject, { purpose: r.purpose, ref: r.ref, forAccount: r.forAccount }),
  emit: (e) => bus.emitEvent(e),
  now: () => Date.now(),
  budget: liveBudget,
};

export interface ResearchRequest {
  payerAgent: string;
  forAccount: string;
  keywords: string[];
  focus: ResearchFocus;
  ref: string;
  /// Which of the person's agents is paying; the buying one when absent.
  actor?: 'buyer' | 'seller';
}

export interface ResearchDeps {
  cachedAngles(keywords: string[]): Set<string>;
  pay: typeof paidResearch;
  emit(e: PaidEvent): void;
  budget?: DataBudget;
}

const RESEARCH_FAILURE_QUIET_MS = 24 * 3_600_000;
const researchFailureTold = new Map<string, number>();

/// Research that did not finish, told to the person once per request a day.
/// A short balance is not a failure: it has its own "add money" notice.
export function tellResearchFailed(req: ResearchRequest, err: unknown, emit: (e: PaidEvent) => void, now = Date.now()): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith(READS_BALANCE_EMPTY)) return false;
  const key = `${req.forAccount.toLowerCase()}|${req.ref.toLowerCase()}`;
  const last = researchFailureTold.get(key);
  if (last !== undefined && now - last < RESEARCH_FAILURE_QUIET_MS) return false;
  researchFailureTold.set(key, now);
  const paid = Number((err as { amountUsd?: unknown } | null)?.amountUsd);
  const title = requestTitle(getBrief(req.ref)?.briefText);
  emit({
    type: 'agent.research.failed',
    actor: req.actor ?? 'buyer',
    payload: {
      kind: 'research',
      user: req.forAccount,
      ref: req.ref,
      focus: req.focus,
      ...(title ? { title } : {}),
      ...(Number.isFinite(paid) && paid > 0 ? { amountUsd: paid } : {}),
    },
  });
  return true;
}

/// The exact price before anything runs, so the agent can tell its person.
export function researchQuote(keywords: string[], focus: ResearchFocus, cached = cachedAnglesFor): ResearchQuote {
  return quoteResearch(focus, cached(keywords));
}

/// Outside research paid by the person's agent (view 48, decision 2). A short
/// balance throws READS_BALANCE_EMPTY for the caller to ask for money. After
/// a payment only the owner is told, as for record reads.
export async function acquireResearch(
  req: ResearchRequest,
  deps: ResearchDeps = { cachedAngles: cachedAnglesFor, pay: paidResearch, emit: (e) => bus.emitEvent(e), budget: liveBudget },
): Promise<{ read: MarketRead; quote: ResearchQuote; amountUsd: number }> {
  const quote = quoteResearch(req.focus, deps.cachedAngles(req.keywords));
  await withinBudget(deps.budget, req.forAccount, quote.totalUsdc);
  let r: Awaited<ReturnType<ResearchDeps['pay']>>;
  try {
    r = await deps.pay(req.payerAgent, { keywords: req.keywords, focus: req.focus, ref: req.ref, forAccount: req.forAccount, priceUsd: quote.totalUsdc });
  } catch (err) {
    // The caller carries on with Karwan's own prices; the person hears once per
    // request that the research did not finish (view 52, step 0).
    tellResearchFailed(req, err, deps.emit);
    throw err;
  }
  if (r.amountUsd > 0) await deps.budget?.spent(req.forAccount, r.amountUsd, 'research');
  if (r.amountUsd > 0) {
    deps.emit({
      type: 'agent.paid',
      actor: req.actor ?? 'buyer',
      payload: {
        rail: 'arc',
        kind: 'research',
        focus: req.focus,
        angles: r.quote.angles,
        ref: req.ref,
        user: req.forAccount,
        amountUsd: r.amountUsd,
        txHash: r.transaction,
        payer: r.payer,
      },
    });
  }
  return { read: r.read, quote: r.quote, amountUsd: r.amountUsd };
}
