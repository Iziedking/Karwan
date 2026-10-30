import { formatUnits, parseUnits, type Address } from 'viem';
import type { WorkKind } from '../chain/timeEscrow.js';
import type { WorkOffer, WorkRequest, WorkRequestsStore } from '../db/workRequests.js';
import type { Engagement } from '../db/engagements.js';
import type { WorkInput } from './engagements.js';

/// Hourly work posted to the market (view 32). The hirer posts the most they
/// pay an hour; sellers who fit are told and offer a rate; the hirer's agent
/// ranks the offers by what each person has actually done on Karwan (skill
/// fit first, verified next, rating, then rate) and recommends one; hiring
/// opens the work on the time escrow with the worker's agent accepting the
/// exact terms they offered. Nobody uploads anything to prove themselves.

const DAY = 86_400_000;
const USDC = 6;

export interface WorkRequestInput {
  kind: WorkKind;
  title: string;
  brief: string;
  maxRateUsdc: string;
  maxHours?: number;
  periods: number;
  startsInDays?: number;
}

/// One row of the hirer's list, sealed: who they are and why, never a score,
/// a count, an amount or who they dealt with (UI law rule 3).
export interface RankedOffer {
  offerId: string;
  seller: Address;
  name: string;
  tag: string | null;
  verified: boolean;
  tier: string;
  rating: unknown;
  reasons: string[];
  recommended: boolean;
  rateMicros: string;
  note: string;
  overMost: boolean;
}

type Refusal = { ok: false; code: string; message: string; needMicros?: string };

export interface WorkRequestPorts {
  store: WorkRequestsStore;
  /// The hourly work core: its card and its offer, the worker already agreeing.
  draftWork(hirer: Address, input: WorkInput): Promise<{ ok: true; card: unknown } | Refusal>;
  offerWork(hirer: Address, input: WorkInput, opts: { fromJob: string; fromOffer: string; workerAgreed: true }): Promise<{ ok: true; work: Engagement } | Refusal>;
  sellerAgentFor(user: Address): Promise<{ address: Address } | null>;
  /// What the request is about, for matching sellers.
  keywords(text: string): Promise<string[]>;
  /// Sellers on the market who fit, by what they sell. Never the hirer.
  reach(r: WorkRequest): Promise<Address[]>;
  /// The live offers, best fit first, sealed.
  rank(r: WorkRequest, offers: WorkOffer[]): Promise<RankedOffer[]>;
  tellPerson(address: Address, text: string, link: string): void;
  /// The rate a reached seller's agent offers from their hourly or monthly
  /// way, or null when they have none that fits (view 32).
  timeOfferFor?(seller: Address, work: { kind: 'hourly' | 'monthly'; mostUsdc: number; maxHours: number }): Promise<number | null>;
  now(): number;
  newId(prefix: string): string;
}

const lower = (a: string) => a.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);
const usdc = (micros: string | bigint) => formatUnits(BigInt(micros), USDC);
const refuse = (code: string, message: string): Refusal => ({ ok: false, code, message });
const per = (r: Pick<WorkRequest, 'kind'>) => (r.kind === 'hourly' ? 'an hour' : 'a month');

