import { randomUUID } from 'node:crypto';
import { aloneOf } from '../agents/alone.js';
import { DEFAULT_BRIEF } from '../agents/mandate.js';
import { isVerified } from '../agents/shortlist.js';
import { isPriced, waysOf } from '../agents/ways.js';
import { config } from '../config.js';
import { localDay, localHour, progressStore } from '../db/agentProgress.js';
import { getAgentRecord } from '../db/agentRecords.js';
import { getBrief, patchBrief } from '../db/briefs.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import { bus, type KarwanEvent } from '../events.js';
import { readQuantity } from '../llm/quantity.js';
import { logger } from '../logger.js';
import { postManagedJob } from '../marketplace/postManagedJob.js';
import { leased } from '../ops/leasedLoop.js';
import { levelOf } from '../verification/live.js';
import { alertPicked } from './alerts.js';
import { liveAlertDeps, livePitchDeps, zoneOf } from './alertsLive.js';
import { blockedSet } from './blocks.js';
import { contactsOfFind, pitchedNeedsOf } from './contacts.js';
import { customerLeads } from './customersLive.js';
import { directoryCandidates } from './directory.js';
import { liveDirectoryDeps } from './directoryLive.js';
import { findById, saveFind } from './finds.js';
import { afterRequestEvent, claimDueOrders, orderByJob, saveOrder, saveRun, type StandingOrder } from './orders.js';
import { runOrder, type RunDeps, type RunOutcome } from './orderRun.js';
import { orderNote, runOrderSweep } from './orderSweep.js';
import { pitchPicked } from './pitches.js';

/// Standing orders on the live stores (view 87, step 4): what a run reads,
/// how its request is posted, how the person is told, and the sweep itself.

const SWEEP_INTERVAL_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const INVITED_MAX = 10;

async function facts(owner: string) {
  const [profile, record] = await Promise.all([getProfile(owner).catch(() => null), getAgentRecord(owner).catch(() => null)]);
  return { profile, record, alone: aloneOf(profile, record) };
}

async function timeZoneOf(owner: string): Promise<string> {
  return (await getAgentRecord(owner).catch(() => null))?.brief?.timeZone ?? DEFAULT_BRIEF.timeZone;
}

/// The hour it is where the person is, for an order started now.
export async function hourFor(owner: string, now: number): Promise<{ hour: number; day: string }> {
  const timeZone = await timeZoneOf(owner);
  return { hour: localHour(now, timeZone), day: localDay(now, timeZone) };
}

/// Whether the person's agent finds people at all right now (view 87 switches).
export async function findIsOnFor(owner: string): Promise<boolean> {
  return (await facts(owner)).alone.find;
}

export const liveRunDeps: RunDeps = {
  canWork: findIsOnFor,
  day: async (owner, now) => localDay(now, await timeZoneOf(owner)),
  buyer: async (owner) => {
    const [profile, level] = await Promise.all([getProfile(owner).catch(() => null), levelOf(owner)]);
    return { location: profile?.location ?? null, verified: isVerified(level) };
  },
  people: (need) => directoryCandidates(need, liveDirectoryDeps),
  blocked: blockedSet,
  cleanRecordCounts: config.ARC_NETWORK === 'testnet',
  saveFind,
  findById,
  contactsOfFind,
  agreeOn: async (owner) => (await facts(owner)).alone.agree,
  post: async ({ find, invited, agreeForMe }) => {
    const deadlineDays = Math.min(90, Math.max(1, Math.round((find.endsAt - Date.now()) / DAY_MS)));
    const r = await postManagedJob({
      posterAddress: find.owner, brief: find.need, budgetUsdc: Number(find.budgetUsdc), deadlineDays, invited, agreeForMe,
      deliveryKind: find.kind, where: find.where, quantity: readQuantity(find.need),
    });
    if (r.ok) return { ok: true, jobId: r.jobId };
    logger.info({ owner: find.owner, error: r.body.error }, 'standing order request not posted');
    return { ok: false, code: r.body.code === 'FUND_BUYER_AGENT' ? 'short' : 'failed' };
  },
  invite: async (jobId, people) => {
    const brief = getBrief(jobId);
    if (!brief) return;
    patchBrief(jobId, { invited: [...new Set([...(brief.invited ?? []), ...people.map((p) => p.toLowerCase())])].slice(0, INVITED_MAX) });
    // Their agents look at it now, as they would a request that changed.
    const { rescanRequest } = await import('../agents/seller.js');
    await rescanRequest(jobId, { fresh: true }).catch((err: Error) => logger.warn({ jobId, err: err.message }, 'standing order request not rescanned'));
  },
  alert: (input, now) => alertPicked({ ...input, byDay: null }, now, liveAlertDeps),
  requestState: async (jobId) => {
    const brief = getBrief(jobId);
    if (!brief) return 'ended';
    const { getBuyerJob } = await import('../agents/buyer.js');
    const job = getBuyerJob(jobId);
    if (job?.escrowFunded) return 'locked';
    if (brief.expiredAt || job?.expiredAt || job?.cancelledAt) return 'ended';
    return job && job.deadlineUnix * 1000 <= Date.now() ? 'ended' : 'open';
  },
  customers: customerLeads,
  pitched: pitchedNeedsOf,
  sellWay: async (owner) => {
    const profile = await getProfile(owner).catch(() => null);
    const way = profile ? waysOf(profile).sell.find(isPriced) : undefined;
    if (!way) return null;
    const days = way.shape === 'goods' ? way.arriveDaysMax : way.daysMax;
    return { priceUsdc: String(way.priceUsual), days: Math.min(90, Math.max(1, days)) };
  },
  pitch: (input, now) => pitchPicked(input, now, livePitchDeps),
  newId: () => randomUUID(),
};

