import { formatUnits, keccak256, parseUnits, toBytes, type Address, type Hex } from 'viem';
import { buildTimeTerms, payFor, timeTermsHash, weekCost, type TimeTermsT, type WorkKind } from '../chain/timeEscrow.js';
import type { Engagement, EngagementsStore, EngagementWeek, StoredTimeTerms } from '../db/engagements.js';

/// Hourly work and monthly retainers on the time escrow (view 32). The hirer's
/// buying agent offers the terms and funds one week or month at a time; the
/// worker's selling agent accepts and logs the hours; approved hours are paid
/// at once, silence pays when review ends, and objected hours go to Karwan's
/// review team. Every step is proved from its receipt by the chain port before
/// anyone is told.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const USDC = 6;
/// Karwan waits this long after an objection before it takes it to the review
/// team, so the two sides can settle it themselves.
export const COOL_OFF_MS = 72 * HOUR;
/// The review team's ruling period on the contract; past it, the fallback share applies.
export const RULING_MS = 5 * DAY;
/// Weeks a hirer may fund ahead once the worker has finished an engagement.
export const MOST_AHEAD = 4;

export interface WorkInput {
  /// A Karwan tag or a wallet address.
  worker: string;
  kind: WorkKind;
  rateUsdc: string;
  /// Most hours a week; ignored for monthly.
  maxHours?: number;
  /// Weeks for hourly work, months for a retainer.
  periods: number;
  /// Days from now the first week or month starts; 2 by default.
  startsInDays?: number;
  title: string;
  brief: string;
}

export interface WorkCard {
  kind: WorkKind;
  title: string;
  brief: string;
  worker: Address;
  rateMicros: string;
  maxHours: number;
  periods: number;
  startsAt: number;
  budgetMicros: string;
  feeHalfMicros: string;
  totalMicros: string;
  mostMicros: string;
  note: string;
}

type Refusal = { ok: false; code: string; message: string; needMicros?: string };
type Agent = { walletId: string; address: Address };
type Paid = { txHash: Hex; paid: bigint };

export interface WorkChain {
  offer(walletId: string, i: { salt: Hex; terms: TimeTermsT; feeBps: number; employer: Address; total: bigint }): Promise<{ id: Hex; txHash: Hex }>;
  accept(walletId: string, id: Hex, termsHash: Hex): Promise<Hex>;
  cancel(walletId: string, id: Hex): Promise<{ txHash: Hex; back: bigint }>;
  fund(walletId: string, i: { id: Hex; k: number; terms: TimeTermsT; feeBps: number; total: bigint }): Promise<Hex>;
  submit(walletId: string, i: { id: Hex; k: number; units: number; evidence: Hex }): Promise<Hex>;
  approve(walletId: string, i: { id: Hex; k: number; units: number; worker: Address }): Promise<Paid>;
  object(walletId: string, i: { id: Hex; k: number; units: number; clauseHash: Hex; worker: Address }): Promise<Paid>;
  notice(walletId: string, id: Hex): Promise<{ txHash: Hex; runs: number }>;
  /// Anyone may settle, close or apply the fallback; Karwan's operator pays the gas.
  settle(i: { id: Hex; k: number; worker: Address }): Promise<{ txHash: Hex; gross: bigint; back: bigint; paidNow: bigint }>;
  fallback(i: { id: Hex; k: number; worker: Address }): Promise<{ txHash: Hex; gross: bigint; back: bigint; paidNow: bigint }>;
  close(id: Hex): Promise<{ txHash: Hex; refunded: bigint }>;
  /// Karwan's arbiter key takes objected hours to the review team.
  escalate(i: { id: Hex; k: number }): Promise<Hex>;
}

export interface WorkPorts {
  store: EngagementsStore;
  chain: WorkChain;
  openingConfig(): Promise<{ open: boolean; feeBps: number; perDealCap: bigint }>;
  asset: Hex;
  /// A tag or an address to the identity wallet it belongs to.
  resolveWorker(raw: string): Promise<Address | null>;
  buyerAgentFor(user: Address): Promise<Agent | null>;
  sellerAgentFor(user: Address): Promise<Agent | null>;
  /// The identity a wallet belongs to on the record, 0 for none.
  identityOf(wallet: Address): Promise<bigint>;
  balanceOf(wallet: Address): Promise<bigint>;
  /// The money-out guard and the chat limits, as on funding a deal.
  guard(user: Address, amountMicros: bigint, reference: string): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  /// One plain update to one person, on their channels.
  tellPerson(address: Address, text: string, workId: string): void;
  emit(kind: string, payload: Record<string, unknown>): void;
  now(): number;
  newId(prefix: string): string;
  newSalt(): Hex;
  /// How a person is named to the other side: their tag, or their name.
  nameOf?(address: Address): Promise<string>;
}

const lower = (a: string) => a.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);
export const usdcText = (micros: bigint | string) => formatUnits(BigInt(micros), USDC);
const refuse = (code: string, message: string, extra: { needMicros?: string } = {}): Refusal => ({ ok: false, code, message, ...extra });

