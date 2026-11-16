import { config } from '../config.js';
import { localDay, progressStore } from '../db/agentProgress.js';
import { getAgentRecord, reserveLock, updateAgentRecord } from '../db/agentRecords.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getBrief } from '../db/briefs.js';
import { getRecord, listRecords, putRecord } from '../db/evidence.js';
import { getMatchProposal } from '../db/matchProposals.js';
import { agentPrefsOf, getProfile, type UserLocale } from '../db/profiles.js';
import { bus, type KarwanEvent } from '../events.js';
import { tg } from '../i18n/telegram.js';
import { logger } from '../logger.js';
import { jobActionsInFlight } from '../offers/jobLock.js';
import { suiteFundingEnabled } from '../chain/suiteConfig.js';
import { agreedPick } from '../assistant/requestUpdates.js';
import { loadPartyFacts } from '../trust/trustFacts.js';
import { levelOf } from '../verification/live.js';
import { worldStepForChoice } from './agentWorldGate.js';
import { aloneOf } from './alone.js';
import { chooseAgentOffer, getBuyerJob, getShortlist, lockMoneyView, quoteAgentOffer } from './buyer.js';
import { lockAlone, type AskReason, type LockDeps, type LockNews, type LockOutcome, type LockPick, type LockStep } from './lockAlone.js';
import { DEFAULT_BRIEF } from './mandate.js';
import { MARKET_OVERPAY_ALERT_PCT } from './marketDemand.js';
import { sellerAnswerStep } from './sellerAnswerLive.js';
import { isVerified, shortlistChoiceCheck } from './shortlist.js';

/// The live side of the lock step (view 87, step 3): what it reads, how the
/// written step is kept, and how the person is told. It runs when a request
/// with Agree for me gets an agreed seller, when that seller says yes, and
/// once at start for a step a restart interrupted.

const KIND = 'lock-step' as const;
const key = (jobId: string) => jobId.toLowerCase();

async function pickFor(jobId: string, forced?: { seller: string; priceUsdc: string }): Promise<LockPick | null> {
  const brief = getBrief(jobId);
  if (!brief?.agreeForMe) return null;
  const job = getBuyerJob(jobId);
  if (!job || job.expiredAt || job.cancelledAt) return null;
  const shortlist = getShortlist(jobId) ?? [];
  const seller = forced?.seller ?? agreedPick(shortlist, Number(job.budgetUsdc))?.seller;
  if (!seller) return null;
  const quote = await quoteAgentOffer(jobId, seller);
  if (!quote.ok) return null;
  // The seller said yes to one price; a price that moved since is not that deal.
  if (forced && Number(forced.priceUsdc) !== Number(quote.priceUsdc)) return null;
  if (Number(quote.priceUsdc) > Number(job.budgetUsdc)) return null;
  const entry = shortlist.find((e) => e.seller.toLowerCase() === quote.seller.toLowerCase());
  const opened = entry?.movedFrom ?? entry?.askedUsdc ?? null;
  return {
    owner: brief.postedBy.toLowerCase(),
    seller: quote.seller,
    priceUsdc: quote.priceUsdc,
    ...(opened !== null && Number(opened) !== Number(quote.priceUsdc) ? { openedAtUsdc: String(opened) } : {}),
  };
}

async function localeOf(owner: string): Promise<UserLocale> {
  return ((await getProfile(owner).catch(() => null))?.settings?.locale ?? 'en') as UserLocale;
}

async function nameOf(sellerAgent: string, jobId: string): Promise<string> {
  const entry = (getShortlist(jobId) ?? []).find((e) => e.seller.toLowerCase() === sellerAgent.toLowerCase());
  if (entry?.tag) return `@${entry.tag.replace(/^@/, '')}`;
  return entry?.name ?? 'the seller';
}

/// One note, once: written to the agent's log first, then sent on the channels
/// the person has. A lock is told at once, in quiet hours too.
async function note(owner: string, kind: string, noteKey: string, heading: string, lines: string[], jobId: string | undefined, now: number): Promise<void> {
  const record = await getAgentRecord(owner);
  const day = localDay(now, record.brief?.timeZone ?? DEFAULT_BRIEF.timeZone);
  const fresh = await progressStore().claim(owner, day, kind, noteKey, { in: 'note', lines, ...(jobId ? { jobId } : {}) }, now);
  if (!fresh) return;
  bus.emitEvent({ type: 'agent.note', actor: 'platform', ...(jobId ? { jobId } : {}), payload: { user: owner, buyerUser: owner, heading, lines, ...(jobId ? { jobId } : {}) } });
  await progressStore().markSent(owner, day, kind, noteKey, now);
}