/// One note for a run, once: written to the agent's log first, then sent on
/// the channels the person has.
async function tell(order: StandingOrder, outcome: RunOutcome, now: number): Promise<void> {
  const profile = await getProfile(order.owner).catch(() => null);
  const text = orderNote(order, outcome, (profile?.settings?.locale ?? 'en') as UserLocale);
  if (!text) return;
  const day = localDay(now, await timeZoneOf(order.owner));
  const jobId = outcome.kind === 'asked' ? order.jobId ?? undefined : undefined;
  const fresh = await progressStore().claim(order.owner, day, 'order', `${order.id}:${outcome.kind}`, { in: 'note', lines: text.lines, ...(jobId ? { jobId } : {}) }, now);
  if (!fresh) return;
  const who = order.side === 'buy' ? { buyerUser: order.owner } : { sellerUser: order.owner };
  bus.emitEvent({ type: 'agent.note', actor: 'platform', ...(jobId ? { jobId } : {}), payload: { user: order.owner, ...who, heading: text.heading, lines: text.lines, ...(jobId ? { jobId } : {}) } });
  await progressStore().markSent(order.owner, day, 'order', `${order.id}:${outcome.kind}`, now);
}

const sweepDeps = {
  claim: claimDueOrders,
  zoneOf,
  run: (order: StandingOrder, now: number) => runOrder(liveRunDeps, order, now),
  save: saveRun,
  tell,
};

let sweeping: Promise<unknown> = Promise.resolve();

/// Runs the orders due now, one sweep at a time in this process. Called by the
/// timer, and at once when an order is started or resumed.
export function sweepOrdersNow(now = Date.now()): Promise<unknown> {
  sweeping = sweeping
    .then(() => runOrderSweep(now, sweepDeps))
    .catch((err: Error) => logger.warn({ err: err.message }, 'standing order sweep failed'));
  return sweeping;
}

const OFFERED: ReadonlySet<KarwanEvent['type']> = new Set(['offer.created', 'bid.submitted']);

/// What happens on an order's request is written on the order as it happens:
/// an offer is counted, a locked deal finishes it, a request that ran out
/// frees it for a fresh find.
export async function onOrderEvent(e: KarwanEvent, now = Date.now()): Promise<void> {
  if (!e.jobId) return;
  const what = OFFERED.has(e.type) ? 'offer' : e.type === 'escrow.funded' ? 'locked' : e.type === 'job.expired' ? 'closed' : null;
  if (!what) return;
  const order = await orderByJob(e.jobId);
  if (!order) return;
  const who = [e.payload?.sellerUser, e.payload?.seller].find((v): v is string => typeof v === 'string');
  const next = afterRequestEvent(order, what, now, who);
  if (next !== order) await saveOrder(next);
}

export function startOrderSweep(): () => void {
  const unsubscribe = bus.subscribe((e) => {
    void onOrderEvent(e).catch((err: Error) => logger.warn({ jobId: e.jobId, err: err.message }, 'standing order update failed'));
  });
  const run = leased('standingOrderSweep', SWEEP_INTERVAL_MS, () => sweepOrdersNow());
  const timer = setInterval(() => void run(), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
