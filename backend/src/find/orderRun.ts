import type { PrivateLocation } from '../location/rules.js';
import type { AlertOutcome } from './alerts.js';
import type { Contact, PitchOffer } from './contacts.js';
import { asOf, findEndsAt, type Find } from './finds.js';
import { keywordsOf } from './keywords.js';
import { LIMITS } from './limits.js';
import { afterRequestEvent, rolled, type StandingOrder } from './orders.js';
import type { PitchOutcome } from './pitches.js';
import { rankForFind, type FindCandidate } from './rank.js';
import { rankBuyersFor, type LeadCandidate, type LeadSeller } from './rankBuyers.js';

/// One run of one standing order (view 87, step 4). A buying order keeps one
/// private request open and each day asks the best people not yet asked; a
/// selling order pitches buyers' regular needs at the seller's own price.
/// View 72's limits are enforced where each contact is created, so a run can
/// only ask fewer than it wanted, never more. Nothing here agrees a price or
/// moves money: offers, bargaining, Agree for me and the lock step take it on.

export type RunOutcome =
  | { kind: 'asked'; n: number; names: string[] }
  | { kind: 'pitched'; n: number }
  /// Nobody new fits. `days` is how many runs in a row found nobody.
  | { kind: 'nobody'; days: number }
  /// Everyone who fits was asked; their answers are still to come.
  | { kind: 'waiting' }
  /// It cannot go on until the person does something. `first` is the run that found out.
  | { kind: 'needs-location'; first: boolean }
  | { kind: 'short'; first: boolean }
  | { kind: 'not-posted' }
  | { kind: 'off' }
  | { kind: 'ended'; why: 'date' | 'locked' };

export interface RunDeps {
  /// The agent is on, has not stopped itself, and Find people is on.
  canWork(owner: string): Promise<boolean>;
  /// The person's own day ("2026-11-16") at an instant.
  day(owner: string, now: number): Promise<string>;
  buyer(owner: string): Promise<{ location: PrivateLocation | null; verified: boolean }>;
  people(need: { keywords: string[]; text: string; kind: Find['kind'] }): Promise<FindCandidate[]>;
  blocked(owner: string): Promise<Set<string>>;
  cleanRecordCounts: boolean;
  saveFind(f: Find): Promise<Find>;
  findById(id: string): Promise<Find | null>;
  contactsOfFind(findId: string): Promise<Contact[]>;
  /// Whether the person's agent may agree a price alone, read when a request is posted.
  agreeOn(owner: string): Promise<boolean>;
  /// Posts the find's need privately, open only to the people named.
  post(input: { find: Find; invited: string[]; agreeForMe: boolean }): Promise<{ ok: true; jobId: string } | { ok: false; code: 'short' | 'failed' }>;
  /// Opens the request to more people from the same find.
  invite(jobId: string, people: string[]): Promise<void>;
  alert(input: { find: Find; picks: number[]; jobId: string }, now: number): Promise<AlertOutcome>;
  requestState(jobId: string): Promise<'open' | 'locked' | 'ended'>;
  customers(owner: string): Promise<{ seller: LeadSeller | null; leads: LeadCandidate[] }>;
  /// The needs this seller already pitched.
  pitched(owner: string): Promise<Set<string>>;
  /// The seller's usual price and days, from their ways; null when they set no price.
  sellWay(owner: string): Promise<{ priceUsdc: string; days: number } | null>;
  pitch(input: { find: Find; picks: number[]; offer: PitchOffer }, now: number): Promise<PitchOutcome>;
  newId(): string;
}

export interface RunResult {
  order: StandingOrder;
  outcome: RunOutcome;
}

const lower = (s: string) => s.toLowerCase();

const nobody = (o: StandingOrder): RunResult => {
  const days = o.emptyRuns + 1;
  return { order: { ...o, emptyRuns: days }, outcome: { kind: 'nobody', days } };
};

function counted(o: StandingOrder, n: number): StandingOrder {
  const { told: _told, ...rest } = o;
  return { ...rest, emptyRuns: 0, today: { ...o.today, asked: o.today.asked + n }, week: { ...o.week, asked: o.week.asked + n } };
}

/// Told once: the run that finds out says so, later runs wait quietly.
function held(o: StandingOrder, what: 'location' | 'money'): RunResult {
  const first = o.told !== what;
  return { order: first ? { ...o, told: what } : o, outcome: { kind: what === 'location' ? 'needs-location' : 'short', first } };
}

async function ranked(deps: RunDeps, o: StandingOrder, asked: ReadonlySet<string>) {
  const [buyer, candidates, blocked] = await Promise.all([
    deps.buyer(o.owner),
    deps.people({ keywords: keywordsOf(o.need), text: o.need, kind: o.kind }),
    deps.blocked(o.owner),
  ]);
  return rankForFind(
    candidates,
    { text: o.need, keywords: keywordsOf(o.need), budgetUsdc: Number(o.budgetUsdc), kind: o.kind, where: o.where, buyer: o.owner, buyerLocation: buyer.location, buyerVerified: buyer.verified },
    { requireVerified: false, blocked: new Set([...blocked, ...asked]), cleanRecordCounts: deps.cleanRecordCounts },
  );
}

/// An alert that failed asked nobody; the order still keeps its request, so
/// the next run goes on from it instead of posting another.
async function alerted(deps: RunDeps, input: { find: Find; picks: number[]; jobId: string }, now: number): Promise<AlertOutcome> {
  return deps.alert(input, now).catch(() => ({ asked: [], refused: [] }));
}