async function tellNews(news: LockNews, now: number): Promise<void> {
  const locale = await localeOf(news.owner);
  if (news.type === 'agent.locked') {
    const lines = [tg('lock.locked', locale, { price: news.priceUsdc, who: await nameOf(news.seller, news.jobId), total: news.totalUsdc })];
    if (news.openedAtUsdc) lines.push(tg('lock.lockedMoved', locale, { opened: news.openedAtUsdc }));
    await note(news.owner, 'lock', key(news.jobId), tg('lock.heading', locale), lines, news.jobId, now);
    return;
  }
  const record = await getAgentRecord(news.owner);
  const lines = [
    tg(`mandate.stopped.${news.reason}`, locale, { n: String(record.lock?.perDay ?? '') }),
    tg('lock.stopped.tail', locale),
  ];
  await note(news.owner, 'lock-stopped', String(record.stopped?.at ?? now), tg('lock.stopped.heading', locale), lines, undefined, now);
}

async function ask(input: { pick: LockPick; jobId: string; reason: AskReason; totalUsdc: string; addUsdc?: string }, now: number): Promise<void> {
  const { pick, jobId, reason } = input;
  const locale = await localeOf(pick.owner);
  const lines = [
    tg('lock.ask.lead', locale, { price: pick.priceUsdc, who: await nameOf(pick.seller, jobId) }),
    tg(`lock.ask.${reason}`, locale, { total: input.totalUsdc, add: input.addUsdc ?? '' }),
    tg('lock.ask.tail', locale),
  ];
  // The same seller, price and reason is said once a day; a new reason is new.
  await note(pick.owner, 'lock-asked', `${key(jobId)}:${pick.seller.toLowerCase()}:${pick.priceUsdc}:${reason}`, tg('lock.ask.heading', locale), lines, jobId, now);
}

function depsFor(job: string, now: number, forced?: { seller: string; priceUsdc: string }): LockDeps {
  // One read of the request's money for each price, shared by the checks.
  const views = new Map<string, ReturnType<typeof lockMoneyView>>();
  const money = async (priceUsdc: string) => {
    if (!views.has(priceUsdc)) views.set(priceUsdc, lockMoneyView(job, priceUsdc));
    const view = await views.get(priceUsdc)!;
    if (!view) throw new Error('request is not open');
    return view;
  };
  let price = '0';
  return {
    serverOn: () => config.AUTOPILOT_LOCK_ENABLED,
    familyOpen: () => suiteFundingEnabled(),
    pick: async (jobId) => {
      const pick = await pickFor(jobId, forced);
      if (pick) price = pick.priceUsdc;
      return pick;
    },
    step: (jobId) => getRecord<LockStep>(KIND, key(jobId)),
    writeStep: (jobId, step) => putRecord(KIND, key(jobId), step),
    funded: async (jobId) => getBuyerJob(jobId)?.escrowFunded === true || !!(await getMatchProposal(jobId))?.approvedAt,
    person: async (owner) => {
      const [profile, record] = await Promise.all([getProfile(owner), getAgentRecord(owner)]);
      return {
        agentOn: agentPrefsOf(profile).agentOn !== false,
        lock: aloneOf(profile, record).lock,
        timeZone: record.brief?.timeZone ?? DEFAULT_BRIEF.timeZone,
      };
    },
    family: async () => (await money(price)).family,
    totalUsdc: async (priceUsdc) => (await money(priceUsdc)).totalUsdc,
    shortBy: async (pick) => (await money(pick.priceUsdc)).shortByUsdc,
    seller: async (sellerAgent) => {
      const owner = (await findAgentWalletByAgentAddress(sellerAgent).catch(() => null))?.userAddress;
      if (!owner) return { verified: false, settledDeals: 0, upheldDisputes: 0 };
      const [level, facts] = await Promise.all([levelOf(owner), loadPartyFacts(owner, now)]);
      return { verified: isVerified(level), settledDeals: facts.settledDeals, upheldDisputes: facts.lostDisputes };
    },
    marketUsdc: async () => (await money(price)).marketUsdc,
    outlierPct: MARKET_OVERPAY_ALERT_PCT,
    reserve: reserveLock,
    update: updateAgentRecord,
    shortlistOk: async (jobId, seller) => {
      const entries = getShortlist(jobId) ?? [];
      const listed = entries.some((e) => e.seller.toLowerCase() === seller.toLowerCase());
      const owner = listed ? null : await findAgentWalletByAgentAddress(seller).catch(() => null);
      const offListVerified = listed || (!!owner && isVerified(await levelOf(owner.userAddress)));
      return shortlistChoiceCheck(entries, seller, false, offListVerified).ok;
    },
    // A World ID check on either side is the person's to start: the agent
    // never confirms one for them and never skips one.
    worldStep: async (jobId, pick) => {
      const { step } = await worldStepForChoice({ jobId, buyerUser: pick.owner, sellerAgent: pick.seller, priceUsdc: pick.priceUsdc, acknowledgeUnverified: false, now });
      return step.kind === 'proceed' ? 'proceed' : 'buyer';
    },
    sellerAnswer: async (jobId, pick) => {
      const res = await sellerAnswerStep({
        jobId,
        sellerAgent: pick.seller,
        priceUsdc: pick.priceUsdc,
        buyerUser: pick.owner,
        requestDeadlineUnix: getBuyerJob(jobId)?.deadlineUnix ?? null,
        byAgent: true,
        now,
      });
      return !res.wait ? 'go' : res.declined ? 'declined' : 'wait';
    },
    fund: (jobId, seller, priceUsdc) => chooseAgentOffer(jobId, seller, priceUsdc),
    ask: (input) => ask(input, now),
    tell: (news) => {
      void tellNews(news, now).catch((err: Error) => logger.warn({ err: err.message, type: news.type }, 'lock note failed'));
    },
  };
}