export function createWorkRequests(p: WorkRequestPorts) {
  const busy = new Set<string>();

  async function post(hirer: Address, input: WorkRequestInput): Promise<{ ok: true; request: WorkRequest } | Refusal> {
    const title = input.title.trim();
    const brief = input.brief.trim();
    if (!title || title.length > 80) return refuse('BAD_TERMS', 'Give the work a short title.');
    if (!brief || brief.length > 1_500) return refuse('BAD_TERMS', 'Say what the work is, in up to 1,500 characters, so the right people find it.');
    if (input.kind !== 'hourly' && input.kind !== 'monthly') return refuse('BAD_TERMS', 'Pay by the hour or monthly.');
    let rate: bigint;
    try {
      rate = parseUnits(input.maxRateUsdc, USDC);
    } catch {
      return refuse('BAD_TERMS', 'The most you pay must be an amount in USDC.');
    }
    if (rate <= 0n) return refuse('BAD_TERMS', 'The most you pay must be more than 0.');
    const hourly = input.kind === 'hourly';
    const maxHours = hourly ? input.maxHours ?? 0 : 1;
    if (hourly && (!Number.isInteger(maxHours) || maxHours < 1 || maxHours > 80)) return refuse('BAD_TERMS', 'Set the most hours a week, 1 to 80.');
    if (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > (hourly ? 52 : 12)) {
      return refuse('BAD_TERMS', hourly ? 'Hire for 1 to 52 weeks.' : 'Hire for 1 to 12 months.');
    }
    const startsIn = input.startsInDays ?? 7;
    if (!Number.isInteger(startsIn) || startsIn < 2 || startsIn > 30) return refuse('BAD_TERMS', 'Start 2 to 30 days from today, so there is time to choose.');
    const at = p.now();
    const request: WorkRequest = {
      id: p.newId('wr'), hirer, kind: input.kind, title, brief, keywords: await p.keywords(`${title}. ${brief}`).catch(() => []),
      maxRateMicros: rate.toString(), maxHours, periods: input.periods, startsAt: at + startsIn * DAY,
      status: 'open', createdAt: at, updatedAt: at,
    };
    await p.store.create(request);
    const fits = (await p.reach(request).catch(() => [])).filter((s) => !same(s, hirer));
    for (const s of fits) {
      // A seller with a way of this kind has their agent offer at once.
      const auto = p.timeOfferFor
        ? await p.timeOfferFor(s, { kind: request.kind, mostUsdc: Number(usdc(rate)), maxHours: request.maxHours }).catch(() => null)
        : null;
      const made = auto !== null ? await offer(s, request.id, { rateUsdc: auto.toFixed(2) }) : null;
      if (made?.ok) {
        p.tellPerson(s, `Your agent offered ${usdc(made.offer.rateMicros)} USDC ${per(request)} on ${title}. You can change or withdraw it.`, `/work/requests/${request.id}`);
        continue;
      }
      p.tellPerson(s, `New ${hourly ? 'hourly' : 'monthly'} work that fits you: ${title}, up to ${usdc(rate)} USDC ${per(request)}${hourly ? `, ${maxHours} hours a week` : ''}. Offer your rate if you want it.`, `/work/requests/${request.id}`);
    }
    const live = (await p.store.patch(request.id, { told: fits.length }))!;
    return { ok: true, request: live };
  }

  async function offer(seller: Address, id: string, i: { rateUsdc: string; note?: string }): Promise<{ ok: true; offer: WorkOffer } | Refusal> {
    const r = await p.store.get(id);
    if (!r) return refuse('NOT_FOUND', 'That work is not on Karwan.');
    if (r.status !== 'open' || p.now() >= r.startsAt - DAY) return refuse('CLOSED', 'This work is no longer taking offers.');
    if (same(seller, r.hirer)) return refuse('OWN_REQUEST', 'You cannot offer on your own work.');
    let rate: bigint;
    try {
      rate = parseUnits(i.rateUsdc, USDC);
    } catch {
      return refuse('BAD_TERMS', 'Your rate must be an amount in USDC.');
    }
    if (rate <= 0n) return refuse('BAD_TERMS', 'Your rate must be more than 0.');
    const note = (i.note ?? '').trim();
    if (note.length > 300) return refuse('BAD_TERMS', 'Keep the note under 300 characters.');
    const agent = await p.sellerAgentFor(seller);
    if (!agent) return refuse('NO_SELLER_AGENT', 'Set up selling on Karwan first, so you can be paid.');
    const key = `${id}:${lower(seller)}`;
    if (busy.has(key)) return refuse('BUSY', 'Your offer is already on its way.');
    busy.add(key);
    try {
      const before = await p.store.liveOfferBy(id, seller);
      const at = p.now();
      let o: WorkOffer;
      if (before) {
        o = (await p.store.patchOffer(before.id, { rateMicros: rate.toString(), note }))!;
      } else {
        o = { id: p.newId('wo'), requestId: id, seller, sellerAgent: agent.address, rateMicros: rate.toString(), note, status: 'live', createdAt: at, updatedAt: at };
        await p.store.createOffer(o);
      }
      p.tellPerson(r.hirer, `${r.title}: ${before ? 'an offer changed' : 'a new offer'}, ${usdc(rate)} USDC ${per(r)}. Your agent has ranked them for you.`, `/work/requests/${id}`);
      return { ok: true, offer: o };
    } finally {
      busy.delete(key);
    }
  }

  async function withdraw(seller: Address, id: string) {
    const o = await p.store.liveOfferBy(id, seller);
    if (!o) return refuse('NO_OFFER', 'You have no offer on this work.');
    return { ok: true as const, offer: (await p.store.patchOffer(o.id, { status: 'withdrawn' }))! };
  }

  function inputFor(r: WorkRequest, o: WorkOffer): WorkInput {
    return {
      worker: o.seller, kind: r.kind, rateUsdc: usdc(o.rateMicros), periods: r.periods, title: r.title, brief: r.brief,
      startsInDays: Math.max(1, Math.min(30, Math.round((r.startsAt - p.now()) / DAY))),
      ...(r.kind === 'hourly' ? { maxHours: r.maxHours } : {}),
    };
  }

  async function hireCard(hirer: Address, id: string, offerId: string) {
    const r = await p.store.get(id);
    if (!r || !same(r.hirer, hirer)) return refuse('NOT_FOUND', 'That work is not on Karwan.');
    const o = await p.store.offer(offerId);
    if (!o || o.requestId !== id || o.status !== 'live') return refuse('NO_OFFER', 'That offer is no longer there.');
    return p.draftWork(hirer, inputFor(r, o));
  }

  async function hire(hirer: Address, id: string, offerId: string): Promise<{ ok: true; work: Engagement; request: WorkRequest } | Refusal> {
    const r = await p.store.get(id);
    if (!r || !same(r.hirer, hirer)) return refuse('NOT_FOUND', 'That work is not on Karwan.');
    if (r.status !== 'open') return refuse('CLOSED', 'This work is no longer open.');
    const o = await p.store.offer(offerId);
    if (!o || o.requestId !== id || o.status !== 'live') return refuse('NO_OFFER', 'That offer is no longer there.');
    if (!(await p.store.patchIfStatus(id, ['open'], { status: 'hired', hiredOffer: offerId }))) return refuse('BUSY', 'Someone is already being hired for this.');
    const out = await p.offerWork(hirer, inputFor(r, o), { fromJob: id, fromOffer: offerId, workerAgreed: true });
    if (!out.ok) {
      await p.store.patch(id, { status: 'open' });
      return out;
    }
    await p.store.patchOffer(offerId, { status: 'hired' });
    for (const other of await p.store.offers(id)) {
      if (other.id === offerId || other.status !== 'live') continue;
      await p.store.patchOffer(other.id, { status: 'filled' });
      p.tellPerson(other.seller, `${r.title}: the hirer chose someone else this time. Thanks for offering.`, `/work/requests/${id}`);
    }
    const request = (await p.store.patch(id, { workId: out.work.id }))!;
    return { ok: true, work: out.work, request };
  }

  async function close(hirer: Address, id: string) {
    const r = await p.store.get(id);
    if (!r || !same(r.hirer, hirer)) return refuse('NOT_FOUND', 'That work is not on Karwan.');
    const live = await p.store.patchIfStatus(id, ['open'], { status: 'closed' });
    if (!live) return refuse('CLOSED', 'This work is no longer open.');
    for (const o of await p.store.offers(id)) {
      if (o.status !== 'live') continue;
      await p.store.patchOffer(o.id, { status: 'filled' });
      p.tellPerson(o.seller, `${r.title}: the hirer closed it without hiring.`, `/work/requests/${id}`);
    }
    return { ok: true as const, request: live };
  }

  /// Open work whose start has come with nobody hired closes; the hirer is told.
  async function expireDue(): Promise<number> {
    let n = 0;
    for (const r of await p.store.listOpen()) {
      if (p.now() < r.startsAt - DAY) continue;
      if (!(await p.store.patchIfStatus(r.id, ['open'], { status: 'expired' }))) continue;
      p.tellPerson(r.hirer, `${r.title}: offers have closed and nobody was hired. Post it again with a later start if you still need it.`, `/work/requests/${r.id}`);
      n += 1;
    }
    return n;
  }

  const publicOf = (r: WorkRequest) => ({
    id: r.id, kind: r.kind, title: r.title, brief: r.brief, maxRateMicros: r.maxRateMicros, maxHours: r.maxHours,
    periods: r.periods, startsAt: r.startsAt, status: r.status, offersCloseAt: r.startsAt - DAY,
  });

  /// Open work for the market, newest first.
  async function listOpen() {
    const now = p.now();
    return (await p.store.listOpen()).filter((r) => now < r.startsAt - DAY).map(publicOf);
  }

  /// The hirer sees the ranked offers; a seller sees their own offer.
  async function view(id: string, viewer: Address | null) {
    const r = await p.store.get(id);
    if (!r) return null;
    const base = { ...publicOf(r), mine: !!viewer && same(viewer, r.hirer), ...(r.workId && viewer && same(viewer, r.hirer) ? { workId: r.workId } : {}) };
    if (viewer && same(viewer, r.hirer)) {
      const live = (await p.store.offers(id)).filter((o) => o.status === 'live');
      return { ...base, offers: await p.rank(r, live), offerCount: live.length };
    }
    const own = viewer ? await p.store.liveOfferBy(id, viewer) : null;
    const anyOwn = viewer && !own ? (await p.store.offers(id)).filter((o) => same(o.seller, viewer)).pop() ?? null : own;
    return { ...base, ...(anyOwn ? { myOffer: { id: anyOwn.id, rateMicros: anyOwn.rateMicros, note: anyOwn.note, status: anyOwn.status } } : {}) };
  }

  async function mine(hirer: Address) {
    return (await p.store.listBy(hirer)).map(publicOf);
  }

  return { post, offer, withdraw, hireCard, hire, close, expireDue, listOpen, view, mine };
}

export type WorkRequests = ReturnType<typeof createWorkRequests>;
