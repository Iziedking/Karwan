import { randomUUID } from 'node:crypto';
import { DEFAULT_BRIEF, DEFAULT_QUIET } from '../agents/mandate.js';
import { CLOSES_REQUEST } from '../agents/questionSweep.js';
import { getAgentRecord } from '../db/agentRecords.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import { bus, type KarwanEvent } from '../events.js';
import type { UserLocale } from '../i18n/telegram.js';
import { logger } from '../logger.js';
import { leased } from '../ops/leasedLoop.js';
import { formatLocalAmount } from '../rates/localAmounts.js';
import { readUsdcRates } from '../rates/usdcRates.js';
import { sendDue, type AlertDeps } from './alerts.js';
import { answerContact, claimDue, closeContactsOfFind, contactsOfFind, createContact } from './contacts.js';
import { nextDue, runContactSweep, type Zone } from './contactSweep.js';
import { findById, findByJob, saveFind } from './finds.js';

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
};

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
        send: async (claimed) => sendDue(claimed, await findById(claimed.contact.findId), liveAlertDeps),
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