async function runWith(jobId: string, now: number, opts: { sellerSaidYes?: boolean; forced?: { seller: string; priceUsdc: string } }): Promise<LockOutcome> {
  const outcome = await lockAlone(depsFor(jobId, now, opts.forced), jobId, now, { sellerSaidYes: opts.sellerSaidYes });
  if (outcome.kind !== 'skipped') logger.info({ jobId, outcome }, 'lock step');
  return outcome;
}

let chain: Promise<unknown> = Promise.resolve();
const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
  const next = chain.catch(() => undefined).then(work);
  chain = next;
  return next;
};

/// Runs the lock step for a request unless a person's own action is in flight.
export function runLockStep(jobId: string, now = Date.now()): Promise<LockOutcome> {
  return oneAtATime(async () => {
    if (jobActionsInFlight.has(jobId)) return { kind: 'skipped', why: 'in-flight' } as LockOutcome;
    jobActionsInFlight.add(jobId);
    try {
      return await runWith(jobId, now, {});
    } finally {
      jobActionsInFlight.delete(jobId);
    }
  });
}

/// The seller said yes to the choice the agent made. The limits are checked
/// again as they stand now. The caller holds the request's in-flight mark.
export function lockAfterSellerYes(jobId: string, seller: string, priceUsdc: string, now = Date.now()): Promise<LockOutcome> {
  return oneAtATime(() => runWith(jobId, now, { sellerSaidYes: true, forced: { seller, priceUsdc } }));
}

/// Whether this person's agent will try to lock alone, so the older "tap to
/// lock" line steps aside.
export async function lockIsOnFor(owner: string): Promise<boolean> {
  if (!config.AUTOPILOT_LOCK_ENABLED) return false;
  const [profile, record] = await Promise.all([getProfile(owner).catch(() => null), getAgentRecord(owner)]);
  return aloneOf(profile, record).lock && !!record.lock;
}

/// Steps a restart interrupted: each is checked against the escrow and
/// finished once.
export async function resumeLocks(now = Date.now()): Promise<number> {
  if (!config.AUTOPILOT_LOCK_ENABLED) return 0;
  let n = 0;
  for (const { key: jobId, data } of await listRecords<LockStep>(KIND)) {
    if (data.state !== 'started') continue;
    await runLockStep(jobId, now).catch((err: Error) => logger.warn({ err: err.message, jobId }, 'lock step could not resume'));
    n += 1;
  }
  return n;
}

export function startLockAlone(): () => void {
  if (!config.AUTOPILOT_LOCK_ENABLED) return () => undefined;
  void resumeLocks().catch((err: Error) => logger.warn({ err: err.message }, 'resuming lock steps failed'));
  return bus.subscribe((e: KarwanEvent) => {
    if (e.type !== 'request.shortlist' || !e.jobId) return;
    void runLockStep(e.jobId).catch((err: Error) => logger.warn({ err: err.message, jobId: e.jobId }, 'lock step failed'));
  });
}
