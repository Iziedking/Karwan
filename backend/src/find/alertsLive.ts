import { randomUUID } from 'node:crypto';
import { agentIsOn } from '../agents/agentPower.js';
import { DEFAULT_BRIEF, DEFAULT_QUIET } from '../agents/mandate.js';
import { CLOSES_REQUEST } from '../agents/questionSweep.js';
import { getAgentRecord } from '../db/agentRecords.js';
import { bargainOn } from '../db/briefs.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';
import { leased } from '../ops/leasedLoop.js';
import { formatLocalAmount } from '../rates/localAmounts.js';
import { readUsdcRates } from '../rates/usdcRates.js';
import { sendDue, type AlertDeps } from './alerts.js';
import { answerContact, claimDue, closeContactsOfFind, contactsOfFind, createContact, markPitchOffered, pitchByJob } from './contacts.js';
import { nextDue, runContactSweep, type Zone } from './contactSweep.js';
import { findById, findByJob, saveFind } from './finds.js';
import { liveDirectoryDeps } from './directoryLive.js';
import { placePitchOffer, sendPitchDue, type PitchDeps, type PlaceDeps } from './pitches.js';
import { tg } from '../i18n/telegram.js';

/// Deal alerts on the live stores: the person's own time and quiet hours from
/// their agent record, their language and money from their profile, and the
/// alert itself on the agent note every channel shows.

const SWEEP_INTERVAL_MS = 60_000;

export async function zoneOf(person: string): Promise<Zone> {
  const r = await getAgentRecord(person).catch(() => null);
  return { timeZone: r?.brief?.timeZone ?? DEFAULT_BRIEF.timeZone, quiet: r?.quiet === undefined ? DEFAULT_QUIET : r.quiet };
}

export const liveAlertDeps: AlertDeps = {
  create: createContact,
  firstDue: (to) => (sentAt) => nextDue({ kind: 'alert', sentAt, reminders: 0, to }, zoneOf),
  saveFind,
  locale: async (person) => ((await getProfile(person).catch(() => null))?.settings?.locale ?? 'en') as UserLocale,
  money: async (person, usdc) => {
    const [profile, rates] = await Promise.all([getProfile(person).catch(() => null), readUsdcRates()]);
    return formatLocalAmount(usdc, profile?.settings?.displayCurrency, rates) ?? `${Math.round(usdc * 100) / 100} USDC`;
  },
  note: (to, data) => bus.emitEvent({ type: 'agent.note', actor: 'platform', jobId: data.jobId, payload: { user: to, sellerUser: to, ...data } }),
  newId: () => randomUUID(),
  bargain: bargainOn,
};

const localeOf = liveAlertDeps.locale;

export const livePitchDeps: PitchDeps = {
  create: createContact,
  firstDue: (to) => (sentAt) => nextDue({ kind: 'pitch', sentAt, reminders: 0, to }, zoneOf),
  saveFind,
  locale: localeOf,
  money: liveAlertDeps.money,
  async seller(person) {
    const [profile, record] = await Promise.all([getProfile(person).catch(() => null), liveDirectoryDeps.record(person).catch(() => null)]);
    return {
      name: profile?.displayName?.trim() || profile?.handle || 'A Karwan seller',
      verified: record?.verified ?? false,
      stars: record?.rating.kind === 'rated' ? record.rating.value : null,
    };
  },
  // The bell opens the pitch; there is no request yet.
  note: (to, data) => bus.emitEvent({ type: 'agent.note', actor: 'platform', payload: { user: to, sellerUser: to, ...data } }),
  newId: () => randomUUID(),
};

let buyerJob: ((jobId: string) => { deadlineUnix: number } | null) | null = null;
async function loadBuyerJob(): Promise<void> {
  if (!buyerJob) buyerJob = (await import('../agents/buyer.js')).getBuyerJob;
}

export const livePlaceDeps: PlaceDeps = {
  offer: async (seller, jobId, input) => {
    // Loaded here: the offer service pulls in the whole agent runtime.
    const { createOffer } = await import('../offers/service.js');
    const r = await createOffer(seller, jobId, input);
    return r.ok ? { ok: true } : { ok: false, code: r.code };
  },
  markOffered: markPitchOffered,
  deadlineOf: (jobId) => buyerJob?.(jobId)?.deadlineUnix ?? null,
  noteSeller: async (seller, jobId) => {
    const locale = await localeOf(seller);
    bus.emitEvent({ type: 'agent.note', actor: 'platform', jobId, payload: { user: seller, sellerUser: seller, heading: tg('pitch.interested', locale), lines: [], jobId } });
  },
};

/// The request posted from a pitch: the seller's pitch goes on it as their
/// offer once the buyer agent tracks it, whichever happens first.
export async function placePitchOn(jobId: string): Promise<void> {
  const pitch = await pitchByJob(jobId);
  if (!pitch) return;
  await loadBuyerJob();
  const r = await placePitchOffer(pitch, Math.floor(Date.now() / 1000), livePlaceDeps);
  if (r === 'failed') logger.warn({ jobId }, 'pitch offer not placed');
}

/// The seller who offered on a private request from a find, as a person.
async function offererOf(e: KarwanEvent): Promise<string | null> {
  if (e.type === 'offer.created') return typeof e.payload?.sellerUser === 'string' ? e.payload.sellerUser.toLowerCase() : null;
  const agent = typeof e.payload?.seller === 'string' ? e.payload.seller : null;
  return agent ? ((await findAgentWalletByAgentAddress(agent).catch(() => null))?.userAddress.toLowerCase() ?? null) : null;
}

/// An offer from someone alerted answers their alert; a request that closes
/// ends every alert on it, so nothing more is sent.
export async function onFindEvent(e: KarwanEvent, now = Date.now()): Promise<void> {
  if (!e.jobId) return;
  if (e.type === 'job.tracked') return placePitchOn(e.jobId);
  if (e.type === 'offer.created' || e.type === 'bid.submitted') {
    const find = await findByJob(e.jobId);
    if (!find) return;
    const seller = await offererOf(e);
    const contact = seller ? (await contactsOfFind(find.id)).find((c) => c.to === seller && c.answer === null) : null;
    if (contact) await answerContact(contact.id, seller!, 'interested', now);
    return;
  }
  if (CLOSES_REQUEST.has(e.type)) {
    const find = await findByJob(e.jobId);
    if (!find) return;
    await closeContactsOfFind(find.id, now);
    await saveFind({ ...find, status: e.type === 'job.expired' ? 'ended' : 'matched' });
  }
}

export function startFindContactSweep(): () => void {
  const sweep = async () => {
    try {
      await runContactSweep(Date.now(), {
        claim: claimDue,
        zoneOf,
        send: async (claimed) => {
          const find = await findById(claimed.contact.findId);
          // View 75: nothing is sent for a person whose agent is off.
          if (find && !(await agentIsOn(find.owner))) return;
          return claimed.contact.kind === 'pitch' ? sendPitchDue(claimed, find, livePitchDeps) : sendDue(claimed, find, liveAlertDeps);
        },
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'find contact sweep failed');
    }
  };
  const unsubscribe = bus.subscribe((e) => {
    void onFindEvent(e).catch((err: Error) => logger.warn({ jobId: e.jobId, err: err.message }, 'find alert update failed'));
  });
  const run = leased('findContactSweep', SWEEP_INTERVAL_MS, sweep);
  const timer = setInterval(() => void run(), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