async function runBuy(deps: RunDeps, order: StandingOrder, now: number): Promise<RunResult> {
  let o = order;
  if (o.jobId) {
    const state = await deps.requestState(o.jobId);
    if (state === 'locked') return { order: afterRequestEvent(o, 'locked', now), outcome: { kind: 'ended', why: 'locked' } };
    if (state === 'ended') o = afterRequestEvent(o, 'closed', now);
  }
  const kept = o.findId ? await deps.findById(o.findId) : null;
  let find = kept && kept.jobId && asOf(kept, now).status !== 'ended' ? kept : null;
  if (!find && (o.findId || o.jobId)) o = { ...o, findId: null, jobId: null };

  if (!find) {
    if (o.kind === 'in_person') {
      const { location } = await deps.buyer(o.owner);
      if (!location?.city && !location?.point) return held(o, 'location');
    }
    const rows = await ranked(deps, o, new Set());
    if (rows.length === 0) return nobody(o);
    const draft: Find = {
      id: deps.newId(), owner: o.owner, side: 'buyer', mode: 'choose', need: o.need, budgetUsdc: String(o.budgetUsdc), kind: o.kind, where: o.where,
      jobId: null, needId: null, rows, status: 'shortlisted', createdAt: now, endsAt: findEndsAt(now, o.until),
    };
    const picks = rows.slice(0, Math.min(o.perDay, LIMITS.alertsPerFind)).map((_, i) => i);
    const posted = await deps.post({ find: draft, invited: picks.map((i) => lower(rows[i]!.user)), agreeForMe: await deps.agreeOn(o.owner) });
    // A find is kept only once its request is up, so a run that could not post leaves nothing behind.
    if (!posted.ok) return posted.code === 'short' ? held(o, 'money') : { order: o, outcome: { kind: 'not-posted' } };
    const fresh = await deps.saveFind({ ...draft, jobId: posted.jobId, status: 'contacting' });
    o = { ...o, findId: fresh.id, jobId: posted.jobId };
    const sent = await alerted(deps, { find: fresh, picks, jobId: posted.jobId }, now);
    return sent.asked.length ? { order: counted(o, sent.asked.length), outcome: { kind: 'asked', n: sent.asked.length, names: sent.asked } } : { order: o, outcome: { kind: 'waiting' } };
  }

  const jobId = find.jobId!;
  const contacts = (await deps.contactsOfFind(find.id)).filter((c) => c.kind === 'alert');
  const asked = new Set(contacts.map((c) => c.to));
  const open = contacts.filter((c) => c.answer === null && c.closedAt === null).length;
  const room = Math.min(o.perDay, LIMITS.alertsPerFind - open);
  if (room <= 0) return { order: o, outcome: { kind: 'waiting' } };
  let left = find.rows.map((r, i) => ({ i, user: lower(r.user) })).filter((r) => !asked.has(r.user));
  if (left.length === 0) {
    // Everyone on the list was asked: look for people who fit and were not.
    const more = await ranked(deps, o, asked);
    if (more.length === 0) {
      const live = contacts.some((c) => c.closedAt === null && (c.answer === null || c.answer === 'interested'));
      return live ? { order: o, outcome: { kind: 'waiting' } } : nobody(o);
    }
    const from = find.rows.length;
    find = await deps.saveFind({ ...find, rows: [...find.rows, ...more] });
    left = more.map((r, n) => ({ i: from + n, user: lower(r.user) }));
  }
  const picks = left.slice(0, room);
  await deps.invite(jobId, picks.map((p) => p.user));
  const sent = await alerted(deps, { find, picks: picks.map((p) => p.i), jobId }, now);
  return sent.asked.length ? { order: counted(o, sent.asked.length), outcome: { kind: 'asked', n: sent.asked.length, names: sent.asked } } : { order: o, outcome: { kind: 'waiting' } };
}

async function runSell(deps: RunDeps, o: StandingOrder, now: number): Promise<RunResult> {
  const way = await deps.sellWay(o.owner);
  if (!way) return nobody(o);
  const [{ seller, leads }, pitched, blocked] = await Promise.all([deps.customers(o.owner), deps.pitched(o.owner), deps.blocked(o.owner)]);
  if (!seller) return nobody(o);
  // Open requests are left to the selling agent, which already offers on them.
  const needs = leads.filter((l) => l.kind === 'need' && !pitched.has(l.ref));
  const rows = rankBuyersFor(needs, seller, { blocked, max: o.perDay });
  if (rows.length === 0) return nobody(o);
  const find = await deps.saveFind({
    id: deps.newId(), owner: o.owner, side: 'seller', mode: 'choose', need: o.need, budgetUsdc: '0', kind: o.kind, where: o.where,
    jobId: null, needId: null, rows: [], leads: rows, status: 'shortlisted', createdAt: now, endsAt: findEndsAt(now, o.until),
  });
  const sent = await deps.pitch({ find, picks: rows.map((_, i) => i), offer: { priceUsdc: way.priceUsdc, days: way.days, note: '' } }, now);
  if (sent.pitched === 0) return { order: o, outcome: { kind: 'waiting' } };
  return { order: counted({ ...o, findId: find.id }, sent.pitched), outcome: { kind: 'pitched', n: sent.pitched } };
}

/// Works the order once. The order that comes back is what to save.
export async function runOrder(deps: RunDeps, order: StandingOrder, now: number): Promise<RunResult> {
  const o = rolled(order, now, await deps.day(order.owner, now));
  if (o.until !== null && now >= o.until) return { order: { ...o, state: 'ended', endedAt: now }, outcome: { kind: 'ended', why: 'date' } };
  if (!(await deps.canWork(o.owner))) return { order: o, outcome: { kind: 'off' } };
  return o.side === 'buy' ? runBuy(deps, o, now) : runSell(deps, o, now);
}