/// "12 h 30 m", "45 m", "3 h".
export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} m`;
  return h ? `${h} h` : `${m} m`;
}

export const termsOf = (s: StoredTimeTerms): TimeTermsT => ({
  ...s, rate: BigInt(s.rate), startsAt: BigInt(s.startsAt), acceptBy: BigInt(s.acceptBy),
});
const storeTerms = (t: TimeTermsT): StoredTimeTerms => ({
  ...t, rate: t.rate.toString(), startsAt: t.startsAt.toString(), acceptBy: t.acceptBy.toString(),
});

/// When week or month `k` runs, when logging for it closes, and when its review ends.
export function windowsOf(e: Pick<Engagement, 'startsAt' | 'terms'>, k: number) {
  const len = e.terms.cycleSecs * 1000;
  const start = e.startsAt + k * len;
  const end = start + len;
  const logBy = end + e.terms.claimGrace * 1000;
  return { start, end, logBy, reviewBy: logBy + e.terms.reviewWindow * 1000 };
}

/// When anyone may settle the week: logging has closed, and so has the review
/// unless every logged unit is already approved. Mirrors `settleAt` on chain.
export function settleAt(e: Engagement, w: EngagementWeek): number {
  const win = windowsOf(e, w.k);
  return w.loggedMinutes > w.approvedMinutes ? win.reviewBy : win.logBy;
}

const unitsOf = (e: Engagement, minutes: number) => (e.kind === 'hourly' ? minutes : minutes > 0 ? 1 : 0);
const periodWord = (e: Pick<Engagement, 'kind'>) => (e.kind === 'hourly' ? 'week' : 'month');
const runsOf = (e: Engagement) => e.runs ?? e.periods;

export function createEngagements(p: WorkPorts) {
  const busy = new Set<string>();
  async function locked<T>(key: string, message: string, fn: () => Promise<T>): Promise<T | Refusal> {
    if (busy.has(key)) return refuse('BUSY', message);
    busy.add(key);
    try {
      return await fn();
    } finally {
      busy.delete(key);
    }
  }

  async function ownWallet(a: Address, aAgent: Address, b: Address, bAgent: Address): Promise<boolean> {
    if (same(a, b) || same(aAgent, bAgent) || same(a, bAgent) || same(aAgent, b)) return true;
    const ids = await Promise.all([p.identityOf(a), p.identityOf(aAgent), p.identityOf(b), p.identityOf(bAgent)]);
    const mine = ids.slice(0, 2).filter((x) => x !== 0n);
    return ids.slice(2).some((x) => x !== 0n && mine.includes(x));
  }

  /// Checks the terms and returns the card every surface shows before money moves.
  async function draft(hirer: Address, input: WorkInput): Promise<{ ok: true; card: WorkCard; workerAgent: Agent; hirerAgent: Agent; terms: TimeTermsT; feeBps: number } | Refusal> {
    const cfg = await p.openingConfig();
    if (!cfg.open) return refuse('NOT_OPEN', 'Hourly work is paused for now.');
    const title = input.title.trim();
    const brief = input.brief.trim();
    if (!title || title.length > 80) return refuse('BAD_TERMS', 'Give the work a short title.');
    if (brief.length > 1_500) return refuse('BAD_TERMS', 'Say what the work is in up to 1,500 characters.');
    if (input.kind !== 'hourly' && input.kind !== 'monthly') return refuse('BAD_TERMS', 'Pay by the hour or monthly.');
    let rate: bigint;
    try {
      rate = parseUnits(input.rateUsdc, USDC);
    } catch {
      return refuse('BAD_TERMS', 'The rate must be an amount in USDC.');
    }
    if (rate <= 0n) return refuse('BAD_TERMS', 'The rate must be more than 0.');
    const hourly = input.kind === 'hourly';
    const maxHours = hourly ? input.maxHours ?? 0 : 1;
    if (hourly && (!Number.isInteger(maxHours) || maxHours < 1 || maxHours > 80)) return refuse('BAD_TERMS', 'Set the most hours a week, 1 to 80.');
    const most = hourly ? 52 : 12;
    if (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > most) {
      return refuse('BAD_TERMS', hourly ? 'Hire for 1 to 52 weeks.' : 'Hire for 1 to 12 months.');
    }
    const startsIn = input.startsInDays ?? 2;
    if (!Number.isInteger(startsIn) || startsIn < 1 || startsIn > 30) return refuse('BAD_TERMS', 'Start 1 to 30 days from today.');
    const worker = await p.resolveWorker(input.worker);
    if (!worker) return refuse('NO_WORKER', 'Nobody on Karwan has that tag.');
    if (same(worker, hirer)) return refuse('OWN_WORK', 'You cannot hire yourself.');
    const hirerAgent = await p.buyerAgentFor(hirer);
    if (!hirerAgent) return refuse('NO_BUYER_AGENT', 'Set up your agent first.');
    const workerAgent = await p.sellerAgentFor(worker);
    if (!workerAgent) return refuse('NO_SELLER_AGENT', 'They have not set up selling on Karwan yet, so they cannot be paid by the hour. Ask them to set it up.');
    if (await ownWallet(hirer, hirerAgent.address, worker, workerAgent.address)) return refuse('OWN_WORK', 'You cannot hire yourself.');
    const startsAt = Math.floor((p.now() + startsIn * DAY) / 1000) * 1000;
    const agreement = { kind: input.kind, title, brief, rate: rate.toString(), maxHours, periods: input.periods, startsAt, hirer, worker };
    const terms = buildTimeTerms({
      kind: input.kind, asset: p.asset, worker: workerAgent.address, rateMicros: rate, maxHours, periods: input.periods,
      startsAt: BigInt(startsAt / 1000), agreementHash: keccak256(toBytes(JSON.stringify(agreement))),
    });
    const w = weekCost(terms, cfg.feeBps);
    if (w.total > cfg.perDealCap) {
      const fit = (cfg.perDealCap * 2n * 10_000n) / (BigInt(20_000 + cfg.feeBps) * rate);
      return refuse('OVER_CAP', hourly
        ? `A week can hold up to ${usdcText(cfg.perDealCap)} USDC with the fee for now, so at this rate set at most ${fit} hours a week.`
        : `A month can hold up to ${usdcText(cfg.perDealCap)} USDC with the fee for now.`);
    }
    return {
      ok: true, terms, feeBps: cfg.feeBps, hirerAgent, workerAgent,
      card: {
        kind: input.kind, title, brief, worker, rateMicros: rate.toString(), maxHours, periods: input.periods, startsAt,
        budgetMicros: w.budget.toString(), feeHalfMicros: w.feeHalf.toString(), totalMicros: w.total.toString(),
        mostMicros: (w.total * BigInt(input.periods)).toString(),
        note: hourly ? 'You pay one week at a time. Hours not worked come back to you each week.' : 'You pay one month at a time.',
      },
    };
  }

  async function offer(hirer: Address, input: WorkInput, opts: { conversationId?: string; fromJob?: string; fromOffer?: string; workerAgreed?: boolean } = {}): Promise<{ ok: true; work: Engagement } | Refusal> {
    return locked(`offer:${lower(hirer)}`, 'Your offer is already on its way.', async () => {
      const d = await draft(hirer, input);
      if (!d.ok) return d;
      const total = BigInt(d.card.totalMicros);
      const balance = await p.balanceOf(d.hirerAgent.address);
      if (balance < total) return refuse('BUYER_AGENT_SHORT', `Add ${usdcText(total - balance)} USDC to pay for the first ${periodWord(input)}.`, { needMicros: (total - balance).toString() });
      const id = p.newId('w');
      const pass = await p.guard(hirer, total, `work:${id}`);
      if (!pass.ok) return refuse(pass.code, pass.message);
      const at = p.now();
      const salt = p.newSalt();
      const work: Engagement = {
        id, salt, kind: input.kind, hirer, hirerAgent: d.hirerAgent.address, worker: d.card.worker, workerAgent: d.workerAgent.address,
        title: d.card.title, brief: d.card.brief, rateMicros: d.card.rateMicros, maxHours: d.card.maxHours, periods: d.card.periods,
        startsAt: d.card.startsAt, feeBps: d.feeBps, termsHash: timeTermsHash(d.terms), terms: storeTerms(d.terms),
        status: 'offering', weeks: [], tx: {}, createdAt: at, updatedAt: at,
        ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
        ...(opts.fromJob ? { fromJob: opts.fromJob } : {}), ...(opts.fromOffer ? { fromOffer: opts.fromOffer } : {}),
      };
      await p.store.create(work);
      let live: Engagement;
      try {
        const r = await p.chain.offer(d.hirerAgent.walletId, { salt, terms: d.terms, feeBps: d.feeBps, employer: d.hirerAgent.address, total });
        const week0: EngagementWeek = { k: 0, fundedMicros: total.toString(), loggedMinutes: 0, approvedMinutes: 0, objectedMinutes: 0, log: [], status: 'funded' };
        live = (await p.store.patch(id, { status: 'offered', chainId: r.id, weeks: [week0], tx: { offer: r.txHash } }))!;
      } catch (err) {
        await p.store.patch(id, { status: 'failed' });
        return refuse('OFFER_FAILED', `The offer did not go out: ${(err as Error).message}`);
      }
      p.emit('work.offered', { workId: id, hirer, worker: live.worker, kind: live.kind });
      if (opts.workerAgreed) {
        // The worker already offered exactly these terms on the request.
        const a = await acceptAs(live, d.workerAgent);
        if (a.ok) {
          p.tellPerson(live.worker, `You're hired: ${live.title}. The first ${periodWord(live)} is paid in and starts ${new Date(live.startsAt).toUTCString().slice(0, 16)}.`, id);
          return a;
        }
      }
      p.tellPerson(live.worker, `${live.title}: you are offered ${usdcText(live.rateMicros)} USDC ${live.kind === 'hourly' ? `an hour, up to ${live.maxHours} hours a week, for ${live.periods} weeks` : `a month, for ${live.periods} months`}. The first ${periodWord(live)} is already paid in. Accept before it starts.`, id);
      return { ok: true, work: live };
    });
  }

  async function acceptAs(e: Engagement, agent: Agent): Promise<{ ok: true; work: Engagement } | Refusal> {
    if (!(await p.store.patchIfStatus(e.id, ['offered'], { status: 'offering' }))) return refuse('NOT_OFFERED', 'This offer is no longer waiting for an answer.');
    try {
      const tx = await p.chain.accept(agent.walletId, e.chainId!, e.termsHash);
      const live = (await p.store.patch(e.id, { status: 'active', tx: { ...e.tx, accept: tx } }))!;
      p.tellPerson(e.hirer, `${e.title}: they accepted. Work starts ${new Date(e.startsAt).toUTCString().slice(0, 16)}.`, e.id);
      p.emit('work.accepted', { workId: e.id, hirer: e.hirer, worker: e.worker });
      return { ok: true, work: live };
    } catch (err) {
      await p.store.patch(e.id, { status: 'offered' });
      return refuse('ACCEPT_FAILED', `It was not accepted: ${(err as Error).message}`);
    }
  }

  async function workFor(id: string, viewer: Address, side: 'hirer' | 'worker'): Promise<Engagement | Refusal> {
    const e = await p.store.get(id);
    if (!e) return refuse('NOT_FOUND', 'That work is not on Karwan.');
    if (!same(side === 'hirer' ? e.hirer : e.worker, viewer)) {
      return refuse('NOT_PARTY', side === 'hirer' ? 'Only the hirer can do that.' : 'Only the worker can do that.');
    }
    return e;
  }
  const isRefusal = (x: unknown): x is Refusal => typeof x === 'object' && x !== null && (x as Refusal).ok === false;

  async function accept(worker: Address, id: string) {
    const e = await workFor(id, worker, 'worker');
    if (isRefusal(e)) return e;
    if (e.status !== 'offered') return refuse('NOT_OFFERED', 'This offer is no longer waiting for an answer.');
    if (p.now() >= e.startsAt) return refuse('TOO_LATE', 'The start date has passed, so the hirer gets their money back. Ask them to offer again.');
    const agent = await p.sellerAgentFor(worker);
    if (!agent || !same(agent.address, e.workerAgent)) return refuse('NO_SELLER_AGENT', 'Your selling agent is not set up.');
    return locked(`accept:${id}`, 'Your answer is already on its way.', () => acceptAs(e, agent));
  }

  async function decline(worker: Address, id: string) {
    const e = await workFor(id, worker, 'worker');
    if (isRefusal(e)) return e;
    const live = await p.store.patchIfStatus(id, ['offered'], { status: 'declined' });
    if (!live) return refuse('NOT_OFFERED', 'This offer is no longer waiting for an answer.');
    p.tellPerson(e.hirer, `${e.title}: they said no. Your money comes back to you shortly.`, id);
    return { ok: true as const, work: live };
  }

  async function takeBack(e: Engagement): Promise<{ ok: true; work: Engagement } | Refusal> {
    const agent = await p.buyerAgentFor(e.hirer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    const from = e.status === 'declined' ? 'declined' : 'offered';
    if (!(await p.store.patchIfStatus(e.id, [from], { status: 'offering' }))) return refuse('NOT_OFFERED', 'This offer can no longer be taken back.');
    try {
      const r = await p.chain.cancel(agent.walletId, e.chainId!);
      const week = { ...e.weeks[0]!, status: 'settled' as const, backMicros: r.back.toString(), paidNetMicros: '0' };
      const live = (await p.store.patch(e.id, { status: 'cancelled', weeks: [week], tx: { ...e.tx, cancel: r.txHash } }))!;
      p.tellPerson(e.hirer, `${e.title}: ${usdcText(r.back)} USDC is back with you.`, e.id);
      return { ok: true, work: live };
    } catch (err) {
      await p.store.patch(e.id, { status: from });
      return refuse('CANCEL_FAILED', `The offer was not taken back: ${(err as Error).message}`);
    }
  }

  async function cancel(hirer: Address, id: string) {
    const e = await workFor(id, hirer, 'hirer');
    if (isRefusal(e)) return e;
    if (e.status !== 'offered' && e.status !== 'declined') return refuse('NOT_OFFERED', 'They already accepted. End it with notice instead.');
    return takeBack(e);
  }

  /// The week hours go to when none is named: the one running now. Once the
  /// work has run its course, the last week while its logging is still open.
  function currentWeek(e: Engagement): { w?: EngagementWeek; k: number } {
    const now = p.now();
    if (now < e.startsAt) return { k: -1 };
    const k = Math.floor((now - e.startsAt) / (e.terms.cycleSecs * 1000));
    if (k < runsOf(e)) return { w: e.weeks.find((x) => x.k === k), k };
    return { w: e.weeks.find((x) => x.k === runsOf(e) - 1), k: runsOf(e) - 1 };
  }

  async function logHours(worker: Address, id: string, i: { minutes: number; note?: string; k?: number }) {
    const e = await workFor(id, worker, 'worker');
    if (isRefusal(e)) return e;
    if (e.status !== 'active' && e.status !== 'ending') return refuse('NOT_ACTIVE', 'This work is not running.');
    const minutes = e.kind === 'hourly' ? i.minutes : 1;
    if (!Number.isInteger(minutes) || minutes < 1) return refuse('BAD_HOURS', 'Log at least one minute.');
    const note = (i.note ?? '').trim();
    if (note.length > 300) return refuse('BAD_HOURS', 'Keep the note under 300 characters.');
    const now = p.now();
    if (now < e.startsAt) return refuse('NOT_STARTED', `Work starts ${new Date(e.startsAt).toUTCString().slice(0, 16)}; log hours from then.`);
    const named = i.k === undefined ? currentWeek(e) : { w: e.weeks.find((x) => x.k === i.k), k: i.k };
    const w = named.w;
    if (!w) {
      if (named.k >= 0 && named.k < runsOf(e)) return refuse('NOT_FUNDED', `This ${periodWord(e)} is not paid in yet, so hours cannot be logged for it. The hirer has been told.`);
      return refuse('LOG_CLOSED', `Logging for that ${periodWord(e)} has closed.`);
    }
    const win = windowsOf(e, w.k);
    if (now < win.start) return refuse('NOT_STARTED', `That ${periodWord(e)} has not started yet.`);
    if (now >= win.logBy) return refuse('LOG_CLOSED', `Logging for that ${periodWord(e)} closed 2 days after it ended.`);
    if (w.status !== 'funded' && w.status !== 'logged') return refuse('LOG_CLOSED', `That ${periodWord(e)} is already being settled.`);
    const most = e.terms.maxUnits;
    const total = e.kind === 'hourly' ? w.loggedMinutes + minutes : 1;
    if (e.kind === 'monthly' && w.loggedMinutes > 0) return refuse('ALREADY_LOGGED', 'This month is already claimed.');
    if (total > most) return refuse('OVER_HOURS', `This week allows ${hoursText(most)}; ${hoursText(Math.max(0, most - w.loggedMinutes))} is left to log.`);
    const agent = await p.sellerAgentFor(worker);
    if (!agent || !same(agent.address, e.workerAgent)) return refuse('NO_SELLER_AGENT', 'Your selling agent is not set up.');
    return locked(`log:${id}`, 'Your hours are already on their way.', async () => {
      const log = [...w.log, { at: now, minutes: e.kind === 'hourly' ? minutes : 0, note }];
      const evidence = keccak256(toBytes(JSON.stringify(log)));
      try {
        const tx = await p.chain.submit(agent.walletId, { id: e.chainId!, k: w.k, units: total, evidence });
        const weeks = e.weeks.map((x) => (x.k === w.k ? { ...x, loggedMinutes: total, log, status: 'logged' as const } : x));
        const live = (await p.store.patch(id, { weeks, tx: { ...e.tx, [`log:${w.k}:${log.length}`]: tx } }))!;
        const label = e.kind === 'hourly' ? `${hoursText(total)} logged for week ${w.k + 1}` : `Month ${w.k + 1} claimed`;
        p.tellPerson(e.hirer, `${e.title}: ${label}. Approve it, or say which hours are wrong, by ${new Date(win.reviewBy).toUTCString().slice(0, 16)}. If you say nothing, it is paid then.`, id);
        return { ok: true as const, work: live };
      } catch (err) {
        return refuse('LOG_FAILED', `The hours were not logged: ${(err as Error).message}`);
      }
    });
  }

  async function approveHours(hirer: Address, id: string, k: number) {
    const e = await workFor(id, hirer, 'hirer');
    if (isRefusal(e)) return e;
    const w = e.weeks.find((x) => x.k === k);
    if (!w || w.status !== 'logged' || w.loggedMinutes <= w.approvedMinutes) return refuse('NOTHING_TO_APPROVE', 'There are no new hours to approve.');
    const agent = await p.buyerAgentFor(hirer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    return locked(`pay:${id}:${k}`, 'Those hours are already being paid.', async () => {
      const units = unitsOf(e, w.loggedMinutes);
      try {
        const r = await p.chain.approve(agent.walletId, { id: e.chainId!, k, units, worker: e.workerAgent });
        const paidNet = BigInt(w.paidNetMicros ?? '0') + r.paid;
        const weeks = e.weeks.map((x) => (x.k === k ? { ...x, approvedMinutes: w.loggedMinutes, paidNetMicros: paidNet.toString() } : x));
        const live = (await p.store.patch(id, { weeks, tx: { ...e.tx, [`approve:${k}:${units}`]: r.txHash } }))!;
        p.tellPerson(e.worker, `${e.title}: ${e.kind === 'hourly' ? hoursText(w.loggedMinutes) : `Month ${k + 1}`} approved, ${usdcText(r.paid)} USDC paid to you.`, id);
        return { ok: true as const, work: live, paidMicros: r.paid.toString() };
      } catch (err) {
        return refuse('APPROVE_FAILED', `The hours were not paid: ${(err as Error).message}`);
      }
    });
  }

  async function objectHours(hirer: Address, id: string, i: { k: number; minutes: number; reason: string }) {
    const e = await workFor(id, hirer, 'hirer');
    if (isRefusal(e)) return e;
    const w = e.weeks.find((x) => x.k === i.k);
    if (!w || w.status !== 'logged') return refuse('NOTHING_TO_OBJECT', 'There are no hours waiting for your review.');
    const reason = i.reason.trim();
    if (!reason || reason.length > 500) return refuse('BAD_REASON', 'Say why, in up to 500 characters.');
    const win = windowsOf(e, i.k);
    const now = p.now();
    if (now < win.logBy) return refuse('TOO_EARLY', `The worker can log until ${new Date(win.logBy).toUTCString().slice(0, 16)}; say which hours are wrong after that.`);
    if (now >= settleAt(e, w)) return refuse('TOO_LATE', 'The review time has ended and the hours are being paid.');
    const minutes = e.kind === 'hourly' ? i.minutes : 1;
    const open = w.loggedMinutes - w.approvedMinutes;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > open) return refuse('BAD_HOURS', `You can object to up to ${hoursText(open)}.`);
    const agent = await p.buyerAgentFor(hirer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    return locked(`pay:${id}:${i.k}`, 'Your answer is already on its way.', async () => {
      try {
        const units = unitsOf(e, minutes);
        const r = await p.chain.object(agent.walletId, { id: e.chainId!, k: i.k, units, clauseHash: keccak256(toBytes(reason)), worker: e.workerAgent });
        const paidNet = BigInt(w.paidNetMicros ?? '0') + r.paid;
        const weeks = e.weeks.map((x) => (x.k === i.k
          ? { ...x, status: 'objected' as const, objectedMinutes: minutes, approvedMinutes: w.loggedMinutes - minutes, paidNetMicros: paidNet.toString(), reason, objectedAt: now }
          : x));
        const live = (await p.store.patch(id, { weeks, tx: { ...e.tx, [`object:${i.k}`]: r.txHash } }))!;
        const rest = r.paid > 0n ? ` The other hours were paid, ${usdcText(r.paid)} USDC.` : '';
        p.tellPerson(e.worker, `${e.title}: the hirer says ${hoursText(minutes)} of week ${i.k + 1} are wrong: "${reason}".${rest} You have 72 hours to give your side; then Karwan's review team decides.`, id);
        p.tellPerson(e.hirer, `${e.title}: your objection is in. You have 72 hours to give your side; then Karwan's review team decides.`, id);
        p.emit('work.objected', { workId: id, k: i.k, minutes });
        return { ok: true as const, work: live };
      } catch (err) {
        return refuse('OBJECT_FAILED', `Your objection did not go in: ${(err as Error).message}`);
      }
    });
  }

  /// What the next week costs, or why it cannot be paid for yet.
  async function fundCheck(e: Engagement): Promise<{ ok: true; k: number; total: bigint; feeBps: number } | Refusal> {
    if (e.status !== 'active' && e.status !== 'ending') return refuse('NOT_ACTIVE', 'This work is not running.');
    const k = e.weeks.length;
    if (k >= runsOf(e)) return refuse('ALL_FUNDED', `Every ${periodWord(e)} is already paid for.`);
    const now = p.now();
    if (now >= windowsOf(e, k).end) return refuse('TOO_LATE', `That ${periodWord(e)} has already ended.`);
    const ahead = e.weeks.filter((w) => windowsOf(e, w.k).start > now).length;
    const limit = (await p.store.hasFinished(e.worker)) ? MOST_AHEAD : 1;
    if (ahead >= limit) {
      return refuse('AHEAD_LIMIT', limit === 1
        ? `Pay for one ${periodWord(e)} at a time until they have finished work on Karwan. You can pay for the next one once this one starts.`
        : `You can pay up to ${MOST_AHEAD} ${periodWord(e)}s ahead.`);
    }
    const cfg = await p.openingConfig();
    const total = weekCost(termsOf(e.terms), e.feeBps).total;
    const held = e.weeks.filter((w) => w.status !== 'settled').reduce((s, w) => s + BigInt(w.fundedMicros), 0n);
    if (held + total > cfg.perDealCap) return refuse('OVER_CAP', `This work can hold up to ${usdcText(cfg.perDealCap)} USDC at once for now. Pay for the next ${periodWord(e)} once one is settled.`);
    return { ok: true, k, total, feeBps: e.feeBps };
  }

  async function fundNext(hirer: Address, id: string) {
    const e = await workFor(id, hirer, 'hirer');
    if (isRefusal(e)) return e;
    const c = await fundCheck(e);
    if (!c.ok) return c;
    const agent = await p.buyerAgentFor(hirer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    const balance = await p.balanceOf(agent.address);
    if (balance < c.total) return refuse('BUYER_AGENT_SHORT', `Add ${usdcText(c.total - balance)} USDC to pay for the next ${periodWord(e)}.`, { needMicros: (c.total - balance).toString() });
    const pass = await p.guard(hirer, c.total, `work:${id}:${c.k}`);
    if (!pass.ok) return refuse(pass.code, pass.message);
    return locked(`fund:${id}`, 'That payment is already on its way.', async () => {
      try {
        const tx = await p.chain.fund(agent.walletId, { id: e.chainId!, k: c.k, terms: termsOf(e.terms), feeBps: e.feeBps, total: c.total });
        const week: EngagementWeek = { k: c.k, fundedMicros: c.total.toString(), loggedMinutes: 0, approvedMinutes: 0, objectedMinutes: 0, log: [], status: 'funded' };
        const live = (await p.store.patch(id, { weeks: [...e.weeks, week], tx: { ...e.tx, [`fund:${c.k}`]: tx } }))!;
        p.tellPerson(e.worker, `${e.title}: ${periodWord(e)} ${c.k + 1} is paid in.`, id);
        return { ok: true as const, work: live };
      } catch (err) {
        return refuse('FUND_FAILED', `The ${periodWord(e)} was not paid for: ${(err as Error).message}`);
      }
    });
  }

  async function giveNotice(party: Address, id: string) {
    const e = await p.store.get(id);
    if (!e) return refuse('NOT_FOUND', 'That work is not on Karwan.');
    const side = same(party, e.hirer) ? 'hirer' : same(party, e.worker) ? 'worker' : null;
    if (!side) return refuse('NOT_PARTY', 'Only the two people in this work can end it.');
    if (e.status !== 'active') return refuse('NOT_ACTIVE', e.status === 'ending' ? 'Notice has already been given.' : 'This work is not running.');
    const agent = side === 'hirer' ? await p.buyerAgentFor(party) : await p.sellerAgentFor(party);
    if (!agent) return refuse('NO_AGENT', 'Your agent is not set up.');
    return locked(`notice:${id}`, 'Your notice is already on its way.', async () => {
      try {
        const r = await p.chain.notice(agent.walletId, e.chainId!);
        const live = (await p.store.patch(id, { status: 'ending', noticeBy: side, runs: r.runs, tx: { ...e.tx, notice: r.txHash } }))!;
        const lastDay = new Date(windowsOf(e, Math.max(0, r.runs - 1)).end).toUTCString().slice(0, 16);
        const other = side === 'hirer' ? e.worker : e.hirer;
        p.tellPerson(other, `${e.title}: ${side === 'hirer' ? 'the hirer' : 'the worker'} gave notice. The work ends ${lastDay}.`, id);
        p.tellPerson(party, `${e.title}: your notice is in. The work ends ${lastDay}.`, id);
        return { ok: true as const, work: live };
      } catch (err) {
        return refuse('NOTICE_FAILED', `The notice did not go in: ${(err as Error).message}`);
      }
    });
  }

  function remindOnce(e: Engagement, w: EngagementWeek | null, key: string): string[] | null {
    const sent = (w ? w.reminded : e.reminded) ?? [];
    return sent.includes(key) ? null : [...sent, key];
  }

  /// One pass of the runner: settle what is due, take back offers nobody
  /// accepted, take objections to the review team, close what is finished,
  /// and send each reminder once. Returns what it did, for the log.
  async function runDue(): Promise<string[]> {
    const done: string[] = [];
    const now = p.now();
    for (const e0 of await p.store.listLive()) {
      let e = e0;
      try {
        if ((e.status === 'offered' && now >= e.startsAt) || e.status === 'declined') {
          const r = await takeBack(e);
          if (r.ok) done.push(`${e.id}:taken-back`);
          continue;
        }
        if (e.status !== 'active' && e.status !== 'ending') continue;
        for (const w of e.weeks) {
          if (w.status === 'settled') continue;
          const win = windowsOf(e, w.k);
          if (w.status === 'objected') {
            if (w.escalatedAt === undefined && now >= (w.objectedAt ?? now) + COOL_OFF_MS) {
              await p.chain.escalate({ id: e.chainId!, k: w.k });
              e = (await p.store.patch(e.id, { weeks: e.weeks.map((x) => (x.k === w.k ? { ...x, escalatedAt: now } : x)) }))!;
              done.push(`${e.id}:${w.k}:escalated`);
            } else if (w.escalatedAt !== undefined && now >= w.escalatedAt + RULING_MS) {
              const r = await p.chain.fallback({ id: e.chainId!, k: w.k, worker: e.workerAgent });
              e = await settled(e, w.k, r);
              done.push(`${e.id}:${w.k}:fallback`);
            }
            continue;
          }
          if (now >= settleAt(e, w)) {
            const r = await p.chain.settle({ id: e.chainId!, k: w.k, worker: e.workerAgent });
            e = await settled(e, w.k, r);
            done.push(`${e.id}:${w.k}:settled`);
            continue;
          }
          if (w.loggedMinutes === 0 && now >= win.logBy - DAY) {
            const r = remindOnce(e, w, 'log');
            if (r) {
              p.tellPerson(e.worker, `${e.title}: logging for ${periodWord(e)} ${w.k + 1} closes ${new Date(win.logBy).toUTCString().slice(0, 16)}. Log your hours before then.`, e.id);
              e = (await p.store.patch(e.id, { weeks: e.weeks.map((x) => (x.k === w.k ? { ...x, reminded: r } : x)) }))!;
            }
          }
          if (w.loggedMinutes > w.approvedMinutes && now >= win.logBy && now >= win.reviewBy - DAY) {
            const r = remindOnce(e, w, 'review');
            if (r) {
              p.tellPerson(e.hirer, `${e.title}: your review of ${periodWord(e)} ${w.k + 1} ends ${new Date(win.reviewBy).toUTCString().slice(0, 16)}. If you say nothing, the hours are paid then.`, e.id);
              e = (await p.store.patch(e.id, { weeks: e.weeks.map((x) => (x.k === w.k ? { ...x, reminded: r } : x)) }))!;
            }
          }
        }
        const k = e.weeks.length;
        if (k < runsOf(e)) {
          const next = windowsOf(e, k);
          if (now >= next.start - DAY && now < next.start) {
            const r = remindOnce(e, null, `fund:${k}`);
            if (r) {
              p.tellPerson(e.hirer, `${e.title}: ${periodWord(e)} ${k + 1} starts ${new Date(next.start).toUTCString().slice(0, 16)}. Pay for it so the work goes on.`, e.id);
              e = (await p.store.patch(e.id, { reminded: r }))!;
            }
          } else if (now >= next.start && now < next.end) {
            const r = remindOnce(e, null, `unfunded:${k}`);
            if (r) {
              p.tellPerson(e.hirer, `${e.title}: ${periodWord(e)} ${k + 1} has started but is not paid for, so no hours can be logged for it.`, e.id);
              p.tellPerson(e.worker, `${e.title}: ${periodWord(e)} ${k + 1} is not paid for yet, so hold off on work until it is. The hirer has been told.`, e.id);
              e = (await p.store.patch(e.id, { reminded: r }))!;
            }
          }
        }
        const allSettled = e.weeks.every((w) => w.status === 'settled');
        const nothingLeft = e.weeks.length >= runsOf(e) || now >= windowsOf(e, e.weeks.length).end;
        if (allSettled && nothingLeft) {
          const r = await p.chain.close(e.chainId!);
          await p.store.patch(e.id, { status: 'closed', tx: { ...e.tx, close: r.txHash } });
          const paid = e.weeks.reduce((s, w) => s + BigInt(w.paidNetMicros ?? '0'), 0n);
          p.tellPerson(e.worker, `${e.title} has ended. You were paid ${usdcText(paid)} USDC in all, and it is on your Karwan record.`, e.id);
          p.tellPerson(e.hirer, `${e.title} has ended, and it is on your Karwan record.`, e.id);
          p.emit('work.closed', { workId: e.id, hirer: e.hirer, worker: e.worker, paidMicros: paid.toString() });
          done.push(`${e.id}:closed`);
        }
      } catch (err) {
        done.push(`${e.id}:error:${(err as Error).message}`);
      }
    }
    return done;
  }

  async function settled(e: Engagement, k: number, r: { txHash: Hex; gross: bigint; back: bigint; paidNow: bigint }): Promise<Engagement> {
    const w = e.weeks.find((x) => x.k === k)!;
    const paidNet = BigInt(w.paidNetMicros ?? '0') + r.paidNow;
    const weeks = e.weeks.map((x) => (x.k === k ? { ...x, status: 'settled' as const, paidNetMicros: paidNet.toString(), backMicros: r.back.toString() } : x));
    const live = (await p.store.patch(e.id, { weeks, tx: { ...e.tx, [`settle:${k}`]: r.txHash } }))!;
    if (r.paidNow > 0n) p.tellPerson(e.worker, `${e.title}: ${periodWord(e)} ${k + 1} is settled, ${usdcText(r.paidNow)} USDC paid to you.`, e.id);
    p.tellPerson(e.hirer, `${e.title}: ${periodWord(e)} ${k + 1} is settled.${r.back > 0n ? ` ${usdcText(r.back)} USDC not used came back to you.` : ''}`, e.id);
    return live;
  }

  /// What each side sees, with the steps open to them now.
  async function view(id: string, viewer: Address) {
    const e = await p.store.get(id);
    if (!e) return null;
    const role = same(viewer, e.hirer) ? 'hirer' : same(viewer, e.worker) ? 'worker' : null;
    if (!role) return null;
    const now = p.now();
    const weeks = e.weeks.map((w) => {
      const win = windowsOf(e, w.k);
      return { ...w, ...win, settleAt: settleAt(e, w), canLog: role === 'worker' && (w.status === 'funded' || w.status === 'logged') && now >= win.start && now < win.logBy,
        canApprove: role === 'hirer' && w.status === 'logged' && w.loggedMinutes > w.approvedMinutes && now < settleAt(e, w),
        canObject: role === 'hirer' && w.status === 'logged' && w.loggedMinutes > w.approvedMinutes && now >= win.logBy && now < settleAt(e, w),
        ifPaid: preview(e, w.loggedMinutes) };
    });
    const fund = role === 'hirer' ? await fundCheck(e) : null;
    const nextWeek = fund?.ok ? { k: fund.k, totalMicros: fund.total.toString() } : null;
    const { salt: _salt, terms: _terms, ...rest } = e;
    const [hirerName, workerName] = p.nameOf ? await Promise.all([p.nameOf(e.hirer), p.nameOf(e.worker)]) : ['', ''];
    return {
      ...rest, role, hirerName, workerName, weeks, runs: runsOf(e), nextWeek, fundBlocked: fund && !fund.ok ? fund.message : null,
      weekTotalMicros: weekCost(termsOf(e.terms), e.feeBps).total.toString(),
      canAccept: role === 'worker' && e.status === 'offered' && now < e.startsAt,
      canTakeBack: role === 'hirer' && (e.status === 'offered' || e.status === 'declined'),
      canGiveNotice: e.status === 'active',
    };
  }

  async function mine(viewer: Address) {
    const all = await p.store.listFor(viewer);
    return all.map((e) => ({
      id: e.id, kind: e.kind, title: e.title, status: e.status, role: same(viewer, e.hirer) ? 'hirer' : 'worker',
      rateMicros: e.rateMicros, maxHours: e.maxHours, periods: e.periods, startsAt: e.startsAt, weeks: e.weeks.length, updatedAt: e.updatedAt,
    }));
  }

  /// What paying a week of `minutes` would come to, for the cards.
  function preview(e: Engagement, minutes: number) {
    const t = termsOf(e.terms);
    const total = weekCost(t, e.feeBps).total;
    const r = payFor(t, e.feeBps, unitsOf(e, minutes), total);
    return { netMicros: r.net.toString(), backMicros: r.back.toString(), feeMicros: r.fee.toString() };
  }

  return { draft, offer, accept, decline, cancel, logHours, approveHours, objectHours, fundNext, giveNotice, runDue, view, mine, preview, get: (id: string) => p.store.get(id) };
}

export type Engagements = ReturnType<typeof createEngagements>;
